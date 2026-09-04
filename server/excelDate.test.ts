import { describe, expect, it } from "vitest";
import { parseExcelDate, parseExcelMonth } from "./excelDate.ts";

describe("parseExcelDate", () => {
  it("reads d/m/aaaa, ISO, Date and serial as the same UTC day", () => {
    const expected = "2026-01-05";
    const serial = (Date.UTC(2026, 0, 5) - Date.UTC(1899, 11, 30)) / 86_400_000;

    expect(parseExcelDate("5/1/2026")?.toISOString().slice(0, 10)).toBe(expected);
    expect(parseExcelDate("2026-01-05")?.toISOString().slice(0, 10)).toBe(expected);
    expect(parseExcelDate(new Date(Date.UTC(2026, 0, 5)))?.toISOString().slice(0, 10)).toBe(
      expected
    );
    expect(parseExcelDate(serial)?.toISOString().slice(0, 10)).toBe(expected);
    expect(parseExcelDate(String(serial))?.toISOString().slice(0, 10)).toBe(expected);
  });

  it("treats // as not closed", () => {
    expect(parseExcelDate("//")).toBeNull();
  });
});

describe("parseExcelMonth", () => {
  it("reads YYYY/MM, serials and Date cells", () => {
    const serial = (Date.UTC(2026, 7, 1) - Date.UTC(1899, 11, 30)) / 86_400_000;

    expect(parseExcelMonth("2026/08")).toBe("2026-08");
    expect(parseExcelMonth("2026-08")).toBe("2026-08");
    expect(parseExcelMonth(new Date(Date.UTC(2026, 7, 15)))).toBe("2026-08");
    expect(parseExcelMonth(serial)).toBe("2026-08");
  });
});
