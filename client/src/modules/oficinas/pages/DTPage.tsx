import type { ReactNode } from "react";
import WeeklyBarChart, {
  type WeeklySeries,
} from "@/components/deck/WeeklyBarChart";
import ValueGrid from "@/components/deck/EditorValueGrid";
import WeekRangeSelector from "@/components/deck/WeekRangeSelector";
import KpiRow from "@/components/deck/KpiRow";
import { useFitTableScale } from "@/hooks/useFitTableScale";
import {
  defaultWeekSelection,
  resolveWeekSelection,
  type WeekSelection,
} from "@shared/deck/core";
import {
  columnTotals,
  dtStats,
  rowsWithOtrosLast,
  seriesWeeks,
  valueAt,
  yearOnYear,
} from "@shared/modules/oficinas/derived";
import type {
  OficinasMasters,
  OficinasRow,
  OficinasWeekValue,
} from "@shared/modules/oficinas/types";
import {
  CURRENT_YEAR_COLOR,
  PREVIOUS_YEAR_COLOR,
  decimal,
  variationLabel,
  weekLabel,
  yearColor,
} from "../aggregate";
import {
  PREVIOUS_ROW,
  TOTAL_ROW,
  cellKey,
  isOverridden,
  overriddenValue,
  weekColumn,
  withOverride,
} from "../overrides";
import PageShell, { type OficinasPageProps } from "./PageShell";
import YearSelector, { type YearSelection } from "./YearSelector";
import {
  dtTableFrameFlex,
  type DTTerritorialLayout,
} from "../territorialLayout";

/** One directorate table of the row the incident slides print. */
export interface DTTableSpec {
  /** Names the matrix this table counts, printed above it. */
  caption: string;
  rows: OficinasRow[];
  /**
   * Offices, ratio and weekly average columns. On by default; off prints the
   * weeks alone, for a matrix whose ratio against the office count would not
   * mean anything. No page needs it since the "Validadoras" table left the
   * incident slides, so the contract is kept but currently unexercised.
   */
  aggregates?: boolean;
}

/**
 * Visual contracts for the territorial family of slides.
 *
 * Data aggregation stays shared, but each named layout owns its visual rules.
 * A new adjustment must be added to the family it belongs to instead of being
 * inferred from the deck page kind, which could accidentally affect another
 * territorial section.
 */
interface DTPageProps extends OficinasPageProps {
  /**
   * Directorate matrix of the current year: what the chart draws, which weeks
   * the tables print, and — when `tables` is absent — the single table itself.
   */
  rows: OficinasRow[];
  /**
   * Directorate tables printed side by side, as the published incident slides
   * do with the three validator matrices at once. Falls back to one table over
   * `rows`, which is what a section with a single matrix needs.
   *
   * Each table computes its own offices, ratio and weekly average over its own
   * matrix, so the "sin" and "con" scopes legitimately disagree. The six-week
   * window is shared: it is the report's window, not the matrix's.
   */
  tables?: DTTableSpec[];
  /** Same matrix for the previous year. Empty when the template does not ship it. */
  previousRows?: OficinasRow[];
  year: number;
  masters?: OficinasMasters;
  /**
   * Published weekly totals of the section, when it has a dedicated total sheet.
   * The pivots are refreshed by hand and disagree with their own matrix by a few
   * rows on some weeks, so the charted line is the total sheet where there is
   * one and the column totals of the matrix otherwise.
   */
  totals?: OficinasWeekValue[];
  /** Last closed week of the report; later source columns are still in progress. */
  throughWeek?: number | null;
  /** Extra controls above the chart, e.g. the validator-variant selector. */
  controls?: ReactNode;
  /**
   * Qualifier of the figures below, printed above the table. It is data, not
   * commentary: without it the reader cannot tell which of the three validator
   * matrices the table counts.
   */
  caption?: string;
  /**
   * Past-year weekly series the multi-year selector draws, measured at the same
   * scope as the current-year line on screen (`comparisonSeries` in the shared
   * contract). Only read when `yearSelector` is given.
   */
  comparison?: OficinasWeekValue[];
  /**
   * Turns the single "año anterior" line into a multi-year one, sourced from
   * `comparison` rather than from `previousRows`.
   *
   * Only a section that has a flat weekly series for past years — asignadas and
   * resueltas, through the historico seed — can offer this: `previousRows` stays
   * the mechanism for a section whose previous year is a real per-DT matrix
   * (peticiones, recicladores). A page passes at most one of the two;
   * `yearSelector` wins when both are given.
   */
  yearSelector?: YearSelection;
  /** Name of the current-week metric shown in the first headline card. */
  metricLabel?: string;
  /**
   * Names the two compared cards by their week and year ("Semana 35 - 2026")
   * instead of by the metric and the bare year ("Incidencias S35", "2025").
   *
   * Asked for by the Soporte Oficinas team on the territorial slides they
   * publish: the metric is already in the title above, and a card labelled just
   * "2025" reads as a year figure rather than as the same week of last year,
   * which is what it is. Opt-in per page rather than global, so a slide the
   * request did not name keeps the labels its readers know.
   */
  weekYearHeadline?: boolean;
  /** Named visual family that owns the page-specific layout rules. */
  layout?: DTTerritorialLayout;
  /** Prioritises weekly readings over unused aggregate-column space. */
  compactWeekPriority?: boolean;
}

