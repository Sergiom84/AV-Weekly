import { MONTH_LABELS } from "@shared/deck/core";
import type { OficinasValidadoras } from "@shared/modules/oficinas/types";

/**
 * Formatting and palette helpers of the Oficinas deck.
 *
 * Nothing is aggregated here: every figure the pages draw comes from
 * `shared/modules/oficinas/derived.ts`, which is the single reader of the
 * dataset. What lives here is the axis vocabulary — week and month labels,
 * percentages, the series colours — and the small ranking helper the element
 * pages need to pick the rows a slide can hold.
 */

/** Axis label of a week: `S33`, the form the source workbook names them by. */
export function weekLabel(week: number): string {
  return `S${week}`;
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
 * them. The default is `con`: the ratio and the weekly average the published
 * deck prints beside each directorate are reproduced by that matrix and by no
 * other one.
 */
export const VALIDADORAS_VARIANTS: {
  value: OficinasValidadoras;
  label: string;
}[] = [
  { value: "con", label: "Con validadoras" },
  { value: "sin", label: "Sin validadoras" },
  { value: "solo", label: "Solo validadoras" },
];

export const DEFAULT_VARIANT: OficinasValidadoras = "con";

/** The variant a page has stored, or the default when it has none or an unknown one. */
export function readVariant(stored: string | null): OficinasValidadoras {
  const match = VALIDADORAS_VARIANTS.find(entry => entry.value === stored);

  return match?.value ?? DEFAULT_VARIANT;
}

export function variantLabel(variant: OficinasValidadoras): string {
  return (
    VALIDADORAS_VARIANTS.find(entry => entry.value === variant)?.label ?? variant
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
    label.normalize("NFD").toUpperCase().replace(/[^A-Z0-9]/g, "");

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
export const PREVIOUS_YEAR_COLOR = "var(--informe-serie-2)";
