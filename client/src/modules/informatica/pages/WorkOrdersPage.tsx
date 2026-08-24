import MatrixTable from "@/components/deck/MatrixTable";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import { monthLabel, pivot, reportMonth } from "../aggregate";
import PageShell, { type InformaticaPageProps } from "./PageShell";

interface WorkOrdersPageProps extends InformaticaPageProps {
  dataset: InformaticaDataset;
}

/**
 * `2.1.6 WorkOrders`: matrix of buildings by work order type for the reported
 * month, following the framed hierarchy of AV's resolution-detail table.
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
  const month = reportMonth(dataset, rows, row => row.mes);
  const current = rows.filter(row => row.mes === month);

  const matrix = pivot(
    current,
    row => row.edificio,
    row => row.tipo,
    row => row.ordenes
  );

  const total = current.reduce((sum, row) => sum + row.ordenes, 0);
  const weeks = Array.from(new Set(current.map(row => row.semana))).sort(
    (a, b) => a - b
  );
  const weekLabel =
    weeks.length > 0
      ? `Semanas ${weeks.join(" · ")} · ${monthLabel(month ?? "")}`
      : month
        ? monthLabel(month)
        : "";

  return (
    <PageShell page={page} editing={editing} onChange={onChange}>
      <div className="flex shrink-0 items-end justify-between font-mono">
        <p className="text-[1.05cqi] uppercase tracking-wide text-muted-foreground">
          {weekLabel}
        </p>
        <p className="text-[1.05cqi] text-muted-foreground">
          Total{" "}
          <span className="font-semibold text-foreground">
            {total.toLocaleString("es-ES")}
          </span>
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <MatrixTable
          rowHeader="Edificio"
          columns={matrix.columns}
          rows={matrix.rows}
          totalsLabel="Total"
          variant="report"
        />
      </div>
    </PageShell>
  );
}
