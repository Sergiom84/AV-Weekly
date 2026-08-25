import * as XLSX from "xlsx";
import type {
  InformeWeeklyDataset,
  ResolutionRow,
  SupportType,
  WeeklyMatrix,
  WeeklyRow,
  WeeklyTypeData,
} from "../shared/informe.ts";
import { INFORME_SUPPORT_TYPES } from "../shared/informe.ts";

/**
 * Parser for the weekly workbook ("Templates semanales audiovisuales").
 *
 * Excel truncates sheet names to 31 characters, so sheets are matched by their
 * numeric prefix ("1-", "2-", ... "10-") and, as a fallback, by normalized
 * text. Never by exact equality.
 */

type MatrixRole =
  | { kind: "matrix"; type: SupportType; axis: "categories" | "locations" }
  | { kind: "detail"; type: SupportType }
  | { kind: "ignore" };

const SHEET_ROLE_BY_PREFIX: Record<string, MatrixRole> = {
  "1": { kind: "matrix", type: "Remotos", axis: "categories" },
  "2": { kind: "matrix", type: "Programados", axis: "locations" },
  "3": { kind: "matrix", type: "Presenciales", axis: "locations" },
  "4": { kind: "matrix", type: "Incidencias", axis: "locations" },
  "5": { kind: "ignore" },
  "6": { kind: "matrix", type: "Correctivos", axis: "locations" },
  "7": { kind: "detail", type: "Programados" },
  "8": { kind: "detail", type: "Presenciales" },
  "9": { kind: "detail", type: "Incidencias" },
  "10": { kind: "detail", type: "Correctivos" },
};

/** Text fallbacks, used only when the sheet has no usable numeric prefix. */
const SHEET_ROLE_BY_TEXT: Array<{ match: string[]; role: MatrixRole }> = [
  { match: ["SOPORTE REMOTO"], role: SHEET_ROLE_BY_PREFIX["1"] },
  { match: ["SOPORTE PROGRAMADO", "DETALLE"], role: SHEET_ROLE_BY_PREFIX["7"] },
  { match: ["SOPORTE PRESENCIAL", "DETALLE"], role: SHEET_ROLE_BY_PREFIX["8"] },
  { match: ["INCIDENCIAS", "DETALLE"], role: SHEET_ROLE_BY_PREFIX["9"] },
  { match: ["MANTENIMIENTOS CORRECTIVOS", "DETALLE"], role: SHEET_ROLE_BY_PREFIX["10"] },
  { match: ["SOPORTE PROGRAMADO"], role: SHEET_ROLE_BY_PREFIX["2"] },
  { match: ["SOPORTE PRESENCIAL"], role: SHEET_ROLE_BY_PREFIX["3"] },
  { match: ["MANTENIMIENTOS CORRECTIVOS"], role: SHEET_ROLE_BY_PREFIX["6"] },
  { match: ["INCIDENCIAS"], role: SHEET_ROLE_BY_PREFIX["4"] },
  { match: ["MANTENIMIENTOS POR SEMANAS"], role: SHEET_ROLE_BY_PREFIX["5"] },
];

const TOTAL_LABEL = "TOTAL";

const DETAIL_TYPES: Exclude<SupportType, "Remotos">[] = [
  "Programados",
  "Presenciales",
  "Incidencias",
  "Correctivos",
];

type DetailType = (typeof DETAIL_TYPES)[number];

interface CanonicalResolution {
  tier2: string;
  tier3: string;
}

const FALLBACK_RESOLUTION: Record<DetailType, CanonicalResolution> = {
  Programados: { tier2: "SALA", tier3: "PREPARACION SALA" },
  Presenciales: { tier2: "SALA", tier3: "DES/MONTAJE" },
  Incidencias: { tier2: "CABLEADO", tier3: "SANEADO" },
  Correctivos: { tier2: "EQUIPO AUDIO", tier3: "CONFIGURACION" },
};

