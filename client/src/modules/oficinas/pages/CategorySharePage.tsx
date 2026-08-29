import CategoryBarChart, {
  type CategorySeries,
} from "@/components/deck/CategoryBarChart";
import KpiRow, { type KpiItem } from "@/components/deck/KpiRow";
import ValueGrid from "@/components/deck/ValueGrid";
import { useFitTableScale } from "@/hooks/useFitTableScale";
import { oficinasColor, percent } from "../aggregate";
import { cellKey, isOverridden, overriddenValue, withOverride } from "../overrides";
import PageShell, { type OficinasPageProps } from "./PageShell";

export interface ShareEntry {
  /** Row label, and the override row key. Unique within the page. */
  label: string;
  imported: number | null;
}

interface CategorySharePageProps extends OficinasPageProps {
  entries: ShareEntry[];
  /** Column part of the override key: the week or the year the figures belong to. */
  column: string;
  /** Legend and table header of the single series. */
  seriesLabel: string;
  kpis?: KpiItem[];
  /** Rows the bar chart draws. The rest still reach the share table. */
  topN?: number;
  /**
   * Denominator of the shares, when the page charts a subset of the matrix.
   *
   * The element pages carry eighty-five rows and show the leading ones, so the
   * share has to divide by the whole section: a percentage of the visible rows
   * alone would say the top twelve are the whole service.
   */
  total?: number;
  /** Compact cards and centre the short three-column pivot. */
  compactPresentation?: boolean;
}

/**
 * A single-series breakdown with its share of the total: the request types and
 * the recycler elements.
 *
 * The share is recomputed from the values on screen and never read from the
 * source. Sheets 14 and 17 ship it inside the cell text (`"49 (39%)"`) and only
 * the count is stored, so a corrected figure and its percentage cannot drift
 * apart here the way they do in the workbook.
 */
export default function CategorySharePage({
  page,
  editing,
  onChange,
  entries,
  column,
  seriesLabel,
  kpis = [],
  topN,
  total: totalOverride,
  compactPresentation = false,
}: CategorySharePageProps) {
  const cells = entries.map(entry => {
    const key = cellKey(entry.label, column);

    return {
      label: entry.label,
      key,
      value: overriddenValue(page, key, entry.imported),
      overridden: isOverridden(page, key),
    };
  });

  const shown = cells.reduce((sum, cell) => sum + (cell.value ?? 0), 0);
  const total = totalOverride ?? shown;
  const ranked = [...cells].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const charted = topN === undefined ? ranked : ranked.slice(0, topN);

  const series: CategorySeries[] = [
    { key: "valor", label: seriesLabel, color: oficinasColor(0) },
  ];

  const data = charted.map(cell => ({
    categoria: cell.label,
    valor: cell.value ?? 0,
  }));

  return (
    <PageShell page={page} editing={editing} onChange={onChange}>
      <KpiRow items={kpis} compact={compactPresentation} />

      <div
        className={`flex min-h-0 flex-col ${
          compactPresentation ? "flex-[2.55]" : "flex-[3]"
        }`}
      >
        <CategoryBarChart
          categoryKey="categoria"
          series={series}
          data={data}
          angledCategories
          alignYAxisStart={compactPresentation}
        />
      </div>

      <div className={`min-h-0 ${compactPresentation ? "flex-[2.45]" : "flex-[2]"}`}>
        <ShareTable
          rows={ranked.map(cell => ({
            label: cell.label,
            value: cell.value ?? 0,
            share: total === 0 ? 0 : (cell.value ?? 0) / total,
          }))}
          total={total}
          header={seriesLabel}
          compact={compactPresentation}
        />
      </div>

      {editing && (
        <ValueGrid
          columns={[column]}
          rows={cells.map(cell => ({
            label: cell.label,
            cells: [
              { key: cell.key, value: cell.value, overridden: cell.overridden },
            ],
          }))}
          onChange={(key, value) => onChange(withOverride(page, key, value))}
        />
      )}
    </PageShell>
  );
}

interface ShareTableProps {
  rows: { label: string; value: number; share: number }[];
  total: number;
  header: string;
  compact?: boolean;
}

/** Two-column breakdown printed under the bars: the count and its share. */
function ShareTable({ rows, total, header, compact = false }: ShareTableProps) {
  const { containerRef, tableRef } = useFitTableScale<
    HTMLDivElement,
    HTMLTableElement
  >({
    deps: [rows.length],
    // The compact element/type slides are visual siblings. Without this cap a
    // short pivot (eight request types) grows larger than a twelve-row element
    // pivot merely because it has fewer lines to fit.
    maxScale: compact ? 0.615 : 1,
  });
  const labelWidth = compact ? "w-1/3" : "w-[60%]";
  const numericWidth = compact ? "w-1/3" : "";

  return (
    <div ref={containerRef} className="h-full max-h-full w-full overflow-auto">
      <table
        ref={tableRef}
        className={`table-fixed border-collapse font-mono leading-none tabular-nums ${
          compact
            ? "text-[length:calc(var(--fit-scale,1)*1.5cqi)]"
            : "text-[length:calc(var(--fit-scale,1)*1.15cqi)]"
        } ${
          compact ? "mx-auto w-[50%]" : "w-full min-w-full"
        }`}
      >
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th
              scope="col"
              className={`${labelWidth} ${
                compact ? "whitespace-normal break-words" : "truncate"
              } py-[calc(var(--fit-scale,1)*0.3cqi)] text-left font-normal`}
            >
              {header}
            </th>
            <th
              scope="col"
              className={`${numericWidth} truncate py-[calc(var(--fit-scale,1)*0.3cqi)] text-center font-normal`}
            >
              Nº
            </th>
            <th
              scope="col"
              className={`${numericWidth} truncate py-[calc(var(--fit-scale,1)*0.3cqi)] text-center font-normal`}
            >
              %
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.label} className="border-b border-border/60">
              <th
                scope="row"
                className={`${
                  compact ? "whitespace-normal break-words" : "truncate"
                } py-[calc(var(--fit-scale,1)*0.25cqi)] text-left font-normal`}
                title={row.label}
              >
                {row.label}
              </th>
              <td className="truncate px-[0.2cqi] py-[calc(var(--fit-scale,1)*0.25cqi)] text-center">
                {row.value}
              </td>
              <td className="truncate px-[0.2cqi] py-[calc(var(--fit-scale,1)*0.25cqi)] text-center">
                {percent(row.share)}
              </td>
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
              className={`${
                compact ? "whitespace-normal break-words" : "truncate"
              } py-[calc(var(--fit-scale,1)*0.3cqi)] text-left`}
            >
              {compact ? "Total general" : "Total"}
            </th>
            <td className="truncate px-[0.2cqi] py-[calc(var(--fit-scale,1)*0.3cqi)] text-center">
              {total}
            </td>
            <td className="truncate px-[0.2cqi] py-[calc(var(--fit-scale,1)*0.3cqi)] text-center">
              {total === 0 ? "" : "100%"}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
