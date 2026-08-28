/**
 * Runs the Informatica Drive aggregation against the real exports, outside Google.
 *
 * The harness loads Codigo.gs itself in a Node VM. It classifies the five input
 * workbooks by their headers, exposes the read-only masters from the clean book,
 * and prints the exact PLANO text. Drive conversion and sheet writes are left
 * out deliberately: a local stub could only pretend to verify those effects.
 *
 *   node scripts/informatica-drive/verificar-local.mjs "<xlsx folder>" 2026-08-24
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import * as XLSX from "xlsx";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const CLEAN_BOOK = "SSCC- Informe Semanal limpio.xlsx";
const REQUIRED_KINDS = [
  "backlog",
  "liberadas",
  "gestionadas",
  "encuestas",
  "workOrders",
  "citas",
  "imac",
];

function readWorkbook(file) {
  const workbook = XLSX.read(readFileSync(file), { type: "buffer", cellDates: true });

  return workbook.SheetNames.map((name) => ({
    name,
    grid: XLSX.utils.sheet_to_json(workbook.Sheets[name], {
      header: 1,
      defval: null,
      blankrows: true,
      raw: true,
    }),
  }));
}

function spreadsheetFromGrids(grids) {
  const sheets = new Map(grids.map(({ name, grid }) => [name, grid]));

  return {
    getId() {
      return "verificacion-local";
    },
    getSheetByName(name) {
      const grid = sheets.get(name);

      if (!grid) return null;

      return {
        getLastRow() {
          return grid.length;
        },
        getRange(firstRow, firstColumn, rowCount, columnCount) {
          return {
            getValues() {
              const values = [];

              for (let row = 0; row < rowCount; row += 1) {
                const source = grid[firstRow - 1 + row] || [];
                const valuesRow = [];

                for (let column = 0; column < columnCount; column += 1) {
                  valuesRow.push(source[firstColumn - 1 + column] ?? null);
                }

                values.push(valuesRow);
              }

              return values;
            },
          };
        },
      };
    },
  };
}

function loadScript(cleanGrids) {
  const source = readFileSync(join(HERE, "Codigo.gs"), "utf8");
  const spreadsheet = spreadsheetFromGrids(cleanGrids);
  const context = createContext({
    console,
    Date,
    MimeType: {
      MICROSOFT_EXCEL: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      PLAIN_TEXT: "text/plain",
    },
    SpreadsheetApp: {
      getActiveSpreadsheet() {
        return spreadsheet;
      },
    },
  });

  runInContext(source, context, { filename: "Codigo.gs" });

  return context;
}

function entry(file, grids, sheets) {
  return {
    file: {
      getName() {
        return basename(file);
      },
    },
    grids,
    sheets,
    updated: new Date(0),
  };
}

function classify(script, folder, cleanPath) {
  const found = Object.fromEntries(REQUIRED_KINDS.map((kind) => [kind, null]));
  const skipped = [];
  const sources = [];

  for (const name of readdirSync(folder).sort((left, right) => left.localeCompare(right))) {
    if (!name.toLowerCase().endsWith(".xlsx") || name.startsWith("~$")) continue;

    const file = join(folder, name);

    if (resolve(file) === resolve(cleanPath)) continue;

    const grids = readWorkbook(file);
    let matched = false;
    const requests = script.findDataSheets(grids, script.REQUIRED.peticiones);

    if (requests.length > 0) {
      const kind = script.requestKind(name);

      if (kind) {
        if (found[kind]) throw new Error(`Hay dos ficheros locales de tipo ${kind}.`);
        found[kind] = entry(file, grids, requests);
        matched = true;
      }
    }

    const candidates = [
      ["encuestas", script.encuestasSheets(grids)],
      ["workOrders", script.findDataSheets(grids, script.REQUIRED.workOrders)],
      ["citas", script.findDataSheets(grids, script.REQUIRED.citas)],
      ["imac", script.findDataSheets(grids, script.REQUIRED.imac)],
    ];

    for (const [kind, sheets] of candidates) {
      if (sheets.length === 0) continue;
      if (found[kind]) throw new Error(`Hay dos ficheros locales de tipo ${kind}.`);

      found[kind] = entry(file, grids, sheets);
      matched = true;
    }

    if (matched) sources.push(name);
    else skipped.push(name);
  }

  const missing = REQUIRED_KINDS.filter((kind) => !found[kind]);

  if (missing.length > 0) {
    throw new Error(`Faltan orígenes obligatorios: ${missing.join(", ")}.`);
  }

  return { found, skipped, sources: [...new Set(sources)].sort() };
}

const [folderArg, extractionArg] = process.argv.slice(2);

if (!folderArg || !extractionArg) {
  console.error(
    'Uso: node scripts/informatica-drive/verificar-local.mjs "<carpeta con los xlsx>" <AAAA-MM-DD>'
  );
  process.exit(1);
}

if (!/^\d{4}-\d{2}-\d{2}$/.test(extractionArg)) {
  console.error("La fecha de extracción debe tener formato AAAA-MM-DD.");
  process.exit(1);
}

const folder = resolve(folderArg);
const cleanPath = join(folder, CLEAN_BOOK);

if (!existsSync(cleanPath)) {
  console.error(`Falta el libro de referencia: ${cleanPath}`);
  process.exit(1);
}

const script = loadScript(readWorkbook(cleanPath));
const classification = classify(script, folder, cleanPath);
const extraction = new Date(`${extractionArg}T00:00:00.000Z`);
const aggregated = script.agregar(classification, extraction);
const source = classification.sources.join("; ");
const plain = script.serializarPlano(aggregated, {
  week: extractionArg,
  generated: `${extractionArg}T00:00:00.000Z`,
  source,
});

process.stdout.write(`${plain}\n`);

const diagnostics = [
  ...script.SECTION_ORDER.map((key) => `${script.SECTION[key]}: ${aggregated[key].length} filas`),
  `orígenes: ${source}`,
  classification.skipped.length > 0
    ? `ignorados: ${classification.skipped.join(", ")}`
    : "ignorados: ninguno",
];

process.stderr.write(`${diagnostics.join("\n")}\n`);
