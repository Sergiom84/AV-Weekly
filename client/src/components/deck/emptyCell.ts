/** Marker for a table cell with nothing to report. */
export const EMPTY_TABLE_CELL = "-";

/** Turns a missing or zero count into a hyphen; keeps real figures as text. */
export function formatTableNumber(value: number | null | undefined): string {
  if (value == null || value === 0) {
    return EMPTY_TABLE_CELL;
  }

  return String(value);
}
