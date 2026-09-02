import { describe, expect, it } from "vitest";
import {
  historicalWritableMonths,
  mergeOfficeHistory,
} from "../scripts/importar-historico-office-aga.mjs";

describe("histórico Office AGA", () => {
  const matrix = {
    months: ["2026-05", "2026-06", "2026-07", "2026-08"],
    rows: [
      { label: "MICROSOFT OFFICE STANDARD", values: [56, 40, 30, 4] },
      { label: "MICROSOFT OFFICE 365", values: [41, 37, 44, 11] },
      { label: "MICROSOFT ACCESS", values: [3, 6, 9, null] },
    ],
  };

  it("escribe mayo-julio y protege la última columna mensual del libro", () => {
    expect(historicalWritableMonths(matrix.months)).toEqual([
      "2026-05",
      "2026-06",
      "2026-07",
    ]);
  });

  it("restaura julio y conserva el agosto más reciente del export semanal", () => {
    const office = {
      months: ["2026-07", "2026-08"],
      families: [
        { label: "MICROSOFT OFFICE STANDARD", values: [6, 9] },
        { label: "MICROSOFT OFFICE 365", values: [1, 16] },
        { label: "MICROSOFT ACCESS", values: [null, 3] },
      ],
      source: { sourceFile: "AGA 2026-08-31.txt", uploadedAt: "2026-09-01T07:20:41Z" },
    };

    const merged = mergeOfficeHistory(office, matrix);
    const values = (label: string) =>
      merged.families.find((family) => family.label === label)?.values;

    expect(merged.months).toEqual(["2026-05", "2026-06", "2026-07", "2026-08"]);
    expect(values("MICROSOFT OFFICE STANDARD")).toEqual([56, 40, 30, 9]);
    expect(values("MICROSOFT OFFICE 365")).toEqual([41, 37, 44, 16]);
    expect(values("MICROSOFT ACCESS")).toEqual([3, 6, 9, 3]);
    expect(merged.source).toEqual(office.source);
  });

  it("mantiene nulos históricos y no inventa valores para filas ausentes", () => {
    const office = {
      months: ["2026-06", "2026-08"],
      families: [{ label: "Serie sólo semanal", values: [7, 8] }],
    };

    const merged = mergeOfficeHistory(office, matrix);
    const access = merged.families.find((family) => family.label === "MICROSOFT ACCESS");
    const weekly = merged.families.find((family) => family.label === "Serie sólo semanal");

    expect(access?.values).toEqual([3, 6, 9, null]);
    expect(weekly?.values).toEqual([null, 7, null, 8]);
  });
});
