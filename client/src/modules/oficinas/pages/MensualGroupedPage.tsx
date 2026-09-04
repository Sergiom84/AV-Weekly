import CategoryBarChart, {
  type CategorySeries,
} from "@/components/deck/CategoryBarChart";
import KpiRow from "@/components/deck/KpiRow";
import MonthRangeSelector from "@/components/deck/MonthRangeSelector";
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
            ? series.map(entry => ({
                label: `${entry.label} ${monthLabel(last.month)}`,
                value: metric(last, entry.key).toLocaleString("es-ES"),
              }))
            : []
        }
      />
      <div className="flex min-h-0 flex-1 flex-col">
        <CategoryBarChart
          categoryKey="mes"
          series={chartSeries}
          data={chartRows}
          allCategories
          fitGroupedValueLabels
        />
      </div>
    </PageShell>
  );
}
