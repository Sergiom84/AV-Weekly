/**
 * Generic contract for a slide deck report.
 *
 * Nothing here knows about a concrete report. A module (AV, Informatica, ...)
 * declares its own page kinds and its own datasets and reuses these pieces:
 * page shape, deck state, week selection, cell overrides and visibility.
 *
 * `DeckPage` and `DeckState` are parameterised by the module page kind and by
 * the module "series" type (the dimension a page reports on, e.g. the AV
 * support type). Both default to `string` so generic tooling can handle any
 * deck without knowing the module.
 */

/** Page kinds every deck has, regardless of module. */
export type CoreDeckPageKind = "cover" | "index" | "section" | "closing";

export const MONTH_LABELS = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

/* -------------------------------------------------------------------------- */
/* Labeled matrices                                                            */
/* -------------------------------------------------------------------------- */

/** One labelled row of a weekly matrix (category or location). */
export interface LabeledRow {
  label: string;
  /** Values aligned with `LabeledMatrix.weeks`, same length, zero-filled. */
  values: number[];
  total: number;
}

/** A matrix of weekly values: rows x weeks, plus the column totals. */
export interface LabeledMatrix {
  /** Ascending ISO week numbers present in the source, e.g. [1..31]. */
  weeks: number[];
  rows: LabeledRow[];
  /** Column totals aligned with `weeks`. */
  totals: number[];
}

/** Previous name of `LabeledRow`. Kept so existing imports keep working. */
export type WeeklyRow = LabeledRow;
/** Previous name of `LabeledMatrix`. Kept so existing imports keep working. */
export type WeeklyMatrix = LabeledMatrix;

/** Where an imported dataset came from. */
export interface DatasetSource {
  sourceFile: string | null;
  uploadedAt: string | null;
}

/* -------------------------------------------------------------------------- */
/* Week selection                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Which weeks a weekly page renders.
 * - range: every week between `from` and `to` inclusive.
 * - list: exactly the weeks in `weeks`, in the given order.
 */
export interface WeekSelection {
  mode: "range" | "list";
  from: number;
  to: number;
  weeks: number[];
}

export function defaultWeekSelection(maxWeek: number): WeekSelection {
  return { mode: "range", from: 1, to: Math.max(1, maxWeek), weeks: [] };
}

/** Resolves a selection into the concrete, ordered list of weeks to render. */
export function resolveWeekSelection(
  selection: WeekSelection | undefined,
  available: number[]
): number[] {
  if (!selection) {
    return available;
  }

  if (selection.mode === "list") {
    const wanted = selection.weeks.filter((week) => available.includes(week));
    return wanted.length > 0 ? wanted : available;
  }

  const from = Math.min(selection.from, selection.to);
  const to = Math.max(selection.from, selection.to);
  const inRange = available.filter((week) => week >= from && week <= to);
  return inRange.length > 0 ? inRange : available;
}

/* -------------------------------------------------------------------------- */
/* Deck state                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Manual edits keyed by cell. The key format belongs to the page kind, so each
 * module documents its own. Examples in the AV module:
 * - monthlyTrend pages: `${year}:${monthIndex0based}`.
 * - weeklySupport pages: `${rowLabel}:${week}`.
 * A null value blanks the cell; an absent key falls back to the imported value.
 */
export type CellOverrides = Record<string, number | null>;

export interface DeckPage<
  Kind extends string = string,
  Series extends string = string,
> {
  /** Stable identifier, never renumbered. */
  id: string;
  kind: Kind;
  /** Series this page reports on, when applicable. */
  supportType: Series | null;
  /** Editable text slots: title, subtitle, footnote, bullets, etc. */
  text: Record<string, string>;
  /** Whether the page is part of the deck. Every page ships visible. */
  visible: boolean;
  /** Only meaningful for week-based pages. */
  weekSelection: WeekSelection | null;
  /** Only meaningful for year-based pages. Years shown, ascending. */
  years: number[] | null;
  overrides: CellOverrides;
  /** Rows hidden by the user, by row label. Absent means "use the defaults". */
  hiddenRows?: string[];
}

export interface DeckState<
  Kind extends string = string,
  Series extends string = string,
> {
  pages: DeckPage<Kind, Series>[];
  updatedAt: string | null;
}

/* -------------------------------------------------------------------------- */
/* Visibility                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Effective visibility of a page. Toggled by hand from the deck sidebar.
 * Anything other than an explicit `false` counts as visible, so decks stored
 * before `visible` became a plain boolean keep rendering.
 */
export function isPageVisible(page: DeckPage): boolean {
  return page.visible !== false;
}
