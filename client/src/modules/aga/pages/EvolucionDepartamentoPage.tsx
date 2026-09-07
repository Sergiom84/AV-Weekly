import CategoryBarChart, {
  type CategorySeries,
} from "@/components/deck/CategoryBarChart";
import RowFilterPanel from "@/components/deck/RowFilterPanel";
import WeekRangeSelector from "@/components/deck/WeekRangeSelector";
import { defaultWeekSelection, resolveWeekSelection } from "@shared/deck/core";
import type { AgaDataset } from "@shared/modules/aga/types";
import {
  agaColor,
  countsByLabel,
  orderedLabels,
  weekLabel,
  weekNumber,
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
  const availableWeeks = weeks
    .map(week => weekNumber(week.week, week.reportWeek))
    .filter((week): week is number => week !== null);
  const selection =
    page.weekSelection ?? defaultWeekSelection(availableWeeks.at(-1) ?? 1);
  const selectedWeeks = new Set(
    resolveWeekSelection(selection, availableWeeks)
  );
  const selectedEntries = weeks.filter(week => {
    const number = weekNumber(week.week, week.reportWeek);
    return number !== null && selectedWeeks.has(number);
  });
  const breakdowns = selectedEntries.map(week =>
    withoutSupport(week.byDepartment)
  );
  const labels = orderedLabels(breakdowns);
  const hiddenRows = page.hiddenRows ?? [];
  const visibleLabels = labels.filter(label => !hiddenRows.includes(label));

  const series: CategorySeries[] = visibleLabels.map((label, index) => ({
    key: `d${index}`,
    label,
    color: agaColor(index),
  }));

  const data = selectedEntries.map((week, position) => {
    const counts = countsByLabel(breakdowns[position]);
    const entry: Record<string, number | string> = {
      semana: weekLabel(week.week, week.reportWeek),
    };

    visibleLabels.forEach((label, index) => {
      entry[`d${index}`] = counts.get(label) ?? 0;
    });

    return entry;
  });

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
      <div className="flex min-h-0 flex-1 flex-col">
        <CategoryBarChart
          categoryKey="semana"
          series={series}
          data={data}
          stacked
        />
      </div>
    </PageShell>
  );
}
