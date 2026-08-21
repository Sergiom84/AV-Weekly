import * as XLSX from "xlsx";
import type {
  AgaBreakdownRow,
  AgaDepartmentBreakdown,
  AgaManagedSection,
  AgaWeekCount,
} from "../shared/modules/aga/types.ts";

const REQUIRED_COLUMNS = [
  "Nº Petición de sistemas",
  "Denominación Departamento",
  "Denominación Producto",
  "Fecha Gestionado",
  "Denominación Edificio",
] as const;

const DETAIL_DEPARTMENTS = [
  { source: "GAM (GESTION APROVISIONAMIENTO MICRO)", label: "GAM" },
  { source: "PORTATILES PLATAFORMA", label: "Plataforma Portátiles" },
  { source: "ALMACEN", label: "Almacén" },
] as const;

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

export interface AgaGestionadoSheetReport {
  sheet: string;
  recognised: boolean;
  rows: number;
  skipped: number;
  missingColumns: string[];
  weeks: string[];
}

export interface AgaGestionadoUnknownLocation {
  building: string;
  count: number;
}

export interface AgaGestionadoReport {
  sheets: AgaGestionadoSheetReport[];
  sheetsFound: string[];
  weeks: string[];
  totals: Record<string, number>;
  unknownLocations: AgaGestionadoUnknownLocation[];
}

export interface AgaGestionadoParseResult {
  managed: AgaManagedSection;
  report: AgaGestionadoReport;
}

interface WeekBuilder {
  total: number;
  departments: Map<string, number>;
  products: Map<string, number>;
  locations: Map<string, number>;
  departmentProducts: Map<string, Map<string, number>>;
}

function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function text(value: unknown): string {
  return value === null || value === undefined
    ? ""
    : String(value).replace(/\s+/g, " ").trim();
}

function headerIndex(header: unknown[]): Map<string, number> {
  const result = new Map<string, number>();

  header.forEach((cell, index) => {
    const key = normalize(cell);

    if (key && !result.has(key)) {
      result.set(key, index);
    }
  });

  return result;
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateParts(value: unknown): [number, number, number] | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : [value.getFullYear(), value.getMonth() + 1, value.getDate()];
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) {
      return null;
    }

    const date = new Date(EXCEL_EPOCH + Math.round(value) * 86400000);

    return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
  }

  const raw = text(value);
  const iso = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);

  if (iso) {
    return [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  }

  const dmy = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);

  if (dmy) {
    return [Number(dmy[3]), Number(dmy[2]), Number(dmy[1])];
  }

  const serial = Number(raw);

  return Number.isFinite(serial) && serial > 0 ? dateParts(serial) : null;
}

