import * as XLSX from "xlsx";
import type { BuildingLocationMatcher } from "../shared/building-locations.ts";
import { INFORMATICA_SHEETS } from "../shared/modules/informatica/types.ts";

/**
 * Converts the raw exports the Informatica team already produces into the flat
 * workbook `parseInformaticaPlano.ts` understands.
 *
 * The colleagues are not going to fill in the twelve-sheet flat template by
 * hand. They send what their tools export: three `.xlsx` of requests sharing
 * one header, and two `.csv` (appointments and work orders) dumped by the
 * ticketing tool. This module is the adapter between those five files and the
 * flat contract, so the upload route can keep a single downstream flow.
 *
 * Two rules govern everything here:
 *
 * - **Only aggregates leave this module.** The raw files carry person names,
 *   corporate user ids and free-text descriptions. Nothing of that is ever
 *   written into a flat sheet: those columns are read to group and count rows
 *   and are then dropped. What is persisted is a count per period and
 *   dimension.
 * - **Only the sheets these files can actually support are produced.** A
 *   converted workbook carries one or two sheets, never the full twelve. The
 *   sheets with no source here (Edificios, Incidencias, Encuestas, the yearly
 *   series, Imacs, Wasp, Renove) are simply absent, which leaves their deck
 *   page on "Próximamente" instead of inventing data.
 *
 * Detection is by header content, never by file name: the work-order export is
 * literally called "Peticiones ON SITE SSCC", so the name lies.
 */

/* -------------------------------------------------------------------------- */
/* Raw formats                                                                 */
/* -------------------------------------------------------------------------- */

export type RawInformaticaFormat =
  | "peticiones"
  | "citas"
  | "workorders"
  | "imacs"
  | "template";

/**
 * Columns that identify a request export beyond doubt.
 *
 * The three exports (`backlog`, `gestionadas`, `liberadas`) share one 19-column
 * header: `Nº Petición de sistemas`, `Posición`, `Retraso`, `Estatus de la
 * Posición`, `Usuario Asignado`, `Denominación Producto`, `Usuario
 * Beneficiario`, `Beneficiario`, `Denominación Edificio`, `Fecha liberación`,
 * `Fecha asignación`, `Fecha de demora`, `Fecha Gestionado`, `Número de
 * Pedido`, `Orden de Envío`, `Días Reales`, `Días Estimados`, `Prioridad`,
 * `Cantidad`. Only these two are required: an export with a couple of columns
 * dropped is still readable, and no flat sheet carries these names, so there is
 * no false positive.
 */
const RAW_PETICIONES_REQUIRED = ["Denominación Producto", "Estatus de la Posición"] as const;

/**
 * Columns that identify the SmartTech appointments export.
 *
 * The standalone CSV also carries `Remitente`, `Estado`, `Descripcion`,
 * `Asignado_a` and `Instancia`, but the same table inside the weekly template
 * ships without `Instancia`, and none of those columns is read here anyway. Only
 * the four that are actually used are required, so both shapes import.
 */
const RAW_CITAS_COLUMNS = [
  "Incidencia",
  "Walkup",
  "Cita_Previa",
  "Smart_Tech",
] as const;

/** Header of the work-order export. */
const RAW_WORKORDERS_COLUMNS = [
  "DWP_SRID",
  "Submit Date",
  "Work Order ID",
  "ASGRP",
  "Status",
  "Submitter",
  "ContactFullName",
  "Categorization Tier 1",
  "Categorization Tier 2",
  "Categorization Tier 3",
  "Site",
  "Site Group",
  "Chg Location Address",
  "Ubicacion_asociada",
  "Detailed Description",
] as const;

/** Header of Miguel's yearly IMAC export. */
const RAW_IMACS_COLUMNS = [
  "Fecha limite",
  "Edificio",
  "nº trabajos",
  "Solicitudes",
] as const;

/**
 * Origin written on every row the request workbooks produce.
 *
 * These three exports only ever cover the On Site channel, so the column is a
 * constant rather than something read from the file. The day another channel
 * is exported it will arrive as its own file and this constant becomes a
 * parameter.
 */
const PETICIONES_ORIGIN = "On Site";

/** Entity written on every `Peticiones` row: these files count positions. */
const PETICIONES_ENTITY = "Peticiones";

/** Value used when `Estatus de la Posición` is empty, as it is in two exports. */
const PETICIONES_NO_STATUS = "Sin estado";

/* -------------------------------------------------------------------------- */
/* Text helpers                                                                */
/* -------------------------------------------------------------------------- */

