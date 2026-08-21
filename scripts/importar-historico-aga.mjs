/**
 * Loads the AGA weekly history from the hand-kept workbook into `aga_dataset`.
 *
 * The GPS export only ever carries two weeks, so the evolution charts need a
 * seed: the "Evolución Semanal" sheet of the responsible's workbook holds a
 * manual Departamento x Semana matrix for weeks 24-33 of 2026, already grouped
 * and renamed. This script reads that matrix and folds it into the stored
 * dataset.
 *
 * Two decisions are deliberate:
 *
 * - The week total comes from the sheet's own "Totales" row, not from the sum
 *   of the department matrix. The two disagree by 1-2 rows on four weeks (the
 *   matrix is a pivot the responsible refreshes by hand), and the "Totales" row
 *   is the series the pptx and the GPS agree with. The gap is reported, never
 *   redistributed.
 * - A week already stored wins over the sheet. Weeks 32 and 33 of the matrix
 *   are the same two weeks the GPS uploads, and the GPS aggregates carry the
 *   project breakdown and the verbatim departments that the matrix lost. That
 *   is also what makes the script idempotent: re-running it changes nothing.
 *
 *   node scripts/importar-historico-aga.mjs [ruta.xlsx]
 */

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
const { createClient } = require("@libsql/client");

const DEFAULT_SOURCE =
  "C:/Users/sergi/Desktop/AGA/33 semana datos ( prueba Sergio).xlsx";
const SHEET = "Evolución Semanal";
const LOCATION_SHEET = "G. Ubicacion total";

/**
 * Anchor of the week numbering. The responsible's "Semana 33" is the week the
 * GPS stamps 2026-08-17; every other week is that Monday minus seven days per
 * week of difference. Verified against the stored GPS weeks: the matrix column
 * "Semana 32" reproduces the 2026-08-10 aggregate (806) department by
 * department, and "Semana 33" the 2026-08-17 one (846).
 */
const ANCHOR_WEEK = 33;
const ANCHOR_DATE = "2026-08-17";

/**
 * Matrix label to the label the GPS parser produces.
 *
 * The evolution chart joins a department across weeks by its label, so a
 * historic "Soporte Tecnico" that never becomes "Soporte Técnico" draws a
 * second, broken line. Labels with no GPS counterpart ("Otros", "HIC") are
 * kept as written: they are real buckets of the manual matrix.
 */
const DEPARTMENT_ALIASES = {
  "SOPORTE TECNICO": "Soporte Técnico",
  "SOPORTE VIP": "Soporte VIP",
  "GAM(GEST. APROV)": "GAM",
  "PLATAFORMA PORTATILES": "Plataforma Portátiles",
  "TODO MOVIL": "TodoMóvil",
  GSAM: "GSAM",
  "ADM. RED": "Adm. Red Local",
  ALMACEN: "Almacén",
};

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function departmentLabel(raw) {
  return DEPARTMENT_ALIASES[normalize(raw)] ?? String(raw).replace(/\s+/g, " ").trim();
}

/** `YYYY-MM-DD` of the Monday the given week number falls on. */
function weekDate(week) {
  const [year, month, day] = ANCHOR_DATE.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  date.setUTCDate(date.getUTCDate() - (ANCHOR_WEEK - week) * 7);

  return date.toISOString().slice(0, 10);
}

/** Week number of a header cell such as `"Semana 24\r\n(2026)"`. Null when it is not one. */
function headerWeek(value) {
  const match = normalize(value).match(/^SEMANA\s+(\d{1,2})\b/);

  return match ? Number(match[1]) : null;
}

function toNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const raw = String(value ?? "").trim();

  if (raw === "") {
    return null;
  }

  const parsed = Number(raw.replace(/\./g, "").replace(",", "."));

  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Reads the complete location pivot when the workbook exposes it.
 *
 * The PPTX chart drops low-volume rows, but the pivot keeps both those rows and
 * its own Total general. Locating the two header labels means Valencia/Oviedo
 * and future one-position locations are imported without naming them in code.
 */
function readLocationSnapshot(workbook) {
  const sheetName = workbook.SheetNames.find(
    (name) => normalize(name) === normalize(LOCATION_SHEET)
  );
  const sheet = sheetName ? workbook.Sheets[sheetName] : null;

  if (!sheet) return null;

  const grid = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
    raw: true,
  });

  let labelAt = -1;
  let countAt = -1;
  let headerAt = -1;

  grid.some((row, index) => {
    labelAt = (row ?? []).findIndex((cell) => normalize(cell) === "ETIQUETAS DE FILA");
    countAt = (row ?? []).findIndex((cell) => normalize(cell) === "CUENTA DE EDIFICIO2");
    headerAt = index;
    return labelAt !== -1 && countAt !== -1;
  });

  if (headerAt === -1 || labelAt === -1 || countAt === -1) return null;

  const rows = [];
  let total = null;

  for (const row of grid.slice(headerAt + 1)) {
    const label = String((row ?? [])[labelAt] ?? "").replace(/\s+/g, " ").trim();
    const count = toNumber((row ?? [])[countAt]);

    if (normalize(label) === "TOTAL GENERAL") {
      total = count;
      break;
    }

    if (label !== "" && count !== null && count > 0) {
      rows.push({ label, count });
    }
  }

  if (rows.length === 0) return null;

  return {
    rows,
    total: total ?? rows.reduce((sum, row) => sum + row.count, 0),
  };
}

