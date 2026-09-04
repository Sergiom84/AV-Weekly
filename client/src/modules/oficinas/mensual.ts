import { reportMonth } from "@shared/modules/oficinas/derived";
import type { OficinasDataset, OficinasMonthRow } from "@shared/modules/oficinas/types";

/** Months on or before the report week's calendar month, ascending. */
export function closedMonths(
  months: string[],
  dataset: OficinasDataset,
  year: number
): string[] {
  const through = reportMonth(dataset, year);
  const unique = Array.from(new Set(months)).sort();

  return through ? unique.filter(month => month <= through) : unique;
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
