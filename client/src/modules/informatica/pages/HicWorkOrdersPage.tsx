import CategoryBarChart, {
  type CategorySeries,
} from "@/components/deck/CategoryBarChart";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import {
  Cell,
  Label,
  Pie,
  PieChart,
  ResponsiveContainer,
} from "recharts";
import {
  historicoByMonth,
  latestOf,
  monthLabel,
  monthsEndingAt,
  publishedTotal,
  seriesColor,
} from "../aggregate";
import { HIC_RESOLVED, isReportedWorkOrder } from "../sources";
import PageShell, { type InformaticaPageProps } from "./PageShell";

/**
 * Months the reference chart shows. The original is a fixed eighteen-month
 * window, not "everything the extract happens to carry".
 */
const WINDOW_MONTHS = 18;

interface HicWorkOrdersPageProps extends InformaticaPageProps {
  dataset: InformaticaDataset;
}

/**
 * First 2.1.1 slide from the supplied presentation: monthly incident volume
 * beside work orders. It deliberately reads HIC instead of recomputing from
 * the daily incident detail, because the signed-off historical figure is HIC.
 *
 * Incidents add up both HIC scopes. The workbook splits them into `3-3` (BBVA)
 * and `4-4` (BBVA TECH) and the published figure is the sum: the source sheet
 * says so in as many words — "Datos de la suma de 3-3 columna B incidencias
 * resueltas + 4-4 columna B incidencias resueltas" — and the frozen history
 * confirms it, 566 + 38 = 604 for 2025/07 and 1245 + 44 = 1289 for 2025/11.
 *
 * Unlike the complete-month pages, this one publishes the month in flight: the
 * reference slide shows it cut at the extraction date, and hiding it would drop
 * the very week the report is about.
 */
export default function HicWorkOrdersPage({
  page,
  editing,
  onChange,
  dataset,
}: HicWorkOrdersPageProps) {
  const hic = dataset.hic ?? [];
  const incidentRows = hic.filter(
    row => row.categoria === "" && row.metrica === HIC_RESOLVED
  );
  const workOrders = (dataset.workOrders ?? []).filter(isReportedWorkOrder);
  const currentMonth =
    [
      latestOf(incidentRows, row => row.mes),
      latestOf(workOrders, row => row.mes),
    ]
      .filter((month): month is string => month !== null && month !== "")
      .sort()
      .at(-1) ?? null;
  const months = currentMonth === null
    ? []
    : monthsEndingAt(currentMonth, WINDOW_MONTHS);
  const value = <T,>(rows: T[], month: string, monthOf: (row: T) => string, totalOf: (row: T) => number) =>
    rows.filter(row => monthOf(row) === month).reduce((sum, row) => sum + totalOf(row), 0);
  const frozenIncidencias = historicoByMonth(dataset, "incidencias");
  const frozenWorkOrders = historicoByMonth(dataset, "workOrders");
  const incidenciasOf = (month: string) =>
    publishedTotal(
      "incidencias",
      month,
      frozenIncidencias,
      value(incidentRows, month, row => row.mes, row => row.total)
    );
  const workOrdersOf = (month: string) =>
    publishedTotal(
      "workOrders",
      month,
      frozenWorkOrders,
      value(workOrders, month, row => row.mes, row => row.ordenes)
    );
  const data = months.map(month => ({
    mes: monthLabel(month),
    incidencias: incidenciasOf(month),
    workOrders: workOrdersOf(month),
  }));
  const series: CategorySeries[] = [
    { key: "workOrders", label: "Work Orders", color: seriesColor(0) },
    { key: "incidencias", label: "Incidencias", color: seriesColor(1) },
  ];
  // The donut reads the same resolved figures as the bars, so the headline and
  // the axis can never report different numbers for the same month.
  const currentIncidencias = currentMonth ? incidenciasOf(currentMonth) : 0;
  const currentWorkOrders = currentMonth ? workOrdersOf(currentMonth) : 0;
  const currentTotal = currentIncidencias + currentWorkOrders;
  const distribution = [
    { name: "Work Orders", value: currentWorkOrders, color: seriesColor(0) },
    { name: "Incidencias", value: currentIncidencias, color: seriesColor(1) },
  ];

  return (
    <PageShell page={page} editing={editing} onChange={onChange}>
      <div className="grid min-h-0 flex-1 grid-cols-[1.1fr_.9fr] gap-[2.3cqi]">
        <section className="flex min-h-0 flex-col" aria-label="Work Orders e incidencias por mes">
          <h3 className="shrink-0 pb-[0.4cqi] font-mono text-[1.3cqi] font-medium text-muted-foreground">
            Work Orders e Incidencias
          </h3>
          <CategoryBarChart
            categoryKey="mes"
            series={series}
            data={data}
            fitGroupedValueLabels
            centerGroupedValueLabels
          />
        </section>

        <section className="flex min-h-0 flex-col" aria-label="Distribución del mes actual">
          <h3 className="shrink-0 pb-[0.4cqi] font-mono text-[1.3cqi] font-medium text-muted-foreground">
            Distribución del mes actual{currentMonth ? ` · ${monthLabel(currentMonth)}` : ""}
          </h3>
          <div className="min-h-0 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={distribution}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="54%"
                  outerRadius="78%"
                  paddingAngle={0}
                  stroke="var(--background)"
                  strokeWidth={2}
                >
                  {distribution.map(entry => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                  <Label
                    position="center"
                    value={currentTotal.toLocaleString("es-ES")}
                    className="fill-foreground font-mono text-[2.1cqi] font-semibold"
                  />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="grid shrink-0 grid-cols-2 gap-[0.7cqi] font-mono text-[1.05cqi] text-muted-foreground">
            {distribution.map(entry => (
              <li key={entry.name} className="border-t border-border pt-[0.45cqi]">
                <span className="block truncate">{entry.name}</span>
                <span className="tabular-nums text-foreground">
                  {entry.value.toLocaleString("es-ES")}
                  {currentTotal > 0
                    ? ` · ${((entry.value / currentTotal) * 100).toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </PageShell>
  );
}
