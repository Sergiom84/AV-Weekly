import * as XLSX from "xlsx";
import type { ResolutionRow, SupportType } from "../shared/informe.ts";
import { INFORME_SUPPORT_TYPES } from "../shared/informe.ts";

/**
 * Parser for the flattened trends workbook ("Tendencias AV (plano)").
 *
 * Unlike the weekly template, whose detail sheets only carry the reported week,
 * this file holds one row per week, support type and resolution for the whole
 * year. It is the source for the "por resolución" pages.
 *
 * Sheets:
 * - "Ubicacion":  Fecha | Semana | Tipo Soporte | Edificio | Tickets
 * - "Resolucion": Fecha | Semana | Tipo Soporte | Categoría | Acción | Tickets
 */

export type ResolutionByWeek = Record<SupportType, Record<string, ResolutionRow[]>>;

export interface PlanoResult {
  /** Resolution detail per ISO week-year. */
  byYear: Record<string, ResolutionByWeek>;
  years: number[];
}

/** ISO week-year of an Excel date serial, taken from the Thursday of its week. */
function weekYearFromSerial(serial: number | null): number | null {
  if (serial === null || !Number.isFinite(serial)) {
    return null;
  }

  const epoch = Date.UTC(1899, 11, 30);
  const date = new Date(epoch + Math.trunc(serial) * 86400000);
  const dayOfWeek = (date.getUTCDay() + 6) % 7;
  const thursday = new Date(date.getTime() + (3 - dayOfWeek) * 86400000);
  return thursday.getUTCFullYear();
}

const TYPE_BY_LABEL: Record<string, SupportType> = {
  REMOTO: "Remotos",
  REMOTOS: "Remotos",
  PROGRAMADO: "Programados",
  PROGRAMADOS: "Programados",
  PRESENCIAL: "Presenciales",
  PRESENCIALES: "Presenciales",
  INCIDENCIA: "Incidencias",
  INCIDENCIAS: "Incidencias",
  CORRECTIVO: "Correctivos",
  CORRECTIVOS: "Correctivos",
};

const RESOLUTION_SHEET = "RESOLUCION";

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function toCount(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.trunc(value) : 0;
  }

  const digits = String(value ?? "").replace(/[^\d-]/g, "");
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toWeek(value: unknown) {
  const parsed = toCount(value);
  return parsed >= 1 && parsed <= 53 ? parsed : 0;
}

function emptyByWeek(): ResolutionByWeek {
  return Object.fromEntries(
    INFORME_SUPPORT_TYPES.map((type) => [type, {} as Record<string, ResolutionRow[]>])
  ) as ResolutionByWeek;
}

function findSheet(workbook: XLSX.WorkBook, name: string) {
  const target = normalize(name);
  const match = workbook.SheetNames.find((sheetName) => normalize(sheetName) === target);
  return match ? workbook.Sheets[match] : null;
}

export function parseInformePlanoWorkbook(workbook: XLSX.WorkBook): PlanoResult {
  const sheet = findSheet(workbook, RESOLUTION_SHEET);

  if (!sheet) {
    const available = workbook.SheetNames.map((name) => `"${name}"`).join(", ") || "(ninguna)";
    throw new Error(
      `No se encontró la hoja "Resolucion" en el fichero plano. Hojas disponibles: ${available}.`
    );
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
  const byYear = new Map<string, ResolutionByWeek>();
  // Totals are accumulated per (type, week, group, resolution) before being
  // turned into rows, so repeated lines in the source add up instead of
  // overwriting each other.
  const buckets = new Map<
    string,
    { type: SupportType; year: string; week: number; row: ResolutionRow }
  >();

  for (const row of rows) {
    const type = TYPE_BY_LABEL[normalize(row["Tipo Soporte"])];
    const week = toWeek(row.Semana);
    const tier2 = String(row["Categoría"] ?? row.Categoria ?? "").trim();
    const tier3 = String(row["Acción"] ?? row.Accion ?? "").trim();
    const tickets = toCount(row.Tickets);

    const yearNumber = weekYearFromSerial(toCount(row.Fecha));

    if (!type || week === 0 || (!tier2 && !tier3) || tickets <= 0 || yearNumber === null) {
      continue;
    }

    const year = String(yearNumber);
    const key = `${type}|${year}|${week}|${tier2}|${tier3}`;
    const existing = buckets.get(key);

    if (existing) {
      existing.row.total += tickets;
      continue;
    }

    buckets.set(key, {
      type,
      year,
      week,
      row: { category: type, tier2: tier2 || tier3, tier3: tier3 || tier2, total: tickets },
    });
  }

  if (buckets.size === 0) {
    throw new Error(
      'La hoja "Resolucion" no tiene filas reconocibles. Se esperaban las columnas Semana, Tipo Soporte, Categoría, Acción y Tickets.'
    );
  }

  for (const bucket of Array.from(buckets.values())) {
    const target = byYear.get(bucket.year) ?? emptyByWeek();
    const key = String(bucket.week);
    target[bucket.type][key] = [...(target[bucket.type][key] ?? []), bucket.row];
    byYear.set(bucket.year, target);
  }

  const result: Record<string, ResolutionByWeek> = {};

  for (const [year, target] of Array.from(byYear.entries())) {
    for (const type of INFORME_SUPPORT_TYPES) {
      for (const key of Object.keys(target[type])) {
        target[type][key].sort(
          (a, b) => a.tier2.localeCompare(b.tier2, "es") || a.tier3.localeCompare(b.tier3, "es")
        );
      }
    }

    result[year] = target;
  }

  return {
    byYear: result,
    years: Object.keys(result).map(Number).sort((a, b) => a - b),
  };
}

/**
 * Fills weeks that the stored year does not yet have. Weeks that already
 * carry rows stay as they are: a later weekly upload is the more specific
 * source for that week.
 */
export function fillResolutionHistoryGaps(
  stored: Record<string, ResolutionRow[]>,
  incoming: Record<string, ResolutionRow[]>
): Record<string, ResolutionRow[]> {
  const merged = { ...stored };

  for (const [week, rows] of Object.entries(incoming)) {
    const current = merged[week];
    if (!current || current.length === 0) {
      merged[week] = rows;
    }
  }

  return merged;
}
