import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import * as XLSX from "xlsx";
import { parseAgaOfficeWorkbook, agaOfficeDatesAreSwapped } from "./parseAgaOffice.ts";
import { parseAgaGestionadoWorkbook } from "./parseAgaGestionado.ts";
import { parseAgaTexto } from "./parseAgaTexto.ts";

const OFFICE_HEADERS = ["Nº Petición de sistemas", "Nº Posición de petición", "Denominación Producto", "Fecha de inicio de la gestión"];
const MANAGED_HEADERS = ["Nº Petición de sistemas", "Denominación Departamento", "Denominación Producto", "Fecha Gestionado", "Denominación Edificio"];
const date = (month: number, day = 9) => new Date(2026, month - 1, day);
function book(headers: string[], rows: unknown[][]) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers, ...rows], { cellDates: true }), "Export");
  return workbook;
}
function officeRows() {
  return [11, 6, 5, 6].flatMap((count, index) => Array.from({ length: count }, (_, n) =>
    [`test-${index}-${n}`, 1, index === 0 && n === 0 ? "MICROSOFT OFFICE 2021 (MAC)" : "MICROSOFT OFFICE STANDARD", date(index + 1)]
  ));
}
function managedRows(normalized = false) {
  return [294, 242, 181, 132, 115, 17].flatMap((count, index) => Array.from({ length: count }, (_, n) =>
    [`test-${index}-${n}`, "GAM", "PORTATIL", index === 0 ? "31/08/2026" : normalized ? date(9, index) : date(index), "SEDE"]
  ));
}
function drive() {
  const context = createContext({ Date });
  runInContext(readFileSync(new URL("../scripts/aga-drive/Codigo.gs", import.meta.url), "utf8"), context);
  return context;
}
function entry(script: ReturnType<typeof drive>, headers: string[], rows: unknown[][]) {
  return { sheets: [{ grid: [headers, ...rows], headerRow: 0, columns: Object.fromEntries(headers.map((h, i) => [script.normalize(h), i])) }] };
}

describe("AGA September cut regressions", () => {
  it("reconciles all 28 September positions and keeps MAC separate with an explicit cut", () => {
    const result = parseAgaOfficeWorkbook(book(OFFICE_HEADERS, officeRows()), "2026-09-07");
    expect(result.office.months).toEqual(["2026-09"]);
    expect(result.report).toMatchObject({ imported: 28, skipped: 0, repairedDates: 28 });
    expect(result.office.families.find(f => f.label === "MICROSOFT OFFICE 2021 (MAC)")?.values).toEqual([1]);
    expect(result.office.families.find(f => f.label === "MICROSOFT OFFICE STANDARD")?.values).toEqual([27]);
  });
  it("does not reinterpret an explicit historical workbook without a weekly cut", () => {
    const result = parseAgaOfficeWorkbook(book(OFFICE_HEADERS, officeRows()));
    expect(result.office.months).toEqual(["2026-01", "2026-02", "2026-03", "2026-04"]);
    expect(result.report.repairedDates).toBe(0);
  });
  it("rejects mixed plausible and out-of-window native dates rather than guessing", () => {
    expect(() => parseAgaOfficeWorkbook(book(OFFICE_HEADERS, [["a",1,"MICROSOFT WORD",date(1)], ["b",1,"MICROSOFT WORD",date(9,2)]]), "2026-09-07")).toThrow(/ambiguas/);
  });
  it("rejects a repaired date after the explicit cut", () => {
    expect(() => parseAgaOfficeWorkbook(book(OFFICE_HEADERS, [["a",1,"MICROSOFT WORD",date(12)]]), "2026-09-07")).toThrow(/ambiguas/);
  });
  it("consolidates all 981 managed positions into the completed week 36", () => {
    const result = parseAgaGestionadoWorkbook(book(MANAGED_HEADERS, managedRows()));
    expect(result.managed.weeklyTotals).toEqual([{ week: "2026-09-07", total: 981 }]);
  });
  it("does not swap already-correct native dates next to a previous-month text date", () => {
    expect(agaOfficeDatesAreSwapped(["31/08/2026", date(9, 1), date(9, 2)])).toBe(false);
    const result = parseAgaGestionadoWorkbook(book(MANAGED_HEADERS, managedRows(true)));
    expect(result.managed.weeklyTotals).toEqual([{ week: "2026-09-07", total: 981 }]);
  });
  it("rejects an inverted extraction date before accepting any TXT sections", () => {
    expect(() => parseAgaTexto("AGA TEXTO PLANO v1\nsemana\t2026-07-09\n[SEMANAS]\n2026-07-09\t830")).toThrow(/lunes/);
  });
  it("rejects Office wholly outside the weekly window instead of preserving stale Office silently", () => {
    expect(() => parseAgaTexto("AGA TEXTO PLANO v1\nsemana\t2026-09-07\n[OFFICE]\n2026-01\tMICROSOFT WORD\t28")).toThrow(/Office.*periodo/);
  });
  it("runs the same 28-position correction and MAC classification in Apps Script", () => {
    const script = drive();
    const result = script.readOffice(entry(script, OFFICE_HEADERS, officeRows()), "2026-09-07");
    expect(result.rows).toBe(28);
    expect(result.corregidas).toBe(28);
    expect(result.counts["2026-09"]["MICROSOFT OFFICE 2021 (MAC)"]).toBe(1);
  });
  it("Apps Script refuses unknown Office products without generating a partial section", () => {
    const script = drive();
    expect(() => script.readOffice(entry(script, OFFICE_HEADERS, [["a",1,"UNKNOWN",date(9,2)]]), "2026-09-07")).toThrow(/sin familia/);
  });
  it("Apps Script rejects an inverted extraction and accepts the correct Monday", () => {
    const script = drive();
    let extraction: unknown = date(7, 9);
    script.sheetByName = () => ({ getLastRow: () => 2, getRange: () => ({ getValues: () => [
      [script.CONFIG_KEYS.folder, "test-folder"], [script.CONFIG_KEYS.extraction, extraction],
    ] }) });
    expect(() => script.readConfig()).toThrow(/lunes/);
    extraction = "2026-09-07";
    expect(script.readConfig().extraction).toBe("2026-09-07");
  });
  it("Apps Script preserves normalized dates and detects mixed converted managed dates", () => {
    const script = drive();
    expect(script.columnaConFechasIntercambiadas(entry(script, MANAGED_HEADERS, managedRows()).sheets[0], 3)).toBe(true);
    expect(script.columnaConFechasIntercambiadas(entry(script, MANAGED_HEADERS, managedRows(true)).sheets[0], 3)).toBe(false);
  });
});

