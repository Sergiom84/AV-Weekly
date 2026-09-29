import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  agaPeriodLabel,
  agaReportingPeriod,
  agaWeekLabel,
} from "../shared/modules/aga/calendar.ts";
import {
  breakdownForWeeks,
  locationShareAt,
  managedWeeklyDelta,
  statedLocationTotal,
  topLocationShare,
} from "../shared/modules/aga/managed.ts";
import {
  AGA_COLUMNS,
  type AgaBreakdownRow,
  type AgaDataset,
  type AgaManagedSection,
  type AgaWeekAggregate,
} from "../shared/modules/aga/types.ts";
import { mergeAgaDataset, parseAgaWorkbook } from "./parseAgaPlano.ts";

const source = {
  sourceFile: "gps.xlsx",
  uploadedAt: "2026-08-21T00:00:00.000Z",
};

function week(weekDate: string, total: number): AgaWeekAggregate {
  return {
    week: weekDate,
    total,
    byDepartment: [],
    byDepartmentRaw: [],
    byProject: [],
  };
}

function managed(): AgaManagedSection {
  return {
    weeklyTotals: [
      { week: "2026-08-10", total: 392 },
      { week: "2026-08-17", total: 300 },
    ],
    byDepartment: [],
    byProduct: [],
    byLocation: [
      { label: "Sede", counts: [{ week: "2026-08-17", count: 175 }] },
      { label: "Resto mostrado", counts: [{ week: "2026-08-17", count: 122 }] },
    ],
    byDepartmentProduct: [],
  };
}

describe("calendario AGA", () => {
  it("nombra la extracción del lunes por la semana AGA completada", () => {
    expect(agaReportingPeriod("2026-08-17")).toEqual({
      week: 33,
      year: 2026,
      start: "2026-08-10",
      end: "2026-08-16",
    });
    expect(agaWeekLabel("2026-08-17")).toBe("S33");
    expect(agaPeriodLabel("2026-08-17")).toBe(
      "Semana 33 de 2026 · 10-16 agosto"
    );
  });

  it("cierra el periodo de la portada en el domingo de la semana reportada", () => {
    expect(agaPeriodLabel("2026-09-07")).toBe(
      "Semana 36 de 2026 · 31 agosto-6 septiembre"
    );
    expect(agaPeriodLabel("2026-09-14")).toBe(
      "Semana 37 de 2026 · 7-13 septiembre"
    );
    expect(agaPeriodLabel("2026-09-28")).toBe(
      "Semana 39 de 2026 · 21-27 septiembre"
    );
    expect(agaPeriodLabel("fecha-antigua")).toBe("");
  });

  it("acepta el número guardado y conserva fallback para datasets existentes", () => {
    expect(agaWeekLabel("2026-08-17", 32)).toBe("S32");
    expect(agaWeekLabel("fecha-antigua")).toBe("fecha-antigua");
  });
});

describe("parser y merge AGA", () => {
  it("agrega el GPS y guarda la semana AGA, no la ISO de extracción", () => {
    const workbook = XLSX.utils.book_new();
    const row = [
      "G1",
      1,
      1,
      "PORTATIL",
      "GAM (GESTION APROVISIONAMIENTO MICRO)",
      null,
      null,
      null,
      "NUEVAS INCORPORACIONES EN BBVA",
      null,
      "ONBOARDING",
      null,
      new Date(2026, 7, 17),
    ];
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Peticiones"],
      [...AGA_COLUMNS],
      row,
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Semana actual");

    const parsed = parseAgaWorkbook(workbook);

    expect(parsed.weeks).toHaveLength(1);
    expect(parsed.weeks[0]).toMatchObject({
      week: "2026-08-17",
      reportWeek: 33,
      total: 1,
    });
    expect(parsed.weeks[0].byDepartment).toEqual([{ label: "GAM", count: 1 }]);
  });

  it("reemplaza sólo weeks y preserva managed, office, annual y metadatos", () => {
    const managedSection = managed();
    const existing: AgaDataset = {
      weeks: [week("2026-08-17", 846)],
      managed: managedSection,
      office: {
        months: ["2026-08"],
        families: [{ label: "Office", values: [11] }],
      },
      annual: {
        peticiones: [
          {
            year: 2026,
            values: [
              1,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
            ],
          },
        ],
        posiciones: [],
      },
      source,
      sheetsFound: ["anterior"],
    };

    const merged = mergeAgaDataset(
      existing,
      [week("2026-08-17", 850), week("2026-08-24", 900)],
      { sourceFile: "nuevo.xlsx", uploadedAt: "2026-08-24T00:00:00.000Z" },
      ["actual"]
    );

    expect(merged.weeks.map(entry => entry.total)).toEqual([850, 900]);
    expect(merged.managed).toBe(managedSection);
    expect(merged.office).toEqual(existing.office);
    expect(merged.annual).toEqual(existing.annual);
    expect(merged.sheetsFound).toEqual(["actual"]);
  });
});

