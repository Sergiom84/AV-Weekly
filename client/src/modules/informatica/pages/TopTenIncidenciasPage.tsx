import MatrixTable from "@/components/deck/MatrixTable";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import {
  monthLabel,
  pivot,
  reportMonth,
  reportMonths,
  sumBy,
  topEntries,
} from "../aggregate";
import { comparativaViews } from "../sources";
import PageShell, { type InformaticaPageProps } from "./PageShell";

interface TopTenIncidenciasPageProps extends InformaticaPageProps {
  dataset: InformaticaDataset;
}

/** The "ten" of the title: rows kept per view, ranked by the latest month. */
const TOP = 10;

/**
 * `2.1.3 Top Ten incidencias SSCC`: the three-month comparison of incident
 * components, one table per view.
 *
 * Tables rather than bars, unlike the rest of the deck. Four views on one slide
 * means four plots of ten categories by three months — a hundred and twenty
 * hairlines and four legends in the space of a slide — while the question this
 * page answers is "did this component grow or fall since last month", which is
 * three numbers on a row. The original pastes the same shape as an image.
 *
 * The fourth view has no slide in the source deck. It is kept: dropping a view
 * the workbook reports would hide data, and it costs a quarter of the grid.
 */
export default function TopTenIncidenciasPage({
  page,
  editing,
  onChange,
  dataset,
}: TopTenIncidenciasPageProps) {
  const rows = dataset.comparativas ?? [];
  const views = comparativaViews(rows);

  // Every view shares the same three-month window, resolved by the parser.
  const months = reportMonths(dataset, rows, row => row.mes);
  const columns = months.map(monthLabel);

  // Ranked on the last whole month, not on the newest one: the extract is cut
  // mid-month, so its final column is a fortnight and would rank a component
  // that simply has not happened yet below one that is already over.
  const ranked = reportMonth(dataset, rows, row => row.mes);

  const tables = views.map(({ view, label }) => {
    const viewRows = rows.filter(
      row => row.vista === view && months.includes(row.mes)
    );

    const ranking = topEntries(
      sumBy(
        viewRows.filter(row => row.mes === ranked),
        row => row.elemento,
        row => row.total
      ),
      TOP
    ).map(entry => entry.label);

    // A component that fell to zero that month but was reported before still
    // belongs on the table, so the order falls back to the window total.
    const order =
      ranking.length > 0
        ? ranking
        : topEntries(
            sumBy(
              viewRows,
              row => row.elemento,
              row => row.total
            ),
            TOP
          ).map(entry => entry.label);

    const matrix = pivot(
      viewRows,
      row => row.elemento,
      row => row.mes,
      row => row.total,
      { columns: months, rowOrder: order }
    );

    return { view, label, rows: matrix.rows };
  });

  return (
    <PageShell page={page} editing={editing} onChange={onChange}>
      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-x-[1.5cqi] gap-y-[1cqi]">
        {tables.map(table => (
          <div key={table.view} className="flex min-h-0 flex-col">
            <p className="shrink-0 pb-[0.4cqi] font-mono text-[1.15cqi] uppercase tracking-wide text-muted-foreground">
              {table.label}
            </p>
            <div className="min-h-0 flex-1 overflow-hidden">
              <MatrixTable
                rowHeader="Componente"
                columns={columns}
                rows={table.rows}
                rowTotals={false}
              />
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
