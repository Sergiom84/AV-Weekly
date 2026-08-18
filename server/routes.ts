import { randomUUID } from "crypto";
import { Router } from "express";
import fs from "fs";
import multer from "multer";
import path from "path";
import puppeteer from "puppeteer";
import { fileURLToPath } from "url";
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
  InformaticaDataset,
  InformaticaDeckState,
  InformaticaPayload,
} from "../shared/modules/informatica/types.ts";
import {
  createDefaultInformaticaDeck,
  emptyInformaticaDataset,
} from "../shared/modules/informatica/deck.ts";
import {
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
import { createDefaultAgaDeck, emptyAgaDataset } from "../shared/modules/aga/deck.ts";
import { client } from "./db.js";
import {
  mergeAgaWeeks,
  parseAgaWorkbook,
  type AgaImportReport,
} from "./parseAgaPlano.js";
import {
  mergeInformaticaWorkbooks,
  parseInformaticaPlanoWorkbook,
  type InformaticaImportReport,
} from "./parseInformaticaPlano.js";
import { parseInformeWeeklyWorkbook } from "./parseInformeWeekly.js";
import { parseInformePlanoWorkbook } from "./parseInformePlano.js";
import {
  mergeMonthlyDatasets,
  mergeWeeklyHistory,
  parseTendenciaWorkbook,
} from "./parseTendenciaMensual.js";

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
const upload = multer({ storage: multer.memoryStorage() });

/** Where uploaded images live on disk: `server/uploads` in dev, `dist/uploads` once built. */
export const UPLOADS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const IMAGE_EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

const imageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      // The stored name never reuses the client's filename: that keeps path
      // traversal and extension-spoofing out of the uploads folder.
      const ext = IMAGE_EXTENSION_BY_MIME[file.mimetype] ?? "";
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!IMAGE_EXTENSION_BY_MIME[file.mimetype]) {
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

    for (const type of INFORME_SUPPORT_TYPES) {
      const typeData = dataset.byType[type];
      const matrix = typeData.categories ?? typeData.locations;

      if (!matrix || typeData.resolutions.length === 0) {
        continue;
      }

      const lastWeekWithData = matrix.weeks.filter(
        (_, index) => (matrix.totals[index] ?? 0) > 0
      );
      const reportedWeek = lastWeekWithData[lastWeekWithData.length - 1];

      if (reportedWeek === undefined) {
        continue;
      }

      resolutionHistory[type] = {
        ...resolutionHistory[type],
        [String(reportedWeek)]: typeData.resolutions,
      };
    }

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
              byYear: { ...storedResolutions.byYear, [currentYear]: resolutionHistory },
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

    return {
      pages: deck.pages,
      updatedAt: deck.updatedAt ?? ((result.rows[0].updated_at as string) ?? null),
    };
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

async function buildInformaticaPayload(): Promise<InformaticaResponse> {
  const [deck, dataset] = await Promise.all([
    readStoredInformaticaDeck(),
    readStoredInformaticaDataset(),
  ]);

  const data = dataset ?? emptyInformaticaDataset();

  return { deck: deck ?? createDefaultInformaticaDeck(), data };
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
const uploadInformaticaPlano = upload.fields([
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
function readInformaticaUpload(buffer: Buffer): XLSX.WorkBook {
  if (looksLikeWorkbook(buffer)) {
    const workbook = XLSX.read(buffer, { type: "buffer" });

    if (!workbook || !Array.isArray(workbook.SheetNames) || workbook.SheetNames.length === 0) {
      throw new Error("no contiene ninguna hoja");
    }

    if (detectRawInformaticaFormat(workbook) === "peticiones") {
      return convertRawPeticionesWorkbook(workbook);
    }

    if (!hasFlatInformaticaSheet(workbook)) {
      throw new Error(
        "es un libro de Excel pero no trae ninguna hoja del esquema plano ni la cabecera del export de peticiones"
      );
    }

    return workbook;
  }

  const text = decodeInformaticaCsv(buffer);
  const format = detectRawInformaticaFormat(text);

  if (format === "citas" || format === "workorders") {
    return convertRawInformaticaCsv(text, format);
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

    const workbooks: XLSX.WorkBook[] = [];

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
        workbooks.push(readInformaticaUpload(file.buffer));
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
    const { dataset, report } = parseInformaticaPlanoWorkbook(
      mergeInformaticaWorkbooks(workbooks)
    );

    // The whole upload replaces the stored dataset: a sheet removed from the
    // files is a sheet the user wants back on "Próximamente".
    const stored: InformaticaDataset = {
      ...dataset,
      source: { sourceFile: describeSourceFiles(files), uploadedAt: new Date().toISOString() },
    };

    await client.execute({
      sql: `INSERT INTO informatica_dataset (id, data, source_file, uploaded_at)
            VALUES (1, ?, ?, datetime('now'))
            ON CONFLICT(id) DO UPDATE
            SET data = excluded.data,
                source_file = excluded.source_file,
                uploaded_at = excluded.uploaded_at`,
      args: [JSON.stringify(stored), stored.source.sourceFile],
    });

    // The upload answers with the full payload so the client rehydrates
    // without a second fetch, plus what the import actually read.
    const payload = await buildInformaticaPayload();

    res.json({ ...payload, report: { ...report, files } } satisfies InformaticaResponse & {
      report: InformaticaImportReport;
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error al procesar el libro plano de Informática";
    res.status(500).json({ error: message });
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

    return {
      pages: deck.pages,
      updatedAt: deck.updatedAt ?? ((result.rows[0].updated_at as string) ?? null),
    };
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

    const stored: AgaDataset = {
      weeks: mergeAgaWeeks(existing?.weeks ?? [], weeks),
      source: {
        sourceFile: req.file.originalname,
        uploadedAt: new Date().toISOString(),
      },
      sheetsFound: report.sheetsFound,
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

router.post("/api/aga/reset-deck", async (_req, res) => {
  try {
    await client.execute("DELETE FROM aga_deck WHERE id = 1");

    res.json({ success: true, deck: createDefaultAgaDeck() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al restaurar el deck de AGA";
    res.status(500).json({ error: message });
  }
});

/**
 * The client and the server can run on different origins (Vite dev proxy: the
 * browser only ever talks to the Vite port, which forwards `/api` to this
 * server). Puppeteer needs the real, browser-facing origin to render the
 * actual app, so it is read from the request rather than assumed.
 */
function resolveClientOrigin(req: import("express").Request): string {
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
async function renderDeckPdf(origin: string, path: string): Promise<Buffer> {
  const browser = await puppeteer.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 900 });
    await page.goto(`${origin}${path}`, { waitUntil: "networkidle0", timeout: 30_000 });
    await page.emulateMediaType("print");
    // Charts (recharts ResizeObserver) and the table auto-fit hook settle a
    // frame or two after the DOM is ready; give them a beat before capturing.
    await new Promise((resolve) => setTimeout(resolve, 600));

    const pdf = await page.pdf({
      width: "1600px",
      height: "900px",
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

function sendDeckPdf(
  req: import("express").Request,
  res: import("express").Response,
  routePath: string,
  filenamePrefix: string
) {
  const origin = resolveClientOrigin(req);
  const date = new Date().toISOString().slice(0, 10);

  renderDeckPdf(origin, routePath)
    .then((pdf) => {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filenamePrefix}-${date}.pdf"`
      );
      res.send(pdf);
    })
    .catch((err) => {
      const message = err instanceof Error ? err.message : "No se pudo generar el PDF";
      res.status(500).json({ error: message });
    });
}

router.get("/api/informe/pdf", (req, res) => {
  sendDeckPdf(req, res, "/av", "informe-av");
});

router.get("/api/informatica/pdf", (req, res) => {
  sendDeckPdf(req, res, "/informatica", "informe-informatica");
});

router.get("/api/aga/pdf", (req, res) => {
  sendDeckPdf(req, res, "/aga", "informe-aga");
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

    res.json({ url: `/api/uploads/${req.file.filename}` });
  });
});

export default router;
