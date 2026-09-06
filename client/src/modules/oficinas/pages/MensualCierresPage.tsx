import CategoryBarChart, {
  type CategorySeries,
} from "@/components/deck/CategoryBarChart";
import KpiRow from "@/components/deck/KpiRow";
import MonthRangeSelector from "@/components/deck/MonthRangeSelector";
import { useFitTableScale } from "@/hooks/useFitTableScale";
import {
  defaultMonthWindow,
  resolveMonthSelection,
} from "@shared/deck/core";
import { rowsWithOtrosLast } from "@shared/modules/oficinas/derived";
import { monthLabel, oficinasColor } from "../aggregate";
import { closedMonths, monthTotal, valueAtMonth } from "../mensual";
import PageShell, { type OficinasDataPageProps } from "./PageShell";

/**
 * `1.8` monthly closures by territorial directorate.
 *
 * Months on the axis, one stacked series per directorate, and the source
 * matrix underneath. OTROS stays last, as on every other territorial table.
 */
export default function MensualCierresPage({
  page,
  editing,
  onChange,
  dataset,
}: OficinasDataPageProps) {
  const rows = rowsWithOtrosLast(dataset.mensual?.cierresPorDT ?? []);
  const year = dataset.year ?? new Date().getFullYear();
  const available = closedMonths(
    rows.flatMap(row => row.values.map(entry => entry.month)),
    dataset,
    year
  );
  const monthSelection = page.monthSelection ?? defaultMonthWindow(15);
  const months = resolveMonthSelection(monthSelection, available);
  const last = months[months.length - 1] ?? null;
  const series: CategorySeries[] = rows.map((row, index) => ({
    key: row.label,
    label: row.label,
    color: oficinasColor(index),
  }));
  const data = months.map(month => ({
    mes: monthLabel(month),
    ...Object.fromEntries(rows.map(row => [row.label, valueAtMonth(row, month)])),
  }));
  const { containerRef, tableRef } = useFitTableScale<HTMLDivElement, HTMLTableElement>({
    deps: [rows.length, months.length],
  });

  return (
    <PageShell page={page} editing={editing} onChange={onChange}>
      {editing && (
        <MonthRangeSelector
          selection={monthSelection}
          available={available}
          format={monthLabel}
          onChange={next => onChange({ monthSelection: next })}
        />
      )}
      <KpiRow
        compact
        items={
          last
            ? [
                {
                  label: `Cierres ${monthLabel(last)}`,
                  value: rows
                    .reduce((sum, row) => sum + valueAtMonth(row, last), 0)
                    .toLocaleString("es-ES"),
                },
                {
                  label: "Acumulado",
                  value: rows
                    .reduce((sum, row) => sum + monthTotal(row, months), 0)
                    .toLocaleString("es-ES"),
                },
              ]
            : []
        }
      />
      <div className="flex min-h-0 flex-[3] flex-col">
        <CategoryBarChart
          categoryKey="mes"
          series={series}
          data={data}
          stacked
          allCategories
        />
      </div>
      <div className="min-h-0 flex-[2]">
        <div ref={containerRef} className="h-full max-h-full w-full overflow-auto">
          <table
            ref={tableRef}
            className="w-full min-w-full table-fixed border-collapse font-mono text-[length:calc(var(--fit-scale,1)*1.15cqi)] leading-none tabular-nums"
          >
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th
                  // La tabla es de columnas iguales, y con quince meses
                  // la primera se queda en un dieciseisavo del ancho:
                  // suficiente para "Serie" y no para "Asignaciones".
                  style={{ width: "16%" }}
                  className="px-[0.2cqi] py-[0.25cqi] text-left font-normal"
                >
                  Territorial
                </th>
                {months.map(month => (
                  <th key={month} className="px-[0.1cqi] py-[0.25cqi] text-center font-normal">
                    {monthLabel(month)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.label} className="border-b border-border/60">
                  <th scope="row" className="truncate px-[0.2cqi] py-[0.2cqi] text-left font-normal">
                    {row.label}
                  </th>
                  {months.map(month => (
                    <td key={month} className="px-[0.1cqi] py-[0.2cqi] text-center">
                      {valueAtMonth(row, month).toLocaleString("es-ES")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PageShell>
  );
}
