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

/**
 * Page kinds every deck has, regardless of module. `notes` is a free-form
 * slide any department can add by hand — plain text plus uploaded images,
 * with no data source behind it.
 */
export type CoreDeckPageKind =
  | "cover"
  | "index"
  | "section"
  | "closing"
  | "notes";

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

/** Full Spanish month names used on cover period lines. */
export const MONTH_NAMES_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

function isoDayUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Monday and Sunday of an ISO week, as `YYYY-MM-DD`. */
export function isoWeekBounds(
  year: number,
  week: number
): { start: string; end: string } {
  const januaryFourth = new Date(Date.UTC(year, 0, 4));
  const weekday = (januaryFourth.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(year, 0, 4 - weekday + (week - 1) * 7));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  return { start: isoDayUtc(monday), end: isoDayUtc(sunday) };
}

/**
 * Cover period shared by every module: `Semana 33 de 2026 · 10-16 agosto`.
 * Pass explicit bounds when the module's week is not a plain ISO week.
 */
export function weekCoverLabel(
  week: number,
  year: number,
  bounds?: { start: string; end: string }
): string {
  const range = bounds ?? isoWeekBounds(year, week);
  const startMonth = Number(range.start.slice(5, 7)) - 1;
  const endMonth = Number(range.end.slice(5, 7)) - 1;
  const startDay = Number(range.start.slice(8, 10));
  const endDay = Number(range.end.slice(8, 10));
  const span =
    startMonth === endMonth
      ? `${startDay}-${endDay} ${MONTH_NAMES_ES[endMonth]}`
      : `${startDay} ${MONTH_NAMES_ES[startMonth]}-${endDay} ${MONTH_NAMES_ES[endMonth]}`;

  return `Semana ${week} de ${year} · ${span}`;
}

/** Formats quantitative chart ticks without abbreviating thousands. */
export function formatChartMetric(value: number): string {
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  const fractionDigits = Number.isInteger(absolute) ? 0 : 1;
  const [whole, fraction] = absolute.toFixed(fractionDigits).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return fraction ? `${sign}${grouped},${fraction}` : `${sign}${grouped}`;
}

/**
 * Width reserved for a quantitative Y axis. Recharts otherwise defaults to a
 * fixed narrow gutter that clips the leading digit of values such as 1.600.
 */
export function metricAxisWidth(values: unknown[]): number {
  const longest = values.reduce<number>((max, value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric)
      ? Math.max(max, formatChartMetric(numeric).length)
      : max;
  }, 1);

  return Math.min(80, Math.max(44, longest * 11 + 12));
}

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
  /** Extraction date declared by the source, never inferred from its filename. */
  asOfDate?: string | null;
}

/* -------------------------------------------------------------------------- */
/* Week selection                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Which weeks a weekly page renders.
 * - range: every week between `from` and `to` inclusive.
 * - list: exactly the weeks in `weeks`, in the given order.
 * - window: the trailing `size` available weeks. Recomputed against the
 *   latest upload every time, so as new weeks arrive the oldest ones drop
 *   off automatically instead of the range staying pinned to old numbers.
 */
export interface WeekSelection {
  mode: "range" | "list" | "window";
  from: number;
  to: number;
  weeks: number[];
  /** Trailing window size, only meaningful when `mode` is "window". */
  size?: number;
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
    const wanted = selection.weeks.filter(week => available.includes(week));
    return wanted.length > 0 ? wanted : available;
  }

  if (selection.mode === "window") {
    const size = Math.max(1, selection.size ?? 20);
    return available.slice(-size);
  }

  const from = Math.min(selection.from, selection.to);
  const to = Math.max(selection.from, selection.to);
  const inRange = available.filter(week => week >= from && week <= to);
  return inRange.length > 0 ? inRange : available;
}

/**
 * Limits a calendar-shaped week axis to the latest week that was actually
 * reported. Some workbook templates carry empty columns through week 52;
 * those columns must not make a trailing window point into the future.
 */
export function reportedWeekAvailability(
  available: number[],
  reportedWeeks: number[]
): number[] {
  const lastReported = Math.max(
    ...reportedWeeks.filter(week => available.includes(week))
  );

  return Number.isFinite(lastReported)
    ? available.filter(week => week <= lastReported)
    : available;
}

