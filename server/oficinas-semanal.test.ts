import { describe, expect, it } from "vitest";
import {
  semanalCurrentAt,
  semanalHeadlineItems,
  semanalMediaWeeks,
  semanalTableEntries,
  semanalWeekTotal,
} from "../client/src/modules/oficinas/aggregate.ts";
import { semanalSeriesRows } from "../client/src/modules/oficinas/semanalSeries.ts";
import type { OficinasDeckPage } from "../shared/modules/oficinas/types.ts";
import type {
  OficinasRow,
  OficinasWeekValue,
} from "../shared/modules/oficinas/types.ts";

function week(year: number, week: number, value: number): OficinasWeekValue {
  return { year, week, value };
}

function row(label: string, values: OficinasWeekValue[]): OficinasRow {
  return { label, values };
}

const rows: OficinasRow[] = [
  row("DT Norte", [
    week(2026, 31, 10),
    week(2026, 32, 20),
    week(2026, 33, 30),
  ]),
  row("DT Sur", [
    week(2026, 31, 5),
    week(2026, 32, 6),
    week(2026, 33, 7),
  ]),
  row("OTROS", [week(2026, 31, 1), week(2026, 32, 1), week(2026, 33, 1)]),
];

describe("SemanalPage aggregation", () => {
  it("excluye de la media la última semana abierta cuando no hay cierre", () => {
    expect(semanalMediaWeeks(rows, 2026, null)).toEqual([31, 32]);
  });

  it("incluye la semana de cierre en la media", () => {
    expect(semanalMediaWeeks(rows, 2026, 33)).toEqual([31, 32, 33]);
  });

  it("suma la serie publicada, no el recorte de la tabla", () => {
    const totals: OficinasWeekValue[] = [
      week(2026, 33, 400),
      week(2026, 32, 200),
    ];

    expect(semanalCurrentAt(rows, 2026, 33, totals)).toBe(400);
    expect(semanalCurrentAt(rows, 2026, 33)).toBe(38);
  });

  it("ordena por media y deja OTROS al final en la pivot territorial", () => {
    const entries = semanalTableEntries(rows, 2026, [31, 32], {
      rankByAverage: true,
      peticionesTerritorial: true,
    });

    expect(entries.map(entry => entry.label)).toEqual([
      "DT Norte",
      "DT Sur",
      "OTROS",
    ]);
    expect(entries[0]?.media).toBe(15);
  });

  it("deja en blanco una semana que ninguna fila reportó", () => {
    const entries = semanalTableEntries(rows, 2026, [31, 32]);

    expect(semanalWeekTotal(entries, 31)).toBe(16);
    expect(semanalWeekTotal(entries, 40)).toBeNull();
  });

  it("escribe la variación de la última semana contra el año comparado", () => {
    expect(
      semanalHeadlineItems({
        headlineLabel: "Asignadas",
        lastWeek: 33,
        year: 2026,
        current: 110,
        compareYear: 2025,
        previous: 100,
      })
    ).toEqual([
      { label: "Asignadas S33 - 2025", value: "100" },
      { label: "Asignadas S33 - 2026", value: "110" },
      { label: "Variación", value: "+10,0%" },
    ]);
  });

  it("deja hueco en una semana no medida y respeta un override", () => {
    const page = {
      id: "oficinas-asignadas-semanal",
      kind: "ofiAsignadasSemanal",
      supportType: null,
      text: {},
      visible: true,
      weekSelection: null,
      years: null,
      overrides: { "total:S32": 99 },
    } as OficinasDeckPage;
    const series = semanalSeriesRows({
      page,
      year: 2026,
      extraYears: [],
      comparison: undefined,
      throughWeek: 33,
      currentReported: new Set([32, 33]),
      currentAt: week => (week === 32 ? 20 : week === 33 ? 30 : 0),
    });
    const actual = series.find(entry => entry.key === "actual");

    expect(actual?.cells[30]?.value).toBeNull();
    expect(actual?.cells[31]?.value).toBe(99);
    expect(actual?.cells[31]?.overridden).toBe(true);
    expect(actual?.cells[32]?.value).toBe(30);
  });
});
