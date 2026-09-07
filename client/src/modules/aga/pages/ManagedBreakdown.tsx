import CategoryBarChart, {
  type CategorySeries,
} from "@/components/deck/CategoryBarChart";
import KpiRow from "@/components/deck/KpiRow";
import RowFilterPanel from "@/components/deck/RowFilterPanel";
import WeekRangeSelector from "@/components/deck/WeekRangeSelector";
import { resolveWeekSelection, type WeekSelection } from "@shared/deck/core";
import {
  breakdownForWeeks,
  locationShareAt,
  topLocationShare,
} from "@shared/modules/aga/managed";
import type { AgaBreakdownRow, AgaDataset } from "@shared/modules/aga/types";
import {
  COMPARE_COLORS,
  agaColor,
  variationLabel,
  weekLabel,
  weekNumber,
} from "../aggregate";
import {
  cellKey,
  isOverridden,
  overriddenValue,
  withOverride,
} from "../overrides";
import PageShell, { type AgaPageProps } from "./PageShell";
import ValueGrid from "./AgaValueGrid";

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
  const defaultSelection: WeekSelection = {
    mode: "list",
    from: availableWeeks[Math.max(0, availableWeeks.length - 2)] ?? 1,
    to: availableWeeks[availableWeeks.length - 1] ?? 1,
    weeks: availableWeeks.slice(-2),
  };
  const selection = page.weekSelection ?? defaultSelection;
  const selectedWeeks = new Set(
    resolveWeekSelection(selection, availableWeeks)
  );
  const weeks = allWeeks.filter(week => {
    const number = weekNumber(week);
    return number !== null && selectedWeeks.has(number);
  });
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
      ? COMPARE_COLORS[index % COMPARE_COLORS.length]
      : agaColor(0);

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

  const locationShare =
    topShare && weeks.length > 0
      ? locationShareAt(dataset.managed, weeks[weeks.length - 1])
      : topShare
        ? topLocationShare(dataset.managed)
        : null;
  const items = weeks.map((week, index) => {
    const isLatestLocation =
      topShare && index === weeks.length - 1 && locationShare;

    return {
      label:
        isLatestLocation && !locationShare.complete
          ? `Subtotal ${weekLabel(week)}`
          : weekLabel(week),
      value: (isLatestLocation
        ? locationShare.total
        : totalAt(index)
      ).toLocaleString("es-ES"),
    };
  });

  if (weeks.length > 1) {
    items.push({
      label: "Variación",
      value: variationLabel(
        totalAt(weeks.length - 2),
        totalAt(weeks.length - 1)
      ),
    });
  }

  if (topShare && weeks.length > 0) {
    const last = weeks.length - 1;
    const total = locationShare?.total ?? totalAt(last);
    const top = entries.reduce(
      (best, entry) =>
        best === null || (entry.cells[last]?.value ?? 0) > best.count
          ? { label: entry.label, count: entry.cells[last]?.value ?? 0 }
          : best,
      null as { label: string; count: number } | null
    );

    if (top && total > 0) {
      items.push(
        { label: top.label, value: top.count.toLocaleString("es-ES") },
        {
          label: locationShare?.complete
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
