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

export function parseInformePlanoWorkbook(workbook: XLSX.WorkBook): ResolutionByWeek {
  const sheet = findSheet(workbook, RESOLUTION_SHEET);

  if (!sheet) {
    const available = workbook.SheetNames.map((name) => `"${name}"`).join(", ") || "(ninguna)";
    throw new Error(
      `No se encontró la hoja "Resolucion" en el fichero plano. Hojas disponibles: ${available}.`
    );
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
  const byWeek = emptyByWeek();
  // Totals are accumulated per (type, week, group, resolution) before being
  // turned into rows, so repeated lines in the source add up instead of
  // overwriting each other.
  const buckets = new Map<string, { type: SupportType; week: number; row: ResolutionRow }>();

  for (const row of rows) {
    const type = TYPE_BY_LABEL[normalize(row["Tipo Soporte"])];
    const week = toWeek(row.Semana);
    const tier2 = String(row["Categoría"] ?? row.Categoria ?? "").trim();
    const tier3 = String(row["Acción"] ?? row.Accion ?? "").trim();
    const tickets = toCount(row.Tickets);

    if (!type || week === 0 || (!tier2 && !tier3) || tickets <= 0) {
      continue;
    }

    const key = `${type}|${week}|${tier2}|${tier3}`;
    const existing = buckets.get(key);

    if (existing) {
      existing.row.total += tickets;
      continue;
    }

    buckets.set(key, {
      type,
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
    const key = String(bucket.week);
    byWeek[bucket.type][key] = [...(byWeek[bucket.type][key] ?? []), bucket.row];
  }

  for (const type of INFORME_SUPPORT_TYPES) {
    for (const key of Object.keys(byWeek[type])) {
      byWeek[type][key].sort(
        (a, b) => a.tier2.localeCompare(b.tier2, "es") || a.tier3.localeCompare(b.tier3, "es")
      );
    }
  }

  return byWeek;
}
