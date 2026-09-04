import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseOficinasWorkbook } from "./parseOficinasPlano.ts";
import {
  OFICINAS_NAMED_SHEET_ROLES,
  OFICINAS_SHEET_ROLES,
} from "../shared/modules/oficinas/types.ts";

/**
 * Sheet resolution of the weekly template.
 *
 * The workbook of week 35 of 2026 added five tabs, and one of them repeats a
 * prefix another tab already owns ("1-Peticiones IMAC Año En Curso " next to
 * "1-Asignadas por semanas (año en"). These tests pin the two facts that
 * follow from that: the listing is reachable, and it never takes the slot of
 * the pivot whose prefix it borrows — in either tab order.
 */

type Row = (string | number | null)[];

/** Tab names exactly as Excel truncates them in the real export. */
const ASIGNADAS_TOTAL = "1-Asignadas por semanas (año en";
const IMAC_LISTING = "1-Peticiones IMAC Año En Curso ";

/** `Semana | valor` sheet, like prefixes 1, 6 and 11. */
function weeklyTotals(header: string, values: number[]): Row[] {
  return [["Semana", header], ...values.map((value, index) => [index + 1, value])];
}

/** One-label pivot, like the DT matrices. */
function dtMatrix(dimension: string, rows: [string, ...number[]][]): Row[] {
  return [
    ["", "Semana", 1, 2, "Total"],
    [dimension, "", 1, 2, "Total"],
    ...rows.map(([label, ...weeks]) => [
      label,
      "",
      ...weeks,
      weeks.reduce((sum, week) => sum + week, 0),
    ]),
  ];
}

/** Componente / Elemento pivot, like prefixes 5 and 10. */
function elementMatrix(): Row[] {
  return [
    ["", "", "Semana", 1, 2, "Total"],
    ["Componente", "Elemento", "", 1, 2, "Total"],
    ["EQUIPO", "MONITOR", "", 3, 4, 7],
    ["", "TECLADO", "", 1, 0, 1],
  ];
}

/** Monthly sheet of the new block, like prefixes 23, 24 and 26. */
function monthly(headers: string[], rows: Row[]): Row[] {
  return [headers, ...rows];
}

/**
 * The IMAC listing, with the three columns the contract matches on plus the
 * noise around them, so the test exercises the set match and not a lucky
 * three-column header.
 */
function imacListing(rows: number): Row[] {
  return [
    [
      "Peticion",
      "WorkorderHelix",
      "Residente",
      "Tipo_Peticion",
      "Fecha_Solicitud",
      "Fecha_Cierre",
      "Status",
      "Oficina",
      "Producto_1",
      "Cantidad_1",
    ],
    ...Array.from({ length: rows }, (_, index) => [
      1_316_609 + index,
      `WO${index}`,
      "No",
      "AMPLIACIÓN",
      "2/1/2026",
      "2/1/2026",
      "Cerrado",
      "0182-2364 - ALICANTE-EMPRESAS",
      "Monitor estándar",
      1,
    ]),
  ];
}

interface SheetSpec {
  name: string;
  rows: Row[];
}

