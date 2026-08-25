/**
 * Runs the Drive Apps Script against real exports, outside Google.
 *
 * `Codigo.gs` cannot be unit-tested where it lives: it only runs inside a
 * spreadsheet, and the week it produces is only correct if it agrees with the
 * deck. This harness loads that same file into a Node VM with the Google
 * globals stubbed, feeds it the three workbooks from disk, and prints the text
 * it would write into the `PLANO` tab.
 *
 * It exercises the aggregation, which is where the business rules are. The
 * parts that talk to Drive and to the spreadsheet are not run — those are the
 * parts a stub could only pretend to verify.
 *
 *   node scripts/aga-drive/verificar-local.mjs "<carpeta con los xlsx>" 2026-08-17
 *
 * The output is the plain text; pipe it to a file and upload it to check the
 * whole path end to end.
 */

import { readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import * as XLSX from "xlsx";

const HERE = fileURLToPath(new URL(".", import.meta.url));

/* -------------------------------------------------------------------------- */
/* Loading Codigo.gs                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The script's functions, with the Google globals stubbed.
 *
 * Only the globals the aggregation path touches are provided. Anything else is
 * left undefined on purpose: a stub that silently answers would let a call into
 * Drive pass this harness and fail in production.
 */
function loadScript() {
  const source = readFileSync(join(HERE, "Codigo.gs"), "utf8");
  const context = createContext({
    console,
    // The host `Date`, so that `value instanceof Date` holds for the dates the
    // xlsx reader produces. A VM context has its own realm and its own `Date`,
    // and the mismatch is an artefact of this harness: inside Apps Script the
    // spreadsheet and the script share one realm.
    Date,
    MimeType: {
      MICROSOFT_EXCEL: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      PLAIN_TEXT: "text/plain",
    },
  });

  runInContext(source, context, { filename: "Codigo.gs" });

  return context;
}

/* -------------------------------------------------------------------------- */
/* Workbooks as the grids the script expects                                   */
/* -------------------------------------------------------------------------- */

/**
 * A workbook as `{ name, grid }` per sheet.
 *
 * `cellDates` mirrors what a converted Google Sheet hands back: real dates
 * rather than serials. The script normalises both, and reading them as dates
 * here is the shape that would otherwise go untested.
 */
function readGrids(file) {
  // `readFile` is not exposed by the ESM build, so the bytes are read here.
  const workbook = XLSX.read(readFileSync(file), { type: "buffer", cellDates: true });

  return workbook.SheetNames.map((name) => ({
    name,
    grid: XLSX.utils.sheet_to_json(workbook.Sheets[name], {
      header: 1,
      defval: null,
      blankrows: false,
      raw: true,
    }),
  }));
}

function mappingFromSeed(script, seed) {
  const mapping = {};

  for (const [key, value] of seed) {
    mapping[script.normalize(key)] = value;
  }

  return mapping;
}

/** The department seed in the `{ labels, managed }` shape `readDepartments` builds. */
function departmentsFromSeed(script) {
  const departments = { labels: {}, managed: {} };

  for (const [raw, label, managed] of script.SEEDS.departments) {
    departments.labels[script.normalize(raw)] = label;
    departments.managed[script.normalize(raw)] = managed;
    departments.managed[script.normalize(label)] = managed;
  }

  return departments;
}

/** The buildings master, when the folder ships one, merged over the seed. */
function buildingsFromFolder(script, entries) {
  const master = entries.buildings;

  if (!master) {
    return mappingFromSeed(script, script.SEEDS.buildings);
  }

  const sheet = master.sheets[0];
  const buildingAt = sheet.columns[script.normalize("Edificios")];
  const locationAt = sheet.columns[script.normalize("Ubicación")];
  const mapping = mappingFromSeed(script, script.SEEDS.buildings);

  for (let index = sheet.headerRow + 1; index < sheet.grid.length; index += 1) {
    const building = script.text(sheet.grid[index][buildingAt]);
    const location = script.text(sheet.grid[index][locationAt]);

    if (building !== "" && location !== "") {
      mapping[script.normalize(building)] = location;
    }
  }

  return mapping;
}

/**
 * Classifies the workbooks of a folder the way the script classifies a Drive
 * folder: by what the header row says, never by the file name.
 */
function classify(script, folder) {
  const kinds = ["managed", "office", "gps", "buildings"];
  const entries = {};
  const skipped = [];

  for (const name of readdirSync(folder)) {
    if (!name.toLowerCase().endsWith(".xlsx") || name.startsWith("~$")) {
      continue;
    }

    const file = join(folder, name);
    const grids = readGrids(file);
    let matched = false;

    for (const kind of kinds) {
      const sheets = script.findDataSheets(grids, script.REQUIRED[kind]);

      if (sheets.length > 0) {
        entries[kind] = { file: basename(file), sheets };
        matched = true;
        break;
      }
    }

    if (!matched) {
      skipped.push(name);
    }
  }

  return { entries, skipped };
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

const [folderArg, extractionArg] = process.argv.slice(2);

if (!folderArg || !extractionArg) {
  console.error(
    'Uso: node scripts/aga-drive/verificar-local.mjs "<carpeta con los xlsx>" <AAAA-MM-DD>'
  );
  process.exit(1);
}

const folder = resolve(folderArg);
const script = loadScript();
const { entries, skipped } = classify(script, folder);

const mappings = {
  departments: departmentsFromSeed(script),
  projects: mappingFromSeed(script, script.SEEDS.projects),
  buildings: buildingsFromFolder(script, entries),
};

const gps = entries.gps ? script.readGps(entries.gps, extractionArg, mappings) : null;
const managed = entries.managed ? script.readManaged(entries.managed, mappings) : null;
const office = entries.office ? script.readOffice(entries.office) : null;

const lines = [script.TEXTO_HEADER];
lines.push(`semana\t${extractionArg}`);
lines.push(`generado\t${new Date().toISOString()}`);
lines.push(
  `origen\t${["gps", "managed", "office"]
    .map((kind) => entries[kind]?.file)
    .filter(Boolean)
    .join("; ")}`
);

const SECTION = script.SECTION;

if (gps) {
  script.appendSection(lines, SECTION.weeks, script.totalsLines(gps.totals));
  script.appendSection(lines, SECTION.weekDepartments, script.breakdownLines(gps.departments, 0));
  script.appendSection(
    lines,
    SECTION.weekDepartmentsRaw,
    script.breakdownLines(gps.departmentsRaw, 0)
  );
  script.appendSection(lines, SECTION.weekProjects, script.breakdownLines(gps.projects, 0));
}

if (managed) {
  script.appendSection(lines, SECTION.managed, script.totalsLines(managed.totals));
  script.appendSection(
    lines,
    SECTION.managedDepartments,
    script.breakdownLines(managed.departments, 0)
  );
  script.appendSection(
    lines,
    SECTION.managedProducts,
    script.breakdownLines(managed.products, 0)
  );
  script.appendSection(
    lines,
    SECTION.managedLocations,
    script.breakdownLines(managed.locations, 0)
  );
  script.appendSection(
    lines,
    SECTION.managedLocationTotals,
    script.totalsLines(script.sumByWeek(managed.locations))
  );
  script.appendSection(
    lines,
    SECTION.managedDepartmentProducts,
    script.departmentProductLines(managed.departmentProducts, 0)
  );
}

if (office) {
  script.appendSection(lines, SECTION.office, script.breakdownLines(office.counts, 0));
}

process.stdout.write(`${lines.join("\n")}\n`);

const diagnostics = [
  gps ? `gps: ${gps.rows} filas (${entries.gps.file})` : "gps: no encontrado",
  managed
    ? `gestionado: ${managed.rows} filas, ${managed.skipped} sin fecha (${entries.managed.file})`
    : "gestionado: no encontrado",
  office
    ? `office: ${office.rows} filas, ${office.skipped} descartadas (${entries.office.file})`
    : "office: no encontrado",
  skipped.length > 0 ? `ignorados: ${skipped.join(", ")}` : "",
  managed && Object.keys(managed.unknownBuildings).length > 0
    ? `edificios sin ubicación: ${Object.keys(managed.unknownBuildings).join(", ")}`
    : "",
  managed && Object.keys(managed.unmappedDepartments).length > 0
    ? `departamentos nuevos en gestionadas: ${Object.keys(managed.unmappedDepartments).join(", ")}`
    : "",
  office && Object.keys(office.unknownProducts).length > 0
    ? `productos Office sin familia: ${Object.keys(office.unknownProducts).join(", ")}`
    : "",
].filter(Boolean);

process.stderr.write(`\n${diagnostics.join("\n")}\n`);
