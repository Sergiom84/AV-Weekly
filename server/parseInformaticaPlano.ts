import * as XLSX from "xlsx";
import {
  INFORMATICA_SHEETS,
  type InformaticaCitaAnualRow,
  type InformaticaCitaRow,
  type InformaticaDataset,
  type InformaticaEdificioRow,
  type InformaticaEncuestaRow,
  type InformaticaImacRow,
  type InformaticaIncidenciaRow,
  type InformaticaPeticionAnualRow,
  type InformaticaPeticionProductoRow,
  type InformaticaPeticionRow,
  type InformaticaRenoveRow,
  type InformaticaSectionKey,
  type InformaticaWaspRow,
  type InformaticaWorkOrderRow,
} from "../shared/modules/informatica/types.ts";

/**
 * Parser for the flat Informatica workbook ("Informatica (plano).xlsx").
 *
 * The AV parser (`parseInformePlano.ts`) is the model, not the shape: AV builds
 * week x support-type matrices, Informatica stays in long format and leaves the
 * pivoting to the renderer. What is reused is the convention:
 *
 * - Sheet names and column headers are matched normalised (NFD, no accents, no
 *   double spaces, upper), so `Categoría` and `CATEGORIA` are the same column.
 * - Repeated rows accumulate instead of overwriting: rows sharing every
 *   dimension add up their measure.
 * - Invalid rows are skipped instead of aborting the import.
 * - The ISO week and the ISO week-year are derived from the Thursday of the
 *   week of `Fecha`, never from the calendar year of the cell.
 *
 * The central rule of this module: **every sheet is optional**. A missing or
 * empty sheet leaves its section `undefined` and the import still succeeds, so
 * the deck can render "Próximamente" on the pages that have no data yet. The
 * parser only fails when the file is not a workbook at all.
 */

/* -------------------------------------------------------------------------- */
/* Import report                                                               */
/* -------------------------------------------------------------------------- */

/** What happened with one sheet of the workbook. */
export interface InformaticaSheetReport {
  key: InformaticaSectionKey;
  /** Sheet name declared in the contract, e.g. "PeticionesProducto". */
  sheet: string;
  /** Whether a sheet with that name (normalised) was in the workbook. */
  present: boolean;
  /** Data rows read, after accumulating repeated dimensions. */
  rows: number;
  /** Rows with content that could not be read and were discarded. */
  skipped: number;
  /** Declared columns that were not found in the header row. */
  missingColumns: string[];
}

export interface InformaticaImportReport {
  sheets: InformaticaSheetReport[];
  /** Known sheets present in the workbook, in workbook order. */
  sheetsFound: InformaticaSectionKey[];
  /** Sheets in the workbook that the contract does not know about. */
  unknownSheets: string[];
}

export interface InformaticaParseResult {
  /** `source` is left blank: the route fills it with the upload metadata. */
  dataset: InformaticaDataset;
  report: InformaticaImportReport;
}

/* -------------------------------------------------------------------------- */
/* Text and number helpers                                                     */
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

/** Numeric value of a measure cell. Null when the cell carries no number. */
function toNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const text = String(value ?? "").trim();

  if (text === "") {
    return null;
  }

  // "1.234", "1 234" and "12,5" all reach this parser from hand-edited files.
  const cleaned = text.replace(/[\s.]/g, "").replace(",", ".");
  const parsed = Number(cleaned);

  return Number.isFinite(parsed) ? parsed : null;
}

