import { EMPTY_TABLE_CELL } from "@/components/deck/emptyCell";
import KpiRow from "@/components/deck/KpiRow";
import { useFitTableScale } from "@/hooks/useFitTableScale";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import { monthLabel, percent, reportMonth } from "../aggregate";
import PageShell, { type InformaticaPageProps } from "./PageShell";

interface SlasPageProps extends InformaticaPageProps {
  dataset: InformaticaDataset;
}

/**
 * Service level name without the `WPSPAIN_Minsait.` prefix every row carries.
 *
 * Trimming only the part that is identical on every line: the priority and the
 * scope that follow are what tells one level from another, and `Inc.Reacción.
 * P3.SSCC` is the name the service catalogue uses.
 */
function svtLabel(svt: string): string {
  return svt.replace(/^WPSPAIN_Minsait\./, "");
}

/**
 * `2.1.7 SLAs`: compliance of every service level in the reported month.
 *
 * A table rather than a chart. Compliance sits between 96 % and 100 % on every
 * level, so as bars it is five identical full columns; what the reader needs is
 * the count of breaches and the exact percentage, and both are numbers.
 *
 * The percentage is computed here, not read: the sheet reports counts, and a
 * stored percentage would drift from them the moment a row is corrected. It is
 * taken over `Cumplido + Incumplido` rather than the sheet's own `Total`, so a
 * level whose total does not add up shows the compliance of what was actually
 * measured — and the mismatch is visible in the two columns next to it.
 */
export default function SlasPage({
  page,
  editing,
  onChange,
  dataset,
}: SlasPageProps) {
  const rows = dataset.slas ?? [];
  const month = reportMonth(dataset, rows, (row) => row.mes);

  const current = rows
    .filter((row) => row.mes === month)
    .map((row) => {
      const measured = row.cumplido + row.incumplido;

      return {
        svt: row.svt,
        cumplido: row.cumplido,
        incumplido: row.incumplido,
        total: row.total,
        share: measured > 0 ? row.cumplido / measured : null,
      };
    })
    .sort((a, b) => a.svt.localeCompare(b.svt, "es"));

  const met = current.reduce((sum, row) => sum + row.cumplido, 0);
  const missed = current.reduce((sum, row) => sum + row.incumplido, 0);
  const measured = met + missed;

  const { containerRef, tableRef } = useFitTableScale<
    HTMLDivElement,
    HTMLTableElement
  >({ deps: [current.length] });

  const suffix = month ? ` ${monthLabel(month)}` : "";

  return (
    <PageShell page={page} editing={editing} onChange={onChange}>
      <KpiRow
        items={[
          {
            label: `Medidos${suffix}`,
            value: measured.toLocaleString("es-ES"),
          },
          {
            label: "Cumplimiento",
            value: measured > 0 ? percent(met / measured) : EMPTY_TABLE_CELL,
          },
          { label: "Incumplidos", value: missed.toLocaleString("es-ES") },
        ]}
      />

      <div
        ref={containerRef}
        className="min-h-0 w-full flex-1 overflow-auto"
      >
        <table
          ref={tableRef}
          className="w-full min-w-full table-fixed border-collapse font-mono text-[length:calc(var(--fit-scale,1)*1.15cqi)] leading-none tabular-nums"
        >
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th
                scope="col"
                className="w-[40%] truncate py-[calc(var(--fit-scale,1)*0.3cqi)] text-left font-normal"
              >
                SVT
              </th>
              {["Cumplido", "Incumplido", "Total", "% Cumplimiento"].map(
                (column) => (
                  <th
                    key={column}
                    scope="col"
                    className="truncate py-[calc(var(--fit-scale,1)*0.3cqi)] text-center font-normal"
                  >
                    {column}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {current.map((row) => (
              <tr key={row.svt} className="border-b border-border/60">
                <th
                  scope="row"
                  className="truncate py-[calc(var(--fit-scale,1)*0.25cqi)] text-left font-normal"
                >
                  {svtLabel(row.svt)}
                </th>
                <td className="truncate px-[0.2cqi] py-[calc(var(--fit-scale,1)*0.25cqi)] text-center">
                  {row.cumplido.toLocaleString("es-ES")}
                </td>
                <td className="truncate px-[0.2cqi] py-[calc(var(--fit-scale,1)*0.25cqi)] text-center">
                  {row.incumplido.toLocaleString("es-ES")}
                </td>
                <td className="truncate px-[0.2cqi] py-[calc(var(--fit-scale,1)*0.25cqi)] text-center">
                  {row.total.toLocaleString("es-ES")}
                </td>
                <td className="truncate px-[0.2cqi] py-[calc(var(--fit-scale,1)*0.25cqi)] text-center font-medium">
                  {row.share === null ? EMPTY_TABLE_CELL : percent(row.share)}
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
                {met.toLocaleString("es-ES")}
              </td>
              <td className="truncate px-[0.2cqi] py-[calc(var(--fit-scale,1)*0.3cqi)] text-center">
                {missed.toLocaleString("es-ES")}
              </td>
              <td className="truncate px-[0.2cqi] py-[calc(var(--fit-scale,1)*0.3cqi)] text-center">
                {current
                  .reduce((sum, row) => sum + row.total, 0)
                  .toLocaleString("es-ES")}
              </td>
              <td className="truncate px-[0.2cqi] py-[calc(var(--fit-scale,1)*0.3cqi)] text-center">
                {measured > 0 ? percent(met / measured) : EMPTY_TABLE_CELL}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}
