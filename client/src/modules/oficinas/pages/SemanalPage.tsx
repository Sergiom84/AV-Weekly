import ValueGrid from "@/components/deck/ValueGrid";
import WeeklyBarChart, {
  type WeeklySeries,
} from "@/components/deck/WeeklyBarChart";
import { useFitTableScale } from "@/hooks/useFitTableScale";
import { seriesWeeks, valueAt } from "@shared/modules/oficinas/derived";
import type {
  OficinasRow,
  OficinasWeekValue,
} from "@shared/modules/oficinas/types";
import { decimal, weekLabel, yearColor } from "../aggregate";
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
 * - The axis is always the full year. The past years run to week 52 and cutting
 *   the axis at the current week would hide the second half of every one of
 *   them, which is the comparison the slide exists for.
 * - A week a year never reported is a gap, never a zero. The historico starts at
 *   week 22 of 2023 and the current year stops at the reported week; a
 *   zero-filled bar would claim a week that was measured and empty instead of
 *   one that was not measured at all.
 */

/** The axis of every annual comparison: the full ISO year, as the slides print it. */
const ALL_WEEKS = Array.from({ length: 52 }, (_, index) => index + 1);

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
}: SemanalPageProps) {
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
        label: `Año ${comparisonYear}`,
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
      label: `Año ${year}`,
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

      <div className="flex min-h-0 flex-[3] flex-col">
        <WeeklyBarChart
          weeks={ALL_WEEKS}
          series={series}
          data={data}
          labels={false}
        />
      </div>

      {caption && (
        <p className="shrink-0 font-mono text-[1.15cqi] uppercase tracking-wide text-muted-foreground">
          {caption}
        </p>
      )}

      <div className="min-h-0 flex-[2]">
        <SemanalTable
          rowHeader={rowHeader}
          rows={rows}
          year={year}
          mediaWeeks={mediaWeeks}
          totalRow={totalRow}
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
  /** Weeks the `Media` column averages over. */
  mediaWeeks: number[];
  totalRow: boolean;
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
  mediaWeeks,
  totalRow,
}: SemanalTableProps) {
  const { containerRef, tableRef } = useFitTableScale<
    HTMLDivElement,
    HTMLTableElement
  >({ deps: [rows.length, mediaWeeks.length, totalRow] });

  const entries = rows.map(row => {
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
              className="w-[13%] truncate py-[calc(var(--fit-scale,1)*0.3cqi)] text-left font-normal"
            >
              {rowHeader}
            </th>
            <th
              scope="col"
              className="w-[4.5%] truncate py-[calc(var(--fit-scale,1)*0.3cqi)] text-center font-normal"
            >
              Media
            </th>
            {ALL_WEEKS.map(week => (
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
                className="truncate py-[calc(var(--fit-scale,1)*0.25cqi)] text-left font-normal"
                title={entry.label}
              >
                {entry.label}
              </th>
              <td className={cellClass}>{decimal(entry.media)}</td>
              {ALL_WEEKS.map(week => (
                <td key={week} className={cellClass}>
                  {entry.weekly.get(week) ?? ""}
                </td>
              ))}
            </tr>
          ))}

          {totalRow && (
            <tr className="border-t border-border font-medium">
              <th
                scope="row"
                className="truncate py-[calc(var(--fit-scale,1)*0.3cqi)] text-left"
              >
                Total general
              </th>
              <td className={cellClass}>{decimal(totalMedia)}</td>
              {ALL_WEEKS.map(week => {
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