/** Every pivot the contract declares, in workbook order. */
function pivots(): SheetSpec[] {
  return [
    { name: ASIGNADAS_TOTAL, rows: weeklyTotals("Asignadas", [28, 139]) },
    { name: "2-Listado asignadas (criterio M", rows: dtMatrix("DT", [["D.T. SUR", 2, 27]]) },
    { name: "3-Listado asignadas (criterio M", rows: dtMatrix("DT", [["D.T. SUR", 2, 27]]) },
    { name: "4-Listado asignadas (criterio M", rows: dtMatrix("DT", [["D.T. SUR", 0, 10]]) },
    { name: "5-Listado asignadas (criterio M", rows: elementMatrix() },
    { name: "6-Resueltas por semanas (año en", rows: weeklyTotals("Resueltas", [17, 101]) },
    { name: "7-Listado incidencias resueltas", rows: dtMatrix("DT", [["D.T. SUR", 1, 18]]) },
    { name: "8-Listado incidencias resueltas", rows: dtMatrix("DT", [["D.T. SUR", 1, 15]]) },
    { name: "9-Listado incidencias resueltas", rows: dtMatrix("DT", [["D.T. SUR", 0, 3]]) },
    { name: "10-Listado resueltas (criterio ", rows: elementMatrix() },
    { name: "11-Peticiones por semanas (año ", rows: weeklyTotals("Peticiones", [9, 41]) },
    { name: "12-Listado peticiones", rows: dtMatrix("DT", [["D.T. SUR", 0, 5]]) },
    { name: "13-Listado peticiones - AÑO ANT", rows: dtMatrix("DT", [["D.T. SUR", 2, 7]]) },
    {
      name: "14-Listado peticiones - % Sobre",
      rows: [
        ["", "Semana", 1, 2, "Total"],
        ["Categorization Tier 3", "", 1, 2, "Total"],
        ["AMPLIACIÓN", "", "6 (67%)", "18 (44%)", 24],
      ],
    },
    { name: "15-RECICLADORES_ Listado incide", rows: dtMatrix("DT", [["D.T. SUR", 0, 16]]) },
    { name: "16-RECICLADORES_ Listado incide", rows: dtMatrix("DT", [["D.T. SUR", 4, 7]]) },
    {
      name: "17-RECICLADORES_ Listado incide",
      rows: [
        ["", "Semana", 1, 2, "Total"],
        ["Categorization Tier 2", "", 1, 2, "Total"],
        ["HARDWARE", "", "4 (0%)", "42 (3%)", 46],
      ],
    },
    {
      name: "18-Valoración Encuestas - Petic",
      rows: [
        ["Fecha", "Encuestas", "Valoración"],
        ["2026/08", 30, 5],
      ],
    },
    {
      name: "19-Encuestas",
      rows: [
        ["Fecha", "Servicio", "Encuestas", "Valoración", "Facil. apertura", "Satis.resolución"],
        ["2026/08", "PETICIONES IMAC", 30, 5, 5, 5],
      ],
    },
    { name: "20-Valoración", rows: [[1, 2, 3, 4, 5], [0, 1, 0, 1, 1194]] },
    { name: "21-Valoración apertura", rows: [[1, 2, 3, 4, 5], [3, 0, 0, 2, 1197]] },
    { name: "22-Valoración resolución", rows: [[1, 2, 3, 4, 5], [1, 0, 0, 3, 1197]] },
    {
      name: "23-HIC (Sucursal) - Incidencias",
      rows: monthly(
        ["Fecha", "Resueltas", "Asignadas", "Asignaciones"],
        [["2026/08", 380, 427, 466]]
      ),
    },
    {
      name: "24-HIC (Sucursal) Getronics - A",
      rows: monthly(["Fecha", "Abiertas", "Resueltas"], [["2026/08", 234, 235]]),
    },
    {
      name: "25-HIC (Sucursal) Mensual - Inc",
      rows: [
        ["", "Fecha ", "2026/08", "Total"],
        ["DAR", "", "2026/08", "Total"],
        ["CATALUÑA", "", 86, 86],
      ],
    },
    {
      name: "26-IMAC Minsait por Mes - Petic",
      rows: monthly(
        ["Fecha", "Peticiones", "Realizadas", "Pendientes"],
        [["2026/08", 113, 111, 2]]
      ),
    },
  ];
}

function build(sheets: SheetSpec[]): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();

  for (const spec of sheets) {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(spec.rows),
      spec.name
    );
  }

  return workbook;
}

/** The workbook as the team ships it: the listing last. */
function currentTemplate(imacRows = 4): XLSX.WorkBook {
  return build([...pivots(), { name: IMAC_LISTING, rows: imacListing(imacRows) }]);
}

