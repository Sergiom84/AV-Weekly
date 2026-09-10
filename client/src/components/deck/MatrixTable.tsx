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
  /** AV-style framed table with primary header/footer and grouped first column. */
  variant?: "plain" | "report";
  /**
   * Stretch the framed box to the parent. Off when the table should hug its
   * rows instead of leaving an empty card below the last one.
   */
  fill?: boolean;
  /** Draws a stronger vertical rule after every N value columns. */
  groupEvery?: number;
  /**
   * Column headers stay on one line. Used when a long Spanish type name would
   * hyphenate mid-word (`Reinstalación`) or wrap a heading that has to fit.
   */
  nowrapHeaders?: boolean;
}

const defaultFormat = (value: number) => (value === 0 ? "" : String(value));

/**
 * Width of the label column. Narrow tables (products, SmartTech) need most of
 * the row for the name; dense matrices keep a smaller share so the figures
 * stay readable. Truncation is not used — the name wraps at word boundaries.
 */
function rowHeaderShare(numericColumns: number): string {
  if (numericColumns <= 1) return "72%";
  if (numericColumns <= 2) return "52%";
  if (numericColumns <= 3) return "56%";
  if (numericColumns <= 5) return "26%";
  if (numericColumns <= 8) return "20%";
  return "16%";
}

/** Label cells wrap at words and hyphenate long Spanish compounds. */
const LABEL_WRAP =
  "hyphens-auto whitespace-normal break-words [overflow-wrap:break-word]";

/**
 * Read-only pivot of a long dataset: one row per dimension value, one column
 * per period or category, with optional totals on both axes.
 *
 * Font and row padding shrink to fit the given space. Labels wrap at words
 * instead of truncating or breaking mid-glyph.
 */
