import { describe, expect, it } from "vitest";
import { previousTypeEntries } from "../client/src/modules/oficinas/peticionesTipoComparison.ts";
import { surveyYtdSeries } from "../client/src/modules/oficinas/surveyYtd.ts";
import { elementHeadlineStats } from "../client/src/modules/oficinas/elementHeadline.ts";
import { recicladoresYtd } from "../client/src/modules/oficinas/recicladoresYtd.ts";
import { mergeOficinasDataset } from "./parseOficinasPlano.ts";
import type { OficinasDataset, OficinasRow } from "../shared/modules/oficinas/types.ts";

const row = (label: string, year: number, week: number, value: number): OficinasRow => ({
  label,
  values: [{ year, week, value }],
});

describe("Oficinas requested integrations", () => {
  it("derives the requested office totals, ratio and weekly average", () => {
    expect(
      elementHeadlineStats(
        4_997,
        { dtOffices: [{ dt: "D.T. SUR", offices: 1_980 }] },
        35
      )
    ).toEqual({
      total: 4_997,
      offices: 1_980,
      ratio: 4_997 / 1_980,
      average: 4_997 / 35,
    });
  });

  it("accumulates survey months and restarts every January", () => {
    const result = surveyYtdSeries([
      { month: "2025-12", value: 100 },
      { month: "2026-01", value: 40 },
      { month: "2026-02", value: 61 },
      { month: "2026-08", value: 330 },
    ]);

    expect(result.series.map(entry => entry.accumulated)).toEqual([100, 40, 101, 431]);
    expect(result.latestSeries.map(entry => entry.accumulated)).toEqual([40, 101, 431]);
    expect(result.latestYtd).toBe(431);
  });

  it("cuts both years at the report week when accumulating recyclers", () => {
    const rows: OficinasRow[] = [
      {
        label: "ATASCO",
        values: [
          { year: 2026, week: 1, value: 4 },
          { year: 2026, week: 2, value: 6 },
          // Past the report week: belongs to the year, not to the reading.
          { year: 2026, week: 9, value: 100 },
        ],
      },
      {
        label: "HARDWARE",
        values: [
          { year: 2026, week: 1, value: 5 },
          { year: 2026, week: 2, value: 9 },
        ],
      },
    ];
    const comparison = [
      { year: 2025, week: 1, value: 7 },
      { year: 2025, week: 2, value: 8 },
      { year: 2025, week: 9, value: 90 },
    ];

    expect(recicladoresYtd(rows, comparison, 2026, 2)).toEqual({
      entries: [
        { label: "HARDWARE", imported: 14 },
        { label: "ATASCO", imported: 10 },
      ],
      total: 24,
      // 7 + 8, not 7 + 8 + 90: the same two weeks the current year reports.
      previous: 15,
    });
  });

  it("reports no previous recycler year rather than a zero when none was measured", () => {
    const rows: OficinasRow[] = [
      { label: "ATASCO", values: [{ year: 2026, week: 3, value: 4 }] },
    ];
    // The recycler comparison sheet jumps from week 1 to week 21, so a report
    // closed at week 3 has nothing of the previous year to compare against.
    const comparison = [{ year: 2025, week: 21, value: 60 }];

    expect(recicladoresYtd(rows, comparison, 2026, 3).previous).toBeNull();
  });

  it("keeps unreported 2025 request types null instead of fabricating zero", () => {
    const current = [
      row("AMPLIACIÓN", 2026, 35, 1),
      row("SUSTITUCIÓN DE TERMINAL YA GENERADO", 2026, 35, 1),
      row("CIERRE", 2026, 35, 1),
    ];
    const previous = [
      row("AMPLIACIÓN", 2025, 35, 14),
      row("SUSTITUCION", 2025, 35, 19),
    ];

    expect(previousTypeEntries(current, previous, 2025, 35)).toEqual([
      { label: "AMPLIACIÓN", imported: 14 },
      { label: "SUSTITUCIÓN DE TERMINAL YA GENERADO", imported: 19 },
      { label: "CIERRE", imported: null },
    ]);
  });

  it("preserves the historic type seed across weekly uploads", () => {
    const previous = [row("AMPLIACIÓN", 2025, 35, 14)];
    const base: OficinasDataset = {
      peticiones: {
        totalsByWeek: [],
        byDT: [],
        byDTPrevious: [],
        byTipo: [],
        byTipoPrevious: previous,
      },
      source: { sourceFile: null, uploadedAt: null },
    };
    const incoming: OficinasDataset = {
      peticiones: {
        totalsByWeek: [],
        byDT: [],
        byDTPrevious: [],
        byTipo: [row("AMPLIACIÓN", 2026, 35, 1)],
      },
      source: { sourceFile: "weekly.xlsx", uploadedAt: null },
      year: 2026,
    };

    expect(
      mergeOficinasDataset(base, incoming, incoming.source).peticiones
        ?.byTipoPrevious
    ).toEqual(previous);
  });
});
