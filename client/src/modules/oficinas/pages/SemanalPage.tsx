import ValueGrid from "@/components/deck/ValueGrid";
import KpiRow from "@/components/deck/KpiRow";
import WeeklyBarChart, {
  type WeeklySeries,
} from "@/components/deck/WeeklyBarChart";
import WeekRangeSelector from "@/components/deck/WeekRangeSelector";
import { useFitTableScale } from "@/hooks/useFitTableScale";
import {
  defaultWeekSelection,
  reportedWeekAvailability,
  resolveWeekSelection,
  type WeekSelection,
} from "@shared/deck/core";
import {
  rankedRowsByAverage,
  rowsWithOtrosLast,
  seriesWeeks,
  valueAt,
} from "@shared/modules/oficinas/derived";
import type {
  OficinasRow,
  OficinasWeekValue,
} from "@shared/modules/oficinas/types";
import { decimal, variationLabel, weekLabel, yearColor } from "../aggregate";
import {
  TOTAL_ROW,
  cellKey,
  isOverridden,
  overriddenValue,
  weekColumn,
  withOverride,
} from "../overrides";
import PageShell, { type OficinasPageProps } from "./PageShell";
import YearSelector, { type YearSelection } from "./YearSelector";

/**
 * The annual comparison slide of the published report: the weekly bars of the
 * current year against the past ones, and the source pivot underneath.
 *
 * Six printed slides share this anatomy and differ only in what they pivot —
 * the territorial, the element, the request type — so the layout lives here and
 * each page is a wrapper that answers three questions: which rows the table
 * lists, which series the bars draw, and which past years are on offer.
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

/** The axis of every annual comparison: the full ISO year, as the slides print it. */
const ALL_WEEKS = Array.from({ length: 52 }, (_, index) => index + 1);

/**
 * Visual contracts for annual weekly comparisons.
 *
 * The data mechanics remain shared, while layout changes are opt-in by family
 * so a correction for the requested comparison slides does not spill into the
 * recycler or request-type slides that use the same renderer.
 */
