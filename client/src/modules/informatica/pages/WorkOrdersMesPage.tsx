import MatrixTable from "@/components/deck/MatrixTable";
import { EMPTY_TABLE_CELL } from "@/components/deck/emptyCell";
import { monthName } from "@shared/modules/informatica/mensual";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import { mensualSlides } from "../informeMensual";
import PageShell, { type InformaticaPageProps } from "./PageShell";

interface WorkOrdersMesPageProps extends InformaticaPageProps {
  dataset: InformaticaDataset;
}

/** The table grows up to this factor to fill the slide. */
const GROW = 1.6;

/**
 * Second monthly slide, the month before the extraction: the work orders of
 * every SmartTech site in one continuous table.
 */
export default function WorkOrdersMesPage({
  page,
  editing,
  onChange,
  dataset,
}: WorkOrdersMesPageProps) {
  const { month, workOrders } = mensualSlides(dataset);

  return (
    <PageShell page={page} editing={editing} onChange={onChange}>
      <p className="shrink-0 font-mono text-[1.4cqi] font-medium capitalize">
        {month ? monthName(month) : EMPTY_TABLE_CELL}
      </p>
      <section className="min-h-0 min-w-0 flex-1" aria-label="Workorders por sede">
        <MatrixTable
          rowHeader="Workorders"
          columns={["Total"]}
          rows={workOrders.map(row => ({ label: row.site, values: [row.total] }))}
          rowTotals={false}
          variant="report"
          maxScale={GROW}
          formatValue={String}
        />
      </section>
    </PageShell>
  );
}
