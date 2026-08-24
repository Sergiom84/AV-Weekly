import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import type { AgaManagedSection } from "../shared/modules/aga/types.ts";
import {
  managedWeekKey,
  mergeAgaManagedSection,
  parseAgaGestionadoWorkbook,
} from "./parseAgaGestionado.ts";
import { BuildingLocationResolver } from "./buildingLocationMaster.ts";

function workbook(rows: unknown[][]): XLSX.WorkBook {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "Export libre");
  return book;
}

function countAt(
  rows: AgaManagedSection["byDepartment"],
  label: string,
  week = "2026-08-17"
): number | undefined {
  return rows.find((row) => row.label === label)?.counts.find((entry) => entry.week === week)
    ?.count;
}

const headers = [
  "Denominación Producto",
  "Fecha Gestionado",
  "Nº Petición de sistemas",
  "Denominación Edificio",
  "Denominación Departamento",
];

describe("parser del export Gestionado AGA", () => {
  it("lee cabeceras en cualquier orden, no deduplica y usa el lunes siguiente", () => {
    const parsed = parseAgaGestionadoWorkbook(
      workbook([
        headers,
        ["PORTATIL", 46244, "G1", "MADRID-AZUL, 4,", "GAM (GESTION APROVISIONAMIENTO MICRO)"],
        ["PORTATIL", 46245, "G1", "MADRID-AZUL, 4,", "GAM (GESTION APROVISIONAMIENTO MICRO)"],
        ["RATON", 46248, "G2", "PIEDRAS BLANCAS-PABLO IGLESIAS, 4-6,", "ALMACEN"],
        ["TECLADO", 46248, "G3", "EDIFICIO NUEVO", "PORTATILES PLATAFORMA"],
      ]),
      {
        "  madrid-azul, 4, ": "Sede",
        "PIEDRAS BLANCAS-PABLO IGLESIAS, 4-6,": "Asturias",
      }
    );

    expect(managedWeekKey("14/08/2026")).toBe("2026-08-17");
    expect(parsed.managed.weeklyTotals).toEqual([{ week: "2026-08-17", total: 4 }]);
    expect(parsed.managed.locationTotals).toEqual([{ week: "2026-08-17", total: 4 }]);
    expect(countAt(parsed.managed.byDepartment, "GAM")).toBe(2);
    expect(countAt(parsed.managed.byDepartment, "Portatiles Plataforma")).toBe(1);
    expect(countAt(parsed.managed.byProduct, "PORTATIL")).toBe(2);
    expect(countAt(parsed.managed.byLocation, "Sede")).toBe(2);
    expect(countAt(parsed.managed.byLocation, "Asturias")).toBe(1);
    expect(countAt(parsed.managed.byLocation, "Sin clasificar")).toBe(1);
    expect(parsed.report.unknownLocations).toEqual([{ building: "EDIFICIO NUEVO", count: 1 }]);
    expect(
      parsed.managed.byDepartmentProduct.find((entry) => entry.department === "GAM")?.rows
    ).toEqual([{ label: "PORTATIL", counts: [{ week: "2026-08-17", count: 2 }] }]);
  });

  it("conserva todas las categorías aunque no vayan a caber en la gráfica", () => {
    const rows = Array.from({ length: 20 }, (_, index) => [
      `PRODUCTO ${index + 1}`,
      46248,
      `G${index + 1}`,
      "SEDE",
      `DEPARTAMENTO ${index + 1}`,
    ]);
    const parsed = parseAgaGestionadoWorkbook(workbook([headers, ...rows]), { SEDE: "Sede" });

    expect(parsed.managed.byProduct).toHaveLength(20);
    expect(parsed.managed.byDepartment).toHaveLength(20);
  });

  it("usa el maestro compartido de edificios en las importaciones AGA", () => {
    const buildings = new BuildingLocationResolver([
      { building: "MADRID-PASEO DE LA CASTELLANA, 81", location: "Madrid" },
    ]);
    const parsed = parseAgaGestionadoWorkbook(
      workbook([
        headers,
        ["PORTATIL", 46248, "G1", "MADRID-PASEO DE LA CASTELLANA, 81", "ALMACEN"],
      ]),
      buildings
    );

    expect(countAt(parsed.managed.byLocation, "Madrid")).toBe(1);
    expect(parsed.report.unknownLocations).toEqual([]);
  });
});

