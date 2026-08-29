import { randomUUID } from "crypto";
import { Router, type ErrorRequestHandler } from "express";
import multer from "multer";
import puppeteer from "puppeteer";
import * as XLSX from "xlsx";
import type {
  DeckState,
  InformeMonthlyDataset,
  InformePayload,
  InformeWeeklyDataset,
  ResolutionRow,
  SupportType,
  WeeklyComparison,
} from "../shared/informe.ts";
import {
  createDefaultDeck,
  emptyMonthlyDataset,
  emptyWeeklyDataset,
  INFORME_SUPPORT_TYPES,
} from "../shared/informe.ts";
import type {
  BuildingLocationImportReport,
  InformaticaDataset,
  InformaticaDeckState,
  InformaticaHistoricoRow,
  InformaticaPayload,
} from "../shared/modules/informatica/types.ts";
import {
  createDefaultInformaticaDeck,
  emptyInformaticaDataset,
  mergeInformaticaDeckTemplate,
} from "../shared/modules/informatica/deck.ts";
import {
  convertInformaticaTemplateWorkbook,
  convertRawImacsWorkbook,
  convertRawInformaticaCsv,
  convertRawPeticionesWorkbook,
  decodeInformaticaCsv,
  detectRawInformaticaFormat,
  hasFlatInformaticaSheet,
} from "./convertInformaticaRaw.js";
import type {
  AgaDataset,
  AgaDeckState,
  AgaPayload,
} from "../shared/modules/aga/types.ts";
import {
  createDefaultAgaDeck,
  emptyAgaDataset,
  mergeAgaDeckTemplate,
} from "../shared/modules/aga/deck.ts";
import type {
  OficinasDataset,
  OficinasDeckState,
  OficinasPayload,
} from "../shared/modules/oficinas/types.ts";
import {
  createDefaultOficinasDeck,
  emptyOficinasDataset,
  mergeOficinasDeckTemplate,
} from "../shared/modules/oficinas/deck.ts";
import { client } from "./db.js";
import {
  BuildingLocationResolver,
  buildingLookupKey,
  normalizeInformaticaBuildingLocations,
} from "./buildingLocationMaster.js";
import {
  mergeAgaDataset,
  mergeAgaWeeks,
  parseAgaWorkbook,
  type AgaImportReport,
} from "./parseAgaPlano.js";
import { mergeAgaAnnualSection, parseAgaTexto } from "./parseAgaTexto.js";
import {
  mergeAgaOfficeSection,
  parseAgaOfficeWorkbook,
} from "./parseAgaOffice.js";
import {
  mergeAgaManagedSection,
  parseAgaGestionadoWorkbook,
} from "./parseAgaGestionado.js";
import { AGA_BUILDING_LOCATIONS } from "./agaLocationMap.js";
import {
  mergeOficinasDataset,
  parseOficinasWorkbook,
  type OficinasImportReport,
} from "./parseOficinasPlano.js";
import {
  mergeInformaticaDataset,
  mergeInformaticaWorkbooks,
  parseInformaticaPlanoWorkbook,
  selectInformaticaWorkbooksForMerge,
  type InformaticaImportReport,
  type InformaticaUploadWorkbook,
} from "./parseInformaticaPlano.js";
import { parseInformaticaTexto } from "./parseInformaticaTexto.js";
import {
  mergeReportedResolutionHistory,
  parseInformeWeeklyWorkbook,
} from "./parseInformeWeekly.js";
import { parseInformePlanoWorkbook } from "./parseInformePlano.js";
import {
  mergeMonthlyDatasets,
  mergeWeeklyHistory,
  parseTendenciaWorkbook,
} from "./parseTendenciaMensual.js";
import { configuredCredentials } from "./auth.js";
import { createDeckPdfSender } from "./pdf-export.js";
import {
  MAX_INFORMATICA_FILE_SIZE_BYTES,
  MAX_WORKBOOK_SIZE_BYTES,
  exceedsInformaticaUploadLimit,
} from "./upload-limits.js";

type WeeklyHistory = Record<SupportType, WeeklyComparison[]>;
/** Resolution detail accumulated per support type and ISO week. */
type ResolutionHistory = Record<SupportType, Record<string, ResolutionRow[]>>;
interface StoredResolutionHistory {
  /** Resolution detail per ISO week-year: byYear["2026"][tipo][semana]. */
  byYear: Record<string, ResolutionHistory>;
  sourceFile: string | null;
  uploadedAt: string | null;
}

/** The reported year: the most recent one stored. */
function latestYear(byYear: Record<string, ResolutionHistory>): string | null {
  const years = Object.keys(byYear).sort();
  return years.length > 0 ? years[years.length - 1] : null;
}

function emptyResolutionHistory(): ResolutionHistory {
  return Object.fromEntries(
    INFORME_SUPPORT_TYPES.map((type) => [type, {} as Record<string, ResolutionRow[]>])
  ) as ResolutionHistory;
}

function emptyWeeklyHistory(): WeeklyHistory {
  return Object.fromEntries(
    INFORME_SUPPORT_TYPES.map((type) => [type, [] as WeeklyComparison[]])
  ) as WeeklyHistory;
}

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_WORKBOOK_SIZE_BYTES },
});
const informaticaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_INFORMATICA_FILE_SIZE_BYTES },
});

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);
const MAX_IMAGE_SIZE_BYTES = 4 * 1024 * 1024;

function hasSupportedImageSignature(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === "image/png") {
    return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }

  if (mimeType === "image/jpeg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  if (mimeType === "image/gif") {
    const signature = buffer.subarray(0, 6).toString("ascii");
    return signature === "GIF87a" || signature === "GIF89a";
  }

  if (mimeType === "image/webp") {
    return (
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }

  return false;
}

const imageUpload = multer({
  storage: multer.memoryStorage(),
  // Remote libSQL transports BLOB arguments as base64. Four megabytes keeps
  // the encoded statement comfortably below common HTTP request limits.
  limits: { fileSize: MAX_IMAGE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!SUPPORTED_IMAGE_TYPES.has(file.mimetype)) {
      cb(new Error("Formato de imagen no soportado. Usa PNG, JPG, GIF o WEBP."));
      return;
    }

    cb(null, true);
  },
});

async function readStoredInformeDeck(): Promise<DeckState | null> {
  const result = await client.execute("SELECT data, updated_at FROM informe_deck WHERE id = 1");

  if (result.rows.length === 0) {
    return null;
  }

  try {
    const deck = JSON.parse(result.rows[0].data as string) as DeckState;

    if (!deck || !Array.isArray(deck.pages)) {
      return null;
    }

    return {
      pages: deck.pages,
      updatedAt: deck.updatedAt ?? ((result.rows[0].updated_at as string) ?? null),
    };
  } catch {
    // Ignore malformed deck rows instead of breaking the API.
    return null;
  }
}

