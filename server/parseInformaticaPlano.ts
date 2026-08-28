import * as XLSX from "xlsx";
import {
  INFORMATICA_SHEETS,
  type InformaticaCitaAnualRow,
  type InformaticaCitaRow,
  type InformaticaDataset,
  type InformaticaEdificioRow,
  type InformaticaComparativaRow,
  type InformaticaEncuestaRow,
  type InformaticaHicRow,
  type InformaticaImacRow,
  type InformaticaIncidenciaRow,
  type InformaticaPeticionAnualRow,
  type InformaticaPeticionProductoRow,
  type InformaticaPeticionRow,
  type InformaticaRenoveRow,
  type InformaticaSectionKey,
  type InformaticaSlaRow,
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
  /**
   * Original names of the uploaded files, in upload order. The parser works on
   * a single (possibly merged) workbook and cannot know them, so the route
   * fills this in; a client that only ever sends one file can ignore it.
   */
  files?: string[];
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

/**
 * `Hic`: monthly volumetry. Month only, no `Fecha` and no week.
 *
 * `Categoria` is optional: the total series report no category and the pivot
 * reports one per `Categorization Tier 1`. Both live in the same sheet and are
 * told apart by `Metrica`, so a consumer that wants the totals filters
 * `categoria === ""` instead of reading a second sheet.
 */
const hic: SectionSpec<InformaticaHicRow> = {
  key: "hic",
  parse: (row) => {
    const mes = parseMonthCell(row.raw("Mes"));
    const total = row.count("Total");
    const ambito = row.text("Ambito");
    const metrica = row.text("Metrica");
    const categoria = row.text("Categoria");

    if (!mes || total === null || metrica === "") {
      return null;
    }

    return {
      key: `${mes}|${dim(ambito)}|${dim(categoria)}|${dim(metrica)}`,
      value: { ambito, mes, categoria, metrica, total },
    };
  },
  accumulate: (target, incoming) => {
    target.total += incoming.total;
  },
  sort: (a, b) =>
    a.mes.localeCompare(b.mes) ||
    compareText(a.ambito, b.ambito) ||
    compareText(a.metrica, b.metrica) ||
    compareText(a.categoria, b.categoria),
};

/** `Comparativas`: incidents by component and month, one row per month. */
const comparativas: SectionSpec<InformaticaComparativaRow> = {
  key: "comparativas",
  parse: (row) => {
    const mes = parseMonthCell(row.raw("Mes"));
    const total = row.count("Total");
    const vista = row.text("Vista");
    const elemento = row.text("Elemento");

    if (!mes || total === null || elemento === "") {
      return null;
    }

    return {
      key: `${mes}|${dim(vista)}|${dim(elemento)}`,
      value: { vista, elemento, mes, total },
    };
  },
  accumulate: (target, incoming) => {
    target.total += incoming.total;
  },
  sort: (a, b) =>
    a.mes.localeCompare(b.mes) ||
    compareText(a.vista, b.vista) ||
    b.total - a.total ||
    compareText(a.elemento, b.elemento),
};

/**
 * `Slas`: compliance per service level and month.
 *
 * Unlike every other sheet the measure is not a count of rows, so repeated rows
 * do not accumulate: the last row for a service level in a month wins. Adding
 * two "127 of 130" together would report 254 of 260, which is not a thing.
 */
const slas: SectionSpec<InformaticaSlaRow> = {
  key: "slas",
  parse: (row) => {
    const mes = parseMonthCell(row.raw("Mes"));
    const svt = row.text("SVT");
    const cumplido = row.count("Cumplido");
    const incumplido = row.count("Incumplido");
    const total = row.count("Total");

    if (!mes || svt === "" || cumplido === null || incumplido === null) {
      return null;
    }

    return {
      key: `${mes}|${dim(svt)}`,
      value: { mes, svt, cumplido, incumplido, total: total ?? cumplido + incumplido },
    };
  },
  accumulate: (target, incoming) => {
    target.cumplido = incoming.cumplido;
    target.incumplido = incoming.incumplido;
    target.total = incoming.total;
  },
  sort: (a, b) => a.mes.localeCompare(b.mes) || compareText(a.svt, b.svt),
};

/* -------------------------------------------------------------------------- */
/* Workbook merging                                                            */
/* -------------------------------------------------------------------------- */

/** A sheet under construction while several workbooks are folded together. */
interface MergedSheet {
  /** Display name of the first workbook that carried this sheet. */
  name: string;
  /** Normalised column name to its position in the merged header. */
  columns: Map<string, number>;
  /** Header labels in merged order, as written by the first file to bring them. */
  header: unknown[];
  rows: unknown[][];
}

/** Provenance needed to resolve overlapping sources inside one upload batch. */
export type InformaticaWorkbookOrigin =
  | "template"
  | "citas"
  | "workorders"
  | "other";

export interface InformaticaUploadWorkbook {
  workbook: XLSX.WorkBook;
  origin: InformaticaWorkbookOrigin;
}

/** Whether a converted workbook carries one sheet of the flat contract. */
function hasFlatSection(workbook: XLSX.WorkBook, section: InformaticaSectionKey): boolean {
  const expected = normalize(INFORMATICA_SHEETS[section].sheet);
  return workbook.SheetNames.some((name) => normalize(name) === expected);
}

/**
 * Removes standalone CSV data already supplied by the weekly template.
 *
 * The weekly template embeds the same raw Citas and Work Orders tables that
 * are also delivered as standalone CSV exports. Both converters produce the
 * same flat sections, so appending both workbooks would double every count.
 * The template owns a section only when its converted workbook actually
 * carries that sheet; a partial template can therefore still be complemented
 * by the corresponding CSV.
 */
export function selectInformaticaWorkbooksForMerge(
  uploads: InformaticaUploadWorkbook[]
): XLSX.WorkBook[] {
  const templates = uploads.filter((upload) => upload.origin === "template");
  const templateHasCitas = templates.some(({ workbook }) =>
    hasFlatSection(workbook, "citas")
  );
  const templateHasWorkOrders = templates.some(({ workbook }) =>
    hasFlatSection(workbook, "workOrders")
  );

  return uploads
    .filter(({ origin }) => {
      if (origin === "citas" && templateHasCitas) {
        return false;
      }

      if (origin === "workorders" && templateHasWorkOrders) {
        return false;
      }

      return true;
    })
    .map(({ workbook }) => workbook);
}

/** Excel forbids these characters in a sheet name, and caps it at 31 chars. */
function safeSheetName(name: string): string {
  const cleaned = name.replace(/[\\/?*[\]:]/g, " ").replace(/\s+/g, " ").trim();
  return (cleaned === "" ? "Hoja" : cleaned).slice(0, 31);
}

/**
 * Folds several uploaded workbooks into one, sheet by sheet.
 *
 * Colleagues send one file per building or per kind of data, so the import has
 * to be additive: a sheet only one file carries is kept as it is, and a sheet
 * two files carry keeps the rows of both. Merging before parsing rather than
 * merging parsed datasets is deliberate: the accumulation of repeated rows,
 * the normalisation of headers and the discarding of invalid rows already live
 * in `parseSection`, and this way they apply across files for free.
 *
 * Sheet names and column names are matched with the same normalisation the
 * parser uses, so `Citas` from one file and `citas` from another are the same
 * sheet, and a column the second file omits simply stays empty in its rows.
 */
export function mergeInformaticaWorkbooks(workbooks: XLSX.WorkBook[]): XLSX.WorkBook {
  const usable = workbooks.filter(
    (workbook) => workbook && Array.isArray(workbook.SheetNames)
  );

  // Nothing to fold: the single file is already the merged workbook.
  if (usable.length === 1) {
    return usable[0];
  }

  const merged = new Map<string, MergedSheet>();

  for (const workbook of usable) {
    for (const name of workbook.SheetNames) {
      const sheet = workbook.Sheets[name];

      if (!sheet) {
        continue;
      }

      const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        defval: null,
        blankrows: false,
      });

      if (grid.length === 0) {
        continue;
      }

      const key = normalize(name);
      let target = merged.get(key);

      if (!target) {
        target = { name, columns: new Map(), header: [], rows: [] };
        merged.set(key, target);
      }

      // Source column index to merged column index. -1 drops unnamed columns.
      const positions: number[] = [];

      ((grid[0] ?? []) as unknown[]).forEach((cell, index) => {
        const column = normalize(cell);

        if (column === "") {
          positions[index] = -1;
          return;
        }

        let position = target.columns.get(column);

        if (position === undefined) {
          position = target.header.length;
          target.columns.set(column, position);
          target.header.push(cell);
        }

        positions[index] = position;
      });

      for (const cells of grid.slice(1)) {
        const source = (cells ?? []) as unknown[];

        if (source.every((cell) => cell === null || cell === undefined || String(cell).trim() === "")) {
          continue;
        }

        const row: unknown[] = [];

        source.forEach((value, index) => {
          const position = positions[index];

          if (position !== undefined && position >= 0) {
            row[position] = value;
          }
        });

        target.rows.push(row);
      }
    }
  }

  const output = XLSX.utils.book_new();
  const usedNames = new Set<string>();

  for (const sheet of Array.from(merged.values())) {
    let name = safeSheetName(sheet.name);

    // Truncation can make two distinct sheets collide on the same name.
    for (let suffix = 2; usedNames.has(normalize(name)); suffix += 1) {
      name = `${safeSheetName(sheet.name).slice(0, 28)}(${suffix})`;
    }

    usedNames.add(normalize(name));
    XLSX.utils.book_append_sheet(output, XLSX.utils.aoa_to_sheet([sheet.header, ...sheet.rows]), name);
  }

  return output;
}

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
    hic: parseSection(workbook, hic),
    comparativas: parseSection(workbook, comparativas),
    slas: parseSection(workbook, slas),
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
    hic: sections.hic.rows,
    comparativas: sections.comparativas.rows,
    slas: sections.slas.rows,
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

