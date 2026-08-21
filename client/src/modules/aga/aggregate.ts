import type { AgaCount, AgaDataset, AgaWeekAggregate } from "@shared/modules/aga/types";
import { agaWeekLabel } from "@shared/modules/aga/calendar";

/**
 * Aggregation helpers for the AGA dataset.
 *
 * The server already stores one aggregate per week, so nothing here recomputes
 * counts: these helpers only pick the weeks a page charts, turn the breakdowns
 * into the row shape `CategoryBarChart` expects, and format the labels.
 */

/**
 * Regional support, excluded from the department charts.
 *
 * It holds around 85% of the positions (671 of 806 in week 33), so leaving it in
 * flattens every other department to an unreadable sliver. The original PPTX
 * takes it out of the charts for the same reason; the total page still counts
 * it, because it is part of the reported volume.
 */
export const EXCLUDED_DEPARTMENT = "Soporte Técnico";

/**
 * Axis label under the AGA convention: the extraction Monday names the
 * completed week immediately before it. An optional stored number wins, while
 * legacy datasets fall back to the calendar rule.
 *
 * The report uses AGA's completed-week number ("33 semana GPS"), and the short
 * form is what fits a ten-column axis. A date that cannot be parsed falls back
 * to itself rather than disappearing.
 */
export function weekLabel(date: string, reportWeek?: number | null): string {
  return agaWeekLabel(date, reportWeek);
}

/** The last `count` weeks of the history, still ascending by date. */
export function lastWeeks(dataset: AgaDataset, count: number): AgaWeekAggregate[] {
  const weeks = dataset.weeks ?? [];

  return count >= weeks.length ? weeks : weeks.slice(weeks.length - count);
}

/** The penultimate and the last week, the pair every comparison page charts. */
export function comparedWeeks(
  dataset: AgaDataset
): { previous: AgaWeekAggregate | null; current: AgaWeekAggregate | null } {
  const weeks = dataset.weeks ?? [];

  return {
    previous: weeks.length >= 2 ? weeks[weeks.length - 2] : null,
    current: weeks.length >= 1 ? weeks[weeks.length - 1] : null,
  };
}

/** Signed variation of the last week over the previous one, e.g. `+5%`. */
export function variationLabel(previous: number | null, current: number | null): string {
  if (previous === null || current === null || previous === 0) {
    return "—";
  }

  const percent = ((current - previous) / previous) * 100;
  const sign = percent > 0 ? "+" : "";

  return `${sign}${percent.toFixed(1).replace(".", ",")}%`;
}

/** Breakdown without the regional support desks. */
export function withoutSupport(counts: AgaCount[]): AgaCount[] {
  return counts.filter((entry) => entry.label !== EXCLUDED_DEPARTMENT);
}

/** Lookup of a breakdown by label, so a missing category reads as zero. */
export function countsByLabel(counts: AgaCount[]): Map<string, number> {
  return new Map(counts.map((entry) => [entry.label, entry.count]));
}

/**
 * Labels of a set of breakdowns, ordered by their total across all of them.
 *
 * Ordering by the whole period rather than by the last week keeps the series
 * order stable from one upload to the next, which matters for the stacked
 * chart: a series that swaps position between weeks reads as a different one.
 */
export function orderedLabels(breakdowns: AgaCount[][]): string[] {
  const totals = new Map<string, number>();

  for (const counts of breakdowns) {
    for (const entry of counts) {
      totals.set(entry.label, (totals.get(entry.label) ?? 0) + entry.count);
    }
  }

  return Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))
    .map(([label]) => label);
}

/**
 * Palette of the AGA charts.
 *
 * The department pages carry up to ten series, more than the four the AV deck
 * needs, so the two token families already defined in `index.css` are chained
 * and ordered to alternate hue and lightness — adjacent stack segments have to
 * be told apart at a glance.
 */
export const AGA_SERIES_COLORS = [
  "var(--informe-serie-1)",
  "var(--informe-serie-4)",
  "var(--informe-serie-3)",
  "var(--chart-5)",
  "var(--informe-serie-2)",
  "var(--chart-3)",
  "var(--chart-2)",
  "var(--chart-4)",
  "var(--chart-1)",
];

export function agaColor(index: number): string {
  return AGA_SERIES_COLORS[index % AGA_SERIES_COLORS.length];
}

/** Colours of the two-week comparison pages: previous muted, current dominant. */
export const COMPARE_COLORS = ["var(--informe-serie-2)", "var(--informe-serie-4)"];
