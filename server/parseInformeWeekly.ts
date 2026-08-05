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

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
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

  return { weeks, rows: dataRows, totals };
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

  return {
    byType,
    maxWeek,
    sourceFile: null,
    uploadedAt: null,
  };
}
