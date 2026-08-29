#!/usr/bin/env node
/**
 * Produces the `[RENOVE]` block of the Informatica plain text.
 *
 * Renove is the one section the Drive automation cannot generate: its source is
 * `Dashboards Renoves SSCC.xlsx`, a workbook the IT team publishes from Google
 * Sheets into the Renove dashboard, and it never reaches the `Bruto` folder
 * that `Codigo.gs` reads. So it is produced here and pasted after the sections
 * of the PLANO.
 *
 * Two inputs, one output:
 *
 *   node scripts/informatica-renove/exportar-renove.mjs --xlsx "…/Dashboards Renoves SSCC.xlsx"
 *   node --env-file=.env scripts/informatica-renove/exportar-renove.mjs --db
 *
 * `--xlsx` reads the workbook directly and is the path to use once the team
 * sends the file. `--db` reads the copy already loaded into the Renove
 * dashboard's Turso database, which is what exists today; it needs `URL_TURSO`
 * and `TOKEN_TURSO` of that database, not of AV Weekly's.
 *
 * The rows written are aggregated counts — day, month, week, scope, status and
 * a number. Petition numbers, serials and locations are read to group the rows
 * and are never written out, the same rule the PLANO follows everywhere else.
 */

import { readFileSync, writeFileSync } from "node:fs";
import * as XLSX from "xlsx";

/** Sheets of the consolidated workbook, four per scope. */
const SHEETS = {
  Holding: [
    "Holding - Onboarding semanal",
    "Holding - Renovados onboarding",
    "Holding - Renove semanal",
    "Holding - Renovados renove",
  ],
  España: [
    "España - Onboarding semanal",
    "España - Renovados onboarding",
    "España - Renove semanal",
    "España - Renovados renove",
  ],
};

/** Alternative spellings of the same tabs, for a workbook exported without accents. */
const SHEET_ALIASES = {
  "España - Onboarding semanal": "Espana - Onboarding semanal",
  "España - Renovados onboarding": "Espana - Renovados onboarding",
  "España - Renove semanal": "Espana - Renove semanal",
  "España - Renovados renove": "Espana - Renovados renove",
};

/**
 * Date column, in order of preference.
 *
 * The weekly tabs date a row by the day its status changed; the renewal tabs
 * date it by the day the machine was swapped. A tab carries one or the other,
 * so the first non-empty of the two is the date of the row.
 */
const DATE_HEADERS = ["Fecha Renovado", "Fecha de Estado", "Fecha"];

const STATUS_HEADERS = ["Estado", "ESTADO"];

function normalizeHeader(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[.:]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/**
 * First non-empty cell among the candidate headers.
 *
 * Non-empty, not merely present: the dashboard's own reader returns the first
 * matching column even when it is blank, which is why part of its stored rows
 * carry no date at all while the workbook has one in the next column.
 */
function cell(row, candidates) {
  const wanted = candidates.map(normalizeHeader);

  for (const header of wanted) {
    for (const [key, value] of Object.entries(row)) {
      if (normalizeHeader(key) !== header) continue;
      if (value === null || value === undefined || String(value).trim() === "") {
        continue;
      }

      return value;
    }
  }

  return null;
}

const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

function toDay(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(EXCEL_EPOCH_UTC + Math.trunc(value) * 86400000)
      .toISOString()
      .slice(0, 10);
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(
      Date.UTC(value.getFullYear(), value.getMonth(), value.getDate())
    )
      .toISOString()
      .slice(0, 10);
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value.trim());
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }

  return null;
}

/** Monday of the ISO week of a `YYYY-MM-DD` day. */
function mondayOf(day) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date;
}

/** ISO week number, resolved through the Thursday of the week. */
function isoWeek(day) {
  const thursday = mondayOf(day);
  thursday.setUTCDate(thursday.getUTCDate() + 3);

  const firstDay = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  return Math.floor((thursday.getTime() - firstDay.getTime()) / 86400000 / 7) + 1;
}

function readSheet(workbook, name) {
  const sheet =
    workbook.Sheets[name] ?? workbook.Sheets[SHEET_ALIASES[name] ?? ""];

  if (!sheet) {
    return null;
  }

  return XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });
}

