import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  convertRawImacsWorkbook,
  detectRawInformaticaFormat,
} from "./convertInformaticaRaw.ts";
import { parseInformaticaPlanoWorkbook } from "./parseInformaticaPlano.ts";

function rawImacsWorkbook(): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Fecha limite", "Número", "Edificio", "nº trabajos", "Solicitudes"],
    [new Date(Date.UTC(2026, 6, 3)), 1, "Madrid Recoletos", 2, 1],
    [new Date(Date.UTC(2026, 6, 17)), 2, "Madrid Recoletos", 4, 1],
    [new Date(Date.UTC(2026, 6, 20)), 3, "Bilbao Gran Vía", 1, 1],
    [new Date(Date.UTC(2026, 7, 2)), 4, "Bilbao Gran Vía", 3, 2],
    [new Date(Date.UTC(2026, 7, 3)), 5, "Barcelona Sabadell", 9, 4],
    [null, 5, "Sin fecha", 8, 8],
  ]);

  XLSX.utils.book_append_sheet(workbook, sheet, "2026");
  return workbook;
}

describe("raw Informatica IMAC workbook", () => {
  it("is detected from its columns rather than its file or sheet name", () => {
    expect(detectRawInformaticaFormat(rawImacsWorkbook())).toBe("imacs");
  });

  it("sums requests and interventions by month and building", () => {
    const flat = convertRawImacsWorkbook(rawImacsWorkbook());
    const { dataset, report } = parseInformaticaPlanoWorkbook(flat);

    expect(report.sheetsFound).toEqual(["imacs"]);
    expect(dataset.imacs).toEqual([
      {
        fecha: "2026-07-01",
        mes: "2026/07",
        ciudad: "Bilbao",
        metrica: "Intervenciones",
        total: 1,
      },
      {
        fecha: "2026-07-01",
        mes: "2026/07",
        ciudad: "Bilbao",
        metrica: "Solicitudes",
        total: 1,
      },
      {
        fecha: "2026-07-01",
        mes: "2026/07",
        ciudad: "Madrid Recoletos",
        metrica: "Intervenciones",
        total: 6,
      },
      {
        fecha: "2026-07-01",
        mes: "2026/07",
        ciudad: "Madrid Recoletos",
        metrica: "Solicitudes",
        total: 2,
      },
      {
        fecha: "2026-08-01",
        mes: "2026/08",
        ciudad: "Bilbao",
        metrica: "Intervenciones",
        total: 3,
      },
      {
        fecha: "2026-08-01",
        mes: "2026/08",
        ciudad: "Bilbao",
        metrica: "Solicitudes",
        total: 2,
      },
    ]);
  });
});
