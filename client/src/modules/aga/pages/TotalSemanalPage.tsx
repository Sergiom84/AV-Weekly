import CategoryBarChart, {
  type CategorySeries,
} from "@/components/deck/CategoryBarChart";
import KpiRow from "@/components/deck/KpiRow";
import WeekRangeSelector from "@/components/deck/WeekRangeSelector";
import {
  defaultWeekSelection,
  extendWeekRangeToLatest,
  resolveWeekSelection,
} from "@shared/deck/core";
import type { AgaDataset } from "@shared/modules/aga/types";
import {
  comparedWeeks,
  variationLabel,
  weekHeadline,
  weekLabel,
  weekNumber,
} from "../aggregate";
import { componentSeriesColor } from "@/lib/yearSeries";
import ValueGrid from "@/components/deck/EditorValueGrid";
import {
  TOTAL_ROW,
  cellKey,
  isOverridden,
  overriddenValue,
  withOverride,
} from "../overrides";
import PageShell, { type AgaPageProps } from "./PageShell";

interface TotalSemanalPageProps extends AgaPageProps {
  dataset: AgaDataset;
}

const SERIES: CategorySeries[] = [
  { key: "total", label: "Posiciones", color: componentSeriesColor(0, 1) },
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
  // The saved end follows the newest week: see `extendWeekRangeToLatest`.
  const selection = extendWeekRangeToLatest(
    page.weekSelection ?? defaultWeekSelection(availableWeeks.at(-1) ?? 1),
    availableWeeks
  );
  const selectedWeeks = new Set(
    resolveWeekSelection(selection, availableWeeks)
  );

  const entries = weeks.map(week => {
    const key = cellKey(TOTAL_ROW, week.week);

    return {
      week: week.week,
      reportWeek: week.reportWeek,
      key,
      value: overriddenValue(page, key, week.total),
      overridden: isOverridden(page, key),
    };
  });
  const charted = entries.filter(entry => {
    const number = weekNumber(entry.week, entry.reportWeek);
    return number !== null && selectedWeeks.has(number) && entry.value !== null;
  });
  const data = charted.map(entry => ({
    semana: weekLabel(entry.week, entry.reportWeek),
    total: entry.value ?? 0,
  }));
  const correctedTotal = (week: string | undefined) =>
    entries.find(entry => entry.week === week)?.value ?? null;

  // Compared week in the 2025 cyan, current one in the 2026 navy, the pairing
  // the compared slides of the deck already use.
  const items = [
    ...(previous
      ? [
          {
            label: weekHeadline(previous.week, previous.reportWeek),
            value: (correctedTotal(previous.week) ?? 0).toLocaleString("es-ES"),
            accent: componentSeriesColor(0, 2),
          },
        ]
      : []),
    ...(current
      ? [
          {
            label: weekHeadline(current.week, current.reportWeek),
            value: (correctedTotal(current.week) ?? 0).toLocaleString("es-ES"),
            accent: componentSeriesColor(1, 2),
          },
        ]
      : []),
    {
      label: "Variación",
      value: variationLabel(
        previous ? correctedTotal(previous.week) : null,
        current ? correctedTotal(current.week) : null
      ),
    },
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
              onChange={weekSelection => onChange({ weekSelection })}
            />
          )}

          {editing && (
            <ValueGrid
              columns={entries.map(entry =>
                weekLabel(entry.week, entry.reportWeek)
              )}
              rows={[
                {
                  label: "Posiciones",
                  color: componentSeriesColor(0, 1),
                  cells: entries.map(entry => ({
                    key: entry.key,
                    value: entry.value,
                    overridden: entry.overridden,
                  })),
                },
              ]}
              onChange={(key, value) => onChange(withOverride(page, key, value))}
            />
          )}
        </>
      }
    >
      <KpiRow items={items} />

      <div className="flex min-h-0 flex-1 flex-col">
        <CategoryBarChart categoryKey="semana" series={SERIES} data={data} />
      </div>
    </PageShell>
  );
}
