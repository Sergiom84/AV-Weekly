/**
 * Horizontal placement of a value above a grouped column.
 * Adjacent series open away from each other, so every value stays on its bar's
 * own horizontal level without needing the vertical cascade the slide rejected.
 */
export function groupedLabelPlacement(seriesIndex: number): {
  offset: number;
  textAnchor: "start" | "end";
} {
  return seriesIndex % 2 === 0
    ? { offset: -1, textAnchor: "end" }
    : { offset: 1, textAnchor: "start" };
}
