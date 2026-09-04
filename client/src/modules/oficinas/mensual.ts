import { closedReportMonths } from "@shared/modules/oficinas/derived";
import type { OficinasDataset, OficinasMonthRow } from "@shared/modules/oficinas/types";

/** Months a monthly Oficinas slide may print. */
export function closedMonths(
  months: string[],
  dataset: OficinasDataset,
  year: number
): string[] {
  return closedReportMonths(months, dataset, year);
}

export function monthTotal(row: OficinasMonthRow, months: string[]): number {
  const allowed = new Set(months);

  return row.values
    .filter(entry => allowed.has(entry.month))
    .reduce((sum, entry) => sum + entry.value, 0);
}

export function valueAtMonth(row: OficinasMonthRow, month: string): number {
  return row.values.find(entry => entry.month === month)?.value ?? 0;
}
