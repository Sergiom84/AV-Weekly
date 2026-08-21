import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { agaPeriodLabel, agaReportingPeriod, agaWeekLabel } from "../shared/modules/aga/calendar.ts";
import { managedWeeklyDelta, topLocationShare } from "../shared/modules/aga/managed.ts";
import {
  AGA_COLUMNS,
  type AgaDataset,
  type AgaManagedSection,
  type AgaWeekAggregate,
} from "../shared/modules/aga/types.ts";
import { mergeAgaDataset, parseAgaWorkbook } from "./parseAgaPlano.ts";

const source = { sourceFile: "gps.xlsx", uploadedAt: "2026-08-21T00:00:00.000Z" };

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
    expect(agaPeriodLabel("2026-08-17")).toBe("Semana 33 de 2026 · 10-16 agosto");
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
    const sheet = XLSX.utils.aoa_to_sheet([["Peticiones"], [...AGA_COLUMNS], row]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Semana actual");

    const parsed = parseAgaWorkbook(workbook);

    expect(parsed.weeks).toHaveLength(1);
    expect(parsed.weeks[0]).toMatchObject({ week: "2026-08-17", reportWeek: 33, total: 1 });
    expect(parsed.weeks[0].byDepartment).toEqual([{ label: "GAM", count: 1 }]);
  });

  it("reemplaza sólo weeks y preserva managed, office, annual y metadatos", () => {
    const managedSection = managed();
    const existing: AgaDataset = {
      weeks: [week("2026-08-17", 846)],
      managed: managedSection,
      office: { months: ["2026-08"], families: [{ label: "Office", values: [11] }] },
      annual: {
        peticiones: [{ year: 2026, values: [1, null, null, null, null, null, null, null, null, null, null, null] }],
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

    expect(merged.weeks.map((entry) => entry.total)).toEqual([850, 900]);
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
    expect(fallback).toMatchObject({ total: 297, drawnTotal: 297, complete: false });
  });
});

describe("importador histórico AGA", () => {
  it("preserva secciones y enriquece ubicaciones desde el pivot sin nombres fijos", async () => {
    // The production script is plain ESM because it also runs directly with Node.
    // @ts-expect-error JavaScript script intentionally has no declaration file.
    const { mergeHistoricDataset } = await import("../scripts/importar-historico-aga.mjs");
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
    expect(merged.managed?.locationTotals).toEqual([{ week: "2026-08-17", total: 299 }]);
    expect(merged.managed?.byLocation.map((row) => row.label)).toEqual(
      expect.arrayContaining(["Valencia", "Oviedo"])
    );
  });
});
