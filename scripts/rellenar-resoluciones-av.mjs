/**
 * Fills missing ISO weeks in informe_resolution_history for a year, without
 * overwriting a week that already has rows.
 *
 *   pnpm exec tsx --env-file=.env scripts/rellenar-resoluciones-av.mjs <plano.xlsx> [year]
 */
import { createRequire } from "node:module";
import { createClient } from "@libsql/client";
import {
  fillResolutionHistoryGaps,
  parseInformePlanoWorkbook,
} from "../server/parseInformePlano.ts";
import { INFORME_SUPPORT_TYPES } from "../shared/informe.ts";

const XLSX = createRequire(import.meta.url)("xlsx");

const file = process.argv[2];
const year = process.argv[3] ?? "2026";

if (!file) {
  console.error("usage: tsx --env-file=.env scripts/rellenar-resoluciones-av.mjs <plano.xlsx> [year]");
  process.exit(1);
}

const url = process.env.SQL_TURSO ?? process.env.URL_TURSO;
const token = process.env.TOKEN_TURSO;
if (!url || !token) {
  console.error("missing SQL_TURSO / TOKEN_TURSO");
  process.exit(1);
}

const workbook = XLSX.readFile(file);
const parsed = parseInformePlanoWorkbook(workbook);
const incoming = parsed.byYear[year];

if (!incoming) {
  console.error(`no year ${year} in ${file}; years: ${parsed.years.join(", ")}`);
  process.exit(1);
}

const client = createClient({ url, authToken: token });
const result = await client.execute(
  "SELECT data FROM informe_resolution_history WHERE id = 1"
);

if (result.rows.length === 0) {
  console.error("informe_resolution_history is empty");
  process.exit(1);
}

const stored = JSON.parse(result.rows[0].data);
const currentYear = stored.byYear[year] ?? Object.fromEntries(
  INFORME_SUPPORT_TYPES.map((type) => [type, {}])
);

const filled = Object.fromEntries(
  INFORME_SUPPORT_TYPES.map((type) => [
    type,
    fillResolutionHistoryGaps(currentYear[type] ?? {}, incoming[type] ?? {}),
  ])
);

const summary = {};
for (const type of INFORME_SUPPORT_TYPES) {
  const before = Object.keys(currentYear[type] ?? {}).length;
  const after = Object.keys(filled[type]).length;
  summary[type] = { before, after, added: after - before };
}

stored.byYear[year] = filled;

await client.execute({
  sql: `INSERT INTO informe_resolution_history (id, data, uploaded_at)
        VALUES (1, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE
        SET data = excluded.data, uploaded_at = excluded.uploaded_at`,
  args: [JSON.stringify(stored)],
});

console.log(JSON.stringify({ year, file, summary }, null, 2));
