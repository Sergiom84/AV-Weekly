import * as XLSX from "xlsx";
import type { InformeMonthlyDataset, SupportType } from "../shared/informe.ts";
import { INFORME_SUPPORT_TYPES } from "../shared/informe.ts";

/**
 * Parser for the monthly workbook ("Audiovisuales - Resueltas mes anterior").
 *
 * The file is a flat ticket dump. Tickets are grouped by the year and month of
 * their `Cerrada` date and by the support type derived from `Modulo`.
 *
 * Each upload carries a single month, so `mergeMonthlyDatasets` is used to keep
 * the accumulated history instead of replacing it.
 */

const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 86_400_000;

/** Modules that map to a support type. Unlisted modules fall back to Incidencias. */
const MODULE_TYPE_MAP: Record<string, SupportType | null> = {
  "SOPORTE PROGRAMADO": "Programados",
  "SOPORTE PRESENCIAL": "Presenciales",
  "SOPORTE PUNTUAL": "Incidencias",
  "MANTENIMIENTO CORRECTIVO": "Correctivos",
  // Plain maintenance rows are "peticiones" and are not part of the deck.
  MANTENIMIENTO: null,
};

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function mapModule(value: unknown): SupportType | null {
  const normalized = normalizeText(value);

  if (!normalized) {
    return null;
  }

  if (normalized in MODULE_TYPE_MAP) {
    return MODULE_TYPE_MAP[normalized];
  }

  // FUNCIONALIDAD, AUDIO, COMUNICACIONES, SALA, HARDWARE, CONVOCATORIA,
  // MONITOR, VIDEO and any other module are reported as incidents.
  return "Incidencias";
}

/** Accepts both Excel serial numbers and ISO-like date strings. */
function toDate(value: unknown): Date | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(EXCEL_EPOCH_UTC + value * MS_PER_DAY);
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const text = String(value ?? "").trim();

  if (!text) {
    return null;
  }

  const numeric = Number(text);

  if (Number.isFinite(numeric) && numeric > 0 && !/[-/:]/.test(text)) {
    return new Date(EXCEL_EPOCH_UTC + numeric * MS_PER_DAY);
  }

  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (match) {
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function emptyYear(): (number | null)[] {
  return Array.from({ length: 12 }, () => null);
}

function collectYears(byType: Record<SupportType, Record<string, (number | null)[]>>) {
  const years = new Set<number>();

  for (const type of INFORME_SUPPORT_TYPES) {
    for (const [year, values] of Object.entries(byType[type] ?? {})) {
      if (values.some((value) => value !== null)) {
        years.add(Number(year));
      }
    }
  }

  return Array.from(years).sort((a, b) => a - b);
}

function findHeaderIndex(header: unknown[], names: string[]) {
  const wanted = names.map((name) => normalizeText(name));
  return header.findIndex((cell) => wanted.includes(normalizeText(cell)));
}

export function parseInformeMonthlyWorkbook(workbook: XLSX.WorkBook): InformeMonthlyDataset {
  const sheetName = workbook.SheetNames[0];
  const worksheet = sheetName ? workbook.Sheets[sheetName] : undefined;

  if (!worksheet) {
    throw new Error("El libro mensual de Informe no contiene ninguna hoja legible.");
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    defval: null,
    raw: true,
    blankrows: false,
  });

  const header = rows[0] ?? [];
  const closedIndex = findHeaderIndex(header, ["Cerrada"]);
  const moduleIndex = findHeaderIndex(header, ["Modulo", "Módulo"]);

  if (closedIndex < 0 || moduleIndex < 0) {
    const columnas = header.map((cell) => `"${String(cell ?? "")}"`).join(", ") || "(ninguna)";
    throw new Error(
      `No se encontraron las columnas "Cerrada" y "Modulo" en el libro mensual de Informe. Columnas detectadas: ${columnas}.`
    );
  }

  const byType = Object.fromEntries(
    INFORME_SUPPORT_TYPES.map((type) => [type, {} as Record<string, (number | null)[]>])
  ) as Record<SupportType, Record<string, (number | null)[]>>;

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const type = mapModule(row[moduleIndex]);

    if (!type) {
      continue;
    }

    const closed = toDate(row[closedIndex]);

    if (!closed) {
      continue;
    }

    const year = String(closed.getUTCFullYear());
    const monthIndex = closed.getUTCMonth();
    const values = byType[type][year] ?? emptyYear();

    values[monthIndex] = (values[monthIndex] ?? 0) + 1;
    byType[type][year] = values;
  }

  return {
    byType,
    years: collectYears(byType),
    sourceFile: null,
    uploadedAt: null,
  };
}

/**
 * Merges an incoming dataset over the stored one by (type, year, month).
 * Only the months present in `incoming` are overwritten, so the accumulated
 * history from previous uploads is preserved.
 */
export function mergeMonthlyDatasets(
  previous: InformeMonthlyDataset,
  incoming: InformeMonthlyDataset
): InformeMonthlyDataset {
  const byType = Object.fromEntries(
    INFORME_SUPPORT_TYPES.map((type) => {
      const merged: Record<string, (number | null)[]> = {};

      for (const [year, values] of Object.entries(previous.byType?.[type] ?? {})) {
        merged[year] = [...values];
      }

      for (const [year, values] of Object.entries(incoming.byType?.[type] ?? {})) {
        const target = merged[year] ?? emptyYear();

        values.forEach((value, monthIndex) => {
          if (value !== null) {
            target[monthIndex] = value;
          }
        });

        merged[year] = target;
      }

      return [type, merged];
    })
  ) as Record<SupportType, Record<string, (number | null)[]>>;

  return {
    byType,
    years: collectYears(byType),
    sourceFile: incoming.sourceFile ?? previous.sourceFile,
    uploadedAt: incoming.uploadedAt ?? previous.uploadedAt,
  };
}
