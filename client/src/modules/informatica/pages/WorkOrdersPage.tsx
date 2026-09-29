import MatrixTable from "@/components/deck/MatrixTable";
import ValueGrid from "@/components/deck/EditorValueGrid";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import { monthLabel, pivot, reportMonth } from "../aggregate";
import { correctSeries, withOverride } from "../overrides";
import { workOrderTypeLabel } from "../palette";
import { siteLabels, workOrdersWithFallbackSite } from "../sources";
import PageShell, { type InformaticaPageProps } from "./PageShell";

interface WorkOrdersPageProps extends InformaticaPageProps {
  dataset: InformaticaDataset;
}

/**
 * `2.1.6 WorkOrders`: matrix of buildings by work order type for the reported
 * month, following the framed hierarchy of AV's resolution-detail table.
 *
 * The month is the latest one the extract reports, including the fortnight
 * still in progress, the same one 2.1.1 already publishes.
 */
export default function WorkOrdersPage({
  page,
  editing,
  onChange,
  dataset,
}: WorkOrdersPageProps) {
  const rows = workOrdersWithFallbackSite(dataset.workOrders ?? []);
  const month = reportMonth(dataset, rows, row => row.mes);
  const current = rows.filter(row => row.mes === month);

  // Buildings named through the master's work-order alias. Whatever it does not
  // map keeps its raw value and goes last; the rows the lookup left as "#N/A"
  // are already under Sede by then.
  const { labelOf, order: rowOrder } = siteLabels(
    dataset.edificios ?? [],
    row => row.aliasWorkOrder,
    current.map(row => row.edificio)
  );
  const matrix = pivot(
    current,
    row => labelOf(row.edificio),
    row => row.tipo,
    row => row.ordenes,
    { rowOrder }
  );
  const period = month ?? "sin-mes";
  const corrected = matrix.rows.map(row => {
    const series = correctSeries(
      page,
      row.label,
      row.label,
      matrix.columns.map(tipo => `${period}:${tipo}`),
      row.values
    );

    return { label: row.label, values: series.drawn, grid: series.row };
  });

  const total = corrected.reduce(
    (sum, row) => sum + row.values.reduce((cellSum, value) => cellSum + value, 0),
    0
  );
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
    <PageShell
      page={page}
      editing={editing}
      onChange={onChange}
      editor={
        editing && (
          <ValueGrid
            columns={matrix.columns.map(workOrderTypeLabel)}
            rows={corrected.map(row => row.grid)}
            onChange={(key, value) => onChange(withOverride(page, key, value))}
          />
        )
      }
    >
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

      <div className="-ml-[1.5%] min-h-0 w-[103%] flex-1 overflow-hidden">
        <MatrixTable
          rowHeader="Edificio"
          columns={matrix.columns.map(workOrderTypeLabel)}
          rows={corrected}
          totalsLabel="Total"
          variant="report"
          nowrapHeaders
        />
      </div>
    </PageShell>
  );
}