describe("merge del export Gestionado AGA", () => {
  it("sustituye la semana entrante y conserva las demás semanas y series", () => {
    const existing: AgaManagedSection = {
      weeklyTotals: [
        { week: "2026-08-10", total: 392 },
        { week: "2026-08-17", total: 299 },
      ],
      byDepartment: [
        {
          label: "GAM",
          counts: [
            { week: "2026-08-10", count: 103 },
            { week: "2026-08-17", count: 45 },
          ],
        },
        { label: "ANTIGUO", counts: [{ week: "2026-08-17", count: 1 }] },
      ],
      byProduct: [{ label: "PORTATIL", counts: [{ week: "2026-08-10", count: 56 }] }],
      byLocation: [{ label: "Sede", counts: [{ week: "2026-08-10", count: 200 }] }],
      locationTotals: [
        { week: "2026-08-10", total: 392 },
        { week: "2026-08-17", total: 299 },
      ],
      byDepartmentProduct: [
        {
          department: "GAM",
          rows: [{ label: "PORTATIL", counts: [{ week: "2026-08-10", count: 50 }] }],
        },
      ],
      source: { sourceFile: "anterior.xlsx", uploadedAt: "2026-08-17T00:00:00Z" },
    };
    const incoming: AgaManagedSection = {
      weeklyTotals: [{ week: "2026-08-17", total: 300 }],
      byDepartment: [{ label: "GAM", counts: [{ week: "2026-08-17", count: 46 }] }],
      byProduct: [{ label: "PORTATIL", counts: [{ week: "2026-08-17", count: 26 }] }],
      byLocation: [
        { label: "Sede", counts: [{ week: "2026-08-17", count: 175 }] },
        { label: "Asturias", counts: [{ week: "2026-08-17", count: 1 }] },
      ],
      locationTotals: [{ week: "2026-08-17", total: 300 }],
      byDepartmentProduct: [
        {
          department: "GAM",
          rows: [{ label: "PORTATIL", counts: [{ week: "2026-08-17", count: 6 }] }],
        },
      ],
      source: { sourceFile: "nuevo.xlsx", uploadedAt: "2026-08-21T00:00:00Z" },
    };

    const merged = mergeAgaManagedSection(existing, incoming);

    expect(merged.weeklyTotals).toEqual([
      { week: "2026-08-10", total: 392 },
      { week: "2026-08-17", total: 300 },
    ]);
    expect(countAt(merged.byDepartment, "GAM", "2026-08-10")).toBe(103);
    expect(countAt(merged.byDepartment, "GAM", "2026-08-17")).toBe(46);
    expect(merged.byDepartment.some((row) => row.label === "ANTIGUO")).toBe(false);
    expect(countAt(merged.byProduct, "PORTATIL", "2026-08-10")).toBe(56);
    expect(countAt(merged.byProduct, "PORTATIL", "2026-08-17")).toBe(26);
    expect(merged.locationTotals).toEqual([
      { week: "2026-08-10", total: 392 },
      { week: "2026-08-17", total: 300 },
    ]);
    expect(merged.source).toEqual(incoming.source);
    expect(
      merged.byDepartmentProduct
        .find((entry) => entry.department === "GAM")
        ?.rows.find((row) => row.label === "PORTATIL")?.counts
    ).toEqual([
      { week: "2026-08-10", count: 50 },
      { week: "2026-08-17", count: 6 },
    ]);
  });
});
