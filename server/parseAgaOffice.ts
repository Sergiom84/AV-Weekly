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

    for (const row of rows.slice(header.row + 1)) {
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

      const month = agaOfficeMonth(row[dateIndex]);
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
    },
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
