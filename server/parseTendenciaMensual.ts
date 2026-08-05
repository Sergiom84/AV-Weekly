import * as XLSX from "xlsx";
import type {
  InformeMonthlyDataset,
  SupportType,
  WeeklyComparison,
} from "../shared/informe.ts";
import { INFORME_SUPPORT_TYPES } from "../shared/informe.ts";

/**
 * Parses the "Tendencias" workbook, which carries two different things:
 *
 * - Sheet "Totales": monthly totals, one column per support type, the year of
 *   each column in its own row. Feeds the monthly trend pages.
 * - One sheet per support type ("Remoto", "Programado", ...): a row of ISO week
 *   numbers and a row of totals. Feeds the previous-year comparison series on
 *   the weekly pages.
 *
 * The weekly rows end with a grand-total cell that does not match the sum of
 * the weeks in the source file, so it is ignored: only columns headed by a week
 * number are read.
 */

const MONTH_BY_NAME: Record<string, number> = {
  ENERO: 0,
  FEBRERO: 1,
  MARZO: 2,
  ABRIL: 3,
  MAYO: 4,
  JUNIO: 5,
  JULIO: 6,
  AGOSTO: 7,
  SEPTIEMBRE: 8,
  OCTUBRE: 9,
  NOVIEMBRE: 10,
  DICIEMBRE: 11,
};

const TYPE_BY_LABEL: Record<string, SupportType> = {
  REMOTO: "Remotos",
  REMOTOS: "Remotos",
  PROGRAMADO: "Programados",
  PROGRAMADOS: "Programados",
  "SOPORTE PROGRAMADO": "Programados",
  PRESENCIAL: "Presenciales",
  PRESENCIALES: "Presenciales",
  "SOPORTE PRESENCIAL": "Presenciales",
  INCIDENCIA: "Incidencias",
  INCIDENCIAS: "Incidencias",
  CORRECTIVO: "Correctivos",
  CORRECTIVOS: "Correctivos",
  "MANT CORRECTIVOS": "Correctivos",
  "MANT CORRECTIVO": "Correctivos",
  "MANTENIMIENTOS CORRECTIVOS": "Correctivos",
  "MANTENIMIENTO CORRECTIVO": "Correctivos",
};

const TOTALS_SHEET = "TOTALES";

export interface TendenciaWorkbookResult {
  monthly: InformeMonthlyDataset;
  /** Previous-year weekly totals, by support type. */
  weeklyHistory: Record<SupportType, WeeklyComparison[]>;
}

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const text = String(value ?? "").trim();

  if (text === "") {
    return null;
  }

  const parsed = Number(text.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function isYear(value: unknown): boolean {
  const parsed = toNumber(value);
  return parsed !== null && Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100;
}

function mapType(value: unknown): SupportType | null {
  return TYPE_BY_LABEL[normalize(value)] ?? null;
}

function readSheet(workbook: XLSX.WorkBook, name: string) {
  const target = normalize(name);
  const match = workbook.SheetNames.find((sheetName) => normalize(sheetName) === target);
  return match ? XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[match], {
    header: 1,
    defval: "",
  }) : null;
}

function emptyMonths(): (number | null)[] {
  return Array.from({ length: 12 }, () => null);
}

/** Reads the "Totales" sheet into a monthly dataset. */
function parseTotalsSheet(rows: unknown[][]): InformeMonthlyDataset {
  // The header block is located by content: the type row is the one above the
  // row that holds four-digit years, so a different top margin still works.
  const yearRowIndex = rows.findIndex((row) => row.some((cell) => isYear(cell)));

  if (yearRowIndex < 1) {
    throw new Error(
      'La hoja "Totales" no tiene una fila de años. Se esperaba una fila con los años de cada columna.'
    );
  }

  const typeRow = rows[yearRowIndex - 1] ?? [];
  const yearRow = rows[yearRowIndex] ?? [];

  const columns: { index: number; type: SupportType; year: number }[] = [];

  for (let index = 0; index < typeRow.length; index += 1) {
    const type = mapType(typeRow[index]);
    const year = toNumber(yearRow[index]);

    if (type && year !== null && isYear(year)) {
      columns.push({ index, type, year });
    }
  }

  if (columns.length === 0) {
    throw new Error(
      'La hoja "Totales" no tiene ninguna columna reconocible. Se esperaban columnas de Remoto, Programado, Presencial, Incidencias o Mant. Correctivos con su año debajo.'
    );
  }

  const byType = Object.fromEntries(
    INFORME_SUPPORT_TYPES.map((type) => [type, {} as Record<string, (number | null)[]>])
  ) as Record<SupportType, Record<string, (number | null)[]>>;

  let monthsRead = 0;

  for (const row of rows.slice(yearRowIndex + 1)) {
    const month = MONTH_BY_NAME[normalize(row[0])];

    if (month === undefined) {
      continue;
    }

    monthsRead += 1;

    for (const column of columns) {
      const key = String(column.year);
      const series = byType[column.type][key] ?? emptyMonths();
      series[month] = toNumber(row[column.index]);
      byType[column.type][key] = series;
    }
  }

  if (monthsRead === 0) {
    throw new Error(
      'La hoja "Totales" no tiene ninguna fila de mes reconocible. Se esperaba Enero, Febrero, ... en la primera columna.'
    );
  }

  const years = Array.from(new Set(columns.map((column) => column.year))).sort((a, b) => a - b);

  return { byType, years, sourceFile: null, uploadedAt: null };
}

