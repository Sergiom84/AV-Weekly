import MatrixTable, { type MatrixRow } from "@/components/deck/MatrixTable";
import KpiRow from "@/components/deck/KpiRow";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import {
  coverageEnd,
  inWeek,
  lastClosedWeek,
  orderColumns,
  pivot,
  uniqueSorted,
} from "../aggregate";
import PageShell, { type InformaticaPageProps } from "./PageShell";

interface PeticionesPageProps extends InformaticaPageProps {
  dataset: InformaticaDataset;
}

/** Status order of the report, from open backlog to closed. */
const STATES = ["En vuelo", "Liberadas", "Gestionadas"];

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
  const window = lastClosedWeek(rows, row => row.fecha, cutoff);
  const current = rows.filter(row => inWeek(row.fecha, window));

  const columns = orderColumns(
    uniqueSorted(current.map(row => row.estado)),
    STATES
  );

  const matrixFor = (entity: string) =>
    pivot(
      current.filter(row => row.entidad === entity),
      row => row.origen,
      row => row.estado,
      row => row.total,
      { columns }
    );

  const entities = orderColumns(uniqueSorted(current.map(row => row.entidad)), [
    "Peticiones",
    "Posiciones",
  ]);

  const productRows = dataset.peticionesProducto ?? [];
  const productWindow = lastClosedWeek(productRows, row => row.fecha, cutoff);
  const topProducts: MatrixRow[] = Array.from(
    productRows
      .filter(row => inWeek(row.fecha, productWindow))
      .reduce((totals, row) => {
        totals.set(row.producto, (totals.get(row.producto) ?? 0) + row.total);
        return totals;
      }, new Map<string, number>())
      .entries()
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_PRODUCTS)
    .map(([label, total]) => ({ label, values: [total] }));

  const totalsByState = STATES.map(state =>
    current
      .filter(row => row.estado === state)
      .reduce((sum, row) => sum + row.total, 0)
  );

  return (
    <PageShell page={page} editing={editing} onChange={onChange}>
      <div className="grid min-h-0 flex-1 grid-cols-[57%_1fr] gap-[1.8cqi]">
        <div className="grid min-h-0 grid-rows-2 gap-[1cqi]">
          {entities.map(entity => (
            <div key={entity} className="min-h-0 overflow-auto">
              <p className="mb-[0.5cqi] font-mono text-[1.2cqi] uppercase tracking-wide text-muted-foreground">
                {entity}
              </p>
              <MatrixTable
                rowHeader="Origen"
                columns={columns}
                rows={matrixFor(entity).rows}
                variant="report"
              />
            </div>
          ))}
        </div>

        {topProducts.length > 0 && (
          <div className="min-h-0 overflow-auto">
            <p className="mb-[0.5cqi] font-mono text-[1.2cqi] uppercase tracking-wide text-muted-foreground">
              Top {TOP_PRODUCTS} productos
            </p>
            <MatrixTable
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
