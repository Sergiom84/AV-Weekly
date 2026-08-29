/**
 * Loads the frozen Informatica series into libSQL.
 *
 * These are published monthly figures the weekly extracts cannot reproduce: the
 * incident series starts in 2022 while the template only carries data from
 * mid-May 2025, and the work order history was captured under a building master
 * that no longer resolves the same rows. They live in their own table because an
 * import with complete scope replaces `informatica_dataset` wholesale.
 *
 * Idempotent: the table is rebuilt in one write batch, so re-running it after
 * regenerating the TSV replaces the series instead of duplicating it.
 *
 *   node scripts/importar-historico-informatica.mjs [ruta.tsv]
 */

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { createClient } = require("@libsql/client");

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SOURCE = path.join(here, "..", "server", "assets", "informatica-historico.tsv");

const MONTH = /^\d{4}\/\d{2}$/;

/** Rows of the asset, with every defect reported rather than skipped quietly. */
function readSeries(sourcePath) {
  const text = fs.readFileSync(sourcePath, "utf8");
  const rows = [];
  const problems = [];

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();

    if (line === "" || line.startsWith("#")) {
      return;
    }

    const [serie, mes, total] = raw.split("\t");
    const value = Number(total);

    if (!serie || !MONTH.test(String(mes).trim()) || !Number.isFinite(value)) {
      problems.push(`linea ${index + 1}: ${raw}`);
      return;
    }

    rows.push({ serie: serie.trim(), mes: String(mes).trim(), total: Math.round(value) });
  });

  if (problems.length > 0) {
    throw new Error(`Filas invalidas en ${sourcePath}:\n  ${problems.join("\n  ")}`);
  }

  if (rows.length === 0) {
    throw new Error(`${sourcePath} no contiene ninguna fila de datos.`);
  }

  return rows;
}

async function main() {
  const sourcePath = path.resolve(process.argv[2] ?? DEFAULT_SOURCE);
  const rows = readSeries(sourcePath);
  const databaseUrl =
    process.env.URL_TURSO ?? process.env.SQL_TURSO ?? "file:./data/av-weekly.db";
  const db = createClient(
    databaseUrl.startsWith("file:")
      ? { url: databaseUrl }
      : { url: databaseUrl, authToken: process.env.TOKEN_TURSO }
  );
  const sourceFile = path.basename(sourcePath);

  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS informatica_historico (
      serie TEXT NOT NULL,
      mes TEXT NOT NULL,
      total INTEGER NOT NULL,
      source_file TEXT,
      imported_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (serie, mes)
    );
  `);

  await db.batch(
    [
      { sql: "DELETE FROM informatica_historico", args: [] },
      ...rows.map((row) => ({
        sql: `INSERT INTO informatica_historico (serie, mes, total, source_file)
              VALUES (?, ?, ?, ?)`,
        args: [row.serie, row.mes, row.total, sourceFile],
      })),
    ],
    "write"
  );

  const byName = new Map();

  for (const row of rows) {
    const seen = byName.get(row.serie) ?? { count: 0, from: row.mes, to: row.mes };

    seen.count += 1;
    seen.from = row.mes < seen.from ? row.mes : seen.from;
    seen.to = row.mes > seen.to ? row.mes : seen.to;
    byName.set(row.serie, seen);
  }

  console.log(`Origen: ${sourcePath}`);
  console.log(`Destino: ${databaseUrl.startsWith("file:") ? databaseUrl : "Turso"}`);

  for (const [serie, seen] of Array.from(byName.entries()).sort()) {
    console.log(`  ${serie}: ${seen.count} meses, ${seen.from} -> ${seen.to}`);
  }

  console.log(`Total ${rows.length} filas.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