export default function MatrixTable({
  rowHeader,
  columns,
  rows,
  rowTotals = true,
  columnTotals = true,
  totalsLabel = "Total",
  formatValue = defaultFormat,
  variant = "plain",
  fill = true,
  groupEvery,
  nowrapHeaders = false,
}: MatrixTableProps) {
  const totalOfRow = (row: MatrixRow) =>
    row.values.reduce((sum, value) => sum + value, 0);
  const totalOfColumn = (index: number) =>
    rows.reduce((sum, row) => sum + (row.values[index] ?? 0), 0);
  const grandTotal = rows.reduce((sum, row) => sum + totalOfRow(row), 0);
  const numericColumns = columns.length + (rowTotals ? 1 : 0);
  const dense = numericColumns >= 8;
  const headerWidth = rowHeaderShare(numericColumns);

  const { containerRef, tableRef } = useFitTableScale<
    HTMLDivElement,
    HTMLTableElement
  >({
    deps: [rows.length, columns.length, numericColumns],
    minScale: dense ? 0.42 : 0.5,
  });

  const groupRule = (index: number) =>
    groupEvery != null &&
    (index + 1) % groupEvery === 0 &&
    index < columns.length - 1
      ? "border-r-2 border-black"
      : variant === "report"
        ? "border-r border-border/30"
        : "";

  const headerPad = dense
    ? "px-[0.08cqi] py-[calc(var(--fit-scale,1)*0.2cqi)]"
    : "px-[0.2cqi] py-[calc(var(--fit-scale,1)*0.28cqi)]";
  const cellPad = dense
    ? "px-[0.06cqi] py-[calc(var(--fit-scale,1)*0.18cqi)]"
    : "px-[0.12cqi] py-[calc(var(--fit-scale,1)*0.22cqi)]";
  const headerWidthShare = Number.parseFloat(headerWidth);
  const numericShare = 100 - headerWidthShare;
  const headerWeights = nowrapHeaders
    ? [
        ...columns.map(column => Math.max(column.length, 3)),
        ...(rowTotals ? [Math.max(totalsLabel.length, 6)] : []),
      ]
    : null;
  const headerWeightTotal = headerWeights?.reduce((sum, weight) => sum + weight, 0) ?? 0;
  const numericColWidth = (index: number) =>
    headerWeights && headerWeightTotal > 0
      ? `${(headerWeights[index] / headerWeightTotal) * numericShare}%`
      : undefined;

  return (
    <div
      ref={containerRef}
      className={`${fill ? "h-full max-h-full" : "h-auto"} w-full overflow-hidden ${variant === "report" ? "rounded-[0.4cqi] border border-border shadow-sm" : ""}`}
    >
      <table
        ref={tableRef}
        lang="es"
        className={`w-full min-w-full table-fixed border-collapse font-mono leading-snug tabular-nums ${
          dense
            ? "text-[length:calc(var(--fit-scale,1)*0.95cqi)]"
            : "text-[length:calc(var(--fit-scale,1)*1.15cqi)]"
        }`}
      >
        <colgroup>
          <col style={{ width: headerWidth }} />
          {columns.map((column, index) => (
            <col key={column} style={{ width: numericColWidth(index) }} />
          ))}
          {rowTotals && <col style={{ width: numericColWidth(columns.length) }} />}
        </colgroup>
        <thead>
          <tr
            className={
              variant === "report"
                ? "bg-primary text-primary-foreground"
                : "border-b border-border text-muted-foreground"
            }
          >
            <th
              scope="col"
              className={`${headerPad} ${LABEL_WRAP} text-left align-middle ${variant === "report" ? "font-semibold tracking-wide" : "font-normal"}`}
            >
              {rowHeader}
            </th>
            {columns.map((column, index) => (
              <th
                key={column}
                scope="col"
                title={column}
                className={`${headerPad} ${
                  nowrapHeaders
                    ? "overflow-hidden whitespace-nowrap [hyphens:none]"
                    : LABEL_WRAP
                } text-center align-middle ${groupRule(index)} ${
                  variant === "report"
                    ? `font-semibold ${
                        dense
                          ? nowrapHeaders
                            ? "text-[length:calc(var(--fit-scale,1)*0.62cqi)]"
                            : "text-[length:calc(var(--fit-scale,1)*0.78cqi)]"
                          : ""
                      }`
                    : "font-normal"
                }`}
              >
                {column}
              </th>
            ))}
            {rowTotals && (
              <th
                scope="col"
                className={`${headerPad} text-center align-middle ${variant === "report" ? "font-semibold tracking-wide" : "font-normal"}`}
              >
                {totalsLabel}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.label} className="border-b border-border/60">
              <th
                scope="row"
                className={`${cellPad} ${LABEL_WRAP} text-left align-middle ${variant === "report" ? "border-r border-border bg-muted/30 font-semibold text-muted-foreground" : "font-normal"}`}
                title={row.label}
              >
                {row.label}
              </th>
              {columns.map((column, index) => (
                <td
                  key={column}
                  className={`${cellPad} whitespace-nowrap text-center align-middle ${groupRule(index)}`}
                >
                  {formatValue(row.values[index] ?? 0)}
                </td>
              ))}
              {rowTotals && (
                <td
                  className={`${cellPad} whitespace-nowrap text-center align-middle font-medium ${variant === "report" ? "bg-muted/40" : ""}`}
                >
                  {totalOfRow(row)}
                </td>
              )}
            </tr>
          ))}

          {columnTotals && (
            <tr
              className={
                variant === "report"
                  ? "bg-primary font-semibold text-primary-foreground"
                  : "border-t border-border font-medium"
              }
            >
              <th scope="row" className={`${cellPad} text-left align-middle`}>
                {totalsLabel}
              </th>
              {columns.map((column, index) => (
                <td
                  key={column}
                  className={`${cellPad} whitespace-nowrap text-center align-middle ${groupRule(index)}`}
                >
                  {totalOfColumn(index)}
                </td>
              ))}
              {rowTotals && (
                <td
                  className={`${cellPad} whitespace-nowrap text-center align-middle`}
                >
                  {grandTotal}
                </td>
              )}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
