import MatrixTable from "@/components/deck/MatrixTable";
import { EMPTY_TABLE_CELL } from "@/components/deck/emptyCell";
import { monthName, PETICIONES_ORIGENES } from "@shared/modules/informatica/mensual";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import { mensualSlides } from "../informeMensual";
import PageShell, { type InformaticaPageProps } from "./PageShell";
import { splitInBlocks } from "./splitInBlocks";

interface SmartTechMesPageProps extends InformaticaPageProps {
  dataset: InformaticaDataset;
}

/** The short tables share one size, a notch above the default. */
const SCALE = 1.1;

/** Blocks the SmartTech sites are split into, side by side. */
const SMARTTECH_BLOCKS = 3;

/** NaN is "not in the extract": it prints as a hyphen. */
function cell(value: number | null): number {
  return value === null ? Number.NaN : value;
}

const orHyphen = (format: (value: number) => string) => (value: number) =>
  Number.isNaN(value) ? EMPTY_TABLE_CELL : format(value);

/**
 * Second monthly slide, the month before the extraction: requests by origin
 * (the monthly GPS request files) beside the IMACs (the IMAC file), and tab 6-6,
 * the weekly SmartTech table over the whole month, underneath.
 */
export default function SmartTechMesPage({
  page,
  editing,
  onChange,
  dataset,
}: SmartTechMesPageProps) {
  const { month, peticiones, imacs, smartTech } = mensualSlides(dataset);
  const smartTechBlocks = splitInBlocks(
    [
      ...smartTech.map(row => ({
        label: row.site,
        values: [row.conCita, row.sinCita],
      })),
      {
        label: "Totales",
        values: [
          smartTech.reduce((sum, row) => sum + row.conCita, 0),
          smartTech.reduce((sum, row) => sum + row.sinCita, 0),
        ],
      },
    ],
    SMARTTECH_BLOCKS
  );
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
      <div className="flex min-h-0 flex-1 flex-col gap-[2.5cqi]">
        <div className="grid shrink-0 grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] items-start gap-[2.5cqi]">
          <section className="min-h-0 min-w-0" aria-label="Peticiones del mes">
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
        <section
          className="grid min-h-0 min-w-0 flex-1 grid-cols-3 items-start gap-[2.5cqi]"
          aria-label="Citas SmartTech por sede"
        >
          {smartTechBlocks.map((rows, index) => (
            <MatrixTable
              key={index}
              rowHeader="SmartTech"
              columns={["Con Cita", "Sin Cita"]}
              rows={rows}
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