describe("Oficinas sheet resolution", () => {
  it("reads the IMAC listing that shares a prefix with the assigned totals", () => {
    const { report } = parseOficinasWorkbook(currentTemplate(), 2026);

    expect(report.sheetsFound).toHaveLength(27);
    expect(report.sheetsFound).toContain(IMAC_LISTING);
    expect(report.missingSheets).toEqual([]);
    expect(report.missingNamedSheets).toEqual([]);
  });

  it("reports the duplicate prefix instead of hiding it", () => {
    const { report } = parseOficinasWorkbook(currentTemplate(4), 2026);
    const listing = report.sheets.find((sheet) => sheet.sheet === IMAC_LISTING);

    expect(listing).toEqual({
      sheet: IMAC_LISTING,
      // Its name really does start with "1-". Reporting null here would hide
      // the collision from the import log.
      prefix: 1,
      named: "peticionesImac",
      role: OFICINAS_NAMED_SHEET_ROLES.peticionesImac,
      rows: 4,
      weeks: [],
    });

    expect(
      report.sheets.filter((sheet) => sheet.prefix === 1).map((sheet) => sheet.sheet)
    ).toEqual([ASIGNADAS_TOTAL, IMAC_LISTING]);
  });

  it("keeps prefix 1 for the assigned totals whatever the tab order", () => {
    const listingFirst = build([
      { name: IMAC_LISTING, rows: imacListing(4) },
      ...pivots(),
    ]);

    for (const workbook of [currentTemplate(), listingFirst]) {
      const { dataset, report } = parseOficinasWorkbook(workbook, 2026);

      expect(dataset.asignadas?.totalsByWeek).toEqual([
        { year: 2026, week: 1, value: 28 },
        { year: 2026, week: 2, value: 139 },
      ]);
      expect(report.sheetsFound).toContain(ASIGNADAS_TOTAL);
      expect(report.sheetsFound).toContain(IMAC_LISTING);
    }
  });

  it("names a role for every monthly sheet of the new block", () => {
    const { report } = parseOficinasWorkbook(currentTemplate(), 2026);
    const roles = new Map(report.sheets.map((sheet) => [sheet.prefix, sheet.role]));

    for (const prefix of [23, 24, 25, 26]) {
      expect(roles.get(prefix)).toBe(OFICINAS_SHEET_ROLES[prefix]);
    }
  });

  it("still reads a template exported before the new sheets existed", () => {
    const older = build(pivots().filter((sheet) => {
      const prefix = Number(sheet.name.split("-")[0]);

      return prefix <= 22;
    }));
    const { dataset, report } = parseOficinasWorkbook(older, 2026);

    expect(dataset.asignadas?.totalsByWeek).toHaveLength(2);
    expect(report.missingSheets).toEqual([23, 24, 25, 26]);
    expect(report.missingNamedSheets).toEqual(["peticionesImac"]);
  });

  it("folds the IMAC listing by closing week, with its units", () => {
    const listing: Row[] = [
      [
        "Peticion",
        "Tipo_Peticion",
        "Fecha_Solicitud",
        "Fecha_Cierre",
        "Status",
        "Producto_1",
        "Cantidad_1",
        "Producto_2",
        "Cantidad_2",
      ],
      // Lunes 5/1 y viernes 9/1 de 2026 son la ISO semana 2 (la 1 acaba el 4/1).
      [1, "AMPLIACIÓN", "29/12/2025", "5/1/2026", "Cerrado", "Monitor", 2, "Ratón", 1],
      [2, "AMPLIACIÓN", "5/1/2026", "9/1/2026", "Cerrado", "Teclado", 1, null, null],
      [3, "SINIESTRO", "12/1/2026", "12/1/2026", "Cerrado", "Portátil", 4, null, null],
      // Sin fecha de cierre: rechazada. No entra en ninguna semana.
      [4, "SINIESTRO", "12/1/2026", "//", "Rechazado", "Portátil", 9, null, null],
      // Misma tipología escrita sin tilde: una fila, no dos.
      [5, "AMPLIACION", "12/1/2026", "13/1/2026", "Cerrado", "Monitor", 1, null, null],
    ];

    const { dataset } = parseOficinasWorkbook(
      build([...pivots(), { name: IMAC_LISTING, rows: listing }]),
      2026
    );

    expect(dataset.imac?.peticionesByWeek).toEqual([
      { year: 2026, week: 2, value: 2 },
      { year: 2026, week: 3, value: 2 },
    ]);
    // 2 + 1 + 1 en la semana 2; 4 + 1 en la 3. Las 9 unidades de la rechazada
    // no cuentan: nunca se entregaron.
    expect(dataset.imac?.intervencionesByWeek).toEqual([
      { year: 2026, week: 2, value: 4 },
      { year: 2026, week: 3, value: 5 },
    ]);
    expect(dataset.imac?.byTipo).toEqual([
      {
        label: "AMPLIACIÓN",
        values: [
          { year: 2026, week: 2, value: 2 },
          { year: 2026, week: 3, value: 1 },
        ],
      },
      { label: "SINIESTRO", values: [{ year: 2026, week: 3, value: 1 }] },
    ]);
  });

  it("reads the listing columns by name, not by position", () => {
    const moved: Row[] = [
      ["Oficina", "Status", "Cantidad_1", "Fecha_Cierre", "Tipo_Peticion", "Peticion"],
      ["0182-0001", "Cerrado", 3, "5/1/2026", "AMPLIACIÓN", 1],
    ];

    const { dataset, report } = parseOficinasWorkbook(
      build([...pivots(), { name: IMAC_LISTING, rows: moved }]),
      2026
    );

    expect(report.missingNamedSheets).toEqual([]);
    expect(dataset.imac?.peticionesByWeek).toEqual([
      { year: 2026, week: 2, value: 1 },
    ]);
    expect(dataset.imac?.intervencionesByWeek).toEqual([
      { year: 2026, week: 2, value: 3 },
    ]);
  });

  it("does not mistake a pivot for the IMAC listing", () => {
    const { report } = parseOficinasWorkbook(currentTemplate(), 2026);

    expect(
      report.sheets.filter((sheet) => sheet.named !== null).map((sheet) => sheet.sheet)
    ).toEqual([IMAC_LISTING]);
  });

  it("reads the monthly sheets in calendar order and drops empty DAR rows", () => {
    const workbook = build([
      ...pivots().map((sheet) =>
        sheet.name.startsWith("23-")
          ? {
              name: sheet.name,
              rows: monthly(
                ["Fecha", "Resueltas", "Asignadas", "Asignaciones"],
                [
                  ["2026/08", 380, 427, 466],
                  ["2025/05", 0, 31, 33],
                ]
              ),
            }
          : sheet.name.startsWith("25-")
            ? {
                name: sheet.name,
                rows: [
                  ["", "Fecha", "2025/09", "2026/08", "Total"],
                  ["DAR", "", null, null, null],
                  ["CATALUÑA", "", 645, 86, "731"],
                  ["--- DESCONOCIDA ---", "", 0, 0, 0],
                  ["Total", "", 645, 380, "1,025"],
                ],
              }
            : sheet
      ),
      { name: IMAC_LISTING, rows: imacListing(1) },
    ]);
    const { dataset } = parseOficinasWorkbook(workbook, 2026);

    expect(dataset.mensual?.incidencias.map((row) => row.month)).toEqual([
      "2025-05",
      "2026-08",
    ]);
    expect(dataset.mensual?.incidencias[1]).toEqual({
      month: "2026-08",
      resueltas: 380,
      asignadas: 427,
      asignaciones: 466,
    });
    expect(dataset.mensual?.cierresPorDT).toEqual([
      {
        label: "D.T. CATALUÑA",
        values: [
          { month: "2025-09", value: 645 },
          { month: "2026-08", value: 86 },
        ],
      },
    ]);
    expect(dataset.mensual?.peticiones).toEqual([
      { month: "2026-08", peticiones: 113, realizadas: 111, pendientes: 2 },
    ]);
  });
});
