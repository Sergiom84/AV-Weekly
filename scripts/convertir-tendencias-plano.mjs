/**
 * Converts the raw "Tendencias AV" workbook into the flat layout the Informe
 * importer consumes.
 *
 * Input: one sheet per support type, each holding several stacked blocks
 * (resolution matrix, per-year weekly totals, location matrix, monthly totals).
 * Output: a workbook with two sheets, "Ubicacion" and "Resolucion", one row per
 * week, support type and breakdown.
 *
 *   node scripts/convertir-tendencias-plano.mjs <entrada.xlsx> <salida.xlsx> <año>
 */

import { createRequire } from "node:module";
import path from "node:path";

// The xlsx build ships as CommonJS, so it is loaded through require.
const XLSX = createRequire(import.meta.url)("xlsx");

const TYPE_BY_SHEET = {
  REMOTOS: "REMOTO",
  PROGRAMADOS: "PROGRAMADO",
  PRESENCIALES: "PRESENCIAL",
  INCIDENCIAS: "INCIDENCIA",
  CORRECTIVOS: "CORRECTIVO",
};

const MIN_WEEKS_IN_HEADER = 10;
const TOTAL_LABEL = "TOTAL";
const MONTHS = new Set([
  "ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO",
  "JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE",
]);

function isYearLabel(value) {
  const parsed = toNumber(value);
  return parsed !== null && Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100;
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function toNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const text = String(value ?? "").trim();
  if (text === "") return null;

  const parsed = Number(text.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Excel serial number of the Monday that opens the given ISO week. */
function isoWeekMondaySerial(year, week) {
  const fourthOfJanuary = Date.UTC(year, 0, 4);
  const dayOfWeek = (new Date(fourthOfJanuary).getUTCDay() + 6) % 7;
  const firstMonday = fourthOfJanuary - dayOfWeek * 86400000;
  const monday = firstMonday + (week - 1) * 7 * 86400000;
  const epoch = Date.UTC(1899, 11, 30);
  return Math.round((monday - epoch) / 86400000);
}

/**
 * Finds the week columns of a header row: a run of consecutive integers
 * starting at 1. Returns null when the row is not a week header.
 */
function readWeekHeader(row) {
  const columns = [];
  let expected = 1;

  for (let index = 0; index < row.length; index += 1) {
    const value = toNumber(row[index]);

    if (value === expected && Number.isInteger(value)) {
      columns.push({ index, week: value });
      expected += 1;
    } else if (columns.length > 0 && value !== null && Number.isInteger(value)) {
      // A stray number after the run ends the header.
      break;
    }
  }

  return columns.length >= MIN_WEEKS_IN_HEADER ? columns : null;
}

/**
 * A row is blank *for the block* when its label and week cells are empty.
 * Checking the whole row is wrong: these sheets carry unrelated content far to
 * the right, which would keep a block open for hundreds of rows.
 */
function isBlankForBlock(row, weekColumns, labelColumns) {
  const scope = [...labelColumns, ...weekColumns.map((column) => column.index)];
  return scope.every((index) => String(row[index] ?? "").trim() === "");
}

/**
 * Reads a labelled block underneath a week header.
 * `labelColumns` are the columns that hold the row labels, left to right.
 */
function readBlock(rows, startIndex, weekColumns, labelColumns) {
  const entries = [];
  let blankRun = 0;
  let inheritedGroup = "";
  let consumed = 0;

  for (let index = startIndex; index < rows.length; index += 1) {
    const row = rows[index];

    if (isBlankForBlock(row, weekColumns, labelColumns)) {
      blankRun += 1;
      if (blankRun >= 2) break;
      consumed += 1;
      continue;
    }

    blankRun = 0;
    consumed += 1;

    const labels = labelColumns.map((column) => String(row[column] ?? "").trim());

    if (labelColumns.length === 2) {
      if (labels[0]) inheritedGroup = labels[0];
      // The block total closes the block.
      if (normalize(labels[0]) === TOTAL_LABEL) break;
      if (!labels[1]) continue;
    } else {
      const label = labels[0];
      if (!label) continue;
      if (normalize(label) === TOTAL_LABEL) break;
      // Year headers and the monthly block below are not part of this block.
      if (isYearLabel(label) || MONTHS.has(normalize(label))) break;
    }

    const values = weekColumns.map((column) => toNumber(row[column.index]) ?? 0);

    entries.push({
      group: labelColumns.length === 2 ? inheritedGroup : "",
      label: labelColumns.length === 2 ? labels[1] : labels[0],
      values,
    });
  }

  if (labelColumns.length === 2) {
    // A group total is redundant when the group is broken down, but it is the
    // only data when the group has no detail rows of its own.
    const detailed = new Set(
      entries
        .filter((entry) => normalize(entry.label) !== TOTAL_LABEL)
        .map((entry) => entry.group)
    );

    return {
      entries: entries.filter(
        (entry) => normalize(entry.label) !== TOTAL_LABEL || !detailed.has(entry.group)
      ),
      consumed,
    };
  }

  return { entries, consumed };
}

function convert(inputPath, outputPath, year) {
  const workbook = XLSX.readFile(inputPath);
  const locationRows = [];
  const resolutionRows = [];
  const report = [];

  for (const sheetName of workbook.SheetNames) {
    const type = TYPE_BY_SHEET[normalize(sheetName)];

    if (!type) {
      report.push(`  hoja "${sheetName}" ignorada`);
      continue;
    }

    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: "",
    });

    let resolutionTotal = 0;
    let locationTotal = 0;

    for (let index = 0; index < rows.length; index += 1) {
      const weekColumns = readWeekHeader(rows[index]);

      if (!weekColumns) continue;

      const headerText = normalize(rows[index].join(" "));
      // A header whose first cell is a year introduces a totals-only block.
      const beforeWeeks = rows[index].slice(0, weekColumns[0].index);
      if (beforeWeeks.some((cell) => isYearLabel(cell))) continue;

      const hasResolutionHeader = headerText.includes("HARD");

      if (hasResolutionHeader) {
        // Labels sit in the two columns before the first week column.
        const first = weekColumns[0].index;
        const { entries: block, consumed } = readBlock(rows, index + 1, weekColumns, [
          first - 2,
          first - 1,
        ]);

        for (const entry of block) {
          entry.values.forEach((value, position) => {
            if (value <= 0) return;
            const week = weekColumns[position].week;
            resolutionTotal += value;
            resolutionRows.push({
              Fecha: isoWeekMondaySerial(year, week),
              Semana: week,
              "Tipo Soporte": type,
              "Categoría": entry.group,
              "Acción": entry.label,
              Tickets: value,
            });
          });
        }

        index += consumed;
        continue;
      }

      // Otherwise it is a labelled breakdown: categories for Remotos, buildings
      // for every other type.
      const first = weekColumns[0].index;
      const labelColumn = type === "REMOTO" ? 0 : first - 1;
      const { entries: block, consumed } = readBlock(rows, index + 1, weekColumns, [
        labelColumn,
      ]);

      if (block.length === 0) continue;

      for (const entry of block) {
        entry.values.forEach((value, position) => {
          if (value <= 0) return;
          const week = weekColumns[position].week;

          if (type === "REMOTO") {
            resolutionTotal += value;
            resolutionRows.push({
              Fecha: isoWeekMondaySerial(year, week),
              Semana: week,
              "Tipo Soporte": type,
              "Categoría": "REMOTO",
              "Acción": entry.label,
              Tickets: value,
            });
            return;
          }

          locationTotal += value;
          locationRows.push({
            Fecha: isoWeekMondaySerial(year, week),
            Semana: week,
            "Tipo Soporte": type,
            Edificio: entry.label,
            Tickets: value,
          });
        });
      }

      index += consumed;
    }

    report.push(
      `  ${sheetName.padEnd(14)} resolución ${String(resolutionTotal).padStart(6)}` +
        `   ubicación ${String(locationTotal).padStart(6)}`
    );
  }

  const output = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    output,
    XLSX.utils.json_to_sheet(locationRows, {
      header: ["Fecha", "Semana", "Tipo Soporte", "Edificio", "Tickets"],
    }),
    "Ubicacion"
  );
  XLSX.utils.book_append_sheet(
    output,
    XLSX.utils.json_to_sheet(resolutionRows, {
      header: ["Fecha", "Semana", "Tipo Soporte", "Categoría", "Acción", "Tickets"],
    }),
    "Resolucion"
  );
  XLSX.writeFile(output, outputPath);

  console.log(`Convertido ${path.basename(inputPath)} (año ${year}):`);
  report.forEach((line) => console.log(line));
  console.log(`  Ubicacion  ${locationRows.length} filas`);
  console.log(`  Resolucion ${resolutionRows.length} filas`);
  console.log(`Escrito en ${outputPath}`);
}

const [input, output, year] = process.argv.slice(2);

if (!input || !output || !year) {
  console.error(
    "Uso: node scripts/convertir-tendencias-plano.mjs <entrada.xlsx> <salida.xlsx> <año>"
  );
  process.exit(1);
}

convert(input, output, Number(year));
