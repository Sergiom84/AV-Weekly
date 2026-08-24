import type {
  BuildingLocationImportReport,
  BuildingLocationAliasRow,
  BuildingLocationMasterRow,
  BuildingLocationMatcher,
} from "../shared/building-locations.ts";
import type { InformaticaDataset } from "../shared/modules/informatica/types.ts";

/** Stable comparison key: accents and punctuation never decide a match. */
export function buildingLookupKey(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/**
 * Address signature shared by source labels such as `CASTELLANA, 81` and the
 * master row `MADRID-PASEO DE LA CASTELLANA, 81,`.
 *
 * It is deliberately not fuzzy: the street words and number must be equal.
 * City prefixes and street-type abbreviations are the only discarded tokens.
 */
function addressKeys(value: string): string[] {
  let source = String(value ?? "").trim();

  // Unit/building suffixes are not part of the postal address.
  source = source.replace(/\s+-\s+(?:EDIF(?:ICIO)?|PLANTA|BLOQUE)\b.*$/i, "");

  const firstHyphen = source.indexOf("-");
  const beforeHyphen = firstHyphen < 0 ? "" : source.slice(0, firstHyphen);

  // Master rows normally begin with a city and a hyphen. Do not mistake a
  // street-number range (61-63) for that separator.
  if (firstHyphen >= 0 && !/\d/.test(beforeHyphen)) {
    source = source.slice(firstHyphen + 1);
  }

  const pieces = source.split("/");
  const keys = new Set<string>();

  for (const piece of pieces) {
    const tokens = buildingLookupKey(piece)
      .split(" ")
      .filter(Boolean)
      .filter(
        token =>
          !new Set([
            "C",
            "CL",
            "CALLE",
            "AV",
            "AVDA",
            "AVENIDA",
            "P",
            "PS",
            "PASEO",
            "PZA",
            "PL",
            "PLAZA",
            "CTRA",
            "CARRETERA",
            "DE",
            "DEL",
            "LA",
            "LAS",
            "EL",
            "LOS",
          ]).has(token)
      );

    const hasNumber = tokens.some(token => /\d/.test(token));
    const hasName = tokens.some(
      token => /[A-Z]/.test(token) && token.length >= 3
    );

    if (hasNumber && hasName) {
      keys.add(tokens.join(" "));
    }
  }

  return Array.from(keys);
}

/** Writes a value into a lookup, marking conflicting keys as unusable. */
function addUnique(
  map: Map<string, string | null>,
  key: string,
  location: string
): void {
  if (!key) {
    return;
  }

  const current = map.get(key);

  if (current === undefined) {
    map.set(key, location);
  } else if (buildingLookupKey(current) !== buildingLookupKey(location)) {
    map.set(key, null);
  }
}

export class BuildingLocationResolver implements BuildingLocationMatcher {
  private readonly exact = new Map<string, string | null>();
  private readonly address = new Map<string, string | null>();
  private readonly observed = new Map<string, string | null>();
  private readonly observedSource = new Map<string, string>();
  readonly masterRows: number;

  constructor(
    rows: readonly BuildingLocationMasterRow[],
    aliases: readonly BuildingLocationAliasRow[] = []
  ) {
    this.masterRows = rows.length;

    for (const row of rows) {
      const building = String(row.building ?? "").trim();
      const location = String(row.location ?? "").trim();

      if (!building || !location) {
        continue;
      }

      addUnique(this.exact, buildingLookupKey(building), location);
      // A canonical output remains canonical if a converted workbook is
      // normalised a second time.
      addUnique(this.exact, buildingLookupKey(location), location);

      for (const key of addressKeys(building)) {
        addUnique(this.address, key, location);
      }
    }

    for (const row of aliases) {
      const alias = String(row.alias ?? "").trim();
      const location = String(row.location ?? "").trim();

      if (alias && location) {
        const key = buildingLookupKey(alias);
        addUnique(this.observed, key, location);
        this.observedSource.set(key, alias);
      }
    }
  }

  resolve(...values: string[]): string | null {
    for (const value of values) {
      const key = buildingLookupKey(value);

      if (this.observed.has(key)) {
        return this.observed.get(key) ?? null;
      }

      if (this.exact.has(key)) {
        return this.exact.get(key) ?? null;
      }

      for (const key of addressKeys(value)) {
        const location = this.address.get(key);

        if (location) {
          return location;
        }
      }
    }

    return null;
  }

  observe(alias: string, ...evidence: string[]): string | null {
    const location = this.resolve(...evidence);
    const key = buildingLookupKey(alias);

    if (location && key) {
      addUnique(this.observed, key, location);
      this.observedSource.set(key, alias.trim());
    }

    return location;
  }

  learnedAliases(): BuildingLocationAliasRow[] {
    return Array.from(this.observed)
      .filter(
        (entry): entry is [string, string] => typeof entry[1] === "string"
      )
      .map(([key, location]) => ({
        alias: this.observedSource.get(key) ?? key,
        location,
      }));
  }
}

/**
 * Applies the master to every Informatica section that actually stores a
 * building dimension. Other modules keep their own approved semantics: AGA
 * already has a guarded location map, Oficinas reports DTs, and AV uploads do
 * not retain a source address capable of proving a master match.
 */
export function normalizeInformaticaBuildingLocations(
  dataset: InformaticaDataset,
  resolver: BuildingLocationResolver
): { dataset: InformaticaDataset; report: BuildingLocationImportReport } {
  let matchedRows = 0;
  let unchangedRows = 0;
  const unknown = new Map<string, number>();

  const normalizeRows = <T extends { edificio: string }>(
    rows: T[] | undefined
  ): T[] | undefined =>
    rows?.map(row => {
      const location = resolver.resolve(row.edificio);

      if (location) {
        matchedRows += 1;
        return { ...row, edificio: location };
      }

      unchangedRows += 1;
      const label = row.edificio.trim() || "Sin edificio";
      unknown.set(label, (unknown.get(label) ?? 0) + 1);
      return row;
    });

  return {
    dataset: {
      ...dataset,
      incidencias: normalizeRows(dataset.incidencias),
      workOrders: normalizeRows(dataset.workOrders),
      citas: normalizeRows(dataset.citas),
    },
    report: {
      masterRows: resolver.masterRows,
      matchedRows,
      unchangedRows,
      unknown: Array.from(unknown)
        .map(([building, rows]) => ({ building, rows }))
        .sort(
          (a, b) =>
            b.rows - a.rows || a.building.localeCompare(b.building, "es")
        ),
    },
  };
}
