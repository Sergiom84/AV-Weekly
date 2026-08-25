import {
  AGA_TEXTO_HEADER,
  AGA_TEXTO_META,
  AGA_TEXTO_SECTIONS,
} from "../shared/modules/aga/texto.ts";
import { agaReportingPeriod } from "../shared/modules/aga/calendar.ts";
import type {
  AgaAnnualSection,
  AgaBreakdownRow,
  AgaCount,
  AgaDepartmentBreakdown,
  AgaManagedSection,
  AgaOfficeSection,
  AgaWeekAggregate,
  AgaYearSeries,
} from "../shared/modules/aga/types.ts";

/**
 * Reader of the plain-text export produced by the AGA Drive spreadsheet.
 *
 * See `shared/modules/aga/texto.ts` for the format itself. The rules that
 * matter here:
 *
 * - Labels arrive final. The Drive script owns the mapping tables, so nothing
 *   is renamed, merged or title-cased on the way in. A label this parser did
 *   not expect is a new department, not a defect.
 * - Every section is optional and every section is merged, never replaced
 *   wholesale: a text that only carries `[SEMANAS]` must not erase the managed
 *   or Office sections the dataset already holds.
 * - A malformed row is rejected loudly rather than skipped quietly. The whole
 *   point of the format is that the numbers were already checked in Drive; a
 *   line this parser cannot read means the two halves disagree, and importing
 *   the rest would hide that behind a chart that still draws.
 */

/* -------------------------------------------------------------------------- */
/* Report                                                                      */
/* -------------------------------------------------------------------------- */

export interface AgaTextoSectionReport {
  section: string;
  rows: number;
}

export interface AgaTextoReport {
  /** Sections found, in the order they appear in the document. */
  sections: AgaTextoSectionReport[];
  /** Weeks touched by this text, ascending. */
  weeks: string[];
  /** Months touched by the Office section, ascending. */
  months: string[];
  /** Preamble metadata, as written. */
  meta: { week?: string; generated?: string; source?: string };
  /** Original name of the uploaded file. The route fills it in. */
  file?: string;
}

export interface AgaTextoParseResult {
  weeks: AgaWeekAggregate[];
  managed: AgaManagedSection | null;
  office: AgaOfficeSection | null;
  annual: AgaAnnualSection | null;
  report: AgaTextoReport;
}

/* -------------------------------------------------------------------------- */
/* Cell helpers                                                                */
/* -------------------------------------------------------------------------- */

function text(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^\d{4}-\d{2}$/;

function assertWeek(value: string | undefined, at: number): string {
  const week = text(value);

  if (!ISO_DATE.test(week) || Number.isNaN(Date.parse(`${week}T00:00:00Z`))) {
    throw new Error(
      `Línea ${at}: "${week || "(vacío)"}" no es una fecha de semana válida (formato AAAA-MM-DD).`
    );
  }

  return week;
}

function assertMonth(value: string | undefined, at: number): string {
  const month = text(value);

  if (!ISO_MONTH.test(month) || Number(month.slice(5, 7)) < 1 || Number(month.slice(5, 7)) > 12) {
    throw new Error(
      `Línea ${at}: "${month || "(vacío)"}" no es un mes válido (formato AAAA-MM).`
    );
  }

  return month;
}

/**
 * A count.
 *
 * Thousands separators are accepted because the Drive tab is a spreadsheet and
 * a locale-formatted cell ("1.480") is a plausible accident. A decimal is not:
 * these are row counts, and a fractional one means the wrong cell was copied.
 */
function assertCount(value: string | undefined, at: number): number {
  const raw = text(value).replace(/\./g, "").replace(/\s/g, "");

  if (!/^-?\d+$/.test(raw)) {
    throw new Error(`Línea ${at}: "${text(value) || "(vacío)"}" no es un número entero.`);
  }

  const count = Number(raw);

  if (count < 0) {
    throw new Error(`Línea ${at}: el recuento ${count} es negativo.`);
  }

  return count;
}

function assertLabel(value: string | undefined, at: number, what: string): string {
  const label = text(value);

  if (label === "") {
    throw new Error(`Línea ${at}: falta ${what}.`);
  }

  return label;
}

function assertYear(value: string | undefined, at: number): number {
  const year = assertCount(value, at);

  if (year < 2000 || year > 2100) {
    throw new Error(`Línea ${at}: "${year}" no es un año válido.`);
  }

  return year;
}

function assertMonthNumber(value: string | undefined, at: number): number {
  const month = assertCount(value, at);

  if (month < 1 || month > 12) {
    throw new Error(`Línea ${at}: "${month}" no es un mes válido (1 a 12).`);
  }

  return month;
}

/* -------------------------------------------------------------------------- */
/* Accumulators                                                                */
/* -------------------------------------------------------------------------- */

/** `week -> label -> count`, the shape every breakdown section accumulates into. */
type WeekLabelCounts = Map<string, Map<string, number>>;

function addCount(target: WeekLabelCounts, week: string, label: string, count: number): void {
  let byLabel = target.get(week);

  if (!byLabel) {
    byLabel = new Map();
    target.set(week, byLabel);
  }

  // Repeated (week, label) pairs add up. The Drive script writes one row per
  // pair, but a hand-edited tab may split a label across two lines and summing
  // is the only reading that keeps the bars adding up to the total.
  byLabel.set(label, (byLabel.get(label) ?? 0) + count);
}

/** Counts of one week, descending by count and then alphabetically. */
function toCounts(counts: Map<string, number> | undefined): AgaCount[] {
  return Array.from(counts ?? [], ([label, count]) => ({ label, count })).sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label, "es")
  );
}