/* -------------------------------------------------------------------------- */
/* Dataset merging                                                             */
/* -------------------------------------------------------------------------- */

/** `2026/08#09`: the sort at the end of `mergeSectionRows` compares text. */
function weekKey(mes: string, semana: number): string {
  return mes + "#" + String(semana).padStart(2, "0");
}

/**
 * How the ownership key of a section is read, or `null` when it has none.
 *
 * Most sections arrive complete every week — the template ships the whole
 * history of work orders and appointments — so the month is the right grain:
 * re-sending them rewrites the months they carry.
 *
 * `peticiones` and `peticionesProducto` are the exception. They come from the
 * backlog, released and managed exports, which are a snapshot of **one** week.
 * Keying them by month made an upload own weeks it never mentioned, so week 35
 * erased weeks 32 to 34. They are keyed by week instead, zero-padded so the
 * final sort orders week 9 before week 10.
 *
 * `edificios` is a dimension table, not a series: it has no period, so an
 * upload that carries it replaces it whole.
 */
const SECTION_MONTH: Record<InformaticaSectionKey, ((row: never) => string) | null> = {
  edificios: null,
  incidencias: (row: InformaticaIncidenciaRow) => row.mes,
  encuestas: (row: InformaticaEncuestaRow) => row.mes,
  workOrders: (row: InformaticaWorkOrderRow) => row.mes,
  peticiones: (row: InformaticaPeticionRow) => weekKey(row.mes, row.semana),
  peticionesProducto: (row: InformaticaPeticionProductoRow) => weekKey(row.mes, row.semana),
  peticionesAnual: (row: InformaticaPeticionAnualRow) => row.mes,
  citas: (row: InformaticaCitaRow) => row.mes,
  citasAnual: (row: InformaticaCitaAnualRow) => row.mes,
  imacs: (row: InformaticaImacRow) => row.mes,
  wasp: (row: InformaticaWaspRow) => row.mes,
  renove: (row: InformaticaRenoveRow) => row.mes,
  hic: (row: InformaticaHicRow) => row.mes,
  comparativas: (row: InformaticaComparativaRow) => row.mes,
  slas: (row: InformaticaSlaRow) => row.mes,
} as Record<InformaticaSectionKey, ((row: never) => string) | null>;

