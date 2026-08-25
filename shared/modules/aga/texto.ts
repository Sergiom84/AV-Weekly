import type {
  AgaBreakdownRow,
  AgaCount,
  AgaDataset,
  AgaDepartmentBreakdown,
  AgaOfficeSection,
  AgaWeekAggregate,
} from "./types.ts";

/**
 * Plain-text exchange format of the AGA module ("texto plano").
 *
 * The weekly report is assembled outside this app by a colleague who works in
 * Google Drive: he drops the three raw exports (GPS, Gestionado ZPT025 and
 * Office) into a Drive folder and an Apps Script aggregates them. That script
 * writes this format into a tab of the spreadsheet, and the text is pasted or
 * uploaded here.
 *
 * Why a text format and not the three workbooks:
 *
 * - The aggregates become visible and auditable before they reach the deck.
 *   The colleague reads the same numbers he used to read in his pivot tables,
 *   in the same place where he corrects them.
 * - The raw exports name individuals. This format carries counts only, so the
 *   personal data never leaves the Drive folder.
 * - A diff between two weeks is readable, which a workbook never is.
 *
 * The format is deliberately dumb: `#` comments, `[SECCION]` headers and
 * tab-separated rows. It has to be produced by Apps Script and read by a human
 * without a library on either side.
 *
 * Presentation labels are NOT re-derived when this format is read: the Drive
 * script writes the final label ("GAM", "Renove Holding", "Sede") because the
 * mapping tables live in tabs of that spreadsheet, where the colleague owns
 * them. Duplicating those tables here would fork the business rules.
 */

/** First line of the document. The version guards against silent format drift. */
export const AGA_TEXTO_HEADER = "AGA TEXTO PLANO v1";

/**
 * Section headers, in the order the serialiser writes them.
 *
 * Reading does not depend on the order, and every section is optional: a Drive
 * run that only refreshed the GPS emits the first sections and nothing else,
 * and the import merges what it finds instead of blanking the rest.
 */
export const AGA_TEXTO_SECTIONS = {
  /** `semana` `total` — positions in management, one row per week (slide 1.1). */
  weeks: "SEMANAS",
  /** `semana` `departamento` `total` — grouped labels (slides 1.2 and 1.3). */
  weekDepartments: "SEMANAS DEPARTAMENTO",
  /** `semana` `departamento` `total` — labels exactly as the export writes them. */
  weekDepartmentsRaw: "SEMANAS DEPARTAMENTO BRUTO",
  /** `semana` `proyecto` `total` (slide 1.4). */
  weekProjects: "SEMANAS PROYECTO",
  /** `semana` `total` — positions closed in the week (slide 2.1). */
  managed: "GESTIONADAS",
  /** `semana` `departamento` `total` (slide 2.2). */
  managedDepartments: "GESTIONADAS DEPARTAMENTO",
  /** `semana` `producto` `total` (slide 2.3). */
  managedProducts: "GESTIONADAS PRODUCTO",
  /** `semana` `ubicacion` `total` (slide 2.4). */
  managedLocations: "GESTIONADAS UBICACION",
  /** `semana` `total` — located positions before the chart truncates them. */
  managedLocationTotals: "GESTIONADAS UBICACION TOTAL",
  /** `semana` `departamento` `producto` `total` (slides 2.5 to 2.7). */
  managedDepartmentProducts: "GESTIONADAS DEPARTAMENTO PRODUCTO",
  /** `mes` `familia` `total`, `mes` as `YYYY-MM` (slide 2.8). */
  office: "OFFICE",
  /** `anio` `mes` `total`, `mes` as 1 to 12 (slide 3.1). */
  annualRequests: "ANUAL PETICIONES",
  /** `anio` `mes` `total` (slide 3.2). */
  annualPositions: "ANUAL POSICIONES",
} as const;

export type AgaTextoSection = (typeof AGA_TEXTO_SECTIONS)[keyof typeof AGA_TEXTO_SECTIONS];

/** Metadata keys of the preamble, written as `clave<TAB>valor`. */
export const AGA_TEXTO_META = {
  /** Reported extraction date, `YYYY-MM-DD`. Informative: every row carries its own week. */
  week: "semana",
  /** ISO timestamp of the Drive run. */
  generated: "generado",
  /** Source files the run read, separated by `;`. */
  source: "origen",
} as const;

export interface AgaTextoMeta {
  week?: string;
  generated?: string;
  source?: string;
}

/* -------------------------------------------------------------------------- */
/* Serialisation                                                               */
/* -------------------------------------------------------------------------- */

const TAB = "\t";

function line(...cells: (string | number)[]): string {
  return cells.join(TAB);
}