/**
 * The `yearOnYear` headline computed off a flat weekly series instead of a
 * per-DT matrix: what the multi-year selector needs, since the years it
 * compares only exist as a total, not as directorate rows.
 *
 * The current figure is passed in rather than read from `comparison`: the
 * current year is charted from the matrix on screen for two of the three
 * variants, and reading it from a series that only carries past years would
 * headline a zero.
 */
function yearOnYearFromTotals(
  comparison: OficinasWeekValue[] | undefined,
  current: number,
  compareYear: number | null,
  week: number
): { week: number; current: number; previous: number | null } {
  if (compareYear === null || !comparison) {
    return { week, current, previous: null };
  }

  const reported = seriesWeeks(comparison, compareYear).includes(week);

  return {
    week,
    current,
    previous: reported ? valueAt(comparison, compareYear, week) : null,
  };
}

/**
 * The layout every directorate page of the report shares: the weekly grouped
 * bars of the current year against the past ones, the year-on-year headline of
 * the last reported week, and the directorate table with its offices, its
 * ratio, its weekly average and the trailing six weeks.
 *
 * The bars carry no value label. Fifty-two weeks times three or four years is
 * an order of magnitude more labels than the slide holds, and the printed
 * annual comparison prints none either.
 *
 * The two aggregate columns are read from `dtStats`, which excludes the week in
 * course — the template is exported mid-week and its last column is a partial
 * week. The chart still draws it: a partial week is informative on a line and
 * misleading inside an average.
 *
 * A correction typed into the grid moves the chart, not the ratio: the ratio
 * spans the whole year and the grid only exposes the charted weeks, so letting
 * one rewrite the other would publish an average nothing on the slide supports.
 */
