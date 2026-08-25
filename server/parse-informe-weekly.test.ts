import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import type {
  InformeWeeklyDataset,
  ResolutionRow,
  SupportType,
} from "../shared/informe.ts";
import { emptyWeeklyDataset, INFORME_SUPPORT_TYPES } from "../shared/informe.ts";
import {
  mergeReportedResolutionHistory,
  parseInformeWeeklyWorkbook,
  reconcileInformeResolutionRows,
} from "./parseInformeWeekly.js";

function addSheet(workbook: XLSX.WorkBook, name: string, rows: unknown[][]) {
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
}

function matrixRows(
  weeks: number[],
  rows: Array<{ label: string; values: number[] }>
): unknown[][] {
  const totals = weeks.map((_, index) =>
    rows.reduce((sum, row) => sum + (row.values[index] ?? 0), 0)
  );

  return [
    ["", "Semana", ...weeks, "Total"],
    ["TIPO", "", ...weeks, "Total"],
    ...rows.map((row) => [
      row.label,
      "",
      ...row.values,
      row.values.reduce((sum, value) => sum + value, 0),
    ]),
    ["Total", "", ...totals, totals.reduce((sum, value) => sum + value, 0)],
  ];
}

function detailRows(rows: Array<[string, string, string, number]>): unknown[][] {
  return [
    [
      "Resolution Category",
      "Resolution Category Tier 2",
      "Resolution Category Tier 3",
      "Total",
    ],
    ...rows,
    ["Total", "", "", rows.reduce((sum, row) => sum + row[3], 0)],
  ];
}

function weeklyWorkbook() {
  const workbook = XLSX.utils.book_new();

  addSheet(
    workbook,
    "2-Soporte Programado por semana",
    matrixRows([31, 32, 33, 34], [
      { label: "CIUDAD", values: [24, 2, 1, 1] },
      { label: "CAMPUS", values: [1, 0, 0, 0] },
    ])
  );
  addSheet(
    workbook,
    "3-Soporte Presencial por semana",
    matrixRows([31, 32, 34], [
      { label: "CIUDAD", values: [2, 1, 1] },
      { label: "TERRITORIOS", values: [4, 0, 7] },
      { label: "CAMPUS", values: [9, 0, 11] },
      { label: "RECOLETOS", values: [0, 2, 0] },
    ])
  );
  addSheet(
    workbook,
    "4-Incidencias por semanas - año",
    matrixRows([34], [{ label: "RECOLETOS", values: [1] }])
  );
  addSheet(
    workbook,
    "6-Mantenimientos correctivos po",
    matrixRows([34], [
      { label: "CIUDAD", values: [17] },
      { label: "TERRITORIOS", values: [2] },
      { label: "CAMPUS", values: [3] },
    ])
  );

  addSheet(workbook, "7-Soporte Programado - Detalle", detailRows([]));
  addSheet(
    workbook,
    "8-Soporte Presencial - Detalle",
    detailRows([
      ["V03 - S.PRESENCIAL", "SALAS", "DES/INSTALACION", 3],
      ["", "", "DES/MONTAJE", 15],
    ])
  );
  addSheet(
    workbook,
    "9-Incidencias - Detalle semana",
    detailRows([["V01 - S.PUNTUAL", "PROYECTOR", "REINICIO", 1]])
  );
  addSheet(
    workbook,
    "10-Mantenimientos correctivos -",
    detailRows([
      ["V04 - S.CORRECTIVO", "CABLEADO", "SANEADO", 1],
      ["", "", "SUSTITUCION", 4],
      ["", "VC. CISCO", "SUSTITUCION", 8],
      ["", "EQUIPO VIDEO", "REINICIO", 1],
      ["", "", "SUSTITUCION", 1],
      ["", "ALMACEN", "INVENTARIO", 1],
      ["", "", "TRASLADO", 1],
      ["", "PC\\PORTATIL", "REINICIO", 2],
      ["", "ROOMWIZARD\\QR", "REINICIO", 2],
      ["", "VIDEO WALL", "ENCENDIDO / APAGADO", 1],
    ])
  );

  return workbook;
}

function resolutionTotal(rows: ResolutionRow[]) {
  return rows.reduce((sum, row) => sum + row.total, 0);
}

function emptyHistory(): Record<SupportType, Record<string, ResolutionRow[]>> {
  return Object.fromEntries(INFORME_SUPPORT_TYPES.map((type) => [type, {}])) as Record<
    SupportType,
    Record<string, ResolutionRow[]>
  >;
}