function section(name: AgaTextoSection, rows: string[]): string[] {
  return rows.length === 0 ? [] : ["", `[${name}]`, ...rows];
}

function weekCountRows(rows: AgaBreakdownRow[]): string[] {
  return rows.flatMap((row) =>
    row.counts.map((entry) => line(entry.week, row.label, entry.count))
  );
}

function countRows(week: string, counts: AgaCount[]): string[] {
  return counts.map((entry) => line(week, entry.label, entry.count));
}

function departmentProductRows(breakdowns: AgaDepartmentBreakdown[]): string[] {
  return breakdowns.flatMap((breakdown) =>
    breakdown.rows.flatMap((row) =>
      row.counts.map((entry) =>
        line(entry.week, breakdown.department, row.label, entry.count)
      )
    )
  );
}

/**
 * Office rows.
 *
 * A month a family was not reported on is written as no row at all, not as a
 * zero: the chart has to leave a gap there. `null` and `0` mean different
 * things and the format keeps them apart by omission.
 */
function officeRows(office: AgaOfficeSection | undefined): string[] {
  if (!office) {
    return [];
  }

  return office.families.flatMap((family) =>
    office.months.flatMap((month, index) => {
      const value = family.values[index];

      return value === null || value === undefined ? [] : [line(month, family.label, value)];
    })
  );
}

function annualRows(series: AgaDataset["annual"], key: "peticiones" | "posiciones"): string[] {
  return (series?.[key] ?? []).flatMap((year) =>
    year.values.flatMap((value, index) =>
      value === null || value === undefined ? [] : [line(year.year, index + 1, value)]
    )
  );
}

function sortedWeeks(weeks: AgaWeekAggregate[]): AgaWeekAggregate[] {
  return [...weeks].sort((a, b) => a.week.localeCompare(b.week));
}

/**
 * The dataset as plain text.
 *
 * Exported mostly for the tests and for a future "download what the app holds"
 * action: the Drive script writes this format directly, it does not call this.
 * Keeping a serialiser next to the parser is what makes the round trip
 * testable, which is the only way the two halves stay in agreement.
 */
export function serializeAgaTexto(dataset: AgaDataset, meta: AgaTextoMeta = {}): string {
  const weeks = sortedWeeks(dataset.weeks ?? []);
  const managed = dataset.managed;

  const preamble = [
    AGA_TEXTO_HEADER,
    ...(meta.week ? [line(AGA_TEXTO_META.week, meta.week)] : []),
    ...(meta.generated ? [line(AGA_TEXTO_META.generated, meta.generated)] : []),
    ...(meta.source ? [line(AGA_TEXTO_META.source, meta.source)] : []),
  ];

  const body = [
    ...section(
      AGA_TEXTO_SECTIONS.weeks,
      weeks.map((week) => line(week.week, week.total))
    ),
    ...section(
      AGA_TEXTO_SECTIONS.weekDepartments,
      weeks.flatMap((week) => countRows(week.week, week.byDepartment ?? []))
    ),
    ...section(
      AGA_TEXTO_SECTIONS.weekDepartmentsRaw,
      weeks.flatMap((week) => countRows(week.week, week.byDepartmentRaw ?? []))
    ),
    ...section(
      AGA_TEXTO_SECTIONS.weekProjects,
      weeks.flatMap((week) => countRows(week.week, week.byProject ?? []))
    ),
    ...section(
      AGA_TEXTO_SECTIONS.managed,
      (managed?.weeklyTotals ?? []).map((entry) => line(entry.week, entry.total))
    ),
    ...section(
      AGA_TEXTO_SECTIONS.managedDepartments,
      weekCountRows(managed?.byDepartment ?? [])
    ),
    ...section(AGA_TEXTO_SECTIONS.managedProducts, weekCountRows(managed?.byProduct ?? [])),
    ...section(AGA_TEXTO_SECTIONS.managedLocations, weekCountRows(managed?.byLocation ?? [])),
    ...section(
      AGA_TEXTO_SECTIONS.managedLocationTotals,
      (managed?.locationTotals ?? []).map((entry) => line(entry.week, entry.total))
    ),
    ...section(
      AGA_TEXTO_SECTIONS.managedDepartmentProducts,
      departmentProductRows(managed?.byDepartmentProduct ?? [])
    ),
    ...section(AGA_TEXTO_SECTIONS.office, officeRows(dataset.office)),
    ...section(AGA_TEXTO_SECTIONS.annualRequests, annualRows(dataset.annual, "peticiones")),
    ...section(AGA_TEXTO_SECTIONS.annualPositions, annualRows(dataset.annual, "posiciones")),
  ];

  return [...preamble, ...body, ""].join("\n");
}
