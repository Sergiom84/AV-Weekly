import { EMPTY_TABLE_CELL } from "@/components/deck/emptyCell";
import KpiRow from "@/components/deck/KpiRow";
import ValueGrid from "@/components/deck/EditorValueGrid";
import { useFitTableScale } from "@/hooks/useFitTableScale";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import { monthLabel, percent, reportMonth } from "../aggregate";
import { figureCell, gridRow, withOverride } from "../overrides";
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
      const label = svtLabel(row.svt);
      const period = month ?? "sin-mes";
      const cumplido = figureCell(page, label, `${period}:cumplido`, row.cumplido);
      const incumplido = figureCell(
        page,
        label,
        `${period}:incumplido`,
        row.incumplido
      );
      const measured = cumplido.drawn + incumplido.drawn;

      return {
        svt: row.svt,
        label,
        cumplido: cumplido.drawn,
        incumplido: incumplido.drawn,
        total: row.total,
        share: measured > 0 ? cumplido.drawn / measured : null,
        grid: gridRow(label, [cumplido, incumplido]),
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
    <PageShell
      page={page}
      editing={editing}
      onChange={onChange}
      editor={
        editing && (
          <ValueGrid
            columns={["Cumplido", "Incumplido"]}
            rows={current.map(row => row.grid)}
            onChange={(key, value) => onChange(withOverride(page, key, value))}
          />
        )
      }
    >
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

      {/* Framed like every other report table; the frame hugs the rows. */}
      <div ref={containerRef} className="min-h-0 w-full flex-1 overflow-hidden">
        <div className="w-full overflow-hidden rounded-[0.4cqi] border border-border shadow-sm">
        <table
          ref={tableRef}
          className="w-full min-w-full table-fixed border-collapse font-mono text-[length:calc(var(--fit-scale,1)*1.15cqi)] leading-snug tabular-nums"
        >
          <thead>
            <tr className="bg-primary text-primary-foreground">
              <th
                scope="col"
                className="w-[40%] px-[0.2cqi] py-[calc(var(--fit-scale,1)*0.3cqi)] text-left font-semibold tracking-wide"
              >
                SVT
              </th>
              {["Cumplido", "Incumplido", "Total", "% Cumplimiento"].map(
                (column) => (
                  <th
                    key={column}
                    scope="col"
                    className="px-[0.2cqi] py-[calc(var(--fit-scale,1)*0.3cqi)] text-center font-semibold"
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
                  className="border-r border-border bg-muted/30 px-[0.2cqi] py-[calc(var(--fit-scale,1)*0.25cqi)] text-left font-semibold text-muted-foreground"
                >
                  {svtLabel(row.svt)}
                </th>
                <td className="whitespace-nowrap px-[0.2cqi] py-[calc(var(--fit-scale,1)*0.25cqi)] text-center">
                  {row.cumplido.toLocaleString("es-ES")}
                </td>
                <td className="whitespace-nowrap px-[0.2cqi] py-[calc(var(--fit-scale,1)*0.25cqi)] text-center">
                  {row.incumplido.toLocaleString("es-ES")}
                </td>
                <td className="whitespace-nowrap px-[0.2cqi] py-[calc(var(--fit-scale,1)*0.25cqi)] text-center">
                  {row.total.toLocaleString("es-ES")}
                </td>
                <td className="whitespace-nowrap bg-muted/40 px-[0.2cqi] py-[calc(var(--fit-scale,1)*0.25cqi)] text-center font-medium">
                  {row.share === null ? EMPTY_TABLE_CELL : percent(row.share)}
                </td>
              </tr>
            ))}

            <tr className="bg-primary font-semibold text-primary-foreground">
              <th
                scope="row"
                className="px-[0.2cqi] py-[calc(var(--fit-scale,1)*0.3cqi)] text-left"
              >
                Total
              </th>
              <td className="whitespace-nowrap px-[0.2cqi] py-[calc(var(--fit-scale,1)*0.3cqi)] text-center">
                {met.toLocaleString("es-ES")}
              </td>
              <td className="whitespace-nowrap px-[0.2cqi] py-[calc(var(--fit-scale,1)*0.3cqi)] text-center">
                {missed.toLocaleString("es-ES")}
              </td>
              <td className="whitespace-nowrap px-[0.2cqi] py-[calc(var(--fit-scale,1)*0.3cqi)] text-center">
                {current
                  .reduce((sum, row) => sum + row.total, 0)
                  .toLocaleString("es-ES")}
              </td>
              <td className="whitespace-nowrap px-[0.2cqi] py-[calc(var(--fit-scale,1)*0.3cqi)] text-center">
                {measured > 0 ? percent(met / measured) : EMPTY_TABLE_CELL}
              </td>
            </tr>
          </tbody>
        </table>
        </div>
      </div>
    </PageShell>
  );
}
