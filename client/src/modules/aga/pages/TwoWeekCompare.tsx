import CategoryBarChart, {
  type CategorySeries,
} from "@/components/deck/CategoryBarChart";
import KpiRow from "@/components/deck/KpiRow";
import RowFilterPanel from "@/components/deck/RowFilterPanel";
import WeekRangeSelector from "@/components/deck/WeekRangeSelector";
import {
  COMPARED_WEEK_WINDOW,
  extendWeekRangeToLatest,
  followLatestWeekSelection,
  resolveWeekSelection,
  type WeekSelection,
} from "@shared/deck/core";
import type { AgaCount, AgaDataset } from "@shared/modules/aga/types";
import {
  COMPARED_WEEK_FOLLOWS,
  countsByLabel,
  orderedLabels,
  variationLabel,
  weekHeadline,
  weekLabel,
  weekNumber,
} from "../aggregate";
import { componentSeriesColor } from "@/lib/yearSeries";
import PageShell, { type AgaPageProps } from "./PageShell";

interface TwoWeekCompareProps extends AgaPageProps {
  dataset: AgaDataset;
  /** Label of the category axis, used as the chart row key. */
  categoryKey: string;
  /** Breakdown of a week the page charts, already filtered by the caller. */
  breakdownOf: (week: {
    byDepartment: AgaCount[];
    byProject: AgaCount[];
  }) => AgaCount[];
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
  const entries = dataset.weeks ?? [];
  const availableWeeks = entries
    .map(entry => weekNumber(entry.week, entry.reportWeek))
    .filter((week): week is number => week !== null);
  // A trailing window, not the concrete pair: see `COMPARED_WEEK_WINDOW`.
  const defaultSelection: WeekSelection = followLatestWeekSelection(
    COMPARED_WEEK_WINDOW
  );
  const selection = extendWeekRangeToLatest(
    page.weekSelection ?? defaultSelection,
    availableWeeks
  );
  const selectedWeeks = new Set(
    resolveWeekSelection(selection, availableWeeks)
  );
  // The slide compares two weeks whatever the selection resolves to. A range
  // saved on this page would otherwise draw a third series once it is extended,
  // and the headline would compare the last two of three charted weeks.
  const selectedEntries = entries
    .filter(entry => {
      const week = weekNumber(entry.week, entry.reportWeek);
      return week !== null && selectedWeeks.has(week);
    })
    .slice(-COMPARED_WEEK_WINDOW);
  const breakdowns = selectedEntries.map(breakdownOf);
  const labels = orderedLabels(breakdowns);
  const hiddenRows = page.hiddenRows ?? [];
  const visibleLabels = labels.filter(label => !hiddenRows.includes(label));

  const series: CategorySeries[] = selectedEntries.map((entry, index) => ({
    key: `w${index}`,
    label: weekLabel(entry.week, entry.reportWeek),
    color: componentSeriesColor(index, selectedEntries.length),
  }));

  const data = visibleLabels.map(label => {
    const row: Record<string, number | string> = { [categoryKey]: label };

    breakdowns.forEach((breakdown, index) => {
      row[`w${index}`] = countsByLabel(breakdown).get(label) ?? 0;
    });

    return row;
  });

  const sum = (counts: AgaCount[]) =>
    counts.reduce((total, entry) => total + entry.count, 0);

  const previous = selectedEntries[selectedEntries.length - 2] ?? null;
  const current = selectedEntries[selectedEntries.length - 1] ?? null;
  const previousTotal = previous
    ? sum(breakdowns[breakdowns.length - 2] ?? [])
    : null;
  const currentTotal = current
    ? sum(breakdowns[breakdowns.length - 1] ?? [])
    : null;

  const items = [
    ...(previous
      ? [
          {
            label: weekHeadline(previous.week, previous.reportWeek),
            value: (previousTotal ?? 0).toLocaleString("es-ES"),
            accent: componentSeriesColor(0, 2),
          },
        ]
      : []),
    ...(current
      ? [
          {
            label: weekHeadline(current.week, current.reportWeek),
            value: (currentTotal ?? 0).toLocaleString("es-ES"),
            accent: componentSeriesColor(1, 2),
          },
        ]
      : []),
    { label: "Variación", value: variationLabel(previousTotal, currentTotal) },
  ];

  return (
    <PageShell
      page={page}
      editing={editing}
      onChange={onChange}
      editor={
        <>
          {editing && (
            <WeekRangeSelector
              selection={selection}
              available={availableWeeks}
              follows={COMPARED_WEEK_FOLLOWS}
              onChange={weekSelection => onChange({ weekSelection })}
            />
          )}

          {editing && (
            <RowFilterPanel
              labels={labels}
              hiddenRows={hiddenRows}
              scope={page.id}
              defaultHidden={[]}
              onChange={hiddenRows => onChange({ hiddenRows })}
            />
          )}
        </>
      }
    >
      <KpiRow items={items} />

      <div className="flex min-h-0 flex-1 flex-col">
        <CategoryBarChart
          categoryKey={categoryKey}
          series={series}
          data={data}
          angledCategories
          fitCategoryStart={page.id === "aga-comparativa-departamento"}
        />
      </div>
    </PageShell>
  );
}