/* -------------------------------------------------------------------------- */
/* Sheet reading                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Reads the matrix.
 *
 * The sheet is a working document, not an export: the block sits at an
 * arbitrary offset and there are two header rows carrying the same week
 * labels — one over the department matrix, one over the "Totales" row. Both
 * are located by content rather than by a fixed address, so an inserted row
 * does not silently shift the import.
 */
function readSheet(path) {
  const workbook = XLSX.readFile(path, { cellDates: true });
  const sheet = workbook.Sheets[SHEET];

  if (!sheet) {
    throw new Error(
      `El libro no trae la pestaña "${SHEET}". Pestañas: ${workbook.SheetNames.join(", ")}.`
    );
  }

  const grid = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
    raw: true,
  });

  // Every row that carries "Dpto" followed by week headers is a header row.
  const headers = [];

  grid.forEach((row, index) => {
    const at = (row ?? []).findIndex((cell) => normalize(cell) === "DPTO");

    if (at === -1) {
      return;
    }

    const columns = new Map();

    for (let column = at + 1; column < row.length; column += 1) {
      const week = headerWeek(row[column]);

      if (week !== null && !columns.has(week)) {
        columns.set(week, column);
      }
    }

    if (columns.size > 0) {
      headers.push({ row: index, labelAt: at, columns });
    }
  });

  if (headers.length === 0) {
    throw new Error(`La pestaña "${SHEET}" no trae ninguna cabecera "Dpto" con semanas.`);
  }

  const matrixHeader = headers[0];
  const departments = [];

  for (const row of grid.slice(matrixHeader.row + 1)) {
    const label = String((row ?? [])[matrixHeader.labelAt] ?? "").trim();

    if (label === "") {
      break; // The matrix ends at its unlabelled sum row.
    }

    const counts = new Map();

    for (const [week, column] of matrixHeader.columns) {
      counts.set(week, toNumber(row[column]) ?? 0);
    }

    departments.push({ raw: label, label: departmentLabel(label), counts });
  }

  // The declared totals live on the "Totales" row under any of the headers.
  const totals = new Map();

  for (const header of headers) {
    for (const row of grid.slice(header.row + 1, header.row + 4)) {
      if (normalize((row ?? [])[header.labelAt]) !== "TOTALES") {
        continue;
      }

      for (const [week, column] of header.columns) {
        const value = toNumber(row[column]);

        if (value !== null) {
          totals.set(week, value);
        }
      }
    }
  }

  if (totals.size === 0) {
    throw new Error(`La pestaña "${SHEET}" no trae la fila "Totales".`);
  }

  return {
    weeks: [...matrixHeader.columns.keys()].sort((a, b) => a - b),
    departments,
    totals,
    locationSnapshot: readLocationSnapshot(workbook),
  };
}

/* -------------------------------------------------------------------------- */
/* Aggregates                                                                  */
/* -------------------------------------------------------------------------- */

function toCounts(entries) {
  return entries
    .filter(({ count }) => count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "es"));
}

function buildWeeks({ weeks, departments, totals }) {
  return weeks
    .filter((week) => totals.has(week))
    .map((week) => {
      const byDepartment = toCounts(
        departments.map(({ label, counts }) => ({ label, count: counts.get(week) ?? 0 }))
      );
      const byDepartmentRaw = toCounts(
        departments.map(({ raw, counts }) => ({ label: raw, count: counts.get(week) ?? 0 }))
      );
      const declared = totals.get(week);
      const summed = byDepartment.reduce((sum, entry) => sum + entry.count, 0);

      return {
        number: week,
        // byProject is empty on purpose: the manual matrix has no project detail.
        aggregate: {
          week: weekDate(week),
          reportWeek: week,
          total: declared,
          byDepartment,
          byDepartmentRaw,
          byProject: [],
        },
        summed,
        gap: declared - summed,
      };
    });
}

/* -------------------------------------------------------------------------- */
/* Merge                                                                       */
/* -------------------------------------------------------------------------- */

/** Same fold as `mergeAgaWeeks`, with the second argument winning on a collision. */
function mergeWeeks(base, winner) {
  const byWeek = new Map();

  for (const week of [...(base ?? []), ...(winner ?? [])]) {
    if (week && typeof week.week === "string") {
      byWeek.set(week.week, week);
    }
  }

  return [...byWeek.values()].sort((a, b) => a.week.localeCompare(b.week));
}

