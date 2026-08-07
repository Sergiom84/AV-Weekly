import * as XLSX from "xlsx";
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

export type RawInformaticaFormat = "peticiones" | "citas" | "workorders";

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

/** Header of the SmartTech appointments export. */
const RAW_CITAS_COLUMNS = [
  "Incidencia",
  "Walkup",
  "Cita_Previa",
  "Remitente",
  "Estado",
  "Descripcion",
  "Asignado_a",
  "Smart_Tech",
  "Instancia",
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

  return findRawPeticionesSheet(input) === null ? null : "peticiones";
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

/** One flat row under construction: its dimensions plus the count. */
interface Bucket {
  cells: (string | number)[];
  total: number;
}

/**
 * Accumulates counts by dimension tuple and emits them as a sheet.
 *
 * Every converter here counts rows, so the measure is always "how many raw
 * rows fell in this bucket". The dimension tuple is the row minus that measure.
 */
class Counter {
  private readonly buckets = new Map<string, Bucket>();

  add(cells: (string | number)[]): void {
    const key = cells.map((cell) => normalize(cell)).join("|");
    const existing = this.buckets.get(key);

    if (existing) {
      existing.total += 1;
      return;
    }

    this.buckets.set(key, { cells, total: 1 });
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
export function convertRawCitasCsv(text: string): XLSX.WorkBook {
  const records = parseDelimited(text, "\t");
  const columns = indexHeader(records[0] ?? []);

  if (!hasAll(columns, RAW_CITAS_COLUMNS)) {
    throw new Error("el fichero no tiene la cabecera del export de citas SmartTech");
  }

  const walkupAt = columns.get(normalize("Walkup"))!;
  const citaAt = columns.get(normalize("Cita_Previa"))!;
  const smartTechAt = columns.get(normalize("Smart_Tech"))!;

  const citas = new Counter();

  for (const record of records.slice(1)) {
    const edificio = textOf(record[smartTechAt]);

    if (edificio === "" || isExcludedSmartTech(edificio)) {
      continue;
    }

    const conCita = parseSpanishDateTime(String(record[citaAt] ?? ""));
    const walkup = conCita ? null : parseSpanishDateTime(String(record[walkupAt] ?? ""));
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

  return buildWorkbook([
    {
      name: INFORMATICA_SHEETS.citas.sheet,
      header: INFORMATICA_SHEETS.citas.columns,
      rows: citas.toRows(),
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
export function convertRawWorkOrdersCsv(text: string): XLSX.WorkBook {
  const records = parseDelimited(text, "\t");
  const columns = indexHeader(records[0] ?? []);

  if (!hasAll(columns, RAW_WORKORDERS_COLUMNS)) {
    throw new Error("el fichero no tiene la cabecera del export de work orders");
  }

  const submitAt = columns.get(normalize("Submit Date"))!;
  const siteAt = columns.get(normalize("Site"))!;
  const siteGroupAt = columns.get(normalize("Site Group"))!;
  const tierAt = columns.get(normalize("Categorization Tier 2"))!;

  const ordenes = new Counter();

  for (const record of records.slice(1)) {
    const date = parseSpanishDateTime(String(record[submitAt] ?? ""));

    if (!date) {
      continue;
    }

    const edificio = textOf(record[siteAt]) || textOf(record[siteGroupAt]) || "Sin edificio";
    const tipo = textOf(record[tierAt]) || "Sin tipo";

    ordenes.add([...periodCells(date), edificio, tipo]);
  }

  return buildWorkbook([
    {
      name: INFORMATICA_SHEETS.workOrders.sheet,
      header: INFORMATICA_SHEETS.workOrders.columns,
      rows: ordenes.toRows(),
    },
  ]);
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Converts already-decoded CSV text of a known raw format into a flat workbook.
 * The workbook variant is `convertRawPeticionesWorkbook`.
 */
export function convertRawInformaticaCsv(text: string, format: "citas" | "workorders"): XLSX.WorkBook {
  return format === "citas" ? convertRawCitasCsv(text) : convertRawWorkOrdersCsv(text);
}
