import EditableNumber from "@/components/deck/EditableNumber";

export interface ValueGridCell {
  /** Override key of the cell. Stable across uploads — see `overrides.ts`. */
  key: string;
  value: number | null;
  overridden: boolean;
}

export interface ValueGridRow {
  label: string;
  /** Swatch of the series the row belongs to, when the chart draws more than one. */
  color?: string;
  cells: ValueGridCell[];
}

interface ValueGridProps {
  columns: string[];
  rows: ValueGridRow[];
  onChange: (key: string, value: number | null) => void;
}

/**
 * Correction grid of a chart, rendered only while the deck is in edit mode.
 *
 * The AGA pages are charts without a table underneath — that is the layout of
 * the original deck and it is not changed here. The grid is the editor, not
 * part of the slide: it appears when the user turns editing on and disappears
 * in the report, in print and in the presentation overlay, so the corrected
 * figure reaches the reader through the bars alone.
 */
export default function ValueGrid({ columns, rows, onChange }: ValueGridProps) {
  if (rows.length === 0) {
    return null;
  }

  // A full weekly (or long monthly) run needs its cells, not an empty label
  // gutter. Short grids still retain the wider column needed by long category
  // names. Week identity remains in the aria label and override key; the `S`
  // prefix is only redundant visual noise in a dense editor.
  const compactLabelColumn = columns.length >= 20;
  const visibleColumns = columns.map(column =>
    /^S\d+$/.test(column) ? column.slice(1) : column
  );

  return (
    <div className="mt-[1cqi] max-h-[32%] shrink-0 overflow-auto border-t border-border pt-[0.8cqi] print:hidden">
      <table className="w-full table-fixed border-collapse font-mono text-[1.05cqi] tabular-nums">
        <thead>
          <tr>
            <th
              className="px-[0.4cqi] py-[0.35cqi] text-left text-[1cqi] font-normal uppercase tracking-wide text-muted-foreground"
              style={{ width: compactLabelColumn ? "9%" : "26%" }}
            >
              <span className="sr-only">Categoría</span>
            </th>
            {columns.map((column, index) => (
              <th
                key={column}
                scope="col"
                className="px-[0.2cqi] py-[0.35cqi] text-center text-[1cqi] font-normal uppercase tracking-wide text-muted-foreground"
              >
                {visibleColumns[index]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th
                scope="row"
                className="truncate px-[0.4cqi] py-[0.35cqi] text-left font-normal text-muted-foreground"
                title={row.label}
              >
                {row.color && (
                  <span
                    aria-hidden="true"
                    className="mr-[0.5cqi] inline-block size-[0.9cqi] rounded-full align-middle"
                    style={{ backgroundColor: row.color }}
                  />
                )}
                {row.label}
              </th>
              {row.cells.map((cell, index) => (
                <td
                  key={cell.key}
                  className="border border-border px-[0.2cqi] py-[0.3cqi] text-center"
                >
                  <EditableNumber
                    value={cell.value}
                    onChange={(value) => onChange(cell.key, value)}
                    editing
                    overridden={cell.overridden}
                    ariaLabel={`${row.label} ${columns[index] ?? ""}`}
                    className="text-[1.05cqi]"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
