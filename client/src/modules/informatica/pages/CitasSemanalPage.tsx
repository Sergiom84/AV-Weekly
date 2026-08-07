import KpiRow from "@/components/deck/KpiRow";
import MatrixTable from "@/components/deck/MatrixTable";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import { latestOf, orderColumns, pivot, uniqueSorted } from "../aggregate";
import PageShell, { type InformaticaPageProps } from "./PageShell";

interface CitasSemanalPageProps extends InformaticaPageProps {
  dataset: InformaticaDataset;
}

/** Column order of the report: booked first, walk-up second. */
const TYPES = ["Con Cita", "Sin Cita"];

/**
 * `2.3.1 Volumetría de Citas SmartTech Semanal`: booked versus walk-up
 * attention per SmartTech point during the reported week.
 */
export default function CitasSemanalPage({
  page,
  editing,
  onChange,
  dataset,
}: CitasSemanalPageProps) {
  const rows = dataset.citas ?? [];
  const week = latestOf(rows, (row) => row.semana);
  const current = rows.filter((row) => row.semana === week);

  const columns = orderColumns(uniqueSorted(current.map((row) => row.tipo)), TYPES);
  const matrix = pivot(
    current,
    (row) => row.edificio,
    (row) => row.tipo,
    (row) => row.citas,
    { columns }
  );

  const totalOf = (type: string) =>
    current.filter((row) => row.tipo === type).reduce((sum, row) => sum + row.citas, 0);

  const total = current.reduce((sum, row) => sum + row.citas, 0);

  return (
    <PageShell page={page} editing={editing} onChange={onChange}>
      <KpiRow
        items={[
          ...columns.map((type) => ({ label: type, value: String(totalOf(type)) })),
          { label: `Total S${week ?? ""}`, value: String(total) },
        ]}
      />

      <div className="min-h-0 flex-1 overflow-auto">
        <MatrixTable rowHeader="SmartTech" columns={columns} rows={matrix.rows} />
      </div>
    </PageShell>
  );
}
