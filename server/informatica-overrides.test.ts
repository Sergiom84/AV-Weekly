import { describe, expect, it } from "vitest";
import {
  cellKey,
  correctSeries,
  correctYearChart,
  figureCell,
  withOverride,
} from "@/modules/informatica/overrides";
import type { InformaticaDeckPage } from "@shared/modules/informatica/types";

function page(overrides: InformaticaDeckPage["overrides"] = {}): InformaticaDeckPage {
  return {
    id: "encuestas-incidencias",
    kind: "itEncuestas",
    text: {},
    overrides,
  } as InformaticaDeckPage;
}

describe("correcciones de Informática", () => {
  it("sustituye la cifra importada y deja el resto igual", () => {
    const current = page();
    const patch = withOverride(current, cellKey("Asignadas", "2026/09"), 12);

    expect(figureCell(patch, "Asignadas", "2026/09", 4)).toMatchObject({
      drawn: 12,
      overridden: true,
    });
    expect(figureCell(patch, "Resueltas", "2026/09", 9).drawn).toBe(9);
  });

  it("una celda vaciada se dibuja como cero y no vuelve al importado", () => {
    const cleared = page({ [cellKey("1", "2026/09")]: null });

    expect(figureCell(cleared, "1", "2026/09", 8)).toMatchObject({
      value: null,
      drawn: 0,
      overridden: true,
    });
  });

  it("aplica la serie a cada columna y arma la rejilla", () => {
    const current = page({ [cellKey("Holding", "2026/08")]: 3 });
    const series = correctSeries(
      current,
      "Holding",
      "Holding",
      ["2026/07", "2026/08"],
      [1, 2]
    );

    expect(series.drawn).toEqual([1, 3]);
    expect(series.row.cells[1]).toMatchObject({ overridden: true, value: 3 });
  });

  it("corrige un año sin inventar meses que el gráfico no tenía", () => {
    const current = page({ [cellKey("2026", "2")]: 40 });
    const chart = correctYearChart(
      current,
      [
        { mes: "Ene 26", y2026: 10 },
        { mes: "Feb 26" },
      ],
      [2026]
    );

    expect(chart.data[0].y2026).toBe(10);
    expect(chart.data[1].y2026).toBe(40);
    expect(chart.totals.get(2026)).toBe(50);
  });
});
