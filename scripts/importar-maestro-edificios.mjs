/**
 * Imports the authoritative Edificio -> Ubicacion workbook into libSQL.
 *
 * Idempotent: the master table is rebuilt in one write batch. Repeated source
 * rows are collapsed, while a building assigned to two locations is kept
 * twice; learned aliases survive later master refreshes.
 *
 *   node scripts/importar-maestro-edificios.mjs [ruta.xlsx]
 */

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
const { createClient } = require("@libsql/client");

const DEFAULT_SOURCE =
  "C:/Users/sergi/Desktop/MIX/AV weekly/AGA/Edificios.xlsx";
const DEFAULT_EVIDENCE =
  "C:/Users/sergi/Desktop/MIX/AV weekly/Informática SSCC/Templates SSCC para presentación - Email semanal (1).xlsx";

function lookupKey(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function addressKeys(value) {
  let source = String(value ?? "").trim();
  source = source.replace(/\s+-\s+(?:EDIF(?:ICIO)?|PLANTA|BLOQUE)\b.*$/i, "");
  const firstHyphen = source.indexOf("-");

  if (firstHyphen >= 0 && !/\d/.test(source.slice(0, firstHyphen))) {
    source = source.slice(firstHyphen + 1);
  }

  const ignored = new Set([
    "C",
    "CL",
    "CALLE",
    "AV",
    "AVDA",
    "AVENIDA",
    "P",
    "PS",
    "PASEO",
    "PZA",
    "PL",
    "PLAZA",
    "CTRA",
    "CARRETERA",
    "DE",
    "DEL",
    "LA",
    "LAS",
    "EL",
    "LOS",
  ]);

  return source
    .split("/")
    .map(piece =>
      lookupKey(piece)
        .split(" ")
        .filter(token => token && !ignored.has(token))
    )
    .filter(
      tokens =>
        tokens.some(token => /\d/.test(token)) &&
        tokens.some(token => /[A-Z]/.test(token) && token.length >= 3)
    )
    .map(tokens => tokens.join(" "));
}

function uniqueLookup(rows) {
  const exact = new Map();
  const addresses = new Map();
  const add = (map, key, location) => {
    if (!key) return;
    const current = map.get(key);
    map.set(
      key,
      current === undefined || lookupKey(current) === lookupKey(location)
        ? location
        : null
    );
  };

  for (const row of rows) {
    add(exact, row.normalized, row.location);
    for (const key of addressKeys(row.building))
      add(addresses, key, row.location);
  }

  return (...values) => {
    for (const value of values) {
      const key = lookupKey(value);
      if (exact.has(key)) return exact.get(key);
      for (const address of addressKeys(value)) {
        if (addresses.has(address)) return addresses.get(address);
      }
    }
    return null;
  };
}

function readEvidenceAliases(evidencePath, masterRows) {
  if (!evidencePath || !fs.existsSync(evidencePath)) {
    return [];
  }

  const workbook = XLSX.readFile(evidencePath);
  const resolve = uniqueLookup(masterRows);
  const aliases = new Map();

  for (const name of workbook.SheetNames) {
    const grid = XLSX.utils.sheet_to_json(workbook.Sheets[name], {
      header: 1,
      raw: false,
      defval: null,
      blankrows: false,
    });
    const header = grid[0] ?? [];
    const at = label =>
      header.findIndex(cell => lookupKey(cell) === lookupKey(label));
    const siteAt = at("Site");
    const addressAt = at("Chg Location Address");
    const associatedAt = at("Ubicacion_asociada");

    if (siteAt < 0 || addressAt < 0 || associatedAt < 0) continue;

    for (const row of grid.slice(1)) {
      const alias = String(row?.[siteAt] ?? "").trim();
      const location = resolve(row?.[addressAt], row?.[associatedAt]);

      if (!alias || !location) continue;
      const key = lookupKey(alias);
      const current = aliases.get(key);
      aliases.set(
        key,
        current === undefined || current.location === location
          ? { alias, location }
          : null
      );
    }
  }

  return [...aliases.values()].filter(Boolean);
}

function backfillInformaticaDataset(dataset, masterRows, aliases) {
  const lookup = new Map();
  const add = (key, location) => {
    const current = lookup.get(key);
    lookup.set(
      key,
      current === undefined || lookupKey(current) === lookupKey(location)
        ? location
        : null
    );
  };

  for (const row of masterRows) {
    add(row.normalized, row.location);
    add(lookupKey(row.location), row.location);
  }
  for (const row of aliases) add(lookupKey(row.alias), row.location);

  let changed = 0;
  const next = { ...dataset };

  for (const section of ["incidencias", "workOrders", "citas"]) {
    if (!Array.isArray(dataset?.[section])) continue;
    next[section] = dataset[section].map(row => {
      const location = lookup.get(lookupKey(row?.edificio));
      if (!location || location === row.edificio) return row;
      changed += 1;
      return { ...row, edificio: location };
    });
  }

  return { dataset: next, changed };
}

function readMaster(sourcePath) {
  const workbook = XLSX.readFile(sourcePath);
  const sheetName = workbook.SheetNames.find(
    name => lookupKey(name) === "EDIFICIOS"
  );

  if (!sheetName) {
    throw new Error(
      `El libro no trae la hoja Edificios. Hojas: ${workbook.SheetNames.join(", ")}`
    );
  }

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    raw: false,
    defval: null,
    blankrows: false,
  });
  const header = rows[0] ?? [];
  const buildingAt = header.findIndex(cell => lookupKey(cell) === "EDIFICIOS");
  const locationAt = header.findIndex(cell => lookupKey(cell) === "UBICACION");

  if (buildingAt < 0 || locationAt < 0) {
    throw new Error(
      "La hoja Edificios debe incluir las columnas Edificios y Ubicación."
    );
  }

  const unique = new Map();
  let skipped = 0;

  for (const row of rows.slice(1)) {
    const building = String(row?.[buildingAt] ?? "").trim();
    const location = String(row?.[locationAt] ?? "").trim();
    const normalized = lookupKey(building);

    if (!normalized || !location) {
      skipped += 1;
      continue;
    }

    unique.set(`${normalized}\u0000${lookupKey(location)}`, {
      normalized,
      building,
      location,
    });
  }

  return { rows: [...unique.values()], sourceRows: rows.length - 1, skipped };
}

