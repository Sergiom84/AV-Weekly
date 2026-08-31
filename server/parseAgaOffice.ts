import * as XLSX from "xlsx";
import type { AgaOfficeSection } from "../shared/modules/aga/types.ts";

export const AGA_OFFICE_FAMILIES = [
  "MICROSOFT OFFICE STANDARD",
  "MICROSOFT OFFICE EXCEL",
  "MICROSOFT OFFICE 365",
  "MICROSOFT ACCESS",
  "MICROSOFT WORD",
] as const;

type OfficeFamily = (typeof AGA_OFFICE_FAMILIES)[number];

const REQUIRED_HEADERS = [
  "Nº Petición de sistemas",
  "Nº Posición de petición",
  "Denominación Producto",
  "Fecha de inicio de la gestión",
] as const;

const HEADER_SCAN_ROWS = 20;
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

export interface AgaOfficeUnknownValue {
  value: string;
  count: number;
}

export interface AgaOfficeSheetReport {
  sheet: string;
  recognised: boolean;
  headerRow: number | null;
  rows: number;
  imported: number;
  skipped: number;
  missingColumns: string[];
}

export interface AgaOfficeImportReport {
  sheets: AgaOfficeSheetReport[];
  sheetsFound: string[];
  rows: number;
  imported: number;
  skipped: number;
  unknownProducts: AgaOfficeUnknownValue[];
  unknownDates: AgaOfficeUnknownValue[];
  /** Cells whose day and month arrived exchanged and were put back in place. */
  repairedDates: number;
  /**
   * Months later than the month of the import, ascending.
   *
   * The export lists licences already handled, so such a month cannot exist. It
   * means the dates are still wrong in a way the repair above does not explain,
   * and importing it would overwrite a month of the stored history.
   */
  futureMonths: string[];
}

export interface AgaOfficeParseResult {
  office: AgaOfficeSection;
  report: AgaOfficeImportReport;
}

function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function display(value: unknown): string {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "Fecha inválida" : value.toISOString();
  }

  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text || "(en blanco)";
}

function addUnknown(target: Map<string, number>, value: unknown): void {
  const key = display(value);
  target.set(key, (target.get(key) ?? 0) + 1);
}

function unknownValues(values: Map<string, number>): AgaOfficeUnknownValue[] {
  return Array.from(values, ([value, count]) => ({ value, count })).sort(
    (a, b) => b.count - a.count || a.value.localeCompare(b.value, "es")
  );
}

/** Canonical family used by the historical Office series. */
export function agaOfficeFamily(value: unknown): OfficeFamily | null {
  const product = normalize(value);

  // Miguel's business rule: an Apple licence belongs to Standard. It must run
  // before every other product check in case its description also says Office.
  if (product.includes("APPLE")) {
    return "MICROSOFT OFFICE STANDARD";
  }

  if (product.includes("OFFICE") && product.includes("STANDARD")) {
    return "MICROSOFT OFFICE STANDARD";
  }

  if (product.includes("EXCEL")) {
    return "MICROSOFT OFFICE EXCEL";
  }

  if (product.includes("OFFICE 365")) {
    return "MICROSOFT OFFICE 365";
  }

  if (product.includes("ACCESS")) {
    return "MICROSOFT ACCESS";
  }

  if (product.includes("WORD")) {
    return "MICROSOFT WORD";
  }

  return null;
}

