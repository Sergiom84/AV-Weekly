/**
 * Loads the Office history of AGA into `aga_dataset`, once.
 *
 * The weekly export only carries the month in flight, so the months before it
 * come from a workbook the responsible keeps by hand: a matrix with one row per
 * product and one column per month, already aggregated. This script folds that
 * matrix into the stored Office section.
 *
 * Two rules, both deliberate:
 *
 * - The month in flight is never written. The matrix is a snapshot taken the
 *   day it was exported, so its last column is a partial month, while the
 *   weekly import owns that month and keeps it current. Overwriting it here
 *   would replace a finished figure with a stale one.
 * - Nothing else is touched. Months absent from the matrix keep whatever the
 *   dataset already holds, so running this twice changes nothing.
 *
 *   node scripts/importar-historico-office-aga.mjs [ruta.xlsx] [--aplicar]
 *
 * Without `--aplicar` it only prints what it would write.
 */

import "dotenv/config";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
const { createClient } = require("@libsql/client");

const DEFAULT_SOURCE = "C:/Users/sergi/Desktop/MIX/AV weekly/AGA/Histo office.xlsx";

/** `YYYY-MM` of a header cell, whatever shape the export gives it. */
export function monthOf(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
  }

  const raw = String(value ?? "").trim();
  const iso = /^(\d{4})[-/.](\d{1,2})/.exec(raw);

  return iso ? `${iso[1]}-${iso[2].padStart(2, "0")}` : null;
}

/** The matrix as `{ months, rows: [{ label, values }] }`. */
export function readMatrix(path) {
  const workbook = XLSX.read(readFileSync(path), { type: "buffer", cellDates: true });
  const grid = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {
    header: 1,
    defval: null,
    raw: true,
  });

  const headerRow = grid.findIndex((row) => (row ?? []).some((cell) => monthOf(cell)));

  if (headerRow < 0) {
    throw new Error("No hay una fila de cabecera con meses en el libro.");
  }

  const columns = [];

  (grid[headerRow] ?? []).forEach((cell, index) => {
    const month = monthOf(cell);
    if (month) columns.push({ month, index });
  });

  const rows = [];

  for (const row of grid.slice(headerRow + 1)) {
    const label = String((row ?? [])[0] ?? "").trim();
    if (label === "") continue;

    rows.push({
      label,
      values: columns.map(({ index }) => {
        const value = (row ?? [])[index];
        return typeof value === "number" && Number.isFinite(value) ? value : null;
      }),
    });
  }

  return { months: columns.map((column) => column.month), rows };
}

/**
 * Historical months safe to import.
 *
 * The last monthly column is the snapshot still in flight, regardless of the
 * calendar date on the machine that runs this script. The weekly Office export
 * owns that month and must keep any newer value already stored in Turso.
 */
export function historicalWritableMonths(months) {
  return months.slice(0, -1);
}

/** Folds every closed historical month into an existing Office section. */
export function mergeOfficeHistory(office, matrix) {
  const writable = historicalWritableMonths(matrix.months);
  const months = Array.from(new Set([...office.months, ...writable])).sort();
  const labels = [
    ...office.families.map((family) => family.label),
    ...matrix.rows.map((row) => row.label),
  ].filter((label, index, all) => all.indexOf(label) === index);

  const valueOf = (label, month) => {
    const row = matrix.rows.find((entry) => entry.label === label);
    const position = matrix.months.indexOf(month);

    return row && position >= 0 ? row.values[position] : undefined;
  };

  const stored = (label, month) => {
    const family = office.families.find((entry) => entry.label === label);
    const position = office.months.indexOf(month);

    return family && position >= 0 ? (family.values[position] ?? null) : null;
  };

  return {
    ...office,
    months,
    families: labels.map((label) => ({
      label,
      values: months.map((month) => {
        if (!writable.includes(month)) return stored(label, month);

        const value = valueOf(label, month);
        return value === undefined ? stored(label, month) : value;
      }),
    })),
  };
}

async function main() {
  const [, , ...argv] = process.argv;
  const source = argv.find((arg) => !arg.startsWith("--")) ?? DEFAULT_SOURCE;
  const apply = argv.includes("--aplicar");
  const matrix = readMatrix(source);
  const writable = historicalWritableMonths(matrix.months);
  const protectedMonth = matrix.months.at(-1) ?? null;
  const client = createClient({ url: process.env.SQL_TURSO, authToken: process.env.TOKEN_TURSO });
  const result = await client.execute("SELECT data FROM aga_dataset WHERE id = 1");

  if (result.rows.length === 0) {
    throw new Error("No hay dataset de AGA guardado.");
  }

  const data = JSON.parse(String(result.rows[0].data));
  const office = data.office ?? { months: [], families: [] };
  const next = mergeOfficeHistory(office, matrix);

  console.log(`Origen: ${source}`);
  console.log(`Meses del libro: ${matrix.months.join(" ")}`);
  console.log(`Meses que se escriben: ${writable.join(" ")}`);
  console.log(`Última columna del libro, respetada: ${protectedMonth ?? "ninguna"}`);
  console.log(`\nMeses resultantes: ${next.months.join(" ")}`);

  for (const family of next.families) {
    console.log(" ", family.label.padEnd(46), JSON.stringify(family.values));
  }

  if (!apply) {
    console.log("\nSimulación. Nada escrito. Añade --aplicar para guardar.");
    await client.close();
    return;
  }

  data.office = next;

  await client.execute({
    sql: "UPDATE aga_dataset SET data = ?, uploaded_at = datetime('now') WHERE id = 1",
    args: [JSON.stringify(data)],
  });

  await client.close();
  console.log("\nEscrito en aga_dataset.");
}

const isCli = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isCli) {
  await main();
}
