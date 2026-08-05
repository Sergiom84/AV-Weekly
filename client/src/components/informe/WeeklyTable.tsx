import type { WeeklyRow } from "@shared/informe";
import EditableNumber from "./EditableNumber";

interface WeeklyTableProps {
  /** Header of the first column: "Categoría" or "Ubicación". */
  rowHeader: string;
  weeks: number[];
  rows: WeeklyRow[];
  editing: boolean;
  valueAt: (rowLabel: string, week: number) => number;
  isOverridden: (rowLabel: string, week: number) => boolean;
  onCellChange: (rowLabel: string, week: number, value: number | null) => void;
  totalFor: (week: number) => number;
  /** Previous-year totals per week, rendered as extra read-only rows. */
  comparisonRows: { label: string; valueFor: (week: number) => number | null }[];
}

/** Editable weekly breakdown, with a computed total row and comparison rows. */
export default function WeeklyTable({
  rowHeader,
  weeks,
  rows,
  editing,
  valueAt,
  isOverridden,
  onCellChange,
  totalFor,
  comparisonRows,
}: WeeklyTableProps) {
  return (
    <table className="w-full min-w-full table-fixed border-collapse font-mono text-[1.15cqi] tabular-nums">
      <thead>
        <tr className="border-b border-border text-muted-foreground">
          <th scope="col" className="w-[18%] py-[0.3cqi] text-left font-normal">
            {rowHeader}
          </th>
          {weeks.map((week) => (
            <th key={week} scope="col" className="py-[0.3cqi] text-center font-normal">
              {`S${week}`}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} className="border-b border-border/60">
            <th scope="row" className="truncate py-[0.25cqi] text-left font-normal">
              {row.label}
            </th>
            {weeks.map((week) => (
              <td key={week} className="px-[0.2cqi] py-[0.25cqi] text-center">
                <EditableNumber
                  value={valueAt(row.label, week)}
                  onChange={(value) => onCellChange(row.label, week, value)}
                  editing={editing}
                  overridden={isOverridden(row.label, week)}
                  ariaLabel={`${row.label} semana ${week}`}
                  className="text-[1.15cqi]"
                />
              </td>
            ))}
          </tr>
        ))}

        <tr className="border-t border-border font-medium">
          <th scope="row" className="py-[0.3cqi] text-left">
            Total
          </th>
          {weeks.map((week) => (
            <td key={week} className="px-[0.2cqi] py-[0.3cqi] text-center">
              {totalFor(week)}
            </td>
          ))}
        </tr>

        {comparisonRows.map((comparison) => (
          <tr key={comparison.label} className="border-t border-border/60 text-muted-foreground">
            <th scope="row" className="py-[0.3cqi] text-left font-normal">
              {comparison.label}
            </th>
            {weeks.map((week) => {
              const value = comparison.valueFor(week);
              return (
                <td key={week} className="px-[0.2cqi] py-[0.3cqi] text-center">
                  {value ?? ""}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
