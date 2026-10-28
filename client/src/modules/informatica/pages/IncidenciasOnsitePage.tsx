import MatrixTable from "@/components/deck/MatrixTable";
import { EMPTY_TABLE_CELL } from "@/components/deck/emptyCell";
import { monthName } from "@shared/modules/informatica/mensual";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import { decimal } from "../aggregate";
import { mensualSlides } from "../informeMensual";
import PageShell, { type InformaticaPageProps } from "./PageShell";
import { splitInBlocks } from "./splitInBlocks";

interface IncidenciasOnsitePageProps extends InformaticaPageProps {
  dataset: InformaticaDataset;
}

/** The short tables share one size, a notch above the default. */
const SCALE = 1.25;

/** NaN is "not in the extract": it prints as a hyphen. */
function cell(value: number | null): number {
  return value === null ? Number.NaN : value;
}

const orHyphen = (format: (value: number) => string) => (value: number) =>
  Number.isNaN(value) ? EMPTY_TABLE_CELL : format(value);

/** Blocks the work orders are split into, side by side. */
const WORK_ORDER_BLOCKS = 3;

/**
 * First monthly slide, the month before the extraction: incidents and surveys
 * side by side (tabs 7-7 and 1-1), work orders by site underneath.
 */
export default function IncidenciasOnsitePage({
  page,
  editing,
  onChange,
  dataset,
}: IncidenciasOnsitePageProps) {
  const { month, incidencias, encuestas, workOrders } = mensualSlides(dataset);
  const workOrderBlocks = splitInBlocks(
    [
      ...workOrders.map(row => ({ label: row.site, values: [row.total] })),
      {
        label: "Total",
        values: [workOrders.reduce((sum, row) => sum + row.total, 0)],
      },
    ],
    WORK_ORDER_BLOCKS
  );

  return (
    <PageShell page={page} editing={editing} onChange={onChange}>
      <p className="shrink-0 font-mono text-[1.4cqi] font-medium capitalize">
        {month ? monthName(month) : EMPTY_TABLE_CELL}
      </p>
      <div className="flex min-h-0 flex-1 flex-col gap-[2.5cqi]">
        <div className="grid shrink-0 grid-cols-2 items-start gap-[2.5cqi]">
          <section className="min-h-0 min-w-0" aria-label="Incidencias On Site">
            <MatrixTable
              rowHeader="Incidencias"
              columns={["On Site"]}
              rows={[
                { label: "Resueltas", values: [cell(incidencias.resueltas)] },
                { label: "Abiertas", values: [cell(incidencias.abiertas)] },
                { label: "Backlog", values: [cell(incidencias.backlog)] },
              ]}
              rowTotals={false}
              columnTotals={false}
              variant="report"
              fill={false}
              scale={SCALE}
              formatValue={orHyphen(String)}
            />
          </section>
          <section className="min-w-0" aria-label="Encuestas">
            <MatrixTable
              rowHeader="Encuestas"
              columns={["Datos"]}
              rows={[
                { label: "Nº", values: [cell(encuestas.numero)] },
                { label: "Promedio", values: [cell(encuestas.promedio)] },
              ]}
              rowTotals={false}
              columnTotals={false}
              variant="report"
              fill={false}
              scale={SCALE}
              formatValue={value =>
                Number.isNaN(value)
                  ? EMPTY_TABLE_CELL
                  : Number.isInteger(value)
                    ? String(value)
                    : decimal(value)
              }
            />
          </section>
        </div>
        <section
          className="grid min-h-0 min-w-0 flex-1 grid-cols-3 items-start gap-[2.5cqi]"
          aria-label="Workorders por sede"
        >
          {workOrderBlocks.map((rows, index) => (
            <MatrixTable
              key={index}
              rowHeader="Workorders"
              columns={["Total"]}
              rows={rows}
              rowTotals={false}
              columnTotals={false}
              variant="report"
              fill={false}
              scale={SCALE}
              formatValue={String}
            />
          ))}
        </section>
      </div>
    </PageShell>
  );
}
