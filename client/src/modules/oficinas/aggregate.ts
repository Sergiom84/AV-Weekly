import { MONTH_LABELS } from "@shared/deck/core";
import {
  rankedRowsByAverage,
  rowsWithOtrosLast,
  seriesWeeks,
  valueAt,
} from "@shared/modules/oficinas/derived";
import type {
  OficinasRow,
  OficinasValidadoras,
  OficinasWeekValue,
} from "@shared/modules/oficinas/types";

/**
 * Formatting, palette and the annual-comparison view model of Oficinas.
 *
 * Dataset readers stay in `shared/modules/oficinas/derived.ts`. What lives
 * here is the axis vocabulary plus the series/table shape `SemanalPage`
 * used to compute inside React.
 */

/** Axis label of a week: `S33`, the form the source workbook names them by. */
export function weekLabel(week: number): string {
  return `S${week}`;
}

/**
 * Headline form of a week: `Semana 33`.
 *
 * A KPI card is read on its own, away from the axis it summarises, so it spells
 * the week out. `weekLabel` stays the short form for chart axes and table
 * columns, where the row of headers is what gives `S33` its meaning.
 */
export function weekHeadline(week: number): string {
  return `Semana ${week}`;
}

/** `2026-08` renders as `Ago 26`, the monthly form the AGA Office page uses. */
export function monthLabel(month: string): string {
  const index = Number(month.slice(5, 7));
  const name = MONTH_LABELS[index - 1] ?? month;

  return `${name} ${month.slice(2, 4)}`;
}