/**
 * Folds one section of an upload into the section already stored.
 *
 * The rule is "the periods the upload talks about are the periods it owns":
 * every key present in `incoming` is rebuilt from `incoming`, and every key it
 * does not mention survives untouched. The grain of that key is whatever
 * `SECTION_MONTH` declares for the section — the month for most of them, the
 * week for `peticiones`. One rule covers both behaviours the
 * weekly flow needs. The raw sheets of the template arrive complete each week,
 * so re-sending them rewrites the months they carry and adds the new one, which
 * makes a repeated upload idempotent instead of doubling every count. The
 * three-month windows (`comparativas`, `slas`, `hic`) overwrite the months they
 * overlap and leave the older history in place.
 */
function mergeSectionRows<T>(
  existing: T[] | undefined,
  incoming: T[] | undefined,
  monthOf: ((row: T) => string) | null
): T[] | undefined {
  if (!incoming || incoming.length === 0) {
    return existing;
  }

  if (!monthOf || !existing || existing.length === 0) {
    return incoming;
  }

  const owned = new Set(incoming.map(monthOf));
  const kept = existing.filter((row) => !owned.has(monthOf(row)));

  return [...kept, ...incoming].sort((a, b) => monthOf(a).localeCompare(monthOf(b)));
}

/**
 * The stored dataset with an upload folded in, section by section.
 *
 * **This changes the semantics of the Informatica upload.** It used to replace
 * the stored dataset outright, so a week that only sent the request exports
 * erased the appointments of the week before and every page but two went back
 * to "Próximamente". It now accumulates like the AGA and Oficinas modules: a
 * section nobody re-sent is preserved as it is, and a section that is re-sent
 * only rewrites its own months. The consequence to know is that a sheet can no
 * longer be emptied by omitting it from an upload; clearing history is a
 * separate, explicit operation.
 */
export function mergeInformaticaDataset(
  existing: InformaticaDataset | null,
  incoming: InformaticaDataset,
  source: InformaticaDataset["source"]
): InformaticaDataset {
  const merged: InformaticaDataset = { ...(existing ?? {}), ...{ source } };

  for (const key of SECTION_KEYS) {
    const monthOf = SECTION_MONTH[key] as ((row: unknown) => string) | null;
    const rows = mergeSectionRows(
      existing?.[key] as unknown[] | undefined,
      incoming[key] as unknown[] | undefined,
      monthOf
    );

    if (rows && rows.length > 0) {
      (merged as unknown as Record<string, unknown>)[key] = rows;
    } else {
      delete (merged as unknown as Record<string, unknown>)[key];
    }
  }

  // `sheetsFound` describes the dataset, not the last file: after a merge it is
  // every section that ends up carrying rows, or the deck would send a page
  // back to "Próximamente" for data it still holds.
  merged.sheetsFound = SECTION_KEYS.filter((key) => {
    const rows = merged[key];
    return Array.isArray(rows) && rows.length > 0;
  });

  return merged;
}