async function main() {
  const sourcePath = path.resolve(process.argv[2] ?? DEFAULT_SOURCE);
  const master = readMaster(sourcePath);
  const evidencePath = path.resolve(process.argv[3] ?? DEFAULT_EVIDENCE);
  const aliases = readEvidenceAliases(evidencePath, master.rows);
  const databaseUrl =
    process.env.URL_TURSO ??
    process.env.SQL_TURSO ??
    "file:./data/av-weekly.db";
  const db = createClient(
    databaseUrl.startsWith("file:")
      ? { url: databaseUrl }
      : { url: databaseUrl, authToken: process.env.TOKEN_TURSO }
  );
  const sourceFile = path.basename(sourcePath);

  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS building_location_master (
      normalized_building TEXT NOT NULL,
      source_building TEXT NOT NULL,
      location TEXT NOT NULL,
      source_file TEXT,
      imported_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (normalized_building, location)
    );
    CREATE TABLE IF NOT EXISTS building_location_alias (
      normalized_alias TEXT NOT NULL,
      source_alias TEXT NOT NULL,
      location TEXT NOT NULL,
      observed_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (normalized_alias, location)
    );
  `);

  const datasetTable = await db.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'informatica_dataset'"
  );
  let backfill = null;

  if (datasetTable.rows.length > 0) {
    const current = await db.execute(
      "SELECT data FROM informatica_dataset WHERE id = 1"
    );

    if (current.rows[0]?.data) {
      backfill = backfillInformaticaDataset(
        JSON.parse(String(current.rows[0].data)),
        master.rows,
        aliases
      );
    }
  }

  await db.batch(
    [
      { sql: "DELETE FROM building_location_master", args: [] },
      ...master.rows.map(row => ({
        sql: `INSERT INTO building_location_master
              (normalized_building, source_building, location, source_file, imported_at)
              VALUES (?, ?, ?, ?, datetime('now'))`,
        args: [row.normalized, row.building, row.location, sourceFile],
      })),
      ...aliases.map(row => ({
        sql: `INSERT INTO building_location_alias
              (normalized_alias, source_alias, location, observed_at)
              VALUES (?, ?, ?, datetime('now'))
              ON CONFLICT(normalized_alias, location) DO UPDATE
              SET source_alias = excluded.source_alias,
                  observed_at = excluded.observed_at`,
        args: [lookupKey(row.alias), row.alias, row.location],
      })),
      ...(backfill && backfill.changed > 0
        ? [
            {
              sql: "UPDATE informatica_dataset SET data = ? WHERE id = 1",
              args: [JSON.stringify(backfill.dataset)],
            },
          ]
        : []),
    ],
    "write"
  );

  const conflicts = await db.execute(`
    SELECT normalized_building, COUNT(DISTINCT location) AS locations
    FROM building_location_master
    GROUP BY normalized_building
    HAVING COUNT(DISTINCT location) > 1
  `);

  console.log(`Fuente: ${sourcePath}`);
  console.log(`Filas fuente: ${master.sourceRows}`);
  console.log(`Filas guardadas: ${master.rows.length}`);
  console.log(`Filas descartadas sin edificio/ubicación: ${master.skipped}`);
  console.log(`Claves ambiguas conservadas: ${conflicts.rows.length}`);
  console.log(
    fs.existsSync(evidencePath)
      ? `Alias demostrados por dirección: ${aliases.length} (${evidencePath})`
      : "Alias demostrados por dirección: 0 (no se encontró el workbook de evidencia)"
  );
  console.log(`Filas existentes normalizadas: ${backfill?.changed ?? 0}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
