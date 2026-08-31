import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import type { AgaOfficeSection } from "../shared/modules/aga/types.ts";
import {
  AGA_OFFICE_FAMILIES,
  agaOfficeFamily,
  agaOfficeMonth,
  mergeAgaOfficeSection,
  parseAgaOfficeWorkbook,
} from "./parseAgaOffice.ts";

const HEADERS = [
  "Estado de la Posición",
  "Fecha de inicio de la gestión",
  "Denominación Producto",
  "Nº Posición de petición",
  "Nº Petición de sistemas",
];

function workbook(rows: unknown[][]): XLSX.WorkBook {
  const result = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    result,
    XLSX.utils.aoa_to_sheet([["Informe Office"], HEADERS, ...rows]),
    "Nombre variable"
  );
  return result;
}

function row(
  request: string,
  position: number,
  product: string,
  date: unknown = 46237,
  status = "FINALIZADA"
): unknown[] {
  return [status, date, product, position, request];
}

describe("parser Office AGA", () => {
  it("reconcilia agosto con las cinco series presentadas y cuenta posiciones", () => {
    const rows = [
      ...Array.from({ length: 4 }, (_, index) =>
        row(`S${index}`, 1, "MICROSOFT OFFICE LTSC STANDARD 2024")
      ),
      ...Array.from({ length: 14 }, (_, index) =>
        row(`E${Math.floor(index / 2)}`, (index % 2) + 1, "MICROSOFT EXCEL LTSC 2024")
      ),
      ...Array.from({ length: 11 }, (_, index) =>
        row(`O${index}`, 1, "MICROSOFT OFFICE 365 BUSINESS X64")
      ),
      ...Array.from({ length: 3 }, (_, index) =>
        row(`A${index}`, 1, "MICROSOFT ACCESS LTSC 2024")
      ),
      ...Array.from({ length: 12 }, (_, index) =>
        row(`W${index}`, 1, "MICROSOFT WORD LTSC 2024")
      ),
    ];
    // The actual August source includes one rejected Excel and the published
    // value 14 includes it. Preserve that parity until the owner says otherwise.
    rows[4][0] = "RECHAZADA";

    const parsed = parseAgaOfficeWorkbook(workbook(rows));

    expect(parsed.office.months).toEqual(["2026-08"]);
    expect(parsed.office.families.map((family) => family.label)).toEqual(AGA_OFFICE_FAMILIES);
    expect(parsed.office.families.map((family) => family.values[0])).toEqual([4, 14, 11, 3, 12]);
    expect(parsed.report).toMatchObject({ rows: 44, imported: 44, skipped: 0 });
  });

  it("clasifica Apple como Standard antes que el resto del nombre", () => {
    expect(agaOfficeFamily("MICROSOFT OFFICE 365 APPLE")).toBe(
      "MICROSOFT OFFICE STANDARD"
    );

    const parsed = parseAgaOfficeWorkbook(
      workbook([row("G1", 1, "MICROSOFT OFFICE 365 APPLE")])
    );
    expect(parsed.office.families[0].values).toEqual([1]);
    expect(parsed.office.families[2].values).toEqual([0]);
  });

  it("usa fecha de inicio de gestión y admite serial, Date y texto", () => {
    expect(agaOfficeMonth(46237)).toBe("2026-08");
    expect(agaOfficeMonth(new Date(2026, 7, 14))).toBe("2026-08");
    expect(agaOfficeMonth("14/08/2026")).toBe("2026-08");
    expect(agaOfficeMonth("2026-08-14")).toBe("2026-08");
  });

  it("devuelve día y mes a su sitio cuando el libro llegó en formato americano", () => {
    // The August export as the team delivers it: the positions dated from the
    // 13th on stay text, because 13 cannot be read as a month, and the earlier
    // ones arrive as dates with the day and the month exchanged.
    const parsed = parseAgaOfficeWorkbook(
      workbook([
        // 2026-03-08 and 2026-12-08: 08/03 and 08/12 read as month/day.
        row("G0", 1, "MICROSOFT ACCESS LTSC 2024", 46089),
        row("G1", 1, "MICROSOFT ACCESS LTSC 2024", 46364),
        row("G2", 1, "MICROSOFT ACCESS LTSC 2024", "13/08/2026"),
      ])
    );

    expect(parsed.office.months).toEqual(["2026-08"]);
    expect(parsed.office.families[3].values).toEqual([3]);
    expect(parsed.report).toMatchObject({ imported: 3, skipped: 0, repairedDates: 2 });
    expect(parsed.report.futureMonths).toEqual([]);
  });

  it("no toca una columna homogénea de fechas", () => {
    const parsed = parseAgaOfficeWorkbook(
      workbook([
        row("G0", 1, "MICROSOFT WORD LTSC 2024", 46089),
        row("G1", 1, "MICROSOFT WORD LTSC 2024", 46248),
      ])
    );

    expect(parsed.office.months).toEqual(["2026-03", "2026-08"]);
    expect(parsed.report.repairedDates).toBe(0);
  });

  it("señala los meses posteriores al mes en curso en vez de importarlos a ciegas", () => {
    const future = new Date();
    future.setMonth(future.getMonth() + 2);

    const parsed = parseAgaOfficeWorkbook(
      workbook([row("G0", 1, "MICROSOFT WORD LTSC 2024", future)])
    );

    expect(parsed.report.futureMonths).toEqual(parsed.office.months);
  });

  it("informa productos y fechas desconocidos sin perderlos en silencio", () => {
    const parsed = parseAgaOfficeWorkbook(
      workbook([
        row("G0", 1, "MICROSOFT OFFICE LTSC STANDARD 2024"),
        row("G1", 1, "LICENCIA DESCONOCIDA"),
        row("G2", 1, "MICROSOFT WORD LTSC 2024", null),
      ])
    );

    expect(parsed.office.months).toEqual(["2026-08"]);
    expect(parsed.report).toMatchObject({ rows: 3, imported: 1, skipped: 2 });
    expect(parsed.report.unknownProducts).toEqual([{ value: "LICENCIA DESCONOCIDA", count: 1 }]);
    expect(parsed.report.unknownDates).toEqual([{ value: "(en blanco)", count: 1 }]);
  });
});

