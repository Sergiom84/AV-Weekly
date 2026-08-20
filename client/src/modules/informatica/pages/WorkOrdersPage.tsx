import KpiRow from "@/components/deck/KpiRow";
import MatrixTable from "@/components/deck/MatrixTable";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import { monthLabel, pivot, reportMonth } from "../aggregate";
import PageShell, { type InformaticaPageProps } from "./PageShell";

interface WorkOrdersPageProps extends InformaticaPageProps {
  dataset: InformaticaDataset;
}

/**
 * `2.1.6 WorkOrders`: matrix of buildings by work order type for the reported
 * month, with the month total and the average per building above it.
 *
 * The month is the last closed one, the same one every other page of the
 * report reads. Taking the most recent month instead would put the fortnight
 * the extract was cut in — 462 orders against July's 1.152 — next to full
 * months on the neighbouring slides.
 */
export default function WorkOrdersPage({
  page,
  editing,
  onChange,
  dataset,
}: WorkOrdersPageProps) {
  const rows = dataset.workOrders ?? [];
  const month = reportMonth(dataset, rows, (row) => row.mes);
  const current = rows.filter((row) => row.mes === month);

  const matrix = pivot(
    current,
    (row) => row.edificio,
    (row) => row.tipo,
    (row) => row.ordenes
  );

  const total = current.reduce((sum, row) => sum + row.ordenes, 0);
  const buildings = matrix.rows.length;
  const average = buildings > 0 ? total / buildings : 0;

  return (
    <PageShell page={page} editing={editing} onChange={onChange}>
      <KpiRow
        items={[
          { label: `Órdenes ${month ? monthLabel(month) : ""}`.trim(), value: String(total) },
          {
            label: "Promedio por edificio",
            value: average.toLocaleString("es-ES", { maximumFractionDigits: 1 }),
          },
        ]}
      />

      <div className="min-h-0 flex-1 overflow-auto">
        <MatrixTable rowHeader="Edificio" columns={matrix.columns} rows={matrix.rows} />
      </div>
    </PageShell>
  );
}
