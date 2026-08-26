import type { ReactNode } from "react";
import SeriesLineChart, {
  type LineSeries,
} from "@/components/deck/SeriesLineChart";
import ValueGrid from "@/components/deck/ValueGrid";
import KpiRow from "@/components/deck/KpiRow";
import { useFitTableScale } from "@/hooks/useFitTableScale";
import {
  columnTotals,
  dtStats,
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

interface DTPageProps extends OficinasPageProps {
  /** Directorate matrix of the current year. */
  rows: OficinasRow[];
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
  yearSelector?: {
    /** Years `comparison` has besides `year` itself, oldest first. */
    available: number[];
    /** Years currently drawn, a subset of `available`. */
    selected: number[];
    onChange: (years: number[]) => void;
  };
}

/** Trailing weeks the table prints, as the published deck does. */
const WINDOW = 6;

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
 * The layout every directorate page of the report shares: the weekly line of
 * the current year against the previous one, the year-on-year headline of the
 * last reported week, and the directorate table with its offices, its ratio,
 * its weekly average and the trailing six weeks.
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
  previousRows = [],
  year,
  masters,
  totals,
  throughWeek,
  controls,
  caption,
  comparison,
  yearSelector,
}: DTPageProps) {
  const previousYear = year - 1;
  // The multi-year selector only ever draws from `comparison`, the past-year
  // series measured at the scope of the line on screen. `previousRows` keeps
  // driving the chart for a section that has no such flat series.
  const extraYears = yearSelector ? [...yearSelector.selected].sort((a, b) => a - b) : [];

  const currentWeeks = totals
    ? seriesWeeks(totals, year)
    : Array.from(new Set(rows.flatMap(row => seriesWeeks(row.values, year))));
  const lastCurrentWeek = currentWeeks[currentWeeks.length - 1] ?? null;
  const weekLimit = throughWeek ?? lastCurrentWeek;
  const otherYearsWeeks = yearSelector
    ? extraYears.flatMap(y => (comparison ? seriesWeeks(comparison, y) : []))
    : previousRows.flatMap(row => seriesWeeks(row.values, previousYear));
  const chartWeeks = Array.from(new Set([...currentWeeks, ...otherYearsWeeks]))
    .filter(week => weekLimit === null || week <= weekLimit)
    .sort((a, b) => a - b);

  const currentAt = (week: number) =>
    totals
      ? valueAt(totals, year, week)
      : rows.reduce((sum, row) => sum + valueAt(row.values, year, week), 0);

  const previousReported = new Set(
    previousRows.flatMap(row => seriesWeeks(row.values, previousYear))
  );

  const seriesRows = yearSelector
    ? [
        {
          label: "Año en curso",
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
        ...extraYears.map(y => {
          const reportedWeeks = new Set(comparison ? seriesWeeks(comparison, y) : []);
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
          label: "Año en curso",
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
                label: "Año anterior",
                key: "previo",
                color: PREVIOUS_YEAR_COLOR,
                cells: chartWeeks.map(week => {
                  const key = cellKey(PREVIOUS_ROW, weekColumn(week));
                  // A week the previous year never reported is a gap, not a
                  // zero: the recycler sheet jumps from week 1 to week 21.
                  const imported = previousReported.has(week)
                    ? previousRows.reduce(
                        (sum, row) => sum + valueAt(row.values, previousYear, week),
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
      ];

  const series: LineSeries[] = seriesRows.map(entry => ({
    key: entry.key,
    label:
      entry.key === "actual"
        ? `${entry.label} (${year})`
        : entry.key === "previo"
          ? `${entry.label} (${previousYear})`
          : entry.label,
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

  const reported = currentWeeks.filter(
    week => weekLimit === null || week <= weekLimit
  );
  const window = reported.slice(-WINDOW);
  const stats = dtStats(rows, year, masters, reported);
  const totalsOverWindow = columnTotals(rows, year, window);

  const lastWeek = reported[reported.length - 1] ?? null;
  const compareYear = yearSelector
    ? (extraYears.length > 0 ? Math.max(...extraYears) : null)
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

  const items =
    headline === null
      ? []
      : [
          {
            label: `Semana ${headline.week}`,
            value: headline.current.toLocaleString("es-ES"),
          },
          ...(headline.previous === null || compareYear === null
            ? []
            : [
                {
                  label: `Semana ${headline.week} de ${compareYear}`,
                  value: headline.previous.toLocaleString("es-ES"),
                },
                {
                  label: "Variación",
                  value: variationLabel(headline.previous, headline.current),
                },
              ]),
        ];

  return (
    <PageShell page={page} editing={editing} onChange={onChange}>
      {editing && controls}

      {editing && yearSelector && (
        <div
          role="group"
          aria-label="Años comparados"
          className="flex shrink-0 flex-wrap items-center gap-[0.6cqi] print:hidden"
        >
          {yearSelector.available.map(y => {
            const active = yearSelector.selected.includes(y);

            return (
              <button
                key={y}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  yearSelector.onChange(
                    active
                      ? yearSelector.selected.filter(item => item !== y)
                      : [...yearSelector.selected, y]
                  )
                }
                className={
                  active
                    ? "rounded-md border border-foreground px-[0.9cqi] py-[0.35cqi] font-mono text-[1.1cqi] tabular-nums text-foreground"
                    : "rounded-md border border-border px-[0.9cqi] py-[0.35cqi] font-mono text-[1.1cqi] tabular-nums text-muted-foreground transition-colors hover:text-foreground"
                }
              >
                {y}
              </button>
            );
          })}
        </div>
      )}

      <KpiRow items={items} />

      <div className="flex min-h-0 flex-[3] flex-col">
        <SeriesLineChart categoryKey="semana" series={series} data={data} />
      </div>

      {caption && (
        <p className="shrink-0 font-mono text-[1.15cqi] uppercase tracking-wide text-muted-foreground">
          {caption}
        </p>
      )}

      <div className="min-h-0 flex-[2]">
        <DTTable
          stats={stats}
          weeks={window}
          rows={rows}
          year={year}
          totals={totalsOverWindow}
        />
      </div>

      {editing && (
        <ValueGrid
          columns={chartWeeks.map(weekLabel)}
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

interface DTTableProps {
  stats: ReturnType<typeof dtStats>;
  weeks: number[];
  rows: OficinasRow[];
  year: number;
  totals: number[];
}

/**
 * The directorate table of the published deck: offices, incidents per office,
 * incidents per week and the trailing window, one row per directorate.
 *
 * Font and padding shrink to the box the slide gives it, like every other deck
 * table, so a template that grows a directorate never spills over the slide.
 */
function DTTable({ stats, weeks, rows, year, totals }: DTTableProps) {
  const { containerRef, tableRef } = useFitTableScale<
    HTMLDivElement,
    HTMLTableElement
  >({ deps: [stats.length, weeks.length] });

  const byLabel = new Map(rows.map(row => [row.label, row]));

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
              className="w-[22%] truncate py-[calc(var(--fit-scale,1)*0.3cqi)] text-left font-normal"
            >
              Territorial
            </th>
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
              className="truncate py-[calc(var(--fit-scale,1)*0.3cqi)] text-center font-normal"
            >
              Media
            </th>
            {weeks.map(week => (
              <th
                key={week}
                scope="col"
                className="truncate py-[calc(var(--fit-scale,1)*0.3cqi)] text-center font-normal"
              >
                {weekLabel(week)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {stats.map(entry => (
            <tr key={entry.dt} className="border-b border-border/60">
              <th
                scope="row"
                className="truncate py-[calc(var(--fit-scale,1)*0.25cqi)] text-left font-normal"
                title={entry.dt}
              >
                {entry.dt}
              </th>
              <td className="truncate px-[0.2cqi] py-[calc(var(--fit-scale,1)*0.25cqi)] text-center">
                {entry.offices === 0 ? "" : entry.offices}
              </td>
              <td className="truncate px-[0.2cqi] py-[calc(var(--fit-scale,1)*0.25cqi)] text-center">
                {entry.ratio === null ? "" : decimal(entry.ratio)}
              </td>
              <td className="truncate px-[0.2cqi] py-[calc(var(--fit-scale,1)*0.25cqi)] text-center">
                {decimal(entry.average)}
              </td>
              {weeks.map(week => (
                <td
                  key={week}
                  className="truncate px-[0.2cqi] py-[calc(var(--fit-scale,1)*0.25cqi)] text-center"
                >
                  {valueAt(byLabel.get(entry.dt)?.values, year, week)}
                </td>
              ))}
            </tr>
          ))}

          <tr className="border-t border-border font-medium">
            <th
              scope="row"
              className="truncate py-[calc(var(--fit-scale,1)*0.3cqi)] text-left"
            >
              Total
            </th>
            <td className="truncate px-[0.2cqi] py-[calc(var(--fit-scale,1)*0.3cqi)] text-center">
              {stats.reduce((sum, entry) => sum + entry.offices, 0) || ""}
            </td>
            <td className="px-[0.2cqi] py-[calc(var(--fit-scale,1)*0.3cqi)] text-center" />
            <td className="truncate px-[0.2cqi] py-[calc(var(--fit-scale,1)*0.3cqi)] text-center">
              {decimal(stats.reduce((sum, entry) => sum + entry.average, 0))}
            </td>
            {weeks.map((week, index) => (
              <td
                key={week}
                className="truncate px-[0.2cqi] py-[calc(var(--fit-scale,1)*0.3cqi)] text-center"
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
