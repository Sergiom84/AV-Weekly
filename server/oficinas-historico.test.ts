import { describe, expect, it } from "vitest";
// The operational importer intentionally stays plain ESM so it can run with
// `node` in production without a TypeScript runtime.
// @ts-expect-error No declaration file for the operational .mjs script.
import {
  addMissingRows,
  readDTBlock,
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

/**
 * Two directorate blocks stacked in the same column, the shape of
 * "RECICLADORES RESUELTAS": 2025 on top, 2024 below, each announced by a row
 * carrying only its year.
 */
function stackedYearBlocks(): unknown[][] {
  const width = 12;
  const cell = (label: unknown, weeks: number[]) => {
    const cells = Array<unknown>(width).fill(null);
    cells[6] = label;
    weeks.forEach((value, index) => {
      cells[8 + index] = value;
    });
    return cells;
  };
  const header = () => {
    const cells = Array<unknown>(width).fill(null);
    cells[6] = "Semana";
    cells[7] = "Media";
    [1, 2, 3].forEach((week, index) => {
      cells[8 + index] = week;
    });
    return cells;
  };

  return [
    cell("2025", []),
    header(),
    cell("DT.SUR", [17, 35, 47]),
    cell("Total general", [17, 35, 47]),
    cell(null, []),
    cell("2024", []),
    header(),
    cell("DT.SUR", [48, 56, 65]),
    cell("Total general", [48, 56, 65]),
  ];
}

describe("historic directorate blocks", () => {
  it("reads the block of the year asked for, not the first one on the sheet", () => {
    const values = (year: number) =>
      readDTBlock(stackedYearBlocks(), year, "TOTAL GENERAL", 6).flatMap(
        (row: { values: { value: number }[] }) => row.values.map((cell) => cell.value)
      );

    // The bug this pins: 2024 used to come back as 2025's figures relabelled,
    // which put a copy of 2025 on the chart under the previous year's name.
    expect(values(2024)).toEqual([48, 56, 65]);
    expect(values(2025)).toEqual([17, 35, 47]);
  });

  it("imports nothing rather than the neighbouring year when the year is absent", () => {
    expect(readDTBlock(stackedYearBlocks(), 2023, "TOTAL GENERAL", 6)).toEqual([]);
  });

  it("keeps the week each column declares instead of its position", () => {
    const grid = stackedYearBlocks();
    // A column inserted before the weeks must not shift the whole series.
    grid[6][8] = 4;
    grid[6][9] = 5;
    grid[6][10] = 6;

    const weeks = readDTBlock(grid, 2024, "TOTAL GENERAL", 6).flatMap(
      (row: { values: { week: number }[] }) => row.values.map((cell) => cell.week)
    );

    expect(weeks).toEqual([4, 5, 6]);
  });
});

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