/** Selection of `YYYY/MM` reporting months for monthly charts and tables. */
export interface MonthSelection {
  mode: "range" | "list" | "window";
  from: string;
  to: string;
  months: string[];
  size?: number;
}

export function defaultMonthSelection(maxMonth: string): MonthSelection {
  return { mode: "range", from: maxMonth, to: maxMonth, months: [] };
}

/**
 * Default selection of a page whose chart is a monthly series.
 *
 * `defaultMonthSelection` pins one month, which is right for a page reporting a
 * single period and wrong for one plotting a trend: it collapses the chart to a
 * single column until somebody opens the editor and widens the range by hand.
 */
export function defaultMonthWindow(size: number): MonthSelection {
  return { mode: "window", from: "", to: "", months: [], size };
}

export function resolveMonthSelection(
  selection: MonthSelection | undefined,
  available: string[]
): string[] {
  if (!selection) return available;
  if (selection.mode === "list") {
    const wanted = selection.months.filter(month => available.includes(month));
    return wanted.length > 0 ? wanted : available;
  }
  if (selection.mode === "window") {
    return available.slice(-Math.max(1, selection.size ?? 12));
  }

  const from = selection.from < selection.to ? selection.from : selection.to;
  const to = selection.from < selection.to ? selection.to : selection.from;
  const inRange = available.filter(month => month >= from && month <= to);
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
  /** Only meaningful for month-based pages. */
  monthSelection?: MonthSelection | null;
  /** Only meaningful for year-based pages. Years shown, ascending. */
  years: number[] | null;
  overrides: CellOverrides;
  /** Rows hidden by the user, by row label. Absent means "use the defaults". */
  hiddenRows?: string[];
  /** Uploaded image URLs, in display order. Only meaningful for `notes` pages. */
  images?: string[];
  /** Freeform placement of the text block on the page canvas. `notes` pages only. */
  textBox?: LayoutBox;
  /** Freeform placement of each image, keyed by its URL, percent (0-100) of the page canvas. `notes` pages only. */
  imageLayout?: Record<string, LayoutBox>;
}

/** Position and size of a freeform block, in percent (0-100) of its canvas. */
export interface LayoutBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DeckState<
  Kind extends string = string,
  Series extends string = string,
> {
  pages: DeckPage<Kind, Series>[];
  updatedAt: string | null;
}

/**
 * A blank free-text page a department adds by hand, e.g. "what happened this
 * week" notes with a few photos. Inserted right before the closing page (see
 * `insertBeforeClosing`) so it never lands after "Gracias".
 */
export function createNotesPage<Kind extends string, Series extends string>(
  id: string,
  kind: Kind,
  /** Service name of the module, shown as the dominant heading line like every other slide. */
  service: string
): DeckPage<Kind, Series> {
  return {
    id,
    kind,
    supportType: null,
    text: { subtitle: service, title: "2. Asuntos pendientes", body: "" },
    visible: true,
    weekSelection: null,
    years: null,
    overrides: {},
    images: [],
  };
}

/**
 * A section divider a department adds by hand, same corporate artwork as the
 * ones that ship with the deck. Inserted before the closing page and reordered
 * from the sidebar like any other page.
 */
export function createSectionPage<Kind extends string, Series extends string>(
  id: string,
  kind: Kind,
  title: string
): DeckPage<Kind, Series> {
  return {
    id,
    kind,
    supportType: null,
    text: { title, subtitle: "" },
    visible: true,
    weekSelection: null,
    years: null,
    overrides: {},
  };
}

/** Inserts a page right before the deck's closing page, or at the end if it has none. */
export function insertBeforeClosing<TPage extends DeckPage<string, string>>(
  pages: TPage[],
  page: TPage
): TPage[] {
  const closingIndex = pages.findIndex(entry => entry.kind === "closing");
  const insertAt = closingIndex === -1 ? pages.length : closingIndex;
  return [...pages.slice(0, insertAt), page, ...pages.slice(insertAt)];
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