/** Monday immediately following the work week that contains `Fecha Gestionado`. */
export function managedWeekKey(value: unknown): string | null {
  const parts = dateParts(value);

  if (!parts) {
    return null;
  }

  const [year, month, day] = parts;
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  const dayOfWeek = date.getUTCDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;

  date.setUTCDate(date.getUTCDate() - daysSinceMonday + 7);

  return isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function newWeekBuilder(): WeekBuilder {
  return {
    total: 0,
    departments: new Map(),
    products: new Map(),
    locations: new Map(),
    departmentProducts: new Map(
      DETAIL_DEPARTMENTS.map(({ source }) => [normalize(source), new Map<string, number>()])
    ),
  };
}

function bump(counts: Map<string, number>, label: string): void {
  counts.set(label, (counts.get(label) ?? 0) + 1);
}

function departmentLabel(raw: string): string {
  const key = normalize(raw);
  const detail = DETAIL_DEPARTMENTS.find((entry) => normalize(entry.source) === key);

  if (key === "ADMINISTRACION RED LOCAL") {
    return "Administración de Red Local";
  }

  // Section 2.2 historically uses this order, while the dedicated section
  // 2.6 is titled "Plataforma Portátiles". Keep both contracts stable.
  if (key === "PORTATILES PLATAFORMA") {
    return "Portatiles Plataforma";
  }

  return detail?.label ?? (raw || "Sin departamento");
}

function locationLookup(mapping: Record<string, string>): Map<string, string> {
  const result = new Map<string, string>();

  for (const [building, location] of Object.entries(mapping ?? {})) {
    const key = normalize(building);
    const label = text(location);

    if (key && label) {
      result.set(key, label);
    }
  }

  return result;
}

function addWeekCount(row: AgaBreakdownRow, week: string, count: number): void {
  row.counts.push({ week, count });
}

function breakdownRows(
  builders: Map<string, WeekBuilder>,
  readCounts: (builder: WeekBuilder) => Map<string, number>
): AgaBreakdownRow[] {
  const rows = new Map<string, AgaBreakdownRow>();

  for (const [week, builder] of Array.from(builders).sort(([a], [b]) => a.localeCompare(b))) {
    for (const [label, count] of Array.from(readCounts(builder))) {
      let row = rows.get(label);

      if (!row) {
        row = { label, counts: [] };
        rows.set(label, row);
      }

      addWeekCount(row, week, count);
    }
  }

  const latestWeek = Array.from(builders.keys()).sort().at(-1);

  return Array.from(rows.values()).sort((a, b) => {
    const at = a.counts.find((entry) => entry.week === latestWeek)?.count ?? 0;
    const bt = b.counts.find((entry) => entry.week === latestWeek)?.count ?? 0;

    return bt - at || a.label.localeCompare(b.label, "es");
  });
}

function departmentProductRows(
  builders: Map<string, WeekBuilder>
): AgaDepartmentBreakdown[] {
  return DETAIL_DEPARTMENTS.map(({ source, label }) => ({
    department: label,
    rows: breakdownRows(
      builders,
      (builder) => builder.departmentProducts.get(normalize(source)) ?? new Map()
    ),
  }));
}

export function parseAgaGestionadoWorkbook(
  workbook: XLSX.WorkBook,
  buildingLocations: Record<string, string> = {}
): AgaGestionadoParseResult {
  if (!workbook || !Array.isArray(workbook.SheetNames)) {
    throw new Error("El fichero enviado no es un libro de Excel válido.");
  }

  const locations = locationLookup(buildingLocations);
  const builders = new Map<string, WeekBuilder>();
  const unknownLocations = new Map<string, number>();
  const sheets: AgaGestionadoSheetReport[] = [];
  const sheetsFound: string[] = [];

  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];

    if (!sheet) {
      continue;
    }

    const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: null,
      blankrows: false,
      raw: true,
    });
    const columns = headerIndex((grid[0] ?? []) as unknown[]);
    const missingColumns = REQUIRED_COLUMNS.filter((column) => !columns.has(normalize(column)));

    if (missingColumns.length > 0) {
      sheets.push({
        sheet: name,
        recognised: false,
        rows: 0,
        skipped: 0,
        missingColumns: [...missingColumns],
        weeks: [],
      });
      continue;
    }

    const requestAt = columns.get(normalize("Nº Petición de sistemas"))!;
    const departmentAt = columns.get(normalize("Denominación Departamento"))!;
    const productAt = columns.get(normalize("Denominación Producto"))!;
    const dateAt = columns.get(normalize("Fecha Gestionado"))!;
    const buildingAt = columns.get(normalize("Denominación Edificio"))!;
    const sheetWeeks = new Set<string>();
    let rows = 0;
    let skipped = 0;

    for (const cells of grid.slice(1)) {
      const row = (cells ?? []) as unknown[];
      const request = text(row[requestAt]);

      if (!request) {
        if (row.some((cell) => cell !== null && cell !== undefined && text(cell) !== "")) {
          skipped += 1;
        }
        continue;
      }

      const week = managedWeekKey(row[dateAt]);

      if (!week) {
        skipped += 1;
        continue;
      }

      let builder = builders.get(week);

      if (!builder) {
        builder = newWeekBuilder();
        builders.set(week, builder);
      }

      const rawDepartment = text(row[departmentAt]);
      const department = departmentLabel(rawDepartment);
      const product = text(row[productAt]) || "Sin producto";
      const building = text(row[buildingAt]);
      const location = locations.get(normalize(building)) ?? "Sin clasificar";

      builder.total += 1;
      bump(builder.departments, department);
      bump(builder.products, product);
      bump(builder.locations, location);

      const detail = builder.departmentProducts.get(normalize(rawDepartment));
      if (detail) {
        bump(detail, product);
      }

      if (location === "Sin clasificar") {
        const unknown = building || "Sin edificio";
        unknownLocations.set(unknown, (unknownLocations.get(unknown) ?? 0) + 1);
      }

      sheetWeeks.add(week);
      rows += 1;
    }

    sheetsFound.push(name);
    sheets.push({
      sheet: name,
      recognised: true,
      rows,
      skipped,
      missingColumns: [],
      weeks: Array.from(sheetWeeks).sort(),
    });
  }

  if (sheetsFound.length === 0) {
    throw new Error(
      "El libro no trae una hoja con las cabeceras del export Gestionado de ZPT025."
    );
  }

  const weeklyTotals = Array.from(builders)
    .map(([week, builder]) => ({ week, total: builder.total }))
    .sort((a, b) => a.week.localeCompare(b.week));
  const managed: AgaManagedSection = {
    weeklyTotals,
    byDepartment: breakdownRows(builders, (builder) => builder.departments),
    byProduct: breakdownRows(builders, (builder) => builder.products),
    byLocation: breakdownRows(builders, (builder) => builder.locations),
    locationTotals: weeklyTotals.map(({ week, total }) => ({ week, total })),
    byDepartmentProduct: departmentProductRows(builders),
  };

  return {
    managed,
    report: {
      sheets,
      sheetsFound,
      weeks: weeklyTotals.map((entry) => entry.week),
      totals: Object.fromEntries(weeklyTotals.map((entry) => [entry.week, entry.total])),
      unknownLocations: Array.from(unknownLocations)
        .map(([building, count]) => ({ building, count }))
        .sort((a, b) => b.count - a.count || a.building.localeCompare(b.building, "es")),
    },
  };
}

