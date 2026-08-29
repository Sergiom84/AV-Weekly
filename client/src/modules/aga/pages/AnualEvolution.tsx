import { MONTH_LABELS } from "@shared/deck/core";
import type { AgaYearSeries } from "@shared/modules/aga/types";
import KpiRow from "@/components/deck/KpiRow";
import { yearSeriesColor } from "@/lib/yearSeries";
import YearSelector from "@/components/deck/YearSelector";
import {
  cellKey,
  isOverridden,
  overriddenValue,
  withOverride,
} from "../overrides";
import PageShell, { type AgaPageProps } from "./PageShell";
import SeriesLineChart, {
  type LineSeries,
} from "@/components/deck/SeriesLineChart";
import ValueGrid from "@/components/deck/ValueGrid";

interface AnualEvolutionProps extends AgaPageProps {
  /** One entry per year, ascending, each with the twelve months. */
  years: AgaYearSeries[];
}

/**
 * Body shared by slides 3.1 and 3.2: the twelve months on the axis and one line
 * per year, so the years overlap instead of running end to end.
 *
 * The running year is short of months and its `null`s are left as gaps: a line
 * that dropped to zero in September would read as a collapse in volume.
 */
export default function AnualEvolution({
  page,
  editing,
  onChange,
  years,
}: AnualEvolutionProps) {
  // The annual presentation compares 2024 onward. Earlier history remains
  // imported but is intentionally outside the report's visible comparison.
  const availableYears = Array.from(
    new Set(years.map(serie => serie.year).filter(year => year >= 2024))
  ).sort((a, b) => a - b);
  const selectedYears = page.years
    ? page.years.filter(year => availableYears.includes(year))
    : availableYears;
  const entries = years
    .filter(serie => selectedYears.includes(serie.year))
    .sort((a, b) => a.year - b.year)
    .map(serie => ({
      year: serie.year,
      key: `y${serie.year}`,
      color: yearSeriesColor(serie.year),
      cells: MONTH_LABELS.map((_, monthIndex) => {
        const key = cellKey(String(serie.year), String(monthIndex));

        return {
          key,
          value: overriddenValue(page, key, serie.values[monthIndex] ?? null),
          overridden: isOverridden(page, key),
        };
      }),
    }));

  const series: LineSeries[] = entries.map(entry => ({
    key: entry.key,
    label: String(entry.year),
    color: entry.color,
  }));

  const data = MONTH_LABELS.map((label, monthIndex) => {
    const row: Record<string, number | string | null> = { mes: label };

    for (const entry of entries) {
      row[entry.key] = entry.cells[monthIndex].value;
    }

    return row;
  });

  const items = entries.map(entry => ({
    label: String(entry.year),
    value: entry.cells
      .reduce((sum, cell) => sum + (cell.value ?? 0), 0)
      .toLocaleString("es-ES"),
  }));

  return (
    <PageShell page={page} editing={editing} onChange={onChange}>
      {editing && availableYears.length > 0 && (
        <YearSelector
          selection={{
            available: availableYears,
            selected: selectedYears,
            onChange: selected =>
              onChange({
                years: Array.from(new Set(selected)).sort((a, b) => a - b),
              }),
          }}
        />
      )}

      <KpiRow items={items} />

      <div className="flex min-h-0 flex-1 flex-col">
        <SeriesLineChart categoryKey="mes" series={series} data={data} />
      </div>

      {editing && (
        <ValueGrid
          columns={MONTH_LABELS}
          rows={entries.map(entry => ({
            label: String(entry.year),
            color: entry.color,
            cells: entry.cells,
          }))}
          onChange={(key, value) => onChange(withOverride(page, key, value))}
        />
      )}
    </PageShell>
  );
}
