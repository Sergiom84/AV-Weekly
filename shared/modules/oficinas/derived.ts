import type {
  OficinasDataset,
  OficinasElementRow,
  OficinasIncidencias,
  OficinasMasters,
  OficinasRecicladores,
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
  return Array.from(new Set((values ?? []).map(entry => entry.year))).sort(
    (a, b) => a - b
  );
}

/** The most recent year of a series, or `null` when it is empty. */
export function latestYear(
  values: OficinasWeekValue[] | undefined
): number | null {
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
      (values ?? [])
        .filter(entry => entry.year === year)
        .map(entry => entry.week)
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
    (values ?? []).find(entry => entry.year === year && entry.week === week)
      ?.value ?? 0
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

  return Array.from(weeks)
    .sort((a, b) => a - b)
    .slice(-size);
}

/** The values of a row over the given weeks, zero-filled, in week order. */
export function rowOverWeeks(
  row: { values: OficinasWeekValue[] } | undefined,
  year: number,
  weeks: number[]
): number[] {
  return weeks.map(week => valueAt(row?.values, year, week));
}

/**
 * A set of labelled rows collapsed into one weekly series, summed per year and
 * week and sorted.
 *
 * What the annual comparison chart needs from a section that publishes no total
 * sheet of its own: recyclers keep their past years as two separate directorate
 * matrices (`byDT` carries 2024 and the current year, `byDTPrevious` carries
 * 2025), and a chart cannot draw a matrix.
 */
export function weeklyTotals(
  rows: { values: OficinasWeekValue[] }[]
): OficinasWeekValue[] {
  const totals = new Map<string, OficinasWeekValue>();

  for (const row of rows) {
    for (const entry of row.values) {
      const key = `${entry.year}:${entry.week}`;
      const current = totals.get(key);

      if (current) {
        current.value += entry.value;
      } else {
        totals.set(key, { ...entry });
      }
    }
  }

  return Array.from(totals.values()).sort(
    (a, b) => a.year - b.year || a.week - b.week
  );
}

/**
 * The recycler weekly series across every year the dataset holds.
 *
 * Both matrices are read because the year, not the field, is what separates
 * them: the template writes the current year into `byDT` and the previous one
 * into `byDTPrevious`, and the historico seed added 2024 to `byDT`.
 *
 * `byDT` wins a year both carry, and that year is then skipped rather than
 * added: the two fields hold the same measure, so folding them together would
 * double a week instead of completing it.
 */
export function recicladoresSeries(
  section: OficinasRecicladores | undefined
): OficinasWeekValue[] {
  const current = weeklyTotals(section?.byDT ?? []);
  const years = new Set(current.map(entry => entry.year));
  const previous = weeklyTotals(section?.byDTPrevious ?? []).filter(
    entry => !years.has(entry.year)
  );

  return [...current, ...previous].sort(
    (a, b) => a.year - b.year || a.week - b.week
  );
}

/** Column totals of a set of rows over the given weeks. */
export function columnTotals(
  rows: { values: OficinasWeekValue[] }[],
  year: number,
  weeks: number[]
): number[] {
  return weeks.map(week =>
    rows.reduce((sum, row) => sum + valueAt(row.values, year, week), 0)
  );
}

/** Sum of a row across one year, i.e. the "Total" column of the pivot. */
export function rowTotal(
  row: { values: OficinasWeekValue[] } | undefined,
  year: number,
  throughWeek?: number
): number {
  return (row?.values ?? [])
    .filter(
      entry =>
        entry.year === year &&
        (throughWeek === undefined || entry.week <= throughWeek)
    )
    .reduce((sum, entry) => sum + entry.value, 0);
}

/**
 * Latest week reported by every available current-year section.
 *
 * The weekly file is prepared during the following week: assigned, resolved
 * and recyclers already contain a partial next column while requests still end
 * at the closed week. Their latest common week is therefore the report period,
 * and also prevents a previous-year comparison extending the current deck to
 * week 52 with zeroes.
 */
export function reportWeek(
  dataset: OficinasDataset | null,
  year: number
): number | null {
  if (!dataset) {
    return null;
  }

  const series: OficinasWeekValue[][] = [
    dataset.asignadas?.totalsByWeek ?? [],
    dataset.resueltas?.totalsByWeek ?? [],
    dataset.peticiones?.totalsByWeek ?? [],
    (dataset.recicladores?.byDT ?? []).flatMap(row => row.values),
  ]
    .map(values => values.filter(entry => entry.year === year))
    .filter(values => values.length > 0);

  if (series.length === 0) {
    return null;
  }

  const common = new Set(series[0].map(entry => entry.week));

  for (const values of series.slice(1)) {
    const weeks = new Set(values.map(entry => entry.week));

    for (const week of Array.from(common)) {
      if (!weeks.has(week)) {
        common.delete(week);
      }
    }
  }

  const weeks = Array.from(common).sort((a, b) => a - b);

  return weeks[weeks.length - 1] ?? null;
}

