import MatrixTable from "@/components/deck/MatrixTable";
import KpiRow from "@/components/deck/KpiRow";
import ValueGrid from "@/components/deck/EditorValueGrid";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import {
  coverageEnd,
  snapshotRows,
  orderColumns,
  pivot,
  uniqueSorted,
} from "../aggregate";
import { correctSeries, withOverride } from "../overrides";
import PageShell, { type InformaticaPageProps } from "./PageShell";

interface PeticionesPageProps extends InformaticaPageProps {
  dataset: InformaticaDataset;
}

/** Status order of the report, from open backlog to closed. */
const STATES = ["En vuelo", "Liberadas", "Gestionadas"];

/**
 * Origin order of the reference tables. On Site leads because it is the bulk of
 * the service; the other three are the contracts carved out of it.
 */
const ORIGINS = ["On Site", "BBVA Tech", "RENOVE", "DAAS APPLE"];

/** Rows of the top-10 table, highest first. */
const TOP_PRODUCTS = 10;

/**
 * `2.2.1 Volumetría Peticiones`: requests and positions by origin and status
 * for the reported week, plus the ten products with the largest backlog.
 *
 * "Peticiones" and "Posiciones" are two different counts of the same week, not
 * a total and its breakdown: the workbook carries both because they diverge in
 * the source system.
 *
 * The week is resolved by date rather than by the highest `Semana`, which over
 * a sheet spanning more than a year lands on the previous December. The two
 * sections get their own window because they are not cut on the same day.
 */
export default function PeticionesPage({
  page,
  editing,
  onChange,
  dataset,
}: PeticionesPageProps) {
  const rows = dataset.peticiones ?? [];
  const cutoff = coverageEnd(dataset);
  // The backlog is one photograph taken on the upload day, and it reports on
  // the week that closed before it. Counting the snapshot and naming the week
  // are two different questions, so they are answered apart.
  const current = snapshotRows(rows, row => row.fecha, cutoff);

  // The reference reads status down the side and origin across the top. Keeping
  // that orientation matters beyond taste: the row that is read out loud is the
  // status, and the totals column the slide is checked against is the one that
  // adds up the origins of a status.
  const columns = orderColumns(
    uniqueSorted(current.map(row => row.origen)),
    ORIGINS
  );
  const rowOrder = orderColumns(
    uniqueSorted(current.map(row => row.estado)),
    STATES
  );

  const entities = orderColumns(uniqueSorted(current.map(row => row.entidad)), [
    "Peticiones",
    "Posiciones",
  ]);
  const period = cutoff ?? current[0]?.semana?.toString() ?? "actual";
  const matrixFor = (entity: string) => {
    const matrix = pivot(
      current.filter(row => row.entidad === entity),
      row => row.estado,
      row => row.origen,
      row => row.total,
      { columns, rowOrder }
    );

    return matrix.rows.map(row => {
      const series = correctSeries(
        page,
        `${entity}:${row.label}`,
        `${entity}: ${row.label}`,
        columns.map(column => `${period}:${column}`),
        row.values
      );

      return { label: row.label, values: series.drawn, grid: series.row };
    });
  };
  const matrices = entities.map(entity => ({
    entity,
    rows: matrixFor(entity),
  }));

  const productRows = dataset.peticionesProducto ?? [];
  const topProducts = Array.from(
    snapshotRows(productRows, row => row.fecha, cutoff)
      .reduce((totals, row) => {
        totals.set(row.producto, (totals.get(row.producto) ?? 0) + row.total);
        return totals;
      }, new Map<string, number>())
      .entries()
  )
    // Ties broken by name: two products on the same count are common here, and
    // without it their order follows how the rows happened to arrive, so the
    // slide reshuffles between runs that report the very same figures.
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))
    .slice(0, TOP_PRODUCTS)
    .map(([label, total]) => {
      const series = correctSeries(page, `producto:${label}`, label, ["total"], [total]);

      return { label, values: series.drawn, grid: series.row };
    });

  // Requests only. `Peticiones` and `Posiciones` are two counts of the same
  // week, so adding them together reports every request twice: the headline for
  // the reported week was 1.473 where the deck says 733.
  const headlineEntity = entities.includes("Peticiones")
    ? "Peticiones"
    : entities[0];
  const headlineRows =
    matrices.find(entry => entry.entity === headlineEntity)?.rows ?? [];
  const totalsByState = STATES.map(state =>
    headlineRows
      .find(row => row.label === state)
      ?.values.reduce((sum, value) => sum + value, 0) ?? 0
  );

  return (
    <PageShell
      page={page}
      editing={editing}
      onChange={onChange}
      editor={
        editing && (
          <>
            {matrices.map(entry => (
              <ValueGrid
                key={entry.entity}
                columns={columns}
                rows={entry.rows.map(row => row.grid)}
                onChange={(key, value) => onChange(withOverride(page, key, value))}
              />
            ))}
            <ValueGrid
              columns={["Total"]}
              rows={topProducts.map(row => row.grid)}
              onChange={(key, value) => onChange(withOverride(page, key, value))}
            />
          </>
        )
      }
    >
      {/* The last matrix ends level with the product list beside it. */}
      <div className="grid min-h-0 flex-1 grid-cols-[57%_1fr] content-start items-stretch gap-[1.8cqi]">
        <div className="flex min-h-0 flex-col justify-between gap-[1.2cqi]">
          {matrices.map(entry => (
            <div key={entry.entity} className="min-h-0">
              <p className="mb-[0.5cqi] font-mono text-[1.2cqi] uppercase tracking-wide text-muted-foreground">
                {entry.entity}
              </p>
              <MatrixTable
                fill={false}
                rowHeader="Estado"
                columns={columns}
                rows={entry.rows}
                // No column totals: the states are not parts of a whole. "En
                // vuelo" is the backlog standing on the extraction day, while
                // the other two count what moved during that week, so adding
                // the three down a column produces a number of nothing.
                columnTotals={false}
                // The table hides zeros by default, which reads as "not
                // measured" on a grid this small and dense. Here every cell is
                // counted, so a zero is a result and the reference prints it.
                formatValue={value => String(value)}
                variant="report"
              />
            </div>
          ))}
        </div>

        {topProducts.length > 0 && (
          <div className="min-h-0">
            <p className="mb-[0.5cqi] font-mono text-[1.2cqi] uppercase tracking-wide text-muted-foreground">
              Top {TOP_PRODUCTS} productos
            </p>
            <MatrixTable
              fill={false}
              rowHeader="Producto"
              columns={["Total"]}
              rows={topProducts}
              rowTotals={false}
              columnTotals={false}
              formatValue={value => String(value)}
              variant="report"
            />
          </div>
        )}
      </div>

      <KpiRow
        compact
        items={STATES.map((state, index) => ({
          label: state,
          value: totalsByState[index].toLocaleString("es-ES"),
        }))}
      />
    </PageShell>
  );
}
