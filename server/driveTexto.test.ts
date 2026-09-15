import { describe, expect, it } from "vitest";
import { unwrapDriveCopiedLine, unwrapDriveCopiedTexto } from "./driveTexto.ts";

describe("unwrapDriveCopiedTexto", () => {
  it("unwraps a quoted TSV cell and leaves the header alone", () => {
    expect(unwrapDriveCopiedLine("INFORMATICA TEXTO PLANO v1")).toBe(
      "INFORMATICA TEXTO PLANO v1"
    );
    expect(unwrapDriveCopiedLine('"semana\t2026-09-15"')).toBe(
      "semana\t2026-09-15"
    );
    expect(unwrapDriveCopiedLine('"A. Maura\tDT Cataluña\t""Sede"""')).toBe(
      'A. Maura\tDT Cataluña\t"Sede"'
    );
  });

  it("normalises a Drive column paste", () => {
    const pasted = [
      "INFORMATICA TEXTO PLANO v1",
      '"semana\t2026-09-15"',
      "[EDIFICIOS]",
      '"A. Maura\tDT Cataluña\t\t\t\t-PL ANTONIO MAURA, 6,\tSi\t1"',
    ].join("\r\n");

    expect(unwrapDriveCopiedTexto(pasted).split("\n")).toEqual([
      "INFORMATICA TEXTO PLANO v1",
      "semana\t2026-09-15",
      "[EDIFICIOS]",
      "A. Maura\tDT Cataluña\t\t\t\t-PL ANTONIO MAURA, 6,\tSi\t1",
    ]);
  });
});
