import type { OficinasDeckPage } from "@shared/modules/oficinas/types";

/**
 * Manual corrections of the charted figures, on the `page.overrides` map the
 * deck chassis already persists (see `CellOverrides` in `shared/deck/core.ts`).
 *
 * Same shape as the AGA module: a key is built from the identity of the datum,
 * never from its position, so a correction survives an upload that adds a week
 * or reorders the rows.
 *
 * - weekly series and DT tables: `${rowLabel}:S${week}`, the row label being the
 *   directorate, the element or one of the two reserved series rows below.
 * - surveys: `${rowLabel}:${YYYY-MM}` for the monthly series and
 *   `${rowLabel}:${score}` for the 1-5 distribution.
 *
 * A key that no longer matches any row is simply never read: it stays in the
 * deck without affecting the chart.
 */

/** Row of the current-year total series, which has no category of its own. */
export const TOTAL_ROW = "total";

/** Row of the previous-year total series. */
export const PREVIOUS_ROW = "anterior";

export function cellKey(row: string, column: string): string {
  return `${row}:${column}`;
}

/** Column part of a weekly key: `S33`. Stable across years by design — the */
/** deck charts one year at a time and the previous one under its own row. */
export function weekColumn(week: number): string {
  return `S${week}`;
}

export function isOverridden(page: OficinasDeckPage, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(page.overrides ?? {}, key);
}

/** The corrected value when there is one, otherwise the imported one. */
export function overriddenValue(
  page: OficinasDeckPage,
  key: string,
  imported: number | null
): number | null {
  return isOverridden(page, key) ? page.overrides[key] : imported;
}

/** Patch that writes one correction, leaving the rest of the map untouched. */
export function withOverride(
  page: OficinasDeckPage,
  key: string,
  value: number | null
): Partial<OficinasDeckPage> {
  return { overrides: { ...(page.overrides ?? {}), [key]: value } };
}
