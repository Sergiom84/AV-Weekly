import { describe, expect, it } from "vitest";
import type { InformaticaDataset } from "../shared/modules/informatica/types.ts";
import {
  lastClosedMonth,
  reportMonths,
  yearlyComparison,
} from "../client/src/modules/informatica/aggregate.ts";

const source = { sourceFile: null, uploadedAt: null };

describe("Informatica complete-month reporting", () => {
  it("excludes the partial extract month from every complete-month window", () => {
    const dataset: InformaticaDataset = {
      incidencias: [
        {
          fecha: "2026-08-14",
          semana: 33,
          mes: "2026/08",
          categoria: "",
          subcategoria: "",
          metrica: "Resueltas",
          edificio: "SSCC",
          tickets: 1,
        },
      ],
      hic: [
        {
          ambito: "SSCC",
          mes: "2026/06",
          categoria: "",
          metrica: "Resueltas",
          total: 10,
        },
        {
          ambito: "SSCC",
          mes: "2026/07",
          categoria: "",
          metrica: "Resueltas",
          total: 20,
        },
        {
          ambito: "SSCC",
          mes: "2026/08",
          categoria: "",
          metrica: "Resueltas",
          total: 5,
        },
      ],
      source,
    };

    expect(reportMonths(dataset, dataset.hic ?? [], row => row.mes)).toEqual([
      "2026/06",
      "2026/07",
    ]);
  });

  it("returns no closed month when the known cut only covers a partial month", () => {
    expect(lastClosedMonth(["2026/08"], "2026-08-14")).toBeNull();
  });

  it("cuts annual axes and totals at the same closed month", () => {
    const rows = [
      { mes: "2025/07", total: 70 },
      { mes: "2025/08", total: 80 },
      { mes: "2026/07", total: 7 },
      { mes: "2026/08", total: 8 },
    ];
    const result = yearlyComparison(
      rows,
      row => row.mes,
      row => row.total,
      { throughMonth: 7 }
    );

    expect(result.data.map(entry => entry.mes)).toEqual([
      "Ene",
      "Feb",
      "Mar",
      "Abr",
      "May",
      "Jun",
      "Jul",
    ]);
    expect(result.totals).toEqual(
      new Map([
        [2025, 70],
        [2026, 7],
      ])
    );
  });
});
