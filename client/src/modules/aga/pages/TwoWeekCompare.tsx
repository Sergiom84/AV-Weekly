import CategoryBarChart, {
  type CategorySeries,
} from "@/components/deck/CategoryBarChart";
import KpiRow from "@/components/deck/KpiRow";
import type { AgaCount, AgaDataset } from "@shared/modules/aga/types";
import {
  COMPARE_COLORS,
  comparedWeeks,
  countsByLabel,
  orderedLabels,
  variationLabel,
  weekLabel,
} from "../aggregate";
import PageShell, { type AgaPageProps } from "./PageShell";

interface TwoWeekCompareProps extends AgaPageProps {
  dataset: AgaDataset;
  /** Label of the category axis, used as the chart row key. */
  categoryKey: string;
  /** Breakdown of a week the page charts, already filtered by the caller. */
  breakdownOf: (week: { byDepartment: AgaCount[]; byProject: AgaCount[] }) => AgaCount[];
}

/**
 * Body shared by the two comparison pages: grouped bars over a category axis,
 * one series per compared week, and the two totals with their variation on top.
 *
 * The only difference between the department and the project page is which
 * breakdown they read, so the layout lives here once.
 */
export default function TwoWeekCompare({
  page,
  editing,
  onChange,
  dataset,
  categoryKey,
  breakdownOf,
}: TwoWeekCompareProps) {
  const { previous, current } = comparedWeeks(dataset);

  const previousCounts = previous ? breakdownOf(previous) : [];
  const currentCounts = current ? breakdownOf(current) : [];
  const labels = orderedLabels([previousCounts, currentCounts]);

  const previousBy = countsByLabel(previousCounts);
  const currentBy = countsByLabel(currentCounts);

  const series: CategorySeries[] = [
    ...(previous
      ? [
          {
            key: "previa",
            label: weekLabel(previous.week, previous.reportWeek),
            color: COMPARE_COLORS[0],
          },
        ]
      : []),
    ...(current
      ? [
          {
            key: "actual",
            label: weekLabel(current.week, current.reportWeek),
            color: COMPARE_COLORS[1],
          },
        ]
      : []),
  ];

  const data = labels.map((label) => ({
    [categoryKey]: label,
    previa: previousBy.get(label) ?? 0,
    actual: currentBy.get(label) ?? 0,
  }));

  const sum = (counts: AgaCount[]) =>
    counts.reduce((total, entry) => total + entry.count, 0);

  const previousTotal = previous ? sum(previousCounts) : null;
  const currentTotal = current ? sum(currentCounts) : null;

  const items = [
    ...(previous
      ? [
          {
            label: weekLabel(previous.week, previous.reportWeek),
            value: (previousTotal ?? 0).toLocaleString("es-ES"),
          },
        ]
      : []),
    ...(current
      ? [
          {
            label: weekLabel(current.week, current.reportWeek),
            value: (currentTotal ?? 0).toLocaleString("es-ES"),
          },
        ]
      : []),
    { label: "Variación", value: variationLabel(previousTotal, currentTotal) },
  ];

  return (
    <PageShell page={page} editing={editing} onChange={onChange}>
      <KpiRow items={items} />

      <div className="flex min-h-0 flex-1 flex-col">
        <CategoryBarChart
          categoryKey={categoryKey}
          series={series}
          data={data}
          angledCategories
        />
      </div>
    </PageShell>
  );
}