const EXACT_RESOLUTIONS: Record<DetailType, Set<string>> = {
  Programados: new Set([
    "SALA|PREPARACION SALA",
    "SALA|PRESTAMO",
    "WEBEX|CONEXION",
    "WEBEX|SEMINARIO WEB",
    "WEBEX|TRADUCCION",
    "MEET|CONEXION",
    "MEET|TRADUCCION",
    "OTRAS VC|CONEXION",
  ]),
  Presenciales: new Set([
    "SALA|PREPARACION SALA",
    "SALA|DES/INSTALACION",
    "SALA|DES/MONTAJE",
    "SALA|ENCENDIDO/APAGADO",
    "SALA|EVENTO",
    "SALA|ETIQUETADO",
    "WEBEX|CONEXION",
    "WEBEX|TRADUCCION",
    "OTRAS VC|CONEXION",
    "MEET|CONEXION",
  ]),
  Incidencias: new Set([
    "WEBEX|CONEXION",
    "WEBEX|FORMACION",
    "WEBEX|GESTION",
    "CABLEADO|PRESTAMO",
    "CABLEADO|SANEADO",
    "CABLEADO|SUSTITUCION",
    "PC/PORTATIL|CONFIGURACION",
    "PC/PORTATIL|FORMACION",
    "DOMOTICA|CONFIGURACION",
    "DOMOTICA|FORMACION",
    "DOMOTICA|REINICIO",
    "DOMOTICA|SUSTITUCION",
    "MEET|CONEXION",
    "MEET|FORMACION",
  ]),
  Correctivos: new Set([
    "ALMACEN|INVENTARIO",
    "ALMACEN|TRASLADO",
    "CABLEADO|SANEADO",
    "CABLEADO|SUSTITUCION",
    "PC/PORTATIL|CONFIGURACION",
    "PC/PORTATIL|REINICIO",
    "PC/PORTATIL|SUSTITUCION",
    "EQUIPO AUDIO|CONFIGURACION",
    "EQUIPO AUDIO|REINICIO",
    "EQUIPO AUDIO|SUSTITUCION",
    "EQUIPO VIDEO|CONFIGURACION",
    "EQUIPO VIDEO|REINICIO",
    "EQUIPO VIDEO|SUSTITUCION",
  ]),
};

const GROUPED_TIER2: Record<"Incidencias" | "Correctivos", Set<string>> = {
  Incidencias: new Set([
    "EQUIPO VIDEO",
    "MONITOR",
    "EQUIPO AUDIO",
    "VC CISCO",
    "PERIFERICO PC",
    "OTRAS VC",
    "PROYECTOR",
    "TRADUCCION",
    "ROOMWIZARD/QR",
    "VIDEO WALL",
  ]),
  Correctivos: new Set([
    "PERIFERICO PC",
    "MONITOR",
    "DOMOTICA",
    "VIDEO WALL",
    "PROYECTOR",
    "VC CISCO",
    "VC USB",
    "ROOMWIZARD/QR",
  ]),
};

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function normalizeResolutionToken(value: unknown) {
  return normalizeText(value)
    .replace(/\\/g, "/")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s*\.\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTier2(value: unknown) {
  const normalized = normalizeResolutionToken(value);

  if (normalized === "SALAS") return "SALA";
  if (normalized === "EQUIPO DE VIDEO") return "EQUIPO VIDEO";
  if (normalized === "VIDEOWALL") return "VIDEO WALL";
  if (normalized === "VC CISCO") return "VC CISCO";
  if (normalized === "VC USB") return "VC USB";
  if (normalized === "ROOMWIZARD/QR") return "ROOMWIZARD/QR";
  if (normalized === "PC/PORTATIL") return "PC/PORTATIL";

  return normalized;
}

function canonicalResolution(
  type: DetailType,
  row: ResolutionRow
): CanonicalResolution | null {
  const tier2 = normalizeTier2(row.tier2);
  let tier3 = normalizeResolutionToken(row.tier3);

  // The source sometimes leaves the action blank below the SALAS group. The
  // operational spreadsheet assigns that row to DES/INSTALACION.
  if (type === "Presenciales" && tier2 === "SALA" && !tier3) {
    tier3 = "DES/INSTALACION";
  }

  if (!tier2) {
    return null;
  }

  if (
    (type === "Incidencias" || type === "Correctivos") &&
    GROUPED_TIER2[type].has(tier2)
  ) {
    return { tier2, tier3: tier2 };
  }

  const key = `${tier2}|${tier3}`;
  return EXACT_RESOLUTIONS[type].has(key) ? { tier2, tier3 } : null;
}

/** Normalizes the aliases used by the operational sheet and sums duplicates. */
export function normalizeInformeResolutionRows(
  type: DetailType,
  rows: ResolutionRow[]
): ResolutionRow[] {
  const aggregated = new Map<string, ResolutionRow>();

  for (const row of rows) {
    const canonical = canonicalResolution(type, row);

    if (!canonical) {
      continue;
    }

    const key = `${canonical.tier2}|${canonical.tier3}`;
    const existing = aggregated.get(key);

    if (existing) {
      existing.total += row.total;
      continue;
    }

    aggregated.set(key, {
      category: row.category || type,
      tier2: canonical.tier2,
      tier3: canonical.tier3,
      total: row.total,
    });
  }

  return Array.from(aggregated.values())
    .filter((row) => row.total > 0)
    .sort(
      (a, b) =>
        a.tier2.localeCompare(b.tier2, "es") || a.tier3.localeCompare(b.tier3, "es")
    );
}

/**
 * Makes the resolution detail add up to the location total for the reported
 * week. This is the deterministic equivalent of the four in-memory patches in
 * the operational Apps Script.
 */
export function reconcileInformeResolutionRows(
  type: DetailType,
  rows: ResolutionRow[],
  expectedTotal: number
): ResolutionRow[] {
  const reconciled = normalizeInformeResolutionRows(type, rows).map((row) => ({ ...row }));
  const detailTotal = reconciled.reduce((sum, row) => sum + row.total, 0);
  const difference = expectedTotal - detailTotal;

  if (difference === 0) {
    return reconciled;
  }

  const fallback = FALLBACK_RESOLUTION[type];
  const fallbackIndex = reconciled.findIndex(
    (row) => row.tier2 === fallback.tier2 && row.tier3 === fallback.tier3
  );
  const current = fallbackIndex >= 0 ? reconciled[fallbackIndex].total : 0;
  const adjusted = current + difference;

  if (adjusted < 0) {
    throw new Error(
      `El detalle de ${type} supera el total semanal en ${Math.abs(difference)} y no puede reconciliarse sin tickets negativos.`
    );
  }

  if (fallbackIndex >= 0) {
    reconciled[fallbackIndex] = { ...reconciled[fallbackIndex], total: adjusted };
  } else if (adjusted > 0) {
    reconciled.push({
      category: type,
      tier2: fallback.tier2,
      tier3: fallback.tier3,
      total: adjusted,
    });
  }

  return reconciled
    .filter((row) => row.total > 0)
    .sort(
      (a, b) =>
        a.tier2.localeCompare(b.tier2, "es") || a.tier3.localeCompare(b.tier3, "es")
    );
}

/**
 * Counts can arrive as numbers or as formatted strings ("1,458"). Group
 * separators are dropped because every value in this workbook is an integer.
 */
function toCount(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.trunc(value) : 0;
  }

  const digits = String(value ?? "").replace(/[^\d-]/g, "");

  if (!digits || digits === "-") {
    return 0;
  }

  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toWeek(value: unknown) {
  const normalized = normalizeText(value);

  if (!normalized || normalized === TOTAL_LABEL) {
    return 0;
  }

  const parsed = toCount(value);
  return parsed > 0 && parsed <= 53 ? parsed : 0;
}

function getSheetRole(sheetName: string): MatrixRole | null {
  const normalized = normalizeText(sheetName);
  const prefix = normalized.match(/^(\d+)\s*-/);

  if (prefix && SHEET_ROLE_BY_PREFIX[prefix[1]]) {
    return SHEET_ROLE_BY_PREFIX[prefix[1]];
  }

  const textual = SHEET_ROLE_BY_TEXT.find((entry) =>
    entry.match.every((token) => normalized.includes(token))
  );

  return textual ? textual.role : null;
}

function readRows(worksheet: XLSX.WorkSheet) {
  return XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    defval: null,
    raw: true,
    blankrows: false,
  });
}