describe("merge Office AGA", () => {
  it("sustituye sólo meses importados y preserva historia, extras y source", () => {
    const existing: AgaOfficeSection = {
      months: ["2026-07", "2026-08"],
      families: [
        { label: "MICROSOFT OFFICE STANDARD", values: [30, 99] },
        { label: "MICROSOFT OFFICE EXCEL", values: [23, 99] },
        { label: "Serie antigua", values: [7, 8] },
      ],
      source: { sourceFile: "anterior.xlsx", uploadedAt: "2026-08-01T00:00:00.000Z" },
    };
    const incoming = parseAgaOfficeWorkbook(
      workbook([
        row("G1", 1, "MICROSOFT OFFICE LTSC STANDARD 2024"),
        row("G2", 1, "MICROSOFT EXCEL LTSC 2024"),
      ])
    ).office;
    incoming.source = { sourceFile: "Office.xlsx", uploadedAt: "2026-08-21T00:00:00.000Z" };

    const merged = mergeAgaOfficeSection(existing, incoming);
    const family = (label: string) => merged.families.find((entry) => entry.label === label)?.values;

    expect(merged.months).toEqual(["2026-07", "2026-08"]);
    expect(family("MICROSOFT OFFICE STANDARD")).toEqual([30, 1]);
    expect(family("MICROSOFT OFFICE EXCEL")).toEqual([23, 1]);
    expect(family("MICROSOFT WORD")).toEqual([null, 0]);
    expect(family("Serie antigua")).toEqual([7, 8]);
    expect(merged.source).toEqual(incoming.source);
  });
});
