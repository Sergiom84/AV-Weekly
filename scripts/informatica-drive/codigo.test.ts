import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";

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
  };
}

describe("Codigo.gs weekly safeguards", () => {
  const gs = loadCodigo();

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

  it("el cierre automático apunta al mes de extracción, no al siguiente", () => {
    const extraction = new Date("2026-09-07T00:00:00.000Z");
    const target = gs.monthBounds(extraction).first;

    expect(target.toISOString().slice(0, 10)).toBe("2026-09-01");
    expect(gs.mesSiguiente(new Date("2026-08-01T00:00:00.000Z")).toISOString().slice(0, 10)).toBe(
      "2026-09-01"
    );
  });
});
