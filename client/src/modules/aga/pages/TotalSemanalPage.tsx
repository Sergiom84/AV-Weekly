import CategoryBarChart, {
  type CategorySeries,
} from "@/components/deck/CategoryBarChart";
import KpiRow from "@/components/deck/KpiRow";
import WeekRangeSelector from "@/components/deck/WeekRangeSelector";
import { defaultWeekSelection, resolveWeekSelection } from "@shared/deck/core";
import type { AgaDataset } from "@shared/modules/aga/types";
import {
  agaColor,
  comparedWeeks,
  variationLabel,
  weekLabel,
  weekNumber,
} from "../aggregate";
import PageShell, { type AgaPageProps } from "./PageShell";

interface TotalSemanalPageProps extends AgaPageProps {
  dataset: AgaDataset;
}

const SERIES: CategorySeries[] = [
  { key: "total", label: "Posiciones", color: agaColor(0) },
];

/**
 * `Total posiciones en gestión por semana`: one column per week of the stored
 * history, plus the headline figures of the last two weeks and the variation
 * between them.
 */
export default function TotalSemanalPage({
  page,
  editing,
  onChange,
  dataset,
}: TotalSemanalPageProps) {
  const weeks = dataset.weeks ?? [];
  const { previous, current } = comparedWeeks(dataset);
  const availableWeeks = weeks
    .map(week => weekNumber(week.week, week.reportWeek))
    .filter((week): week is number => week !== null);
  const selection =
    page.weekSelection ?? defaultWeekSelection(availableWeeks.at(-1) ?? 1);
  const selectedWeeks = new Set(
    resolveWeekSelection(selection, availableWeeks)
  );

  const data = weeks
    .filter(week => {
      const number = weekNumber(week.week, week.reportWeek);
      return number !== null && selectedWeeks.has(number);
    })
    .map(week => ({
      semana: weekLabel(week.week, week.reportWeek),
      total: week.total,
    }));

  const items = [
    ...(previous
      ? [
          {
            label: weekLabel(previous.week, previous.reportWeek),
            value: previous.total.toLocaleString("es-ES"),
          },
        ]
      : []),
    ...(current
      ? [
          {
            label: weekLabel(current.week, current.reportWeek),
            value: current.total.toLocaleString("es-ES"),
          },
        ]
      : []),
    {
      label: "Variación",
      value: variationLabel(previous?.total ?? null, current?.total ?? null),
    },
  ];

  return (
    <PageShell page={page} editing={editing} onChange={onChange}>
      <KpiRow items={items} />

      {editing && (
        <WeekRangeSelector
          selection={selection}
          available={availableWeeks}
          onChange={weekSelection => onChange({ weekSelection })}
        />
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        <CategoryBarChart categoryKey="semana" series={SERIES} data={data} />
      </div>
    </PageShell>
  );
}
