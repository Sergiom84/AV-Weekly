import type {
  OficinasDataset,
  OficinasElementRow,
  OficinasIncidencias,
  OficinasMasters,
  OficinasRow,
  OficinasValidadoras,
  OficinasWeekValue,
} from "./types.ts";

/**
 * Readers of the Oficinas dataset.
 *
 * Everything the deck writes next to a chart is derived here, from the same
 * series the chart draws: the ratio per office, the weekly average, the trailing
 * window and the year-on-year sentence. None of them are stored.
 *
 * The reason is the same as in the AGA module: the published pptx carries those
 * figures as typed text, and a number typed beside a chart disagrees with the
 * chart the first time a week is corrected. Derived, it cannot.
 */

/* -------------------------------------------------------------------------- */
/* Weekly series                                                               */
/* -------------------------------------------------------------------------- */

/** The years present in a series, ascending. */
export function seriesYears(values: OficinasWeekValue[] | undefined): number[] {
  return Array.from(new Set((values ?? []).map((entry) => entry.year))).sort(
    (a, b) => a - b
  );
}

/** The most recent year of a series, or `null` when it is empty. */
export function latestYear(values: OficinasWeekValue[] | undefined): number | null {
  const years = seriesYears(values);

  return years.length === 0 ? null : years[years.length - 1];
}

/** The weeks a series reports on for one year, ascending and deduplicated. */
export function seriesWeeks(
  values: OficinasWeekValue[] | undefined,
  year: number
): number[] {
  return Array.from(
    new Set(
      (values ?? []).filter((entry) => entry.year === year).map((entry) => entry.week)
    )
  ).sort((a, b) => a - b);
}

/** Value of one cell, or 0 when the week was not reported. */
export function valueAt(
  values: OficinasWeekValue[] | undefined,
  year: number,
  week: number
): number {
  return (
    (values ?? []).find((entry) => entry.year === year && entry.week === week)?.value ?? 0
  );
}

/**
 * The trailing `size` weeks a set of rows has in common, ascending.
 *
 * Computed against the union of the rows rather than against a fixed range: the
 * matrices grow one column a week, so a hardcoded "28 to 33" goes stale on the
 * next upload. Six is the window the presented deck draws.
 */
export function lastWeeks(
  rows: { values: OficinasWeekValue[] }[],
  year: number,
  size = 6
): number[] {
  const weeks = new Set<number>();

  for (const row of rows) {
    for (const week of seriesWeeks(row.values, year)) {
      weeks.add(week);
    }
  }

  return Array.from(weeks).sort((a, b) => a - b).slice(-size);
}

/** The values of a row over the given weeks, zero-filled, in week order. */
export function rowOverWeeks(
  row: { values: OficinasWeekValue[] } | undefined,
  year: number,
  weeks: number[]
): number[] {
  return weeks.map((week) => valueAt(row?.values, year, week));
}

/** Column totals of a set of rows over the given weeks. */
export function columnTotals(
  rows: { values: OficinasWeekValue[] }[],
  year: number,
  weeks: number[]
): number[] {
  return weeks.map((week) =>
    rows.reduce((sum, row) => sum + valueAt(row.values, year, week), 0)
  );
}

/** Sum of a row across one year, i.e. the "Total" column of the pivot. */
export function rowTotal(
  row: { values: OficinasWeekValue[] } | undefined,
  year: number
): number {
  return (row?.values ?? [])
    .filter((entry) => entry.year === year)
    .reduce((sum, entry) => sum + entry.value, 0);
}

/* -------------------------------------------------------------------------- */
/* Matrices                                                                    */
/* -------------------------------------------------------------------------- */

/** One of the three validator variants of an incident section. */
export function dtMatrix(
  section: OficinasIncidencias | undefined,
  variant: OficinasValidadoras
): OficinasRow[] {
  return section?.byDT.find((matrix) => matrix.variant === variant)?.rows ?? [];
}

/** The element rows of a component, in source order. */
export function elementsOf(
  rows: OficinasElementRow[] | undefined,
  componente: string
): OficinasElementRow[] {
  return (rows ?? []).filter((row) => row.componente === componente);
}

/** The components of an element matrix, in first-appearance order. */
export function componentsOf(rows: OficinasElementRow[] | undefined): string[] {
  return Array.from(new Set((rows ?? []).map((row) => row.componente)));
}

/** Rows sorted by their year total, descending. Ties fall back to the label. */
export function rankedRows<T extends OficinasRow>(rows: T[], year: number): T[] {
  return [...rows].sort(
    (a, b) => rowTotal(b, year) - rowTotal(a, year) || a.label.localeCompare(b.label, "es")
  );
}

/**
 * Share of each row in a week, recomputed rather than read.
 *
 * Sheets 14 and 17 ship the percentage inside the cell text (`"49 (39%)"`), but
 * only the count is stored. The denominator here is the sum of the reported
 * rows, which is what the pivot's own percentage uses.
 */
export function weekShares(
  rows: OficinasRow[],
  year: number,
  week: number
): { label: string; value: number; share: number }[] {
  const entries = rows.map((row) => ({
    label: row.label,
    value: valueAt(row.values, year, week),
  }));
  const total = entries.reduce((sum, entry) => sum + entry.value, 0);

  return entries.map((entry) => ({
    ...entry,
    share: total === 0 ? 0 : entry.value / total,
  }));
}

