/** Above this many categories the value labels use the compact chart size. */
export const COMPACT_LABELS_FROM = 14;

/** Existing breathing room above a chart with one series, in pixels. */
const BASE_TOP_MARGIN = 16;

/** Vertical distance between the value-label levels of adjacent series. */
export const GROUPED_LABEL_ROW_HEIGHT = 12;

/** Offset above a bar for the value label of a given grouped series. */
export function groupedLabelOffset(seriesIndex: number): number {
  return Math.max(0, seriesIndex) * GROUPED_LABEL_ROW_HEIGHT;
}

/** Top chart margin needed to keep every grouped label level inside the SVG. */
export function groupedLabelTopMargin(seriesCount: number): number {
  return BASE_TOP_MARGIN + groupedLabelOffset(Math.max(1, seriesCount) - 1);
}
