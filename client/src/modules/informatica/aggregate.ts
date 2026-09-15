import { MONTH_LABELS, weekCoverLabel } from "@shared/deck/core";
import type { MatrixRow } from "@/components/deck/MatrixTable";
import { INFORMATICA_HISTORICO_UNTIL } from "@shared/modules/informatica/types";
import type {
  InformaticaDataset,
  InformaticaDateCell,
} from "@shared/modules/informatica/types";
import { comparativaViews } from "./sources";

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

/**
 * `Fecha` cell as `YYYY-MM-DD`. The template writes an Excel serial but a
 * hand-edited workbook carries ISO text, so both are accepted — the same
 * contract `InformaticaDateCell` declares.
 */
export function isoDay(cell: InformaticaDateCell): string | null {
  if (typeof cell === "number" && Number.isFinite(cell)) {
    // Excel's epoch is 1899-12-30: day 1 is 1900-01-01 and the 1900 leap bug
    // is already absorbed by the two-day offset.
    const date = new Date(
      Date.UTC(1899, 11, 30) + Math.floor(cell) * 86_400_000
    );

    return Number.isNaN(date.getTime())
      ? null
      : date.toISOString().slice(0, 10);
  }

  if (typeof cell === "string" && /^\d{4}-\d{2}-\d{2}/.test(cell)) {
    return cell.slice(0, 10);
  }

  return null;
}

/**
 * Calendar day as `YYYY-MM-DD`, or null when the value is not a real date.
 *
 * Accepts a trailing time (`2026-09-15T09:35:51.354Z`) because that is how an
 * ISO timestamp arrives, and rejects month 13 / day 32 so a garbage cut cannot
 * be read as a later month than any real one.
 */
