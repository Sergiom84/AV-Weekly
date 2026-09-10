/**
 * Fixed visual language for year-on-year comparisons across every report deck.
 *
 * A year keeps its colour even when a source omits another year. Component
 * series that are not years reuse the same four tokens, assigned from the
 * right: the rightmost bar is 2026 navy, then 2025 cyan, 2024 orange, 2023
 * gray.
 */
const YEAR_COLORS: Record<number, string> = {
  2023: "var(--chart-5)",
  2024: "var(--informe-serie-4)",
  2025: "var(--informe-serie-3)",
  2026: "var(--informe-serie-1)",
};

/** Spare tone when a fifth component sits left of 2023. */
const EXTRA_COMPONENT_COLOR = "var(--informe-serie-2)";

const COMPONENT_YEARS_FROM_RIGHT = [2026, 2025, 2024, 2023] as const;

/** Colour for a calendar year, preserving a stable fallback for older data. */
export function yearSeriesColor(year: number): string {
  return YEAR_COLORS[year] ?? EXTRA_COMPONENT_COLOR;
}

/**
 * Colour of a component series in a group of `count` series.
 *
 * Two series: left is 2025, right is 2026. More series continue from the
 * right: navy, 2025, orange, gray.
 */
export function componentSeriesColor(index: number, count: number): string {
  const fromRight = Math.max(0, count - 1 - index);
  const year = COMPONENT_YEARS_FROM_RIGHT[fromRight];

  return year === undefined ? EXTRA_COMPONENT_COLOR : yearSeriesColor(year);
}
