import MatrixTable from "@/components/deck/MatrixTable";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import { monthLabel, pivot, uniqueSorted } from "../aggregate";
import PageShell, { type InformaticaPageProps } from "./PageShell";

interface ImacsTablePageProps extends InformaticaPageProps {
  dataset: InformaticaDataset;
}

/** Monthly IMAC requests and interventions by building. */
export default function ImacsTablePage({
  page,
  editing,
  onChange,
  dataset,
}: ImacsTablePageProps) {
  const rows = dataset.imacs ?? [];
  const months = uniqueSorted(rows.map((row) => row.mes));
  const metrics = ["Solicitudes", "Intervenciones"];
  const columns = months.flatMap((month) =>
    metrics.map((metric) => `${month}|${metric}`)
  );
  const matrix = pivot(
    rows,
    (row) => row.ciudad,
    (row) => `${row.mes}|${row.metrica}`,
    (row) => row.total,
    { columns }
  );

  return (
    <PageShell page={page} editing={editing} onChange={onChange}>
      <div className="min-h-0 flex-1 overflow-auto">
        <MatrixTable
          rowHeader="Edificio"
          columns={columns.map((column) => {
            const [month, metric] = column.split("|");
            return `${monthLabel(month)} ${metric === "Solicitudes" ? "Sol" : "Int"}`;
          })}
          rows={matrix.rows}
          rowTotals={false}
        />
      </div>
    </PageShell>
  );
}
