import CategoryBarChart, {
  type CategorySeries,
} from "@/components/deck/CategoryBarChart";
import KpiRow from "@/components/deck/KpiRow";
import { breakdownForWeeks, lastTwoWeeks } from "@shared/modules/aga/managed";
import type { AgaBreakdownRow, AgaDataset } from "@shared/modules/aga/types";
import { COMPARE_COLORS, agaColor, variationLabel, weekLabel } from "../aggregate";
import { cellKey, isOverridden, overriddenValue, withOverride } from "../overrides";
import PageShell, { type AgaPageProps } from "./PageShell";
import ValueGrid from "@/components/deck/ValueGrid";

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
}: ManagedBreakdownProps) {
  const reported = new Set(rows.flatMap((row) => row.counts.map((c) => c.week)));
  const weeks = lastTwoWeeks(dataset.managed).filter((week) => reported.has(week));
  const imported = breakdownForWeeks(rows, weeks);

  const entries = imported.map((row) => ({
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
    weeks.length > 1 ? COMPARE_COLORS[index % COMPARE_COLORS.length] : agaColor(0);

  const series: CategorySeries[] = weeks.map((week, index) => ({
    key: `w${index}`,
    label: weekLabel(week),
    color: colorAt(index),
  }));

  const data = entries.map((entry) => {
    const row: Record<string, number | string> = { [categoryKey]: entry.label };

    entry.cells.forEach((cell, index) => {
      row[`w${index}`] = cell.value ?? 0;
    });

    return row;
  });

  const totalAt = (index: number) =>
    entries.reduce((sum, entry) => sum + (entry.cells[index]?.value ?? 0), 0);

  const items = weeks.map((week, index) => ({
    label: weekLabel(week),
    value: totalAt(index).toLocaleString("es-ES"),
  }));

  if (weeks.length > 1) {
    items.push({
      label: "Variación",
      value: variationLabel(totalAt(weeks.length - 2), totalAt(weeks.length - 1)),
    });
  }

  if (topShare && weeks.length > 0) {
    const last = weeks.length - 1;
    const total = totalAt(last);
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
          label: `Cuota ${top.label}`,
          value: `${((top.count / total) * 100).toFixed(1).replace(".", ",")}%`,
        }
      );
    }
  }

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

      {editing && (
        <ValueGrid
          columns={weeks.map(weekLabel)}
          rows={entries.map((entry) => ({
            label: entry.label,
            cells: entry.cells,
          }))}
          onChange={(key, value) => onChange(withOverride(page, key, value))}
        />
      )}
    </PageShell>
  );
}
