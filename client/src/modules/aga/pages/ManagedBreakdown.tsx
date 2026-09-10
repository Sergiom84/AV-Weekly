import CategoryBarChart, {
  type CategorySeries,
} from "@/components/deck/CategoryBarChart";
import KpiRow, { type KpiItem } from "@/components/deck/KpiRow";
import RowFilterPanel from "@/components/deck/RowFilterPanel";
import WeekRangeSelector from "@/components/deck/WeekRangeSelector";
import {
  COMPARED_WEEK_WINDOW,
  extendWeekRangeToLatest,
  followLatestWeekSelection,
  resolveWeekSelection,
  type WeekSelection,
} from "@shared/deck/core";
import {
  breakdownForWeeks,
  statedLocationTotal,
} from "@shared/modules/aga/managed";
import type { AgaBreakdownRow, AgaDataset } from "@shared/modules/aga/types";
import {
  COMPARED_WEEK_FOLLOWS,
  variationLabel,
  weekHeadline,
  weekLabel,
  weekNumber,
} from "../aggregate";
import { componentSeriesColor } from "@/lib/yearSeries";
import {
  cellKey,
  isOverridden,
  overriddenValue,
  withOverride,
} from "../overrides";
import PageShell, { type AgaPageProps } from "./PageShell";
import ValueGrid from "@/components/deck/EditorValueGrid";

interface ManagedBreakdownProps extends AgaPageProps {
  dataset: AgaDataset;
  /** Rows the page charts, already picked by the caller. */
  rows: AgaBreakdownRow[];
  /** Label of the category axis, used as the chart row key. */
  categoryKey: string;
  /**
   * Adds the share of the busiest category to the headline figures. Slide 2.4
   * is the only one that states it.
   */
  topShare?: boolean;
  /**
   * Bars drawn, taken from the top of the latest week. Undefined draws every
   * row, which is what the department and location slides want.
   */
  limit?: number;
}

/**
 * Body shared by slides 2.2 to 2.7: bars over a category axis, one series per
 * reported week.
 *
 * The number of series is read from the data, not declared per slide: the
 * department and product breakdowns carry the two compared weeks, while the
 * location and the per-department product breakdowns carry only the last one.
 * A slide that hardcoded two series would draw a row of zeros for the missing
 * week the moment the source stops shipping it.
 */
export default function ManagedBreakdown({
  page,
  editing,
  onChange,
  dataset,
  rows,
  categoryKey,
  topShare = false,
  limit,
}: ManagedBreakdownProps) {
  const reported = new Set(rows.flatMap(row => row.counts.map(c => c.week)));
  const allWeeks = Array.from(reported).sort();
  const availableWeeks = allWeeks
    .map(week => weekNumber(week))
    .filter((week): week is number => week !== null);
  // A trailing window, not the concrete pair: an absolute range freezes on the
  // weeks it was saved with and the slide keeps comparing them upload after
  // upload, which is how slides 2.2 to 2.7 got stuck on S34–S35.
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
  // Two weeks whatever the selection resolves to: see `TwoWeekCompare`.
  const weeks = allWeeks
    .filter(week => {
      const number = weekNumber(week);
      return number !== null && selectedWeeks.has(number);
    })
    .slice(-COMPARED_WEEK_WINDOW);
  const allImported = breakdownForWeeks(rows, weeks);
  const labels = allImported.map(row => row.label);
  const hiddenRows = page.hiddenRows ?? [];
  const visibleImported = allImported.filter(
    row => !hiddenRows.includes(row.label)
  );
  const imported = limit ? visibleImported.slice(0, limit) : visibleImported;

  const entries = imported.map(row => ({
    label: row.label,
    cells: weeks.map((week, index) => {
      const key = cellKey(row.label, week);

      return {
        key,
        value: overriddenValue(page, key, row.counts[index]),
        overridden: isOverridden(page, key),
      };
    }),
  }));

  const colorAt = (index: number) =>
    weeks.length > 1
      ? componentSeriesColor(index, weeks.length)
      : componentSeriesColor(0, 1);

  const series: CategorySeries[] = weeks.map((week, index) => ({
    key: `w${index}`,
    label: weekLabel(week),
    color: colorAt(index),
  }));

  const data = entries.map(entry => {
    const row: Record<string, number | string> = { [categoryKey]: entry.label };

    entry.cells.forEach((cell, index) => {
      row[`w${index}`] = cell.value ?? 0;
    });

    return row;
  });

  const totalAt = (index: number) =>
    entries.reduce((sum, entry) => sum + (entry.cells[index]?.value ?? 0), 0);

  /**
   * The total the slide states for a week, and the one every figure derived
   * from it has to use: the headline, the variation and the share.
   *
   * Slide 2.4 used to state the declared total next to a variation computed on
   * the sum of the bars, which are not the same number when a building is
   * unmapped, so the two disagreed by the positions that carry no location.
   */
  const statedAt = (index: number) =>
    topShare
      ? statedLocationTotal(dataset.managed, weeks[index], totalAt(index))
      : { total: totalAt(index), complete: true };
  const totalFor = (index: number) => statedAt(index).total;

  const weekCards: KpiItem[] = weeks.map((week, index) => ({
    label: statedAt(index).complete
      ? weekHeadline(week)
      : `Subtotal ${weekHeadline(week)}`,
    value: totalFor(index).toLocaleString("es-ES"),
    accent: colorAt(index),
  }));
  const extraCards: KpiItem[] = [];

  if (weeks.length > 1) {
    extraCards.push({
      label: "Variación",
      value: variationLabel(
        totalFor(weeks.length - 2),
        totalFor(weeks.length - 1)
      ),
    });
  }

  if (topShare && weeks.length > 0) {
    const last = weeks.length - 1;
    const total = totalFor(last);
    const top = entries.reduce(
      (best, entry) =>
        best === null || (entry.cells[last]?.value ?? 0) > best.count
          ? { label: entry.label, count: entry.cells[last]?.value ?? 0 }
          : best,
      null as { label: string; count: number } | null
    );

    if (top && total > 0) {
      extraCards.push(
        { label: top.label, value: top.count.toLocaleString("es-ES") },
        {
          label: statedAt(last).complete
            ? `Cuota ${top.label}`
            : `Cuota ${top.label} sobre subtotal`,
          value: `${((top.count / total) * 100).toFixed(1).replace(".", ",")}%`,
        }
      );
    }
  }

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

          {editing && (
            <ValueGrid
              columns={weeks.map(week => weekLabel(week))}
              rows={entries.map(entry => ({
                label: entry.label,
                cells: entry.cells,
              }))}
              onChange={(key, value) =>
                onChange(withOverride(page, key, value))
              }
            />
          )}
        </>
      }
    >
      <KpiRow items={[...weekCards, ...extraCards]} />

      <div className="flex min-h-0 flex-1 flex-col">
        <CategoryBarChart
          categoryKey={categoryKey}
          series={series}
          data={data}
          angledCategories
          fitCategoryStart={page.id !== "aga-gestionadas-ubicacion"}
        />
      </div>
    </PageShell>
  );
}
