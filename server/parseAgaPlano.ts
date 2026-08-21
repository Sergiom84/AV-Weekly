import * as XLSX from "xlsx";
import {
  AGA_HEADER_ROW,
  AGA_REQUIRED_COLUMNS,
  type AgaCount,
  type AgaDataset,
  type AgaWeekAggregate,
} from "../shared/modules/aga/types.ts";
import { agaReportingPeriod } from "../shared/modules/aga/calendar.ts";

/**
 * Parser for the weekly GPS export of the AGA module.
 *
 * Two things make it different from `parseInformaticaPlano.ts`:
 *
 * - Sheets are found by their header row, not by name. The export is produced
 *   by hand and the tabs get renamed every week, so matching on "Semana
 *   anterior" would break the import the first time somebody types "S33".
 * - Only aggregates leave this module. The raw rows carry the assignee and the
 *   project description; the report never shows them, so they are counted and
 *   dropped rather than stored.
 *
 * The same workbook mixes column types between sheets — the position number is
 * `"  001"` on one tab and `1` on the next, the week is an Excel serial on one
 * and a `Date` on another. Every read normalises, so the two tabs of the same
 * file produce comparable aggregates.
 */

/* -------------------------------------------------------------------------- */
/* Import report                                                               */
/* -------------------------------------------------------------------------- */

/** What happened with one sheet of the workbook. */
export interface AgaSheetReport {
  /** Sheet name as written in the workbook. */
  sheet: string;
  /** Whether the header row carried the required columns. */
  recognised: boolean;
  /** Data rows read. */
  rows: number;
  /** Rows with content that carried no request number and were discarded. */
  skipped: number;
  /** Required columns missing from the header row. Only filled when not recognised. */
  missingColumns: string[];
  /** Weeks found in the sheet, `YYYY-MM-DD`, ascending. */
  weeks: string[];
}

export interface AgaImportReport {
  sheets: AgaSheetReport[];
  /** Names of the recognised sheets, in workbook order. */
  sheetsFound: string[];
  /** Weeks read from this upload, ascending. */
  weeks: string[];
  /** Total rows per week read from this upload. */
  totals: Record<string, number>;
  /** Original name of the uploaded file. The route fills it in. */
  file?: string;
}

export interface AgaParseResult {
  /** Weeks of this upload only. The route merges them with the stored history. */
  weeks: AgaWeekAggregate[];
  report: AgaImportReport;
}

/* -------------------------------------------------------------------------- */
/* Text helpers                                                                */
/* -------------------------------------------------------------------------- */

/** NFD, no combining marks, single spaces, trimmed, upper. */
function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** Trimmed text of a cell, collapsing the padding the export adds ("  001"). */
function text(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).replace(/\s+/g, " ").trim();
}

/**
 * Normalises the padded numeric codes of the export: `"  001"` and `1` are the
 * same position, `" 008"` and `8` the same circuit step — the two tabs of the
 * same file disagree on the type. Null when the cell carries no number.
 *
 * Exported rather than used here: the aggregates do not break down by position
 * or step, so nothing in this parser reads those columns yet. It is the
 * normalisation any consumer of them must apply.
 */
export function toInteger(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value) : null;
  }

  const raw = text(value);

  if (raw === "") {
    return null;
  }

  const parsed = Number(raw);

  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/**
 * Reads the `semana` cell into `YYYY-MM-DD`.
 *
 * The export writes an Excel serial. `xlsx` hands it over as a number when read
 * raw, and as a local-time `Date` when read with `cellDates`, in which case the
 * UTC components are shifted by the timezone offset — hence the local getters:
 * the serial 46244 becomes `2026-08-09T22:00Z` in Madrid but is still the tenth.
 */
function parseWeekCell(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : isoDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) {
      return null;
    }

    const date = new Date(EXCEL_EPOCH + Math.round(value) * 86400000);

    return isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }

  const raw = text(value);

  if (raw === "") {
    return null;
  }

  const iso = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);

  if (iso) {
    return isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const dmy = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);

  if (dmy) {
    return isoDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  }

  const serial = Number(raw);

  return Number.isFinite(serial) && serial > 0 ? parseWeekCell(serial) : null;
}

function isoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/* -------------------------------------------------------------------------- */
/* Presentation grouping                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Departments renamed for the slides.
 *
 * The export writes the internal name in upper case with the full parenthesised
 * description; the deck shows a short, cased label. Keys are normalised, so
 * accents and casing in the source do not matter.
 */