async function readStoredInformeWeekly(): Promise<InformeWeeklyDataset | null> {
  const result = await client.execute(
    "SELECT data, source_file, uploaded_at FROM informe_weekly WHERE id = 1"
  );

  if (result.rows.length === 0) {
    return null;
  }

  try {
    const dataset = JSON.parse(result.rows[0].data as string) as InformeWeeklyDataset;

    return {
      ...dataset,
      sourceFile: dataset.sourceFile ?? ((result.rows[0].source_file as string) ?? null),
      uploadedAt: dataset.uploadedAt ?? ((result.rows[0].uploaded_at as string) ?? null),
    };
  } catch {
    return null;
  }
}

async function readStoredInformeMonthly(): Promise<InformeMonthlyDataset | null> {
  const result = await client.execute(
    "SELECT data, source_file, uploaded_at FROM informe_monthly WHERE id = 1"
  );

  if (result.rows.length === 0) {
    return null;
  }

  try {
    const dataset = JSON.parse(result.rows[0].data as string) as InformeMonthlyDataset;

    return {
      ...dataset,
      sourceFile: dataset.sourceFile ?? ((result.rows[0].source_file as string) ?? null),
      uploadedAt: dataset.uploadedAt ?? ((result.rows[0].uploaded_at as string) ?? null),
    };
  } catch {
    return null;
  }
}

async function readStoredWeeklyHistory(): Promise<WeeklyHistory> {
  const result = await client.execute(
    "SELECT data FROM informe_weekly_history WHERE id = 1"
  );

  if (result.rows.length === 0) {
    return emptyWeeklyHistory();
  }

  try {
    const stored = JSON.parse(result.rows[0].data as string) as Partial<WeeklyHistory>;
    return mergeWeeklyHistory(emptyWeeklyHistory(), stored as WeeklyHistory);
  } catch {
    return emptyWeeklyHistory();
  }
}

async function readStoredResolutionHistory(): Promise<StoredResolutionHistory> {
  const empty: StoredResolutionHistory = { byYear: {}, sourceFile: null, uploadedAt: null };
  const result = await client.execute(
    "SELECT data FROM informe_resolution_history WHERE id = 1"
  );

  if (result.rows.length === 0) {
    return empty;
  }

  try {
    const stored = JSON.parse(result.rows[0].data as string) as Partial<StoredResolutionHistory> & {
      byType?: ResolutionHistory;
    };

    if (stored.byYear) {
      return {
        byYear: stored.byYear,
        sourceFile: stored.sourceFile ?? null,
        uploadedAt: stored.uploadedAt ?? null,
      };
    }

    // Rows written before the year dimension existed held a single map.
    const legacy = stored.byType ?? (stored as unknown as ResolutionHistory);
    const byType = Object.fromEntries(
      INFORME_SUPPORT_TYPES.map((type) => [type, legacy[type] ?? {}])
    ) as ResolutionHistory;

    return {
      byYear: { [String(new Date().getUTCFullYear())]: byType },
      sourceFile: stored.sourceFile ?? null,
      uploadedAt: stored.uploadedAt ?? null,
    };
  } catch {
    return empty;
  }
}

/** Attaches the stored history to the current weekly dataset. */
function withHistory(
  weekly: InformeWeeklyDataset,
  comparisons: WeeklyHistory,
  resolutions: StoredResolutionHistory
): InformeWeeklyDataset {
  const year = latestYear(resolutions.byYear);
  const currentResolutions = (year ? resolutions.byYear[year] : null) ?? emptyResolutionHistory();

  return {
    ...weekly,
    resolutionSource: {
      sourceFile: resolutions.sourceFile,
      uploadedAt: resolutions.uploadedAt,
    },
    byType: Object.fromEntries(
      INFORME_SUPPORT_TYPES.map((type) => [
        type,
        {
          ...weekly.byType[type],
          comparisons: comparisons[type] ?? [],
          resolutionsByWeek: currentResolutions[type] ?? {},
        },
      ])
    ) as InformeWeeklyDataset["byType"],
  };
}

async function buildInformePayload(): Promise<InformePayload> {
  const [deck, weekly, monthly, history, resolutions] = await Promise.all([
    readStoredInformeDeck(),
    readStoredInformeWeekly(),
    readStoredInformeMonthly(),
    readStoredWeeklyHistory(),
    readStoredResolutionHistory(),
  ]);

  return {
    deck: deck ?? createDefaultDeck(),
    weekly: withHistory(weekly ?? emptyWeeklyDataset(), history, resolutions),
    monthly: monthly ?? emptyMonthlyDataset(),
  };
}

router.get("/api/informe", async (_req, res) => {
  try {
    res.json(await buildInformePayload());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al obtener el informe";
    res.status(500).json({ error: message });
  }
});

