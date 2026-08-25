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
  /** AGA reporting week. Optional so datasets stored before this field remain valid. */
  reportWeek?: number;
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

/* -------------------------------------------------------------------------- */
/* Managed positions (section 2)                                               */
/* -------------------------------------------------------------------------- */

/**
 * One breakdown row across the weeks it was reported on.
 *
 * Deliberately a series and not a pair of numbers: the presented charts only
 * compare two weeks, but the future source (the ZPT025 / Office raw exports)
 * carries every week, and a `{previous, current}` shape would have to be
 * rewritten the day the third week arrives. A row simply carries the weeks it
 * has; a chart that shows two takes the last two.
 *
 * `week` is the same key as `AgaWeekAggregate.week`: the `YYYY-MM-DD` of the
 * Monday, so a row joins the section 1 history without a translation table.
 */
export interface AgaWeekCount {
  week: string;
  count: number;
}

export interface AgaBreakdownRow {
  label: string;
  counts: AgaWeekCount[];
}

/** Breakdown of one department by product (slides 2.5 to 2.7). */
export interface AgaDepartmentBreakdown {
  /** Department label, as the deck writes it ("GAM", "Plataforma Portátiles", "Almacén"). */
  department: string;
  rows: AgaBreakdownRow[];
}

/**
 * Positions closed in the week, as opposed to the ones still in management that
 * `weeks` carries.
 *
 * Not derivable from the GPS: it is a different export, so it lives in its own
 * optional section and a deck whose dataset predates it simply shows the pages
 * as pending.
 */
export interface AgaManagedSection {
  /** Total closed per week, ascending by date. */
  weeklyTotals: { week: string; total: number }[];
  byDepartment: AgaBreakdownRow[];
  byProduct: AgaBreakdownRow[];
  byLocation: AgaBreakdownRow[];
  /** Full located-position total when the source exposes it, independently of chart truncation. */
  locationTotals?: { week: string; total: number }[];
  /** Product detail of the departments the deck breaks out, in deck order. */
  byDepartmentProduct: AgaDepartmentBreakdown[];
  source?: DatasetSource;
}

/* -------------------------------------------------------------------------- */
/* Office (2.8) and annual evolution (section 3)                               */
/* -------------------------------------------------------------------------- */

/**
 * Monthly Office series.
 *
 * `values` is aligned with `months` and carries `null`, not `0`, for a month a
 * family was not reported on: the chart must leave a gap there rather than draw
 * a zero, which reads as "none requested" instead of "not measured".
 */
export interface AgaOfficeSection {
  /** Reported months, `YYYY-MM`, ascending. */
  months: string[];
  families: { label: string; values: (number | null)[] }[];
  source?: DatasetSource;
}

/** One year of a twelve-month series. `values` always has twelve entries. */
export interface AgaYearSeries {
  year: number;
  /** January to December. `null` for a month with no data yet. */
  values: (number | null)[];
}

export interface AgaAnnualSection {
  peticiones: AgaYearSeries[];
  posiciones: AgaYearSeries[];
  source?: DatasetSource;
}

/* -------------------------------------------------------------------------- */
/* Dataset                                                                     */
/* -------------------------------------------------------------------------- */

export interface AgaDataset {
  /** Every week ever imported, ascending by date. */
  weeks: AgaWeekAggregate[];
  /** Section 2. Absent until the managed-positions import has run. */
  managed?: AgaManagedSection;
  /** Slide 2.8. Absent until the Office import has run. */
  office?: AgaOfficeSection;
  /** Section 3. Absent until the annual import has run. */
  annual?: AgaAnnualSection;
  /**
   * Last plain-text import from the AGA Drive spreadsheet.
   *
   * Separate from `source` because that one names whatever upload touched the
   * dataset last, and the sidebar has to be able to say when the text slot
   * itself was last fed.
   */
  texto?: DatasetSource;
  source: DatasetSource;
  /** Names of the sheets the last upload read, in workbook order. */
  sheetsFound?: string[];
}

/**
 * Section keys a page can depend on.
 *
 * `weeks` is the GPS upload; the other three come from imports the module does
 * not read yet, which is why every page declares what it needs instead of
 * assuming a dataset is complete.
 */
export type AgaSectionKey = "weeks" | "managed" | "office" | "annual";

/* -------------------------------------------------------------------------- */
/* Deck                                                                        */
/* -------------------------------------------------------------------------- */

/** Page kinds of the AGA deck. Prefixed `aga` so they never collide with AV or Informática. */
export type AgaPageKind =
  | CoreDeckPageKind
  | "agaTotalWeekly"
  | "agaDeptEvolution"
  | "agaDeptCompare"
  | "agaProjectCompare"
  | "agaGestTotal"
  | "agaGestDept"
  | "agaGestProduct"
  | "agaGestLocation"
  | "agaGestGam"
  | "agaGestPortatiles"
  | "agaGestAlmacen"
  | "agaGestOffice"
  | "agaAnualPeticiones"
  | "agaAnualPosiciones";

/** Series a page reports on. AGA pages are not typed by series. */
export type AgaSeries = string;

export type AgaDeckPage = DeckPage<AgaPageKind, AgaSeries>;
export type AgaDeckState = DeckState<AgaPageKind, AgaSeries>;

export interface AgaPayload {
  deck: AgaDeckState;
  data: AgaDataset;
}
