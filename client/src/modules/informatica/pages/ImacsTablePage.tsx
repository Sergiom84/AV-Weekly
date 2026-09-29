import MatrixTable from "@/components/deck/MatrixTable";
import ValueGrid from "@/components/deck/EditorValueGrid";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import { latestOf, monthLabel, monthsEndingAt, pivot } from "../aggregate";
import { correctSeries, withOverride } from "../overrides";
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
  const headers = columns.map(column => {
    const [columnMonth, metric] = column.split("|");
    return `${monthLabel(columnMonth)} ${metric === "Solicitudes" ? "Sol" : "Int"}`;
  });
  const corrected = matrix.rows.map(row => {
    const series = correctSeries(page, row.label, row.label, columns, row.values);

    return { label: row.label, values: series.drawn, grid: series.row };
  });

  return (
    <PageShell
      page={page}
      editing={editing}
      onChange={onChange}
      editor={
        editing && (
          <ValueGrid
            columns={headers}
            rows={corrected.map(row => row.grid)}
            onChange={(key, value) => onChange(withOverride(page, key, value))}
          />
        )
      }
    >
      <div className="min-h-0 flex-1 overflow-hidden">
        <MatrixTable
          rowHeader="Edificio"
          columns={headers}
          rows={corrected}
          rowTotals={false}
          groupEvery={2}
          variant="report"
        />
      </div>
    </PageShell>
  );
}