export type SemanalLayout =
  | "standard-semanal"
  | "comparativas-semanales"
  | "peticiones-territorial-semanal"
  | "volumetrias-semanales";

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
  yearSelector,
  caption,
  totalRow = true,
  rankByAverage = false,
  layout = "standard-semanal",
  headlineLabel,
}: SemanalPageProps) {
  const isComparisonLayout = layout === "comparativas-semanales";
  const isPeticionesTerritorial = layout === "peticiones-territorial-semanal";
  const hasWideAverage = layout === "volumetrias-semanales";
  // Dimension names are read as a list, including the long request types, so
  // they stay anchored to the left edge while all numeric columns are centred.
  const centersRowHeader = false;
  const highlightsTotal =
    isPeticionesTerritorial || layout === "volumetrias-semanales";
  const usesComparisonLabels =
    isComparisonLayout || isPeticionesTerritorial || hasWideAverage;
  const extraYears = yearSelector
    ? [...yearSelector.selected].sort((a, b) => a - b)
    : [];
  // The line is the published series when the page has one, and the column
  // total of its own rows otherwise.
  const currentReported = new Set(
    totals
      ? seriesWeeks(totals, year)
      : rows.flatMap(row => seriesWeeks(row.values, year))
  );
  const currentAt = (week: number) =>
    totals
      ? valueAt(totals, year, week)
      : rows.reduce((sum, row) => sum + valueAt(row.values, year, week), 0);
  const weekSelection: WeekSelection =
    page.weekSelection ?? defaultWeekSelection(ALL_WEEKS[ALL_WEEKS.length - 1]);
  const currentReportWeeks = Array.from(currentReported).filter(
    week =>
      throughWeek === null || throughWeek === undefined || week <= throughWeek
  );
  const selectedWeeks = resolveWeekSelection(
    weekSelection,
    weekSelection.mode === "window"
      ? reportedWeekAvailability(ALL_WEEKS, currentReportWeeks)
      : ALL_WEEKS
  );

  // Past years first, so the bars group oldest to newest inside a week and the
  // legend reads in the same order the printed slide does.
  const seriesRows = [
    ...extraYears.map(comparisonYear => {
      const reported = new Set(
        comparison ? seriesWeeks(comparison, comparisonYear) : []
      );
      const rowId = `y${comparisonYear}`;

      return {
        key: rowId,
        label: String(comparisonYear),
        color: yearColor(comparisonYear, year),
        cells: ALL_WEEKS.map(week => {
          const key = cellKey(rowId, weekColumn(week));
          const imported =
            comparison && reported.has(week)
              ? valueAt(comparison, comparisonYear, week)
              : null;

          return {
            key,
            value: overriddenValue(page, key, imported),
            overridden: isOverridden(page, key),
          };
        }),
      };
    }),
    {
      key: "actual",
      label: String(year),
      color: yearColor(year, year),
      cells: ALL_WEEKS.map(week => {
        const key = cellKey(TOTAL_ROW, weekColumn(week));
        const closed =
          throughWeek === null || throughWeek === undefined
            ? true
            : week <= throughWeek;
        const imported =
          currentReported.has(week) && closed ? currentAt(week) : null;

        return {
          key,
          value: overriddenValue(page, key, imported),
          overridden: isOverridden(page, key),
        };
      }),
    },
  ];

  const series: WeeklySeries[] = seriesRows.map(entry => ({
    key: entry.key,
    label: entry.label,
    color: entry.color,
  }));

  const data = ALL_WEEKS.map((week, index) => {
    const point: Record<string, number | string | null> = {
      semana: weekLabel(week),
    };

    for (const entry of seriesRows) {
      point[entry.key] = entry.cells[index].value;
    }

    return point;
  });
  const chartData = data.filter((_, index) =>
    selectedWeeks.includes(ALL_WEEKS[index])
  );

  const lastWeek = currentReportWeeks.at(-1) ?? null;
  const compareYear = extraYears.length > 0 ? Math.max(...extraYears) : null;
  const previous =
    lastWeek === null || compareYear === null || !comparison
      ? null
      : seriesWeeks(comparison, compareYear).includes(lastWeek)
        ? valueAt(comparison, compareYear, lastWeek)
        : null;
  const headlineItems =
    headlineLabel === undefined || lastWeek === null
      ? []
      : [
          {
            label: `${headlineLabel} S${lastWeek}`,
            value: currentAt(lastWeek).toLocaleString("es-ES"),
          },
          ...(compareYear === null || previous === null
            ? []
            : [
                {
                  label: String(compareYear),
                  value: previous.toLocaleString("es-ES"),
                },
                {
                  label: "Variación",
                  value: variationLabel(previous, currentAt(lastWeek)),
                },
              ]),
        ];

  // Denominator of the `Media` column: the weeks the current year reports up to
  // and including the closed one. The trailing partial column of the source is
  // excluded, which is the rule `dtStats` applies to the same figure on the
  // directorate pages — and the one that reproduces the printed medias.
  const reportedWeeks = Array.from(currentYearWeeks(rows, year)).sort(
    (a, b) => a - b
  );
  const mediaWeeks =
    throughWeek === null || throughWeek === undefined
      ? reportedWeeks.slice(0, -1)
      : reportedWeeks.filter(week => week <= throughWeek);

  return (
    <PageShell page={page} editing={editing} onChange={onChange}>
      {editing && yearSelector && yearSelector.available.length > 0 && (
        <YearSelector selection={yearSelector} />
      )}

      {editing && (
        <WeekRangeSelector
          selection={weekSelection}
          available={ALL_WEEKS}
          onChange={next => onChange({ weekSelection: next })}
        />
      )}

      <KpiRow items={headlineItems} compact />

      <div className="flex min-h-0 flex-[3] flex-col">
        <WeeklyBarChart
          weeks={selectedWeeks}
          series={series}
          data={chartData}
          labels={usesComparisonLabels}
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
          showGroupDividers={usesComparisonLabels}
          peticionesTerritorial={isPeticionesTerritorial}
          highlightTotal={highlightsTotal}
          centerRowHeader={centersRowHeader}
          wideAverage={hasWideAverage}
        />
      </div>

      {editing && (
        <ValueGrid
          columns={ALL_WEEKS.map(weekLabel)}
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

/** Every week the rows report for one year, deduplicated. */
function currentYearWeeks(rows: OficinasRow[], year: number): Set<number> {
  const weeks = new Set<number>();

  for (const row of rows) {
    for (const week of seriesWeeks(row.values, year)) {
      weeks.add(week);
    }
  }

  return weeks;
}

interface SemanalTableProps {
  rowHeader: string;
  rows: OficinasRow[];
  year: number;
  /** Week columns currently visible in the chart. */
  visibleWeeks: number[];
  /** Weeks the `Media` column averages over. */
  mediaWeeks: number[];
  totalRow: boolean;
  rankByAverage: boolean;
  /** Thin separators after the dimension and average columns. */
  showGroupDividers: boolean;
  /** Keeps the catch-all territorial category as the final row. */
  peticionesTerritorial: boolean;
  /** Marks a complete pivot total with the report's orange band. */
  highlightTotal: boolean;
  /** Centre the dimension labels in the volumetry pivots. */
  centerRowHeader: boolean;
  /** Gives the weekly volumetry slides a little more room for their average. */
  wideAverage: boolean;
}

/**
 * The source pivot as the slide prints it: the dimension, its weekly mean and
 * the fifty-two week columns, blank past the week the year reports.
 *
 * Fifty-four columns only fit because font and padding shrink to the box the
 * slide gives the table, like every other deck table. The week headers are bare
 * numbers rather than the `S33` form the charts use: at this density the two
 * extra glyphs per column are the difference between a legible table and one
 * pinned to the minimum scale.
 */
function SemanalTable({
  rowHeader,
  rows,
  year,
  visibleWeeks,
  mediaWeeks,
  totalRow,
  rankByAverage,
  showGroupDividers,
  peticionesTerritorial,
  highlightTotal,
  centerRowHeader,
  wideAverage,
}: SemanalTableProps) {
  const { containerRef, tableRef } = useFitTableScale<
    HTMLDivElement,
    HTMLTableElement
  >({ deps: [rows.length, visibleWeeks.length, mediaWeeks.length, totalRow] });

  const rankedRows = rankByAverage
    ? rankedRowsByAverage(rows, year, mediaWeeks)
    : rows;
  const orderedRows = peticionesTerritorial
    ? rowsWithOtrosLast(rankedRows)
    : rankedRows;
  const entries = orderedRows.map(row => {
    const weekly = new Map<number, number>();

    for (const entry of row.values) {
      if (entry.year === year) {
        weekly.set(entry.week, entry.value);
      }
    }

    return {
      label: row.label,
      weekly,
      media:
        mediaWeeks.length === 0
          ? null
          : mediaWeeks.reduce((sum, week) => sum + (weekly.get(week) ?? 0), 0) /
            mediaWeeks.length,
    };
  });

  const totalMedia = entries.reduce(
    (sum, entry) => sum + (entry.media ?? 0),
    0
  );
  const cellClass =
    "truncate px-[0.1cqi] py-[calc(var(--fit-scale,1)*0.25cqi)] text-center";
  const leadingColumnWidth = centerRowHeader
    ? "12%"
    : wideAverage
      ? "12%"
      : "13%";
  // The weekly columns share whatever remains, so giving the average a firm
  // readable width only tightens their unused gaps. Element comparisons need
  // room for decimals; territorial pivots have an even narrower average in
  // the source template, so they get the same minimum without touching the
  // territorial name column.
  const averageColumnWidth =
    showGroupDividers || centerRowHeader || wideAverage ? "7.5%" : "4.5%";

  return (
    <div ref={containerRef} className="h-full max-h-full w-full overflow-auto">
      <table
        ref={tableRef}
        className="w-full min-w-full table-fixed border-collapse font-mono text-[length:calc(var(--fit-scale,1)*1.15cqi)] leading-none tabular-nums"
      >
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th
              scope="col"
              className={`truncate py-[calc(var(--fit-scale,1)*0.3cqi)] ${centerRowHeader ? "text-center" : "text-left"} font-normal ${
                showGroupDividers ? "border-r border-border" : ""
              }`}
              style={{ width: leadingColumnWidth }}
            >
              {rowHeader}
            </th>
            <th
              scope="col"
              className={`truncate py-[calc(var(--fit-scale,1)*0.3cqi)] text-center font-normal ${
                showGroupDividers ? "border-r border-border" : ""
              }`}
              style={{ width: averageColumnWidth }}
            >
              Media
            </th>
            {visibleWeeks.map(week => (
              <th
                key={week}
                scope="col"
                className="truncate py-[calc(var(--fit-scale,1)*0.3cqi)] text-center font-normal"
              >
                {week}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map(entry => (
            <tr key={entry.label} className="border-b border-border/60">
              <th
                scope="row"
                className={`truncate py-[calc(var(--fit-scale,1)*0.25cqi)] ${centerRowHeader ? "text-center" : "text-left"} font-normal ${
                  showGroupDividers ? "border-r border-border" : ""
                }`}
                title={entry.label}
              >
                {entry.label}
              </th>
              <td
                className={`${cellClass} ${
                  showGroupDividers ? "border-r border-border" : ""
                }`}
              >
                {decimal(entry.media)}
              </td>
              {visibleWeeks.map(week => (
                <td key={week} className={cellClass}>
                  {entry.weekly.get(week) ?? ""}
                </td>
              ))}
            </tr>
          ))}

          {totalRow && (
            <tr
              className={
                highlightTotal
                  ? "bg-[var(--informe-serie-4)] font-medium text-white"
                  : "border-t border-border font-medium"
              }
            >
              <th
                scope="row"
                className={`truncate py-[calc(var(--fit-scale,1)*0.3cqi)] ${centerRowHeader ? "text-center" : "text-left"} ${
                  showGroupDividers ? "border-r border-border" : ""
                }`}
              >
                Total general
              </th>
              <td
                className={`${cellClass} ${
                  showGroupDividers ? "border-r border-border" : ""
                }`}
              >
                {decimal(totalMedia)}
              </td>
              {visibleWeeks.map(week => {
                // A week no row reported stays blank, like the columns past the
                // reported one on the printed slide.
                const reported = entries.some(entry => entry.weekly.has(week));

                return (
                  <td key={week} className={cellClass}>
                    {reported
                      ? entries.reduce(
                          (sum, entry) => sum + (entry.weekly.get(week) ?? 0),
                          0
                        )
                      : ""}
                  </td>
                );
              })}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
