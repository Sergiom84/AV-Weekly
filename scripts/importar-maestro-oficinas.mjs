/**
 * Seeds `masters.dtOffices` of `oficinas_dataset` from the office master.
 *
 * The weekly template counts incidents; it never says how many offices each
 * territorial directorate has, and without that denominator the deck cannot
 * print the ratio per office — the only figure that compares Canarias (107
 * offices) with Cataluña (420) fairly.
 *
 * The master is a different workbook, updated a couple of times a year, so it is
 * seeded by hand with this script instead of being re-read on every upload.
 *
 * Two decisions are deliberate:
 *
 * - The count is taken from the detail sheet "OFICINAS POR TERRITORIAL", one row
 *   per office, and not from the pre-pivoted "INFORME SEMANAL TEMPLATE 2026"
 *   tab. Both agree today (107 / 420 / 314 / 301 / 290 / 226 / 322 = 1.980); the
 *   detail sheet is the one that stays right when somebody forgets to refresh
 *   the pivot.
 * - Directorate labels are normalised through the module's `normalizeDT`: the
 *   master writes "D.T. CATALUNYA" and the weekly template "D.T. CATALUÑA", and
 *   an unnormalised master would look up a directorate that never matches and
 *   blank every ratio.
 *
 * Idempotent: it replaces `masters` and touches nothing else in the dataset, so
 * re-running it after a weekly upload changes only the office counts.
 *
 *   node scripts/importar-maestro-oficinas.mjs [ruta.xlsx]
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
const { createClient } = require("@libsql/client");

const DEFAULT_SOURCE =
  "C:/Users/sergi/Desktop/MIX/Oficinas/OFICINAS POR TERRITORIALES_BANCA COMERICAL.xlsx";

/** Sheet with one row per office. Matched case-insensitively, not by exact name. */
const SHEET_HINT = "OFICINAS POR TERRITORIAL";

/**
 * Canonical directorate labels, mirrored from
 * `shared/modules/oficinas/types.ts`.
 *
 * Duplicated on purpose: the script is plain `.mjs` run by node with no
 * transpiler, and importing a `.ts` module here would need one. The list is
 * seven constants that change when BBVA reorganises its territories; the cost of
 * the copy is lower than the cost of a build step for a seeding script.
 */
const DT_LABELS = [
  "D.T. CANARIAS",
  "D.T. CATALUÑA",
  "D.T. CENTRO",
  "D.T. ESTE",
  "D.T. NOROESTE",
  "D.T. NORTE",
  "D.T. SUR",
];

const OTHERS = "OTROS";

function dtKey(raw) {
  return String(raw ?? "")
    .normalize("NFD")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .replace(/^DT/, "")
    .replace(/^CATALUNYA$/, "CATALUNA");
}

function normalizeDT(raw) {
  const text = String(raw ?? "").replace(/\(en blanco\)/i, "").trim();

  if (text === "") {
    return OTHERS;
  }

  const key = dtKey(text);

  if (key === "") {
    return OTHERS;
  }

  return DT_LABELS.find((label) => dtKey(label) === key) ?? text.replace(/\s+/g, " ");
}

function readOffices(path) {
  const workbook = XLSX.readFile(path);
  const name = workbook.SheetNames.find((sheet) =>
    sheet.toUpperCase().includes(SHEET_HINT)
  );

  if (!name) {
    throw new Error(
      `El libro no trae ninguna hoja "${SHEET_HINT}". Hojas: ${workbook.SheetNames.join(", ")}`
    );
  }

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false,
  });

  const counts = new Map();
  let skipped = 0;

  // Row 0 is the header ("DT", "Oficina", "Código Oficina", ...).
  for (let r = 1; r < rows.length; r += 1) {
    const dt = normalizeDT(rows[r]?.[0]);
    const code = rows[r]?.[2];

    if (code === null || code === undefined || String(code).trim() === "") {
      skipped += 1;
      continue;
    }

    counts.set(dt, (counts.get(dt) ?? 0) + 1);
  }

  return { sheet: name, counts, skipped, rows: rows.length - 1 };
}

async function main() {
  const path = process.argv[2] ?? DEFAULT_SOURCE;
  const { sheet, counts, skipped, rows } = readOffices(path);

  const dtOffices = [...counts.entries()]
    .map(([dt, offices]) => ({ dt, offices }))
    .sort((a, b) => a.dt.localeCompare(b.dt, "es"));

  const url = process.env.URL_TURSO ?? "file:./data/av-weekly.db";
  const client = createClient(
    url.startsWith("file:") ? { url } : { url, authToken: process.env.TOKEN_TURSO }
  );

  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS oficinas_dataset (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL,
      source_file TEXT,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const result = await client.execute(
    "SELECT data, source_file FROM oficinas_dataset WHERE id = 1"
  );
  const existing = result.rows.length > 0 ? JSON.parse(result.rows[0].data) : null;

  const dataset = {
    ...(existing ?? {}),
    masters: { dtOffices },
    source: {
      sourceFile: existing?.source?.sourceFile ?? null,
      uploadedAt: existing?.source?.uploadedAt ?? null,
    },
  };

  await client.execute({
    sql: `INSERT INTO oficinas_dataset (id, data, source_file, uploaded_at)
          VALUES (1, ?, ?, datetime('now'))
          ON CONFLICT(id) DO UPDATE
          SET data = excluded.data, source_file = excluded.source_file`,
    args: [JSON.stringify(dataset), dataset.source.sourceFile],
  });

  const total = dtOffices.reduce((sum, entry) => sum + entry.offices, 0);

  console.log(`Fuente: ${path}`);
  console.log(`Pestaña: ${sheet}`);
  console.log(`Filas leídas: ${rows} (descartadas sin código de oficina: ${skipped})\n`);
  console.log("DT                 Oficinas");

  for (const entry of dtOffices) {
    console.log(`${entry.dt.padEnd(18)} ${String(entry.offices).padStart(8)}`);
  }

  console.log(`${"TOTAL".padEnd(18)} ${String(total).padStart(8)}`);

  const unknown = dtOffices.filter((entry) => !DT_LABELS.includes(entry.dt));

  if (unknown.length > 0) {
    console.log(
      `\nAviso: ${unknown.length} etiquetas no reconocidas como DT canónica ` +
        `(${unknown.map((entry) => entry.dt).join(", ")}). Se guardan tal cual.`
    );
  }

  console.log(
    existing
      ? "\nmasters.dtOffices actualizado; el resto del dataset queda intacto."
      : "\noficinas_dataset creado solo con masters.dtOffices; falta subir el template semanal."
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