/** NFD, no combining marks, single spaces, trimmed, upper. */
function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function textOf(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/* -------------------------------------------------------------------------- */
/* Date helpers                                                                */
/* -------------------------------------------------------------------------- */

/*
 * Duplicated from `parseInformaticaPlano.ts` on purpose. They are three small
 * pure functions over a UTC date and duplicating them keeps this converter
 * independent of the parser's internals; the shared rule that matters (derive
 * the ISO week from the Thursday of the week) is respected identically.
 */

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/** UTC midnight of an Excel serial, dropping any time component. */
function dateFromSerial(serial: number): Date {
  return new Date(EXCEL_EPOCH + Math.trunc(serial) * 86400000);
}

/** Whole-day Excel serial of a UTC date. The inverse of `dateFromSerial`. */
function serialOf(date: Date): number {
  return Math.round((date.getTime() - EXCEL_EPOCH) / 86400000);
}

/** ISO week number, resolved through the Thursday of the week. */
function isoWeek(date: Date): number {
  const dayOfWeek = (date.getUTCDay() + 6) % 7;
  const thursday = new Date(date.getTime() + (3 - dayOfWeek) * 86400000);
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const firstOffset = (firstThursday.getUTCDay() + 6) % 7;
  const firstWeekThursday = new Date(firstThursday.getTime() + (3 - firstOffset) * 86400000);

  return 1 + Math.round((thursday.getTime() - firstWeekThursday.getTime()) / (7 * 86400000));
}

/** `YYYY/MM` of a UTC date. */
function monthLabelOf(date: Date): string {
  return `${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Reads a date cell of the request workbooks: an Excel serial, a `Date` when
 * the sheet was read with `cellDates`, or `DD/MM/YYYY` text.
 */
function parseWorkbookDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }

  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? dateFromSerial(value) : null;
  }

  return parseSpanishDateTime(String(value ?? ""));
}

/**
 * Reads the `DD/MM/YYYY, HH:MM:SS` text both CSV exports use. The time is
 * parsed only to be discarded: the flat contract works at day resolution.
 */
function parseSpanishDateTime(value: string): Date | null {
  const match = value.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);

  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCMonth() === month - 1 ? date : null;
}

/* -------------------------------------------------------------------------- */
/* Delimited text                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Decodes an uploaded buffer that is not a workbook container into text.
 *
 * The two CSV exports are UTF-16 LE with a BOM, which is why a naive UTF-8
 * read of them looks like text separated by null bytes. UTF-16 BE and plain
 * UTF-8 are accepted as well so a file re-saved by hand still imports.
 */
export function decodeInformaticaCsv(buffer: Buffer): string {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString("utf16le");
  }

  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    // Node has no utf16be decoder: swap the byte pairs and reuse utf16le.
    const swapped = Buffer.from(buffer.subarray(2));
    swapped.swap16();

    return swapped.toString("utf16le");
  }

  return buffer.toString("utf8").replace(/^\uFEFF/, "");
}

/**
 * Splits delimited text into records.
 *
 * Written by hand rather than pulled from a dependency because the input is
 * narrow and the naive alternative is wrong: the appointment export carries
 * newlines inside quoted description fields, so splitting on line breaks would
 * shred one row into several. Quoting follows the usual convention: a field
 * that opens with `"` ends at the next unpaired `"`, and `""` inside it is a
 * literal quote.
 */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let started = false;

  const endField = () => {
    record.push(field);
    field = "";
  };

  const endRecord = () => {
    endField();
    records.push(record);
    record = [];
    started = false;
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (quoted) {
      if (char !== '"') {
        field += char;
        continue;
      }

      if (text[index + 1] === '"') {
        field += '"';
        index += 1;
        continue;
      }

      quoted = false;
      continue;
    }

    if (char === '"' && field === "") {
      quoted = true;
      started = true;
      continue;
    }

    if (char === delimiter) {
      endField();
      started = true;
      continue;
    }

    if (char === "\r") {
      continue;
    }

    if (char === "\n") {
      // A blank line between records is separator noise, not an empty record.
      if (started || field !== "" || record.length > 0) {
        endRecord();
      }

      continue;
    }

    field += char;
    started = true;
  }

  if (started || field !== "" || record.length > 0) {
    endRecord();
  }

  return records;
}

/** Header of the first line of delimited text, without parsing the whole file. */
function headerOfDelimitedText(text: string, delimiter: string): string[] {
  const end = text.indexOf("\n");
  const firstLine = end === -1 ? text : text.slice(0, end);

  return (parseDelimited(firstLine, delimiter)[0] ?? []).map((cell) => cell.trim());
}

/** Column name to its position, matched with the parser's normalisation. */
function indexHeader(header: readonly unknown[]): Map<string, number> {
  const columns = new Map<string, number>();

  header.forEach((cell, index) => {
    const key = normalize(cell);

    if (key !== "" && !columns.has(key)) {
      columns.set(key, index);
    }
  });

  return columns;
}

function hasAll(columns: Map<string, number>, names: readonly string[]): boolean {
  return names.every((name) => columns.has(normalize(name)));
}

/* -------------------------------------------------------------------------- */
/* Detection                                                                   */
/* -------------------------------------------------------------------------- */

/** Sheet of a request workbook that carries the known header, if any. */
function findRawPeticionesSheet(workbook: XLSX.WorkBook): string | null {
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];

    if (!sheet) {
      continue;
    }

    const header = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: null,
      blankrows: false,
      range: 0,
    })[0];

    if (header && hasAll(indexHeader(header), RAW_PETICIONES_REQUIRED)) {
      return name;
    }
  }

  return null;
}

/** Sheet of the IMAC workbook that carries the yearly raw table, if any. */
function findRawImacsSheet(workbook: XLSX.WorkBook): string | null {
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];

    if (!sheet) {
      continue;
    }

    const header = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: null,
      blankrows: false,
      range: 0,
    })[0];

    if (header && hasAll(indexHeader(header), RAW_IMACS_COLUMNS)) {
      return name;
    }
  }

  return null;
}

/**
 * Which raw format an uploaded file is, or `null` when it is none of them.
 *
 * Takes an already-read workbook or the already-decoded text of a CSV, so the
 * caller decides how the bytes are read and this stays a pure classification.
 */
export function detectRawInformaticaFormat(
  input: XLSX.WorkBook | string
): RawInformaticaFormat | null {
  if (typeof input === "string") {
    const columns = indexHeader(headerOfDelimitedText(input, "\t"));

    if (hasAll(columns, RAW_CITAS_COLUMNS)) {
      return "citas";
    }

    if (hasAll(columns, RAW_WORKORDERS_COLUMNS)) {
      return "workorders";
    }

    return null;
  }

  if (!input || !Array.isArray(input.SheetNames)) {
    return null;
  }

  if (findRawPeticionesSheet(input) !== null) {
    return "peticiones";
  }

  if (findRawImacsSheet(input) !== null) {
    return "imacs";
  }

  return isInformaticaTemplateWorkbook(input) ? "template" : null;
}

/**
 * Whether a workbook already carries at least one sheet of the flat contract.
 *
 * Used by the route to tell "a flat book" from "an unknown file": a workbook
 * that is neither is rejected by name instead of importing as an empty deck.
 */
export function hasFlatInformaticaSheet(workbook: XLSX.WorkBook): boolean {
  if (!workbook || !Array.isArray(workbook.SheetNames)) {
    return false;
  }

  const known = new Set(
    Object.values(INFORMATICA_SHEETS).map((contract) => normalize(contract.sheet))
  );

  return workbook.SheetNames.some((name) => known.has(normalize(name)));
}

/* -------------------------------------------------------------------------- */
/* Aggregation                                                                 */
/* -------------------------------------------------------------------------- */

/** One flat row under construction: its dimensions plus the aggregate. */
interface Bucket {
  cells: (string | number)[];
  total: number;
}

/**
 * Accumulates a measure by dimension tuple and emits it as a sheet. Most raw
 * converters add one per row; IMAC adds the numeric requests/interventions.
 */
class Counter {
  private readonly buckets = new Map<string, Bucket>();

  add(cells: (string | number)[], amount = 1): void {
    const key = cells.map((cell) => normalize(cell)).join("|");
    const existing = this.buckets.get(key);

    if (existing) {
      existing.total += amount;
      return;
    }

    this.buckets.set(key, { cells, total: amount });
  }

  get size(): number {
    return this.buckets.size;
  }

  /** Rows in a stable order, so two runs on the same input give one file. */
  toRows(): (string | number)[][] {
    return Array.from(this.buckets.values())
      .sort((a, b) => compareCells(a.cells, b.cells))
      .map((bucket) => [...bucket.cells, bucket.total]);
  }
}

function compareCells(a: (string | number)[], b: (string | number)[]): number {
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const left = a[index];
    const right = b[index];

    if (typeof left === "number" && typeof right === "number") {
      if (left !== right) {
        return left - right;
      }

      continue;
    }

    const compared = String(left ?? "").localeCompare(String(right ?? ""), "es");

    if (compared !== 0) {
      return compared;
    }
  }

  return 0;
}

/** Period columns every generated sheet opens with: serial, ISO week, month. */
function periodCells(date: Date): [number, number, string] {
  return [serialOf(date), isoWeek(date), monthLabelOf(date)];
}

/** Builds a workbook out of the sheets a converter managed to fill. */
function buildWorkbook(sheets: { name: string; header: readonly string[]; rows: (string | number)[][] }[]): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();

  for (const sheet of sheets) {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([[...sheet.header], ...sheet.rows]),
      sheet.name
    );
  }

  return workbook;
}

/* -------------------------------------------------------------------------- */
/* Requests (three xlsx)                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Converts one request export into `Peticiones` and `PeticionesProducto`.
 *
 * The date of a row is the first of `Fecha liberación`, `Fecha asignación`,
 * `Fecha Gestionado` that carries a value: the three exports fill different
 * ones, and this order reads as "when the position last moved". Rows with no
 * date at all cannot be placed in a week and are dropped.
 *
 * The measure is a count of positions, one per row of the export. Uploading
 * the backlog and the released file together therefore counts a position that
 * appears in both twice: the flat sheet reports movements per state, not a
 * distinct set of request ids.
 *
 * `Usuario Asignado`, `Usuario Beneficiario` and `Beneficiario` are read by
 * nobody here. They stay in the uploaded file and never reach the dataset.
 */
export function convertRawPeticionesWorkbook(workbook: XLSX.WorkBook): XLSX.WorkBook {
  const sheetName = findRawPeticionesSheet(workbook);

  if (sheetName === null) {
    throw new Error("el libro no tiene la cabecera de un export de peticiones");
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
    defval: null,
  });

  const peticiones = new Counter();
  const productos = new Counter();

  for (const row of rows) {
    const date =
      parseWorkbookDate(row["Fecha liberación"]) ??
      parseWorkbookDate(row["Fecha asignación"]) ??
      parseWorkbookDate(row["Fecha Gestionado"]);

    if (!date) {
      continue;
    }

    const period = periodCells(date);
    const estado = textOf(row["Estatus de la Posición"]) || PETICIONES_NO_STATUS;
    const producto = textOf(row["Denominación Producto"]) || "Sin producto";

    peticiones.add([...period, PETICIONES_ORIGIN, estado, PETICIONES_ENTITY]);
    productos.add([...period, producto, estado]);
  }

  return buildWorkbook([
    {
      name: INFORMATICA_SHEETS.peticiones.sheet,
      header: INFORMATICA_SHEETS.peticiones.columns,
      rows: peticiones.toRows(),
    },
    {
      name: INFORMATICA_SHEETS.peticionesProducto.sheet,
      header: INFORMATICA_SHEETS.peticionesProducto.columns,
      rows: productos.toRows(),
    },
  ]);
}

/* -------------------------------------------------------------------------- */
/* IMACs (yearly xlsx)                                                         */
/* -------------------------------------------------------------------------- */

const IMACS_REQUESTS = "Solicitudes";
const IMACS_INTERVENTIONS = "Intervenciones";

/**
 * Buildings included in the client's IMAC chart, with its display labels.
 * Other sites can exist in the raw export but are outside this report scope.
 */
const IMACS_BUILDINGS = new Map<string, string>([
  [normalize("Alicante Rambla Mendez Nuñez"), "Alicante"],
  [normalize("Baleares Plaza del Olivar"), "Baleares"],
  [normalize("Barcelona Antoni Maura"), "Barcelona Maura"],
  [normalize("Barcelona Tarrasa"), "Barcelona Tarrasa"],
  [normalize("Bilbao Gran Vía"), "Bilbao"],
  [normalize("Coruña Cantón Pequeño"), "Coruña"],
  [normalize("Las Palmas Albareda 6"), "Las Palmas"],
  [normalize("Madrid Moraleja"), "Madrid Moraleja"],
  [normalize("Madrid Recoletos"), "Madrid Recoletos"],
  [normalize("Madrid SEDE"), "Madrid SEDE"],
  [normalize("Madrid Tablas I"), "Madrid Tablas I"],
  [normalize("Madrid Tres Cantos"), "Madrid Tres Cantos"],
  [normalize("Oviedo Mendizábal"), "Oviedo"],
  [normalize("Sevilla Avenida de la Palmera"), "Sevilla"],
  [normalize("Tenerife La Marina"), "Tenerife"],
  [normalize("Valencia Pintor Sorolla"), "Valencia Sorolla"],
  [normalize("Valencia Poeta Querol"), "Valencia Querol"],
  [normalize("Valladolid Duque de la Victoria"), "Valladolid"],
  [normalize("Zaragoza Plaza Salamero"), "Zaragoza"],
]);

/** First day of the month, used as the stable date of a monthly aggregate. */
function monthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/**
 * Converts the raw yearly IMAC table into monthly totals by building.
 *
 * Miguel's manual workbook copies these four columns into formulas and a
 * chart. Reading the raw table directly avoids the stale hard-coded cells in
 * that intermediate block. `Solicitudes` and `nº trabajos` are summed, not
 * counted: a single request can contain several interventions.
 */
export function convertRawImacsWorkbook(workbook: XLSX.WorkBook): XLSX.WorkBook {
  const sheetName = findRawImacsSheet(workbook);

  if (sheetName === null) {
    throw new Error("el libro no tiene la cabecera del export anual de IMACs");
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
    defval: null,
  });
  const imacs = new Counter();

  for (const row of rows) {
    const date = parseWorkbookDate(row["Fecha limite"]);
    const city = IMACS_BUILDINGS.get(normalize(row["Edificio"]));

    if (!date || !city) {
      continue;
    }

    const first = monthStart(date);
    const period = [serialOf(first), monthLabelOf(first)];
    const requests = row["Solicitudes"] === null ? NaN : Number(row["Solicitudes"]);
    const interventions = row["nº trabajos"] === null ? NaN : Number(row["nº trabajos"]);

    if (Number.isFinite(requests) && requests >= 0) {
      imacs.add([...period, city, IMACS_REQUESTS], requests);
    }

    if (Number.isFinite(interventions) && interventions >= 0) {
      imacs.add([...period, city, IMACS_INTERVENTIONS], interventions);
    }
  }

  return buildWorkbook([
    {
      name: INFORMATICA_SHEETS.imacs.sheet,
      header: INFORMATICA_SHEETS.imacs.columns,
      rows: imacs.toRows(),
    },
  ]);
}

/* -------------------------------------------------------------------------- */
/* Appointments (csv)                                                          */
/* -------------------------------------------------------------------------- */

/** Appointment types of the flat sheet, decided by which column is filled. */
const CITA_WITH_APPOINTMENT = "Con Cita";
const CITA_WALKUP = "Sin Cita";

/**
 * SmartTech points excluded from the appointment count.
 *
 * The telephony desk shares the export but is not part of the SmartTech
 * attendance figure of the report; keeping it in makes every weekly total
 * disagree with the published one.
 */
function isExcludedSmartTech(value: string): boolean {
  return normalize(value).includes("TELEFONIA");
}

/**
 * Converts the SmartTech appointments export into the `Citas` sheet.
 *
 * `Walkup` and `Cita_Previa` are mutually exclusive per row and together they
 * give both the date and the type: a filled `Cita_Previa` is an appointment, a
 * filled `Walkup` is a drop-in. A row with neither has no date and is dropped.
 *
 * `Smart_Tech` is used as the building dimension exactly as it arrives.
 * Resolving those labels to the official building names is a separate problem
 * (the `Edificios` sheet exists for it) and guessing here would silently merge
 * two sites.
 *
 * `Remitente`, `Asignado_a`, `Descripcion` and `Incidencia` are never read.
 */
function citasRowsOf(header: readonly unknown[], records: readonly unknown[][], buildings?: BuildingLocationMatcher): (string | number)[][] {
  const columns = indexHeader(header);

  if (!hasAll(columns, RAW_CITAS_COLUMNS)) {
    throw new Error("el fichero no tiene la cabecera del export de citas SmartTech");
  }

  const walkupAt = columns.get(normalize("Walkup"))!;
  const citaAt = columns.get(normalize("Cita_Previa"))!;
  const smartTechAt = columns.get(normalize("Smart_Tech"))!;

  const citas = new Counter();

  for (const record of records) {
    const sourceBuilding = textOf(record[smartTechAt]);
    const edificio = buildings?.resolve(sourceBuilding) ?? sourceBuilding;

    if (edificio === "" || isExcludedSmartTech(edificio)) {
      continue;
    }

    const conCita = parseWorkbookDate(record[citaAt]);
    const walkup = conCita ? null : parseWorkbookDate(record[walkupAt]);
    const date = conCita ?? walkup;

    if (!date) {
      continue;
    }

    citas.add([
      ...periodCells(date),
      edificio,
      conCita ? CITA_WITH_APPOINTMENT : CITA_WALKUP,
    ]);
  }

  return citas.toRows();
}

export function convertRawCitasCsv(text: string, buildings?: BuildingLocationMatcher): XLSX.WorkBook {
  const records = parseDelimited(text, "\t");

  return buildWorkbook([
    {
      name: INFORMATICA_SHEETS.citas.sheet,
      header: INFORMATICA_SHEETS.citas.columns,
      rows: citasRowsOf(records[0] ?? [], records.slice(1), buildings),
    },
  ]);
}

/* -------------------------------------------------------------------------- */
/* Work orders (csv)                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Converts the work-order export into the `WorkOrders` sheet.
 *
 * The file is named "Peticiones ON SITE SSCC" but its rows are work orders,
 * which is why detection ignores the file name.
 *
 * `Site` is the building; `Site Group` covers the rows where it is empty.
 * `Categorization Tier 2` is the type, the level the report groups by.
 *
 * `Submitter`, `ContactFullName`, `Chg Location Address` and
 * `Detailed Description` are never read.
 */
function workOrdersRowsOf(
  header: readonly unknown[],
  records: readonly unknown[][],
  buildings?: BuildingLocationMatcher
): (string | number)[][] {
  const columns = indexHeader(header);

  if (!hasAll(columns, RAW_WORKORDERS_COLUMNS)) {
    throw new Error("el fichero no tiene la cabecera del export de work orders");
  }

  const submitAt = columns.get(normalize("Submit Date"))!;
  const siteAt = columns.get(normalize("Site"))!;
  const siteGroupAt = columns.get(normalize("Site Group"))!;
  const addressAt = columns.get(normalize("Chg Location Address"))!;
  const associatedAt = columns.get(normalize("Ubicacion_asociada"))!;
  const tierAt = columns.get(normalize("Categorization Tier 2"))!;

  const ordenes = new Counter();

  for (const record of records) {
    const date = parseWorkbookDate(record[submitAt]);

    if (!date) {
      continue;
    }

    const site = textOf(record[siteAt]) || textOf(record[siteGroupAt]);
    const address = textOf(record[addressAt]);
    const associated = textOf(record[associatedAt]);
    const observed = buildings?.observe(site, address, associated);
    const edificio =
      observed ?? buildings?.resolve(site, address, associated) ?? (site || "Sin edificio");
    const tipo = textOf(record[tierAt]) || "Sin tipo";

    ordenes.add([...periodCells(date), edificio, tipo]);
  }

  return ordenes.toRows();
}

export function convertRawWorkOrdersCsv(text: string, buildings?: BuildingLocationMatcher): XLSX.WorkBook {
  const records = parseDelimited(text, "\t");

  return buildWorkbook([
    {
      name: INFORMATICA_SHEETS.workOrders.sheet,
      header: INFORMATICA_SHEETS.workOrders.columns,
      rows: workOrdersRowsOf(records[0] ?? [], records.slice(1), buildings),
    },
  ]);
}

/* -------------------------------------------------------------------------- */
/* Weekly template (one xlsx, thirteen raw tabs)                               */
/* -------------------------------------------------------------------------- */

/**
 * "Templates SSCC para presentación - Email semanal.xlsx": the workbook the
 * department actually receives every week.
 *
 * It is not the flat book and it is not one of the single-table exports: it is
 * thirteen raw tabs, three of which repeat tables this module already digests
 * (appointments, work orders) and the rest of which have no equivalent yet.
 * Everything here converts those tabs to flat sheets, so the parser, the merge
 * and the storage stay unaware that this format exists.
 *
 * Tabs are recognised by their header, never by their name. The names are
 * truncated to the 31 characters Excel allows ("11-10 - Comparativa Comonente_ "),
 * carry a typo, and their numbering shifts between weeks.
 */

/** Columns that identify each raw tab. */
const TEMPLATE_INCIDENCIAS_COLUMNS = [
  "Numero_incidencia",
  "Abierta",
  "Resuelta",
  "Categorization Tier 1",
  "Categorization Tier 2",
] as const;

const TEMPLATE_HIC_SERIE_COLUMNS = [
  "Fecha",
  "Incidencias resueltas",
  "Asignadas",
  "Asignaciones",
] as const;

const TEMPLATE_ENCUESTAS_COLUMNS = ["Incident Number", "Fecha"] as const;

/** Metric names written on the `Hic` sheet. */
const HIC_RESUELTAS = "Resueltas";
const HIC_ASIGNADAS = "Asignadas";
const HIC_ASIGNACIONES = "Asignaciones";
const HIC_INCIDENCIAS = "Incidencias";

/** Metric names written on the `Incidencias` sheet from the dashboard tab. */
const INCIDENCIA_ASIGNADAS = "Asignadas";
const INCIDENCIA_RESUELTAS = "Resueltas";

/** What a tab of the template turned out to be. */
type TemplateTabKind =
  | "encuestas"
  | "hicPivot"
  | "hicSerie"
  | "workorders"
  | "citas"
  | "incidencias"
  | "comparativa"
  | "slas";

interface TemplateTab {
  kind: TemplateTabKind;
  /** Sheet name as written in the workbook, used as the scope label. */
  name: string;
  header: unknown[];
  rows: unknown[][];
  /** Index of the header row inside the grid, for the two-header tabs. */
  headerAt: number;
  grid: unknown[][];
}

/** Normalised label with the spaces removed, for headers written both ways. */
function tight(value: unknown): string {
  return normalize(value).replace(/ /g, "");
}

/** `YYYY/MM` when the cell reads like a month label, else null. */
function monthTextOf(value: unknown): string | null {
  const match = String(value ?? "").trim().match(/^(\d{4})[/-](\d{1,2})$/);

  if (!match) {
    return null;
  }

  const month = Number(match[2]);

  return month >= 1 && month <= 12 ? `${match[1]}/${String(month).padStart(2, "0")}` : null;
}

/** `YYYY/MM` shifted by whole months. Negative deltas go back in time. */
function shiftMonth(month: string, delta: number): string {
  const [year, index] = month.split("/").map(Number);
  const shifted = new Date(Date.UTC(year, index - 1 + delta, 1));

  return monthLabelOf(shifted);
}

/**
 * Reads a measure cell of the template.
 *
 * The pivots write thousands with a separator and keep the cell as text
 * ("6,456"), the SLA tabs write "127 (98%)" and every tab writes "N/A" for a
 * component that did not exist that month. Only the leading integer is kept;
 * "N/A" and anything else without digits reads as no value at all, which drops
 * the row instead of writing a zero the source never reported.
 */
function templateNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const text = String(value ?? "").trim();
  const match = text.match(/^-?[\d.,\s]*\d/);

  if (!match) {
    return null;
  }

  const digits = match[0].replace(/[^\d-]/g, "");
  const parsed = Number(digits);

  return Number.isFinite(parsed) ? parsed : null;
}

/** Rows of a sheet as a grid, blank rows dropped. */
function gridOf(workbook: XLSX.WorkBook, name: string): unknown[][] {
  const sheet = workbook.Sheets[name];

  if (!sheet) {
    return [];
  }

  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
  });
}

/** Which raw table a grid holds, or null when it is none of them. */
function classifyTemplateTab(name: string, grid: unknown[][]): TemplateTab | null {
  const build = (kind: TemplateTabKind, headerAt: number): TemplateTab => ({
    kind,
    name: name.trim(),
    header: (grid[headerAt] ?? []) as unknown[],
    rows: grid.slice(headerAt + 1),
    headerAt,
    grid,
  });

  const first = (grid[0] ?? []) as unknown[];
  const columns = indexHeader(first);

  if (
    hasAll(columns, TEMPLATE_ENCUESTAS_COLUMNS) &&
    first.some((cell) => normalize(cell).includes("NIVEL DE SATIS"))
  ) {
    return build("encuestas", 0);
  }

  if (hasAll(columns, RAW_WORKORDERS_COLUMNS)) {
    return build("workorders", 0);
  }

  if (hasAll(columns, RAW_CITAS_COLUMNS)) {
    return build("citas", 0);
  }

  if (hasAll(columns, TEMPLATE_INCIDENCIAS_COLUMNS)) {
    return build("incidencias", 0);
  }

  if (hasAll(columns, TEMPLATE_HIC_SERIE_COLUMNS)) {
    return build("hicSerie", 0);
  }

  const tightFirst = first.map(tight);

  if (
    tightFirst.includes("MESACTUAL") &&
    tightFirst.some((cell) => cell.startsWith("MESANTERIOR"))
  ) {
    return build("comparativa", 0);
  }

  // The pivot repeats its header on the second row, where the dimension is
  // finally named; the months are on both.
  if (first.filter((cell) => monthTextOf(cell) !== null).length >= 2) {
    const second = (grid[1] ?? []) as unknown[];
    const repeated = second.filter((cell) => monthTextOf(cell) !== null).length >= 2;

    return build("hicPivot", repeated ? 1 : 0);
  }

  // The SLA tabs open with a spacer row and name their dimension on the second.
  const slaAt = grid.findIndex((row) => tight((row ?? [])[0]) === "SVTTITLE");

  if (slaAt !== -1) {
    return build("slas", slaAt);
  }

  return null;
}

/** Every recognised tab of a workbook, in workbook order. */
function templateTabsOf(workbook: XLSX.WorkBook): TemplateTab[] {
  const tabs: TemplateTab[] = [];

  for (const name of workbook.SheetNames) {
    const tab = classifyTemplateTab(name, gridOf(workbook, name));

    if (tab) {
      tabs.push(tab);
    }
  }

  return tabs;
}

/**
 * Whether a workbook is the weekly template.
 *
 * Three distinct raw tables is the threshold. One table on its own is one of
 * the standalone exports, which have their own converters; the flat book
 * matches none of these headers.
 */
export function isInformaticaTemplateWorkbook(workbook: XLSX.WorkBook): boolean {
  if (!workbook || !Array.isArray(workbook.SheetNames)) {
    return false;
  }

  return new Set(templateTabsOf(workbook).map((tab) => tab.kind)).size >= 3;
}

/**
 * The month the template reports on: its most recent month.
 *
 * The comparison tabs label their columns "Mes Actual", "Mes Anterior" and
 * "Hace dos meses" and never say which months those are, so the window has to
 * be anchored somewhere. The anchor is the last month of the monthly pivot,
 * which is the only tab that spells its months out; the monthly series are the
 * fallback, and the survey tab the last resort.
 */
function referenceMonthOf(tabs: TemplateTab[]): string | null {
  const months: string[] = [];

  for (const tab of tabs) {
    if (tab.kind === "hicPivot") {
      for (const cell of tab.header) {
        const month = monthTextOf(cell);

        if (month) {
          months.push(month);
        }
      }
    }

    if (tab.kind === "hicSerie" || tab.kind === "encuestas") {
      const columns = indexHeader(tab.header);
      const at = columns.get(normalize("Fecha"));

      if (at === undefined) {
        continue;
      }

      for (const row of tab.rows) {
        const month = monthTextOf(row[at]);

        if (month) {
          months.push(month);
        }
      }
    }
  }

  return months.length === 0 ? null : months.sort().at(-1)!;
}

/**
 * Survey answers, aggregated to a count per month and score.
 *
 * `Usuario`, `Ticket`, `Incident Number` and the two free-text columns are
 * never read: the flat sheet only ever carries "how many answers scored N in
 * month M". This is the module's privacy rule and the reason the conversion
 * happens on the server before anything is stored.
 */
function encuestasRowsOf(tab: TemplateTab): (string | number)[][] {
  const columns = indexHeader(tab.header);
  const mesAt = columns.get(normalize("Fecha"))!;
  const scoreAt = tab.header.findIndex((cell) => normalize(cell).includes("NIVEL DE SATIS"));
  const resolvedAt = columns.get(normalize("Last Resolved Date"));

  const encuestas = new Counter();

  for (const row of tab.rows) {
    const resolved = resolvedAt === undefined ? null : parseWorkbookDate(row[resolvedAt]);
    const mes = monthTextOf(row[mesAt]) ?? (resolved ? monthLabelOf(resolved) : null);
    const score = templateNumber(row[scoreAt]);

    if (!mes || score === null) {
      continue;
    }

    // `Fecha` is a month, not a day: the flat sheet's `Fecha` stays empty and
    // `Mes` carries the period, which the parser accepts.
    encuestas.add(["", mes, String(score)]);
  }

  return encuestas.toRows();
}

/**
 * The onsite dashboard, converted to the `Incidencias` sheet.
 *
 * One raw row is one incident and produces up to two flat rows, because the
 * flat sheet reports movements and an incident moves twice: it is assigned when
 * it opens and resolved when it closes. So the `Asignadas` row is dated by
 * `Abierta` and the `Resueltas` row by `Resuelta`, and an incident still open
 * only produces the first. Counting both from one date instead would put every
 * resolution in the week the incident was raised.
 *
 * `Categoria` is `Categorization Tier 1` and `Subcategoria` is
 * `Categorization Tier 2`, which is the level the report groups by. `Tier 3` has
 * no column in the flat contract and is not lost: the three-month top-ten of the
 * deck reads it from the `Comparativas` sheet, which is where the source itself
 * publishes it.
 *
 * `Breve_Descripcion`, `Asignado_a`, `Puesto` and `Numero_incidencia` are never
 * read.
 */
function incidenciasRowsOf(tab: TemplateTab, buildings?: BuildingLocationMatcher): (string | number)[][] {
  const columns = indexHeader(tab.header);
  const abiertaAt = columns.get(normalize("Abierta"))!;
  const resueltaAt = columns.get(normalize("Resuelta"))!;
  const tier1At = columns.get(normalize("Categorization Tier 1"))!;
  const tier2At = columns.get(normalize("Categorization Tier 2"))!;
  const edificioAt = columns.get(normalize("Edificio"));
  const siteAt = columns.get(normalize("Site"));

  const incidencias = new Counter();

  for (const row of tab.rows) {
    const categoria = textOf(row[tier1At]) || "Sin categoria";
    const subcategoria = textOf(row[tier2At]) || "Sin subcategoria";
    const sourceBuilding =
      (edificioAt === undefined ? "" : textOf(row[edificioAt])) ||
      (siteAt === undefined ? "" : textOf(row[siteAt])) ||
      "Sin edificio";
    const edificio = buildings?.resolve(sourceBuilding) ?? sourceBuilding;

    const abierta = parseWorkbookDate(row[abiertaAt]);
    const resuelta = parseWorkbookDate(row[resueltaAt]);

    if (abierta) {
      incidencias.add([
        ...periodCells(abierta),
        categoria,
        subcategoria,
        INCIDENCIA_ASIGNADAS,
        edificio,
      ]);
    }

    if (resuelta) {
      incidencias.add([
        ...periodCells(resuelta),
        categoria,
        subcategoria,
        INCIDENCIA_RESUELTAS,
        edificio,
      ]);
    }
  }

  return incidencias.toRows();
}

/** One monthly series tab: three metrics per month, nulls skipped. */
function hicSerieRowsOf(tab: TemplateTab): (string | number)[][] {
  const columns = indexHeader(tab.header);
  const mesAt = columns.get(normalize("Fecha"))!;
  const metrics: [string, number][] = [
    [HIC_RESUELTAS, columns.get(normalize("Incidencias resueltas"))!],
    [HIC_ASIGNADAS, columns.get(normalize("Asignadas"))!],
    [HIC_ASIGNACIONES, columns.get(normalize("Asignaciones"))!],
  ];

  const rows: (string | number)[][] = [];

  for (const row of tab.rows) {
    const mes = monthTextOf(row[mesAt]);

    if (!mes) {
      continue;
    }

    for (const [metrica, at] of metrics) {
      const total = templateNumber(row[at]);

      if (total !== null) {
        rows.push([tab.name, mes, "", metrica, total]);
      }
    }
  }

  return rows;
}

/** The monthly pivot by category: one row per category and month. */
function hicPivotRowsOf(tab: TemplateTab): (string | number)[][] {
  const months: [number, string][] = [];

  tab.header.forEach((cell, index) => {
    const month = monthTextOf(cell);

    if (month) {
      months.push([index, month]);
    }
  });

  const rows: (string | number)[][] = [];

  for (const row of tab.rows) {
    const categoria = textOf(row[0]);

    // The pivot closes with its own total row, which would double every figure.
    if (categoria === "" || tight(categoria) === "TOTAL") {
      continue;
    }

    for (const [at, mes] of months) {
      const total = templateNumber(row[at]);

      if (total !== null) {
        rows.push([tab.name, mes, categoria, HIC_INCIDENCIAS, total]);
      }
    }
  }

  return rows;
}

/**
 * A three-month comparison tab, despivoted onto real months.
 *
 * "Mes Actual" is the reference month of the workbook, which is the month in
 * progress and therefore partial; "Mes Anterior" is the month the report is
 * about. `N/A` cells are dropped rather than written as zero.
 */
function comparativasRowsOf(tab: TemplateTab, reference: string): (string | number)[][] {
  const tightHeader = tab.header.map(tight);
  const offsets: [number, string][] = [];

  tightHeader.forEach((cell, index) => {
    if (cell === "MESACTUAL") {
      offsets.push([index, reference]);
    } else if (cell.startsWith("MESANTERIOR")) {
      offsets.push([index, shiftMonth(reference, -1)]);
    } else if (cell.startsWith("HACEDOS")) {
      offsets.push([index, shiftMonth(reference, -2)]);
    }
  });

  const rows: (string | number)[][] = [];

  for (const row of tab.rows) {
    const elemento = textOf(row[0]);

    if (elemento === "" || tight(elemento) === "TOTAL") {
      continue;
    }

    for (const [at, mes] of offsets) {
      const total = templateNumber(row[at]);

      if (total !== null) {
        rows.push([tab.name, elemento, mes, total]);
      }
    }
  }

  return rows;
}

/**
 * An SLA tab, dated by the month its title refers to.
 *
 * The workbook ships two of them, "finalizados mes en curso" and "finalizados
 * mes anterior", and neither states a month. They are told apart by name here —
 * the only place in this module where a name is read — because the tables are
 * structurally identical and nothing inside them distinguishes the periods.
 * Anything that is not recognisably the previous month is treated as the
 * current one, in the order the tabs appear.
 */
function slaMonthOf(tab: TemplateTab, reference: string): string {
  return normalize(tab.name).includes("MES AN") ? shiftMonth(reference, -1) : reference;
}

function slasRowsOf(tab: TemplateTab, reference: string): (string | number)[][] {
  const columns = indexHeader(tab.header);
  const cumplidoAt = columns.get(normalize("Cumplido"));
  const incumplidoAt = columns.get(normalize("Incumplido"));
  const totalAt = columns.get(normalize("Total"));

  if (cumplidoAt === undefined || incumplidoAt === undefined) {
    return [];
  }

  const mes = slaMonthOf(tab, reference);
  const rows: (string | number)[][] = [];

  for (const row of tab.rows) {
    const svt = textOf(row[0]);

    if (svt === "" || tight(svt) === "TOTAL" || tight(svt) === "SVTTITLE") {
      continue;
    }

    const cumplido = templateNumber(row[cumplidoAt]);
    const incumplido = templateNumber(row[incumplidoAt]);

    if (cumplido === null || incumplido === null) {
      continue;
    }

    const total = totalAt === undefined ? null : templateNumber(row[totalAt]);

    rows.push([mes, svt, cumplido, incumplido, total ?? cumplido + incumplido]);
  }

  return rows;
}

/**
 * Converts the whole weekly template into a flat workbook.
 *
 * Every tab it manages to read becomes a flat sheet; a tab it does not
 * recognise is ignored rather than failing the upload, because the department
 * adds and reorders tabs between weeks. A sheet with no rows is not written at
 * all, which leaves its page on "Próximamente".
 */
export function convertInformaticaTemplateWorkbook(workbook: XLSX.WorkBook, buildings?: BuildingLocationMatcher): XLSX.WorkBook {
  const tabs = templateTabsOf(workbook);

  if (tabs.length === 0) {
    throw new Error("el libro no trae ninguna pestaña reconocible del template semanal");
  }

  const reference = referenceMonthOf(tabs);

  const encuestas: (string | number)[][] = [];
  const incidencias: (string | number)[][] = [];
  const workOrders: (string | number)[][] = [];
  const citas: (string | number)[][] = [];
  const hic: (string | number)[][] = [];
  const comparativas: (string | number)[][] = [];
  const slas: (string | number)[][] = [];

  for (const tab of tabs) {
    switch (tab.kind) {
      case "encuestas":
        encuestas.push(...encuestasRowsOf(tab));
        break;
      case "incidencias":
        incidencias.push(...incidenciasRowsOf(tab, buildings));
        break;
      case "workorders":
        workOrders.push(...workOrdersRowsOf(tab.header, tab.rows, buildings));
        break;
      case "citas":
        citas.push(...citasRowsOf(tab.header, tab.rows, buildings));
        break;
      case "hicSerie":
        hic.push(...hicSerieRowsOf(tab));
        break;
      case "hicPivot":
        hic.push(...hicPivotRowsOf(tab));
        break;
      case "comparativa":
        if (reference) {
          comparativas.push(...comparativasRowsOf(tab, reference));
        }
        break;
      case "slas":
        if (reference) {
          slas.push(...slasRowsOf(tab, reference));
        }
        break;
    }
  }

  const sheets: { name: string; header: readonly string[]; rows: (string | number)[][] }[] = [];
  const add = (
    contract: { sheet: string; columns: readonly string[] },
    rows: (string | number)[][]
  ) => {
    if (rows.length > 0) {
      sheets.push({ name: contract.sheet, header: contract.columns, rows });
    }
  };

  add(INFORMATICA_SHEETS.encuestas, encuestas);
  add(INFORMATICA_SHEETS.incidencias, incidencias);
  add(INFORMATICA_SHEETS.workOrders, workOrders);
  add(INFORMATICA_SHEETS.citas, citas);
  add(INFORMATICA_SHEETS.hic, hic);
  add(INFORMATICA_SHEETS.comparativas, comparativas);
  add(INFORMATICA_SHEETS.slas, slas);

  if (sheets.length === 0) {
    throw new Error("el template semanal no trae ninguna fila legible");
  }

  return buildWorkbook(sheets);
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Converts already-decoded CSV text of a known raw format into a flat workbook.
 * The workbook variant is `convertRawPeticionesWorkbook`.
 */
export function convertRawInformaticaCsv(text: string, format: "citas" | "workorders", buildings?: BuildingLocationMatcher): XLSX.WorkBook {
  return format === "citas" ? convertRawCitasCsv(text, buildings) : convertRawWorkOrdersCsv(text, buildings);
}
