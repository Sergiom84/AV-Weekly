/** One authoritative row imported from the Edificios master workbook. */
export interface BuildingLocationMasterRow {
  building: string;
  location: string;
}

/** Alias learned from a source row whose address already matched the master. */
export interface BuildingLocationAliasRow {
  alias: string;
  location: string;
}

/** Minimal contract converters use without depending on the database layer. */
export interface BuildingLocationMatcher {
  /** Returns a location only when the supplied value has one unambiguous match. */
  resolve(...values: string[]): string | null;
  /** Records an alias only when the evidence resolves unambiguously. */
  observe(alias: string, ...evidence: string[]): string | null;
}

export interface BuildingLocationUnknown {
  building: string;
  rows: number;
}

/** Building normalisation appended to Informatica's upload report. */
export interface BuildingLocationImportReport {
  masterRows: number;
  matchedRows: number;
  unchangedRows: number;
  unknown: BuildingLocationUnknown[];
}