/** Integer measure. Counts are always whole numbers in this report. */
function toCount(value: unknown): number | null {
  const parsed = toNumber(value);
  return parsed === null ? null : Math.round(parsed);
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/** UTC midnight of an Excel serial, dropping any time component. */
function dateFromSerial(serial: number): Date {
  return new Date(EXCEL_EPOCH + Math.trunc(serial) * 86400000);
}

/** ISO week number of a UTC date. */
function isoWeek(date: Date): number {
  const dayOfWeek = (date.getUTCDay() + 6) % 7;
  const thursday = new Date(date.getTime() + (3 - dayOfWeek) * 86400000);
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const firstOffset = (firstThursday.getUTCDay() + 6) % 7;
  const firstWeekThursday = new Date(
    firstThursday.getTime() + (3 - firstOffset) * 86400000
  );

  return 1 + Math.round((thursday.getTime() - firstWeekThursday.getTime()) / (7 * 86400000));
}

/**
 * ISO week-year of a UTC date: the year of the Thursday of its week.
 *
 * Exported because week 1 and week 53 straddle the calendar year, so anything
 * that groups weeks needs this rather than `getUTCFullYear()`.
 */
export function isoWeekYear(date: Date): number {
  const dayOfWeek = (date.getUTCDay() + 6) % 7;
  return new Date(date.getTime() + (3 - dayOfWeek) * 86400000).getUTCFullYear();
}

/** `YYYY/MM` of a UTC date. */
function monthLabelOf(date: Date): string {
  return `${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** `YYYY-MM-DD` of a UTC date. */
function isoDateOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Reads a `Fecha` cell. The template writes an Excel serial, but a workbook
 * edited by hand carries ISO text or `dd/mm/yyyy`, and a sheet read with
 * `cellDates` carries a `Date`. All four are accepted.
 */
function parseDateCell(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }

  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? dateFromSerial(value) : null;
  }

  const text = String(value ?? "").trim();

  if (text === "") {
    return null;
  }

  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);

  if (iso) {
    return utcDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const dmy = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);

  if (dmy) {
    return utcDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  }

  // A serial pasted as text, e.g. "46230".
  const serial = Number(text);

  return Number.isFinite(serial) && serial > 0 ? dateFromSerial(serial) : null;
}

function utcDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCMonth() === month - 1 ? date : null;
}

/** Reads a `Mes` cell into the `YYYY/MM` contract. */
function parseMonthCell(value: unknown): string | null {
  if (value instanceof Date || typeof value === "number") {
    const date = parseDateCell(value);
    return date ? monthLabelOf(date) : null;
  }

  const text = String(value ?? "").trim();

  if (text === "") {
    return null;
  }

  const yearFirst = text.match(/^(\d{4})\s*[-/.]\s*(\d{1,2})$/);

  if (yearFirst) {
    return buildMonth(Number(yearFirst[1]), Number(yearFirst[2]));
  }

  const monthFirst = text.match(/^(\d{1,2})\s*[-/.]\s*(\d{4})$/);

  if (monthFirst) {
    return buildMonth(Number(monthFirst[2]), Number(monthFirst[1]));
  }

  return null;
}

function buildMonth(year: number, month: number): string | null {
  if (month < 1 || month > 12 || year < 1900 || year > 2999) {
    return null;
  }

  return `${year}/${String(month).padStart(2, "0")}`;
}

/** Reads a `Si`/`No` cell. Anything unrecognised falls back to `fallback`. */
function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  const text = normalize(value);

  if (text === "") {
    return fallback;
  }

  if (["SI", "S", "TRUE", "VERDADERO", "1", "X", "Y", "YES"].includes(text)) {
    return true;
  }

  if (["NO", "N", "FALSE", "FALSO", "0"].includes(text)) {
    return false;
  }

  return fallback;
}

/* -------------------------------------------------------------------------- */
/* Sheet reading                                                               */
/* -------------------------------------------------------------------------- */

/** One data row, addressed by column name instead of by position. */
class RowReader {
  constructor(
    private readonly columns: Map<string, number>,
    private readonly cells: unknown[]
  ) {}

  raw(column: string): unknown {
    const index = this.columns.get(normalize(column));
    return index === undefined ? null : (this.cells[index] ?? null);
  }

  /** Trimmed text, with the original accents and casing preserved. */
  text(column: string): string {
    const value = this.raw(column);
    return value instanceof Date ? isoDateOf(value) : String(value ?? "").trim();
  }

  count(column: string): number | null {
    return toCount(this.raw(column));
  }

  /** True when every cell of the row is empty: a trailing row, not an error. */
  get isBlank(): boolean {
    return this.cells.every((cell) => cell === null || cell === undefined || String(cell).trim() === "");
  }
}

interface SheetTable {
  columns: Map<string, number>;
  rows: unknown[][];
  missingColumns: string[];
}

/** Finds a sheet by normalised name and reads it as a header plus raw rows. */
function readSheet(
  workbook: XLSX.WorkBook,
  sheetName: string,
  expectedColumns: readonly string[]
): SheetTable | null {
  const target = normalize(sheetName);
  const match = workbook.SheetNames.find((name) => normalize(name) === target);

  if (!match) {
    return null;
  }

  const sheet = workbook.Sheets[match];

  if (!sheet) {
    return null;
  }

  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
  });

  const header = (grid[0] ?? []) as unknown[];
  const columns = new Map<string, number>();

  header.forEach((cell, index) => {
    const key = normalize(cell);

    if (key !== "" && !columns.has(key)) {
      columns.set(key, index);
    }
  });

  return {
    columns,
    rows: grid.slice(1),
    missingColumns: expectedColumns.filter((column) => !columns.has(normalize(column))),
  };
}

/* -------------------------------------------------------------------------- */
/* Period columns                                                              */
/* -------------------------------------------------------------------------- */

interface ParsedPeriod {
  /** Normalised `Fecha`: ISO text, whatever the input format was. */
  fecha: string | null;
  semana: number;
  mes: string;
  /** ISO week-year, derived from the Thursday. Not stored, used for checks. */
  weekYear: number | null;
}

/**
 * Reads `Fecha`, `Semana` and `Mes`.
 *
 * `Fecha` is the authority: when it is present, the week and the month are
 * derived from it and the columns are only a fallback. The month is what makes
 * a row a row: without a readable month there is no period and it is discarded.
 *
 * The week is not required even on the weekly sheets. Several pages of the
 * report are monthly, so a row that only states a month is real data, not a
 * defect; it keeps `semana: 0`, outside the 1-53 range, which is how a consumer
 * tells "no week" from a week.
 */
function readPeriod(row: RowReader, options: { week: boolean }): ParsedPeriod | null {
  const date = parseDateCell(row.raw("Fecha"));
  const mes = parseMonthCell(row.raw("Mes")) ?? (date ? monthLabelOf(date) : null);

  if (!mes) {
    return null;
  }

  let semana = 0;

  if (options.week) {
    const declared = row.count("Semana");

    if (declared !== null && declared >= 1 && declared <= 53) {
      semana = declared;
    } else if (date) {
      semana = isoWeek(date);
    }
  }

  return {
    fecha: date ? isoDateOf(date) : null,
    semana,
    mes,
    weekYear: date ? isoWeekYear(date) : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Generic section parsing                                                     */
/* -------------------------------------------------------------------------- */

interface ParsedRow<T> {
  /** Identity of the row: rows sharing a key accumulate. */
  key: string;
  value: T;
}

interface SectionSpec<T> {
  key: InformaticaSectionKey;
  /** Builds one row, or null when the row is invalid and must be skipped. */
  parse: (row: RowReader) => ParsedRow<T> | null;
  /** Folds a repeated row into the one already collected. */
  accumulate: (target: T, incoming: T) => void;
  /** Optional final ordering, applied once per import. */
  sort?: (a: T, b: T) => number;
}

interface SectionResult<T> {
  rows: T[] | undefined;
  report: InformaticaSheetReport;
}

function parseSection<T>(workbook: XLSX.WorkBook, spec: SectionSpec<T>): SectionResult<T> {
  const contract = INFORMATICA_SHEETS[spec.key];
  const table = readSheet(workbook, contract.sheet, contract.columns);

  if (!table) {
    return {
      rows: undefined,
      report: {
        key: spec.key,
        sheet: contract.sheet,
        present: false,
        rows: 0,
        skipped: 0,
        missingColumns: [],
      },
    };
  }

  const buckets = new Map<string, T>();
  let skipped = 0;

  for (const cells of table.rows) {
    const reader = new RowReader(table.columns, cells ?? []);

    // Trailing empty rows are not a defect, so they are not reported.
    if (reader.isBlank) {
      continue;
    }

    const parsed = spec.parse(reader);

    if (!parsed) {
      skipped += 1;
      continue;
    }

    const existing = buckets.get(parsed.key);

    if (existing) {
      spec.accumulate(existing, parsed.value);
      continue;
    }

    buckets.set(parsed.key, parsed.value);
  }

  const rows = Array.from(buckets.values());

  if (spec.sort) {
    rows.sort(spec.sort);
  }

  return {
    // A sheet with a header and no readable row keeps its page on
    // "Próximamente" instead of rendering an empty chart.
    rows: rows.length > 0 ? rows : undefined,
    report: {
      key: spec.key,
      sheet: contract.sheet,
      present: true,
      rows: rows.length,
      skipped,
      missingColumns: table.missingColumns,
    },
  };
}

/** Key fragment of a dimension: accent and case insensitive. */
function dim(value: string): string {
  return normalize(value);
}

function periodKey(period: ParsedPeriod): string {
  return `${period.fecha ?? ""}|${period.semana}|${period.mes}`;
}

const compareText = (a: string, b: string) => a.localeCompare(b, "es");

/* -------------------------------------------------------------------------- */
/* Section specs                                                               */
/* -------------------------------------------------------------------------- */

const edificios: SectionSpec<InformaticaEdificioRow> = {
  key: "edificios",
  parse: (row) => {
    const edificio = row.text("Edificio");

    if (edificio === "") {
      return null;
    }

    const aliasSmartTech = row.text("Alias SmartTech");
    const aliasWorkOrder = row.text("Alias WorkOrder");
    const aliasImacs = row.text("Alias IMACS");
    const aliasPeticiones = row.text("Alias Peticiones");

    return {
      // A building may repeat with a different alias, so the alias set is part
      // of the identity: those rows are distinct, not a duplicate to fold.
      key: [edificio, aliasSmartTech, aliasWorkOrder, aliasImacs, aliasPeticiones]
        .map(dim)
        .join("|"),
      value: {
        edificio,
        dt: row.text("DT"),
        aliasSmartTech,
        aliasWorkOrder,
        aliasImacs,
        aliasPeticiones,
        visible: parseBoolean(row.raw("Visible"), true),
        orden: row.count("Orden") ?? Number.MAX_SAFE_INTEGER,
      },
    };
  },
  accumulate: () => {
    // Identical rows carry no measure: the first one already says everything.
  },
  sort: (a, b) => a.orden - b.orden || compareText(a.edificio, b.edificio),
};

const incidencias: SectionSpec<InformaticaIncidenciaRow> = {
  key: "incidencias",
  parse: (row) => {
    const period = readPeriod(row, { week: true });
    const tickets = row.count("Tickets");

    if (!period || tickets === null) {
      return null;
    }

    const categoria = row.text("Categoria");
    const subcategoria = row.text("Subcategoria");
    const metrica = row.text("Metrica");
    // Empty on purpose means "SSCC as a whole", so it is not a defect.
    const edificio = row.text("Edificio");

    if (categoria === "" && subcategoria === "" && metrica === "") {
      return null;
    }

    return {
      key: `${periodKey(period)}|${dim(categoria)}|${dim(subcategoria)}|${dim(metrica)}|${dim(edificio)}`,
      value: {
        fecha: period.fecha,
        semana: period.semana,
        mes: period.mes,
        categoria,
        subcategoria,
        metrica,
        edificio,
        tickets,
      },
    };
  },
  accumulate: (target, incoming) => {
    target.tickets += incoming.tickets;
  },
};

const encuestas: SectionSpec<InformaticaEncuestaRow> = {
  key: "encuestas",
  parse: (row) => {
    const period = readPeriod(row, { week: false });
    const respuestas = row.count("Respuestas");
    const valoracion = row.text("Valoracion");

    if (!period || respuestas === null || valoracion === "") {
      return null;
    }

    return {
      key: `${periodKey(period)}|${dim(valoracion)}`,
      value: { fecha: period.fecha, mes: period.mes, valoracion, respuestas },
    };
  },
  accumulate: (target, incoming) => {
    target.respuestas += incoming.respuestas;
  },
};

const workOrders: SectionSpec<InformaticaWorkOrderRow> = {
  key: "workOrders",
  parse: (row) => {
    const period = readPeriod(row, { week: true });
    const ordenes = row.count("Ordenes");
    const edificio = row.text("Edificio");
    const tipo = row.text("Tipo");

    if (!period || ordenes === null || (edificio === "" && tipo === "")) {
      return null;
    }

    return {
      key: `${periodKey(period)}|${dim(edificio)}|${dim(tipo)}`,
      value: { fecha: period.fecha, semana: period.semana, mes: period.mes, edificio, tipo, ordenes },
    };
  },
  accumulate: (target, incoming) => {
    target.ordenes += incoming.ordenes;
  },
};

const peticiones: SectionSpec<InformaticaPeticionRow> = {
  key: "peticiones",
  parse: (row) => {
    const period = readPeriod(row, { week: true });
    const total = row.count("Total");
    const origen = row.text("Origen");
    const estado = row.text("Estado");
    const entidad = row.text("Entidad");

    if (!period || total === null || (origen === "" && estado === "" && entidad === "")) {
      return null;
    }

    return {
      key: `${periodKey(period)}|${dim(origen)}|${dim(estado)}|${dim(entidad)}`,
      value: {
        fecha: period.fecha,
        semana: period.semana,
        mes: period.mes,
        origen,
        estado,
        entidad,
        total,
      },
    };
  },
  accumulate: (target, incoming) => {
    target.total += incoming.total;
  },
};

const peticionesProducto: SectionSpec<InformaticaPeticionProductoRow> = {
  key: "peticionesProducto",
  parse: (row) => {
    const period = readPeriod(row, { week: true });
    const total = row.count("Total");
    const producto = row.text("Producto");
    const estado = row.text("Estado");

    if (!period || total === null || producto === "") {
      return null;
    }

    return {
      key: `${periodKey(period)}|${dim(producto)}|${dim(estado)}`,
      value: { fecha: period.fecha, semana: period.semana, mes: period.mes, producto, estado, total },
    };
  },
  accumulate: (target, incoming) => {
    target.total += incoming.total;
  },
};

const peticionesAnual: SectionSpec<InformaticaPeticionAnualRow> = {
  key: "peticionesAnual",
  parse: (row) => {
    const mes = parseMonthCell(row.raw("Mes"));
    const peticionesTotal = row.count("Peticiones");

    if (!mes || peticionesTotal === null) {
      return null;
    }

    // `Anio` is redundant with the month label, so the label wins on conflict.
    const anio = Number(mes.slice(0, 4));

    return { key: mes, value: { anio, mes, peticiones: peticionesTotal } };
  },
  accumulate: (target, incoming) => {
    target.peticiones += incoming.peticiones;
  },
  sort: (a, b) => compareText(a.mes, b.mes),
};

const citas: SectionSpec<InformaticaCitaRow> = {
  key: "citas",
  parse: (row) => {
    const period = readPeriod(row, { week: true });
    const total = row.count("Citas");
    const edificio = row.text("Edificio");
    const tipo = row.text("Tipo");

    if (!period || total === null || (edificio === "" && tipo === "")) {
      return null;
    }

    return {
      key: `${periodKey(period)}|${dim(edificio)}|${dim(tipo)}`,
      value: { fecha: period.fecha, semana: period.semana, mes: period.mes, edificio, tipo, citas: total },
    };
  },
  accumulate: (target, incoming) => {
    target.citas += incoming.citas;
  },
};

const citasAnual: SectionSpec<InformaticaCitaAnualRow> = {
  key: "citasAnual",
  parse: (row) => {
    const mes = parseMonthCell(row.raw("Mes"));
    const total = row.count("Citas");

    if (!mes || total === null) {
      return null;
    }

    return { key: mes, value: { anio: Number(mes.slice(0, 4)), mes, citas: total } };
  },
  accumulate: (target, incoming) => {
    target.citas += incoming.citas;
  },
  sort: (a, b) => compareText(a.mes, b.mes),
};

const imacs: SectionSpec<InformaticaImacRow> = {
  key: "imacs",
  parse: (row) => {
    const period = readPeriod(row, { week: false });
    const total = row.count("Total");
    const ciudad = row.text("Ciudad");
    const metrica = row.text("Metrica");

    if (!period || total === null || (ciudad === "" && metrica === "")) {
      return null;
    }

    return {
      key: `${periodKey(period)}|${dim(ciudad)}|${dim(metrica)}`,
      value: { fecha: period.fecha, mes: period.mes, ciudad, metrica, total },
    };
  },
  accumulate: (target, incoming) => {
    target.total += incoming.total;
  },
};

const wasp: SectionSpec<InformaticaWaspRow> = {
  key: "wasp",
  parse: (row) => {
    const period = readPeriod(row, { week: true });
    const equipos = row.count("Equipos");
    const proveedor = row.text("Proveedor");
    const estado = row.text("Estado");

    if (!period || equipos === null || (proveedor === "" && estado === "")) {
      return null;
    }

    return {
      key: `${periodKey(period)}|${dim(proveedor)}|${dim(estado)}`,
      value: { fecha: period.fecha, semana: period.semana, mes: period.mes, proveedor, estado, equipos },
    };
  },
  accumulate: (target, incoming) => {
    target.equipos += incoming.equipos;
  },
};

const renove: SectionSpec<InformaticaRenoveRow> = {
  key: "renove",
  parse: (row) => {
    const period = readPeriod(row, { week: true });
    const equipos = row.count("Equipos");
    const ambito = row.text("Ambito");
    const estado = row.text("Estado");

    if (!period || equipos === null || (ambito === "" && estado === "")) {
      return null;
    }

    return {
      key: `${periodKey(period)}|${dim(ambito)}|${dim(estado)}`,
      value: { fecha: period.fecha, semana: period.semana, mes: period.mes, ambito, estado, equipos },
    };
  },
  accumulate: (target, incoming) => {
    target.equipos += incoming.equipos;
  },
};

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

/** Contract keys in the declared order, used to report every sheet. */
const SECTION_KEYS = Object.keys(INFORMATICA_SHEETS) as InformaticaSectionKey[];

export function parseInformaticaPlanoWorkbook(
  workbook: XLSX.WorkBook
): InformaticaParseResult {
  if (!workbook || !Array.isArray(workbook.SheetNames)) {
    throw new Error("El fichero enviado no es un libro de Excel válido.");
  }

  const sections = {
    edificios: parseSection(workbook, edificios),
    incidencias: parseSection(workbook, incidencias),
    encuestas: parseSection(workbook, encuestas),
    workOrders: parseSection(workbook, workOrders),
    peticiones: parseSection(workbook, peticiones),
    peticionesProducto: parseSection(workbook, peticionesProducto),
    peticionesAnual: parseSection(workbook, peticionesAnual),
    citas: parseSection(workbook, citas),
    citasAnual: parseSection(workbook, citasAnual),
    imacs: parseSection(workbook, imacs),
    wasp: parseSection(workbook, wasp),
    renove: parseSection(workbook, renove),
  } as const;

  const byNormalizedName = new Map<string, InformaticaSectionKey>(
    SECTION_KEYS.map((key) => [normalize(INFORMATICA_SHEETS[key].sheet), key])
  );

  const sheetsFound: InformaticaSectionKey[] = [];
  const unknownSheets: string[] = [];

  for (const name of workbook.SheetNames) {
    const key = byNormalizedName.get(normalize(name));

    if (key === undefined) {
      unknownSheets.push(name);
      continue;
    }

    if (!sheetsFound.includes(key)) {
      sheetsFound.push(key);
    }
  }

  const dataset: InformaticaDataset = {
    edificios: sections.edificios.rows,
    incidencias: sections.incidencias.rows,
    encuestas: sections.encuestas.rows,
    workOrders: sections.workOrders.rows,
    peticiones: sections.peticiones.rows,
    peticionesProducto: sections.peticionesProducto.rows,
    peticionesAnual: sections.peticionesAnual.rows,
    citas: sections.citas.rows,
    citasAnual: sections.citasAnual.rows,
    imacs: sections.imacs.rows,
    wasp: sections.wasp.rows,
    renove: sections.renove.rows,
    source: { sourceFile: null, uploadedAt: null },
    sheetsFound,
  };

  return {
    dataset,
    report: {
      sheets: SECTION_KEYS.map((key) => sections[key].report),
      sheetsFound,
      unknownSheets,
    },
  };
}
