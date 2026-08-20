import KpiRow from "@/components/deck/KpiRow";
import MatrixTable from "@/components/deck/MatrixTable";
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

interface CitasSemanalPageProps extends InformaticaPageProps {
  dataset: InformaticaDataset;
}

/** Column order of the report: booked first, walk-up second. */
const TYPES = ["Con Cita", "Sin Cita"];

/**
 * `2.3.1 Volumetría de Citas SmartTech Semanal`: booked versus walk-up
 * attention per SmartTech point during the reported week.
 *
 * The week is resolved by date, not by picking the highest `Semana`. The sheet
 * spans more than a year, so every week number occurs twice and the highest is
 * week 52 — the previous Christmas. Appointments are also booked ahead, past
 * the day the extract was cut, which is why the window stops at the coverage
 * end instead of at the last row.
 */
export default function CitasSemanalPage({
  page,
  editing,
  onChange,
  dataset,
}: CitasSemanalPageProps) {
  const rows = dataset.citas ?? [];
  const window = lastClosedWeek(rows, (row) => row.fecha, coverageEnd(dataset));
  const current = rows.filter((row) => inWeek(row.fecha, window));
  const week = current[0]?.semana ?? null;

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
