import type {
  CoreDeckPageKind,
  DatasetSource,
  DeckPage,
  DeckState,
} from "../../deck/core.ts";

/**
 * Contract for the "Oficinas" deck (weekly Soporte Oficinas report).
 *
 * The source is a single workbook, the "Template oficinas envío email
 * presentación.xlsx" the Soporte Oficinas team exports every week. It carries
 * 26 already-pivoted sheets and one raw listing, with no formulas: the team
 * refreshes the pivots and sends the values.
 *
 * Sheet names are truncated to Excel's 31 characters and their tails get
 * reworded ("2-Listado asignadas (criterio M"), so a pivot is identified by the
 * numeric prefix `N-` of its name and never by its full text.
 *
 * The raw listing is the exception, and it is why the prefix cannot be the only
 * rule: it ships as "1-Peticiones IMAC Año En Curso ", which repeats the prefix
 * of "1-Asignadas por semanas (año en". Excel allows the duplicate and the team
 * numbers its tabs by section, not by uniqueness. See `OFICINAS_IMAC_COLUMNS`.
 *
 * The matrices are WIDE and grow one column per week, so the header row is read
 * dynamically. Every matrix shares one layout:
 *
 *   row 0: `[..., "Semana", 1, 2, 3, ..., "Total"]`
 *   row 1: `[<dimension name>, "", 1, 2, 3, ..., "Total"]`
 *   row 2+: `[<label>, "", v1, v2, ...,  <row total>]`
 *
 * The number of label columns is whatever precedes the `"Semana"` marker of row
 * 0: one for the DT matrices, two for the Componente/Elemento ones.
 *
 * Like AGA, the dataset is a running history: each upload folds its `(year,
 * week)` cells into the stored ones instead of replacing the dataset, so a
 * correction re-uploaded later overwrites exactly the weeks it carries.
 */

/* -------------------------------------------------------------------------- */
/* Sheet contract                                                              */
/* -------------------------------------------------------------------------- */

/**
 * What each numeric sheet prefix carries.
 *
 * Declared here rather than in the parser so the contract is readable next to
 * the types it produces, and so a renamed tail never changes the mapping.
 */
export const OFICINAS_SHEET_ROLES: Record<number, string> = {
  1: "Asignadas: total por semana",
  2: "Asignadas por DT, con validadoras",
  3: "Asignadas por DT, sin validadoras",
  4: "Asignadas por DT, solo validadoras",
  5: "Asignadas por componente y elemento",
  6: "Resueltas: total por semana",
  7: "Resueltas por DT, con validadoras",
  8: "Resueltas por DT, sin validadoras",
  9: "Resueltas por DT, solo validadoras",
  10: "Resueltas por componente y elemento",
  11: "Peticiones: total por semana",
  12: "Peticiones por DT, año en curso",
  13: "Peticiones por DT, año anterior",
  14: "Peticiones por tipo (Categorization Tier 3)",
  15: "Recicladores por DT, año en curso",
  16: "Recicladores por DT, año anterior",
  17: "Recicladores por elemento (Categorization Tier 2)",
  18: "Encuestas de peticiones por mes",
  19: "Encuestas por mes, detalle de valoraciones",
  20: "Distribución de la valoración global",
  21: "Distribución de la valoración de apertura",
  22: "Distribución de la valoración de resolución",
  23: "Incidencias por mes: resueltas, asignadas y asignaciones",
  24: "Recicladores por mes: abiertas y resueltas",
  25: "Incidencias por mes y territorial",
  26: "Peticiones IMAC por mes: peticiones, realizadas y pendientes",
};

/** Contract key of a sheet the workbook identifies by its columns, not by its prefix. */
export type OficinasNamedSheet = "peticionesImac";

export const OFICINAS_NAMED_SHEET_ROLES: Record<OficinasNamedSheet, string> = {
  peticionesImac: "Peticiones IMAC del año en curso, listado sin pivotar",
};

