import { useFitTableScale } from "@/hooks/useFitTableScale";

export interface MatrixRow {
  label: string;
  /** Values aligned with `columns`, same length. */
  values: number[];
}

interface MatrixTableProps {
  /** Header of the first column, e.g. "Edificio". */
  rowHeader: string;
  columns: string[];
  rows: MatrixRow[];
  /** Adds a per-row total as the last column. */
  rowTotals?: boolean;
  /** Adds a totals row at the bottom. */
  columnTotals?: boolean;
  totalsLabel?: string;
  /** Rendering of a cell. Zero is blanked out by default, as in the report. */
  formatValue?: (value: number) => string;
}

const defaultFormat = (value: number) => (value === 0 ? "" : String(value));

/**
 * Read-only pivot of a long dataset: one row per dimension value, one column
 * per period or category, with optional totals on both axes.
 *
 * Every module feeds this from its own upload (buildings, products, SmartTech
 * points, ...), so the row count is whatever that month's workbook brings —
 * never fixed. Font and row padding shrink to fit the space this table is
 * given, and every cell truncates instead of spilling past its column, so a
 * denser upload never breaks the slide layout.
 */
export default function MatrixTable({
  rowHeader,
  columns,
  rows,
  rowTotals = true,
  columnTotals = true,
  totalsLabel = "Total",
  formatValue = defaultFormat,
}: MatrixTableProps) {
  const totalOfRow = (row: MatrixRow) => row.values.reduce((sum, value) => sum + value, 0);
  const totalOfColumn = (index: number) =>
    rows.reduce((sum, row) => sum + (row.values[index] ?? 0), 0);
  const grandTotal = rows.reduce((sum, row) => sum + totalOfRow(row), 0);

  const { containerRef, tableRef } = useFitTableScale<HTMLDivElement, HTMLTableElement>({
    deps: [rows.length, columns.length],
  });

  return (
    <div ref={containerRef} className="h-full max-h-full w-full overflow-auto">
      <table
        ref={tableRef}
        className="w-full min-w-full table-fixed border-collapse font-mono text-[length:calc(var(--fit-scale,1)*1.15cqi)] leading-none tabular-nums"
      >
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th scope="col" className="w-[18%] truncate py-[calc(var(--fit-scale,1)*0.3cqi)] text-left font-normal">
              {rowHeader}
            </th>
            {columns.map((column) => (
              <th key={column} scope="col" className="truncate py-[calc(var(--fit-scale,1)*0.3cqi)] text-center font-normal">
                {column}
              </th>
            ))}
            {rowTotals && (
              <th scope="col" className="truncate py-[calc(var(--fit-scale,1)*0.3cqi)] text-center font-normal">
                {totalsLabel}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-border/60">
              <th scope="row" className="truncate py-[calc(var(--fit-scale,1)*0.25cqi)] text-left font-normal">
                {row.label}
              </th>
              {columns.map((column, index) => (
                <td key={column} className="truncate px-[0.2cqi] py-[calc(var(--fit-scale,1)*0.25cqi)] text-center">
                  {formatValue(row.values[index] ?? 0)}
                </td>
              ))}
              {rowTotals && (
                <td className="truncate px-[0.2cqi] py-[calc(var(--fit-scale,1)*0.25cqi)] text-center font-medium">
                  {totalOfRow(row)}
                </td>
              )}
            </tr>
          ))}

          {columnTotals && (
            <tr className="border-t border-border font-medium">
              <th scope="row" className="truncate py-[calc(var(--fit-scale,1)*0.3cqi)] text-left">
                {totalsLabel}
              </th>
              {columns.map((column, index) => (
                <td key={column} className="truncate px-[0.2cqi] py-[calc(var(--fit-scale,1)*0.3cqi)] text-center">
                  {totalOfColumn(index)}
                </td>
              ))}
              {rowTotals && (
                <td className="truncate px-[0.2cqi] py-[calc(var(--fit-scale,1)*0.3cqi)] text-center">{grandTotal}</td>
              )}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
