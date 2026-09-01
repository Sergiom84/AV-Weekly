import { describe, expect, it } from "vitest";
import type { InformaticaDataset } from "../shared/modules/informatica/types.ts";
import {
  lastClosedMonth,
  reportMonths,
  reportedWeek,
  snapshotRows,
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

/**
 * The team uploads on Monday and reports the week that closed before it, the
 * same convention AGA writes down. Reading the week from the cut and not from
 * the last row is what keeps every page of the deck on one week.
 */
describe("semana del informe", () => {
  it("es la semana cerrada anterior al corte, suba el día que suba", () => {
    // Lunes: la rutina normal.
    expect(reportedWeek("2026-08-31")).toEqual({
      start: "2026-08-24",
      end: "2026-08-30",
    });
    // Viernes: sin esta regla, la semana en curso se publicaría a medias.
    expect(reportedWeek("2026-09-04")).toEqual({
      start: "2026-08-24",
      end: "2026-08-30",
    });
    // Domingo, último día de su propia semana ISO.
    expect(reportedWeek("2026-09-06")).toEqual({
      start: "2026-08-24",
      end: "2026-08-30",
    });
    expect(reportedWeek(null)).toBeNull();
  });

  it("cuenta el backlog de la foto más reciente, no de la ventana", () => {
    const rows = [
      { fecha: "2026-08-24", total: 733 },
      { fecha: "2026-08-31", total: 948 },
      { fecha: "2026-08-31", total: 589 },
      // Posterior al corte: pertenece a la subida siguiente.
      { fecha: "2026-09-07", total: 1000 },
    ];

    expect(
      snapshotRows(rows, row => row.fecha, "2026-08-31").map(row => row.total)
    ).toEqual([948, 589]);
    expect(snapshotRows(rows, row => row.fecha, null).map(row => row.total)).toEqual([
      1000,
    ]);
    expect(snapshotRows([], row => (row as { fecha: string }).fecha, "2026-08-31")).toEqual([]);
  });
});
