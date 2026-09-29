import type { ValueGridRow } from "@/components/deck/ValueGrid";
import type { CellOverrides } from "@shared/deck/core";
import type { InformaticaDeckPage } from "@shared/modules/informatica/types";

/**
 * Manual corrections of the figures drawn on an Informática slide.
 *
 * Same contract as Oficinas: the key is the identity of the datum, the value
 * lives on `page.overrides`, and a cleared cell is `null` (drawn as zero)
 * rather than a return to the import. The import itself is never rewritten.
 */

type OverridePage = { overrides?: CellOverrides };

export function cellKey(row: string, column: string): string {
  return `${row}:${column}`;
}

export function isOverridden(page: OverridePage, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(page.overrides ?? {}, key);
}

export interface DrawnCell {
  key: string;
  value: number | null;
  overridden: boolean;
  /** Number the chart, table and totals actually draw. A cleared cell is zero. */
  drawn: number;
}

/** Imported figure, replaced when this page already stores a correction. */
export function figureCell(
  page: OverridePage,
  row: string,
  column: string,
  imported: number
): DrawnCell {
  const key = cellKey(row, column);
  const overridden = isOverridden(page, key);
  const value = overridden ? (page.overrides?.[key] ?? null) : imported;

  return { key, value, overridden, drawn: value ?? 0 };
}

export function gridRow(
  label: string,
  cells: DrawnCell[],
  color?: string
): ValueGridRow {
  return {
    label,
    color,
    cells: cells.map(cell => ({
      key: cell.key,
      value: cell.value,
      overridden: cell.overridden,
    })),
  };
}

/** Patch that writes one correction and keeps every other cell. */
export function withOverride(
  page: InformaticaDeckPage,
  key: string,
  value: number | null
): Partial<InformaticaDeckPage> {
  return { overrides: { ...(page.overrides ?? {}), [key]: value } };
}

export interface CorrectedSeries {
  drawn: number[];
  row: ValueGridRow;
}

/**
 * One chart series across stable columns.
 *
 * `row` is the series identity (category, year, building). `column` is the
 * period or the metric. Both stay out of the display label so a renamed axis
 * does not drop the correction.
 */
export function correctSeries(
  page: OverridePage,
  row: string,
  label: string,
  columns: readonly string[],
  imported: readonly number[],
  color?: string
): CorrectedSeries {
  const cells = columns.map((column, index) =>
    figureCell(page, row, column, imported[index] ?? 0)
  );

  return { drawn: cells.map(cell => cell.drawn), row: gridRow(label, cells, color) };
}

/**
 * Year-on-year chart: twelve month columns, one row per year.
 *
 * Missing months stay absent on the chart unless a correction was typed there,
 * so an empty spring does not become a column of zeros. Totals follow the
 * corrected bars.
 */
export function correctYearChart(
  page: OverridePage,
  data: Record<string, number | string>[],
  years: readonly number[]
): {
  data: Record<string, number | string>[];
  totals: Map<number, number>;
  columns: string[];
  rows: ValueGridRow[];
} {
  const columns = data.map(row => String(row.mes));
  const corrected = data.map(row => ({ ...row }));
  const rows: ValueGridRow[] = [];

  for (const year of years) {
    const key = `y${year}`;
    const cells = corrected.map((row, index) => {
      const column = String(index + 1);
      const present = Object.prototype.hasOwnProperty.call(row, key);
      const cell = figureCell(page, String(year), column, Number(row[key] ?? 0));

      if (present || cell.overridden) {
        row[key] = cell.drawn;
      }

      return cell;
    });

    rows.push(gridRow(String(year), cells));
  }

  const totals = new Map<number, number>();

  for (const year of years) {
    const key = `y${year}`;
    totals.set(
      year,
      corrected.reduce((sum, row) => sum + Number(row[key] ?? 0), 0)
    );
  }

  return { data: corrected, totals, columns, rows };
}