function mergeWeekCounts(
  existing: AgaWeekCount[],
  incoming: AgaWeekCount[],
  incomingWeeks: Set<string>
): AgaWeekCount[] {
  const counts = new Map<string, number>();

  for (const entry of existing ?? []) {
    if (!incomingWeeks.has(entry.week)) {
      counts.set(entry.week, entry.count);
    }
  }
  for (const entry of incoming ?? []) {
    counts.set(entry.week, entry.count);
  }

  return Array.from(counts).map(([week, count]) => ({ week, count })).sort((a, b) =>
    a.week.localeCompare(b.week)
  );
}

function mergeRows(
  existing: AgaBreakdownRow[],
  incoming: AgaBreakdownRow[],
  incomingWeeks: Set<string>
): AgaBreakdownRow[] {
  const rows = new Map<string, AgaBreakdownRow>();

  for (const row of existing ?? []) {
    const counts = mergeWeekCounts(row.counts, [], incomingWeeks);
    if (counts.length > 0) {
      rows.set(normalize(row.label), { label: row.label, counts });
    }
  }
  for (const row of incoming ?? []) {
    const key = normalize(row.label);
    const previous = rows.get(key);
    rows.set(key, {
      // Preserve the established deck label when the raw export only differs
      // in casing or accents (for example GSAM/Gsam and product names).
      label: previous?.label ?? row.label,
      counts: mergeWeekCounts(previous?.counts ?? [], row.counts, incomingWeeks),
    });
  }

  return Array.from(rows.values()).sort((a, b) => a.label.localeCompare(b.label, "es"));
}

function mergeTotals<T extends { week: string }>(
  existing: T[],
  incoming: T[],
  incomingWeeks: Set<string>
): T[] {
  const totals = new Map<string, T>();

  for (const entry of existing ?? []) {
    if (!incomingWeeks.has(entry.week)) {
      totals.set(entry.week, entry);
    }
  }
  for (const entry of incoming ?? []) {
    totals.set(entry.week, entry);
  }

  return Array.from(totals.values()).sort((a, b) => a.week.localeCompare(b.week));
}

/** Replaces only the weeks carried by the incoming managed export. */
export function mergeAgaManagedSection(
  existing: AgaManagedSection | undefined,
  incoming: AgaManagedSection
): AgaManagedSection {
  const incomingWeeks = new Set(incoming.weeklyTotals.map((entry) => entry.week));
  const departments = new Map<string, AgaDepartmentBreakdown>();

  for (const entry of existing?.byDepartmentProduct ?? []) {
    departments.set(entry.department, {
      department: entry.department,
      rows: mergeRows(entry.rows, [], incomingWeeks),
    });
  }
  for (const entry of incoming.byDepartmentProduct ?? []) {
    departments.set(entry.department, {
      department: entry.department,
      rows: mergeRows(departments.get(entry.department)?.rows ?? [], entry.rows, incomingWeeks),
    });
  }

  return {
    weeklyTotals: mergeTotals(existing?.weeklyTotals ?? [], incoming.weeklyTotals, incomingWeeks),
    byDepartment: mergeRows(existing?.byDepartment ?? [], incoming.byDepartment, incomingWeeks),
    byProduct: mergeRows(existing?.byProduct ?? [], incoming.byProduct, incomingWeeks),
    byLocation: mergeRows(existing?.byLocation ?? [], incoming.byLocation, incomingWeeks),
    locationTotals: mergeTotals(
      existing?.locationTotals ?? [],
      incoming.locationTotals ?? [],
      incomingWeeks
    ),
    byDepartmentProduct: Array.from(departments.values()),
    source: incoming.source ?? existing?.source,
  };
}