/**
 * Header columns that identify the IMAC request listing.
 *
 * It is the one sheet found by its columns instead of by its prefix, because
 * its prefix is not its own: the tab ships as "1-Peticiones IMAC Año En Curso "
 * next to "1-Asignadas por semanas (año en". Under the prefix rule alone
 * whichever of the two came second was dropped without a word, and which one
 * that is depends on the tab order of the export.
 *
 * Matching on columns rather than on the name also survives the tail rewording
 * the team does every few weeks — the same reason the pivots are keyed by
 * prefix and not by full text. No pivot can collide with it: their row 0 is the
 * week header (`["", "Semana", 1, 2, ...]`), which carries none of these names.
 */
export const OFICINAS_IMAC_COLUMNS = ["Peticion", "Tipo_Peticion", "Status"] as const;

/* -------------------------------------------------------------------------- */
/* Territorial directorates                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The seven territorial directorates, in the canonical form the deck writes.
 *
 * The two sources disagree on the spelling — the weekly template writes
 * "D.T. CATALUÑA" and the office master "D.T. CATALUNYA" — so every label is
 * normalised into this list before it is stored. Without that, the same
 * directorate would be two rows and the ratio against the office count would
 * silently divide by zero.
 */
export const OFICINAS_DT_LABELS = [
  "D.T. CANARIAS",
  "D.T. CATALUÑA",
  "D.T. CENTRO",
  "D.T. ESTE",
  "D.T. NOROESTE",
  "D.T. NORTE",
  "D.T. SUR",
] as const;

/**
 * Bucket for the rows with no directorate.
 *
 * The pivots ship them as an empty label or as "(en blanco)", which renders as
 * a nameless bar. They are real incidents, so they are labelled instead of
 * dropped.
 */
export const OFICINAS_DT_OTHERS = "OTROS";

/**
 * Canonical form of a directorate label, or `OTROS` for the blank bucket.
 *
 * Matching is accent- and punctuation-insensitive on purpose: the sources vary
 * between "D.T. ", "DT." and "DT ", and between "CATALUÑA" and "CATALUNYA".
 */
function dtKey(raw: string): string {
  return raw
    .normalize("NFD")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .replace(/^DT/, "")
    .replace(/^CATALUNYA$/, "CATALUNA");
}

export function normalizeDT(raw: unknown): string {
  const text = String(raw ?? "").replace(/\(en blanco\)/i, "").trim();

  if (text === "") {
    return OFICINAS_DT_OTHERS;
  }

  const key = dtKey(text);

  if (key === "") {
    return OFICINAS_DT_OTHERS;
  }

  const canonical = OFICINAS_DT_LABELS.find((label) => dtKey(label) === key);

  return canonical ?? text.replace(/\s+/g, " ");
}

/* -------------------------------------------------------------------------- */
/* Spelling variants                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Join key for two labels that are the same word written differently.
 *
 * The pivots are refreshed by hand from a ticketing tool that does not constrain
 * the text, so the same element arrives as "Escaner" and "ESCANER", the same
 * component as "PERIFERICOS", "Periférico" and "Periféricos". Left alone they
 * are separate rows and the chart splits one bar in three.
 *
 * The key is purely orthographic — case, accents, punctuation and a trailing
 * plural "s" — and deliberately nothing else. There is no hand-written list of
 * canonical elements here: a table mapping "IMPRESORA" to "Impresora térmica"
 * would be a business decision hidden inside a parser, and it would silently
 * merge two things the source considers different. Anything that is not the same
 * word spelled differently stays a separate row.
 *
 * The plural rule only strips the final "s" of words longer than three letters,
 * so "ATASCO"/"ATASCOS" join while short tokens are left alone.
 */
export function spellingKey(raw: unknown): string {
  return String(raw ?? "")
    .normalize("NFD")
    // Combining marks are DELETED, not turned into a separator: decomposing
    // "Periférico" leaves an accent between "PERIFE" and "RICO", and replacing
    // it with a space would split one word into two and never match
    // "PERIFERICOS".
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    // Punctuation, on the other hand, becomes a separator, so "INGRESOS /
    // DISPENSAS" and "INGRESOS/DISPENSAS" produce the same key.
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((word) => word !== "")
    .map((word) => (word.length > 3 && word.endsWith("S") ? word.slice(0, -1) : word))
    .join(" ");
}

