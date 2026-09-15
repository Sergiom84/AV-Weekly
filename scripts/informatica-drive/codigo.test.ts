import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { edificioCode } from "../../shared/modules/informatica/buildingCodes.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

function loadCodigo() {
  const source = readFileSync(join(HERE, "Codigo.gs"), "utf8");
  const context = createContext({
    console,
    Date,
    MimeType: {
      MICROSOFT_EXCEL: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      PLAIN_TEXT: "text/plain",
    },
    SpreadsheetApp: {
      getActiveSpreadsheet() {
        return { getSheetByName() { return null; }, getId() { return ""; } };
      },
      getUi() {
        return { alert() {}, ButtonSet: { OK: "OK" } };
      },
    },
  });

  runInContext(source, context, { filename: "Codigo.gs" });

  return context as {
    esAliasEdificioBasura: (name: string) => boolean;
    debeRodarSemanaAnterior: (extraction: Date, lastProcessed: Date | null) => boolean;
    totalesComprobacion: (
      agregado: Record<string, unknown[][]>,
      extraction: Date
    ) => { citas: number; vuelo: number };
    monthBounds: (extraction: Date) => { first: Date };
    mesSiguiente: (month: Date) => Date;
    toDate: (value: unknown) => Date | null;
    yearFromCell: (value: unknown) => number;
    fechaOperativa: (date: Date | null) => boolean;
    renoveAmbito: (sheetName: string) => string;
    renoveSheets: (grids: { name: string; grid: unknown[][] }[]) => { name: string }[];
    agregarRenove: (
      found: Record<string, unknown>,
      buckets: Record<string, number>
    ) => void;
    rows: (buckets: Record<string, number>) => unknown[][];
    edificioCode: (name: string) => string;
    serializarPlano: (
      agregado: Record<string, unknown[][]>,
      meta: Record<string, string>
    ) => string;
  };
}

