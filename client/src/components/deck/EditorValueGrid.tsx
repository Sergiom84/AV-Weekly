import EditableNumber from "@/components/deck/EditableNumber";
import type { ValueGridRow } from "@/components/deck/ValueGrid";

/**
 * Readable correction cells with horizontal scrolling confined to the editor.
 *
 * The counterpart of `ValueGrid` for a page that renders its editor through
 * `SlideEditorFrame`: the grid no longer has to shrink into the slide canvas,
 * so the cells are sized to be typed into instead of to fit.
 */
export default function EditorValueGrid({
  columns,
  rows,
  onChange,
}: {
  columns: string[];
  rows: ValueGridRow[];
  onChange: (key: string, value: number | null) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <div
      role="region"
      aria-label="Correcciones de datos"
      tabIndex={0}
      className="max-h-80 max-w-full overflow-auto rounded border border-border focus-visible:outline-2 focus-visible:outline-ring"
    >
      <table
        className="w-full table-fixed border-collapse font-mono text-xs tabular-nums"
        style={{ minWidth: 192 + columns.length * 80 }}
      >
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-10 w-48 bg-background p-2 text-left font-normal text-muted-foreground"
            >
              Categoría
            </th>
            {columns.map(column => (
              <th
                key={column}
                scope="col"
                className="p-2 text-center font-normal text-muted-foreground"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.label}>
              <th
                scope="row"
                className="sticky left-0 z-10 whitespace-normal break-words bg-background p-2 text-left font-normal text-muted-foreground"
              >
                {row.color && (
                  <span
                    aria-hidden="true"
                    className="mr-2 inline-block size-2 rounded-full"
                    style={{ backgroundColor: row.color }}
                  />
                )}
                {row.label}
              </th>
              {row.cells.map((cell, index) => (
                <td
                  key={cell.key}
                  className="border border-border p-2 text-center"
                >
                  <EditableNumber
                    value={cell.value}
                    onChange={value => onChange(cell.key, value)}
                    editing
                    overridden={cell.overridden}
                    ariaLabel={`${row.label} ${columns[index] ?? ""}`}
                    className="min-h-8 text-xs"
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
