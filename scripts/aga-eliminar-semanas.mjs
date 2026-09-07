/**
 * Removes weeks from the stored AGA dataset.
 *
 * The weekly import merges: a text writes the weeks it carries and leaves the
 * rest alone, which is what lets a partial Drive run refresh one section
 * without blanking the others. The price is that a week written under a wrong
 * date can never be taken out from the application, and one did get written:
 * until commit fa37544 the Drive script trusted the dates the spreadsheet had
 * already converted, and a `dd/mm` cell whose day was 12 or less came back with
 * day and month swapped.
 *
 * That produced two kinds of ghost week in production:
 *
 * - `2026-07-09` in section 1, the extraction Monday `2026-09-07` read as
 *   9 July. It charts as a second S28 next to the real one.
 * - `2026-01-12`, `2026-02-16`, `2026-03-16`, `2026-04-13` and `2026-05-11` in
 *   the managed section, the `Fecha Gestionado` column of the ZPT025 export
 *   read as `mm/dd`. They add up to 687 of the 981 positions of S36 and chart
 *   as five stray bars at the left of slide 2.1.
 *
 * The script removes the named weeks from every section that keys by week, and
 * nothing else. It is idempotent: a week that is not there is reported and
 * skipped. It prints the plan and stops unless `--aplicar` is given, and it
 * always writes a copy of the dataset before touching it.
 *
 *   node --env-file=.env scripts/aga-eliminar-semanas.mjs 2026-07-09 2026-01-12
 *   node --env-file=.env scripts/aga-eliminar-semanas.mjs --aplicar 2026-07-09
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { createClient } = require("@libsql/client");

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseArgs(argv) {
  const apply = argv.includes("--aplicar");
  const weeks = argv.filter((value) => value !== "--aplicar");

  for (const week of weeks) {
    if (!ISO_DATE.test(week)) {
      throw new Error(`"${week}" no es una fecha de semana (AAAA-MM-DD).`);
    }
  }

  if (weeks.length === 0) {
    throw new Error(
      "Indica al menos una semana a eliminar.\n" +
        "  node --env-file=.env scripts/aga-eliminar-semanas.mjs [--aplicar] AAAA-MM-DD..."
    );
  }

  return { apply, weeks: new Set(weeks) };
}

/** Rows of a `{ week, ... }` series, without the removed weeks. */
function dropFromSeries(series, weeks) {
  return (series ?? []).filter((entry) => !weeks.has(entry.week));
}

/**
 * Breakdown rows without the removed weeks.
 *
 * A row left with no counts is dropped too: it is a label of the removed week
 * and nothing else, and keeping it would draw a zero bar in every chart that
 * lists the labels of the section.
 */
function dropFromBreakdown(rows, weeks) {
  return (rows ?? [])
    .map((row) => ({ ...row, counts: dropFromSeries(row.counts, weeks) }))
    .filter((row) => row.counts.length > 0);
}

function dropFromManaged(managed, weeks) {
  if (!managed) return managed;

  return {
    ...managed,
    weeklyTotals: dropFromSeries(managed.weeklyTotals, weeks),
    byDepartment: dropFromBreakdown(managed.byDepartment, weeks),
    byProduct: dropFromBreakdown(managed.byProduct, weeks),
    byLocation: dropFromBreakdown(managed.byLocation, weeks),
    ...(managed.locationTotals
      ? { locationTotals: dropFromSeries(managed.locationTotals, weeks) }
      : {}),
    byDepartmentProduct: (managed.byDepartmentProduct ?? [])
      .map((entry) => ({
        ...entry,
        rows: dropFromBreakdown(entry.rows, weeks),
      }))
      .filter((entry) => entry.rows.length > 0),
  };
}

function weeksPresent(dataset, weeks) {
  const found = new Set();

  for (const week of dataset.weeks ?? []) {
    if (weeks.has(week.week)) found.add(week.week);
  }

  for (const entry of dataset.managed?.weeklyTotals ?? []) {
    if (weeks.has(entry.week)) found.add(entry.week);
  }

  return found;
}

async function main() {
  const { apply, weeks } = parseArgs(process.argv.slice(2));
  const client = createClient({
    url: process.env.SQL_TURSO,
    authToken: process.env.TOKEN_TURSO,
  });

  const result = await client.execute("SELECT data FROM aga_dataset WHERE id = 1");

  if (result.rows.length === 0) {
    throw new Error("No hay dataset de AGA guardado.");
  }

  const before = result.rows[0].data;
  const dataset = JSON.parse(before);

  const present = weeksPresent(dataset, weeks);
  const missing = Array.from(weeks).filter((week) => !present.has(week));

  console.log(`Semanas pedidas: ${Array.from(weeks).sort().join(", ")}`);
  if (missing.length > 0) {
    console.log(`  no están en el dataset (nada que hacer): ${missing.join(", ")}`);
  }

  const repaired = {
    ...dataset,
    weeks: (dataset.weeks ?? []).filter((week) => !weeks.has(week.week)),
    managed: dropFromManaged(dataset.managed, weeks),
  };

  const managedWeeks = (section) =>
    (section?.weeklyTotals ?? []).map((entry) => `${entry.week}=${entry.total}`);

  console.log("\nSección 1 (en gestión)");
  console.log(`  antes:   ${(dataset.weeks ?? []).map((w) => w.week).join(" ")}`);
  console.log(`  después: ${(repaired.weeks ?? []).map((w) => w.week).join(" ")}`);
  console.log("\nSección 2 (gestionadas)");
  console.log(`  antes:   ${managedWeeks(dataset.managed).join(" ")}`);
  console.log(`  después: ${managedWeeks(repaired.managed).join(" ")}`);

  if (!apply) {
    console.log("\nSimulación. Repite con --aplicar para escribir en Turso.");
    return;
  }

  const backupDir = path.resolve("tmp");
  const backup = path.join(
    backupDir,
    `aga_dataset-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  mkdirSync(backupDir, { recursive: true });
  writeFileSync(backup, before, "utf8");
  console.log(`\nCopia previa: ${backup}`);

  await client.execute({
    sql: "UPDATE aga_dataset SET data = ?, uploaded_at = datetime('now') WHERE id = 1",
    args: [JSON.stringify(repaired)],
  });

  console.log("Dataset actualizado.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