export default function DTPage({
  page,
  editing,
  onChange,
  rows,
  tables,
  previousRows = [],
  year,
  masters,
  totals,
  throughWeek,
  controls,
  caption,
  comparison,
  yearSelector,
  metricLabel = "Incidencias",
  weekYearHeadline = false,
  layout = "standard-territorial",
  compactWeekPriority = false,
}: DTPageProps) {
  const isIncidenciasTerritoriales = layout === "incidencias-territoriales";
  const previousYear = year - 1;
  // The multi-year selector only ever draws from `comparison`, the past-year
  // series measured at the scope of the line on screen. `previousRows` keeps
  // driving the chart for a section that has no such flat series.
  const extraYears = yearSelector
    ? yearSelector.selected.filter(value => value !== year).sort((a, b) => a - b)
    : [];
  const includeCurrent = !yearSelector || yearSelector.selected.includes(year);

  const currentWeeks = totals
    ? seriesWeeks(totals, year)
    : Array.from(new Set(rows.flatMap(row => seriesWeeks(row.values, year))));
  const lastCurrentWeek = currentWeeks[currentWeeks.length - 1] ?? null;
  const weekLimit = throughWeek ?? lastCurrentWeek;
  const otherYearsWeeks = yearSelector
    ? extraYears.flatMap(y => (comparison ? seriesWeeks(comparison, y) : []))
    : previousRows.flatMap(row => seriesWeeks(row.values, previousYear));
  const chartWeeks = Array.from(
    new Set([...(includeCurrent ? currentWeeks : []), ...otherYearsWeeks])
  )
    .filter(week => weekLimit === null || week <= weekLimit)
    .sort((a, b) => a - b);
  const weekSelection: WeekSelection =
    page.weekSelection ??
    defaultWeekSelection(chartWeeks[chartWeeks.length - 1] ?? 1);
  const selectedChartWeeks = resolveWeekSelection(weekSelection, chartWeeks);

  const currentAt = (week: number) =>
    totals
      ? valueAt(totals, year, week)
      : rows.reduce((sum, row) => sum + valueAt(row.values, year, week), 0);

  const previousReported = new Set(
    previousRows.flatMap(row => seriesWeeks(row.values, previousYear))
  );

  const seriesRows = (
    yearSelector
      ? [
          ...(includeCurrent
            ? [
                {
                  label: String(year),
                  key: "actual",
                  color: CURRENT_YEAR_COLOR,
                  cells: chartWeeks.map(week => {
                    const key = cellKey(TOTAL_ROW, weekColumn(week));

                    return {
                      key,
                      value: overriddenValue(page, key, currentAt(week)),
                      overridden: isOverridden(page, key),
                    };
                  }),
                },
              ]
            : []),
          ...extraYears.map(y => {
            const reportedWeeks = new Set(
              comparison ? seriesWeeks(comparison, y) : []
            );
            const rowId = `y${y}`;

            return {
              label: String(y),
              key: rowId,
              color: yearColor(y, year),
              cells: chartWeeks.map(week => {
                const key = cellKey(rowId, weekColumn(week));
                // A week that year never reported (2023 only starts at week 22)
                // is a gap, not a zero.
                const imported =
                  comparison && reportedWeeks.has(week)
                    ? valueAt(comparison, y, week)
                    : null;

                return {
                  key,
                  value: overriddenValue(page, key, imported),
                  overridden: isOverridden(page, key),
                };
              }),
            };
          }),
        ]
      : [
          {
            label: String(year),
            key: "actual",
            color: CURRENT_YEAR_COLOR,
            cells: chartWeeks.map(week => {
              const key = cellKey(TOTAL_ROW, weekColumn(week));

              return {
                key,
                value: overriddenValue(page, key, currentAt(week)),
                overridden: isOverridden(page, key),
              };
            }),
          },
          // A previous year the template never shipped is not drawn as a flat
          // zero: the assigned and resolved sections have no year-on-year sheet
          // at all.
          ...(previousRows.length > 0
            ? [
                {
                  label: String(previousYear),
                  key: "previo",
                  color: PREVIOUS_YEAR_COLOR,
                  cells: chartWeeks.map(week => {
                    const key = cellKey(PREVIOUS_ROW, weekColumn(week));
                    // A week the previous year never reported is a gap, not a
                    // zero: the recycler sheet jumps from week 1 to week 21.
                    const imported = previousReported.has(week)
                      ? previousRows.reduce(
                          (sum, row) =>
                            sum + valueAt(row.values, previousYear, week),
                          0
                        )
                      : null;

                    return {
                      key,
                      value: overriddenValue(page, key, imported),
                      overridden: isOverridden(page, key),
                    };
                  }),
                },
              ]
            : []),
        ]
  ).sort((a, b) => Number(a.label) - Number(b.label));

  const series: WeeklySeries[] = seriesRows.map(entry => ({
    key: entry.key,
    label: entry.label,
    color: entry.color,
  }));

  const data = chartWeeks.map((week, index) => {
    const point: Record<string, number | string | null> = {
      semana: weekLabel(week),
    };

    for (const entry of seriesRows) {
      point[entry.key] = entry.cells[index].value;
    }

    return point;
  });
  const chartData = data.filter((_, index) =>
    selectedChartWeeks.includes(chartWeeks[index])
  );

  const reported = currentWeeks.filter(
    week => weekLimit === null || week <= weekLimit
  );
  const stats = dtStats(rows, year, masters, reported);
  // The filter governs both the graph and the table. Aggregate figures remain
  // based on the closed report period; only the columns shown are filtered.
  const tableWeeks = selectedChartWeeks;
  const totalsOverTableWeeks = columnTotals(rows, year, tableWeeks);

  const lastWeek = reported[reported.length - 1] ?? null;
  const compareYear = yearSelector
    ? extraYears.length > 0
      ? Math.max(...extraYears)
      : null
    : previousYear;
  const headline =
    lastWeek === null
      ? null
      : yearSelector
        ? yearOnYearFromTotals(
            comparison,
            currentAt(lastWeek),
            compareYear,
            lastWeek
          )
        : yearOnYear(rows, previousRows, year, lastWeek);

  // The pair reads left to right as the compared year first and the current one
  // after it, the same order as the chart, and both cards name their year so
  // neither depends on the other to be read.
  const items = (() => {
    if (headline === null) {
      return [];
    }

    const headlineFor = (labelYear: number) =>
      weekYearHeadline
        ? `Semana ${headline.week} - ${labelYear}`
        : `${metricLabel} S${headline.week} - ${labelYear}`;
    const current = {
      label: headlineFor(year),
      value: headline.current.toLocaleString("es-ES"),
    };

    if (headline.previous === null || compareYear === null) {
      return [current];
    }

    return [
      {
        label: headlineFor(compareYear),
        value: headline.previous.toLocaleString("es-ES"),
      },
      current,
      {
        label: "Variación",
        value: variationLabel(headline.previous, headline.current),
      },
    ];
  })();

  return (
    <PageShell
      page={page}
      editing={editing}
      onChange={onChange}
      editor={
        editing && (
          <>
            {controls}

            {yearSelector && <YearSelector selection={yearSelector} />}

            <WeekRangeSelector
              selection={weekSelection}
              available={chartWeeks}
              onChange={next => onChange({ weekSelection: next })}
            />

            <ValueGrid
              columns={chartWeeks.map(weekLabel)}
              rows={seriesRows.map(entry => ({
                label: entry.label,
                color: entry.color,
                cells: entry.cells,
              }))}
              onChange={(key, value) => onChange(withOverride(page, key, value))}
            />
          </>
        )
      }
    >
      <KpiRow items={items} compact={isIncidenciasTerritoriales} />

      <div
        className={`flex min-h-0 flex-col ${
          isIncidenciasTerritoriales ? "flex-[3.45]" : "flex-[3]"
        }`}
      >
        <WeeklyBarChart
          weeks={selectedChartWeeks}
          series={series}
          data={chartData}
          labels={isIncidenciasTerritoriales}
        />
      </div>

      {caption && (
        <p
          className={`shrink-0 font-mono text-[1.15cqi] uppercase tracking-wide text-muted-foreground ${
            isIncidenciasTerritoriales ? "text-center" : ""
          }`}
        >
          {caption}
        </p>
      )}

      <div
        className={`min-h-0 ${
          isIncidenciasTerritoriales ? "flex-[1.95]" : "flex-[2]"
        }`}
      >
        {tables ? (
          <div className="flex h-full min-h-0 w-full items-stretch gap-[1.2cqi]">
            {tables.map(table => {
              const aggregates = table.aggregates !== false;

              return (
                <div
                  key={table.caption}
                  className={`flex min-h-0 min-w-0 flex-col gap-[0.3cqi] ${
                    isIncidenciasTerritoriales && !aggregates
                      ? "pt-[0.12cqi]"
                      : ""
                  }`}
                  // The incident layout gives all three cards the same outer
                  // frame; other territorial families keep column-weighted
                  // frames. Column widths inside each card remain independent.
                  style={{
                    flex: dtTableFrameFlex(
                      layout,
                      tableWeeks.length,
                      aggregates
                    ),
                  }}
                >
                  <p className="shrink-0 truncate text-center font-mono text-[1.15cqi] uppercase tracking-wide text-muted-foreground">
                    {table.caption}
                  </p>
                  <div className="min-h-0 flex-1">
                    <DTTable
                      stats={dtStats(table.rows, year, masters, reported)}
                      weeks={tableWeeks}
                      rows={table.rows}
                      year={year}
                      totals={columnTotals(table.rows, year, tableWeeks)}
                      aggregates={aggregates}
                      compact
                      expandedWeekColumns={isIncidenciasTerritoriales}
                      compactWeekPriority={compactWeekPriority}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <DTTable
            stats={stats}
            weeks={tableWeeks}
            rows={rows}
            year={year}
            totals={totalsOverTableWeeks}
          />
        )}
      </div>

    </PageShell>
  );
}

interface DTTableProps {
  stats: ReturnType<typeof dtStats>;
  weeks: number[];
  rows: OficinasRow[];
  year: number;
  totals: number[];
  /**
   * Offices, ratio and weekly average columns. On by default; off prints the
   * weeks alone, for a matrix whose ratio against the office count would not
   * mean anything. No page needs it since the "Validadoras" table left the
   * incident slides, so the contract is kept but currently unexercised.
   */
  aggregates?: boolean;
  /**
   * Three tables in the box of one, as the published incident slides print
   * them. Tightens the type and pins every column width, so ten columns fit a
   * third of the slide instead of truncating the directorate names, and keeps
   * the source pivot's own wording rather than the deck's.
   */
  compact?: boolean;
  /** Compact aggregate fields so weekly values remain readable. */
  expandedWeekColumns?: boolean;
  /** Uses spare aggregate width to make each weekly value easier to read. */
  compactWeekPriority?: boolean;
}

/** Column widths of the compact table, as a share of its own box. */
function compactWidths(
  weeks: number,
  aggregates: boolean,
  expandedWeekColumns: boolean,
  compactWeekPriority: boolean
): string[] {
  // The aggregate columns hold six characters ("144,42") against the three a
  // week holds, so an even split truncates exactly the figures the slide is
  // read for.
  const leading = aggregates
    ? expandedWeekColumns
      ? compactWeekPriority
        ? [10, 4.5, 5.5, 7]
        : [15, 6, 8, 9]
      : [26, 8, 10, 12]
    : expandedWeekColumns
      ? [22]
      : [34];
  const rest = 100 - leading.reduce((sum, share) => sum + share, 0);
  const perWeek = weeks === 0 ? rest : rest / weeks;

  return [...leading, ...Array.from({ length: weeks }, () => perWeek)].map(
    share => `${share}%`
  );
}

/**
 * The directorate table of the published deck: offices, incidents per office,
 * incidents per week and the trailing window, one row per directorate.
 *
 * Font and padding shrink to the box the slide gives it, like every other deck
 * table, so a template that grows a directorate never spills over the slide.
 */
function DTTable({
  stats,
  weeks,
  rows,
  year,
  totals,
  aggregates = true,
  compact = false,
  expandedWeekColumns = false,
  compactWeekPriority = false,
}: DTTableProps) {
  const { containerRef, tableRef } = useFitTableScale<
    HTMLDivElement,
    HTMLTableElement
  >({ deps: [stats.length, weeks.length, aggregates, compact] });

  const byLabel = new Map(rows.map(row => [row.label, row]));
  const orderedStats = rowsWithOtrosLast(stats);
  const widths = compact
    ? compactWidths(
        weeks.length,
        aggregates,
        expandedWeekColumns,
        compactWeekPriority
      )
    : null;
  const offices = stats.reduce((sum, entry) => sum + entry.offices, 0);
  const counted = stats.reduce((sum, entry) => sum + entry.total, 0);

  return (
    <div ref={containerRef} className="h-full max-h-full w-full overflow-auto">
      <table
        ref={tableRef}
        className={`w-full min-w-full table-fixed border-collapse font-mono leading-none tabular-nums ${
          compact
            ? expandedWeekColumns
              ? "text-[length:calc(var(--fit-scale,1)*0.7cqi)]"
              : "text-[length:calc(var(--fit-scale,1)*0.85cqi)]"
            : "text-[length:calc(var(--fit-scale,1)*1.15cqi)]"
        }`}
      >
        <colgroup>
          <col style={{ width: widths ? widths[0] : "22%" }} />
          {aggregates &&
            [1, 2, 3].map(index => (
              <col
                key={index}
                style={widths ? { width: widths[index] } : undefined}
              />
            ))}
          {weeks.map((week, index) => (
            <col
              key={week}
              style={
                widths
                  ? { width: widths[(aggregates ? 4 : 1) + index] }
                  : undefined
              }
            />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th
              scope="col"
              className={`truncate py-[calc(var(--fit-scale,1)*0.3cqi)] text-left ${compact && expandedWeekColumns ? "border-r border-border text-[length:calc(var(--fit-scale,1)*0.74cqi)] font-semibold" : "font-normal"}`}
            >
              {compact ? "Semana" : "Territorial"}
            </th>
            {aggregates && (
              <>
                <th
                  scope="col"
                  className="truncate py-[calc(var(--fit-scale,1)*0.3cqi)] text-center font-normal"
                >
                  OF
                </th>
                <th
                  scope="col"
                  className="truncate py-[calc(var(--fit-scale,1)*0.3cqi)] text-center font-normal"
                >
                  Ratio
                </th>
                <th
                  scope="col"
                  className={`truncate py-[calc(var(--fit-scale,1)*0.3cqi)] text-center font-normal ${compact && expandedWeekColumns ? "border-r border-border" : ""}`}
                >
                  Media
                </th>
              </>
            )}
            {weeks.map(week => (
              <th
                key={week}
                scope="col"
                className="truncate py-[calc(var(--fit-scale,1)*0.3cqi)] text-center font-normal"
              >
                {compact && expandedWeekColumns ? week : weekLabel(week)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orderedStats.map(entry => (
            <tr key={entry.dt} className="border-b border-border/60">
              <th
                scope="row"
                className={`truncate py-[calc(var(--fit-scale,1)*0.25cqi)] text-left ${compact && expandedWeekColumns ? "border-r border-border text-[length:calc(var(--fit-scale,1)*0.74cqi)] font-semibold" : "font-normal"}`}
                title={entry.dt}
              >
                {entry.dt}
              </th>
              {aggregates && (
                <>
                  <td
                    className={`truncate py-[calc(var(--fit-scale,1)*0.25cqi)] text-center ${
                      compact && expandedWeekColumns
                        ? "px-[0.05cqi]"
                        : "px-[0.2cqi]"
                    }`}
                  >
                    {entry.offices === 0 ? "" : entry.offices}
                  </td>
                  <td
                    className={`truncate py-[calc(var(--fit-scale,1)*0.25cqi)] text-center ${
                      compact && expandedWeekColumns
                        ? "px-[0.05cqi]"
                        : "px-[0.2cqi]"
                    }`}
                  >
                    {entry.ratio === null ? "" : decimal(entry.ratio)}
                  </td>
                  <td
                    className={`truncate py-[calc(var(--fit-scale,1)*0.25cqi)] text-center ${
                      compact && expandedWeekColumns
                        ? "border-r border-border px-[0.05cqi]"
                        : "px-[0.2cqi]"
                    }`}
                  >
                    {decimal(entry.average)}
                  </td>
                </>
              )}
              {weeks.map(week => (
                <td
                  key={week}
                  className={`py-[calc(var(--fit-scale,1)*0.25cqi)] text-center ${
                    compact && expandedWeekColumns
                      ? "whitespace-nowrap"
                      : "truncate px-[0.2cqi]"
                  }`}
                >
                  {valueAt(byLabel.get(entry.dt)?.values, year, week)}
                </td>
              ))}
            </tr>
          ))}

          <tr
            className={
              compact
                ? "bg-[var(--informe-serie-4)] font-medium text-white"
                : "border-t border-border font-medium"
            }
          >
            <th
              scope="row"
              className={`truncate py-[calc(var(--fit-scale,1)*0.3cqi)] text-left ${compact && expandedWeekColumns ? "border-r border-border" : ""}`}
            >
              {compact ? "Total general" : "Total"}
            </th>
            {aggregates && (
              <>
                <td
                  className={`truncate py-[calc(var(--fit-scale,1)*0.3cqi)] text-center ${
                    compact && expandedWeekColumns
                      ? "px-[0.05cqi]"
                      : "px-[0.2cqi]"
                  }`}
                >
                  {offices || ""}
                </td>
                <td
                  className={`truncate py-[calc(var(--fit-scale,1)*0.3cqi)] text-center ${
                    compact && expandedWeekColumns
                      ? "px-[0.05cqi]"
                      : "px-[0.2cqi]"
                  }`}
                >
                  {/* The published pivot totals the ratio too, over the whole
                      network. Blank while no office master is seeded, like the
                      rows above it. */}
                  {compact && offices > 0 ? decimal(counted / offices) : ""}
                </td>
                <td
                  className={`truncate py-[calc(var(--fit-scale,1)*0.3cqi)] text-center ${
                    compact && expandedWeekColumns
                      ? "border-r border-border px-[0.05cqi]"
                      : "px-[0.2cqi]"
                  }`}
                >
                  {decimal(
                    stats.reduce((sum, entry) => sum + entry.average, 0)
                  )}
                </td>
              </>
            )}
            {weeks.map((week, index) => (
              <td
                key={week}
                className={`py-[calc(var(--fit-scale,1)*0.3cqi)] text-center ${
                  compact && expandedWeekColumns
                    ? "whitespace-nowrap"
                    : "truncate px-[0.2cqi]"
                }`}
              >
                {totals[index] ?? 0}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
