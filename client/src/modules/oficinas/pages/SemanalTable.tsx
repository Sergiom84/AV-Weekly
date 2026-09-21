import { formatTableNumber } from "@/components/deck/emptyCell";
import { useFitTableScale } from "@/hooks/useFitTableScale";
import type { OficinasRow } from "@shared/modules/oficinas/types";
import {
  decimal,
  semanalTableEntries,
  semanalWeekTotal,
} from "../aggregate";
import type { SemanalLayoutRules } from "../semanalLayout";

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
  layout: SemanalLayoutRules;
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
export default function SemanalTable({
  rowHeader,
  rows,
  year,
  visibleWeeks,
  mediaWeeks,
  totalRow,
  rankByAverage,
  layout,
}: SemanalTableProps) {
  const { containerRef, tableRef } = useFitTableScale<
    HTMLDivElement,
    HTMLTableElement
  >({ deps: [rows.length, visibleWeeks.length, mediaWeeks.length, totalRow] });

  const entries = semanalTableEntries(rows, year, mediaWeeks, {
    rankByAverage,
    peticionesTerritorial: layout.peticionesTerritorial,
  });

  const totalMedia = entries.reduce(
    (sum, entry) => sum + (entry.media ?? 0),
    0
  );
  const cellClass =
    "truncate px-[0.1cqi] py-[calc(var(--fit-scale,1)*0.25cqi)] text-center";
  const leadingColumnWidth = layout.centerRowHeader
    ? "12%"
    : layout.wideAverage
      ? "12%"
      : "13%";
  // The weekly columns share whatever remains, so giving the average a firm
  // readable width only tightens their unused gaps. Element comparisons need
  // room for decimals; territorial pivots have an even narrower average in
  // the source template, so they get the same minimum without touching the
  // territorial name column.
  const averageColumnWidth =
    layout.comparisonLabels || layout.centerRowHeader || layout.wideAverage
      ? "7.5%"
      : "4.5%";

  return (
    <div ref={containerRef} className="h-full max-h-full w-full overflow-auto">
      <table
        ref={tableRef}
        lang="es"
        className="w-full min-w-full table-fixed border-collapse font-mono text-[length:calc(var(--fit-scale,1)*1.15cqi)] leading-none tabular-nums"
      >
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th
              scope="col"
              className={`whitespace-normal hyphens-auto leading-tight py-[calc(var(--fit-scale,1)*0.3cqi)] ${layout.centerRowHeader ? "text-center" : "text-left"} font-normal ${
                layout.comparisonLabels ? "border-r border-border" : ""
              }`}
              style={{ width: leadingColumnWidth }}
            >
              {rowHeader}
            </th>
            <th
              scope="col"
              className={`truncate py-[calc(var(--fit-scale,1)*0.3cqi)] text-center font-normal ${
                layout.comparisonLabels ? "border-r border-border" : ""
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
                className={`whitespace-normal hyphens-auto leading-tight py-[calc(var(--fit-scale,1)*0.25cqi)] ${layout.centerRowHeader ? "text-center" : "text-left"} font-normal ${
                  layout.comparisonLabels ? "border-r border-border" : ""
                }`}
                title={entry.label}
              >
                {entry.label}
              </th>
              <td
                className={`${cellClass} ${
                  layout.comparisonLabels ? "border-r border-border" : ""
                }`}
              >
                {decimal(entry.media)}
              </td>
              {visibleWeeks.map(week => (
                <td key={week} className={cellClass}>
                  {formatTableNumber(entry.weekly.get(week))}
                </td>
              ))}
            </tr>
          ))}

          {totalRow && (
            <tr
              className={
                layout.highlightTotal
                  ? "bg-[var(--informe-serie-4)] font-medium text-white"
                  : "border-t border-border font-medium"
              }
            >
              <th
                scope="row"
                className={`whitespace-normal hyphens-auto leading-tight py-[calc(var(--fit-scale,1)*0.3cqi)] ${layout.centerRowHeader ? "text-center" : "text-left"} ${
                  layout.comparisonLabels ? "border-r border-border" : ""
                }`}
              >
                Total general
              </th>
              <td
                className={`${cellClass} ${
                  layout.comparisonLabels ? "border-r border-border" : ""
                }`}
              >
                {decimal(totalMedia)}
              </td>
              {visibleWeeks.map(week => {
                // A week no row reported stays blank, like the columns past the
                // reported one on the printed slide.
                const total = semanalWeekTotal(entries, week);

                return (
                  <td key={week} className={cellClass}>
                    {formatTableNumber(total)}
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
