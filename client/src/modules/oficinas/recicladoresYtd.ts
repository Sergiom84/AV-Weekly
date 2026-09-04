import {
  rankedRows,
  rowTotal,
  seriesWeeks,
} from "@shared/modules/oficinas/derived";
import type {
  OficinasRow,
  OficinasWeekValue,
} from "@shared/modules/oficinas/types";

export interface RecicladoresYtd {
  /** Elements ranked by their accumulated total, highest first. */
  entries: { label: string; imported: number }[];
  /** Sum of `entries`. */
  total: number;
  /**
   * Same accumulation for the previous year, or `null` when that year reported
   * none of the weeks in range.
   */
  previous: number | null;
}

/**
 * The year-to-date reading of the recycler element pivot, cut at the reported
 * week on both years.
 *
 * The cut is the whole point. Thirty-five weeks of the current year against a
 * complete previous one would print a drop of a third that describes the
 * calendar and not the service, and it is the kind of figure that survives into
 * a slide because it looks plausible.
 *
 * The previous year is summed from the weeks it actually reported, never from
 * an assumed 1-to-N range: its source sheet jumps from week 1 to week 21, so
 * the missing weeks are unmeasured, not empty. When none of them falls in range
 * the result is `null` rather than a zero, which the cards print as an em dash
 * instead of claiming a year that reported nothing.
 */
export function recicladoresYtd(
  rows: OficinasRow[],
  comparison: OficinasWeekValue[],
  year: number,
  throughWeek: number | null
): RecicladoresYtd {
  const through = throughWeek ?? undefined;
  const entries = rankedRows(rows, year, through).map((row) => ({
    label: row.label,
    imported: rowTotal(row, year, through),
  }));
  const total = entries.reduce((sum, entry) => sum + entry.imported, 0);

  const previousYear = year - 1;
  const reported = new Set(
    seriesWeeks(comparison, previousYear).filter(
      (week) => through === undefined || week <= through
    )
  );
  const previous =
    reported.size === 0
      ? null
      : comparison
          .filter(
            (entry) => entry.year === previousYear && reported.has(entry.week)
          )
          .reduce((sum, entry) => sum + entry.value, 0);

  return { entries, total, previous };
}