router.put("/api/informe/deck", async (req, res) => {
  try {
    // Accept both { deck } and a bare deck payload.
    const body = req.body as { deck?: DeckState } & Partial<DeckState>;
    const deck = (body?.deck ?? body) as DeckState | undefined;

    if (!deck || !Array.isArray(deck.pages)) {
      return res.status(400).json({ error: "El deck enviado no es válido: falta la lista de páginas." });
    }

    const updatedAt = new Date().toISOString();
    const storedDeck: DeckState = { pages: deck.pages, updatedAt };

    await client.execute({
      sql: `INSERT INTO informe_deck (id, data, updated_at) VALUES (1, ?, datetime('now'))
            ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      args: [JSON.stringify(storedDeck)],
    });

    res.json({ success: true, deck: storedDeck });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al guardar el deck del informe";
    res.status(500).json({ error: message });
  }
});

router.post("/api/informe/upload/semanal", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Debes adjuntar el libro semanal del Informe." });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const dataset = parseInformeWeeklyWorkbook(workbook);
    const stored: InformeWeeklyDataset = {
      ...dataset,
      sourceFile: req.file.originalname,
      uploadedAt: new Date().toISOString(),
    };

    // The detail sheets carry a single week and their names are truncated by
    // Excel, so the reported week is taken from the matrices of that same type.
    const storedResolutions = await readStoredResolutionHistory();
    const currentYear =
      latestYear(storedResolutions.byYear) ?? String(new Date().getUTCFullYear());
    const resolutionHistory =
      storedResolutions.byYear[currentYear] ?? emptyResolutionHistory();
    const mergedResolutionHistory = mergeReportedResolutionHistory(
      resolutionHistory,
      dataset
    );

    await client.batch(
      [
        {
          sql: `INSERT INTO informe_weekly (id, data, source_file, uploaded_at)
                VALUES (1, ?, ?, datetime('now'))
                ON CONFLICT(id) DO UPDATE
                SET data = excluded.data,
                    source_file = excluded.source_file,
                    uploaded_at = excluded.uploaded_at`,
          args: [JSON.stringify(stored), stored.sourceFile],
        },
        {
          sql: `INSERT INTO informe_resolution_history (id, data, uploaded_at)
                VALUES (1, ?, datetime('now'))
                ON CONFLICT(id) DO UPDATE
                SET data = excluded.data, uploaded_at = excluded.uploaded_at`,
          args: [
            JSON.stringify({
              byYear: { ...storedResolutions.byYear, [currentYear]: mergedResolutionHistory },
              sourceFile: storedResolutions.sourceFile,
              uploadedAt: storedResolutions.uploadedAt,
            }),
          ],
        },
      ],
      "write"
    );

    res.json(await buildInformePayload());
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error al procesar el libro semanal del Informe";
    res.status(500).json({ error: message });
  }
});

router.post("/api/informe/upload/plano", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Debes adjuntar el fichero plano de tendencias." });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const parsed = parseInformePlanoWorkbook(workbook);
    const previous = await readStoredResolutionHistory();

    // A year present in the file replaces its own types; other years survive.
    const merged: Record<string, ResolutionHistory> = { ...previous.byYear };

    for (const [year, incoming] of Object.entries(parsed.byYear)) {
      const base = merged[year] ?? emptyResolutionHistory();

      merged[year] = Object.fromEntries(
        INFORME_SUPPORT_TYPES.map((type) => [
          type,
          Object.keys(incoming[type]).length > 0 ? incoming[type] : base[type],
        ])
      ) as ResolutionHistory;
    }

    await client.execute({
      sql: `INSERT INTO informe_resolution_history (id, data, uploaded_at)
            VALUES (1, ?, datetime('now'))
            ON CONFLICT(id) DO UPDATE
            SET data = excluded.data, uploaded_at = excluded.uploaded_at`,
      args: [
        JSON.stringify({
          byYear: merged,
          sourceFile: req.file.originalname,
          uploadedAt: new Date().toISOString(),
        }),
      ],
    });

    res.json(await buildInformePayload());
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error al procesar el fichero plano de tendencias";
    res.status(500).json({ error: message });
  }
});

router.post("/api/informe/upload/tendencia", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Debes adjuntar el libro de tendencias." });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const parsed = parseTendenciaWorkbook(workbook);
    const uploadedAt = new Date().toISOString();

    const previousMonthly = (await readStoredInformeMonthly()) ?? emptyMonthlyDataset();
    const monthly = mergeMonthlyDatasets(previousMonthly, {
      ...parsed.monthly,
      sourceFile: req.file.originalname,
      uploadedAt,
    });

    const history = mergeWeeklyHistory(await readStoredWeeklyHistory(), parsed.weeklyHistory);

    await client.batch(
      [
        {
          sql: `INSERT INTO informe_monthly (id, data, source_file, uploaded_at)
                VALUES (1, ?, ?, datetime('now'))
                ON CONFLICT(id) DO UPDATE
                SET data = excluded.data,
                    source_file = excluded.source_file,
                    uploaded_at = excluded.uploaded_at`,
          args: [JSON.stringify(monthly), monthly.sourceFile],
        },
        {
          sql: `INSERT INTO informe_weekly_history (id, data, source_file, uploaded_at)
                VALUES (1, ?, ?, datetime('now'))
                ON CONFLICT(id) DO UPDATE
                SET data = excluded.data,
                    source_file = excluded.source_file,
                    uploaded_at = excluded.uploaded_at`,
          args: [JSON.stringify(history), req.file.originalname],
        },
      ],
      "write"
    );

    res.json(await buildInformePayload());
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error al procesar el libro de tendencias";
    res.status(500).json({ error: message });
  }
});

router.post("/api/informe/reset-deck", async (_req, res) => {
  try {
    await client.execute("DELETE FROM informe_deck WHERE id = 1");

    res.json({ success: true, deck: createDefaultDeck() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al restaurar el deck del informe";
    res.status(500).json({ error: message });
  }
});

/* -------------------------------------------------------------------------- */
/* Informatica                                                                 */
/* -------------------------------------------------------------------------- */

/** Response of the Informatica endpoints, as declared by `InformaticaPayload`. */
type InformaticaResponse = InformaticaPayload;

async function readStoredInformaticaDeck(): Promise<InformaticaDeckState | null> {
  const result = await client.execute(
    "SELECT data, updated_at FROM informatica_deck WHERE id = 1"
  );

  if (result.rows.length === 0) {
    return null;
  }

  try {
    const deck = JSON.parse(result.rows[0].data as string) as InformaticaDeckState;

    if (!deck || !Array.isArray(deck.pages)) {
      return null;
    }

    // The stored deck is reconciled with the specs on every read, never on
    // write: a page added to `INFORMATICA_PAGE_SPECS` after the user saved the
    // deck would otherwise stay invisible until a manual reset.
    return mergeInformaticaDeckTemplate({
      pages: deck.pages,
      updatedAt: deck.updatedAt ?? ((result.rows[0].updated_at as string) ?? null),
    });
  } catch {
    // Ignore malformed deck rows instead of breaking the API.
    return null;
  }
}

async function readStoredInformaticaDataset(): Promise<InformaticaDataset | null> {
  const result = await client.execute(
    "SELECT data, source_file, uploaded_at FROM informatica_dataset WHERE id = 1"
  );

  if (result.rows.length === 0) {
    return null;
  }

  try {
    const dataset = JSON.parse(result.rows[0].data as string) as InformaticaDataset;

    return {
      ...dataset,
      source: {
        sourceFile: dataset.source?.sourceFile ?? ((result.rows[0].source_file as string) ?? null),
        uploadedAt: dataset.source?.uploadedAt ?? ((result.rows[0].uploaded_at as string) ?? null),
      },
    };
  } catch {
    return null;
  }
}

async function readBuildingLocationMaster(): Promise<BuildingLocationResolver> {
  const [master, aliases] = await Promise.all([
    client.execute(
      "SELECT source_building, location FROM building_location_master ORDER BY source_building"
    ),
    client.execute(
      "SELECT source_alias, location FROM building_location_alias ORDER BY source_alias"
    ),
  ]);

  return new BuildingLocationResolver(
    master.rows.map((row) => ({
      building: String(row.source_building ?? ""),
      location: String(row.location ?? ""),
    })),
    aliases.rows.map((row) => ({
      alias: String(row.source_alias ?? ""),
      location: String(row.location ?? ""),
    }))
  );
}

/**
 * Frozen monthly series, read from their own table.
 *
 * Never merged into `informatica_dataset` on the way in: an upload with
 * complete scope replaces that row wholesale, so history stored there would
 * survive exactly until the next weekly import.
 */
async function readInformaticaHistorico(): Promise<InformaticaHistoricoRow[]> {
  const result = await client.execute(
    "SELECT serie, mes, total FROM informatica_historico ORDER BY serie, mes"
  );

  return result.rows.map((row) => ({
    serie: String(row.serie ?? ""),
    mes: String(row.mes ?? ""),
    total: Number(row.total ?? 0),
  }));
}

async function buildInformaticaPayload(): Promise<InformaticaResponse> {
  const [deck, dataset, buildings, historico] = await Promise.all([
    readStoredInformaticaDeck(),
    readStoredInformaticaDataset(),
    readBuildingLocationMaster(),
    readInformaticaHistorico(),
  ]);

  const data = dataset
    ? normalizeInformaticaBuildingLocations(dataset, buildings).dataset
    : emptyInformaticaDataset();

  return {
    deck: deck ?? createDefaultInformaticaDeck(),
    // An empty table stays absent rather than becoming an empty array, so a page
    // asking "is this section present" gets the same answer as before it existed.
    data: historico.length === 0 ? data : { ...data, historico },
  };
}

router.get("/api/informatica", async (_req, res) => {
  try {
    res.json(await buildInformaticaPayload());
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error al obtener el informe de Informática";
    res.status(500).json({ error: message });
  }
});

router.put("/api/informatica/deck", async (req, res) => {
  try {
    // Accept both { deck } and a bare deck payload.
    const body = req.body as { deck?: InformaticaDeckState } & Partial<InformaticaDeckState>;
    const deck = (body?.deck ?? body) as InformaticaDeckState | undefined;

    if (!deck || !Array.isArray(deck.pages)) {
      return res
        .status(400)
        .json({ error: "El deck enviado no es válido: falta la lista de páginas." });
    }

    const updatedAt = new Date().toISOString();
    const storedDeck: InformaticaDeckState = { pages: deck.pages, updatedAt };

    await client.execute({
      sql: `INSERT INTO informatica_deck (id, data, updated_at) VALUES (1, ?, datetime('now'))
            ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      args: [JSON.stringify(storedDeck)],
    });

    res.json({ success: true, deck: storedDeck });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error al guardar el deck de Informática";
    res.status(500).json({ error: message });
  }
});

