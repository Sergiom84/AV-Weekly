import MatrixTable from "@/components/deck/MatrixTable";
import { EMPTY_TABLE_CELL } from "@/components/deck/emptyCell";
import { monthName, PETICIONES_ORIGENES } from "@shared/modules/informatica/mensual";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import { mensualSlides } from "../informeMensual";
import PageShell, { type InformaticaPageProps } from "./PageShell";

interface OrigenImacsMesPageProps extends InformaticaPageProps {
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
 * Third monthly slide, the month before the extraction: the requests by origin
 * (the monthly GPS request files) with the IMACs (the IMAC file) underneath.
 */
export default function OrigenImacsMesPage({
  page,
  editing,
  onChange,
  dataset,
}: OrigenImacsMesPageProps) {
  const { month, peticiones, imacs } = mensualSlides(dataset);
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
      <div className="flex min-h-0 flex-1 flex-col gap-[3cqi]">
        <section className="min-w-0" aria-label="Peticiones del mes">
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
        <section className="min-w-0" aria-label="IMACS del mes">
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
    </PageShell>
  );
}