/** `{ ambito, estado, day }` per unit, read from the consolidated workbook. */
function readWorkbook(path) {
  const workbook = XLSX.readFile(path, { cellDates: true });
  const units = [];
  const missing = [];

  for (const [ambito, names] of Object.entries(SHEETS)) {
    for (const name of names) {
      const rows = readSheet(workbook, name);

      if (rows === null) {
        missing.push(name);
        continue;
      }

      for (const row of rows) {
        const estado = String(cell(row, STATUS_HEADERS) ?? "").trim();
        if (!estado) continue;

        units.push({ ambito, estado, day: toDay(cell(row, DATE_HEADERS)) });
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Faltan pestañas en el libro: ${missing.join(", ")}. Disponibles: ${workbook.SheetNames.join(", ")}`
    );
  }

  return units;
}

/** The same units, read from the Renove dashboard's stored payload. */
async function readDashboardDb() {
  const { createClient } = await import("@libsql/client");
  const url = process.env.URL_TURSO;

  if (!url) {
    throw new Error(
      "Falta URL_TURSO. Ejecuta con --env-file apuntando al .env del Dashboard de Renove."
    );
  }

  const client = createClient({ url, authToken: process.env.TOKEN_TURSO });
  const result = await client.execute("SELECT data FROM renove WHERE id = 1");

  if (result.rows.length === 0) {
    throw new Error("La tabla renove está vacía.");
  }

  const stored = JSON.parse(String(result.rows[0].data));
  const datasets = stored.datasetsByScope ?? {};
  const units = [];

  for (const [scope, dataset] of Object.entries(datasets)) {
    const ambito = scope === "holding" ? "Holding" : "España";

    for (const record of dataset.records ?? []) {
      const estado = String(record.rawStatus ?? "").trim();
      if (!estado) continue;

      units.push({ ambito, estado, day: record.date ?? null });
    }
  }

  return units;
}

/** Units folded into the aggregated rows of the section. */
function toRows(units) {
  const grouped = new Map();

  for (const unit of units) {
    const day = unit.day ?? "";
    const mes = day === "" ? "" : `${day.slice(0, 4)}/${day.slice(5, 7)}`;
    const semana = day === "" ? 0 : isoWeek(day);
    const key = [day, mes, semana, unit.ambito, unit.estado].join("\t");

    grouped.set(key, (grouped.get(key) ?? 0) + 1);
  }

  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b, "es"))
    .map(([key, equipos]) => `${key}\t${equipos}`);
}

function parseArgs(argv) {
  const options = { xlsx: null, db: false, salida: null, anexar: null };

  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--xlsx") options.xlsx = argv[i + 1] ?? null;
    if (argv[i] === "--db") options.db = true;
    if (argv[i] === "--salida") options.salida = argv[i + 1] ?? null;
    if (argv[i] === "--anexar") options.anexar = argv[i + 1] ?? null;
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!options.xlsx && !options.db) {
    console.error(
      "Uso: exportar-renove.mjs (--xlsx <libro> | --db) [--salida <fichero>] [--anexar <plano.txt>]"
    );
    process.exit(1);
  }

  const units = options.xlsx
    ? readWorkbook(options.xlsx)
    : await readDashboardDb();
  const rows = toRows(units);
  const block = ["", "[RENOVE]", ...rows].join("\n");

  const dated = units.filter((unit) => unit.day !== null).length;
  console.error(
    `Unidades: ${units.length} (${dated} con fecha, ${units.length - dated} sin fecha). Filas agregadas: ${rows.length}.`
  );

  if (options.anexar) {
    // Never written back over the PLANO it was read from: the text is the
    // audit trail of a Drive run, and a half-appended file would be
    // indistinguishable from one the script produced whole.
    const salida = options.salida ?? options.anexar.replace(/\.txt$/i, "") + "-con-renove.txt";
    const plano = readFileSync(options.anexar, "utf8").replace(/\s+$/, "");

    writeFileSync(salida, `${plano}\n${block}\n`, "utf8");
    console.error(`Escrito ${salida}`);
    return;
  }

  if (options.salida) {
    writeFileSync(options.salida, `${block}\n`, "utf8");
    console.error(`Escrito ${options.salida}`);
    return;
  }

  process.stdout.write(`${block}\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
