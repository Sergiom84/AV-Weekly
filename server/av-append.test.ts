import { describe, expect, it } from "vitest";
import {
  appendMonthlyDataset,
  appendResolutionWeeks,
  appendWeeklyDataset,
  appendWeeklyMatrix,
} from "./avAppend.ts";
import { emptyMonthlyDataset, emptyWeeklyDataset } from "../shared/modules/av/types.ts";
import type { WeeklyMatrix } from "../shared/deck/core.ts";

function matrix(weeks: number[], rows: Record<string, number[]>): WeeklyMatrix {
  const built = Object.entries(rows).map(([label, values]) => ({
    label,
    values,
    total: values.reduce((sum, value) => sum + value, 0),
  }));
  return {
    weeks,
    rows: built,
    totals: weeks.map((_, index) => built.reduce((sum, row) => sum + (row.values[index] ?? 0), 0)),
  };
}

describe("AV append-only upload", () => {
  it("keeps stored weeks and only adds the missing ones", () => {
    // Week 38 was stored as a zero column, as densifying leaves it.
    const stored = matrix([37, 38, 39], { CIUDAD: [50, 0, 80], CAMPUS: [10, 0, 20] });
    // A broken template rebuilds weeks 37 and 39 with other numbers.
    const incoming = matrix([37, 38, 39, 40], { CIUDAD: [1, 60, 2, 70], VELA: [0, 5, 0, 3] });

    const merged = appendWeeklyMatrix(stored, incoming)!;

    expect(merged.weeks).toEqual([37, 38, 39, 40]);
    expect(merged.rows.find((row) => row.label === "CIUDAD")?.values).toEqual([50, 60, 80, 70]);
    expect(merged.rows.find((row) => row.label === "CAMPUS")?.values).toEqual([10, 0, 20, 0]);
    expect(merged.rows.find((row) => row.label === "VELA")?.values).toEqual([0, 5, 0, 3]);
    expect(merged.totals).toEqual([60, 65, 100, 73]);
  });

  it("starts from scratch when the year changes", () => {
    const stored = { ...emptyWeeklyDataset(), year: "2026", maxWeek: 52 };
    stored.byType.Programados.locations = matrix([52], { CIUDAD: [40] });
    const incoming = { ...emptyWeeklyDataset(), year: "2027", maxWeek: 1 };
    incoming.byType.Programados.locations = matrix([1], { CIUDAD: [7] });

    const merged = appendWeeklyDataset(stored, incoming);

    expect(merged.maxWeek).toBe(1);
    expect(merged.byType.Programados.locations?.weeks).toEqual([1]);
  });

  it("merges a stored dataset without year as the same year", () => {
    const stored = { ...emptyWeeklyDataset(), maxWeek: 40 };
    stored.byType.Remotos.categories = matrix([40], { ERRORES: [30] });
    const incoming = { ...emptyWeeklyDataset(), year: "2026", maxWeek: 38 };
    incoming.byType.Remotos.categories = matrix([38, 40], { ERRORES: [25, 1] });

    const merged = appendWeeklyDataset(stored, incoming);

    expect(merged.maxWeek).toBe(40);
    expect(merged.year).toBe("2026");
    expect(merged.byType.Remotos.categories?.rows[0].values).toEqual([25, 0, 30]);
  });

  it("keeps stored resolution weeks", () => {
    const row = (total: number) => ({ category: "Programados", tier2: "SALA", tier3: "X", total });
    const merged = appendResolutionWeeks(
      { Programados: { "37": [row(5)], "38": [] } } as never,
      { Programados: { "37": [row(9)], "38": [row(4)] } } as never
    );

    expect(merged.Programados["37"]).toEqual([row(5)]);
    expect(merged.Programados["38"]).toEqual([row(4)]);
  });

  it("fills empty months and never overwrites a stored one", () => {
    const stored = emptyMonthlyDataset();
    stored.byType.Remotos["2026"] = [135, 199, null, null, null, null, null, 81, null, null, null, null];
    const incoming = emptyMonthlyDataset();
    incoming.byType.Remotos["2026"] = [1, 1, 246, null, null, null, null, 99, 279, null, null, null];
    incoming.byType.Remotos["2025"] = [161, null, null, null, null, null, null, null, null, null, null, null];

    const merged = appendMonthlyDataset(stored, incoming);

    expect(merged.byType.Remotos["2026"]).toEqual([
      135, 199, 246, null, null, null, null, 81, 279, null, null, null,
    ]);
    expect(merged.byType.Remotos["2025"][0]).toBe(161);
    expect(merged.years).toEqual([2025, 2026]);
  });
});
