/**
 * Horizontal placement of a value above a grouped column.
 * Adjacent series open away from each other, so every value stays on its bar's
 * own horizontal level without needing the vertical cascade the slide rejected.
 */
export function groupedLabelPlacement(
  seriesIndex: number,
  seriesCount = 2
): {
  offset: number;
  textAnchor: "start" | "middle" | "end";
} {
  // Three annual series need the outer labels to open outwards while the
  // middle one stays confined to its own narrow bar. Applying the two-series
  // alternating rule to the third bar makes the last two labels overlap.
  if (seriesCount === 3) {
    if (seriesIndex === 0) return { offset: -1, textAnchor: "end" };
    if (seriesIndex === 1) return { offset: 0, textAnchor: "middle" };
    return { offset: 1, textAnchor: "start" };
  }

  return seriesIndex % 2 === 0
    ? { offset: -1, textAnchor: "end" }
    : { offset: 1, textAnchor: "start" };
}
