export type SupportType =
  | "Remotos"
  | "Programados"
  | "Presenciales"
  | "Incidencias"
  | "Correctivos";

/**
 * Contract for the "Informe" deck: a slide-based weekly report.
 *
 * Data sources:
 * - Weekly workbook ("Templates semanales audiovisuales"): matrix sheets, one
 *   row per category/location and one column per ISO week.
 * - Monthly workbook ("Audiovisuales - Resueltas mes anterior"): flat ticket
 *   dump aggregated into monthly totals per support type.
 * - Historical workbook (previous-year totals): pending, uploaded by the user.
 *
 * Every imported value can be overridden by hand from the deck editor. The
 * imported dataset stays immutable; overrides live in the deck state.
 */

export const INFORME_SUPPORT_TYPES: SupportType[] = [
  "Remotos",
  "Programados",
  "Presenciales",
  "Incidencias",
  "Correctivos",
];

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
/* Imported datasets                                                          */
/* -------------------------------------------------------------------------- */

/** One labelled row of a weekly matrix (category or location). */
export interface WeeklyRow {
  label: string;
  /** Values aligned with `WeeklyMatrix.weeks`, same length, zero-filled. */
  values: number[];
  total: number;
}

/** A matrix of weekly values: rows x weeks, plus the column totals. */
export interface WeeklyMatrix {
  /** Ascending ISO week numbers present in the source, e.g. [1..31]. */
  weeks: number[];
  rows: WeeklyRow[];
  /** Column totals aligned with `weeks`. */
  totals: number[];
}

/** One row of the "detalle por resolución" sheets (tiers 1-3 plus total). */
export interface ResolutionRow {
  category: string;
  tier2: string;
  tier3: string;
  total: number;
}

/**
 * Weekly totals of a previous year, used as the comparison series on the
 * weekly pages. Keyed by ISO week so a partial or 53-week year still lines up
 * with the current year regardless of how many weeks it reports.
 */
export interface WeeklyComparison {
  year: number;
  /** Total per ISO week: key is the week number as a string. */
  totalsByWeek: Record<string, number>;
}

export interface WeeklyTypeData {
  /** Breakdown by resolution category. Present for Remotos. */
  categories: WeeklyMatrix | null;
  /** Breakdown by building/location. Present for the other four types. */
  locations: WeeklyMatrix | null;
  /** Detail sheet for the reported week. */
  resolutions: ResolutionRow[];
  /** Accumulated resolution detail, keyed by ISO week as a string. */
  resolutionsByWeek: Record<string, ResolutionRow[]>;
  /** Previous-year weekly totals, ascending by year. Empty when not loaded. */
  comparisons: WeeklyComparison[];
}

/**
 * Rows shown by default on each weekly page. A type with no entry here starts
 * with every row visible. Matching ignores case and accents, so "CONEXIÓN" and
 * "CONEXION" are the same row.
 */
export const DEFAULT_VISIBLE_ROWS: Partial<Record<SupportType, string[]>> = {
  Remotos: ["ERRORES", "OPERATIVA", "CONEXION", "VIDEO"],
};

function normalizeRowLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase();
}

/** Rows to hide so only the default ones remain visible. */
export function defaultHiddenRows(
  type: SupportType | null,
  labels: string[]
): string[] {
  const defaults = type ? DEFAULT_VISIBLE_ROWS[type] : undefined;

  if (!defaults) {
    return [];
  }

  const wanted = new Set(defaults.map(normalizeRowLabel));
  return labels.filter((label) => !wanted.has(normalizeRowLabel(label)));
}

/** Comparison total for a week, or null when that year has no data for it. */
export function comparisonValue(
  comparison: WeeklyComparison | undefined,
  week: number
): number | null {
  if (!comparison) {
    return null;
  }

  const value = comparison.totalsByWeek[String(week)];
  return typeof value === "number" ? value : null;
}