/** Upper bound of the additive import: enough for one file per building. */
const MAX_INFORMATICA_PLANO_FILES = 10;

/**
 * `files` is the current field, repeated once per workbook. `file` is the
 * legacy single-file field, accepted so an older client keeps working while a
 * deployment is half rolled out.
 */
const uploadInformaticaPlano = informaticaUpload.fields([
  { name: "files", maxCount: MAX_INFORMATICA_PLANO_FILES },
  { name: "file", maxCount: MAX_INFORMATICA_PLANO_FILES },
]);

/**
 * Whether the bytes are a workbook container at all.
 *
 * `XLSX.read` happily parses anything as delimited text, so a `.txt` renamed
 * `.xlsx` would import as a one-sheet workbook with no known sheet and no data
 * instead of failing. The signature is checked first: `PK` for the zip formats
 * (xlsx, xlsm, xlsb, ods) and the OLE magic for the legacy xls.
 *
 * A file that fails this check is not rejected outright any more: the raw CSV
 * exports of Informatica are plain text and are handled further down.
 */
function looksLikeWorkbook(buffer: Buffer): boolean {
  if (buffer.length < 8) {
    return false;
  }

  const zip = buffer[0] === 0x50 && buffer[1] === 0x4b;
  const ole = buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));

  return zip || ole;
}

/**
 * Reads one uploaded file into a flat Informatica workbook.
 *
 * The colleagues do not fill in the flat template: they forward the exports
 * their tools already produce. So the upload accepts both, and the raw ones are
 * converted here, before the additive merge, which keeps the merge, the parser
 * and the storage below completely unaware of the raw formats.
 *
 * Throws with a short reason when the file is neither a flat book nor a known
 * raw export; the caller turns that into a 400 naming the file.
 */
function readInformaticaUpload(
  buffer: Buffer,
  buildings: BuildingLocationResolver
): InformaticaUploadWorkbook {
  if (looksLikeWorkbook(buffer)) {
    const workbook = XLSX.read(buffer, { type: "buffer" });

    if (!workbook || !Array.isArray(workbook.SheetNames) || workbook.SheetNames.length === 0) {
      throw new Error("no contiene ninguna hoja");
    }

    const format = detectRawInformaticaFormat(workbook);

    if (format === "peticiones") {
      return { workbook: convertRawPeticionesWorkbook(workbook), origin: "other" };
    }

    if (format === "imacs") {
      return { workbook: convertRawImacsWorkbook(workbook), origin: "other" };
    }

    // The weekly template is checked before the flat schema on purpose: it is
    // raw data in thirteen tabs and none of its names is a flat sheet, so a
    // flat book can never be mistaken for it.
    if (format === "template") {
      return {
        workbook: convertInformaticaTemplateWorkbook(workbook, buildings),
        origin: "template",
      };
    }

    if (!hasFlatInformaticaSheet(workbook)) {
      throw new Error(
        "es un libro de Excel pero no trae ninguna hoja del esquema plano ni la cabecera de un export conocido"
      );
    }

    return { workbook, origin: "other" };
  }

  const text = decodeInformaticaCsv(buffer);
  const format = detectRawInformaticaFormat(text);

  if (format === "citas" || format === "workorders") {
    return {
      workbook: convertRawInformaticaCsv(text, format, buildings),
      origin: format,
    };
  }

  throw new Error("no es un libro de Excel ni un CSV con la cabecera de un export conocido");
}

/** How the merged upload is labelled in the dataset source. */
function describeSourceFiles(names: string[]): string {
  return names.length === 1 ? names[0] : `${names.length} ficheros: ${names.join(", ")}`;
}

