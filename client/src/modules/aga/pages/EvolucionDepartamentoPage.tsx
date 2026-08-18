import CategoryBarChart, {
  type CategorySeries,
} from "@/components/deck/CategoryBarChart";
import type { AgaDataset } from "@shared/modules/aga/types";
import {
  agaColor,
  countsByLabel,
  orderedLabels,
  weekLabel,
  withoutSupport,
} from "../aggregate";
import PageShell, { type AgaPageProps } from "./PageShell";

interface EvolucionDepartamentoPageProps extends AgaPageProps {
  dataset: AgaDataset;
}

/**
 * `Evolución semanal por departamento`: one stacked column per week, one
 * segment per department. Regional support is out of the chart — see
 * `EXCLUDED_DEPARTMENT`.
 *
 * Stacked rather than grouped: with ten departments over ten weeks the grouped
 * variant puts a hundred hairline bars on the axis and nothing is readable.
 */
export default function EvolucionDepartamentoPage({
  page,
  editing,
  onChange,
  dataset,
}: EvolucionDepartamentoPageProps) {
  const weeks = dataset.weeks ?? [];
  const breakdowns = weeks.map((week) => withoutSupport(week.byDepartment));
  const labels = orderedLabels(breakdowns);

  const series: CategorySeries[] = labels.map((label, index) => ({
    key: `d${index}`,
    label,
    color: agaColor(index),
  }));

  const data = weeks.map((week, position) => {
    const counts = countsByLabel(breakdowns[position]);
    const entry: Record<string, number | string> = {
      semana: weekLabel(week.week),
    };

    labels.forEach((label, index) => {
      entry[`d${index}`] = counts.get(label) ?? 0;
    });

    return entry;
  });

  return (
    <PageShell page={page} editing={editing} onChange={onChange}>
      <div className="flex min-h-0 flex-1 flex-col">
        <CategoryBarChart categoryKey="semana" series={series} data={data} stacked />
      </div>
    </PageShell>
  );
}
