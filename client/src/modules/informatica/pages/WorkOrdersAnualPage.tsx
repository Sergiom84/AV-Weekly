import CategoryBarChart, { type CategorySeries } from "@/components/deck/CategoryBarChart";
import KpiRow from "@/components/deck/KpiRow";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import { seriesColor, yearlyComparison } from "../aggregate";
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
  const { years, data, totals } = yearlyComparison(
    dataset.workOrders ?? [],
    (row) => row.mes,
    (row) => row.ordenes
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