function isoMonth(year: number, month: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}`;
}

/** `YYYY-MM` from an Excel serial, Date or common textual date. */
export function agaOfficeMonth(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : isoMonth(value.getFullYear(), value.getMonth() + 1);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) {
      return null;
    }

    const date = new Date(EXCEL_EPOCH + Math.floor(value) * 86400000);
    return isoMonth(date.getUTCFullYear(), date.getUTCMonth() + 1);
  }

  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }

  const iso = raw.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.]\d{1,2})?/);
  if (iso) {
    return isoMonth(Number(iso[1]), Number(iso[2]));
  }

  const dmy = raw.match(/^\d{1,2}[-/.](\d{1,2})[-/.](\d{4})/);
  if (dmy) {
    return isoMonth(Number(dmy[2]), Number(dmy[1]));
  }

  const serial = Number(raw);
  return Number.isFinite(serial) ? agaOfficeMonth(serial) : null;
}

/** `dd/mm/yyyy` or `dd.mm.yyyy` text, as day, month and year. */
const TEXT_DATE = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/;

/**
 * Whether a date column was converted by a spreadsheet reading `dd/mm/yyyy` as
 * `mm/dd/yyyy`.
 *
 * The tell is a column that mixes text and dates. A day of 13 or higher cannot
 * be read as a month, so those cells stay text; the rest become real dates with
 * the day and the month exchanged. A column that is all text or all dates is
 * left alone, and so is one where some date cell has a day above 12, because
 * then the exchange does not explain what is in the column and repairing it
 * would be a guess.
 *
 * Mirrors `columnaConFechasIntercambiadas` in `scripts/aga-drive/Codigo.gs`.
 */
export function agaOfficeDatesAreSwapped(values: unknown[]): boolean {
  let texts = 0;
  let dates = 0;
  let swappable = 0;

  for (const value of values) {
    const parts = dateCellParts(value);

    if (parts) {
      dates += 1;
      if (parts.day <= 12) swappable += 1;
      continue;
    }

    const match = TEXT_DATE.exec(String(value ?? "").trim());
    if (match && Number(match[1]) > 12) texts += 1;
  }

  return texts > 0 && dates > 0 && swappable === dates;
}

/**
 * A cell the spreadsheet already resolved into a date: a `Date` or the Excel
 * serial the same cell becomes when the workbook is read without `cellDates`.
 * Textual dates are not included: those are the ones the conversion left alone.
 */
function dateCellParts(value: unknown): { year: number; month: number; day: number } | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : { year: value.getFullYear(), month: value.getMonth() + 1, day: value.getDate() };
  }

  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const date = new Date(EXCEL_EPOCH + Math.floor(value) * 86400000);
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
    };
  }

  return null;
}

/** `YYYY-MM` of a swapped cell, reading its day as the month. Null if it is not one. */
export function agaOfficeRepairedMonth(value: unknown): string | null {
  const parts = dateCellParts(value);

  return parts && parts.day <= 12 ? isoMonth(parts.year, parts.day) : null;
}

function headerIndexes(row: unknown[]): Map<string, number> {
  const result = new Map<string, number>();

  row.forEach((cell, index) => {
    const key = normalize(cell);
    if (key && !result.has(key)) {
      result.set(key, index);
    }
  });

  return result;
}

function findHeader(rows: unknown[][]): { row: number; indexes: Map<string, number> } | null {
  for (let row = 0; row < Math.min(rows.length, HEADER_SCAN_ROWS); row += 1) {
    const indexes = headerIndexes(rows[row] ?? []);
    if (REQUIRED_HEADERS.every((header) => indexes.has(normalize(header)))) {
      return { row, indexes };
    }
  }

  return null;
}

function missingHeaders(rows: unknown[][]): string[] {
  const candidates = rows
    .slice(0, HEADER_SCAN_ROWS)
    .map(headerIndexes)
    .sort((a, b) => b.size - a.size);
  const best = candidates[0] ?? new Map<string, number>();

  return REQUIRED_HEADERS.filter((header) => !best.has(normalize(header)));
}

/**
 * Parses the monthly Office export. Every valid source row is one position,
 * including rejected positions, which preserves the presented August total of
 * 44. Raw personal data never leaves this function.
 */
export function parseAgaOfficeWorkbook(workbook: XLSX.WorkBook): AgaOfficeParseResult {
  const counts = new Map<string, Map<OfficeFamily, number>>();
  const unknownProducts = new Map<string, number>();
  const unknownDates = new Map<string, number>();
  const sheets: AgaOfficeSheetReport[] = [];
  const sheetsFound: string[] = [];
  let rowsRead = 0;
  let imported = 0;
  let skipped = 0;
  let repaired = 0;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: false,
    });
    const header = findHeader(rows);

    if (!header) {
      sheets.push({
        sheet: sheetName,
        recognised: false,
        headerRow: null,
        rows: 0,
        imported: 0,
        skipped: 0,
        missingColumns: missingHeaders(rows),
      });
      continue;
    }

    sheetsFound.push(sheetName);
    const requestIndex = header.indexes.get(normalize(REQUIRED_HEADERS[0]))!;
    const positionIndex = header.indexes.get(normalize(REQUIRED_HEADERS[1]))!;
    const productIndex = header.indexes.get(normalize(REQUIRED_HEADERS[2]))!;
    const dateIndex = header.indexes.get(normalize(REQUIRED_HEADERS[3]))!;
    let sheetRows = 0;
    let sheetImported = 0;
    let sheetSkipped = 0;
    const dataRows = rows.slice(header.row + 1);
    const swapped = agaOfficeDatesAreSwapped(dataRows.map((row) => row[dateIndex]));

    for (const row of dataRows) {
      if (!row.some((cell) => cell !== null && String(cell).trim() !== "")) {
        continue;
      }

      sheetRows += 1;
      rowsRead += 1;

      if (!String(row[requestIndex] ?? "").trim() || !String(row[positionIndex] ?? "").trim()) {
        sheetSkipped += 1;
        skipped += 1;
        continue;
      }

      const cell = row[dateIndex];
      const repairedMonth = swapped ? agaOfficeRepairedMonth(cell) : null;

      if (repairedMonth) repaired += 1;

      const month = repairedMonth ?? agaOfficeMonth(cell);
      if (!month) {
        addUnknown(unknownDates, row[dateIndex]);
        sheetSkipped += 1;
        skipped += 1;
        continue;
      }

      const family = agaOfficeFamily(row[productIndex]);
      if (!family) {
        addUnknown(unknownProducts, row[productIndex]);
        sheetSkipped += 1;
        skipped += 1;
        continue;
      }

      const monthCounts = counts.get(month) ?? new Map<OfficeFamily, number>();
      monthCounts.set(family, (monthCounts.get(family) ?? 0) + 1);
      counts.set(month, monthCounts);
      sheetImported += 1;
      imported += 1;
    }

    sheets.push({
      sheet: sheetName,
      recognised: true,
      headerRow: header.row + 1,
      rows: sheetRows,
      imported: sheetImported,
      skipped: sheetSkipped,
      missingColumns: [],
    });
  }

  if (sheetsFound.length === 0) {
    throw new Error(
      `No se encontró una hoja Office con las columnas requeridas: ${REQUIRED_HEADERS.join(", ")}.`
    );
  }

  const months = Array.from(counts.keys()).sort();
  const now = new Date();
  const currentMonth = isoMonth(now.getFullYear(), now.getMonth() + 1) ?? "";
  const futureMonths = months.filter((month) => month > currentMonth);
  const office: AgaOfficeSection = {
    months,
    families: AGA_OFFICE_FAMILIES.map((label) => ({
      label,
      // A recognised monthly export is complete: an absent family means zero,
      // unlike a historical month that was never measured and uses null.
      values: months.map((month) => counts.get(month)?.get(label) ?? 0),
    })),
  };

  return {
    office,
    report: {
      sheets,
      sheetsFound,
      rows: rowsRead,
      imported,
      skipped,
      unknownProducts: unknownValues(unknownProducts),
      unknownDates: unknownValues(unknownDates),
      repairedDates: repaired,
      futureMonths,
    },
  };
}

/**
 * Months a weekly import is allowed to write: the month it reports and the one
 * before it.
 *
 * The Office export lists the licences handled in the current month, and at the
 * start of a month it still drags the closing of the previous one. Anything
 * older is history, and history is only rewritten on purpose, through the
 * workbook route.
 *
 * This is what keeps a mangled date column from reaching the stored series at
 * all: a week whose dates land in March cannot write March, whatever made them
 * land there.
 */
export function agaOfficeWritableMonths(week: string): string[] {
  const match = /^(\d{4})-(\d{2})/.exec(week.trim());

  if (!match) return [];

  const year = Number(match[1]);
  const month = Number(match[2]);
  const previous = new Date(Date.UTC(year, month - 2, 1));

  return [
    isoMonth(previous.getUTCFullYear(), previous.getUTCMonth() + 1) ?? "",
    isoMonth(year, month) ?? "",
  ].filter(Boolean);
}

/**
 * The section reduced to the months the reported week may write, plus the names
 * of the months left out so the import can say what it ignored.
 */
export function restrictAgaOfficeToWindow(
  office: AgaOfficeSection,
  week: string
): { office: AgaOfficeSection; ignoredMonths: string[] } {
  const writable = new Set(agaOfficeWritableMonths(week));

  if (writable.size === 0) {
    return { office, ignoredMonths: [] };
  }

  const keep = office.months
    .map((month, index) => ({ month, index }))
    .filter((entry) => writable.has(entry.month));
  const ignoredMonths = office.months.filter((month) => !writable.has(month));

  return {
    office: {
      ...office,
      months: keep.map((entry) => entry.month),
      families: office.families.map((family) => ({
        ...family,
        values: keep.map((entry) => family.values[entry.index] ?? null),
      })),
    },
    ignoredMonths,
  };
}

/** Replaces only incoming months and preserves every other historical value. */
export function mergeAgaOfficeSection(
  existing: AgaOfficeSection | undefined,
  incoming: AgaOfficeSection
): AgaOfficeSection {
  const months = Array.from(new Set([...(existing?.months ?? []), ...incoming.months])).sort();
  const incomingMonths = new Set(incoming.months);
  const existingFamilies = new Map((existing?.families ?? []).map((family) => [family.label, family]));
  const incomingFamilies = new Map(incoming.families.map((family) => [family.label, family]));
  const labels = [
    ...AGA_OFFICE_FAMILIES,
    ...[...Array.from(existingFamilies.keys()), ...Array.from(incomingFamilies.keys())].filter(
      (label) => !AGA_OFFICE_FAMILIES.includes(label as OfficeFamily)
    ),
  ].filter((label, index, all) => all.indexOf(label) === index);

  const valueAt = (section: AgaOfficeSection | undefined, label: string, month: string) => {
    const monthIndex = section?.months.indexOf(month) ?? -1;
    const family = section?.families.find((entry) => entry.label === label);
    return monthIndex >= 0 && family ? (family.values[monthIndex] ?? null) : null;
  };

  return {
    months,
    families: labels.map((label) => ({
      label,
      values: months.map((month) => {
        if (incomingMonths.has(month) && incomingFamilies.has(label)) {
          return valueAt(incoming, label, month);
        }

        return valueAt(existing, label, month);
      }),
    })),
    source: incoming.source ?? existing?.source,
  };
}
