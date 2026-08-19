import type { ReactNode } from "react";
import SeriesLineChart, {
  type LineSeries,
} from "@/components/deck/SeriesLineChart";
import ValueGrid from "@/components/deck/ValueGrid";
import KpiRow from "@/components/deck/KpiRow";
import { useFitTableScale } from "@/hooks/useFitTableScale";
import {
  columnTotals,
  completedWeeks,
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
  /** Extra controls above the chart, e.g. the validator-variant selector. */
  controls?: ReactNode;
  /**
   * Qualifier of the figures below, printed above the table. It is data, not
   * commentary: without it the reader cannot tell which of the three validator
   * matrices the table counts.
   */
  caption?: string;
}

/** Trailing weeks the table prints, as the published deck does. */
const WINDOW = 6;

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
  controls,
  caption,
}: DTPageProps) {
  const previousYear = year - 1;

  const chartWeeks = Array.from(
    new Set([
      ...(totals
        ? seriesWeeks(totals, year)
        : rows.flatMap(row => seriesWeeks(row.values, year))),
      ...previousRows.flatMap(row => seriesWeeks(row.values, previousYear)),
    ])
  ).sort((a, b) => a - b);

  const currentAt = (week: number) =>
    totals
      ? valueAt(totals, year, week)
      : rows.reduce((sum, row) => sum + valueAt(row.values, year, week), 0);

  const previousReported = new Set(
    previousRows.flatMap(row => seriesWeeks(row.values, previousYear))
  );

  const seriesRows = [
    {
      label: "Año en curso",
      row: TOTAL_ROW,
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
    // A previous year the template never shipped is not drawn as a flat zero:
    // the assigned and resolved sections have no year-on-year sheet at all.
    ...(previousRows.length > 0
      ? [
          {
            label: "Año anterior",
            row: PREVIOUS_ROW,
            key: "previo",
            color: PREVIOUS_YEAR_COLOR,
            cells: chartWeeks.map(week => {
              const key = cellKey(PREVIOUS_ROW, weekColumn(week));
              // A week the previous year never reported is a gap, not a zero:
              // the recycler sheet jumps from week 1 to week 21.
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
    label: `${entry.label} (${entry.row === TOTAL_ROW ? year : previousYear})`,
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

  const completed = completedWeeks(rows, year);
  const window = completed.slice(-WINDOW);
  const stats = dtStats(rows, year, masters, completed);
  const totalsOverWindow = columnTotals(rows, year, window);

  const lastWeek = chartWeeks[chartWeeks.length - 1] ?? null;
  const headline =
    lastWeek === null ? null : yearOnYear(rows, previousRows, year, lastWeek);

  const items =
    headline === null
      ? []
      : [
          {
            label: `Semana ${headline.week}`,
            value: headline.current.toLocaleString("es-ES"),
          },
          ...(headline.previous === null
            ? []
            : [
                {
                  label: `Semana ${headline.week} de ${previousYear}`,
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
        <DTTable stats={stats} weeks={window} rows={rows} year={year} totals={totalsOverWindow} />
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
            <th scope="col" className="truncate py-[calc(var(--fit-scale,1)*0.3cqi)] text-center font-normal">
              OF
            </th>
            <th scope="col" className="truncate py-[calc(var(--fit-scale,1)*0.3cqi)] text-center font-normal">
              Ratio
            </th>
            <th scope="col" className="truncate py-[calc(var(--fit-scale,1)*0.3cqi)] text-center font-normal">
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
            <th scope="row" className="truncate py-[calc(var(--fit-scale,1)*0.3cqi)] text-left">
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
