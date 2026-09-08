import CategoryBarChart, {
  type CategorySeries,
} from "@/components/deck/CategoryBarChart";
import KpiRow from "@/components/deck/KpiRow";
import YearSelector from "@/components/deck/YearSelector";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import { yearSeriesColor } from "@/lib/yearSeries";
import { publishedMonthlyTotals, yearlyComparison } from "../aggregate";
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
  const { years, data, totals } = yearlyComparison(
    monthly,
    row => row.mes,
    row => row.total
  );

  const availableYears = years.filter(year => year >= 2024);
  const selectedYears = page.years
    ? page.years.filter(year => availableYears.includes(year))
    : availableYears;
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