const DEPARTMENT_LABELS: Record<string, string> = {
  "GAM (GESTION APROVISIONAMIENTO MICRO)": "GAM",
  GAM: "GAM",
  "PORTATILES PLATAFORMA": "Plataforma Portátiles",
  "ADMINISTRACION RED LOCAL": "Adm. Red Local",
  ALMACEN: "Almacén",
  "SOPORTE VIP": "Soporte VIP",
  TODOMOVIL: "TodoMóvil",
  "HOMOLOGACIONES SOFTWARE": "Homologaciones Software",
  "TEI AUDIOVISUALES": "TEI Audiovisuales",
  GSAM: "GSAM",
};

/** Departments kept verbatim: acronyms and system codes, not words to case. */
const DEPARTMENT_VERBATIM = new Set(["GSAM", "GAM"]);

/**
 * Every regional support desk collapses into one bar.
 *
 * The prefix is matched rather than a fixed list of cities on purpose: the
 * export ships new ones without warning (Asturias and Valladolid appear in some
 * weeks and not in others) and a fixed list would silently split the bar.
 * "SOPORTE VIP" is not a regional desk, so the space after the prefix matters.
 */
function isRegionalSupport(normalised: string): boolean {
  return normalised === "SOPORTE TECNICO" || normalised.startsWith("SOPORTE TECNICO ");
}

/**
 * Title case of a word, leaving acronyms and system codes alone.
 *
 * A short all-caps token ("CGR", "AM", "VIP") is an acronym, not a word to
 * case; anything carrying a digit or an underscore is a system code
 * ("BBVA_SPAIN_SD_JAMF") and is left exactly as the export wrote it.
 */
function titleCaseWord(word: string): string {
  if (/[0-9_]/.test(word)) {
    return word;
  }

  if (word.length <= 5 && word === word.toUpperCase()) {
    return word;
  }

  return word.charAt(0) + word.slice(1).toLowerCase();
}

/**
 * Presentation label of a department.
 *
 * Falls back to a reasonable capitalisation instead of hiding the row: an
 * unmapped department is real data, and dropping it would make the bars stop
 * adding up to the reported total.
 */
export function departmentLabel(raw: string): string {
  const key = normalize(raw);

  if (key === "") {
    return "Sin departamento";
  }

  if (isRegionalSupport(key)) {
    return "Soporte Técnico";
  }

  const mapped = DEPARTMENT_LABELS[key];

  if (mapped) {
    return mapped;
  }

  if (DEPARTMENT_VERBATIM.has(key) || !/[A-Z]/.test(raw)) {
    return raw.trim();
  }

  // Original accents are preserved: the casing comes from the source string,
  // not from the accent-stripped key used for matching.
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map(titleCaseWord)
    .join(" ");
}

/**
 * Presentation label of a project. Null excludes the row from the breakdown.
 *
 * `HOLDINGREN` and `RENOVEHOLD` are two codes of the same campaign and are
 * reported as a single bar.
 */
export function projectLabel(raw: string): string | null {
  const key = normalize(raw);

  switch (key) {
    case "":
    case "NONE":
      return null;
    case "ONBOARDING":
      return "Nuevas incorporaciones";
    case "DAASAPPLE":
      return "Renove Apple";
    case "HOLDINGREN":
    case "RENOVEHOLD":
      return "Renove Holding";
    case "SPAINREN":
      return "Renove España";
    case "WASP":
      return "WASP";
    default:
      return raw.trim();
  }
}

/** Counts as an array, descending by count and then alphabetically. */
function toCounts(counts: Map<string, number>): AgaCount[] {
  return Array.from(counts, ([label, count]) => ({ label, count })).sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label, "es")
  );
}

/* -------------------------------------------------------------------------- */
/* Sheet reading                                                               */
/* -------------------------------------------------------------------------- */

/** Column name to its index, from the header row of a sheet. */
function headerIndex(header: unknown[]): Map<string, number> {
  const columns = new Map<string, number>();

  header.forEach((cell, index) => {
    const key = normalize(cell);

    if (key !== "" && !columns.has(key)) {
      columns.set(key, index);
    }
  });

  return columns;
}

/** Accumulator of one week while its rows are being read. */
interface WeekBuilder {
  total: number;
  departments: Map<string, number>;
  departmentsRaw: Map<string, number>;
  projects: Map<string, number>;
}

function newWeekBuilder(): WeekBuilder {
  return {
    total: 0,
    departments: new Map(),
    departmentsRaw: new Map(),
    projects: new Map(),
  };
}