export interface InformeWeeklyDataset {
  byType: Record<SupportType, WeeklyTypeData>;
  /** Highest week number found across all sheets. */
  maxWeek: number;
  sourceFile: string | null;
  uploadedAt: string | null;
}

export interface InformeMonthlyDataset {
  /** byType[type][year] -> 12 values, null when the month has no data. */
  byType: Record<SupportType, Record<string, (number | null)[]>>;
  /** Ascending list of years with at least one value. */
  years: number[];
  sourceFile: string | null;
  uploadedAt: string | null;
}

/* -------------------------------------------------------------------------- */
/* Deck state                                                                  */
/* -------------------------------------------------------------------------- */

export type DeckPageKind =
  | "cover"
  | "index"
  | "section"
  | "monthlyTrend"
  | "weeklySupport"
  | "resolutionDetail"
  | "pendingItems"
  | "closing";


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

/**
 * Manual edits keyed by cell.
 * - monthlyTrend pages: `${year}:${monthIndex0based}`.
 * - weeklySupport pages: `${rowLabel}:${week}`.
 * A null value blanks the cell; an absent key falls back to the imported value.
 */
export type CellOverrides = Record<string, number | null>;

export interface DeckPage {
  /** Stable identifier, never renumbered. */
  id: string;
  kind: DeckPageKind;
  /** Support type this page reports on, when applicable. */
  supportType: SupportType | null;
  /** Editable text slots: title, subtitle, footnote, bullets, etc. */
  text: Record<string, string>;
  /** Whether the page is part of the deck. Every page ships visible. */
  visible: boolean;
  /** Only meaningful for weeklySupport pages. */
  weekSelection: WeekSelection | null;
  /** Only meaningful for monthlyTrend pages. Years shown, ascending. */
  years: number[] | null;
  overrides: CellOverrides;
  /** Rows hidden by the user, by row label. Absent means "use the defaults". */
  hiddenRows?: string[];
}

export interface DeckState {
  pages: DeckPage[];
  updatedAt: string | null;
}

