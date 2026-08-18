import type {
  CoreDeckPageKind,
  DatasetSource,
  DeckPage,
  DeckState,
} from "../../deck/core.ts";

/**
 * Contract for the "AGA" deck (weekly PetMicro report).
 *
 * The source is a single workbook, the weekly "GPS" export. It carries one
 * sheet per reported week — in practice two, the previous week and the current
 * one — with an identical layout:
 *
 * - row 1: the title of the export, merged across the columns;
 * - row 2: the column headers;
 * - row 3 onwards: one row per pending request position.
 *
 * Sheet names are NOT part of the contract. The export is produced by hand and
 * the tabs get renamed every week ("Semana anterior", "S33", ...), so the
 * parser identifies a data sheet by its header row instead: any sheet whose
 * header row carries the key columns below is read.
 *
 * The GPS only ever carries two weeks, but the report charts around ten, so the
 * dataset is a running history: every upload merges the weeks it finds into the
 * stored ones, replacing a week that was already there and appending the rest.
 * Only aggregates are stored — never the raw rows, which name individuals.
 */

/* -------------------------------------------------------------------------- */
/* Sheet contract                                                              */
/* -------------------------------------------------------------------------- */

/** Header labels of the GPS export, in the order the columns appear (A–M). */
export const AGA_COLUMNS = [
  "Nº Petición de sistemas",
  "Nº Posición de petición",
  "Paso del circuito",
  "Producto",
  "Departamento",
  "Fecha liberación",
  "Fecha asignación",
  "Interviniente",
  "Descripción del proyecto",
  "Fecha gestión",
  "Proyecto",
  "Paso Desestimado",
  "semana",
] as const;

/**
 * Columns a sheet must carry to be recognised as a GPS data sheet.
 *
 * Deliberately the minimum set the aggregates need: the export sometimes ships
 * with an extra column or with one of the optional date columns removed, and
 * neither of those makes the sheet unreadable.
 */
export const AGA_REQUIRED_COLUMNS = [
  "Nº Petición de sistemas",
  "Departamento",
  "semana",
] as const;

/** Row index (0-based) of the header row inside a GPS sheet. */
export const AGA_HEADER_ROW = 1;

/* -------------------------------------------------------------------------- */
/* Aggregates                                                                  */
/* -------------------------------------------------------------------------- */

/** One bar of a breakdown: a presentation label and its row count. */
export interface AgaCount {
  label: string;
  count: number;
}

/**
 * Everything the report needs about one week, and nothing else.
 *
 * The raw rows are dropped at import: they carry the assignee name and the
 * project description, which the deck never shows and which there is no reason
 * to persist.
 */
export interface AgaWeekAggregate {
  /** Reported week, `YYYY-MM-DD` of the `semana` column. Identity of the week. */
  week: string;
  /** Rows of the sheet, i.e. positions pending across every department. */
  total: number;
  /** Departments after presentation grouping, descending by count. */
  byDepartment: AgaCount[];
  /** Departments exactly as written in the export, descending by count. */
  byDepartmentRaw: AgaCount[];
  /** Projects after grouping and renaming, descending by count. Rows with no project are excluded. */
  byProject: AgaCount[];
}

/* -------------------------------------------------------------------------- */
/* Dataset                                                                     */
/* -------------------------------------------------------------------------- */

export interface AgaDataset {
  /** Every week ever imported, ascending by date. */
  weeks: AgaWeekAggregate[];
  source: DatasetSource;
  /** Names of the sheets the last upload read, in workbook order. */
  sheetsFound?: string[];
}

/** Section keys a page can depend on. The GPS only feeds one. */
export type AgaSectionKey = "weeks";

/* -------------------------------------------------------------------------- */
/* Deck                                                                        */
/* -------------------------------------------------------------------------- */

/** Page kinds of the AGA deck. Prefixed `aga` so they never collide with AV or Informática. */
export type AgaPageKind =
  | CoreDeckPageKind
  | "agaTotalWeekly"
  | "agaDeptEvolution"
  | "agaDeptCompare"
  | "agaProjectCompare";

/** Series a page reports on. AGA pages are not typed by series. */
export type AgaSeries = string;

export type AgaDeckPage = DeckPage<AgaPageKind, AgaSeries>;
export type AgaDeckState = DeckState<AgaPageKind, AgaSeries>;

export interface AgaPayload {
  deck: AgaDeckState;
  data: AgaDataset;
}
