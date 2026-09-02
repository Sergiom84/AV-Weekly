import ValueGrid from "@/components/deck/ValueGrid";
import KpiRow from "@/components/deck/KpiRow";
import WeeklyBarChart, {
  type WeeklySeries,
} from "@/components/deck/WeeklyBarChart";
import WeekRangeSelector from "@/components/deck/WeekRangeSelector";
import {
  defaultWeekSelection,
  reportedWeekAvailability,
  resolveWeekSelection,
  type WeekSelection,
} from "@shared/deck/core";
import { seriesWeeks, valueAt } from "@shared/modules/oficinas/derived";
import type {
  OficinasRow,
  OficinasWeekValue,
} from "@shared/modules/oficinas/types";
import {
  ALL_ISO_WEEKS,
  semanalCurrentAt,
  semanalHeadlineItems,
  semanalMediaWeeks,
  semanalReportWeeks,
  weekLabel,
} from "../aggregate";
import { withOverride } from "../overrides";
import {
  type SemanalLayout,
  semanalLayoutRules,
} from "../semanalLayout";
import { semanalSeriesRows } from "../semanalSeries";
import PageShell, { type OficinasPageProps } from "./PageShell";
import SemanalTable from "./SemanalTable";
import YearSelector, { type YearSelection } from "./YearSelector";

export type { SemanalLayout };

/**
 * The annual comparison slide of the published report: the weekly bars of the
 * current year against the past ones, and the source pivot underneath.
 *
 * Six printed slides share this anatomy and differ only in what they pivot —
 * the territorial, the element, the request type. Each wrapper answers which
 * rows, which series and which years; the visual family is a named contract
 * in `semanalLayout.ts`, so a correction for one family does not spill into
 * the others.
 *
 * Two rules decide what the chart is allowed to say:
 *
 * - "Todas" and an explicit range can show the full year, including the later
 *   weeks of historic series. A trailing window instead ends at the current
 *   report week, so it never points into future empty columns of the active
 *   year.
 * - A week a year never reported is a gap, never a zero. The historico starts at
 *   week 22 of 2023 and the current year stops at the reported week; a
 *   zero-filled bar would claim a week that was measured and empty instead of
 *   one that was not measured at all.
 */

interface SemanalPageProps extends OficinasPageProps {
  /** Rows of the pivot underneath the chart, in the order the slide prints them. */
  rows: OficinasRow[];
  /**
   * Header of the first table column. The printed pivots carry Excel's corner
   * cell ("Semana") over a column of directorates or elements; a page that
   * knows its dimension names it instead, as the directorate pages already do.
   */
  rowHeader?: string;
  year: number;
  /**
   * Current-year weekly line. Falls back to the column totals of `rows`, which
   * is wrong whenever `rows` is a sample: a page that lists eight elements out
   * of seventy-six charts the whole section and passes its series here.
   */
  totals?: OficinasWeekValue[];
  /** Past-year weekly series, same measure and scope as the current-year line. */
  comparison?: OficinasWeekValue[];
  /** Last closed week; later columns of the source are still in progress. */
  throughWeek?: number | null;
  /** New comparison pages can start at the current reporting horizon. */
  defaultToReportedWeek?: boolean;
  yearSelector?: YearSelection;
  /**
   * Qualifier of the figures below, printed above the table. It is data, not
   * commentary: without it the reader cannot tell which validator scope the
   * table counts.
   */
  caption?: string;
  /**
   * Closing `Total general` row. Off for a page whose rows are a sample of the
   * dimension — the printed element slides carry none, and a total of eight
   * rows out of seventy-six is a figure nothing on the slide supports.
   */
  totalRow?: boolean;
  /** Sort the table by the visible `Media` column, highest first. */
  rankByAverage?: boolean;
  /** Named visual family that owns the page-specific presentation rules. */
  layout?: SemanalLayout;
  /** Measure named in the weekly headline cards, when this slide has them. */
  headlineLabel?: string;
}