/* -------------------------------------------------------------------------- */
/* Offices                                                                     */
/* -------------------------------------------------------------------------- */

/** Offices of a directorate, or 0 when the master has not been seeded. */
export function officesOf(masters: OficinasMasters | undefined, dt: string): number {
  return masters?.dtOffices.find((entry) => entry.dt === dt)?.offices ?? 0;
}

/** Total offices across every directorate of the master. */
export function totalOffices(masters: OficinasMasters | undefined): number {
  return (masters?.dtOffices ?? []).reduce((sum, entry) => sum + entry.offices, 0);
}

/**
 * The two figures the deck prints beside each DT row.
 *
 * - `ratio`: incidents per office over the whole year, `total / offices`. It is
 *   the comparable measure between directorates, since Cataluña has four times
 *   the offices of Canarias.
 * - `average`: incidents per week, `total / weeks elapsed`. The denominator is
 *   the number of weeks the series actually reports, not 52: dividing a
 *   thirty-four-week year by a full year understates every directorate.
 *
 * `ratio` is `null` rather than 0 when the master has not been seeded, so the
 * page can leave the column blank instead of publishing a zero that reads as
 * "no incidents".
 */
export interface OficinasDTStats {
  dt: string;
  total: number;
  offices: number;
  ratio: number | null;
  weeks: number;
  average: number;
}

export function dtStats(
  rows: OficinasRow[],
  year: number,
  masters: OficinasMasters | undefined,
  /** Weeks to count. Defaults to every completed week the rows report. */
  weeks: number[] = completedWeeks(rows, year)
): OficinasDTStats[] {
  return rows.map((row) => {
    const total = weeks.reduce((sum, week) => sum + valueAt(row.values, year, week), 0);
    const offices = officesOf(masters, row.label);

    return {
      dt: row.label,
      total,
      offices,
      ratio: offices === 0 ? null : total / offices,
      weeks: weeks.length,
      average: weeks.length === 0 ? 0 : total / weeks.length,
    };
  });
}

/**
 * Every reported week except the last one.
 *
 * The template is exported mid-week, so its final column is a partial week —
 * week 34 of the verified workbook carries 40 assignments against a run rate
 * around 130. Counting it drags the weekly average down and the published deck
 * does not: the ratio it prints for D.T. SUR (2,87 per office, 28,00 per week)
 * is reproduced by weeks 1 to 33 of the "con validadoras" matrix and by no other
 * combination. So the incomplete week is excluded from the two aggregate figures
 * and still drawn in the charts, which is where a partial week is informative.
 */
export function completedWeeks(
  rows: { values: OficinasWeekValue[] }[],
  year: number
): number[] {
  const weeks = lastWeeks(rows, year, Number.MAX_SAFE_INTEGER);

  return weeks.slice(0, -1);
}

/* -------------------------------------------------------------------------- */
/* Year on year                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The year-on-year headline of a week: "semana N: X frente a Y del año
 * anterior".
 *
 * `delta` is `null` when the previous year did not report the week, which is
 * the normal case for the recycler comparison: its previous-year sheet jumps
 * from week 1 to week 21, and a division by a week that was never measured
 * would invent a variation.
 */
export interface OficinasYearOnYear {
  week: number;
  year: number;
  current: number;
  previous: number | null;
  delta: number | null;
}

export function yearOnYear(
  current: OficinasRow[],
  previous: OficinasRow[],
  year: number,
  week: number
): OficinasYearOnYear {
  const currentTotal = current.reduce((sum, row) => sum + valueAt(row.values, year, week), 0);
  const previousYear = year - 1;
  const reported = previous.some((row) =>
    row.values.some((entry) => entry.year === previousYear && entry.week === week)
  );
  const previousTotal = reported
    ? previous.reduce((sum, row) => sum + valueAt(row.values, previousYear, week), 0)
    : null;

  return {
    week,
    year,
    current: currentTotal,
    previous: previousTotal,
    delta:
      previousTotal === null || previousTotal === 0
        ? null
        : (currentTotal - previousTotal) / previousTotal,
  };
}

/* -------------------------------------------------------------------------- */
/* Surveys                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Weighted mean of a survey score across every reported month.
 *
 * Weighted by the number of surveys, not a mean of the monthly means: a month
 * with four responses must not weigh the same as one with a hundred and
 * fourteen.
 */
export function surveyAverage(
  dataset: OficinasDataset | null,
  field: "global" | "apertura" | "resolucion"
): number | null {
  const months = (dataset?.encuestas?.porMes ?? []).filter(
    (month) => month[field] !== null && month.encuestas > 0
  );

  if (months.length === 0) {
    return null;
  }

  const responses = months.reduce((sum, month) => sum + month.encuestas, 0);

  if (responses === 0) {
    return null;
  }

  return (
    months.reduce((sum, month) => sum + (month[field] as number) * month.encuestas, 0) /
    responses
  );
}

/** Total surveys behind a score distribution. */
export function distributionTotal(counts: number[] | undefined): number {
  return (counts ?? []).reduce((sum, count) => sum + count, 0);
}