function parseMatrixSheet(worksheet: XLSX.WorkSheet): WeeklyMatrix | null {
  const rows = readRows(worksheet);

  if (rows.length < 3) {
    return null;
  }

  const headerRow = rows[0] ?? [];
  const weekColumns: Array<{ index: number; week: number }> = [];

  // Weeks are read from the header, never assumed to start at 1.
  for (let index = 2; index < headerRow.length; index += 1) {
    const week = toWeek(headerRow[index]);

    if (week > 0) {
      weekColumns.push({ index, week });
    }
  }

  if (weekColumns.length === 0) {
    return null;
  }

  weekColumns.sort((a, b) => a.week - b.week);

  const weeks = weekColumns.map((column) => column.week);
  const dataRows: WeeklyRow[] = [];

  for (let rowIndex = 2; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const label = String(row[0] ?? "").trim();

    // The trailing "Total" row is discarded: totals are recomputed here.
    if (!label || normalizeText(label) === TOTAL_LABEL) {
      continue;
    }

    const values = weekColumns.map((column) => toCount(row[column.index]));

    dataRows.push({
      label,
      values,
      total: values.reduce((sum, value) => sum + value, 0),
    });
  }

  const totals = weeks.map((_, weekIndex) =>
    dataRows.reduce((sum, row) => sum + (row.values[weekIndex] || 0), 0)
  );

  return densifyWeeklyMatrix({ weeks, rows: dataRows, totals });
}