describe("métricas AGA", () => {
  it("usa la variación estándar sobre la semana anterior", () => {
    const delta = managedWeeklyDelta(managed());

    expect(delta?.overPrevious).toBeCloseTo((300 - 392) / 392, 8);
    expect(delta?.overPrevious).toBeCloseTo(-0.2346938776, 8);
  });

  it("usa el total completo de ubicación y declara el fallback como subtotal", () => {
    const complete = managed();
    complete.locationTotals = [{ week: "2026-08-17", total: 300 }];

    expect(topLocationShare(complete)).toMatchObject({
      label: "Sede",
      count: 175,
      drawnTotal: 297,
      total: 300,
      complete: true,
    });
    expect(topLocationShare(complete)?.share).toBeCloseTo(175 / 300, 8);

    const fallback = topLocationShare(managed());
    expect(fallback).toMatchObject({
      total: 297,
      drawnTotal: 297,
      complete: false,
    });
  });

  it("declara el mismo total para el titular y para la variación", () => {
    // Semana 36 real: 21 ubicaciones suman 965 y el origen declara 981, porque
    // 16 posiciones traen un edificio sin ubicación en el maestro. El informe
    // publicó 981 junto a un +34,4% calculado sobre 965; ambos números tienen
    // que salir del mismo total.
    const section: AgaManagedSection = {
      weeklyTotals: [],
      byDepartment: [],
      byProduct: [],
      byLocation: [],
      byDepartmentProduct: [],
      locationTotals: [
        { week: "2026-08-31", total: 718 },
        { week: "2026-09-07", total: 981 },
      ],
    };

    const previous = statedLocationTotal(section, "2026-08-31", 718);
    const current = statedLocationTotal(section, "2026-09-07", 965);

    expect(previous).toEqual({ total: 718, complete: true });
    expect(current).toEqual({ total: 981, complete: true });
    expect(
      (current.total - previous.total) / previous.total
    ).toBeCloseTo(0.3663, 4);
  });

  it("cae al total dibujado cuando el declarado se queda corto", () => {
    const section: AgaManagedSection = {
      weeklyTotals: [],
      byDepartment: [],
      byProduct: [],
      byLocation: [],
      byDepartmentProduct: [],
      locationTotals: [{ week: "2026-09-07", total: 900 }],
    };

    expect(statedLocationTotal(section, "2026-09-07", 965)).toEqual({
      total: 965,
      complete: false,
    });
    expect(statedLocationTotal(section, "2026-08-31", 718)).toEqual({
      total: 718,
      complete: false,
    });
  });

  it("calcula la cuota de ubicación para la semana filtrada", () => {
    const section = managed();
    section.byLocation = [
      {
        label: "Sede",
        counts: [
          { week: "2026-08-10", count: 200 },
          { week: "2026-08-17", count: 175 },
        ],
      },
      {
        label: "Resto mostrado",
        counts: [
          { week: "2026-08-10", count: 100 },
          { week: "2026-08-17", count: 122 },
        ],
      },
    ];
    section.locationTotals = [
      { week: "2026-08-10", total: 320 },
      { week: "2026-08-17", total: 300 },
    ];

    expect(locationShareAt(section, "2026-08-10")).toMatchObject({
      label: "Sede",
      count: 200,
      total: 320,
      complete: true,
    });
  });
});

