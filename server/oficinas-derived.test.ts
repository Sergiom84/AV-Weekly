import { describe, expect, it } from "vitest";
import {
  reportPeriod,
  reportWeek,
  rowTotal,
} from "../shared/modules/oficinas/derived.js";
import type {
  OficinasDataset,
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
