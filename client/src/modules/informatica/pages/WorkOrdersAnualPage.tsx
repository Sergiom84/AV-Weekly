import CategoryBarChart, {
  type CategorySeries,
} from "@/components/deck/CategoryBarChart";
import KpiRow from "@/components/deck/KpiRow";
import YearSelector from "@/components/deck/YearSelector";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import { monthIndexOf, reportMonth, yearlyComparison } from "../aggregate";
import { yearSeriesColor } from "@/lib/yearSeries";
import { workOrdersWithFallbackSite } from "../sources";
import PageShell, { type InformaticaPageProps } from "./PageShell";

interface WorkOrdersAnualPageProps extends InformaticaPageProps {
  dataset: InformaticaDataset;
}

/**
 * `2.3.2 Volumetría de WorkOrders Anuales SSCC`: work orders per month with one
 * bar per year, and the yearly totals as headline figures.
 */
export default function WorkOrdersAnualPage({
  page,
  editing,
  onChange,
  dataset,
}: WorkOrdersAnualPageProps) {
  const rows = workOrdersWithFallbackSite(dataset.workOrders ?? []);
  const closed = reportMonth(dataset, rows, row => row.mes);
  const completeRows = closed === null ? [] : rows;
  const { years, data, totals } = yearlyComparison(
    completeRows,
    row => row.mes,
    row => row.ordenes,
    closed === null ? undefined : { throughMonth: monthIndexOf(closed) }
  );

  const availableYears = years.filter(year => year >= 2024);
  // Sorted here and not only where the selector saves it: the chart draws one
  // bar per year in this order, and the report reads oldest to newest.
  const selectedYears = (
    page.years
      ? page.years.filter(year => availableYears.includes(year))
      : availableYears
  ).toSorted((a, b) => a - b);
  const series: CategorySeries[] = selectedYears.map(year => ({
    key: `y${year}`,
    label: String(year),
    color: yearSeriesColor(year),
  }));

  return (
    <PageShell
      page={page}
      editing={editing}
      onChange={onChange}
      editor={
        editing &&
        availableYears.length > 0 && (
          <YearSelector
            selection={{
              available: availableYears,
              selected: selectedYears,
              onChange: years =>
                onChange({
                  years: Array.from(new Set(years)).sort((a, b) => a - b),
                }),
            }}
          />
        )
      }
    >
      <KpiRow
        items={selectedYears.map(year => ({
          label: String(year),
          value: (totals.get(year) ?? 0).toLocaleString("es-ES"),
        }))}
      />

      <div className="flex min-h-0 flex-1 flex-col">
        <CategoryBarChart
          categoryKey="mes"
          series={series}
          data={data}
          allCategories
        />
      </div>
    </PageShell>
  );
}
