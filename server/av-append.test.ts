import { describe, expect, it } from "vitest";
import {
  appendMonthlyDataset,
  appendResolutionWeeks,
  appendWeeklyDataset,
  appendWeeklyMatrix,
  projectAvMonthlyToWeek,
  projectAvWeeklyToWeek,
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

  it("preserves stored territoriales when incoming lacks it and updates when incoming provides it", () => {
    const territorialesSample = {
      mesActual: "Octubre",
      resumen: "Destacan: Town Hall",
      meses: [{ mes: "Octubre", galicia: 1, norte: 4, cataluna: 4, este: 0, sur: 3, gc: 2, centro: 6, total: 20 }],
      totales: { Galicia: 1, Norte: 4, Cataluña: 4, Este: 0, Sur: 3, GC: 2, Centro: 6, Total: 20 },
    };
    const stored = { ...emptyMonthlyDataset(), territoriales: territorialesSample };
    const incomingWithout = emptyMonthlyDataset();

    expect(appendMonthlyDataset(stored, incomingWithout).territoriales).toEqual(territorialesSample);

    const updatedTerritoriales = { ...territorialesSample, mesActual: "Noviembre" };
    const incomingWith = { ...emptyMonthlyDataset(), territoriales: updatedTerritoriales };

    expect(appendMonthlyDataset(stored, incomingWith).territoriales).toEqual(updatedTerritoriales);
  });
});

describe("AV projection to activeWeek", () => {
  it("projects weekly matrices, totals, resolutionsByWeek and maxWeek without mutating stored data", () => {
    const stored = { ...emptyWeeklyDataset(), year: "2026", maxWeek: 47 };
    stored.byType.Remotos.categories = matrix([45, 46, 47], {
      ERRORES: [10, 12, 15],
      CONEXION: [3, 4, 8],
    });
    stored.byType.Programados.locations = matrix([45, 46, 47], {
      CIUDAD: [5, 7, 9],
    });
    stored.byType.Programados.resolutionsByWeek = {
      "45": [{ category: "Programados", tier2: "SALA", tier3: "A", total: 5 }],
      "46": [{ category: "Programados", tier2: "SALA", tier3: "A", total: 7 }],
      "47": [{ category: "Programados", tier2: "SALA", tier3: "A", total: 9 }],
    };

    const projected = projectAvWeeklyToWeek(stored, 46);

    expect(projected.maxWeek).toBe(46);
    expect(projected.byType.Remotos.categories?.weeks).toEqual([45, 46]);
    expect(
      projected.byType.Remotos.categories?.rows.find((row) => row.label === "ERRORES")
    ).toEqual({
      label: "ERRORES",
      values: [10, 12],
      total: 22,
    });
    expect(projected.byType.Remotos.categories?.totals).toEqual([13, 16]);
    expect(projected.byType.Programados.locations?.weeks).toEqual([45, 46]);
    expect(Object.keys(projected.byType.Programados.resolutionsByWeek)).toEqual(["45", "46"]);

    // Stored object remains intact with week 47.
    expect(stored.maxWeek).toBe(47);
    expect(stored.byType.Remotos.categories?.weeks).toEqual([45, 46, 47]);
    expect(Object.keys(stored.byType.Programados.resolutionsByWeek)).toEqual([
      "45",
      "46",
      "47",
    ]);
  });

  it("projects monthly dataset to activeWeek cutoff month using activeMonthlyOverride and clears future months", () => {
    const stored = emptyMonthlyDataset();
    stored.byType.Remotos["2025"] = Array(12).fill(100);
    // Stored has Oct (idx 9) and Nov (idx 10) up to W47, plus Dec (idx 11) in a hypothetical future state.
    stored.byType.Remotos["2026"] = [10, 20, 30, 40, 50, 60, 70, 80, 90, 110, 220, 300];
    stored.byType.Remotos["2027"] = [5, null, null, null, null, null, null, null, null, null, null, null];
    stored.years = [2025, 2026, 2027];
    stored.territoriales = {
      mesActual: "Noviembre",
      resumen: "Resumen W47",
      meses: [],
      totales: { Total: 50 },
    };

    const w46Territoriales = {
      mesActual: "Noviembre",
      resumen: "Resumen W46",
      meses: [],
      totales: { Total: 40 },
    };

    const withOverride = {
      ...stored,
      activeMonthlyOverride: {
        week: 46, // 2026-W46 ends 2026-11-15 -> cutoffMonth = 10 (Nov)
        year: "2026",
        byType: {
          ...emptyMonthlyDataset().byType,
          Remotos: {
            "2026": [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 160, null],
          },
        },
        territoriales: w46Territoriales,
      },
    };

    const projected = projectAvMonthlyToWeek(withOverride, "2026", 46, 47);

    expect(projected.activeMonthlyOverride).toBeUndefined();
    expect(projected.years).toEqual([2025, 2026]);
    expect(projected.byType.Remotos["2025"]).toEqual(Array(12).fill(100));
    expect(projected.byType.Remotos["2027"]).toBeUndefined();
    // Prior months use stored values; cutoffMonth (Nov = idx 10) uses override (160); Dec (idx 11) is null.
    expect(projected.byType.Remotos["2026"]).toEqual([
      10, 20, 30, 40, 50, 60, 70, 80, 90, 110, 160, null,
    ]);
    expect(projected.territoriales).toEqual(w46Territoriales);

    // When activeWeek >= storedMaxWeek, returns full stored monthly without activeMonthlyOverride.
    const full = projectAvMonthlyToWeek(withOverride, "2026", 47, 47);
    expect(full.activeMonthlyOverride).toBeUndefined();
    expect(full.years).toEqual([2025, 2026, 2027]);
    expect(full.byType.Remotos["2026"][10]).toBe(220);
    expect(full.byType.Remotos["2026"][11]).toBe(300);
    expect(full.territoriales).toEqual(stored.territoriales);
  });
});
