import CategoryBarChart, {
  type CategorySeries,
} from "@/components/deck/CategoryBarChart";
import KpiRow from "@/components/deck/KpiRow";
import YearSelector from "@/components/deck/YearSelector";
import ValueGrid from "@/components/deck/EditorValueGrid";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import { monthIndexOf, reportMonth, yearlyComparison } from "../aggregate";
import { yearSeriesColor } from "@/lib/yearSeries";
import { correctYearChart, withOverride } from "../overrides";
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
  const compared = yearlyComparison(
    completeRows,
    row => row.mes,
    row => row.ordenes,
    closed === null ? undefined : { throughMonth: monthIndexOf(closed) }
  );
  const years = compared.years;

  const availableYears = years.filter(year => year >= 2024);
  // Sorted here and not only where the selector saves it: the chart draws one
  // bar per year in this order, and the report reads oldest to newest.
  const selectedYears = (
    page.years
      ? page.years.filter(year => availableYears.includes(year))
      : availableYears
  ).toSorted((a, b) => a - b);
  const chart = correctYearChart(page, compared.data, selectedYears);
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
        editing && (
          <>
            {availableYears.length > 0 && (
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
            )}

            <ValueGrid
              columns={chart.columns}
              rows={chart.rows.map((row, index) => ({
                ...row,
                color: yearSeriesColor(selectedYears[index] ?? 0),
              }))}
              onChange={(key, value) => onChange(withOverride(page, key, value))}
            />
          </>
        )
      }
    >
      <KpiRow
        items={selectedYears.map(year => ({
          label: String(year),
          value: (chart.totals.get(year) ?? 0).toLocaleString("es-ES"),
          accent: yearSeriesColor(year),
        }))}
      />

      <div className="flex min-h-0 flex-1 flex-col">
        <CategoryBarChart
          categoryKey="mes"
          series={series}
          data={chart.data}
          allCategories
        />
      </div>
    </PageShell>
  );
}
