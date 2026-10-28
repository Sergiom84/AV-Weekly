import MatrixTable from "@/components/deck/MatrixTable";
import { EMPTY_TABLE_CELL } from "@/components/deck/emptyCell";
import { monthName, TOP_TEN_MENSUAL } from "@shared/modules/informatica/mensual";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import { mensualSlides } from "../informeMensual";
import PageShell, { type InformaticaPageProps } from "./PageShell";

interface TopTenSlaMesPageProps extends InformaticaPageProps {
  dataset: InformaticaDataset;
}

/** Short tables grow up to this factor to fill their block. */
const GROW = 1.6;

const orHyphen = (format: (value: number) => string) => (value: number) =>
  Number.isNaN(value) ? EMPTY_TABLE_CELL : format(value);

/**
 * Third monthly slide, the month before the extraction: the 2-2 HIC pivot, top
 * ten categories, beside tab 13-12, the SLAs closed that month. A level with no
 * ticket in a month that has results reads 100 %.
 */
export default function TopTenSlaMesPage({
  page,
  editing,
  onChange,
  dataset,
}: TopTenSlaMesPageProps) {
  const { month, topTen, slas } = mensualSlides(dataset);

  return (
    <PageShell page={page} editing={editing} onChange={onChange}>
      <p className="shrink-0 font-mono text-[1.4cqi] font-medium capitalize">
        {month ? monthName(month) : EMPTY_TABLE_CELL}
      </p>
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-[2.5cqi]">
        <section
          className="min-h-0 min-w-0"
          aria-label="Top ten de incidencias del mes"
        >
          <MatrixTable
            rowHeader="Top Ten Incidencias Mensuales"
            columns={["Total"]}
            rows={(
              topTen ??
              TOP_TEN_MENSUAL.map(categoria => ({ categoria, total: Number.NaN }))
            ).map(row => ({
              label: row.categoria,
              values: [row.total],
            }))}
            rowTotals={false}
            columnTotals={false}
            variant="report"
            maxScale={GROW}
            formatValue={orHyphen(String)}
          />
        </section>
        <section className="min-h-0 min-w-0" aria-label="SLA del mes anterior">
          <MatrixTable
            rowHeader="SLA"
            columns={["Cumplimiento"]}
            rows={slas.map(row => ({
              label: row.label,
              values: [
                row.share === null ? Number.NaN : Math.round(row.share * 100),
              ],
            }))}
            rowTotals={false}
            columnTotals={false}
            variant="report"
            maxScale={GROW}
            formatValue={orHyphen(value => `${value}%`)}
          />
        </section>
      </div>
    </PageShell>
  );
}
