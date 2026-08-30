/**
 * Visual contracts of the annual weekly comparison slides.
 *
 * Six printed pages share `SemanalPage`, but a layout change for one family
 * must not spill into another. Each family owns a closed set of table and
 * chart rules here; the page only looks up the name it was given.
 */

export type SemanalLayout =
  | "standard-semanal"
  | "comparativas-semanales"
  | "peticiones-territorial-semanal"
  | "volumetrias-semanales";

export interface SemanalLayoutRules {
  /** Week axis uses `S33` labels instead of bare numbers. */
  comparisonLabels: boolean;
  /** Keep the catch-all territorial category as the final table row. */
  peticionesTerritorial: boolean;
  /** Mark a complete pivot total with the report's orange band. */
  highlightTotal: boolean;
  /** Centre the dimension labels in the first column. */
  centerRowHeader: boolean;
  /** Give the Media column a little more room. */
  wideAverage: boolean;
}

export const SEMANAL_LAYOUTS: Record<SemanalLayout, SemanalLayoutRules> = {
  "standard-semanal": {
    comparisonLabels: false,
    peticionesTerritorial: false,
    highlightTotal: false,
    centerRowHeader: false,
    wideAverage: false,
  },
  "comparativas-semanales": {
    comparisonLabels: true,
    peticionesTerritorial: false,
    highlightTotal: false,
    centerRowHeader: false,
    wideAverage: false,
  },
  "peticiones-territorial-semanal": {
    comparisonLabels: true,
    peticionesTerritorial: true,
    highlightTotal: true,
    centerRowHeader: false,
    wideAverage: false,
  },
  "volumetrias-semanales": {
    comparisonLabels: true,
    peticionesTerritorial: false,
    highlightTotal: true,
    centerRowHeader: false,
    wideAverage: true,
  },
};

export function semanalLayoutRules(
  layout: SemanalLayout = "standard-semanal"
): SemanalLayoutRules {
  return SEMANAL_LAYOUTS[layout];
}
