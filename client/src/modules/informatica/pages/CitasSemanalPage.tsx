import KpiRow from "@/components/deck/KpiRow";
import MatrixTable from "@/components/deck/MatrixTable";
import SeriesLineChart, {
  type LineSeries,
} from "@/components/deck/SeriesLineChart";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import {
  coverageEnd,
  inWeek,
  lastClosedWeek,
  monthLabel,
  orderColumns,
  pivot,
  reportMonths,
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
  const window = lastClosedWeek(rows, row => row.fecha, coverageEnd(dataset));
  const current = rows.filter(row => inWeek(row.fecha, window));
  const week = current[0]?.semana ?? null;

  const columns = orderColumns(
    uniqueSorted(current.map(row => row.tipo)),
    TYPES
  );
  const matrix = pivot(
    current,
    row => row.edificio,
    row => row.tipo,
    row => row.citas,
    { columns }
  );

  const totalOf = (type: string) =>
    current
      .filter(row => row.tipo === type)
      .reduce((sum, row) => sum + row.citas, 0);

  const total = current.reduce((sum, row) => sum + row.citas, 0);
  const months = reportMonths(dataset, rows, row => row.mes);
  const trendSeries: LineSeries[] = columns.map((type, index) => ({
    key: `type-${index}`,
    label: type,
    color: index === 0 ? "var(--informe-serie-1)" : "var(--informe-serie-2)",
  }));
  const trend = months.map(month => {
    const entry: Record<string, string | number | null> = {
      mes: monthLabel(month),
    };

    columns.forEach((type, index) => {
      const value = rows
        .filter(row => row.mes === month && row.tipo === type)
        .reduce((sum, row) => sum + row.citas, 0);
      entry[`type-${index}`] = value;
    });

    return entry;
  });

  return (
    <PageShell page={page} editing={editing} onChange={onChange}>
      <KpiRow
        items={[
          ...columns.map(type => ({
            label: type,
            value: String(totalOf(type)),
          })),
          { label: `Total S${week ?? ""}`, value: String(total) },
        ]}
      />

      <div className="grid min-h-0 flex-1 grid-cols-[38%_1fr] gap-[1.8cqi]">
        <div className="min-h-0 overflow-auto">
          <MatrixTable
            rowHeader="SmartTech"
            columns={columns}
            rows={matrix.rows}
            variant="report"
          />
        </div>
        <div className="min-h-0">
          <SeriesLineChart
            categoryKey="mes"
            series={trendSeries}
            data={trend}
          />
        </div>
      </div>
    </PageShell>
  );
}
