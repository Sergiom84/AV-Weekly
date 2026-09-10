import CategoryBarChart, {
  type CategorySeries,
} from "@/components/deck/CategoryBarChart";
import KpiRow from "@/components/deck/KpiRow";
import YearSelector from "@/components/deck/YearSelector";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import { yearSeriesColor } from "@/lib/yearSeries";
import { yearlyComparison } from "../aggregate";
import PageShell, { type InformaticaPageProps } from "./PageShell";

interface PeticionesAnualPageProps extends InformaticaPageProps {
  dataset: InformaticaDataset;
}

/**
 * `2.2.1 Volumetría de Peticiones Anual SSCC`: requests per month with one bar
 * per year. The series comes from the historical sheet, which is the only
 * source for the years the raw exports no longer cover.
 */
export default function PeticionesAnualPage({
  page,
  editing,
  onChange,
  dataset,
}: PeticionesAnualPageProps) {
  const { years, data, totals } = yearlyComparison(
    dataset.peticionesAnual ?? [],
    row => row.mes,
    row => row.peticiones
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
          accent: yearSeriesColor(year),
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