router.post("/api/informatica/upload/plano", uploadInformaticaPlano, async (req, res) => {
  try {
    const grouped = (req.files ?? {}) as Record<string, Express.Multer.File[] | undefined>;
    const uploaded = [...(grouped.files ?? []), ...(grouped.file ?? [])];

    if (uploaded.length === 0) {
      return res
        .status(400)
        .json({ error: "Debes adjuntar al menos un libro plano de Informática." });
    }

    if (exceedsInformaticaUploadLimit(uploaded)) {
      return res.status(413).json({
        error: "La carga conjunta de Informática supera el límite de 40 MB.",
      });
    }

    const workbooks: InformaticaUploadWorkbook[] = [];
    const buildings = await readBuildingLocationMaster();

    // Every file is validated before anything is stored, and the answer names
    // the offending file instead of failing the whole upload anonymously.
    //
    // Three shapes are accepted here and all three leave this loop as a flat
    // workbook, so everything below stays untouched: the flat book itself, the
    // request exports (xlsx) and the appointment and work-order exports (csv).
    // The raw formats are converted to their flat sheets before merging, which
    // is also where person names are dropped: only aggregates go downstream.
    for (const file of uploaded) {
      try {
        workbooks.push(readInformaticaUpload(file.buffer, buildings));
      } catch (err) {
        const detail = err instanceof Error ? err.message : "error desconocido";

        return res.status(400).json({
          error: `No se pudo leer "${file.originalname}" como fichero de Informática: ${detail}.`,
        });
      }
    }

    const files = uploaded.map((file) => file.originalname);
    // Several files are folded into one workbook before parsing, so rows of the
    // same sheet coming from different files add up instead of overwriting.
    const parsed = parseInformaticaPlanoWorkbook(
      mergeInformaticaWorkbooks(selectInformaticaWorkbooksForMerge(workbooks))
    );
    const normalized = normalizeInformaticaBuildingLocations(parsed.dataset, buildings);
    const dataset = normalized.dataset;
    const report = parsed.report;

    // The upload is folded into what is already stored instead of replacing it.
    // The real weekly flow sends the template plus the three request exports,
    // and each of those files only covers a couple of sections and the last few
    // months; replacing the dataset sent every other page back to
    // "Próximamente" every week. See `mergeInformaticaDataset` for the rule.
    const existing = await readStoredInformaticaDataset();
    const normalizedExisting = existing
      ? normalizeInformaticaBuildingLocations(existing, buildings).dataset
      : null;
    const stored: InformaticaDataset = mergeInformaticaDataset(normalizedExisting, dataset, {
      sourceFile: describeSourceFiles(files),
      uploadedAt: new Date().toISOString(),
    });

    await client.batch(
      [
        ...buildings.learnedAliases().map((row) => ({
          sql: `INSERT INTO building_location_alias
                (normalized_alias, source_alias, location, observed_at)
                VALUES (?, ?, ?, datetime('now'))
                ON CONFLICT(normalized_alias, location) DO UPDATE
                SET source_alias = excluded.source_alias,
                    observed_at = excluded.observed_at`,
          args: [buildingLookupKey(row.alias), row.alias, row.location],
        })),
        {
          sql: `INSERT INTO informatica_dataset (id, data, source_file, uploaded_at)
                VALUES (1, ?, ?, datetime('now'))
                ON CONFLICT(id) DO UPDATE
                SET data = excluded.data,
                    source_file = excluded.source_file,
                    uploaded_at = excluded.uploaded_at`,
          args: [JSON.stringify(stored), stored.source.sourceFile],
        },
      ],
      "write"
    );

    // The upload answers with the full payload so the client rehydrates
    // without a second fetch, plus what the import actually read.
    const payload = await buildInformaticaPayload();

    res.json({
      ...payload,
      report: { ...report, files, buildingLocations: normalized.report },
    } satisfies InformaticaResponse & {
      report: InformaticaImportReport & {
        buildingLocations: BuildingLocationImportReport;
      };
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error al procesar el libro plano de Informática";
    res.status(500).json({ error: message });
  }
});

/**
 * Text produced by the Drive spreadsheet (see `scripts/informatica-drive/`).
 *
 * Accepts a `.txt` upload (`file`) or a pasted body (`{ texto }`), because the
 * colleague either copies the `PLANO` tab or saves it as a file. The payload is
 * folded into what is stored, exactly like the flat workbook upload: the text
 * carries the whole monthly history, so re-sending it is idempotent.
 */
router.post("/api/informatica/upload/texto", upload.single("file"), async (req, res) => {
  try {
    const body = req.body as { texto?: unknown } | undefined;
    const pasted = typeof body?.texto === "string" ? body.texto : "";
    const uploaded = req.file ? req.file.buffer.toString("utf8") : "";
    const texto = uploaded || pasted;

    if (texto.trim() === "") {
      return res
        .status(400)
        .json({ error: "Debes adjuntar o pegar el texto plano de la hoja de Drive." });
    }

    const { dataset, meta } = parseInformaticaTexto(texto);
    const buildings = await readBuildingLocationMaster();
    const normalized = normalizeInformaticaBuildingLocations(dataset, buildings).dataset;
    const existing = await readStoredInformaticaDataset();
    const normalizedExisting = existing
      ? normalizeInformaticaBuildingLocations(existing, buildings).dataset
      : null;
    const source = {
      sourceFile: req.file?.originalname ?? meta.source ?? "PLANO (Drive)",
      uploadedAt: new Date().toISOString(),
      asOfDate: meta.asOfDate ?? meta.week ?? null,
    };
    // Drive serializes one auditable complete snapshot. Reusing omitted sections
    // from an older import would make optional data (notably WASP) look current.
    const stored =
      meta.scope === "completo"
        ? { ...normalized, source }
        : mergeInformaticaDataset(normalizedExisting, normalized, source);

    await client.execute({
      sql: `INSERT INTO informatica_dataset (id, data, source_file, uploaded_at)
            VALUES (1, ?, ?, datetime('now'))
            ON CONFLICT(id) DO UPDATE
            SET data = excluded.data,
                source_file = excluded.source_file,
                uploaded_at = excluded.uploaded_at`,
      args: [JSON.stringify(stored), stored.source.sourceFile],
    });

    return res.json(await buildInformaticaPayload());
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error al procesar el texto plano de Informática";

    return res.status(400).json({ error: message });
  }
});

router.post("/api/informatica/reset-deck", async (_req, res) => {
  try {
    await client.execute("DELETE FROM informatica_deck WHERE id = 1");

    res.json({ success: true, deck: createDefaultInformaticaDeck() });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error al restaurar el deck de Informática";
    res.status(500).json({ error: message });
  }
});

/* -------------------------------------------------------------------------- */
/* AGA                                                                         */
/* -------------------------------------------------------------------------- */

/** Response of the AGA endpoints, as declared by `AgaPayload`. */
type AgaResponse = AgaPayload;

async function readStoredAgaDeck(): Promise<AgaDeckState | null> {
  const result = await client.execute("SELECT data, updated_at FROM aga_deck WHERE id = 1");

  if (result.rows.length === 0) {
    return null;
  }

  try {
    const deck = JSON.parse(result.rows[0].data as string) as AgaDeckState;

    if (!deck || !Array.isArray(deck.pages)) {
      return null;
    }

    // A deck stored before a template page existed would never show it again,
    // since the deck is persisted whole. Reconciling on read adds only what is
    // missing, instead of forcing a reset that drops the user's texts.
    return mergeAgaDeckTemplate({
      pages: deck.pages,
      updatedAt: deck.updatedAt ?? ((result.rows[0].updated_at as string) ?? null),
    });
  } catch {
    // Ignore malformed deck rows instead of breaking the API.
    return null;
  }
}

async function readStoredAgaDataset(): Promise<AgaDataset | null> {
  const result = await client.execute(
    "SELECT data, source_file, uploaded_at FROM aga_dataset WHERE id = 1"
  );

  if (result.rows.length === 0) {
    return null;
  }

  try {
    const dataset = JSON.parse(result.rows[0].data as string) as AgaDataset;

    return {
      ...dataset,
      weeks: Array.isArray(dataset.weeks) ? dataset.weeks : [],
      source: {
        sourceFile: dataset.source?.sourceFile ?? ((result.rows[0].source_file as string) ?? null),
        uploadedAt: dataset.source?.uploadedAt ?? ((result.rows[0].uploaded_at as string) ?? null),
      },
    };
  } catch {
    return null;
  }
}

async function buildAgaPayload(): Promise<AgaResponse> {
  const [deck, dataset] = await Promise.all([readStoredAgaDeck(), readStoredAgaDataset()]);

  return { deck: deck ?? createDefaultAgaDeck(), data: dataset ?? emptyAgaDataset() };
}

router.get("/api/aga", async (_req, res) => {
  try {
    res.json(await buildAgaPayload());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al obtener el informe de AGA";
    res.status(500).json({ error: message });
  }
});

router.put("/api/aga/deck", async (req, res) => {
  try {
    // Accept both { deck } and a bare deck payload.
    const body = req.body as { deck?: AgaDeckState } & Partial<AgaDeckState>;
    const deck = (body?.deck ?? body) as AgaDeckState | undefined;

    if (!deck || !Array.isArray(deck.pages)) {
      return res
        .status(400)
        .json({ error: "El deck enviado no es válido: falta la lista de páginas." });
    }

    const updatedAt = new Date().toISOString();
    const storedDeck: AgaDeckState = { pages: deck.pages, updatedAt };

    await client.execute({
      sql: `INSERT INTO aga_deck (id, data, updated_at) VALUES (1, ?, datetime('now'))
            ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      args: [JSON.stringify(storedDeck)],
    });

    res.json({ success: true, deck: storedDeck });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al guardar el deck de AGA";
    res.status(500).json({ error: message });
  }
});

router.post("/api/aga/upload/plano", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Debes adjuntar el excel GPS semanal." });
    }

    if (!looksLikeWorkbook(req.file.buffer)) {
      return res.status(400).json({
        error: `No se pudo leer "${req.file.originalname}": no es un libro de Excel.`,
      });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const { weeks, report } = parseAgaWorkbook(workbook);

    // Unlike Informática, the upload does NOT replace the dataset: the GPS only
    // carries two weeks and the evolution charts need around ten, so every
    // upload folds its weeks into the stored history. A week already present is
    // replaced, which is what re-uploading a corrected export must do.
    const existing = await readStoredAgaDataset();

    // Sections 2 and 3 are seeded from other exports and must survive the
    // upload untouched, so the dataset is folded rather than rebuilt.
    const stored: AgaDataset = mergeAgaDataset(
      existing,
      weeks,
      {
        sourceFile: req.file.originalname,
        uploadedAt: new Date().toISOString(),
      },
      report.sheetsFound
    );

    await client.execute({
      sql: `INSERT INTO aga_dataset (id, data, source_file, uploaded_at)
            VALUES (1, ?, ?, datetime('now'))
            ON CONFLICT(id) DO UPDATE
            SET data = excluded.data,
                source_file = excluded.source_file,
                uploaded_at = excluded.uploaded_at`,
      args: [JSON.stringify(stored), stored.source.sourceFile],
    });

    // The upload answers with the full payload so the client rehydrates without
    // a second fetch, plus what the import actually read.
    const payload = await buildAgaPayload();

    res.json({
      ...payload,
      report: { ...report, file: req.file.originalname },
    } satisfies AgaResponse & { report: AgaImportReport });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al procesar el excel GPS de AGA";
    res.status(400).json({ error: message });
  }
});

router.post("/api/aga/upload/office", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Debes adjuntar el export de licencias Office." });
    }

    if (!looksLikeWorkbook(req.file.buffer)) {
      return res.status(400).json({
        error: `No se pudo leer "${req.file.originalname}": no es un libro de Excel.`,
      });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const parsed = parseAgaOfficeWorkbook(workbook);

    if (parsed.report.unknownProducts.length > 0 || parsed.report.unknownDates.length > 0) {
      const products = parsed.report.unknownProducts.map((entry) => entry.value).join(", ");
      const dates = parsed.report.unknownDates.map((entry) => entry.value).join(", ");
      const details = [
        products ? `productos sin clasificar: ${products}` : "",
        dates ? `fechas no reconocidas: ${dates}` : "",
      ]
        .filter(Boolean)
        .join("; ");

      return res.status(400).json({
        error: `El export Office contiene ${details}. No se ha guardado para evitar perder posiciones.`,
        report: parsed.report,
      });
    }

    const existing = (await readStoredAgaDataset()) ?? emptyAgaDataset();
    const stamp = {
      sourceFile: req.file.originalname,
      uploadedAt: new Date().toISOString(),
    };
    const stored: AgaDataset = {
      ...existing,
      office: mergeAgaOfficeSection(existing.office, { ...parsed.office, source: stamp }),
    };

    await client.execute({
      sql: `INSERT INTO aga_dataset (id, data, source_file, uploaded_at)
            VALUES (1, ?, ?, datetime('now'))
            ON CONFLICT(id) DO UPDATE
            SET data = excluded.data,
                source_file = excluded.source_file,
                uploaded_at = excluded.uploaded_at`,
      args: [JSON.stringify(stored), stored.source.sourceFile],
    });

    res.json({
      ...(await buildAgaPayload()),
      report: { ...parsed.report, file: req.file.originalname },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al procesar el export Office";
    res.status(400).json({ error: message });
  }
});

function agaManagedLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

const AGA_MANAGED_DEPARTMENTS = new Set(
  [
    "Administración de Red Local",
    "GSAM",
    "GAM",
    "Almacén",
    "Portatiles Plataforma",
    "BBVA_SPAIN_SD_JAMF",
  ].map(agaManagedLabel)
);

router.post("/api/aga/upload/gestionado", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Debes adjuntar el export Gestionado de ZPT025." });
    }

    if (!looksLikeWorkbook(req.file.buffer)) {
      return res.status(400).json({
        error: `No se pudo leer "${req.file.originalname}": no es un libro de Excel.`,
      });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const buildings = await readBuildingLocationMaster();
    const parsed = parseAgaGestionadoWorkbook(
      workbook,
      buildings.masterRows > 0 ? buildings : AGA_BUILDING_LOCATIONS
    );

    if (parsed.managed.weeklyTotals.length === 0) {
      return res.status(400).json({
        error: "El export Gestionado no contiene posiciones con una fecha reconocible.",
        report: parsed.report,
      });
    }

    const existing = (await readStoredAgaDataset()) ?? emptyAgaDataset();
    const selected = {
      ...parsed.managed,
      // These are the six departments selected by the published deck. The raw
      // export also carries technical-support departments that section 2.2 has
      // never charted.
      byDepartment: parsed.managed.byDepartment.filter((row) =>
        AGA_MANAGED_DEPARTMENTS.has(agaManagedLabel(row.label))
      ),
      // Products are stored whole, all sixty-odd of them. Slide 2.3 draws the
      // busiest fifteen, but it picks them after the weeks are joined: the
      // filter that used to run here kept only the products already stored,
      // which froze the series — a product first seen this week could never
      // enter — and the top-N alternative charted a product reaching the top
      // as a zero for the previous week it did have figures for.
    };
    const stamp = {
      sourceFile: req.file.originalname,
      uploadedAt: new Date().toISOString(),
    };
    const stored: AgaDataset = {
      ...existing,
      managed: mergeAgaManagedSection(existing.managed, { ...selected, source: stamp }),
    };

    await client.execute({
      sql: `INSERT INTO aga_dataset (id, data, source_file, uploaded_at)
            VALUES (1, ?, ?, datetime('now'))
            ON CONFLICT(id) DO UPDATE
            SET data = excluded.data,
                source_file = excluded.source_file,
                uploaded_at = excluded.uploaded_at`,
      args: [JSON.stringify(stored), stored.source.sourceFile],
    });

    res.json({
      ...(await buildAgaPayload()),
      report: { ...parsed.report, file: req.file.originalname },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al procesar Gestionado ZPT025";
    res.status(400).json({ error: message });
  }
});

/**
 * Import of the plain-text tab produced by the AGA Drive spreadsheet.
 *
 * Takes the whole report in one go, where the three workbook endpoints each
 * take one section. Unlike them it applies no presentation filter: the Drive
 * script already decided which departments and how many products the slides
 * show, and re-filtering here would drop rows it deliberately produced.
 *
 * Accepts a `.txt` upload (`file`) or a pasted body (`{ texto }`), because the
 * colleague copies the tab and the sidebar uploads a file.
 */
router.post("/api/aga/upload/texto", upload.single("file"), async (req, res) => {
  try {
    const body = req.body as { texto?: unknown } | undefined;
    const pasted = typeof body?.texto === "string" ? body.texto : "";
    const input = req.file ? req.file.buffer.toString("utf8") : pasted;

    if (input.trim() === "") {
      return res
        .status(400)
        .json({ error: "Debes adjuntar o pegar el texto plano de la hoja de Drive." });
    }

    const parsed = parseAgaTexto(input);
    const existing = (await readStoredAgaDataset()) ?? emptyAgaDataset();
    const stamp = {
      sourceFile: req.file?.originalname ?? "Texto plano (Drive)",
      uploadedAt: new Date().toISOString(),
    };

    const stored: AgaDataset = {
      ...existing,
      ...(parsed.weeks.length > 0
        ? { weeks: mergeAgaWeeks(existing.weeks ?? [], parsed.weeks) }
        : {}),
      ...(parsed.managed
        ? {
            managed: mergeAgaManagedSection(existing.managed, {
              ...parsed.managed,
              source: stamp,
            }),
          }
        : {}),
      ...(parsed.office
        ? { office: mergeAgaOfficeSection(existing.office, { ...parsed.office, source: stamp }) }
        : {}),
      ...(parsed.annual
        ? { annual: mergeAgaAnnualSection(existing.annual, { ...parsed.annual, source: stamp }) }
        : {}),
      texto: stamp,
      // The GPS slot of the sidebar reads `source`, so a text import must not
      // claim it: doing so relabels every other slot with the name of this
      // file. It only fills it in when nothing has been imported yet.
      source: existing.source?.sourceFile ? existing.source : stamp,
    };

    await client.execute({
      sql: `INSERT INTO aga_dataset (id, data, source_file, uploaded_at)
            VALUES (1, ?, ?, datetime('now'))
            ON CONFLICT(id) DO UPDATE
            SET data = excluded.data,
                source_file = excluded.source_file,
                uploaded_at = excluded.uploaded_at`,
      args: [JSON.stringify(stored), stored.source.sourceFile],
    });

    res.json({
      ...(await buildAgaPayload()),
      report: { ...parsed.report, file: stamp.sourceFile },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error al procesar el texto plano de AGA";
    res.status(400).json({ error: message });
  }
});

router.post("/api/aga/reset-deck", async (_req, res) => {
  try {
    await client.execute("DELETE FROM aga_deck WHERE id = 1");

    res.json({ success: true, deck: createDefaultAgaDeck() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al restaurar el deck de AGA";
    res.status(500).json({ error: message });
  }
});

/* -------------------------------------------------------------------------- */
/* Oficinas                                                                    */
/* -------------------------------------------------------------------------- */

/** Response of the Oficinas endpoints, as declared by `OficinasPayload`. */
type OficinasResponse = OficinasPayload;

async function readStoredOficinasDeck(): Promise<OficinasDeckState | null> {
  const result = await client.execute(
    "SELECT data, updated_at FROM oficinas_deck WHERE id = 1"
  );

  if (result.rows.length === 0) {
    return null;
  }

  try {
    const deck = JSON.parse(result.rows[0].data as string) as OficinasDeckState;

    if (!deck || !Array.isArray(deck.pages)) {
      return null;
    }

    // A deck stored before a template page existed would never show it again,
    // since the deck is persisted whole. Reconciling on read adds only what is
    // missing, instead of forcing a reset that drops the user's texts.
    return mergeOficinasDeckTemplate({
      pages: deck.pages,
      updatedAt: deck.updatedAt ?? ((result.rows[0].updated_at as string) ?? null),
    });
  } catch {
    // Ignore malformed deck rows instead of breaking the API.
    return null;
  }
}

async function readStoredOficinasDataset(): Promise<OficinasDataset | null> {
  const result = await client.execute(
    "SELECT data, source_file, uploaded_at FROM oficinas_dataset WHERE id = 1"
  );

  if (result.rows.length === 0) {
    return null;
  }

  try {
    const dataset = JSON.parse(result.rows[0].data as string) as OficinasDataset;

    return {
      ...dataset,
      source: {
        sourceFile: dataset.source?.sourceFile ?? ((result.rows[0].source_file as string) ?? null),
        uploadedAt: dataset.source?.uploadedAt ?? ((result.rows[0].uploaded_at as string) ?? null),
      },
    };
  } catch {
    return null;
  }
}

async function buildOficinasPayload(): Promise<OficinasResponse> {
  const [deck, dataset] = await Promise.all([
    readStoredOficinasDeck(),
    readStoredOficinasDataset(),
  ]);

  return {
    deck: deck ?? createDefaultOficinasDeck(),
    data: dataset ?? emptyOficinasDataset(),
  };
}

router.get("/api/oficinas", async (_req, res) => {
  try {
    res.json(await buildOficinasPayload());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al obtener el informe de Oficinas";
    res.status(500).json({ error: message });
  }
});

router.put("/api/oficinas/deck", async (req, res) => {
  try {
    // Accept both { deck } and a bare deck payload.
    const body = req.body as { deck?: OficinasDeckState } & Partial<OficinasDeckState>;
    const deck = (body?.deck ?? body) as OficinasDeckState | undefined;

    if (!deck || !Array.isArray(deck.pages)) {
      return res
        .status(400)
        .json({ error: "El deck enviado no es válido: falta la lista de páginas." });
    }

    const updatedAt = new Date().toISOString();
    const storedDeck: OficinasDeckState = { pages: deck.pages, updatedAt };

    await client.execute({
      sql: `INSERT INTO oficinas_deck (id, data, updated_at) VALUES (1, ?, datetime('now'))
            ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      args: [JSON.stringify(storedDeck)],
    });

    res.json({ success: true, deck: storedDeck });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al guardar el deck de Oficinas";
    res.status(500).json({ error: message });
  }
});

router.post("/api/oficinas/upload/plano", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Debes adjuntar el template semanal de Oficinas." });
    }

    if (!looksLikeWorkbook(req.file.buffer)) {
      return res.status(400).json({
        error: `No se pudo leer "${req.file.originalname}": no es un libro de Excel.`,
      });
    }

    // The template stamps no year anywhere, so the current-year sheets are dated
    // by the caller. It defaults to the year of the upload, which is right for
    // the weekly routine, and is overridable for a backfill of an old export.
    const requested = Number(req.body?.year ?? req.query?.year);
    const year =
      Number.isInteger(requested) && requested >= 2000 && requested <= 2100
        ? requested
        : new Date().getFullYear();

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const { dataset, report } = parseOficinasWorkbook(workbook, year);

    // Like AGA and unlike Informática, the upload does NOT replace the dataset:
    // it folds the (year, week) cells it carries into the stored history, so a
    // corrected export overwrites exactly the weeks it contains and the office
    // master seeded from the other workbook survives untouched.
    const existing = await readStoredOficinasDataset();

    const stored: OficinasDataset = mergeOficinasDataset(existing, dataset, {
      sourceFile: req.file.originalname,
      uploadedAt: new Date().toISOString(),
    });

    await client.execute({
      sql: `INSERT INTO oficinas_dataset (id, data, source_file, uploaded_at)
            VALUES (1, ?, ?, datetime('now'))
            ON CONFLICT(id) DO UPDATE
            SET data = excluded.data,
                source_file = excluded.source_file,
                uploaded_at = excluded.uploaded_at`,
      args: [JSON.stringify(stored), stored.source.sourceFile],
    });

    // The upload answers with the full payload so the client rehydrates without
    // a second fetch, plus what the import actually read.
    const payload = await buildOficinasPayload();

    res.json({
      ...payload,
      report: { ...report, file: req.file.originalname },
    } satisfies OficinasResponse & { report: OficinasImportReport });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error al procesar el template de Oficinas";
    res.status(400).json({ error: message });
  }
});

