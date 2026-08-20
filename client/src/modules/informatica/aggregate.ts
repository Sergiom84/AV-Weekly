import { MONTH_LABELS } from "@shared/deck/core";
import type { MatrixRow } from "@/components/deck/MatrixTable";
import type {
  InformaticaDataset,
  InformaticaDateCell,
} from "@shared/modules/informatica/types";

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

/** `4.857` renders as `4,86`, the decimal comma of the report. */
export function decimal(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) {
    return "";
  }

  return value.toLocaleString("es-ES", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Share as the report writes it: `0.925` becomes `92,5 %`. */
export function percent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) {
    return "";
  }

  return `${(value * 100).toLocaleString("es-ES", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} %`;
}

/** Last calendar day of a `YYYY/MM` month, as `YYYY-MM-DD`. */
function lastDayOf(month: string): string {
  const year = yearOf(month);
  const index = monthIndexOf(month);

  if (!Number.isFinite(year) || !Number.isFinite(index)) {
    return "";
  }

  // Day 0 of the next month is the last day of this one, leap years included.
  const date = new Date(Date.UTC(year, index, 0));

  return date.toISOString().slice(0, 10);
}

/**
 * `Fecha` cell as `YYYY-MM-DD`. The template writes an Excel serial but a
 * hand-edited workbook carries ISO text, so both are accepted — the same
 * contract `InformaticaDateCell` declares.
 */
function isoDay(cell: InformaticaDateCell): string | null {
  if (typeof cell === "number" && Number.isFinite(cell)) {
    // Excel's epoch is 1899-12-30: day 1 is 1900-01-01 and the 1900 leap bug
    // is already absorbed by the two-day offset.
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(cell) * 86_400_000);

    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }

  if (typeof cell === "string" && /^\d{4}-\d{2}-\d{2}/.test(cell)) {
    return cell.slice(0, 10);
  }

  return null;
}

/**
 * Last day the workbook has data for, across the sheets that record what
 * happened.
 *
 * The flat book is an extract cut on the day it was taken, so knowing where it
 * stops is what tells a full month apart from an in-flight one.
 *
 * `Citas` is deliberately not one of the sheets consulted: appointments are
 * booked ahead, so that sheet runs past the cut — to 2026-08-26 in a book whose
 * incidents stop on the 14th. Reading the cut off future bookings would call a
 * month closed before it has been worked.
 */
export function coverageEnd(dataset: InformaticaDataset): string | null {
  const cells: InformaticaDateCell[] = [
    ...(dataset.incidencias ?? []).map((row) => row.fecha),
    ...(dataset.workOrders ?? []).map((row) => row.fecha),
    ...(dataset.peticiones ?? []).map((row) => row.fecha),
  ];

  let end: string | null = null;

  for (const cell of cells) {
    const day = isoDay(cell);

    if (day !== null && (end === null || day > end)) {
      end = day;
    }
  }

  return end;
}

/** Monday of the ISO week a day belongs to, as `YYYY-MM-DD`. */
function mondayOf(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  // getUTCDay is 0 on Sunday, which is the last day of an ISO week, not the first.
  const offset = (date.getUTCDay() + 6) % 7;

  date.setUTCDate(date.getUTCDate() - offset);

  return date.toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` a given number of days after another. */
function addDays(day: string, count: number): string {
  const date = new Date(`${day}T00:00:00Z`);

  date.setUTCDate(date.getUTCDate() + count);

  return date.toISOString().slice(0, 10);
}

export interface WeekWindow {
  /** Monday of the week, inclusive. */
  start: string;
  /** Sunday of the week, inclusive. */
  end: string;
}

/**
 * Monday-to-Sunday window of the last full working week a section reports on.
 *
 * A window rather than a week number, because the number alone cannot pick a
 * week: the sheets carry more than a year, so weeks 1 to 52 each occur twice,
 * and taking the highest one lands on the previous December. Filtering by date
 * has no such ambiguity.
 *
 * "Full" means the section has data through the Friday. A book cut on a Monday
 * carries one day of that week, and reporting it as the week would show a fifth
 * of the normal volume as a collapse. Rows after `cutoff` are ignored so a
 * forward-looking sheet — appointments booked for next week — cannot pull the
 * window into the future.
 */
export function lastClosedWeek<T>(
  rows: T[],
  dateOf: (row: T) => InformaticaDateCell,
  cutoff: string | null
): WeekWindow | null {
  let last: string | null = null;

  for (const row of rows) {
    const day = isoDay(dateOf(row));

    if (day === null || (cutoff !== null && day > cutoff)) {
      continue;
    }

    if (last === null || day > last) {
      last = day;
    }
  }

  if (last === null) {
    return null;
  }

  const monday = mondayOf(last);
  // Friday is the last working day the report counts on.
  const start = last >= addDays(monday, 4) ? monday : addDays(monday, -7);

  return { start, end: addDays(start, 6) };
}

/** True when a dated row falls inside the window. */
export function inWeek(cell: InformaticaDateCell, window: WeekWindow | null): boolean {
  if (window === null) {
    return false;
  }

  const day = isoDay(cell);

  return day !== null && day >= window.start && day <= window.end;
}

/**
 * Latest month the workbook covers all the way to its last calendar day.
 *
 * The reported month of a monthly report has to be a whole month. The extract
 * is cut on the day it is taken, so its final month is normally a fortnight
 * long — 2026/08 stops on the 14th in the current book — and printing "the
 * month" on it would put half a month next to full ones and read as a collapse
 * in volume.
 *
 * Falls back to the latest month when no dated sheet says where the data
 * stops: showing the most recent month is a better failure than showing none.
 */
export function lastClosedMonth(
  months: string[],
  end: string | null
): string | null {
  const ordered = Array.from(new Set(months)).sort();

  if (ordered.length === 0) {
    return null;
  }

  if (end !== null) {
    for (let index = ordered.length - 1; index >= 0; index -= 1) {
      const month = ordered[index];
      const closes = lastDayOf(month);

      if (closes !== "" && end >= closes) {
        return month;
      }
    }
  }

  return ordered[ordered.length - 1];
}

/** `lastClosedMonth` over the months a section reports on. */
export function reportMonth<T>(
  dataset: InformaticaDataset,
  rows: T[],
  monthOf: (row: T) => string
): string | null {
  return lastClosedMonth(
    rows.map(monthOf).filter((month) => month !== ""),
    coverageEnd(dataset)
  );
}

/** The `count` highest entries of a total map, ties broken by label. */
export function topEntries(
  totals: Map<string, number>,
  count: number
): { label: string; value: number }[] {
  return Array.from(totals.entries())
    .map(([label, value]) => ({ label, value }))
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "es"))
    .slice(0, count);
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
