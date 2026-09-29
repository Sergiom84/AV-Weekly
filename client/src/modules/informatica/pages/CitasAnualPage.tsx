import CategoryBarChart, {
  type CategorySeries,
} from "@/components/deck/CategoryBarChart";
import KpiRow from "@/components/deck/KpiRow";
import YearSelector from "@/components/deck/YearSelector";
import ValueGrid from "@/components/deck/EditorValueGrid";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import { yearSeriesColor } from "@/lib/yearSeries";
import { publishedMonthlyTotals, yearlyComparison } from "../aggregate";
import { correctYearChart, withOverride } from "../overrides";
import PageShell, { type InformaticaPageProps } from "./PageShell";

interface CitasAnualPageProps extends InformaticaPageProps {
  dataset: InformaticaDataset;
}

/** `2.3.2 Volumetría de Citas Anuales SSCC`: appointments per month and year. */
export default function CitasAnualPage({
  page,
  editing,
  onChange,
  dataset,
}: CitasAnualPageProps) {
  // The extract starts halfway through May 2025, so the first months of that
  // year come from the frozen series. Without them the 2025 bars stop at June
  // and the headline figure reads as the year while it is only half of it.
  const monthly = publishedMonthlyTotals(
    dataset,
    "citas",
    dataset.citasAnual ?? [],
    row => row.mes,
    row => row.citas
  );
  const compared = yearlyComparison(
    monthly,
    row => row.mes,
    row => row.total
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