describe("recorte de las gráficas de producto", () => {
  const WEEKS = ["2026-08-17", "2026-08-24"];

  /**
   * Two weeks of one product breakdown, as the dataset stores them: every
   * product of every week, not the top of each.
   */
  function products(): AgaBreakdownRow[] {
    return [
      {
        // Top of the second week, and modest in the first: the case the deck
        // used to chart as a zero.
        label: "MICROSOFT OFFICE 365 X64 WASP",
        counts: [
          { week: "2026-08-17", count: 4 },
          { week: "2026-08-24", count: 33 },
        ],
      },
      {
        label: "PORTATIL RECICLADO",
        counts: [
          { week: "2026-08-17", count: 12 },
          { week: "2026-08-24", count: 27 },
        ],
      },
      {
        // Busiest of the first week and nearly gone in the second: it falls
        // below the cut, which is ordered by the latest week.
        label: "PORTATIL",
        counts: [
          { week: "2026-08-17", count: 26 },
          { week: "2026-08-24", count: 1 },
        ],
      },
      {
        // First seen in the second week.
        label: 'MONITOR 27"',
        counts: [{ week: "2026-08-24", count: 19 }],
      },
    ];
  }

  it("ordena por la última semana y conserva la cifra real de la anterior", () => {
    const rows = breakdownForWeeks(products(), WEEKS);

    expect(rows.map(row => row.label)).toEqual([
      "MICROSOFT OFFICE 365 X64 WASP",
      "PORTATIL RECICLADO",
      'MONITOR 27"',
      "PORTATIL",
    ]);
    // La barra de la semana anterior es 4, no 0: es el fallo que Miguel veía
    // al copiar a mano sólo los productos que ya estaban en su lista.
    expect(rows[0].counts).toEqual([4, 33]);
    expect(rows[2].counts).toEqual([0, 19]);
  });

  it("recorta al máximo de barras sin tocar las cifras que quedan", () => {
    const rows = breakdownForWeeks(products(), WEEKS, 2);

    expect(rows.map(row => row.label)).toEqual([
      "MICROSOFT OFFICE 365 X64 WASP",
      "PORTATIL RECICLADO",
    ]);
    expect(rows[0].counts).toEqual([4, 33]);
  });

  it("dibuja todas las filas cuando no se declara un máximo", () => {
    expect(breakdownForWeeks(products(), WEEKS)).toHaveLength(4);
    expect(breakdownForWeeks(products(), WEEKS, 0)).toHaveLength(4);
  });

  it("descarta la fila que no tiene cifras en ninguna de las semanas pedidas", () => {
    const rows = breakdownForWeeks(
      [
        ...products(),
        {
          label: "PRODUCTO DE OTRA SEMANA",
          counts: [{ week: "2026-06-01", count: 9 }],
        },
      ],
      WEEKS
    );

    expect(rows.map(row => row.label)).not.toContain("PRODUCTO DE OTRA SEMANA");
  });
});

describe("importador histórico AGA", () => {
  it("preserva secciones y enriquece ubicaciones desde el pivot sin nombres fijos", async () => {
    // The production script is plain ESM because it also runs directly with Node.
    // @ts-expect-error JavaScript script intentionally has no declaration file.
    const { mergeHistoricDataset } = await import(
      "../scripts/importar-historico-aga.mjs"
    );
    const existing: AgaDataset = {
      weeks: [week("2026-08-17", 846)],
      managed: managed(),
      office: { months: ["2026-08"], families: [] },
      annual: { peticiones: [], posiciones: [] },
      source,
      sheetsFound: ["Semana actual"],
    };

    const merged = mergeHistoricDataset(
      existing,
      [{ ...week("2026-08-17", 846), reportWeek: 33 }],
      source,
      {
        rows: [
          { label: "Sede", count: 175 },
          { label: "Valencia", count: 1 },
          { label: "Oviedo", count: 1 },
        ],
        total: 299,
      }
    ) as AgaDataset;

    expect(merged.office).toEqual(existing.office);
    expect(merged.annual).toEqual(existing.annual);
    expect(merged.sheetsFound).toEqual(existing.sheetsFound);
    expect(merged.managed?.locationTotals).toEqual([
      { week: "2026-08-17", total: 299 },
    ]);
    expect(merged.managed?.byLocation.map(row => row.label)).toEqual(
      expect.arrayContaining(["Valencia", "Oviedo"])
    );
  });
});
