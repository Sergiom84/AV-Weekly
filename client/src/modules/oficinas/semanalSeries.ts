import { seriesWeeks, valueAt } from "@shared/modules/oficinas/derived";
import type {
  OficinasDeckPage,
  OficinasWeekValue,
} from "@shared/modules/oficinas/types";
import { ALL_ISO_WEEKS, yearColor } from "./aggregate";
import {
  TOTAL_ROW,
  cellKey,
  isOverridden,
  overriddenValue,
  weekColumn,
} from "./overrides";

export interface SemanalSeriesCell {
  key: string;
  value: number | null;
  overridden: boolean;
}

export interface SemanalSeriesRow {
  key: string;
  label: string;
  color: string;
  cells: SemanalSeriesCell[];
}

/**
 * Chart series of the annual comparison, with the stored overrides applied.
 *
 * Past years first, so the bars group oldest to newest inside a week and the
 * legend reads in the same order the printed slide does. A week a year never
 * reported stays null: a zero would claim the week was measured and empty.
 */
export function semanalSeriesRows(input: {
  page: OficinasDeckPage;
  year: number;
  extraYears: number[];
  comparison: OficinasWeekValue[] | undefined;
  throughWeek: number | null | undefined;
  currentReported: Set<number>;
  currentAt: (week: number) => number;
  /** When false the current-year line is omitted, same as an unpressed year chip. */
  includeCurrent?: boolean;
}): SemanalSeriesRow[] {
  const {
    page,
    year,
    extraYears,
    comparison,
    throughWeek,
    currentReported,
    currentAt,
    includeCurrent = true,
  } = input;
  const pastYears = extraYears.filter(comparisonYear => comparisonYear !== year);

  return [
    ...pastYears.map(comparisonYear => {
      const reported = new Set(
        comparison ? seriesWeeks(comparison, comparisonYear) : []
      );
      const rowId = `y${comparisonYear}`;

      return {
        key: rowId,
        label: String(comparisonYear),
        color: yearColor(comparisonYear, year),
        cells: ALL_ISO_WEEKS.map(week => {
          const key = cellKey(rowId, weekColumn(week));
          const imported =
            comparison && reported.has(week)
              ? valueAt(comparison, comparisonYear, week)
              : null;

          return {
            key,
            value: overriddenValue(page, key, imported),
            overridden: isOverridden(page, key),
          };
        }),
      };
    }),
    ...(includeCurrent
      ? [
          {
            key: "actual",
            label: String(year),
            color: yearColor(year, year),
            cells: ALL_ISO_WEEKS.map(week => {
              const key = cellKey(TOTAL_ROW, weekColumn(week));
              const closed =
                throughWeek === null || throughWeek === undefined
                  ? true
                  : week <= throughWeek;
              const imported =
                currentReported.has(week) && closed ? currentAt(week) : null;

              return {
                key,
                value: overriddenValue(page, key, imported),
                overridden: isOverridden(page, key),
              };
            }),
          },
        ]
      : []),
  ];
}