/** Number with the Spanish decimal comma, e.g. `2,87`. */
export function decimal(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }

  return value.toLocaleString("es-ES", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Share as a whole percentage, e.g. `39%`. */
export function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

/** Signed variation between two figures, e.g. `+5,0%`. */
export function variationLabel(
  previous: number | null,
  current: number | null
): string {
  if (previous === null || current === null || previous === 0) {
    return "—";
  }

  const value = ((current - previous) / previous) * 100;
  const sign = value > 0 ? "+" : "";

  return `${sign}${decimal(value, 1)}%`;
}

/* -------------------------------------------------------------------------- */
/* Validator variants                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The three DT matrices the template ships, in the order the selector lists
 * them. The published client deck explicitly reports the figures without
 * validators, so `sin` is the default; the selector keeps the other two source
 * views available.
 */
export const VALIDADORAS_VARIANTS: {
  value: OficinasValidadoras;
  label: string;
}[] = [
  { value: "con", label: "Con validadoras" },
  { value: "sin", label: "Sin validadoras" },
  { value: "solo", label: "Solo validadoras" },
];

export const DEFAULT_VARIANT: OficinasValidadoras = "sin";

/** The variant a page has stored, or the default when it has none or an unknown one. */
export function readVariant(stored: string | null): OficinasValidadoras {
  const match = VALIDADORAS_VARIANTS.find(entry => entry.value === stored);

  return match?.value ?? DEFAULT_VARIANT;
}

export function variantLabel(variant: OficinasValidadoras): string {
  return (
    VALIDADORAS_VARIANTS.find(entry => entry.value === variant)?.label ??
    variant
  );
}

/* -------------------------------------------------------------------------- */
/* Labels                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Display labels of a set of rows, disambiguated only where they collide.
 *
 * The element matrices carry the component and the element apart, and the
 * source spells the same component three ways ("PERIFERICOS", "Periférico",
 * "Periféricos"), so two rows can reach the axis as the same word. The element
 * alone is what the deck names, so the component is appended only to the rows
 * that would otherwise be indistinguishable rather than to all of them.
 */
export function disambiguate(
  rows: { elemento: string; componente: string }[]
): string[] {
  // Compared without case or accents: the source ships "VALIDADORA" under
  // "PERIFERICOS" and "Validadora" under "Periférico" as two separate rows, and
  // an exact comparison would let both reach the axis as the same word.
  // Same shape as `normalizeDT` in the shared contract: decompose, drop
  // everything that is not a letter or a digit, compare in upper case.
  const key = (label: string) =>
    label
      .normalize("NFD")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");

  const seen = new Map<string, number>();

  for (const row of rows) {
    seen.set(key(row.elemento), (seen.get(key(row.elemento)) ?? 0) + 1);
  }

  return rows.map(row =>
    (seen.get(key(row.elemento)) ?? 0) > 1
      ? `${row.elemento} (${row.componente})`
      : row.elemento
  );
}

/* -------------------------------------------------------------------------- */
/* Palette                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Palette of the Oficinas charts, the same token chain the AGA deck uses so the
 * two reports read as one document. Ordered to alternate hue and lightness:
 * the element pages carry a dozen bars that have to be told apart at a glance.
 */
export const OFICINAS_SERIES_COLORS = [
  "var(--informe-serie-1)",
  "var(--informe-serie-4)",
  "var(--informe-serie-3)",
  "var(--chart-5)",
  "var(--informe-serie-2)",
  "var(--chart-3)",
  "var(--chart-2)",
  "var(--chart-4)",
  "var(--chart-1)",
];

export function oficinasColor(index: number): string {
  return OFICINAS_SERIES_COLORS[index % OFICINAS_SERIES_COLORS.length];
}

/** Colours of the year-on-year lines: the previous year muted, the current one dominant. */
export const CURRENT_YEAR_COLOR = "var(--informe-serie-4)";
export const PREVIOUS_YEAR_COLOR = "var(--informe-serie-3)";

/**
 * Colour of a year line on a multi-year chart (`1.1 Incidencias asignadas por
 * DT` and whichever page picks up the same selector next).
 *
 * The current year and the immediate previous one keep the fixed pair every
 * other Oficinas chart already uses, so a reader does not learn a second
 * colour language for the same two years on a different slide. Anything
 * older draws from the general palette, skipping both fixed colours so a
 * third year is never confused with the current or the previous one.
 */
const OLDER_YEAR_COLORS = OFICINAS_SERIES_COLORS.filter(
  (color) => color !== CURRENT_YEAR_COLOR && color !== PREVIOUS_YEAR_COLOR
);

export function yearColor(year: number, currentYear: number): string {
  if (year === 2024) return "var(--informe-serie-1)";
  if (year === 2025) return "var(--informe-serie-3)";
  if (year === 2026) return "var(--informe-serie-4)";

  if (year === currentYear) return CURRENT_YEAR_COLOR;
  if (year === currentYear - 1) return PREVIOUS_YEAR_COLOR;

  const age = currentYear - year - 2;

  return OLDER_YEAR_COLORS[age % OLDER_YEAR_COLORS.length];
}

/* -------------------------------------------------------------------------- */
/* Annual weekly comparison (SemanalPage)                                      */
/* -------------------------------------------------------------------------- */

/** The axis of every annual comparison: the full ISO year, as the slides print it. */
export const ALL_ISO_WEEKS = Array.from({ length: 52 }, (_, index) => index + 1);

/** Every week the rows report for one year, deduplicated. */
export function currentYearWeeks(rows: OficinasRow[], year: number): Set<number> {
  const weeks = new Set<number>();

  for (const row of rows) {
    for (const week of seriesWeeks(row.values, year)) {
      weeks.add(week);
    }
  }

  return weeks;
}

/**
 * Weeks the `Media` column averages over.
 *
 * When `throughWeek` is unset the trailing partial column of the source is
 * dropped, which is the rule `dtStats` applies to the same figure on the
 * directorate pages.
 */
export function semanalMediaWeeks(
  rows: OficinasRow[],
  year: number,
  throughWeek?: number | null
): number[] {
  const reportedWeeks = Array.from(currentYearWeeks(rows, year)).sort(
    (a, b) => a - b
  );

  return throughWeek === null || throughWeek === undefined
    ? reportedWeeks.slice(0, -1)
    : reportedWeeks.filter(week => week <= throughWeek);
}

/** Weeks the current-year bars may still point at. */
export function semanalReportWeeks(
  rows: OficinasRow[],
  year: number,
  totals: OficinasWeekValue[] | undefined,
  throughWeek?: number | null
): number[] {
  const currentReported = new Set(
    totals
      ? seriesWeeks(totals, year)
      : rows.flatMap(row => seriesWeeks(row.values, year))
  );

  return Array.from(currentReported).filter(
    week =>
      throughWeek === null || throughWeek === undefined || week <= throughWeek
  );
}

/** Current-year total of one week: published series, or the sum of the table rows. */
export function semanalCurrentAt(
  rows: OficinasRow[],
  year: number,
  week: number,
  totals?: OficinasWeekValue[]
): number {
  return totals
    ? valueAt(totals, year, week)
    : rows.reduce((sum, row) => sum + valueAt(row.values, year, week), 0);
}

/**
 * Weekly headline cards: the compared year first, the current one after it, and
 * the variation last. Both cards name their year, so the pair reads on its own
 * instead of leaving the second card as a bare number.
 */
export function semanalHeadlineItems(input: {
  headlineLabel: string | undefined;
  lastWeek: number | null;
  year: number;
  current: number;
  compareYear: number | null;
  previous: number | null;
}): { label: string; value: string }[] {
  const { headlineLabel, lastWeek } = input;

  if (headlineLabel === undefined || lastWeek === null) {
    return [];
  }

  const headlineFor = (labelYear: number) =>
    `${headlineLabel} ${weekHeadline(lastWeek)} - ${labelYear}`;
  const current = {
    label: headlineFor(input.year),
    value: input.current.toLocaleString("es-ES"),
  };

  if (input.compareYear === null || input.previous === null) {
    return [current];
  }

  return [
    {
      label: headlineFor(input.compareYear),
      value: input.previous.toLocaleString("es-ES"),
    },
    current,
    {
      label: "Variación",
      value: variationLabel(input.previous, input.current),
    },
  ];
}

export interface SemanalTableEntry {
  label: string;
  weekly: Map<number, number>;
  media: number | null;
}

/** Pivot rows of the annual comparison table, including ranking and OTROS. */
export function semanalTableEntries(
  rows: OficinasRow[],
  year: number,
  mediaWeeks: number[],
  options: { rankByAverage?: boolean; peticionesTerritorial?: boolean } = {}
): SemanalTableEntry[] {
  const rankedRows = options.rankByAverage
    ? rankedRowsByAverage(rows, year, mediaWeeks)
    : rows;
  const orderedRows = options.peticionesTerritorial
    ? rowsWithOtrosLast(rankedRows)
    : rankedRows;

  return orderedRows.map(row => {
    const weekly = new Map<number, number>();

    for (const entry of row.values) {
      if (entry.year === year) {
        weekly.set(entry.week, entry.value);
      }
    }

    return {
      label: row.label,
      weekly,
      media:
        mediaWeeks.length === 0
          ? null
          : mediaWeeks.reduce((sum, week) => sum + (weekly.get(week) ?? 0), 0) /
            mediaWeeks.length,
    };
  });
}

/**
 * Column total of the pivot. Null when no row reported that week, so the
 * printed slide can leave the cell blank instead of writing a zero.
 */
export function semanalWeekTotal(
  entries: SemanalTableEntry[],
  week: number
): number | null {
  const reported = entries.some(entry => entry.weekly.has(week));

  if (!reported) {
    return null;
  }

  return entries.reduce((sum, entry) => sum + (entry.weekly.get(week) ?? 0), 0);
}
