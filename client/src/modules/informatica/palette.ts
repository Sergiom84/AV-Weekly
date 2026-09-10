import {
  componentSeriesColor,
  yearSeriesColor,
} from "../../lib/yearSeries";

export const COLOR_2023 = yearSeriesColor(2023);
export const COLOR_2024 = yearSeriesColor(2024);
export const COLOR_2025 = yearSeriesColor(2025);
export const COLOR_2026 = yearSeriesColor(2026);

export { componentSeriesColor };

/** Work-order type as printed on 2.1.6. */
export function workOrderTypeLabel(tipo: string): string {
  return tipo.replace(/audiovisuales/gi, "AV");
}
