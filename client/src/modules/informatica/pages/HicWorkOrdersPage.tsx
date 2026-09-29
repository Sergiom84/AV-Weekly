import CategoryBarChart, {
  type CategorySeries,
} from "@/components/deck/CategoryBarChart";
import MonthRangeSelector from "@/components/deck/MonthRangeSelector";
import RowFilterPanel from "@/components/deck/RowFilterPanel";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import {
  defaultMonthWindow,
  resolveMonthSelection,
} from "@shared/deck/core";
import {
  Cell,
  Label,
  Pie,
  PieChart,
  ResponsiveContainer,
} from "recharts";
import KpiRow from "@/components/deck/KpiRow";
import ValueGrid from "@/components/deck/EditorValueGrid";
import {
  historicoByMonth,
  latestOf,
  monthLabel,
  publishedTotal,
  uniqueSorted,
} from "../aggregate";
import { correctSeries, withOverride } from "../overrides";
import { componentSeriesColor } from "../palette";
import {
  HIC_RESOLVED,
  isReportedWorkOrder,
  workOrdersWithFallbackSite,
} from "../sources";
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
 * Publishes the month in flight: the reference slide shows it cut at the
 * extraction date, and hiding it would drop the very week the report is about.
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
  const workOrders = workOrdersWithFallbackSite(
    dataset.workOrders ?? []
  ).filter(isReportedWorkOrder);
  const availableMonths = uniqueSorted([
    ...incidentRows.map(row => row.mes),
    ...workOrders.map(row => row.mes),
  ]);
  const monthSelection = page.monthSelection ?? defaultMonthWindow(WINDOW_MONTHS);
  const months = resolveMonthSelection(monthSelection, availableMonths);
  const currentMonth =
    months[months.length - 1] ??
    [
      latestOf(incidentRows, row => row.mes),
      latestOf(workOrders, row => row.mes),
    ]
      .filter((month): month is string => month !== null && month !== "")
      .sort()
      .at(-1) ??
    null;
  const value = <T,>(rows: T[], month: string, monthOf: (row: T) => string, totalOf: (row: T) => number) =>
    rows.filter(row => monthOf(row) === month).reduce((sum, row) => sum + totalOf(row), 0);
  const frozenIncidencias = historicoByMonth(dataset, "incidencias");
  const frozenWorkOrders = historicoByMonth(dataset, "workOrders");
  const incidenciasImported = (month: string) =>
    publishedTotal(
      "incidencias",
      month,
      frozenIncidencias,
      value(incidentRows, month, row => row.mes, row => row.total)
    );
  const workOrdersImported = (month: string) =>
    publishedTotal(
      "workOrders",
      month,
      frozenWorkOrders,
      value(workOrders, month, row => row.mes, row => row.ordenes)
    );
  const incidenciasSeries = correctSeries(
    page,
    "Incidencias",
    "Incidencias",
    months,
    months.map(incidenciasImported)
  );
  const workOrdersSeries = correctSeries(
    page,
    "Work Orders",
    "Work Orders",
    months,
    months.map(workOrdersImported)
  );
  const incidenciasOf = (month: string) =>
    incidenciasSeries.drawn[months.indexOf(month)] ?? 0;
  const workOrdersOf = (month: string) =>
    workOrdersSeries.drawn[months.indexOf(month)] ?? 0;
  const data = months.map((month, index) => ({
    mes: monthLabel(month),
    incidencias: incidenciasSeries.drawn[index] ?? 0,
    workOrders: workOrdersSeries.drawn[index] ?? 0,
  }));
  const allSeries = [
    { key: "workOrders" as const, label: "Work Orders" },
    { key: "incidencias" as const, label: "Incidencias" },
  ];
  const hiddenRows = page.hiddenRows ?? [];
  const series: CategorySeries[] = allSeries
    .filter(entry => !hiddenRows.includes(entry.label))
    .map((entry, index, list) => ({
      ...entry,
      color: componentSeriesColor(index, list.length),
    }));
  const currentIncidencias = currentMonth ? incidenciasOf(currentMonth) : 0;
  const currentWorkOrders = currentMonth ? workOrdersOf(currentMonth) : 0;
  const distribution = series.map(entry => ({
    name: entry.label,
    value: entry.key === "workOrders" ? currentWorkOrders : currentIncidencias,
    color: entry.color,
  }));
  const donutTotal = distribution.reduce((sum, entry) => sum + entry.value, 0);

  return (
    <PageShell
      page={page}
      editing={editing}
      onChange={onChange}
      editor={
        editing && (
          <>
            <MonthRangeSelector
              selection={monthSelection}
              available={availableMonths}
              format={monthLabel}
              onChange={monthSelection => onChange({ monthSelection })}
            />

            <RowFilterPanel
              labels={allSeries.map(entry => entry.label)}
              hiddenRows={hiddenRows}
              scope={page.id}
              defaultHidden={[]}
              onChange={hiddenRows => onChange({ hiddenRows })}
            />

            <ValueGrid
              columns={months.map(monthLabel)}
              rows={[workOrdersSeries.row, incidenciasSeries.row]}
              onChange={(key, value) => onChange(withOverride(page, key, value))}
            />
          </>
        )
      }
    >
      <KpiRow
        compact
        items={[
          ...series.map(entry => ({
            label: entry.label,
            value: (entry.key === "workOrders"
              ? currentWorkOrders
              : currentIncidencias
            ).toLocaleString("es-ES"),
            accent: entry.color,
          })),
        ]}
      />

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.55fr)_minmax(0,0.45fr)] gap-[1.2cqi]">
        <section className="flex min-h-0 flex-col" aria-label="Work Orders e incidencias por mes">
          <h3 className="shrink-0 pb-[0.4cqi] font-mono text-[1.3cqi] font-medium text-muted-foreground">
            Work Orders e Incidencias
          </h3>
          {series.length > 0 && (
            <CategoryBarChart
              categoryKey="mes"
              series={series}
              data={data}
              fitGroupedValueLabels
              centerGroupedValueLabels
              allCategories
            />
          )}
        </section>

        <section className="flex min-h-0 flex-col" aria-label="Distribución del mes actual">
          <h3 className="shrink-0 pb-[0.3cqi] text-center font-mono text-[1.1cqi] font-medium leading-snug text-muted-foreground">
            Distribución del mes actual
            {currentMonth ? (
              <span className="mt-[0.15cqi] block">{monthLabel(currentMonth)}</span>
            ) : null}
          </h3>
          <div className="mx-auto min-h-0 w-[72%] flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={distribution}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="48%"
                  outerRadius="68%"
                  paddingAngle={0}
                  stroke="var(--background)"
                  strokeWidth={2}
                >
                  {distribution.map(entry => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                  <Label
                    position="center"
                    value={donutTotal.toLocaleString("es-ES")}
                    className="fill-foreground font-mono text-[1.7cqi] font-semibold"
                  />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mx-auto flex w-[18cqi] shrink-0 flex-col gap-[0.12cqi] font-mono text-[1cqi] text-muted-foreground">
            {distribution.map(entry => (
              <li
                key={entry.name}
                className="flex items-baseline justify-between gap-[0.7cqi] border-t border-border pt-[0.22cqi]"
              >
                <span>{entry.name}</span>
                <span className="whitespace-nowrap tabular-nums text-foreground">
                  {entry.value.toLocaleString("es-ES")}
                  {donutTotal > 0
                    ? ` · ${((entry.value / donutTotal) * 100).toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`
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