export interface InformePayload {
  deck: DeckState;
  weekly: InformeWeeklyDataset;
  monthly: InformeMonthlyDataset;
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

/* -------------------------------------------------------------------------- */
/* Empty values                                                                */
/* -------------------------------------------------------------------------- */

export function emptyWeeklyDataset(): InformeWeeklyDataset {
  return {
    byType: Object.fromEntries(
      INFORME_SUPPORT_TYPES.map((type) => [
        type,
        {
          categories: null,
          locations: null,
          resolutions: [],
          resolutionsByWeek: {},
          comparisons: [],
        },
      ])
    ) as unknown as Record<SupportType, WeeklyTypeData>,
    maxWeek: 0,
    sourceFile: null,
    uploadedAt: null,
  };
}

export function emptyMonthlyDataset(): InformeMonthlyDataset {
  return {
    byType: Object.fromEntries(
      INFORME_SUPPORT_TYPES.map((type) => [type, {}])
    ) as unknown as Record<SupportType, Record<string, (number | null)[]>>,
    years: [],
    sourceFile: null,
    uploadedAt: null,
  };
}

/* -------------------------------------------------------------------------- */
/* Default deck                                                                */
/* -------------------------------------------------------------------------- */

const SECTION_LABEL: Record<SupportType, string> = {
  Remotos: "1.2 Soporte remoto",
  Programados: "1.3 Soporte programado",
  Presenciales: "1.4 Soporte presencial",
  Incidencias: "1.5 Incidencias",
  Correctivos: "1.6 Mantenimientos correctivos",
};

const TREND_LABEL: Record<SupportType, string> = {
  Remotos: "1.2 Soporte remoto tendencia",
  Programados: "1.3 Soporte programado tendencia",
  Presenciales: "1.4 Soporte presencial tendencia",
  Incidencias: "1.5 Incidencias tendencia",
  Correctivos: "1.6 Mantenimientos correctivos tendencia",
};

const TYPE_FOOTNOTE: Record<SupportType, string> = {
  Remotos:
    "Errores: actuación del dispatcher gestionando una incidencia. Conexión: conexión remota de una sala con videoconferencia. Operativa: guía al usuario sobre utilización de los medios AV.",
  Programados:
    "Soportes programados: soporte agendado al técnico para usuarios o salas VIP. El técnico acude antes y se retira cuando todo está funcionando.",
  Presenciales:
    "Soporte presencial: acciones solicitadas por el usuario cuya intervención requiere más tiempo, a partir de 15 minutos.",
  Incidencias: "Incidencias: incidencias generadas por el usuario a las que acude el técnico.",
  Correctivos:
    "Mantenimientos correctivos: acciones de carácter proactivo. Conllevan una acción que corrige un fallo.",
};

/** Types that report a resolution breakdown of their own. */
const RESOLUTION_DETAIL_TYPES: SupportType[] = ["Programados"];

const RESOLUTION_LABEL: Partial<Record<SupportType, string>> = {
  Programados: "1.3 Soporte programado por resolución",
  Presenciales: "1.4 Soporte presencial por resolución",
  Incidencias: "1.5 Incidencias por resolución",
  Correctivos: "1.6 Mantenimientos correctivos por resolución",
};

/** Builds the default deck matching the current weekly report. */
export function createDefaultDeck(): DeckState {
  const pages: DeckPage[] = [
    {
      id: "cover",
      kind: "cover",
      supportType: null,
      text: {
        title: "Informe de seguimiento del servicio",
        subtitle: "Servicio Audiovisuales BBVA",
        period: "",
      },
      visible: true,
      weekSelection: null,
      years: null,
      overrides: {},
    },
    {
      id: "index",
      kind: "index",
      supportType: null,
      text: {
        title: "1 Revisión de métricas",
        item1: "1.2 Soporte remoto",
        item2: "1.3 Soporte programado",
        item3: "1.4 Soporte presencial",
        item4: "1.5 Incidencias",
        item5: "1.6 Mantenimientos correctivos",
        item6: "2. Asuntos pendientes",
      },
      visible: true,
      weekSelection: null,
      years: null,
      overrides: {},
      hiddenRows: [],
    },
    {
      id: "section-metrics",
      kind: "section",
      supportType: null,
      text: { title: "1 Revisión de métricas", subtitle: "" },
      visible: true,
      weekSelection: null,
      years: null,
      overrides: {},
      hiddenRows: [],
    },
  ];

  for (const type of INFORME_SUPPORT_TYPES) {
    pages.push({
      id: `trend-${type.toLowerCase()}`,
      kind: "monthlyTrend",
      supportType: type,
      text: { title: TREND_LABEL[type], subtitle: "AUDIOVISUALES", footnote: "" },
      visible: true,
      weekSelection: null,
      years: [2023, 2024, 2025, 2026],
      overrides: {},
      hiddenRows: [],
    });

    pages.push({
      id: `weekly-${type.toLowerCase()}`,
      kind: "weeklySupport",
      supportType: type,
      text: {
        title: SECTION_LABEL[type],
        subtitle: "AUDIOVISUALES",
        footnote: TYPE_FOOTNOTE[type],
      },
      visible: true,
      weekSelection: defaultWeekSelection(31),
      years: null,
      overrides: {},
      // hiddenRows stays absent so the page opens on its default rows.
    });

    if (RESOLUTION_DETAIL_TYPES.includes(type)) {
      pages.push({
        id: `resolution-${type.toLowerCase()}`,
        kind: "resolutionDetail",
        supportType: type,
        text: {
          title: RESOLUTION_LABEL[type] ?? "",
          subtitle: "AUDIOVISUALES",
          footnote: "",
        },
        visible: true,
        weekSelection: defaultWeekSelection(31),
        years: null,
        overrides: {},
      });
    }
  }

  return { pages, updatedAt: null };
}
