import { MONTH_LABELS } from "@shared/deck/core";
import type { MatrixRow } from "@/components/deck/MatrixTable";

/**
 * Aggregation helpers for the Informatica dataset.
 *
 * Every sheet arrives in long format — one row per combination of dimensions
 * plus a measure — so all the report needs is a pivot, a period filter and a
 * couple of label formatters. Repeated rows accumulate, matching the parser.
 */

/** Year of a `YYYY/MM` month. */
export function yearOf(month: string): number {
  return Number(month.slice(0, 4));
}

/** 1-12 index of a `YYYY/MM` month. */
export function monthIndexOf(month: string): number {
  return Number(month.slice(5, 7));
}

/** `2026/07` renders as `Jul 26`, the abbreviation used in the report. */
export function monthLabel(month: string): string {
  const index = monthIndexOf(month);
  const name = MONTH_LABELS[index - 1] ?? month;
  return `${name} ${month.slice(2, 4)}`;
}

export function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value !== ""))).sort((a, b) =>
    a.localeCompare(b, "es")
  );
}

/** Highest value of a dimension, e.g. the most recent month or week. */
export function latestOf<T, V extends string | number>(
  rows: T[],
  get: (row: T) => V
): V | null {
  let latest: V | null = null;

  for (const row of rows) {
    const value = get(row);

    if (latest === null || value > latest) {
      latest = value;
    }
  }

  return latest;
}

export interface Pivot {
  columns: string[];
  rows: MatrixRow[];
}

/**
 * Pivots long rows into a labelled matrix. Values of rows sharing the same
 * coordinates are summed, never overwritten.
 */
export function pivot<T>(
  source: T[],
  rowOf: (row: T) => string,
  columnOf: (row: T) => string,
  valueOf: (row: T) => number,
  options?: { columns?: string[]; rowOrder?: string[] }
): Pivot {
  const columns =
    options?.columns ?? uniqueSorted(source.map((row) => columnOf(row)));
  const columnIndex = new Map(columns.map((column, index) => [column, index]));

  const byRow = new Map<string, number[]>();

  for (const row of source) {
    const label = rowOf(row);
    const index = columnIndex.get(columnOf(row));

    if (label === "" || index === undefined) {
      continue;
    }

    let values = byRow.get(label);

    if (!values) {
      values = new Array(columns.length).fill(0);
      byRow.set(label, values);
    }

    values[index] += valueOf(row);
  }

  const order =
    options?.rowOrder ?? Array.from(byRow.keys()).sort((a, b) => a.localeCompare(b, "es"));

  const rows: MatrixRow[] = order
    .filter((label) => byRow.has(label))
    .map((label) => ({ label, values: byRow.get(label) ?? [] }));

  return { columns, rows };
}

/**
 * Puts the columns the report expects first, in its own order, and appends any
 * other value found in the workbook instead of dropping it.
 */
export function orderColumns(found: string[], preferred: string[]): string[] {
  return [
    ...preferred.filter((column) => found.includes(column)),
    ...found.filter((column) => !preferred.includes(column)),
  ];
}

/** Sums a measure grouped by one dimension. */
export function sumBy<T>(
  source: T[],
  keyOf: (row: T) => string,
  valueOf: (row: T) => number
): Map<string, number> {
  const totals = new Map<string, number>();

  for (const row of source) {
    const key = keyOf(row);

    if (key === "") {
      continue;
    }

    totals.set(key, (totals.get(key) ?? 0) + valueOf(row));
  }

  return totals;
}

/** Palette of the deck, reused so every module charts with the same colours. */
export const SERIES_COLORS = [
  "var(--informe-serie-1)",
  "var(--informe-serie-2)",
  "var(--informe-serie-3)",
  "var(--informe-serie-4)",
];

export function seriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

/**
 * Grouped-bar data for a yearly comparison: twelve month rows, one series per
 * year, plus the yearly totals used by the KPI strip next to the chart.
 */
export function yearlyComparison<T>(
  source: T[],
  monthOf: (row: T) => string,
  valueOf: (row: T) => number
): {
  years: number[];
  data: Record<string, number | string>[];
  totals: Map<number, number>;
} {
  const years = Array.from(new Set(source.map((row) => yearOf(monthOf(row)))))
    .filter((year) => Number.isFinite(year))
    .sort((a, b) => a - b);

  const totals = new Map<number, number>();
  const byYearMonth = new Map<string, number>();

  for (const row of source) {
    const month = monthOf(row);
    const year = yearOf(month);
    const index = monthIndexOf(month);

    if (!Number.isFinite(year) || !Number.isFinite(index)) {
      continue;
    }

    const key = `${year}:${index}`;
    byYearMonth.set(key, (byYearMonth.get(key) ?? 0) + valueOf(row));
    totals.set(year, (totals.get(year) ?? 0) + valueOf(row));
  }

  const data = MONTH_LABELS.map((label, position) => {
    const entry: Record<string, number | string> = { mes: label };

    for (const year of years) {
      const value = byYearMonth.get(`${year}:${position + 1}`);

      if (value !== undefined) {
        entry[`y${year}`] = value;
      }
    }

    return entry;
  });

  return { years, data, totals };
}
