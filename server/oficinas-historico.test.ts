import { describe, expect, it } from "vitest";
// The operational importer intentionally stays plain ESM so it can run with
// `node` in production without a TypeScript runtime.
// @ts-expect-error No declaration file for the operational .mjs script.
import {
  addMissingRows,
  readPreviousTypeRows,
} from "../scripts/importar-historico-oficinas.mjs";

function historicTypeGrid(): unknown[][] {
  const header = Array<unknown>(45).fill(null);
  header[6] = "Semana";
  header[7] = "Media";

  for (let week = 1; week <= 35; week += 1) header[7 + week] = week;

  const row = (label: string, week35: number) => {
    const cells = Array<unknown>(45).fill(null);
    cells[6] = label;
    cells[42] = week35;
    return cells;
  };

  return [
    header,
    row("AMPLIACIÓN", 14),
    row("REINSTALACION", 6),
    row("SUSTITUCION", 19),
    row("TOTAL", 39),
  ];
}

describe("historic request types", () => {
  it("aligns the reported taxonomy without creating absent categories", () => {
    const rows = readPreviousTypeRows(historicTypeGrid(), 2025);

    expect(rows.map((row: { label: string }) => row.label)).toEqual([
      "AMPLIACIÓN",
      "REINSTALACIÓN",
      "SUSTITUCIÓN DE TERMINAL YA GENERADO",
    ]);
    expect(
      rows
        .flatMap((row: { values: { year: number; week: number; value: number }[] }) => row.values)
        .filter((cell: { week: number }) => cell.week === 35)
    ).toEqual([
      { year: 2025, week: 35, value: 14 },
      { year: 2025, week: 35, value: 6 },
      { year: 2025, week: 35, value: 19 },
    ]);
  });

  it("is additive and idempotent per year-week cell", () => {
    const incoming = readPreviousTypeRows(historicTypeGrid(), 2025);
    const first = addMissingRows([], incoming);
    const second = addMissingRows(first.rows, incoming);

    expect(first.added).toBe(3);
    expect(second.added).toBe(0);
    expect(second.rows).toEqual(first.rows);
  });
});
