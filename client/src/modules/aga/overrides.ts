import type { AgaDeckPage } from "@shared/modules/aga/types";

/**
 * Manual corrections of the charted figures, on the `page.overrides` map the
 * deck chassis already persists (see `CellOverrides` in `shared/deck/core.ts`).
 *
 * The precedent is the AV deck (`modules/av/pages/MonthlyTrendPage`), which
 * keys a cell by row and column and falls back to the imported value when the
 * key is absent. The AGA pages of sections 2 and 3 do the same, with keys built
 * from the identity of the datum rather than from its position:
 *
 * - sections 2.1 to 2.7: `${rowLabel}:${week}`, the week being the stored
 *   `YYYY-MM-DD` Monday, so a correction survives a new upload that reorders
 *   the bars or renames nothing.
 * - slide 2.8: `${family}:${YYYY-MM}`.
 * - section 3: `${year}:${monthIndex}`, the same shape the AV deck uses.
 *
 * A key that no longer matches any row is simply never read: it stays in the
 * deck without affecting the chart, which is the behaviour the AV pages have.
 */

/** Row of the total-only page (2.1), which has no category of its own. */
export const TOTAL_ROW = "total";

export function cellKey(row: string, column: string): string {
  return `${row}:${column}`;
}

export function isOverridden(page: AgaDeckPage, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(page.overrides ?? {}, key);
}

/** The corrected value when there is one, otherwise the imported one. */
export function overriddenValue(
  page: AgaDeckPage,
  key: string,
  imported: number | null
): number | null {
  return isOverridden(page, key) ? page.overrides[key] : imported;
}

/** Patch that writes one correction, leaving the rest of the map untouched. */
export function withOverride(
  page: AgaDeckPage,
  key: string,
  value: number | null
): Partial<AgaDeckPage> {
  return { overrides: { ...(page.overrides ?? {}), [key]: value } };
}
