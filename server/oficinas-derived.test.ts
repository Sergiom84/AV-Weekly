import { describe, expect, it } from "vitest";
import {
  comparisonSeries,
  reportPeriod,
  reportWeek,
  rowTotal,
  seriesYears,
} from "../shared/modules/oficinas/derived.js";
import { mergeOficinasDataset } from "./parseOficinasPlano.js";
import type {
  OficinasDataset,
  OficinasIncidencias,
  OficinasWeekValue,
} from "../shared/modules/oficinas/types.js";

const values = (weeks: number[]): OficinasWeekValue[] =>
  weeks.map(week => ({ year: 2026, week, value: week }));

describe("Oficinas report period", () => {
  it("uses the latest week common to all current sections", () => {
    const dataset: OficinasDataset = {
      asignadas: {
        totalsByWeek: values([32, 33, 34]),
        byDT: [],
        byElement: [],
      },
      resueltas: {
        totalsByWeek: values([32, 33, 34]),
        byDT: [],
        byElement: [],
      },
      peticiones: {
        totalsByWeek: values([32, 33]),
        byDT: [],
        byDTPrevious: [],
        byTipo: [],
      },
      recicladores: {
        byDT: [{ label: "D.T. SUR", values: values([32, 33, 34]) }],
        byDTPrevious: [],
        byElemento: [],
      },
      source: { sourceFile: "template.xlsx", uploadedAt: null },
      year: 2026,
    };

    expect(reportWeek(dataset, 2026)).toBe(33);
  });

  it("excludes values after the selected report week from annual totals", () => {
    expect(rowTotal({ values: values([32, 33, 34]) }, 2026, 33)).toBe(65);
  });

  it("writes the closed ISO week on the cover", () => {
    expect(reportPeriod(2026, 33)).toBe("Agosto 2026 - Semana 33");
  });
});

/**
 * The section the multi-year selector reads: the template's own total sheet for
 * the current year and the manual historico for the past ones, the latter
 * measured without validators.
 */
const section: OficinasIncidencias = {
  totalsByWeek: [{ year: 2026, week: 33, value: 86 }],
  byDT: [
    { variant: "con", rows: [{ label: "D.T. SUR", values: [{ year: 2026, week: 33, value: 86 }] }] },
    { variant: "sin", rows: [{ label: "D.T. SUR", values: [{ year: 2026, week: 33, value: 74 }] }] },
    { variant: "solo", rows: [{ label: "D.T. SUR", values: [{ year: 2026, week: 33, value: 12 }] }] },
  ],
  byElement: [],
  history: [
    {
      variant: "sin",
      values: [
        { year: 2024, week: 33, value: 91 },
        { year: 2025, week: 33, value: 82 },
      ],
    },
  ],
};

describe("Oficinas year comparison", () => {
  it("offers the historico years to the variant it was measured at", () => {
    expect(seriesYears(comparisonSeries(section, "sin"))).toEqual([2024, 2025]);
  });

  it("does not offer a 'sin validadoras' past year beside another scope", () => {
    expect(seriesYears(comparisonSeries(section, "solo"))).toEqual([]);
    expect(seriesYears(comparisonSeries(section, "con"))).toEqual([2026]);
  });

  it("keeps the published total sheet as the comparison of the 'con' variant", () => {
    expect(comparisonSeries(section, "con")).toEqual([
      { year: 2026, week: 33, value: 86 },
    ]);
  });

  it("survives a weekly upload, which carries no past year to fold", () => {
    const incoming: OficinasDataset = {
      asignadas: {
        totalsByWeek: [{ year: 2026, week: 34, value: 40 }],
        byDT: section.byDT,
        byElement: [],
      },
      source: { sourceFile: "template.xlsx", uploadedAt: null },
      year: 2026,
    };
    const merged = mergeOficinasDataset(
      { asignadas: section, source: { sourceFile: null, uploadedAt: null } },
      incoming,
      { sourceFile: "template.xlsx", uploadedAt: null }
    );

    expect(merged.asignadas?.history).toEqual(section.history);
  });
});
