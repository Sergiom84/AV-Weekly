import { followLatestWeekSelection, type WeekSelection } from "../../deck/core.ts";
import type { AvDeckState } from "./types.ts";

/**
 * Pages that were saved as an absolute range ending on a past report week.
 * Touching the from/to dropdowns writes `range`, and a range does not move
 * when a later week is imported. Only these two were found frozen in Turso
 * (S34) while the rest already used a trailing window.
 *
 * A hand-picked range on any other page is left alone.
 */
const STALE_FOLLOW_RANGE_PAGES = new Set([
  "weekly-incidencias",
  "resolution-programados",
]);

export function migrateAvDeckWeekSelections(
  deck: AvDeckState,
  reportWeek: number
): AvDeckState {
  return {
    ...deck,
    pages: deck.pages.map((page) => {
      if (!STALE_FOLLOW_RANGE_PAGES.has(page.id)) {
        return page;
      }

      const selection = page.weekSelection;
      if (!selection || selection.mode !== "range") {
        return page;
      }

      if (reportWeek > 0 && selection.to < reportWeek) {
        return { ...page, weekSelection: followLatestWeekSelection() };
      }

      return page;
    }),
  };
}

export type { WeekSelection };
