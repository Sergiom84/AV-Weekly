import { describe, expect, it } from "vitest";
import { previousTypeEntries } from "../client/src/modules/oficinas/peticionesTipoComparison.ts";
import { surveyYtdSeries } from "../client/src/modules/oficinas/surveyYtd.ts";
import { elementHeadlineStats } from "../client/src/modules/oficinas/elementHeadline.ts";
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
