/**
 * Loads the Informatica building catalogue into libSQL.
 *
 * The weekly Drive text writes `E{hash}` instead of a building and no longer
 * carries `[EDIFICIOS]`, so this table is the only thing that can name a code
 * back. It lives outside `informatica_dataset` because an import with complete
 * scope replaces that row wholesale.
 *
 * The load grows the catalogue instead of replacing it: a building dropped from
 * one export still names the older rows. Re-running after editing the TSV is
 * therefore safe and adds only what is new.
 *
 *   node scripts/importar-edificios-informatica.mjs [ruta.tsv]
 */

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  mergeEdificioCatalog,
  parseEdificioCatalogTsv,
} from "../server/informaticaEdificios.ts";

const require = createRequire(import.meta.url);
const { createClient } = require("@libsql/client");

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SOURCE = path.join(here, "..", "server", "assets", "informatica-edificios.tsv");

async function main() {
  const sourcePath = path.resolve(process.argv[2] ?? DEFAULT_SOURCE);
  const rows = parseEdificioCatalogTsv(fs.readFileSync(sourcePath, "utf8"));

  if (rows.length === 0) {
    throw new Error(`${sourcePath} no contiene ninguna fila de catalogo.`);
  }

  const databaseUrl =
    process.env.URL_TURSO ?? process.env.SQL_TURSO ?? "file:./data/av-weekly.db";
  const db = createClient(
    databaseUrl.startsWith("file:")
      ? { url: databaseUrl }
      : { url: databaseUrl, authToken: process.env.TOKEN_TURSO }
  );
  const sourceFile = path.basename(sourcePath);

  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS informatica_edificios (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL,
      source_file TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const stored = await db.execute("SELECT data FROM informatica_edificios WHERE id = 1");
  let current = [];

  if (stored.rows.length > 0) {
    try {
      const parsed = JSON.parse(stored.rows[0].data);

      if (Array.isArray(parsed)) current = parsed;
    } catch {
      current = [];
    }
  }

  const merged = mergeEdificioCatalog(current, rows);

  await db.execute({
    sql: `INSERT INTO informatica_edificios (id, data, source_file, updated_at)
          VALUES (1, ?, ?, datetime('now'))
          ON CONFLICT(id) DO UPDATE
          SET data = excluded.data,
              source_file = excluded.source_file,
              updated_at = excluded.updated_at`,
    args: [JSON.stringify(merged), sourceFile],
  });

  const sites = new Set(merged.map(row => row.edificio));

  console.log(`Origen: ${sourcePath}`);
  console.log(`Destino: ${databaseUrl.startsWith("file:") ? databaseUrl : "Turso"}`);
  console.log(`  leidas ${rows.length} filas, catalogo previo ${current.length}`);
  console.log(`  catalogo resultante ${merged.length} filas, ${sites.size} edificios`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