/**
 * Breakdown rows across weeks, ordered by the latest week they carry.
 *
 * The same ordering as `parseAgaGestionado`: the deck reads the top of the list
 * as "the top N of this week", so ordering by anything else silently changes
 * which bars the slides show.
 */
function toBreakdownRows(source: WeekLabelCounts): AgaBreakdownRow[] {
  const weeks = Array.from(source.keys()).sort();
  const latestWeek = weeks.at(-1);
  const rows = new Map<string, AgaBreakdownRow>();

  for (const week of weeks) {
    for (const [label, count] of Array.from(source.get(week) ?? new Map<string, number>())) {
      let row = rows.get(label);

      if (!row) {
        row = { label, counts: [] };
        rows.set(label, row);
      }

      row.counts.push({ week, count });
    }
  }

  return Array.from(rows.values()).sort((a, b) => {
    const at = a.counts.find((entry) => entry.week === latestWeek)?.count ?? 0;
    const bt = b.counts.find((entry) => entry.week === latestWeek)?.count ?? 0;

    return bt - at || a.label.localeCompare(b.label, "es");
  });
}

function toWeekTotals(totals: Map<string, number>): { week: string; total: number }[] {
  return Array.from(totals, ([week, total]) => ({ week, total })).sort((a, b) =>
    a.week.localeCompare(b.week)
  );
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

const SECTION_LINE = /^\[(.+)\]$/;

const KNOWN_SECTIONS = new Set<string>(Object.values(AGA_TEXTO_SECTIONS));

export function parseAgaTexto(input: string): AgaTextoParseResult {
  const lines = String(input ?? "").split(/\r\n|\r|\n/);

  const weekTotals = new Map<string, number>();
  const weekDepartments: WeekLabelCounts = new Map();
  const weekDepartmentsRaw: WeekLabelCounts = new Map();
  const weekProjects: WeekLabelCounts = new Map();

  const managedTotals = new Map<string, number>();
  const managedDepartments: WeekLabelCounts = new Map();
  const managedProducts: WeekLabelCounts = new Map();
  const managedLocations: WeekLabelCounts = new Map();
  const managedLocationTotals = new Map<string, number>();
  /** `department -> week -> product -> count`, kept in insertion order. */
  const managedDepartmentProducts = new Map<string, WeekLabelCounts>();

  /** `family -> month -> count`. */
  const officeFamilies = new Map<string, Map<string, number>>();
  const officeMonths = new Set<string>();

  const annualRequests = new Map<number, Map<number, number>>();
  const annualPositions = new Map<number, Map<number, number>>();

  const meta: AgaTextoReport["meta"] = {};
  const sectionRows = new Map<string, number>();
  const sectionOrder: string[] = [];

  let current: string | null = null;
  let sawHeader = false;

  for (let index = 0; index < lines.length; index += 1) {
    const at = index + 1;
    const raw = lines[index];
    const trimmed = raw.trim();

    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }

    if (!sawHeader) {
      if (trimmed.toUpperCase() !== AGA_TEXTO_HEADER.toUpperCase()) {
        throw new Error(
          `El texto no empieza por "${AGA_TEXTO_HEADER}". Copia la pestaña completa de la hoja de Drive, incluida la primera línea.`
        );
      }

      sawHeader = true;
      continue;
    }

    const header = trimmed.match(SECTION_LINE);

    if (header) {
      const name = text(header[1]).toUpperCase();

      if (!KNOWN_SECTIONS.has(name)) {
        throw new Error(
          `Línea ${at}: sección "[${name}]" desconocida. Actualiza la app o revisa el script de Drive.`
        );
      }

      current = name;

      if (!sectionRows.has(name)) {
        sectionRows.set(name, 0);
        sectionOrder.push(name);
      }

      continue;
    }

    const cells = raw.split("\t").map((cell) => text(cell));

    if (current === null) {
      // Still in the preamble: `clave<TAB>valor`.
      const [key, value] = cells;

      if (key === AGA_TEXTO_META.week) meta.week = value;
      else if (key === AGA_TEXTO_META.generated) meta.generated = value;
      else if (key === AGA_TEXTO_META.source) meta.source = value;

      continue;
    }

    switch (current) {
      case AGA_TEXTO_SECTIONS.weeks: {
        const week = assertWeek(cells[0], at);
        weekTotals.set(week, assertCount(cells[1], at));
        break;
      }
      case AGA_TEXTO_SECTIONS.weekDepartments:
        addCount(
          weekDepartments,
          assertWeek(cells[0], at),
          assertLabel(cells[1], at, "el departamento"),
          assertCount(cells[2], at)
        );
        break;
      case AGA_TEXTO_SECTIONS.weekDepartmentsRaw:
        addCount(
          weekDepartmentsRaw,
          assertWeek(cells[0], at),
          assertLabel(cells[1], at, "el departamento"),
          assertCount(cells[2], at)
        );
        break;
      case AGA_TEXTO_SECTIONS.weekProjects:
        addCount(
          weekProjects,
          assertWeek(cells[0], at),
          assertLabel(cells[1], at, "el proyecto"),
          assertCount(cells[2], at)
        );
        break;
      case AGA_TEXTO_SECTIONS.managed: {
        const week = assertWeek(cells[0], at);
        managedTotals.set(week, assertCount(cells[1], at));
        break;
      }
      case AGA_TEXTO_SECTIONS.managedDepartments:
        addCount(
          managedDepartments,
          assertWeek(cells[0], at),
          assertLabel(cells[1], at, "el departamento"),
          assertCount(cells[2], at)
        );
        break;
      case AGA_TEXTO_SECTIONS.managedProducts:
        addCount(
          managedProducts,
          assertWeek(cells[0], at),
          assertLabel(cells[1], at, "el producto"),
          assertCount(cells[2], at)
        );
        break;
      case AGA_TEXTO_SECTIONS.managedLocations:
        addCount(
          managedLocations,
          assertWeek(cells[0], at),
          assertLabel(cells[1], at, "la ubicación"),
          assertCount(cells[2], at)
        );
        break;
      case AGA_TEXTO_SECTIONS.managedLocationTotals: {
        const week = assertWeek(cells[0], at);
        managedLocationTotals.set(week, assertCount(cells[1], at));
        break;
      }
      case AGA_TEXTO_SECTIONS.managedDepartmentProducts: {
        const week = assertWeek(cells[0], at);
        const department = assertLabel(cells[1], at, "el departamento");
        const product = assertLabel(cells[2], at, "el producto");
        let byWeek = managedDepartmentProducts.get(department);

        if (!byWeek) {
          byWeek = new Map();
          managedDepartmentProducts.set(department, byWeek);
        }

        addCount(byWeek, week, product, assertCount(cells[3], at));
        break;
      }
      case AGA_TEXTO_SECTIONS.office: {
        const month = assertMonth(cells[0], at);
        const family = assertLabel(cells[1], at, "la familia de producto");
        const count = assertCount(cells[2], at);
        let byMonth = officeFamilies.get(family);

        if (!byMonth) {
          byMonth = new Map();
          officeFamilies.set(family, byMonth);
        }

        byMonth.set(month, (byMonth.get(month) ?? 0) + count);
        officeMonths.add(month);
        break;
      }
      case AGA_TEXTO_SECTIONS.annualRequests:
      case AGA_TEXTO_SECTIONS.annualPositions: {
        const target =
          current === AGA_TEXTO_SECTIONS.annualRequests ? annualRequests : annualPositions;
        const year = assertYear(cells[0], at);
        const month = assertMonthNumber(cells[1], at);
        let byMonth = target.get(year);

        if (!byMonth) {
          byMonth = new Map();
          target.set(year, byMonth);
        }

        byMonth.set(month, assertCount(cells[2], at));
        break;
      }
      default:
        break;
    }

    sectionRows.set(current, (sectionRows.get(current) ?? 0) + 1);
  }

  if (!sawHeader) {
    throw new Error(
      `El texto está vacío. Copia la pestaña completa de la hoja de Drive, empezando por "${AGA_TEXTO_HEADER}".`
    );
  }

  if (sectionOrder.length === 0) {
    throw new Error(
      "El texto no trae ninguna sección. Comprueba que el script de Drive terminó de escribir la pestaña."
    );
  }

  /* Section 1 ------------------------------------------------------------- */

  // A week is created by any of the four section-1 sections, not only by
  // `[SEMANAS]`: a text that carries the breakdowns but lost its total row
  // should still import, with the total taken from the departments, rather
  // than dropping the week.
  const weekKeys = new Set<string>([
    ...Array.from(weekTotals.keys()),
    ...Array.from(weekDepartments.keys()),
    ...Array.from(weekDepartmentsRaw.keys()),
    ...Array.from(weekProjects.keys()),
  ]);

  const weeks: AgaWeekAggregate[] = Array.from(weekKeys)
    .sort()
    .map((week) => {
      const byDepartment = toCounts(weekDepartments.get(week));
      const declared = weekTotals.get(week);
      const total =
        declared ?? byDepartment.reduce((sum, entry) => sum + entry.count, 0);

      return {
        week,
        reportWeek: agaReportingPeriod(week)?.week,
        total,
        byDepartment,
        byDepartmentRaw: toCounts(weekDepartmentsRaw.get(week) ?? weekDepartments.get(week)),
        byProject: toCounts(weekProjects.get(week)),
      };
    });

  /* Section 2 ------------------------------------------------------------- */

  const hasManaged =
    managedTotals.size > 0 ||
    managedDepartments.size > 0 ||
    managedProducts.size > 0 ||
    managedLocations.size > 0 ||
    managedDepartmentProducts.size > 0;

  const byDepartmentProduct: AgaDepartmentBreakdown[] = Array.from(
    managedDepartmentProducts,
    ([department, counts]) => ({ department, rows: toBreakdownRows(counts) })
  );

  const managed: AgaManagedSection | null = hasManaged
    ? {
        weeklyTotals: toWeekTotals(managedTotals),
        byDepartment: toBreakdownRows(managedDepartments),
        byProduct: toBreakdownRows(managedProducts),
        byLocation: toBreakdownRows(managedLocations),
        ...(managedLocationTotals.size > 0
          ? { locationTotals: toWeekTotals(managedLocationTotals) }
          : {}),
        byDepartmentProduct,
      }
    : null;

  /* Office ---------------------------------------------------------------- */

  const months = Array.from(officeMonths).sort();
  const office: AgaOfficeSection | null =
    officeFamilies.size > 0
      ? {
          months,
          families: Array.from(officeFamilies, ([label, byMonth]) => ({
            label,
            // `null`, not `0`: a family with no row for a month was not
            // measured, and the chart has to leave a gap instead of drawing a
            // zero that reads as "none requested".
            values: months.map((month) => byMonth.get(month) ?? null),
          })),
        }
      : null;

  /* Section 3 ------------------------------------------------------------- */

  function toYearSeries(source: Map<number, Map<number, number>>): AgaYearSeries[] {
    return Array.from(source, ([year, byMonth]) => ({
      year,
      values: Array.from({ length: 12 }, (_, index) => byMonth.get(index + 1) ?? null),
    })).sort((a, b) => a.year - b.year);
  }

  const annual: AgaAnnualSection | null =
    annualRequests.size > 0 || annualPositions.size > 0
      ? {
          peticiones: toYearSeries(annualRequests),
          posiciones: toYearSeries(annualPositions),
        }
      : null;

  const touchedWeeks = new Set<string>([
    ...Array.from(weekKeys),
    ...Array.from(managedTotals.keys()),
    ...Array.from(managedDepartments.keys()),
    ...Array.from(managedProducts.keys()),
    ...Array.from(managedLocations.keys()),
  ]);

  return {
    weeks,
    managed,
    office,
    annual,
    report: {
      sections: sectionOrder.map((name) => ({
        section: name,
        rows: sectionRows.get(name) ?? 0,
      })),
      weeks: Array.from(touchedWeeks).sort(),
      months,
      meta,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Annual merge                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Folds an annual series into the stored one.
 *
 * Month by month rather than year by year: the current year arrives with the
 * months after today still empty, and replacing the whole year would wipe the
 * months a previous, more complete upload had already filled. A `null` in the
 * incoming series therefore means "no news", not "clear it".
 */
function mergeYearSeries(
  existing: AgaYearSeries[] | undefined,
  incoming: AgaYearSeries[] | undefined
): AgaYearSeries[] {
  const byYear = new Map<number, (number | null)[]>();

  for (const series of [...(existing ?? []), ...(incoming ?? [])]) {
    const values = byYear.get(series.year) ?? Array.from({ length: 12 }, () => null);

    series.values.forEach((value, index) => {
      if (value !== null && value !== undefined) {
        values[index] = value;
      }
    });

    byYear.set(series.year, values);
  }

  return Array.from(byYear, ([year, values]) => ({ year, values })).sort(
    (a, b) => a.year - b.year
  );
}

export function mergeAgaAnnualSection(
  existing: AgaAnnualSection | undefined,
  incoming: AgaAnnualSection
): AgaAnnualSection {
  return {
    peticiones: mergeYearSeries(existing?.peticiones, incoming.peticiones),
    posiciones: mergeYearSeries(existing?.posiciones, incoming.posiciones),
    ...(incoming.source ? { source: incoming.source } : existing?.source ? { source: existing.source } : {}),
  };
}