describe("Codigo.gs weekly safeguards", () => {
  const gs = loadCodigo();

  it("usa el mismo código de edificio que la app", () => {
    expect(gs.edificioCode("-PL ANTONIO MAURA, 6,")).toBe(
      edificioCode("-PL ANTONIO MAURA, 6,")
    );
    expect(gs.edificioCode("Smart Tech Antoni Maura")).toBe(
      edificioCode("Smart Tech Antoni Maura")
    );
  });

  it("codifica edificios en el TXT y no escribe direcciones", () => {
    const { serializarPlano } = gs;
    const address = "-PL ANTONIO MAURA, 6,";
    const texto = serializarPlano(
      {
        edificios: [
          ["A. Maura", "DT Cataluña", "", "", address, "", "Si", "1"],
        ],
        workOrders: [
          ["2026-09-11", "2026/09", "37", "A. Maura", "TRASLADO", "1"],
        ],
        citas: [
          [
            "2026-09-11",
            "2026/09",
            "37",
            "Smart Tech Antoni Maura",
            "Con Cita",
            "2",
          ],
        ],
        imacs: [["2026-09-01", "2026/09", address, "Solicitudes", "3"]],
      },
      { week: "2026-09-15", scope: "completo" }
    );

    expect(texto).not.toMatch(/ANTONIO MAURA/i);
    expect(texto).not.toMatch(/\[EDIFICIOS\]/);
    expect(texto).toContain(edificioCode("A. Maura"));
    expect(texto).toContain(edificioCode(address));
  });

  it("descarta Grand Total y Total como edificios", () => {
    expect(gs.esAliasEdificioBasura("Grand Total")).toBe(true);
    expect(gs.esAliasEdificioBasura("TOTAL GENERAL")).toBe(true);
    expect(gs.esAliasEdificioBasura("Madrid SEDE")).toBe(false);
  });

  it("no rueda semana anterior si la extracción no ha cambiado", () => {
    const extraction = new Date("2026-08-24T00:00:00.000Z");

    expect(gs.debeRodarSemanaAnterior(extraction, extraction)).toBe(false);
    expect(gs.debeRodarSemanaAnterior(extraction, null)).toBe(true);
    expect(
      gs.debeRodarSemanaAnterior(new Date("2026-08-31T00:00:00.000Z"), extraction)
    ).toBe(true);
  });

  it("cuenta solo las citas de la semana de extracción, no el histórico", () => {
    const extraction = new Date("2026-08-24T00:00:00.000Z");
    const totals = gs.totalesComprobacion(
      {
        peticiones: [],
        workOrders: [],
        incidencias: [],
        citas: [
          ["2026-05-12", "2026/05", 20, "Sede", "Con Cita", 100],
          ["2026-08-24", "2026/08", 35, "Sede", "Con Cita", 7],
          ["2026-08-25", "2026/08", 35, "Sede", "Sin Cita", 3],
          ["2026-08-31", "2026/08", 36, "Sede", "Con Cita", 9],
        ],
      },
      extraction
    );

    expect(totals.citas).toBe(7);
  });

  it("no trata recuentos de encuestas como fechas de 1900", () => {
    expect(gs.toDate(91)).toBeNull();
    expect(gs.toDate(285)).toBeNull();
    expect(gs.fechaOperativa(new Date(Date.UTC(1900, 2, 31)))).toBe(false);
    expect(gs.fechaOperativa(new Date(Date.UTC(2026, 7, 1)))).toBe(true);
  });

  it("lee el año de Hoja 14 aunque venga como número, texto o fecha", () => {
    expect(gs.yearFromCell(2026)).toBe(2026);
    expect(gs.yearFromCell("2026")).toBe(2026);
    expect(gs.yearFromCell(new Date(2026, 0, 1))).toBe(2026);
  });

  it("reconoce las ocho pestañas de Renove y descarta las copias", () => {
    expect(gs.renoveAmbito("Holding - Onboarding semanal")).toBe("Holding");
    expect(gs.renoveAmbito("España - Renovados renove")).toBe("España");
    expect(gs.renoveAmbito("Espana - Renove semanal")).toBe("España");
    expect(gs.renoveAmbito("Copia de Renove semanal")).toBe("");
    expect(gs.renoveAmbito("Holding - Renove semanal (2)")).toBe("");
  });

  it("agrupa Renove por día, ámbito y estado sin leer serial ni ubicación", () => {
    const grids = [
      {
        name: "Holding - Renove semanal",
        grid: [
          ["Ubicación", "Estado", "Fecha de Estado", "Serial", "Nº Petición"],
          ["SEDE Principal", "PENDIENTE USUARIO", null, "PF5WQS8W", "G500744"],
          ["SEDE Principal", "PENDIENTE USUARIO", null, "PF63YRLT", "G500741"],
          ["SEDE Principal", "", null, "PF63XDTH", "G500737"],
        ],
      },
      {
        name: "España - Renovados renove",
        grid: [
          ["Ubicación", "Estado", "Fecha", "Nº Petición"],
          ["Antoni Maura", "RENOVADO", new Date(2026, 3, 22), "G500287"],
          ["Antoni Maura", "RENOVADO", new Date(2026, 3, 22), "G500292"],
          ["Antoni Maura", "RECHAZADO", new Date(2026, 3, 20), "G500283"],
        ],
      },
      {
        name: "Copia de Renove semanal",
        grid: [
          ["Ubicación", "Estado", "Fecha de Estado", "Serial", "Nº Petición"],
          ["SEDE Principal", "RENOVADO", new Date(2026, 3, 22), "PF5WQS8W", "G500744"],
        ],
      },
    ];
    const buckets: Record<string, number> = {};

    gs.agregarRenove(
      { renove: { sheets: gs.renoveSheets(grids) } },
      buckets
    );

    expect(gs.rows(buckets)).toEqual([
      ["", "", "0", "Holding", "PENDIENTE USUARIO", 2],
      ["2026-04-20", "2026/04", "17", "España", "RECHAZADO", 1],
      ["2026-04-22", "2026/04", "17", "España", "RENOVADO", 2],
    ]);
  });

  it("el cierre automático apunta al mes de extracción, no al siguiente", () => {
    const extraction = new Date("2026-09-07T00:00:00.000Z");
    const target = gs.monthBounds(extraction).first;

    expect(target.toISOString().slice(0, 10)).toBe("2026-09-01");
    expect(gs.mesSiguiente(new Date("2026-08-01T00:00:00.000Z")).toISOString().slice(0, 10)).toBe(
      "2026-09-01"
    );
  });
});