describe("weekly Informe import", () => {
  it("fills the missing S33 with zero without changing S32 or S34", () => {
    const parsed = parseInformeWeeklyWorkbook(weeklyWorkbook());
    const matrix = parsed.byType.Presenciales.locations;

    expect(matrix?.weeks).toEqual([31, 32, 33, 34]);
    expect(matrix?.totals).toEqual([15, 3, 0, 19]);
    expect(matrix?.rows.find((row) => row.label === "RECOLETOS")?.values).toEqual([
      0,
      2,
      0,
      0,
    ]);
  });

  it("reconciles Programados S34 from zero detail to one preparation", () => {
    const parsed = parseInformeWeeklyWorkbook(weeklyWorkbook());

    expect(parsed.byType.Programados.resolutions).toEqual([
      {
        category: "Programados",
        tier2: "SALA",
        tier3: "PREPARACION SALA",
        total: 1,
      },
    ]);
  });

  it("normalizes SALAS and reconciles Presenciales from 18 to 19", () => {
    const parsed = parseInformeWeeklyWorkbook(weeklyWorkbook());

    expect(parsed.byType.Presenciales.resolutions).toEqual([
      {
        category: "V03 - S.PRESENCIAL",
        tier2: "SALA",
        tier3: "DES/INSTALACION",
        total: 3,
      },
      {
        category: "V03 - S.PRESENCIAL",
        tier2: "SALA",
        tier3: "DES/MONTAJE",
        total: 16,
      },
    ]);
    expect(resolutionTotal(parsed.byType.Presenciales.resolutions)).toBe(19);
  });

  it("groups the category-only Incidencias and Correctivos aliases from the script", () => {
    const parsed = parseInformeWeeklyWorkbook(weeklyWorkbook());

    expect(parsed.byType.Incidencias.resolutions).toEqual([
      {
        category: "V01 - S.PUNTUAL",
        tier2: "PROYECTOR",
        tier3: "PROYECTOR",
        total: 1,
      },
    ]);
    expect(parsed.byType.Correctivos.resolutions).toContainEqual({
      category: "V04 - S.CORRECTIVO",
      tier2: "VC CISCO",
      tier3: "VC CISCO",
      total: 8,
    });
    expect(parsed.byType.Correctivos.resolutions).toContainEqual({
      category: "V04 - S.CORRECTIVO",
      tier2: "ROOMWIZARD/QR",
      tier3: "ROOMWIZARD/QR",
      total: 2,
    });
    expect(resolutionTotal(parsed.byType.Correctivos.resolutions)).toBe(22);
  });

  it("is idempotent and refuses a reconciliation that would create negatives", () => {
    const once = reconcileInformeResolutionRows(
      "Presenciales",
      [
        { category: "V03", tier2: "SALAS", tier3: "DES/INSTALACION", total: 3 },
        { category: "V03", tier2: "SALAS", tier3: "DES/MONTAJE", total: 15 },
      ],
      19
    );

    expect(reconcileInformeResolutionRows("Presenciales", once, 19)).toEqual(once);
    expect(() =>
      reconcileInformeResolutionRows(
        "Programados",
        [{ category: "V02", tier2: "WEBEX", tier3: "CONEXION", total: 2 }],
        1
      )
    ).toThrow(/tickets negativos/);
  });

  it("stores an empty reported week and preserves all other history", () => {
    const dataset: InformeWeeklyDataset = emptyWeeklyDataset();
    dataset.maxWeek = 34;
    dataset.byType.Programados.locations = {
      weeks: [33, 34],
      rows: [{ label: "CIUDAD", values: [2, 0], total: 2 }],
      totals: [2, 0],
    };
    dataset.byType.Programados.resolutions = [];

    const history = emptyHistory();
    history.Programados["33"] = [
      { category: "Programados", tier2: "SALA", tier3: "PRESTAMO", total: 2 },
    ];
    history.Presenciales["34"] = [
      { category: "Presenciales", tier2: "SALA", tier3: "EVENTO", total: 7 },
    ];

    const merged = mergeReportedResolutionHistory(history, dataset);

    expect(merged.Programados["33"]).toEqual(history.Programados["33"]);
    expect(merged.Programados["34"]).toEqual([]);
    expect(merged.Presenciales["34"]).toEqual(history.Presenciales["34"]);
  });
});
