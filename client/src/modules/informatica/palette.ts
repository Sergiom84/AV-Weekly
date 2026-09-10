import { yearSeriesColor } from "../../lib/yearSeries";
import { seriesColor } from "./aggregate";

/**
 * Named series of the Informática slides, painted with the same year tokens
 * the rest of the deck already uses, so a cyan bar always reads as 2025 and
 * an orange one as 2026 even when the series is not a year.
 */

export const COLOR_2023 = yearSeriesColor(2023);
export const COLOR_2024 = yearSeriesColor(2024);
export const COLOR_2025 = yearSeriesColor(2025);
export const COLOR_2026 = yearSeriesColor(2026);
/** Spare tone for a fifth series that is not a year. */
export const COLOR_OTHER = "var(--chart-5)";

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

const TOP5_COLORS: Record<string, string> = {
  telefono: COLOR_2026,
  hardware: COLOR_2025,
  impresora: COLOR_2024,
  impresoras: COLOR_2024,
  aplicaciones: COLOR_2023,
  equipo: COLOR_OTHER,
};

/** 2.1.1 Work Orders vs incidencias, including the donut. */
export function hicWorkOrderColor(key: "workOrders" | "incidencias"): string {
  return key === "workOrders" ? COLOR_2025 : COLOR_2026;
}

/** 2.1.1 monthly assigned / assignments / resolved. */
export function hicMetricColor(metric: string): string {
  const key = fold(metric);

  if (key === "asignadas") return COLOR_2024;
  if (key === "asignaciones") return COLOR_2025;
  if (key === "resueltas") return COLOR_2026;

  return seriesColor(0);
}

/** 2.1.2 Top 5, keyed by category so a reorder does not swap colours. */
export function top5CategoryColor(label: string, fallbackIndex: number): string {
  return TOP5_COLORS[fold(label)] ?? seriesColor(fallbackIndex);
}

/**
 * 2.1.3 month pair: July 2026 as the 2025 blue, August 2026 as the 2026
 * orange. Other pairs fall back to first = blue, last = orange.
 */
export function topTenMonthColor(
  label: string,
  index: number,
  count: number
): string {
  const key = fold(label);

  if (key.startsWith("jul")) return COLOR_2025;
  if (key.startsWith("ago")) return COLOR_2026;
  if (count <= 1) return COLOR_2026;
  if (index === 0) return COLOR_2025;
  if (index === count - 1) return COLOR_2026;

  return COLOR_2024;
}

/** 2.3.1 booked vs walk-up. */
export function citaTypeColor(type: string): string {
  const key = fold(type);

  if (key.includes("sin cita")) return COLOR_2026;
  if (key.includes("con cita")) return COLOR_2025;

  return seriesColor(0);
}

/** 2.4.2 IMAC requests vs interventions. */
export function imacMetricColor(
  key: "solicitudes" | "intervenciones"
): string {
  return key === "solicitudes" ? COLOR_2025 : COLOR_2026;
}

/** 2.7 / 2.7.1 Holding vs España. */
export function renoveAmbitoColor(ambito: string): string {
  return fold(ambito) === "espana" ? COLOR_2026 : COLOR_2025;
}

/** Work-order type as printed on 2.1.6. */
export function workOrderTypeLabel(tipo: string): string {
  return tipo.replace(/audiovisuales/gi, "AV");
}
