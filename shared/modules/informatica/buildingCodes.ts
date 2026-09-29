import type { InformaticaDataset, InformaticaEdificioRow } from "./types.ts";

/**
 * Opaque building token written into the weekly PLANO text.
 *
 * Street addresses in EDIFICIOS / WORKORDERS / CITAS / IMACS trip the
 * corporate proxy. Data rows carry this code instead; the app expands it
 * against the stored Edificios table and the location master.
 *
 * The key and FNV-1a hash are duplicated in `scripts/informatica-drive/Codigo.gs`
 * (`edificioCodeKey` / `edificioCode`). Change both at once.
 */
const CODE_PREFIX = "E";

export function edificioCodeKey(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function fnv1a32(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  return hash;
}

/** Stable code of a building label, or empty when the label is empty. */
export function edificioCode(name: string): string {
  const key = edificioCodeKey(name);

  return key === "" ? "" : `${CODE_PREFIX}${fnv1a32(key)}`;
}

export function isEdificioCode(value: string): boolean {
  return /^E\d+$/.test(value.trim());
}

/**
 * True for a catalogue entry that is really a comment line of the seed asset.
 *
 * The asset documents its columns as `# Celdas: edificio<TAB>dt<TAB>…`, and
 * that line carries tabs, so an older parser loaded it as a building and it
 * showed up as a zero row on the SmartTech table. A comment is a `#` followed
 * by blank or nothing; `#N/A` is a real label and stays.
 */
export function isEdificioCommentName(value: string): boolean {
  return /^#(\s|$)/.test(String(value ?? "").trim());
}

export function catalogFromEdificios(
  edificios: InformaticaEdificioRow[] | undefined
): string[] {
  const names: string[] = [];

  for (const row of edificios ?? []) {
    if (isEdificioCommentName(row.edificio)) {
      continue;
    }

    names.push(
      row.edificio,
      row.dt,
      row.aliasSmartTech,
      row.aliasWorkOrder,
      row.aliasImacs,
      row.aliasPeticiones
    );
  }

  return names.filter(name => name.trim() !== "");
}

/**
 * First catalog label that hashes to `code`. Empty labels are ignored.
 * Returns the code unchanged when nothing matches, so an unknown site stays
 * visible instead of being silently dropped.
 */
export function expandEdificioCode(code: string, catalog: string[]): string {
  const token = code.trim();

  if (!isEdificioCode(token)) {
    return code;
  }

  for (const name of catalog) {
    if (edificioCode(name) === token) {
      return name;
    }
  }

  return code;
}

function expandField(value: string, catalog: string[]): string {
  return value.trim() === "" ? value : expandEdificioCode(value, catalog);
}

/** Building fields of a dataset, section by section, as the text writes them. */
const CODED_FIELDS: {
  section: keyof InformaticaDataset;
  field: string;
}[] = [
  { section: "incidencias", field: "edificio" },
  { section: "workOrders", field: "edificio" },
  { section: "citas", field: "edificio" },
  { section: "imacs", field: "ciudad" },
];

/**
 * Codes still unexpanded after `resolveInformaticaBuildingCodes`.
 *
 * An unknown code is not a cosmetic defect: `E3361717668` reaches the slide as
 * the name of an office and the report publishes a hash to the bank. The
 * importer refuses the upload on this list rather than storing it, so the
 * failure is visible on the week it happens instead of on the printed deck.
 */
export function unresolvedEdificioCodes(dataset: InformaticaDataset): string[] {
  const found = new Set<string>();

  for (const { section, field } of CODED_FIELDS) {
    const rows = dataset[section] as Record<string, unknown>[] | undefined;

    for (const row of rows ?? []) {
      const value = String(row[field] ?? "");

      if (isEdificioCode(value)) {
        found.add(value.trim());
      }
    }
  }

  return Array.from(found).sort();
}

/** Restores coded building fields on an imported dataset. */
export function resolveInformaticaBuildingCodes(
  dataset: InformaticaDataset,
  catalog: string[]
): InformaticaDataset {
  if (catalog.length === 0) {
    return dataset;
  }

  return {
    ...dataset,
    incidencias: dataset.incidencias?.map(row => ({
      ...row,
      edificio: expandField(row.edificio, catalog),
    })),
    workOrders: dataset.workOrders?.map(row => ({
      ...row,
      edificio: expandField(row.edificio, catalog),
    })),
    citas: dataset.citas?.map(row => ({
      ...row,
      edificio: expandField(row.edificio, catalog),
    })),
    imacs: dataset.imacs?.map(row => ({
      ...row,
      ciudad: expandField(row.ciudad, catalog),
    })),
  };
}
