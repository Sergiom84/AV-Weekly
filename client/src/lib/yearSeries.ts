/**
 * Fixed visual language for year-on-year comparisons across every report deck.
 *
 * A year must retain its colour even when a source omits another year: assigning
 * colours by position makes the same line mean different things per slide.
 */
const YEAR_COLORS: Record<number, string> = {
  2023: "var(--informe-serie-2)",
  2024: "var(--informe-serie-1)",
  2025: "var(--informe-serie-3)",
  2026: "var(--informe-serie-4)",
};

/** Colour for a calendar year, preserving a stable fallback for older data. */
export function yearSeriesColor(year: number): string {
  return YEAR_COLORS[year] ?? "var(--informe-serie-2)";
}