router.post("/api/oficinas/reset-deck", async (_req, res) => {
  try {
    await client.execute("DELETE FROM oficinas_deck WHERE id = 1");

    res.json({ success: true, deck: createDefaultOficinasDeck() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al restaurar el deck de Oficinas";
    res.status(500).json({ error: message });
  }
});

/**
 * The client and the server can run on different origins (Vite dev proxy: the
 * browser only ever talks to the Vite port, which forwards `/api` to this
 * server). Production always renders through the loopback server so request
 * headers can never redirect authentication credentials to another origin.
 */
function resolveClientOrigin(req: import("express").Request): string {
  if (process.env.NODE_ENV === "production") {
    return `http://127.0.0.1:${process.env.PORT ?? 3000}`;
  }

  for (const header of [req.get("referer"), req.get("origin")]) {
    if (!header) {
      continue;
    }

    try {
      return new URL(header).origin;
    } catch {
      // Malformed header: fall through to the next candidate.
    }
  }

  return `${req.protocol}://${req.get("host")}`;
}

/** Renders `path` as a PDF, one slide per page, via a headless render of the real app. */
async function renderDeckPdf(
  origin: string,
  path: string,
  signal: AbortSignal
): Promise<Buffer> {
  const renderTimeoutMs = 120_000;
  const browser = await puppeteer.launch({
    // Chrome Headless Shell has a materially smaller footprint than full
    // Chrome, which keeps PDF export inside Render's 512 MB free instance.
    headless: "shell",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });
  let closePromise: Promise<void> | null = null;
  const closeBrowser = () => (closePromise ??= browser.close());
  const abortRender = () => {
    void closeBrowser().catch(() => undefined);
  };
  signal.addEventListener("abort", abortRender, { once: true });

  try {
    if (signal.aborted) {
      throw new Error("La generación del PDF fue cancelada.");
    }
    const page = await browser.newPage();
    const credentials = configuredCredentials();
    if (credentials) {
      await page.authenticate(credentials);
    }
    await page.setViewport({ width: 1600, height: 900 });
    await page.goto(`${origin}${path}`, {
      waitUntil: "domcontentloaded",
      timeout: renderTimeoutMs,
    });
    await page.waitForSelector('main section[id^="slide-"]', {
      timeout: renderTimeoutMs,
    });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        Array.from(document.images, (image) =>
          image.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                image.addEventListener("load", () => resolve(), { once: true });
                image.addEventListener("error", () => resolve(), { once: true });
              })
        )
      );
    });
    await page.emulateMediaType("print");
    // Charts (recharts ResizeObserver) and the table auto-fit hook settle a
    // frame or two after the DOM is ready; give them a beat before capturing.
    await new Promise((resolve) => setTimeout(resolve, 600));

    const pdf = await page.pdf({
      preferCSSPageSize: true,
      printBackground: true,
      timeout: renderTimeoutMs,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    return Buffer.from(pdf);
  } finally {
    signal.removeEventListener("abort", abortRender);
    await closeBrowser();
  }
}

