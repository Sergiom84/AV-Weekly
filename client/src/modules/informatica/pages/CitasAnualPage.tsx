import CategoryBarChart, { type CategorySeries } from "@/components/deck/CategoryBarChart";
import KpiRow from "@/components/deck/KpiRow";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import { seriesColor, yearlyComparison } from "../aggregate";
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
  const { years, data, totals } = yearlyComparison(
    dataset.citasAnual ?? [],
    (row) => row.mes,
    (row) => row.citas
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
