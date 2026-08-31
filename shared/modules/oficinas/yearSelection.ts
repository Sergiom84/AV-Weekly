/** Past years drawn next to the current one before the user picks otherwise. */
export const DEFAULT_EXTRA_YEARS = 2;

/**
 * Sentinel stored in `page.years` when the current year has been turned off.
 *
 * Older decks stored only the extra years, so a list that names neither `year`
 * nor `-year` still means "current year on". Without the sentinel, hiding 2026
 * and reloading would look like that old extras-only list and bring it back.
 */
export function hiddenCurrentYear(year: number): number {
  return -year;
}

export function resolveOficinasYears(
  seriesYears: number[],
  year: number,
  stored: number[] | null,
  extraCount = DEFAULT_EXTRA_YEARS
): { available: number[]; selected: number[] } {
  const past = Array.from(new Set(seriesYears.filter(value => value !== year))).sort(
    (a, b) => a - b
  );
  const available = [...past, year];
  const defaultSelected = [
    ...past.filter(value => value >= year - extraCount && value < year),
    year,
  ];

  if (!stored || stored.length === 0) {
    return { available, selected: defaultSelected };
  }

  const hidden = hiddenCurrentYear(year);
  if (stored.includes(year) || stored.includes(hidden)) {
    return {
      available,
      selected: stored.filter(value => available.includes(value)),
    };
  }

  return {
    available,
    selected: [...stored.filter(value => past.includes(value)), year],
  };
}

export function persistOficinasYears(selected: number[], year: number): number[] {
  const unique = Array.from(
    new Set(selected.filter(value => value > 0))
  ).sort((a, b) => a - b);

  return unique.includes(year) ? unique : [...unique, hiddenCurrentYear(year)];
}
