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
  variationLabel,
  weekHeadline,
  weekLabel,
  weekNumber,
} from "../aggregate";
import { componentSeriesColor } from "@/lib/yearSeries";
import {
  TOTAL_ROW,
  cellKey,
  isOverridden,
  overriddenValue,
  withOverride,
} from "../overrides";
import PageShell, { type AgaPageProps } from "./PageShell";
import ValueGrid from "@/components/deck/EditorValueGrid";

interface GestionadasTotalPageProps extends AgaPageProps {
  dataset: AgaDataset;
}

const SERIES: CategorySeries[] = [
  { key: "total", label: "Posiciones gestionadas", color: componentSeriesColor(0, 1) },
];

/**
 * `2.1 Total posiciones gestionadas por semana`: one column per reported week.
 *
 * The variation is read on the standard base, `(actual − previa) / previa`, the
 * same one slide 1.1 uses. `managedWeeklyDelta` also exposes the inverse base
 * because the presented pptx states a figure neither base reproduces exactly;
 * that figure is typed by hand in the deck and is not adopted here — a headline
 * that disagrees with the bars above it is worse than one that differs from the
 * printed copy.
 */
export default function GestionadasTotalPage({
  page,
  editing,
  onChange,
  dataset,
}: GestionadasTotalPageProps) {
  const totals = dataset.managed?.weeklyTotals ?? [];
  const availableWeeks = totals
    .map(entry => weekNumber(entry.week))
    .filter((week): week is number => week !== null);
  // The saved end follows the newest week: see `extendWeekRangeToLatest`.
  const selection = extendWeekRangeToLatest(
    page.weekSelection ?? defaultWeekSelection(availableWeeks.at(-1) ?? 1),
    availableWeeks
  );
  const selectedWeeks = new Set(
    resolveWeekSelection(selection, availableWeeks)
  );

  const entries = totals.map(entry => {
    const key = cellKey(TOTAL_ROW, entry.week);

    return {
      week: entry.week,
      key,
      value: overriddenValue(page, key, entry.total),
      overridden: isOverridden(page, key),
    };
  });

  // A week whose correction cleared the figure leaves the slide instead of
  // charting a zero: an empty cell means "this week has no reading", and a bar
  // at zero next to eight hundred positions reads as a week where the service
  // closed nothing.
  const charted = entries.filter(entry => {
    const number = weekNumber(entry.week);
    return number !== null && selectedWeeks.has(number) && entry.value !== null;
  });

  const data = charted.map(entry => ({
    semana: weekLabel(entry.week),
    total: entry.value ?? 0,
  }));

  // The headline pair is read from the charted weeks, not from every week the
  // import carries: the cards used to name the last two weeks of the dataset
  // even when the slide was showing a range that excluded them, so a stray week
  // dated ahead of the report retitled the slide and its variation.
  const previous = charted[charted.length - 2] ?? null;
  const current = charted[charted.length - 1] ?? null;

  // The two weeks are told apart by colour, the compared one in the 2025 cyan
  // and the current one in the 2026 navy, which is the pairing every compared
  // slide of the deck already uses.
  const items = [
    ...(previous
      ? [
          {
            label: weekHeadline(previous.week),
            value: (previous.value ?? 0).toLocaleString("es-ES"),
            accent: componentSeriesColor(0, 2),
          },
        ]
      : []),
    ...(current
      ? [
          {
            label: weekHeadline(current.week),
            value: (current.value ?? 0).toLocaleString("es-ES"),
            accent: componentSeriesColor(1, 2),
          },
        ]
      : []),
    {
      label: "Variación",
      value: variationLabel(previous?.value ?? null, current?.value ?? null),
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
              columns={entries.map(entry => weekLabel(entry.week))}
              rows={[
                {
                  label: "Gestionadas",
                  color: componentSeriesColor(0, 1),
                  cells: entries.map(entry => ({
                    key: entry.key,
                    value: entry.value,
                    overridden: entry.overridden,
                  })),
                },
              ]}
              onChange={(key, value) =>
                onChange(withOverride(page, key, value))
              }
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
