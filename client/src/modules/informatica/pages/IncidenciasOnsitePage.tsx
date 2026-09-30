import MatrixTable from "@/components/deck/MatrixTable";
import { EMPTY_TABLE_CELL } from "@/components/deck/emptyCell";
import { monthName, PETICIONES_ORIGENES } from "@shared/modules/informatica/mensual";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import { decimal } from "../aggregate";
import { mensualSlides } from "../informeMensual";
import PageShell, { type InformaticaPageProps } from "./PageShell";

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

/**
 * The month before the extraction: tabs 7-7, 1-1 and 5-5, the monthly GPS
 * request files and the IMAC file.
 */
export default function IncidenciasOnsitePage({
  page,
  editing,
  onChange,
  dataset,
}: IncidenciasOnsitePageProps) {
  const { month, incidencias, encuestas, peticiones, imacs, workOrders } =
    mensualSlides(dataset);
  const peticionRows = (
    [
      ["Backlog", "backlog"],
      ["Liberadas", "liberadas"],
      ["Gestionadas", "gestionadas"],
    ] as const
  ).map(([label, key]) => ({
    label,
    values: peticiones.map(row => cell(row[key])),
  }));

  return (
    <PageShell page={page} editing={editing} onChange={onChange}>
      <p className="shrink-0 font-mono text-[1.4cqi] font-medium capitalize">
        {month ? monthName(month) : EMPTY_TABLE_CELL}
      </p>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)] gap-[2.5cqi]">
        <div className="flex min-h-0 min-w-0 flex-col justify-between">
          <div className="grid grid-cols-2 items-start gap-[2.5cqi]">
            <section
              className="min-h-0 min-w-0"
              aria-label="Incidencias On Site"
            >
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
          <div className="flex flex-col gap-[0.6cqi]">
            <section
              className="min-h-0 min-w-0"
              aria-label="Peticiones del mes"
            >
              <MatrixTable
                rowHeader="Origen"
                columns={[...PETICIONES_ORIGENES]}
                rows={peticionRows}
                columnTotals={false}
                totalsLabel="Totales"
                variant="report"
                fill={false}
                scale={SCALE}
                formatValue={orHyphen(String)}
              />
            </section>
          </div>
          <section className="min-h-0 min-w-0" aria-label="IMACS del mes">
            <MatrixTable
              rowHeader="IMACS"
              columns={["Solicitudes", "Trabajos"]}
              rows={[
                {
                  label: "Gestionados",
                  values: imacs
                    ? [imacs.solicitudes, imacs.trabajos]
                    : [Number.NaN, Number.NaN],
                },
              ]}
              rowTotals={false}
              columnTotals={false}
              variant="report"
              fill={false}
              scale={SCALE}
              formatValue={orHyphen(String)}
            />
          </section>
        </div>
        <section className="min-h-0 min-w-0" aria-label="Workorders por sede">
          <MatrixTable
            rowHeader="Workorders"
            columns={["Total"]}
            rows={workOrders.map(row => ({ label: row.site, values: [row.total] }))}
            rowTotals={false}
            variant="report"
            formatValue={String}
          />
        </section>
      </div>
    </PageShell>
  );
}
