/** Visual rules scoped to the territorial slide family. */
export type DTTerritorialLayout =
  | "standard-territorial"
  | "incidencias-territoriales";

/**
 * Outer flex of each table card.
 *
 * Incident slides deliberately give the three cards the same frame. Their
 * internal columns remain independent, so the Validadoras card can still omit
 * OF, Ratio and Media without changing its data contract.
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
