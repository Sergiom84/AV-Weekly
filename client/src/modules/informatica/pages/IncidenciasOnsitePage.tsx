import MatrixTable from "@/components/deck/MatrixTable";
import { EMPTY_TABLE_CELL } from "@/components/deck/emptyCell";
import { monthName } from "@shared/modules/informatica/mensual";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import { decimal } from "../aggregate";
import { mensualSlides } from "../informeMensual";
import PageShell, { type InformaticaPageProps } from "./PageShell";

interface IncidenciasOnsitePageProps extends InformaticaPageProps {
  dataset: InformaticaDataset;
}

/** The two short tables share one size, well above the default. */
const SCALE = 1.6;

/** NaN is "not in the extract": it prints as a hyphen. */
function cell(value: number | null): number {
  return value === null ? Number.NaN : value;
}

const orHyphen = (format: (value: number) => string) => (value: number) =>
  Number.isNaN(value) ? EMPTY_TABLE_CELL : format(value);

/**
 * First monthly slide, the month before the extraction: incidents (tab 7-7)
 * with the surveys (tab 1-1) underneath.
 */
export default function IncidenciasOnsitePage({
  page,
  editing,
  onChange,
  dataset,
}: IncidenciasOnsitePageProps) {
  const { month, incidencias, encuestas } = mensualSlides(dataset);

  return (
    <PageShell page={page} editing={editing} onChange={onChange}>
      <p className="shrink-0 font-mono text-[1.4cqi] font-medium capitalize">
        {month ? monthName(month) : EMPTY_TABLE_CELL}
      </p>
      <div className="flex min-h-0 flex-1 flex-col gap-[3cqi]">
        <section className="min-w-0" aria-label="Incidencias On Site">
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
    </PageShell>
  );
}