const sendCoordinatedDeckPdf = createDeckPdfSender(renderDeckPdf);

function sendDeckPdf(
  req: import("express").Request,
  res: import("express").Response,
  routePath: string,
  department: string
) {
  const origin = resolveClientOrigin(req);
  void sendCoordinatedDeckPdf(req, res, {
    origin,
    path: routePath,
    department,
  });
}

router.get("/api/informe/pdf", (req, res) => {
  sendDeckPdf(req, res, "/av", "AV");
});

router.get("/api/informatica/pdf", (req, res) => {
  sendDeckPdf(req, res, "/informatica", "Informatica");
});

router.get("/api/aga/pdf", (req, res) => {
  sendDeckPdf(req, res, "/aga", "AGA");
});

router.get("/api/oficinas/pdf", (req, res) => {
  sendDeckPdf(req, res, "/oficinas", "Oficinas");
});

router.get("/api/uploads/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      res.status(404).end();
      return;
    }

    const result = await client.execute({
      sql: "SELECT mime_type, data FROM uploaded_asset WHERE id = ?",
      args: [id],
    });
    const asset = result.rows[0];

    if (!asset) {
      res.status(404).end();
      return;
    }

    res.setHeader("Content-Type", asset.mime_type as string);
    res.setHeader("Content-Length", String((asset.data as Uint8Array).byteLength));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    res.send(Buffer.from(asset.data as Uint8Array));
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo cargar la imagen";
    res.status(500).json({ error: message });
  }
});