function bump(counts: Map<string, number>, label: string): void {
  counts.set(label, (counts.get(label) ?? 0) + 1);
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

export function parseAgaWorkbook(workbook: XLSX.WorkBook): AgaParseResult {
  if (!workbook || !Array.isArray(workbook.SheetNames)) {
    throw new Error("El fichero enviado no es un libro de Excel válido.");
  }

  const builders = new Map<string, WeekBuilder>();
  const sheets: AgaSheetReport[] = [];
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

    const columns = headerIndex((grid[AGA_HEADER_ROW] ?? []) as unknown[]);
    const missingColumns = AGA_REQUIRED_COLUMNS.filter(
      (column) => !columns.has(normalize(column))
    );

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
    const departmentAt = columns.get(normalize("Departamento"))!;
    const weekAt = columns.get(normalize("semana"))!;
    const projectAt = columns.get(normalize("Proyecto"));
    const positionAt = columns.get(normalize("Nº Posición de petición"));
    const stepAt = columns.get(normalize("Paso del circuito"));

    const sheetWeeks = new Set<string>();
    let rows = 0;
    let skipped = 0;

    for (const cells of grid.slice(AGA_HEADER_ROW + 1)) {
      const row = (cells ?? []) as unknown[];
      const request = text(row[requestAt]);

      // The export pads the used range with hundreds of empty rows. A row with
      // no request number is one of those, not a defect, so it is not counted
      // as skipped unless it carries content elsewhere.
      if (request === "") {
        const hasContent = row.some(
          (cell) => cell !== null && cell !== undefined && String(cell).trim() !== ""
        );

        if (hasContent) {
          skipped += 1;
        }

        continue;
      }

      const week = parseWeekCell(row[weekAt]);

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

      builder.total += 1;
      bump(builder.departments, departmentLabel(rawDepartment));
      bump(builder.departmentsRaw, rawDepartment === "" ? "Sin departamento" : rawDepartment);

      if (projectAt !== undefined) {
        const project = projectLabel(text(row[projectAt]));

        if (project) {
          bump(builder.projects, project);
        }
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
      "El libro no trae ninguna hoja con la cabecera del export GPS (Nº Petición de sistemas, Departamento, semana)."
    );
  }

  const weeks: AgaWeekAggregate[] = Array.from(builders, ([week, builder]) => ({
    week,
    reportWeek: agaReportingPeriod(week)?.week,
    total: builder.total,
    byDepartment: toCounts(builder.departments),
    byDepartmentRaw: toCounts(builder.departmentsRaw),
    byProject: toCounts(builder.projects),
  })).sort((a, b) => a.week.localeCompare(b.week));

  return {
    weeks,
    report: {
      sheets,
      sheetsFound,
      weeks: weeks.map((entry) => entry.week),
      totals: Object.fromEntries(weeks.map((entry) => [entry.week, entry.total])),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* History merge                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Folds the weeks of an upload into the stored history.
 *
 * A week present in both wins from the incoming side: re-uploading a corrected
 * GPS must replace the week, not add a second copy of it. Everything else is
 * kept, which is the whole point — the export only carries two weeks and the
 * evolution charts need around ten.
 */
export function mergeAgaWeeks(
  existing: AgaWeekAggregate[],
  incoming: AgaWeekAggregate[]
): AgaWeekAggregate[] {
  const byWeek = new Map<string, AgaWeekAggregate>();

  for (const week of existing ?? []) {
    if (week && typeof week.week === "string") {
      byWeek.set(week.week, week);
    }
  }

  for (const week of incoming ?? []) {
    if (week && typeof week.week === "string") {
      byWeek.set(week.week, week);
    }
  }

  return Array.from(byWeek.values()).sort((a, b) => a.week.localeCompare(b.week));
}

/**
 * The stored dataset with a GPS upload folded in.
 *
 * The GPS only feeds `weeks`. The other sections are seeded from different
 * exports, and rebuilding the dataset literally around the parsed weeks — which
 * is what the route used to do — silently dropped them on the next upload.
 * Carrying them across is the whole reason this returns a dataset rather than
 * an array: an upload must never be able to erase a section it knows nothing
 * about.
 */
export function mergeAgaDataset(
  existing: AgaDataset | null,
  incoming: AgaWeekAggregate[],
  source: AgaDataset["source"],
  sheetsFound?: string[]
): AgaDataset {
  return {
    ...(existing ?? {}),
    weeks: mergeAgaWeeks(existing?.weeks ?? [], incoming),
    source,
    ...(sheetsFound ? { sheetsFound } : {}),
  };
}
