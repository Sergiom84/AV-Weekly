import CategoryBarChart, { type CategorySeries } from "@/components/deck/CategoryBarChart";
import KpiRow from "@/components/deck/KpiRow";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import {
  coverageEnd,
  lastClosedMonth,
  monthLabel,
  seriesColor,
} from "../aggregate";
import PageShell, { type InformaticaPageProps } from "./PageShell";

interface ImacsChartPageProps extends InformaticaPageProps {
  dataset: InformaticaDataset;
}

const SERIES: CategorySeries[] = [
  { key: "solicitudes", label: "Solicitudes", color: seriesColor(0) },
  { key: "intervenciones", label: "Intervenciones", color: seriesColor(1) },
];

/** Requests and interventions by building for the latest closed month. */
export default function ImacsChartPage({
  page,
  editing,
  onChange,
  dataset,
}: ImacsChartPageProps) {
  const rows = dataset.imacs ?? [];
  // `Fecha limite` can contain appointments through the unfinished current
  // month. When IMAC is the only uploaded source there is no operational
  // cutoff from incidents/requests, so today is the conservative fallback.
  const cutoff = coverageEnd(dataset) ?? new Date().toISOString().slice(0, 10);
  const month = lastClosedMonth(rows.map((row) => row.mes), cutoff);
  const grouped = new Map<string, { solicitudes: number; intervenciones: number }>();

  for (const row of rows) {
    if (row.mes !== month) continue;

    const current = grouped.get(row.ciudad) ?? { solicitudes: 0, intervenciones: 0 };
    const metric = row.metrica.toLocaleLowerCase("es-ES");

    if (metric === "solicitudes") current.solicitudes += row.total;
    if (metric === "intervenciones") current.intervenciones += row.total;
    grouped.set(row.ciudad, current);
  }

  const data = Array.from(grouped.entries())
    .map(([edificio, totals]) => ({ edificio, ...totals }))
    .sort((a, b) =>
      b.intervenciones - a.intervenciones ||
      b.solicitudes - a.solicitudes ||
      a.edificio.localeCompare(b.edificio, "es")
    );
  const totalRequests = data.reduce((sum, row) => sum + row.solicitudes, 0);
  const totalInterventions = data.reduce((sum, row) => sum + row.intervenciones, 0);

  return (
    <PageShell page={page} editing={editing} onChange={onChange}>
      <KpiRow
        items={[
          { label: month ? monthLabel(month) : "Periodo", value: "IMACs" },
          { label: "Solicitudes", value: totalRequests.toLocaleString("es-ES") },
          { label: "Intervenciones", value: totalInterventions.toLocaleString("es-ES") },
        ]}
      />
      <div className="flex min-h-0 flex-1 flex-col">
        <CategoryBarChart
          categoryKey="edificio"
          series={SERIES}
          data={data}
          angledCategories
        />
      </div>
    </PageShell>
  );
}