function isoCut(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${match[1]}-${match[2]}-${match[3]}`;
}

/**
 * Day the extract was cut.
 *
 * The declared `asOfDate` wins: it is the date the team typed when they
 * generated the week, so every page of the deck reports the same cut. Without
 * it the last dated incident, work order or request is the fallback.
 *
 * `Citas` is deliberately not one of the sheets consulted: appointments are
 * booked ahead, so that sheet runs past the cut — to 2026-08-26 in a book whose
 * incidents stop on the 14th. Reading the cut off future bookings would pull
 * the reported week into a period that has not been worked.
 */
export function coverageEnd(dataset: InformaticaDataset): string | null {
  const declared = isoCut(dataset.source?.asOfDate);

  if (declared !== null) {
    return declared;
  }

  const cells: InformaticaDateCell[] = [
    ...(dataset.incidencias ?? []).map(row => row.fecha),
    ...(dataset.workOrders ?? []).map(row => row.fecha),
    ...(dataset.peticiones ?? []).map(row => row.fecha),
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

function isoWeekOf(day: string): { week: number; year: number } {
  const date = new Date(`${day}T00:00:00Z`);
  const thursday = new Date(date);
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  const year = thursday.getUTCFullYear();
  const firstDay = Date.UTC(year, 0, 1);
  const week = Math.ceil(((thursday.getTime() - firstDay) / 86_400_000 + 1) / 7);
  return { week, year };
}

/**
 * Cover-page period, recomputed from the last closed week in the workbook.
 */
export function coverPeriodLabel(dataset: InformaticaDataset): string {
  const rows: { fecha: InformaticaDateCell }[] = [
    ...(dataset.incidencias ?? []),
    ...(dataset.workOrders ?? []),
    ...(dataset.peticiones ?? []),
  ];
  const window = lastClosedWeek(rows, row => row.fecha, null);
  if (window === null) return "";
  const { week, year } = isoWeekOf(window.start);
  return weekCoverLabel(week, year, { start: window.start, end: window.end });
}

/**
 * Week the report covers, given the day the sources were cut.
 *
 * The team uploads on Monday and reports the week that has just closed, the
 * same convention AGA already writes down: an extract cut on 2026-08-31 is the
 * report of 24 to 30 August. Deriving it from the cut and not from the last row
 * keeps every page of the deck on one week — a section that had a quiet Friday
 * does not step back on its own — and keeps a Wednesday upload from publishing
 * a week that is still running.
 */
export function reportedWeek(cutoff: string | null): WeekWindow | null {
  if (cutoff === null) {
    return null;
  }

  const start = addDays(mondayOf(cutoff), -7);

  return { start, end: addDays(start, 6) };
}

/**
 * Rows of the most recent snapshot at or before the cutoff.
 *
 * A backlog is counted in one go and dated with the day the extract was taken,
 * so its rows are not spread over the week: they are one photograph, and the
 * week it reports on is `reportedWeek`, not the week that contains the date it
 * carries.
 */
export function snapshotRows<T>(
  rows: T[],
  dateOf: (row: T) => InformaticaDateCell,
  cutoff: string | null
): T[] {
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

  return last === null ? [] : rows.filter(row => isoDay(dateOf(row)) === last);
}

/**
 * Week a snapshot belongs to: the one containing its most recent row.
 *
 * `lastClosedWeek` only accepts a week once it reaches Friday, which is right
 * for rows that accumulate through the week and wrong for a backlog counted in
 * one go. The requests snapshot carries a single date, the Monday the extract
 * was taken, so the closed-week rule steps back to the previous week and finds
 * nothing at all — the page renders zeros instead of the figures the report is
 * about.
 */
export function snapshotWeek<T>(
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

  const start = mondayOf(last);

  return { start, end: addDays(start, 6) };
}

/** True when a dated row falls inside the window. */
export function inWeek(
  cell: InformaticaDateCell,
  window: WeekWindow | null
): boolean {
  if (window === null) {
    return false;
  }

  const day = isoDay(cell);

  return day !== null && day >= window.start && day <= window.end;
}

/**
 * Latest month the extract reports, including the one still in progress.
 *
 * A weekly extract is cut mid-month — 2026-09-15 still sits inside September —
 * and that in-flight month is what 2.1.1 already publishes as "Sep 26". Waiting
 * for the last calendar day hid September on Top Ten, surveys, work orders,
 * appointments and IMACs, so those slides read as if the week had not happened.
 *
 * Months after the cut stay out: comparativas can carry a relative "Mes Actual"
 * that the operational sheets have not reached yet. Falls back to the latest
 * month when no dated sheet says where the data stops.
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
    const cut = isoCut(end);

    if (cut === null) {
      return null;
    }

    const endMonth = `${cut.slice(0, 4)}/${cut.slice(5, 7)}`;

    for (let index = ordered.length - 1; index >= 0; index -= 1) {
      if (ordered[index] <= endMonth) {
        return ordered[index];
      }
    }

    return null;
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
    rows.map(monthOf).filter(month => month !== ""),
    coverageEnd(dataset)
  );
}

/**
 * Ordered months a monthly visual may show.
 *
 * The final month is the same one `reportMonth` uses for KPIs, so chart axes,
 * rankings and headline figures cannot disagree about whether the extract's
 * in-flight month belongs in the report.
 */
export function reportMonths<T>(
  dataset: InformaticaDataset,
  rows: T[],
  monthOf: (row: T) => string
): string[] {
  const months = uniqueSorted(rows.map(monthOf));
  const closed = reportMonth(dataset, rows, monthOf);

  return closed === null ? [] : months.filter(month => month <= closed);
}

/**
 * Published total of one frozen series, by month.
 *
 * Empty when the history has not been loaded, which makes the caller fall back
 * to what it can compute — a chart missing its oldest bars is a smaller failure
 * than one that silently swaps definitions halfway through.
 */
export function historicoByMonth(
  dataset: InformaticaDataset,
  serie: string
): Map<string, number> {
  const totals = new Map<string, number>();

  for (const row of dataset.historico ?? []) {
    if (row.serie !== serie || row.mes === "") {
      continue;
    }

    totals.set(row.mes, (totals.get(row.mes) ?? 0) + row.total);
  }

  return totals;
}

/**
 * The figure to publish for a month: the frozen one while it is authoritative
 * for that series, the computed one after.
 *
 * The boundary is a property of the sources, not of the chart, so every page
 * that mixes both must resolve it the same way or two slides will disagree
 * about the same month.
 */
export function publishedTotal(
  serie: string,
  month: string,
  frozen: Map<string, number>,
  computed: number
): number {
  const until = INFORMATICA_HISTORICO_UNTIL[serie];

  if (until === undefined || month > until) {
    return computed;
  }

  return frozen.get(month) ?? computed;
}

/**
 * Monthly totals of a series as the report publishes them.
 *
 * The extract decides which months exist; the frozen copy only fills the ones
 * it still outranks. That is the rule that keeps a yearly chart honest in both
 * directions: a year the extract covers gets completed with the months it
 * cannot reach, and a year nobody is extracting any more does not reappear on
 * the slide because the history table happens to remember it.
 */
export function publishedMonthlyTotals<T>(
  dataset: InformaticaDataset,
  serie: string,
  rows: T[],
  monthOf: (row: T) => string,
  valueOf: (row: T) => number
): { mes: string; total: number }[] {
  const computed = new Map<string, number>();

  for (const row of rows) {
    const month = monthOf(row);

    if (month === "") {
      continue;
    }

    computed.set(month, (computed.get(month) ?? 0) + valueOf(row));
  }

  const frozen = historicoByMonth(dataset, serie);
  const until = INFORMATICA_HISTORICO_UNTIL[serie];
  const years = new Set(Array.from(computed.keys(), month => month.slice(0, 4)));
  const months = new Set(computed.keys());

  if (until !== undefined) {
    for (const month of Array.from(frozen.keys())) {
      if (month <= until && years.has(month.slice(0, 4))) {
        months.add(month);
      }
    }
  }

  return Array.from(months)
    .sort()
    .map(mes => ({
      mes,
      total: publishedTotal(serie, mes, frozen, computed.get(mes) ?? 0),
    }));
}

/**
 * The `count` calendar months ending at `month`, oldest first.
 *
 * Built from the calendar rather than filtered out of the data, so a month
 * nobody reported on still gets its slot instead of collapsing the axis: the
 * reference chart is a fixed window, and a missing month there means zero, not
 * "skip to the next one". It also drops the residual months the extracts drag
 * behind them — a handful of orders from 2024 that the original report never
 * showed and that flatten every real bar when they are plotted.
 */
export function monthsEndingAt(month: string, count: number): string[] {
  const months: string[] = [];
  let year = yearOf(month);
  let index = monthIndexOf(month);

  if (!Number.isFinite(year) || !Number.isFinite(index) || index < 1) {
    return [];
  }

  for (let step = 0; step < count; step += 1) {
    months.push(`${year}/${String(index).padStart(2, "0")}`);

    index -= 1;

    if (index === 0) {
      index = 12;
      year -= 1;
    }
  }

  return months.reverse();
}

/** The `count` highest entries of a total map, ties broken by label. */
export function topEntries(
  totals: Map<string, number>,
  count: number
): { label: string; value: number }[] {
  return Array.from(totals.entries())
    .map(([label, value]) => ({ label, value }))
    .filter(entry => entry.value > 0)
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "es"))
    .slice(0, count);
}

export function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(value => value !== ""))).sort(
    (a, b) => a.localeCompare(b, "es")
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
    options?.columns ?? uniqueSorted(source.map(row => columnOf(row)));
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
    options?.rowOrder ??
    Array.from(byRow.keys()).sort((a, b) => a.localeCompare(b, "es"));

  const rows: MatrixRow[] = order
    .filter(label => byRow.has(label))
    .map(label => ({ label, values: byRow.get(label) ?? [] }));

  return { columns, rows };
}

/**
 * Puts the columns the report expects first, in its own order, and appends any
 * other value found in the workbook instead of dropping it.
 */
export function orderColumns(found: string[], preferred: string[]): string[] {
  return [
    ...preferred.filter(column => found.includes(column)),
    ...found.filter(column => !preferred.includes(column)),
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

/* -------------------------------------------------------------------------- */
/* 2.1.3 Top Ten                                                               */
/* -------------------------------------------------------------------------- */

/** Rows kept per view, ranked by the latest reported month. */
const TOP_TEN = 10;

/** Detail tables of the 2.1.3 slide, in the order the page prints them. */
const TOP_TEN_DETAILS = ["Portátil", "Software", "Sistema Operativo"] as const;

export interface TopTenView {
  view: string;
  label: string;
  rows: MatrixRow[];
}

/**
 * Matrices of the 2.1.3 slide: components for the chart, then the three
 * detail tables.
 *
 * Ranking uses the latest reported month, the same one the rest of the 2.1
 * block publishes, including the month still in progress. When that month has
 * no positive totals the window as a whole is the fallback.
 */
export function topTenComparison(dataset: InformaticaDataset): {
  columns: string[];
  components: TopTenView | undefined;
  details: TopTenView[];
} {
  const rows = dataset.comparativas ?? [];
  const views = comparativaViews(rows);
  const months = reportMonths(dataset, rows, row => row.mes);
  const columns = months.map(monthLabel);
  const ranked = reportMonth(dataset, rows, row => row.mes);

  const tables: TopTenView[] = views.map(({ view, label }) => {
    const viewRows = rows.filter(
      row => row.vista === view && months.includes(row.mes)
    );
    const ranking = topEntries(
      sumBy(
        viewRows.filter(row => row.mes === ranked),
        row => row.elemento,
        row => row.total
      ),
      TOP_TEN
    ).map(entry => entry.label);
    const order =
      ranking.length > 0
        ? ranking
        : topEntries(
            sumBy(viewRows, row => row.elemento, row => row.total),
            TOP_TEN
          ).map(entry => entry.label);
    const matrix = pivot(
      viewRows,
      row => row.elemento,
      row => row.mes,
      row => row.total,
      { columns: months, rowOrder: order }
    );

    return { view, label, rows: matrix.rows };
  });

  return {
    columns,
    components: tables.find(table => table.label === "Componentes"),
    details: TOP_TEN_DETAILS.map(label =>
      tables.find(table => table.label === label)
    ).filter((table): table is TopTenView => Boolean(table)),
  };
}

/**
 * Grouped-bar data for a yearly comparison: twelve month rows, one series per
 * year, plus the yearly totals used by the KPI strip next to the chart.
 */
export function yearlyComparison<T>(
  source: T[],
  monthOf: (row: T) => string,
  valueOf: (row: T) => number,
  options?: { throughMonth?: number }
): {
  years: number[];
  data: Record<string, number | string>[];
  totals: Map<number, number>;
} {
  const years = Array.from(new Set(source.map(row => yearOf(monthOf(row)))))
    .filter(year => Number.isFinite(year))
    .sort((a, b) => a - b);

  const totals = new Map<number, number>();
  const byYearMonth = new Map<string, number>();

  for (const row of source) {
    const month = monthOf(row);
    const year = yearOf(month);
    const index = monthIndexOf(month);

    if (
      !Number.isFinite(year) ||
      !Number.isFinite(index) ||
      (options?.throughMonth !== undefined && index > options.throughMonth)
    ) {
      continue;
    }

    const key = `${year}:${index}`;
    byYearMonth.set(key, (byYearMonth.get(key) ?? 0) + valueOf(row));
    totals.set(year, (totals.get(year) ?? 0) + valueOf(row));
  }

  const labels =
    options?.throughMonth === undefined
      ? MONTH_LABELS
      : MONTH_LABELS.slice(0, options.throughMonth);
  const data = labels.map((label, position) => {
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