function mergeLocationRows(base, snapshot, week) {
  const byLabel = new Map();

  for (const row of base ?? []) {
    if (!row || typeof row.label !== "string") continue;

    byLabel.set(normalize(row.label), {
      ...row,
      counts: (row.counts ?? []).filter((entry) => entry.week !== week),
    });
  }

  for (const row of snapshot.rows) {
    const key = normalize(row.label);
    const existing = byLabel.get(key);

    byLabel.set(key, {
      ...(existing ?? {}),
      label: row.label,
      counts: [...(existing?.counts ?? []), { week, count: row.count }].sort((a, b) =>
        a.week.localeCompare(b.week)
      ),
    });
  }

  return [...byLabel.values()]
    .filter((row) => row.counts.length > 0)
    .sort((a, b) => {
      const count = (row) => row.counts.find((entry) => entry.week === week)?.count ?? 0;
      return count(b) - count(a) || a.label.localeCompare(b.label, "es");
    });
}

/** Pure fold kept exported so preservation is covered by a regression test. */
export function mergeHistoricDataset(existing, historic, source, locationSnapshot = null) {
  const weeks = mergeWeeks(historic, existing?.weeks ?? []);
  const latestHistoric = historic[historic.length - 1]?.week;
  let managed = existing?.managed;

  if (managed && locationSnapshot && latestHistoric) {
    const locationTotals = [
      ...(managed.locationTotals ?? []).filter((entry) => entry.week !== latestHistoric),
      { week: latestHistoric, total: locationSnapshot.total },
    ].sort((a, b) => a.week.localeCompare(b.week));

    managed = {
      ...managed,
      byLocation: mergeLocationRows(managed.byLocation, locationSnapshot, latestHistoric),
      locationTotals,
    };
  }

  return {
    ...(existing ?? {}),
    weeks,
    ...(managed ? { managed } : {}),
    source,
  };
}

async function main() {
  const path = process.argv[2] ?? DEFAULT_SOURCE;
  const sheet = readSheet(path);
  const historic = buildWeeks(sheet);

  const url = process.env.URL_TURSO ?? "file:./data/av-weekly.db";
  const client = createClient(
    url.startsWith("file:") ? { url } : { url, authToken: process.env.TOKEN_TURSO }
  );

  const result = await client.execute("SELECT data, source_file FROM aga_dataset WHERE id = 1");
  const existing = result.rows.length > 0 ? JSON.parse(result.rows[0].data) : null;
  const existingWeeks = Array.isArray(existing?.weeks) ? existing.weeks : [];
  const stored = new Set(existingWeeks.map((week) => week.week));

  // The stored GPS weeks win: they carry the project breakdown and the verbatim
  // departments the manual matrix lost.
  const merged = mergeWeeks(
    historic.map((entry) => entry.aggregate),
    existingWeeks
  );

  const dataset = mergeHistoricDataset(
    existing,
    historic.map((entry) => entry.aggregate),
    {
      sourceFile: existing?.source?.sourceFile ?? (result.rows[0]?.source_file ?? null),
      uploadedAt: existing?.source?.uploadedAt ?? new Date().toISOString(),
    },
    sheet.locationSnapshot
  );

  await client.execute({
    sql: `INSERT INTO aga_dataset (id, data, source_file, uploaded_at)
          VALUES (1, ?, ?, datetime('now'))
          ON CONFLICT(id) DO UPDATE
          SET data = excluded.data, source_file = excluded.source_file`,
    args: [JSON.stringify(dataset), dataset.source.sourceFile],
  });

  console.log(`Fuente: ${path}`);
  console.log(`Pestaña: ${SHEET}\n`);
  console.log("Sem  Fecha        Total  Suma dptos  Dif  Estado");

  for (const entry of historic) {
    const state = stored.has(entry.aggregate.week) ? "ya en BD (GPS, intacta)" : "importada";
    console.log(
      `${String(entry.number).padStart(3)}  ${entry.aggregate.week}  ` +
        `${String(entry.aggregate.total).padStart(5)}  ${String(entry.summed).padStart(10)}  ` +
        `${String(entry.gap).padStart(3)}  ${state}`
    );
  }

  const gaps = historic.filter((entry) => entry.gap !== 0);

  if (gaps.length > 0) {
    console.log(
      `\nAviso: en ${gaps.length} semanas la matriz de departamentos no suma el total declarado ` +
        `(${gaps.map((entry) => `S${entry.number} ${entry.gap > 0 ? "+" : ""}${entry.gap}`).join(", ")}). ` +
        "Se guarda el total declarado y la matriz tal cual; no se reparte la diferencia."
    );
  }

  console.log(
    `\nSemanas en aga_dataset: ${merged.length} (${merged[0]?.week} … ${merged[merged.length - 1]?.week})`
  );
  console.log(`Totales: [${merged.map((week) => week.total).join(", ")}]`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