/** One spelling of a label and how often the source file writes it. */
export interface SpellingVariant {
  label: string;
  count: number;
  /** Row index of the first appearance, used only to break a tie. */
  order: number;
}

/**
 * The spelling to publish among the variants of one label.
 *
 * Most frequent wins, because the odd one-off typo should not rename a row that
 * the source writes consistently. A tie is broken towards the spelling that is
 * not shouted in full caps — the pivots inherit upper case from the ticketing
 * export and the deck reads better in the mixed-case form the team types by
 * hand — and finally towards the first appearance, so the result does not depend
 * on map ordering.
 */
export function pickSpelling(variants: SpellingVariant[]): string {
  const best = [...variants].sort((a, b) => {
    if (a.count !== b.count) {
      return b.count - a.count;
    }

    const aShouted = a.label === a.label.toUpperCase();
    const bShouted = b.label === b.label.toUpperCase();

    if (aShouted !== bShouted) {
      return aShouted ? 1 : -1;
    }

    return a.order - b.order;
  })[0];

  return best?.label ?? "";
}

/* -------------------------------------------------------------------------- */
/* Weekly values                                                               */
/* -------------------------------------------------------------------------- */

/**
 * One cell of a weekly series.
 *
 * The year is carried per value, not per dataset, because the same section
 * mixes the current year with the previous one (the year-on-year comparison
 * sheets) and because the history accumulates across new years without a
 * migration.
 */
export interface OficinasWeekValue {
  year: number;
  /** ISO week, 1-52. */
  week: number;
  value: number;
}

/** One labelled row of a weekly matrix. */
export interface OficinasRow {
  label: string;
  values: OficinasWeekValue[];
}

/** A row of the Componente / Elemento matrices. */
export interface OficinasElementRow extends OficinasRow {
  /** Component the element hangs from. Filled down: the pivot only writes it once per group. */
  componente: string;
  /** Element name. Same as `label`, kept explicit so the two dimensions read apart. */
  elemento: string;
}

/** Which incidents the DT matrix counts. The template ships the three variants. */
export type OficinasValidadoras = "con" | "sin" | "solo";

/** One of the three DT matrices of an incident section. */
export interface OficinasDTMatrix {
  variant: OficinasValidadoras;
  rows: OficinasRow[];
}

/**
 * A weekly series of past years together with the validator scope it measures.
 *
 * The weekly template only ever ships the current year, so every year before it
 * comes from the manual historico workbook ("DATOS Weekly historico_oficinas
 * _Recicladores.xlsx"), seeded by `scripts/importar-historico-oficinas.mjs`.
 *
 * The variant is carried explicitly because that workbook does not declare it
 * and it is not the one the total sheet counts: its weekly columns reproduce
 * the "sin validadoras" matrix of the template exactly — twenty of the
 * thirty-four verified weeks of assigned incidents match to the unit, and none
 * matches the "con validadoras" total. Storing those years untagged inside
 * `totalsByWeek` is what made the chart compare a "con" current year against a
 * "sin" past one.
 */
export interface OficinasHistorySeries {
  variant: OficinasValidadoras;
  values: OficinasWeekValue[];
}

/**
 * Assigned or resolved incidents: the same three sheets in both cases.
 *
 * `totalsByWeek` comes from the dedicated total sheet (1 and 6), not from the
 * sum of a matrix: the pivots are refreshed by hand and the two disagree by a
 * few rows on some weeks. The published series is the total sheet, which counts
 * the validators — it reproduces the "con validadoras" matrix week by week.
 *
 * `history` carries the past years, each tagged with the scope it was measured
 * at, and is never written by an upload: the template has no past year to fold.
 */
export interface OficinasIncidencias {
  totalsByWeek: OficinasWeekValue[];
  byDT: OficinasDTMatrix[];
  byElement: OficinasElementRow[];
  history?: OficinasHistorySeries[];
}

/**
 * Requests.
 *
 * `byTipo` comes from a sheet whose cells are strings like `"49 (39%)"`. Only
 * the count is stored: the percentage is a share of the week total, and a
 * stored percentage drifts from the chart the first time a figure is corrected.
 * It is recomputed in `derived.ts` instead.
 */
