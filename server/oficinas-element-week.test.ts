import { describe, expect, it } from "vitest";
import { closedElementWeeks } from "../shared/modules/oficinas/derived.ts";
import type { OficinasWeekValue } from "../shared/modules/oficinas/types.ts";

/**
 * The element pivot is refreshed a week after the territorial one, so its last
 * column is a partial count of the report week. Publishing it as a week of its
 * own is what turned S36 into a 55% collapse: 52 resolved incidents in the
 * element matrix against the 117 the section reported.
 */

function values(year: number, weeks: Record<number, number>): OficinasWeekValue[] {
  return Object.entries(weeks).map(([week, value]) => ({
    year,
    week: Number(week),
    value,
  }));
}

describe("closedElementWeeks", () => {
  it("leaves out the report week, whose element column is still partial", () => {
    const rows = [
      { values: values(2026, { 34: 60, 35: 70, 36: 30 }) },
      { values: values(2026, { 34: 45, 35: 46, 36: 22 }) },
    ];

    expect(closedElementWeeks(rows, 2026, 36)).toEqual([34, 35]);
  });

  it("keeps every week the matrix already stops short of", () => {
    const rows = [{ values: values(2026, { 33: 10, 34: 12, 35: 11 }) }];

    // The template ships the element matrix one week behind, so its own last
    // column is already closed and nothing is dropped.
    expect(closedElementWeeks(rows, 2026, 36)).toEqual([33, 34, 35]);
  });

  it("ignores the weeks of another year", () => {
    const rows = [
      { values: [...values(2025, { 35: 90, 36: 80 }), ...values(2026, { 34: 5 })] },
    ];

    expect(closedElementWeeks(rows, 2026, 36)).toEqual([34]);
  });

  it("reports nothing when the section carries no week of the year", () => {
    expect(closedElementWeeks([{ values: values(2025, { 35: 9 }) }], 2026, 36)).toEqual(
      []
    );
    expect(closedElementWeeks([], 2026, 36)).toEqual([]);
  });

  it("falls back to every reported week when there is no report week yet", () => {
    const rows = [{ values: values(2026, { 1: 4, 2: 6 }) }];

    expect(closedElementWeeks(rows, 2026, null)).toEqual([1, 2]);
  });
});
