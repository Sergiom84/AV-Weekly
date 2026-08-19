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
      <KpiRow items={kpis} />

      <div className="flex min-h-0 flex-[3] flex-col">
        <CategoryBarChart
          categoryKey="categoria"
          series={series}
          data={data}
          angledCategories
        />
      </div>

      <div className="min-h-0 flex-[2]">
        <ShareTable
          rows={ranked.map(cell => ({
            label: cell.label,
            value: cell.value ?? 0,
            share: total === 0 ? 0 : (cell.value ?? 0) / total,
          }))}
          total={total}
          header={seriesLabel}
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
}

/** Two-column breakdown printed under the bars: the count and its share. */
function ShareTable({ rows, total, header }: ShareTableProps) {
  const { containerRef, tableRef } = useFitTableScale<
    HTMLDivElement,
    HTMLTableElement
  >({ deps: [rows.length] });

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
              className="w-[60%] truncate py-[calc(var(--fit-scale,1)*0.3cqi)] text-left font-normal"
            >
              {header}
            </th>
            <th
              scope="col"
              className="truncate py-[calc(var(--fit-scale,1)*0.3cqi)] text-center font-normal"
            >
              Nº
            </th>
            <th
              scope="col"
              className="truncate py-[calc(var(--fit-scale,1)*0.3cqi)] text-center font-normal"
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
                className="truncate py-[calc(var(--fit-scale,1)*0.25cqi)] text-left font-normal"
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

          <tr className="border-t border-border font-medium">
            <th
              scope="row"
              className="truncate py-[calc(var(--fit-scale,1)*0.3cqi)] text-left"
            >
              Total
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
