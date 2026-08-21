import KpiRow from "@/components/deck/KpiRow";
import SeriesLineChart, {
  type LineSeries,
} from "@/components/deck/SeriesLineChart";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import {
  monthLabel,
  reportMonth,
  reportMonths,
  seriesColor,
} from "../aggregate";
import {
  HIC_ASSIGNED,
  HIC_RESOLVED,
  hicScopeLabel,
  hicScopes,
} from "../sources";
import PageShell, { type InformaticaPageProps } from "./PageShell";

interface HicPageProps extends InformaticaPageProps {
  dataset: InformaticaDataset;
}

/** Metrics drawn, in the order the report reads them. */
const METRICS = [HIC_RESOLVED, HIC_ASSIGNED];

/**
 * `2.1.1 Volumetría de Incidencias y Work Orders`: the two monthly incident
 * series of the `Hic` sheet, resolved against assigned, over every month the
 * workbook carries.
 *
 * Lines, not columns: eighteen months by four series is seventy-two bars, and
 * the point of the slide is the shape of the year, not each month's exact
 * figure — those are on 2.1.1's second page and in the tooltip.
 *
 * The sheet also reports `Asignaciones`, an assignment count rather than an
 * incident count: it double-counts a ticket reassigned between groups, so it is
 * deliberately left off a chart about volume.
 */
export default function HicPage({
  page,
  editing,
  onChange,
  dataset,
}: HicPageProps) {
  const rows = dataset.hic ?? [];
  const scopes = hicScopes(rows);
  const totals = rows.filter(row => row.categoria === "");
  const months = reportMonths(dataset, totals, row => row.mes);
  const month = reportMonth(dataset, totals, row => row.mes);

  const drawn = [scopes.main, scopes.secondary].filter(
    (scope): scope is string => scope !== null
  );

  const series: LineSeries[] = drawn.flatMap((scope, scopeIndex) =>
    METRICS.map((metric, metricIndex) => ({
      key: `${scopeIndex}-${metric}`,
      label: `${hicScopeLabel(scope, scopes)} · ${metric.toLowerCase()}`,
      color: seriesColor(scopeIndex * METRICS.length + metricIndex),
    }))
  );

  const valueOf = (scope: string, metric: string, target: string) =>
    totals
      .filter(
        row =>
          row.ambito === scope && row.metrica === metric && row.mes === target
      )
      .reduce((sum, row) => sum + row.total, 0);

  // A month a scope was not reported on stays null: `SeriesLineChart` draws it
  // as a gap, which is what "not measured" looks like. Zero would read as
  // "none", a different claim.
  const reported = new Set(totals.map(row => `${row.ambito}|${row.mes}`));

  const data = months.map(target => {
    const entry: Record<string, number | string | null> = {
      mes: monthLabel(target),
    };

    drawn.forEach((scope, scopeIndex) => {
      const known = reported.has(`${scope}|${target}`);

      for (const metric of METRICS) {
        entry[`${scopeIndex}-${metric}`] = known
          ? valueOf(scope, metric, target)
          : null;
      }
    });

    return entry;
  });

  const suffix = month ? ` ${monthLabel(month)}` : "";

  const kpis = drawn.flatMap(scope =>
    METRICS.map(metric => ({
      label: `${hicScopeLabel(scope, scopes)} ${metric.toLowerCase()}${suffix}`,
      value: month ? valueOf(scope, metric, month).toLocaleString("es-ES") : "",
    }))
  );

  return (
    <PageShell page={page} editing={editing} onChange={onChange}>
      <KpiRow items={kpis} />

      <div className="flex min-h-0 flex-1 flex-col">
        <SeriesLineChart categoryKey="mes" series={series} data={data} />
      </div>
    </PageShell>
  );
}
