import CategoryBarChart, { type CategorySeries } from "@/components/deck/CategoryBarChart";
import KpiRow from "@/components/deck/KpiRow";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import { seriesColor, yearlyComparison } from "../aggregate";
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
    (row) => row.mes,
    (row) => row.peticiones
  );

  const series: CategorySeries[] = years.map((year, index) => ({
    key: `y${year}`,
    label: String(year),
    color: seriesColor(index),
  }));

  return (
    <PageShell page={page} editing={editing} onChange={onChange}>
      <KpiRow
        items={years.map((year) => ({
          label: `Total ${year}`,
          value: (totals.get(year) ?? 0).toLocaleString("es-ES"),
        }))}
      />

      <div className="flex min-h-0 flex-1 flex-col">
        <CategoryBarChart categoryKey="mes" series={series} data={data} />
      </div>
    </PageShell>
  );
}