export default function SemanalPage({
  page,
  editing,
  onChange,
  rows,
  rowHeader = "Semana",
  year,
  totals,
  comparison,
  throughWeek,
  defaultToReportedWeek = false,
  yearSelector,
  caption,
  totalRow = true,
  rankByAverage = false,
  layout = "standard-semanal",
  headlineLabel,
}: SemanalPageProps) {
  const rules = semanalLayoutRules(layout);
  const extraYears = yearSelector
    ? yearSelector.selected.filter(value => value !== year).sort((a, b) => a - b)
    : [];
  const includeCurrent = !yearSelector || yearSelector.selected.includes(year);
  const currentReported = new Set(
    totals
      ? seriesWeeks(totals, year)
      : rows.flatMap(row => seriesWeeks(row.values, year))
  );
  const currentAt = (week: number) =>
    semanalCurrentAt(rows, year, week, totals);
  const weekSelection: WeekSelection =
    page.weekSelection ??
    defaultWeekSelection(
      defaultToReportedWeek && throughWeek
        ? throughWeek
        : ALL_ISO_WEEKS[ALL_ISO_WEEKS.length - 1]
    );
  const currentReportWeeks = semanalReportWeeks(
    rows,
    year,
    totals,
    throughWeek
  );
  const selectedWeeks = resolveWeekSelection(
    weekSelection,
    weekSelection.mode === "window"
      ? reportedWeekAvailability(ALL_ISO_WEEKS, currentReportWeeks)
      : ALL_ISO_WEEKS
  );
  const seriesRows = semanalSeriesRows({
    page,
    year,
    extraYears,
    comparison,
    throughWeek,
    currentReported,
    currentAt,
    includeCurrent,
  });
  const series: WeeklySeries[] = seriesRows.map(entry => ({
    key: entry.key,
    label: entry.label,
    color: entry.color,
  }));
  const data = ALL_ISO_WEEKS.map((week, index) => {
    const point: Record<string, number | string | null> = {
      semana: weekLabel(week),
    };

    for (const entry of seriesRows) {
      point[entry.key] = entry.cells[index].value;
    }

    return point;
  });
  const chartData = data.filter((_, index) =>
    selectedWeeks.includes(ALL_ISO_WEEKS[index])
  );
  const lastWeek = currentReportWeeks.at(-1) ?? null;
  const compareYear = extraYears.length > 0 ? Math.max(...extraYears) : null;
  const previous =
    lastWeek === null || compareYear === null || !comparison
      ? null
      : seriesWeeks(comparison, compareYear).includes(lastWeek)
        ? valueAt(comparison, compareYear, lastWeek)
        : null;
  const headlineItems = semanalHeadlineItems({
    headlineLabel,
    lastWeek,
    current: lastWeek === null ? 0 : currentAt(lastWeek),
    compareYear,
    previous,
  });
  const mediaWeeks = semanalMediaWeeks(rows, year, throughWeek);

  return (
    <PageShell page={page} editing={editing} onChange={onChange}>
      {editing && yearSelector && yearSelector.available.length > 0 && (
        <YearSelector selection={yearSelector} />
      )}

      {editing && (
        <WeekRangeSelector
          selection={weekSelection}
          available={ALL_ISO_WEEKS}
          onChange={next => onChange({ weekSelection: next })}
        />
      )}

      <KpiRow items={headlineItems} compact />

      <div className="flex min-h-0 flex-[3] flex-col">
        <WeeklyBarChart
          weeks={selectedWeeks}
          series={series}
          data={chartData}
          labels={rules.comparisonLabels}
        />
      </div>

      {caption && (
        <p className="shrink-0 text-center font-mono text-[1.15cqi] uppercase tracking-wide text-muted-foreground">
          {caption}
        </p>
      )}

      <div className="min-h-0 flex-[2]">
        <SemanalTable
          rowHeader={rowHeader}
          rows={rows}
          year={year}
          visibleWeeks={selectedWeeks}
          mediaWeeks={mediaWeeks}
          totalRow={totalRow}
          rankByAverage={rankByAverage}
          layout={rules}
        />
      </div>

      {editing && (
        <ValueGrid
          columns={ALL_ISO_WEEKS.map(weekLabel)}
          rows={seriesRows.map(entry => ({
            label: entry.label,
            color: entry.color,
            cells: entry.cells,
          }))}
          onChange={(key, value) => onChange(withOverride(page, key, value))}
        />
      )}
    </PageShell>
  );
}
