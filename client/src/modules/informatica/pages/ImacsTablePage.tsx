import MatrixTable from "@/components/deck/MatrixTable";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import { latestOf, monthLabel, monthsEndingAt, pivot } from "../aggregate";
import { siteLabels } from "../sources";
import PageShell, { type InformaticaPageProps } from "./PageShell";

interface ImacsTablePageProps extends InformaticaPageProps {
  dataset: InformaticaDataset;
}

/**
 * Months the matrix covers, matching the width of the reference table.
 *
 * The IMAC export carries every month since 2022, which at two columns each is
 * a hundred and twelve columns of table. Nobody reads that, and the report has
 * never shown it: the printed matrix is a trailing window that today resolves
 * to 2025/05-2026/08.
 */
const WINDOW = 16;

/** Monthly IMAC requests and interventions by building. */
export default function ImacsTablePage({
  page,
  editing,
  onChange,
  dataset,
}: ImacsTablePageProps) {
  const allRows = dataset.imacs ?? [];
  const latest = latestOf(allRows, row => row.mes);
  const months = latest === null ? [] : monthsEndingAt(latest, WINDOW);
  const shown = new Set(months);
  const rows = allRows.filter(row => shown.has(row.mes));
  const metrics = ["Solicitudes", "Intervenciones"];
  const columns = months.flatMap(month =>
    metrics.map(metric => `${month}|${metric}`)
  );
  // The IMAC export names every site its own way; the master's alias column
  // maps all thirty of them onto the names the report uses.
  const { labelOf, order: rowOrder } = siteLabels(
    dataset.edificios ?? [],
    row => row.aliasImacs,
    rows.map(row => row.ciudad)
  );
  const matrix = pivot(
    rows,
    row => labelOf(row.ciudad),
    row => `${row.mes}|${row.metrica}`,
    row => row.total,
    { columns, rowOrder }
  );

  return (
    <PageShell page={page} editing={editing} onChange={onChange}>
      <div className="min-h-0 flex-1 overflow-auto">
        <MatrixTable
          rowHeader="Edificio"
          columns={columns.map(column => {
            const [month, metric] = column.split("|");
            return `${monthLabel(month)} ${metric === "Solicitudes" ? "Sol" : "Int"}`;
          })}
          rows={matrix.rows}
          rowTotals={false}
          variant="report"
        />
      </div>
    </PageShell>
  );
}
