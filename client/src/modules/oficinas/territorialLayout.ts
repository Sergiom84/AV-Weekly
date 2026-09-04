/** Visual rules scoped to the territorial slide family. */
export type DTTerritorialLayout =
  | "standard-territorial"
  | "incidencias-territoriales";

/**
 * Outer flex of each table card.
 *
 * Incident slides deliberately give every card the same frame, whatever the
 * week count or the columns inside it. That is what makes the two remaining
 * tables take half the width each when the third one is gone, with nothing to
 * adjust here.
 */
export function dtTableFrameFlex(
  layout: DTTerritorialLayout,
  weeks: number,
  aggregates: boolean
): string {
  if (layout === "incidencias-territoriales") {
    return "1 1 0%";
  }

  return `${weeks + (aggregates ? 4 : 1)} 1 0%`;
}
