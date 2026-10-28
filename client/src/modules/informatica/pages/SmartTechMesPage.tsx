import MatrixTable from "@/components/deck/MatrixTable";
import { EMPTY_TABLE_CELL } from "@/components/deck/emptyCell";
import { monthName } from "@shared/modules/informatica/mensual";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import { mensualSlides } from "../informeMensual";
import PageShell, { type InformaticaPageProps } from "./PageShell";

interface SmartTechMesPageProps extends InformaticaPageProps {
  dataset: InformaticaDataset;
}

/** The table grows up to this factor to fill the slide. */
const GROW = 1.6;

/**
 * Fourth monthly slide, the month before the extraction: tab 6-6, the weekly
 * SmartTech table over the whole month, in one continuous table.
 */
export default function SmartTechMesPage({
  page,
  editing,
  onChange,
  dataset,
}: SmartTechMesPageProps) {
  const { month, smartTech } = mensualSlides(dataset);

  return (
    <PageShell page={page} editing={editing} onChange={onChange}>
      <p className="shrink-0 font-mono text-[1.4cqi] font-medium capitalize">
        {month ? monthName(month) : EMPTY_TABLE_CELL}
      </p>
      <section
        className="min-h-0 min-w-0 flex-1"
        aria-label="Citas SmartTech por sede"
      >
        <MatrixTable
          rowHeader="SmartTech"
          columns={["Con Cita", "Sin Cita"]}
          rows={smartTech.map(row => ({
            label: row.site,
            values: [row.conCita, row.sinCita],
          }))}
          totalsLabel="Totales"
          variant="report"
          maxScale={GROW}
          formatValue={String}
        />
      </section>
    </PageShell>
  );
}
