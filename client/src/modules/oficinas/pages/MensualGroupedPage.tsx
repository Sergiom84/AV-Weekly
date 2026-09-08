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
import { monthLabel } from "../aggregate";
import { closedMonths } from "../mensual";
import PageShell, { type OficinasDataPageProps } from "./PageShell";

export interface MensualSeriesSpec {
  key: string;
  label: string;
  color: string;
}

interface MensualGroupedPageProps extends OficinasDataPageProps {
  rows: Array<{ month: string }>;
  series: MensualSeriesSpec[];
}

function metric(row: { month: string }, key: string): number {
  const value = (row as Record<string, unknown>)[key];

  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Grouped monthly bars shared by the three long monthly sheets (23, 24, 26).
 *
 * The in-progress month stays in the dataset and is dropped here, using the
 * report week's calendar month, so a partial September never sits next to a
 * full August.
 */
export default function MensualGroupedPage({
  page,
  editing,
  onChange,
  dataset,
  rows,
  series,
}: MensualGroupedPageProps) {
  const { containerRef, tableRef } = useFitTableScale<
    HTMLDivElement,
    HTMLTableElement
  >({ deps: [rows.length, series.length] });
  const year = dataset.year ?? new Date().getFullYear();
  const available = closedMonths(
    rows.map(row => row.month),
    dataset,
    year
  );
  const monthSelection = page.monthSelection ?? defaultMonthWindow(15);
  const months = resolveMonthSelection(monthSelection, available);
  const visible = new Set(months);
  const chartRows = rows
    .filter(row => visible.has(row.month))
    .map(row => ({
      mes: monthLabel(row.month),
      ...Object.fromEntries(series.map(entry => [entry.key, metric(row, entry.key)])),
    }));
  const last = rows.find(row => row.month === months[months.length - 1]);
  const chartSeries: CategorySeries[] = series.map(entry => ({
    key: entry.key,
    label: entry.label,
    color: entry.color,
  }));

  return (
    <PageShell
      page={page}
      editing={editing}
      onChange={onChange}
      editor={
        editing && (
          <MonthRangeSelector
            selection={monthSelection}
            available={available}
            format={monthLabel}
            onChange={next => onChange({ monthSelection: next })}
          />
        )
      }
    >
      <KpiRow
        compact
        items={
          last
            ? series.map(entry => ({
                label: `${entry.label} ${monthLabel(last.month)}`,
                value: metric(last, entry.key).toLocaleString("es-ES"),
              }))
            : []
        }
      />
      <div className="flex min-h-0 flex-[3] flex-col">
        <CategoryBarChart
          categoryKey="mes"
          series={chartSeries}
          data={chartRows}
          allCategories
          fitGroupedValueLabels
        />
      </div>

      {/* The table the team asked for beside each monthly chart: the same
          series and the same months, read as figures instead of as heights. */}
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
                  Serie
                </th>
                {months.map(month => (
                  <th
                    key={month}
                    className="px-[0.1cqi] py-[0.25cqi] text-center font-normal"
                  >
                    {monthLabel(month)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {series.map(entry => (
                <tr key={entry.key} className="border-b border-border/60 last:border-b-0">
                  <th
                    scope="row"
                    className="truncate px-[0.2cqi] py-[0.2cqi] text-left font-normal"
                  >
                    {entry.label}
                  </th>
                  {months.map(month => {
                    const row = rows.find(item => item.month === month);

                    return (
                      <td key={month} className="px-[0.1cqi] py-[0.2cqi] text-center">
                        {row === undefined
                          ? ""
                          : metric(row, entry.key).toLocaleString("es-ES")}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PageShell>
  );
}
