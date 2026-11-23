import { describe, expect, it } from "vitest";
import {
  semanalCurrentAt,
  semanalHeadlineItems,
  semanalMediaWeeks,
  semanalTableEntries,
  semanalWeekTotal,
} from "../client/src/modules/oficinas/aggregate.ts";
import { semanalSeriesRows } from "../client/src/modules/oficinas/semanalSeries.ts";
import { projectOficinasDatasetToWeek } from "./parseOficinasPlano.ts";
import type {
  OficinasDataset,
  OficinasDeckPage,
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
      {
        label: "Asignadas Semana 33 - 2025",
        value: "100",
        accent: "var(--informe-serie-3)",
      },
      {
        label: "Asignadas Semana 33 - 2026",
        value: "110",
        accent: "var(--informe-serie-1)",
      },
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

describe("projectOficinasDatasetToWeek", () => {
  it("proyecta semanas, mensuales y encuestas hasta activeWeek preservando años anteriores y sin mutar el origen", () => {
    const stored: OficinasDataset = {
      year: 2026,
      activeWeek: { year: 2026, week: 46 },
      source: { sourceFile: "Template.xlsx", uploadedAt: "2026-11-16T08:00:00Z" },
      asignadas: {
        totalsByWeek: [week(2025, 47, 90), week(2026, 45, 100), week(2026, 46, 110), week(2026, 47, 120)],
        byDT: [
          {
            variant: "con",
            rows: [row("D.T. CENTRO", [week(2026, 45, 50), week(2026, 46, 55), week(2026, 47, 60)])],
          },
        ],
        byElement: [
          {
            label: "MONITOR",
            componente: "EQUIPO",
            elemento: "MONITOR",
            values: [week(2026, 45, 10), week(2026, 46, 12), week(2026, 47, 15)],
          },
        ],
      },
      peticiones: {
        totalsByWeek: [week(2026, 45, 40), week(2026, 46, 42), week(2026, 47, 50)],
        byDT: [row("D.T. CENTRO", [week(2026, 46, 20), week(2026, 47, 25)])],
        byDTPrevious: [row("D.T. CENTRO", [week(2025, 47, 19)])],
        byTipo: [row("AMPLIACIÓN", [week(2026, 46, 15), week(2026, 47, 18)])],
        byTipoPrevious: [row("AMPLIACIÓN", [week(2025, 47, 14)])],
      },
      mensual: {
        incidencias: [
          { month: "2026-10", resueltas: 100, asignadas: 110, asignaciones: 120 },
          { month: "2026-11", resueltas: 90, asignadas: 95, asignaciones: 100 },
          { month: "2026-12", resueltas: 80, asignadas: 85, asignaciones: 90 },
        ],
        recicladores: [
          { month: "2026-11", abiertas: 10, resueltas: 9 },
          { month: "2026-12", abiertas: 5, resueltas: 4 },
        ],
        cierresPorDT: [
          {
            label: "D.T. CENTRO",
            values: [
              { month: "2026-11", value: 30 },
              { month: "2026-12", value: 12 },
            ],
          },
        ],
        peticiones: [
          { month: "2026-11", peticiones: 50, realizadas: 45, pendientes: 5 },
          { month: "2026-12", peticiones: 20, realizadas: 15, pendientes: 5 },
        ],
      },
      encuestas: {
        porMes: [
          { month: "2026-11", encuestas: 30, global: 4.5, apertura: 4.4, resolucion: 4.6 },
          { month: "2026-12", encuestas: 12, global: 4.8, apertura: 4.7, resolucion: 4.9 },
        ],
        distribucion: { global: [0, 0, 1, 5, 24], apertura: [0, 0, 2, 4, 24], resolucion: [0, 0, 0, 5, 25] },
      },
    };

    const projected = projectOficinasDatasetToWeek(stored);

    expect(projected.asignadas?.totalsByWeek).toEqual([
      week(2025, 47, 90),
      week(2026, 45, 100),
      week(2026, 46, 110),
    ]);
    expect(projected.asignadas?.byDT[0]?.rows[0]?.values).toEqual([
      week(2026, 45, 50),
      week(2026, 46, 55),
    ]);
    expect(projected.peticiones?.byDTPrevious[0]?.values).toEqual([week(2025, 47, 19)]);
    expect(projected.peticiones?.byTipoPrevious?.[0]?.values).toEqual([week(2025, 47, 14)]);
    expect(projected.mensual?.incidencias.map((entry) => entry.month)).toEqual(["2026-10", "2026-11"]);
    expect(projected.mensual?.cierresPorDT[0]?.values.map((entry) => entry.month)).toEqual(["2026-11"]);
    expect(projected.encuestas?.porMes.map((entry) => entry.month)).toEqual(["2026-11"]);

    // Stored data stays intact.
    expect(stored.asignadas?.totalsByWeek.map((entry) => entry.week)).toEqual([47, 45, 46, 47]);
    expect(stored.mensual?.incidencias.map((entry) => entry.month)).toEqual(["2026-10", "2026-11", "2026-12"]);
  });
});