export interface OficinasPeticiones {
  totalsByWeek: OficinasWeekValue[];
  byDT: OficinasRow[];
  /** Same matrix for the previous year (sheet 13), stored with `year - 1`. */
  byDTPrevious: OficinasRow[];
  byTipo: OficinasRow[];
  /**
   * Previous-year type breakdown seeded from the manual historic workbook.
   *
   * It contains only categories that source actually reported. A missing row
   * means "not reported", never zero.
   */
  byTipoPrevious?: OficinasRow[];
}

/**
 * Recyclers.
 *
 * `byDTPrevious` comes from sheet 16, whose week header jumps from 1 to 21 and
 * then runs to 52. The weeks are stored exactly as the header writes them, with
 * no attempt to reconstruct the missing 2-20: the gap is in the source and
 * inventing zeros there would draw a year that was never measured.
 */
export interface OficinasRecicladores {
  byDT: OficinasRow[];
  byDTPrevious: OficinasRow[];
  byElemento: OficinasRow[];
}

/* -------------------------------------------------------------------------- */
/* IMAC requests                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The IMAC request listing, aggregated by week.
 *
 * The only source of the workbook that is not already pivoted: 2.559 rows of
 * one request each. It is folded here at import and never stored raw — the
 * dataset lives in a single JSON column, and keeping the listing would multiply
 * its size for figures no page reads row by row.
 *
 * Weeks come from `Fecha_Cierre`, not from `Fecha_Solicitud`. That is not a
 * preference, it is what reconciles: against sheet 11, the template's own
 * weekly request total, closing dates match to the digit on 34 of 35 weeks and
 * request dates on 5. The one week that differs is the first, where the
 * template counts requests closed in January that were opened in 2025 and this
 * listing, which only carries the current year, cannot see them.
 *
 * The status filter is implicit and comes free with that choice: the 58
 * rejected and cancelled rows carry `//` as their closing date, so they never
 * land in a week. Nothing is dropped by name.
 */
export interface OficinasImac {
  /** Requests closed per week. */
  peticionesByWeek: OficinasWeekValue[];
  /**
   * Units delivered per week, summed over `Cantidad_1` to `Cantidad_5`.
   *
   * This is the "work done" of the request: one request can carry five
   * products, so a week of ten requests is not a week of ten interventions.
   */
  intervencionesByWeek: OficinasWeekValue[];
  /** Requests closed per week, split by `Tipo_Peticion`. */
  byTipo: OficinasRow[];
}

/* -------------------------------------------------------------------------- */
/* Monthly totals                                                              */
/* -------------------------------------------------------------------------- */

/** One cell of a monthly series, keyed `YYYY-MM`. */
export interface OficinasMonthValue {
  month: string;
  value: number;
}

/** One labelled row of a monthly matrix, used by the territorial closures. */
export interface OficinasMonthRow {
  label: string;
  values: OficinasMonthValue[];
}

/** Sheet 23: monthly incidents of the branch network. */
export interface OficinasIncidenciasMensual {
  month: string;
  resueltas: number;
  asignadas: number;
  asignaciones: number;
}

/** Sheet 24: monthly recycler openings versus closures. */
export interface OficinasRecicladoresMensual {
  month: string;
  abiertas: number;
  resueltas: number;
}

/** Sheet 26: monthly IMAC request flow. */
export interface OficinasPeticionesMensual {
  month: string;
  peticiones: number;
  realizadas: number;
  pendientes: number;
}

/**
 * The four monthly pivots added as sheets 23-26.
 *
 * They are not weekly matrices and must not be forced into `OficinasWeekValue`:
 * a month is not a week, and sheet 25 is a directorate × month grid.
 *
 * Months are stored as reported, including the in-progress one. Pages drop
 * that last open month using the report week's calendar month, the same
 * closed-period rule the weekly slides already follow.
 */
export interface OficinasMensual {
  incidencias: OficinasIncidenciasMensual[];
  recicladores: OficinasRecicladoresMensual[];
  cierresPorDT: OficinasMonthRow[];
  peticiones: OficinasPeticionesMensual[];
}

