import type {
  AgaBreakdownRow,
  AgaManagedSection,
  AgaWeekCount,
} from "./types.ts";

/**
 * Readers of the managed-positions section (slides 2.1 to 2.7).
 *
 * The headline figures of those slides are NOT stored. The presented deck
 * carries them as typed sentences ("desciende en un 30,6%"), and a percentage
 * pasted next to a chart drifts from the chart the first time the data is
 * corrected. They are derived here instead, from the same series the chart
 * draws, so the sentence cannot disagree with the bars above it.
 */

/** The weeks the section reports on, ascending. */
export function managedWeeks(section: AgaManagedSection | undefined): string[] {
  return (section?.weeklyTotals ?? []).map(entry => entry.week);
}

/** The last two weeks of the section, oldest first. Fewer when there are fewer. */
export function lastTwoWeeks(section: AgaManagedSection | undefined): string[] {
  return managedWeeks(section).slice(-2);
}

function countAt(counts: AgaWeekCount[], week: string): number {
  return counts.find(entry => entry.week === week)?.count ?? 0;
}

/**
 * Bars the product charts draw.
 *
 * The published deck showed twelve, and the responsible's own note asks for a
 * maximum of fifteen. Fifteen is kept because the cut now happens here: it
 * decides how many bars are drawn, not which rows survive the import, so
 * raising or lowering it never destroys a comparison.
 */
export const AGA_PRODUCT_CHART_ROWS = 15;

/**
 * The rows of a breakdown restricted to the given weeks, descending by the
 * count of the last one — the order the deck draws them in.
 *
 * Rows that are zero across every requested week are dropped: they are labels
 * of another week, not bars of this one.
 *
 * `limit` keeps the top rows of the LAST requested week, which is the whole
 * reason the cut lives here and not in the importers. A product breakdown
 * carries some sixty products a week, and the slide draws fifteen; truncating
 * on the way in stores the top fifteen of each week separately, so a product
 * that reaches the top this week but not last week loses its previous-week
 * value and is charted as a zero it never had. Cutting after the weeks are
 * joined keeps every real figure behind the bars that are drawn.
 */
export function breakdownForWeeks(
  rows: AgaBreakdownRow[] | undefined,
  weeks: string[],
  limit?: number
): { label: string; counts: number[] }[] {
  const ordered = (rows ?? [])
    .map(row => ({
      label: row.label,
      counts: weeks.map(week => countAt(row.counts, week)),
    }))
    .filter(row => row.counts.some(count => count > 0))
    .sort(
      (a, b) =>
        b.counts[b.counts.length - 1] - a.counts[a.counts.length - 1] ||
        a.label.localeCompare(b.label, "es")
    );

  return limit && limit > 0 ? ordered.slice(0, limit) : ordered;
}

/**
 * Week-on-week movement of the managed total.
 *
 * Both bases are returned rather than one, because the deck and the arithmetic
 * disagree and the module must not pick a winner silently:
 *
 * - `overPrevious` is the variation as it is normally read, `(actual −
 *   previa) / previa`. For weeks 32 and 33 of 2026 that is −23,5%.
 * - `overCurrent` is `(previa − actual) / actual`, 30,7% for the same pair.
 *
 * The presented slide 2.1 says "desciende en un 30,6%", which neither base
 * reproduces exactly: `overCurrent` lands on 30,67% and only matches once
 * truncated to one decimal, and the responsible's own workbook uses the other
 * base elsewhere. The figure is typed by hand in the pptx and appears in no
 * cell of the source workbook, so it is treated as unverified until the
 * responsible confirms the base.
 */
export interface AgaManagedDelta {
  previousWeek: string;
  currentWeek: string;
  previous: number;
  current: number;
  overPrevious: number;
  overCurrent: number;
}

export function managedWeeklyDelta(
  section: AgaManagedSection | undefined
): AgaManagedDelta | null {
  const totals = section?.weeklyTotals ?? [];

  if (totals.length < 2) {
    return null;
  }

  const previous = totals[totals.length - 2];
  const current = totals[totals.length - 1];

  return {
    previousWeek: previous.week,
    currentWeek: current.week,
    previous: previous.total,
    current: current.total,
    overPrevious:
      previous.total === 0
        ? 0
        : (current.total - previous.total) / previous.total,
    overCurrent:
      current.total === 0
        ? 0
        : (previous.total - current.total) / current.total,
  };
}

/**
 * Share of the busiest location in the last reported week.
 *
 * A complete source supplies `locationTotals`, which is the denominator. The
 * first flat ZPT025 export proves week 33 has 300 located positions: the old
 * manual pivot omitted Asturias and reported 299. Therefore Sede is 175/300 =
 * 58.3%. Legacy datasets without that total fall back to their visible rows
 * and the UI labels the result as a subtotal rather than presenting it as the
 * full week.
 */
export function locationShareAt(
  section: AgaManagedSection | undefined,
  week: string
): {
  label: string;
  count: number;
  total: number;
  drawnTotal: number;
  complete: boolean;
  share: number;
} | null {
  const rows = (section?.byLocation ?? []).map(row => ({
    label: row.label,
    count: countAt(row.counts, week),
  }));

  const drawnTotal = rows.reduce((sum, row) => sum + row.count, 0);
  const declaredTotal = section?.locationTotals?.find(
    entry => entry.week === week
  )?.total;
  const complete =
    typeof declaredTotal === "number" &&
    Number.isFinite(declaredTotal) &&
    declaredTotal >= drawnTotal;
  const total = complete ? declaredTotal : drawnTotal;
  const top = rows.reduce(
    (best, row) => (best === null || row.count > best.count ? row : best),
    null as { label: string; count: number } | null
  );

  if (!top || total === 0) {
    return null;
  }

  return { ...top, total, drawnTotal, complete, share: top.count / total };
}

/** Share of the busiest location in the latest reported week. */
export function topLocationShare(section: AgaManagedSection | undefined): {
  label: string;
  count: number;
  total: number;
  drawnTotal: number;
  complete: boolean;
  share: number;
} | null {
  const week = managedWeeks(section).slice(-1)[0];

  return week ? locationShareAt(section, week) : null;
}

/** Product rows of one of the departments broken out by slides 2.5 to 2.7. */
export function departmentProducts(
  section: AgaManagedSection | undefined,
  department: string
): AgaBreakdownRow[] {
  return (
    (section?.byDepartmentProduct ?? []).find(
      entry => entry.department === department
    )?.rows ?? []
  );
}