/**
 * Reads one per-type sheet into a weekly comparison series. Returns null when
 * the sheet has no usable week row.
 */
function parseWeeklySheet(rows: unknown[][], year: number): WeeklyComparison | null {
  // The week row is the one with the longest run of ascending week numbers.
  let weekRowIndex = -1;
  let bestCount = 0;

  rows.forEach((row, index) => {
    const count = row.filter((cell) => {
      const parsed = toNumber(cell);
      return parsed !== null && Number.isInteger(parsed) && parsed >= 1 && parsed <= 53;
    }).length;

    if (count > bestCount) {
      bestCount = count;
      weekRowIndex = index;
    }
  });

  if (weekRowIndex < 0 || bestCount < 4) {
    return null;
  }

  const weekRow = rows[weekRowIndex] ?? [];
  const valueRow = rows[weekRowIndex + 1] ?? [];
  const totalsByWeek: Record<string, number> = {};

  for (let index = 0; index < weekRow.length; index += 1) {
    const week = toNumber(weekRow[index]);

    if (week === null || !Number.isInteger(week) || week < 1 || week > 53) {
      continue;
    }

    const value = toNumber(valueRow[index]);

    if (value !== null) {
      totalsByWeek[String(week)] = value;
    }
  }

  return Object.keys(totalsByWeek).length > 0 ? { year, totalsByWeek } : null;
}

export function parseTendenciaWorkbook(workbook: XLSX.WorkBook): TendenciaWorkbookResult {
  const totalsRows = readSheet(workbook, TOTALS_SHEET);

  if (!totalsRows) {
    const available = workbook.SheetNames.map((name) => `"${name}"`).join(", ") || "(ninguna)";
    throw new Error(
      `No se encontró la hoja "Totales" en el libro de tendencias. Hojas disponibles: ${available}.`
    );
  }

  const monthly = parseTotalsSheet(totalsRows);

  const weeklyHistory = Object.fromEntries(
    INFORME_SUPPORT_TYPES.map((type) => [type, [] as WeeklyComparison[]])
  ) as Record<SupportType, WeeklyComparison[]>;

  // Each remaining sheet is named after a support type. Its weeks belong to the
  // year that type reports in the totals sheet.
  for (const sheetName of workbook.SheetNames) {
    if (normalize(sheetName) === TOTALS_SHEET) {
      continue;
    }

    const type = mapType(sheetName);

    if (!type) {
      continue;
    }

    const years = Object.keys(monthly.byType[type]).map(Number).sort((a, b) => a - b);
    const year = years[years.length - 1];

    if (year === undefined) {
      continue;
    }

    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
      header: 1,
      defval: "",
    });
    const comparison = parseWeeklySheet(rows, year);

    if (comparison) {
      weeklyHistory[type] = [comparison];
    }
  }

  return { monthly, weeklyHistory };
}

/**
 * Merges monthly datasets by (type, year). A year present in `incoming`
 * replaces that whole year for the types it carries; everything else survives.
 */
export function mergeMonthlyDatasets(
  previous: InformeMonthlyDataset,
  incoming: InformeMonthlyDataset
): InformeMonthlyDataset {
  const byType = Object.fromEntries(
    INFORME_SUPPORT_TYPES.map((type) => [
      type,
      { ...(previous.byType[type] ?? {}), ...(incoming.byType[type] ?? {}) },
    ])
  ) as Record<SupportType, Record<string, (number | null)[]>>;

  const years = Array.from(
    new Set(
      INFORME_SUPPORT_TYPES.flatMap((type) => Object.keys(byType[type]).map(Number))
    )
  ).sort((a, b) => a - b);

  return {
    byType,
    years,
    sourceFile: incoming.sourceFile ?? previous.sourceFile,
    uploadedAt: incoming.uploadedAt ?? previous.uploadedAt,
  };
}

/** Merges comparison series by (type, year), newest upload winning. */
export function mergeWeeklyHistory(
  previous: Record<SupportType, WeeklyComparison[]>,
  incoming: Record<SupportType, WeeklyComparison[]>
): Record<SupportType, WeeklyComparison[]> {
  return Object.fromEntries(
    INFORME_SUPPORT_TYPES.map((type) => {
      const byYear = new Map<number, WeeklyComparison>();

      for (const series of previous[type] ?? []) {
        byYear.set(series.year, series);
      }

      for (const series of incoming[type] ?? []) {
        byYear.set(series.year, series);
      }

      return [type, Array.from(byYear.values()).sort((a, b) => a.year - b.year)];
    })
  ) as Record<SupportType, WeeklyComparison[]>;
}