/* -------------------------------------------------------------------------- */
/* Surveys                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * One month of the survey series.
 *
 * Surveys are the one section of the template that is NOT weekly: sheets 18 and
 * 19 are keyed by `YYYY/MM`. They are stored by month rather than folded into a
 * week number, which would be a fabricated conversion.
 */
export interface OficinasEncuestaMes {
  /** `YYYY-MM`. */
  month: string;
  encuestas: number;
  /** Overall score, 1-5. `null` when the month reports a count and no score. */
  global: number | null;
  apertura: number | null;
  resolucion: number | null;
}

/** Counts of scores 1 to 5, cumulative over the whole series. Always five entries. */
export interface OficinasDistribucion {
  global: number[];
  apertura: number[];
  resolucion: number[];
}

export interface OficinasEncuestas {
  porMes: OficinasEncuestaMes[];
  distribucion: OficinasDistribucion;
}

/* -------------------------------------------------------------------------- */
/* Masters                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Offices per directorate, the denominator of every ratio in the deck.
 *
 * It does not come from the weekly template but from the office master, seeded
 * once by `scripts/importar-maestro-oficinas.mjs`, so it must survive every
 * weekly upload untouched.
 */
export interface OficinasMasters {
  dtOffices: { dt: string; offices: number }[];
}

/* -------------------------------------------------------------------------- */
/* Dataset                                                                     */
/* -------------------------------------------------------------------------- */

export interface OficinasDataset {
  asignadas?: OficinasIncidencias;
  resueltas?: OficinasIncidencias;
  peticiones?: OficinasPeticiones;
  recicladores?: OficinasRecicladores;
  imac?: OficinasImac;
  mensual?: OficinasMensual;
  encuestas?: OficinasEncuestas;
  masters?: OficinasMasters;
  source: DatasetSource;
  /** Sheets the last upload recognised, in workbook order. */
  sheetsFound?: string[];
  /** Year applied to the current-year sheets of the last upload. */
  year?: number;
}

/** Dataset sections a page can depend on. */
export type OficinasSectionKey =
  | "asignadas"
  | "resueltas"
  | "peticiones"
  | "imac"
  | "mensualIncidencias"
  | "mensualRecicladores"
  | "mensualCierresDT"
  | "mensualPeticiones"
  | "recicladores"
  | "encuestas";

/* -------------------------------------------------------------------------- */
/* Deck                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Page kinds of the Oficinas deck. Prefixed `ofi` so they never collide with the
 * other modules.
 *
 * The `...Semanal` kinds are the ones the published PDF is built from: the
 * annual bar comparison over the top and the dimension pivoted across the
 * fifty-two weeks underneath. The kinds without the suffix are the deck's own
 * readings of the same sections — the ranked top-twelve elements, the share by
 * request type — kept beside them because the team may prefer either.
 */
export type OficinasPageKind =
  | CoreDeckPageKind
  | "ofiAsignadasDT"
  | "ofiAsignadasElemento"
  | "ofiAsignadasSemanal"
  | "ofiAsignadasTotalSemanal"
  | "ofiResueltasDT"
  | "ofiResueltasElemento"
  | "ofiResueltasSemanal"
  | "ofiResueltasTotalSemanal"
  | "ofiPeticionesDT"
  | "ofiPeticionesDTSemanal"
  | "ofiPeticionesTipo"
  | "ofiPeticionesTipoSemanal"
  | "ofiImac"
  | "ofiEncuestas"
  | "ofiMensualIncidencias"
  | "ofiMensualRecicladores"
  | "ofiMensualCierresDT"
  | "ofiMensualPeticiones"
  | "ofiRecicladoresDT"
  | "ofiRecicladoresDTSemanal"
  | "ofiRecicladoresElemento"
  | "ofiRecicladoresElementoAnual"
  | "ofiRecicladoresElementoSemanal";

/** Series a page reports on. Oficinas pages are not typed by series. */
export type OficinasSeries = string;

export type OficinasDeckPage = DeckPage<OficinasPageKind, OficinasSeries>;
export type OficinasDeckState = DeckState<OficinasPageKind, OficinasSeries>;

export interface OficinasPayload {
  deck: OficinasDeckState;
  data: OficinasDataset;
}