router.post("/api/uploads/image", (req, res) => {
  imageUpload.single("file")(req, res, (err) => {
    if (err) {
      const message = err instanceof Error ? err.message : "No se pudo subir la imagen";
      res.status(400).json({ error: message });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: "Debes adjuntar una imagen" });
      return;
    }

    if (!hasSupportedImageSignature(req.file.buffer, req.file.mimetype)) {
      res.status(400).json({ error: "El contenido del archivo no coincide con una imagen válida." });
      return;
    }

    const id = randomUUID();

    client.execute({
      sql: `INSERT INTO uploaded_asset (id, mime_type, data, size_bytes)
            VALUES (?, ?, ?, ?)`,
      args: [id, req.file.mimetype, req.file.buffer, req.file.size],
    })
      .then(() => res.status(201).json({ url: `/api/uploads/${id}` }))
      .catch((dbErr) => {
        const message = dbErr instanceof Error ? dbErr.message : "No se pudo guardar la imagen";
        res.status(500).json({ error: message });
      });
  });
});

const handleUploadError: ErrorRequestHandler = (err, _req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: "El archivo supera el tamaño máximo permitido." });
      return;
    }

    res.status(400).json({ error: err.message });
    return;
  }

  next(err);
};

router.use(handleUploadError);

export default router;
