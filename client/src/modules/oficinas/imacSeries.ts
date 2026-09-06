import { valueAt } from "@shared/modules/oficinas/derived";
import type {
  OficinasDeckPage,
  OficinasRow,
  OficinasWeekValue,
} from "@shared/modules/oficinas/types";
import { cellKey, isOverridden, overriddenValue, weekColumn } from "./overrides";

export interface ImacCell {
  key: string;
  value: number | null;
  overridden: boolean;
}

export interface ImacSeries {
  /** Override row key, and the chart's series key. */
  key: string;
  label: string;
  /** One cell per requested week, in order. What the chart and the grid read. */
  cells: ImacCell[];
  /** The same figures shaped as a pivot row. What the table reads. */
  row: OficinasRow;
}

export interface ImacSeriesSpec {
  key: string;
  label: string;
  values: OficinasWeekValue[];
}

/**
 * The two IMAC series, resolved once against the page's manual corrections.
 *
 * Chart and table used to build their figures separately, so a correction typed
 * into the grid moved the bars and left the table on the imported value: the
 * same week read 99 above and 10 below. They now come from one array, and the
 * table row is derived from the very cells the chart draws, so the two cannot
 * drift apart again.
 *
 * A week corrected to empty is dropped from the row rather than written as a
 * zero, which is the rule the rest of the module follows: an absent week was
 * not measured, and a zero says it was measured and empty.
 */
export function imacSeries(
  page: OficinasDeckPage,
  year: number,
  weeks: number[],
  specs: ImacSeriesSpec[]
): ImacSeries[] {
  return specs.map((spec) => {
    const cells = weeks.map((week) => {
      const key = cellKey(spec.key, weekColumn(week));

      return {
        key,
        value: overriddenValue(page, key, valueAt(spec.values, year, week)),
        overridden: isOverridden(page, key),
      };
    });

    return {
      key: spec.key,
      label: spec.label,
      cells,
      row: {
        label: spec.label,
        values: weeks
          .map((week, index) => ({ year, week, value: cells[index].value }))
          .filter(
            (entry): entry is OficinasWeekValue => entry.value !== null
          ),
      },
    };
  });
}