/** Inserts zero-valued columns for missing weeks between the first and last. */
export function densifyWeeklyMatrix(matrix: WeeklyMatrix): WeeklyMatrix {
  if (matrix.weeks.length < 2) {
    return matrix;
  }

  const first = matrix.weeks[0];
  const last = matrix.weeks[matrix.weeks.length - 1];
  const weeks = Array.from({ length: last - first + 1 }, (_, index) => first + index);
  const originalIndex = new Map(matrix.weeks.map((week, index) => [week, index]));
  const rows = matrix.rows.map((row) => {
    const values = weeks.map((week) => {
      const index = originalIndex.get(week);
      return index === undefined ? 0 : (row.values[index] ?? 0);
    });

    return { ...row, values, total: values.reduce((sum, value) => sum + value, 0) };
  });
  const totals = weeks.map((_, weekIndex) =>
    rows.reduce((sum, row) => sum + (row.values[weekIndex] ?? 0), 0)
  );

  return { weeks, rows, totals };
}

function parseDetailSheet(worksheet: XLSX.WorkSheet): ResolutionRow[] {
  const rows = readRows(worksheet);
  const resolutions: ResolutionRow[] = [];

  let currentCategory = "";
  let currentTier2 = "";

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const rawCategory = String(row[0] ?? "").trim();
    const rawTier2 = String(row[1] ?? "").trim();
    const tier3 = String(row[2] ?? "").trim();

    // Merged cells: inherit the last non-empty value of columns 0 and 1.
    if (rawCategory) {
      if (normalizeText(rawCategory) === TOTAL_LABEL) {
        continue;
      }

      currentCategory = rawCategory;
      currentTier2 = "";
    }

    if (rawTier2) {
      currentTier2 = rawTier2;
    }

    if (!tier3 && !rawTier2 && !rawCategory) {
      continue;
    }

    resolutions.push({
      category: currentCategory,
      tier2: currentTier2,
      tier3,
      total: toCount(row[3]),
    });
  }

  return resolutions;
}

function createEmptyTypeData(): WeeklyTypeData {
  // Comparison series come from the trends workbook, not from this one.
  return {
    categories: null,
    locations: null,
    resolutions: [],
    resolutionsByWeek: {},
    comparisons: [],
  };
}

export function parseInformeWeeklyWorkbook(workbook: XLSX.WorkBook): InformeWeeklyDataset {
  const byType = Object.fromEntries(
    INFORME_SUPPORT_TYPES.map((type) => [type, createEmptyTypeData()])
  ) as Record<SupportType, WeeklyTypeData>;

  let recognized = 0;
  let maxWeek = 0;

  for (const sheetName of workbook.SheetNames) {
    const role = getSheetRole(sheetName);

    if (!role) {
      continue;
    }

    recognized += 1;

    if (role.kind === "ignore") {
      continue;
    }

    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      continue;
    }

    if (role.kind === "matrix") {
      const matrix = parseMatrixSheet(worksheet);

      if (!matrix) {
        continue;
      }

      byType[role.type][role.axis] = matrix;
      maxWeek = Math.max(maxWeek, ...matrix.weeks);
      continue;
    }

    byType[role.type].resolutions = parseDetailSheet(worksheet);
  }

  if (recognized === 0) {
    const disponibles = workbook.SheetNames.map((name) => `"${name}"`).join(", ") || "(ninguna)";
    throw new Error(
      `No se reconoció ninguna hoja del libro semanal de Informe. Hojas disponibles: ${disponibles}.`
    );
  }

  for (const type of DETAIL_TYPES) {
    const typeData = byType[type];
    const matrix = typeData.locations;
    const weekIndex = matrix?.weeks.indexOf(maxWeek) ?? -1;

    if (weekIndex < 0) {
      typeData.resolutions = normalizeInformeResolutionRows(type, typeData.resolutions);
      continue;
    }

    typeData.resolutions = reconcileInformeResolutionRows(
      type,
      typeData.resolutions,
      matrix?.totals[weekIndex] ?? 0
    );
  }

  return {
    byType,
    maxWeek,
    sourceFile: null,
    uploadedAt: null,
  };
}

/** Updates only the reported week and preserves every other historical week. */
export function mergeReportedResolutionHistory(
  history: Record<SupportType, Record<string, ResolutionRow[]>>,
  dataset: InformeWeeklyDataset
): Record<SupportType, Record<string, ResolutionRow[]>> {
  if (dataset.maxWeek <= 0) {
    return history;
  }

  const week = String(dataset.maxWeek);
  const merged = { ...history };

  for (const type of DETAIL_TYPES) {
    const typeData = dataset.byType[type];
    const matrix = typeData.locations;

    if (!matrix?.weeks.includes(dataset.maxWeek)) {
      continue;
    }

    merged[type] = {
      ...(history[type] ?? {}),
      [week]: typeData.resolutions,
    };
  }

  return merged;
}