/** Cover label for an ISO report week, e.g. `Agosto 2026 - Semana 33`. */
export function reportPeriod(year: number, week: number): string {
  const januaryFourth = new Date(Date.UTC(year, 0, 4));
  const weekday = (januaryFourth.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(year, 0, 4 - weekday + (week - 1) * 7));
  const month = new Intl.DateTimeFormat("es-ES", {
    month: "long",
    timeZone: "UTC",
  }).format(monday);

  return `${month.charAt(0).toUpperCase()}${month.slice(1)} ${year} - Semana ${week}`;
}

/* -------------------------------------------------------------------------- */
/* Matrices                                                                    */
/* -------------------------------------------------------------------------- */

/** One of the three validator variants of an incident section. */
export function dtMatrix(
  section: OficinasIncidencias | undefined,
  variant: OficinasValidadoras
): OficinasRow[] {
  return section?.byDT.find(matrix => matrix.variant === variant)?.rows ?? [];
}

/**
 * The past-year series a variant may be charted against, or an empty series
 * when the sources carry no comparable year for it.
 *
 * Comparability is a question about scope, not about availability: the deck has
 * four years of weekly totals for assigned and resolved incidents, but they were
 * not all measured the same way. `totalsByWeek` is the template's own total
 * sheet and counts the validators; `history` is the manual historico, which
 * counts them out. Drawing one against the other puts two different populations
 * on the same axis and inflates every year-on-year variation the slide prints.
 *
 * So a variant is offered exactly the years measured at its own scope: the
 * total sheet plus whatever the historico tagged "con" for the "con" variant,
 * and only the historico for the other two. Today that means the published
 * "sin validadoras" slide is the one with the comparison, and "solo
 * validadoras" has none.
 *
 * `totalsByWeek` comes first so it wins `valueAt` if the historico ever ships a
 * "con" year the template already reports: the template is the published source.
 */
export function comparisonSeries(
  section: OficinasIncidencias | undefined,
  variant: OficinasValidadoras
): OficinasWeekValue[] {
  const history =
    section?.history?.find(entry => entry.variant === variant)?.values ?? [];

  return variant === "con"
    ? [...(section?.totalsByWeek ?? []), ...history]
    : history;
}

/** The element rows of a component, in source order. */
export function elementsOf(
  rows: OficinasElementRow[] | undefined,
  componente: string
): OficinasElementRow[] {
  return (rows ?? []).filter(row => row.componente === componente);
}

/** The components of an element matrix, in first-appearance order. */
export function componentsOf(rows: OficinasElementRow[] | undefined): string[] {
  return Array.from(new Set((rows ?? []).map(row => row.componente)));
}

/** Rows sorted by their year total, descending. Ties fall back to the label. */
export function rankedRows<T extends OficinasRow>(
  rows: T[],
  year: number,
  throughWeek?: number
): T[] {
  return [...rows].sort(
    (a, b) =>
      rowTotal(b, year, throughWeek) - rowTotal(a, year, throughWeek) ||
      a.label.localeCompare(b.label, "es")
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
  const entries = rows.map(row => ({
    label: row.label,
    value: valueAt(row.values, year, week),
  }));
  const total = entries.reduce((sum, entry) => sum + entry.value, 0);

  return entries.map(entry => ({
    ...entry,
    share: total === 0 ? 0 : entry.value / total,
  }));
}

/* -------------------------------------------------------------------------- */
/* Offices                                                                     */
/* -------------------------------------------------------------------------- */

/** Offices of a directorate, or 0 when the master has not been seeded. */
export function officesOf(
  masters: OficinasMasters | undefined,
  dt: string
): number {
  return masters?.dtOffices.find(entry => entry.dt === dt)?.offices ?? 0;
}

/** Total offices across every directorate of the master. */
export function totalOffices(masters: OficinasMasters | undefined): number {
  return (masters?.dtOffices ?? []).reduce(
    (sum, entry) => sum + entry.offices,
    0
  );
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
  return rows.map(row => {
    const total = weeks.reduce(
      (sum, week) => sum + valueAt(row.values, year, week),
      0
    );
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
  const currentTotal = current.reduce(
    (sum, row) => sum + valueAt(row.values, year, week),
    0
  );
  const previousYear = year - 1;
  const reported = previous.some(row =>
    row.values.some(entry => entry.year === previousYear && entry.week === week)
  );
  const previousTotal = reported
    ? previous.reduce(
        (sum, row) => sum + valueAt(row.values, previousYear, week),
        0
      )
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
    month => month[field] !== null && month.encuestas > 0
  );

  if (months.length === 0) {
    return null;
  }

  const responses = months.reduce((sum, month) => sum + month.encuestas, 0);

  if (responses === 0) {
    return null;
  }

  return (
    months.reduce(
      (sum, month) => sum + (month[field] as number) * month.encuestas,
      0
    ) / responses
  );
}

/** Total surveys behind a score distribution. */
export function distributionTotal(counts: number[] | undefined): number {
  return (counts ?? []).reduce((sum, count) => sum + count, 0);
}
