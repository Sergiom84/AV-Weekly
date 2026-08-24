import type { InformaticaDataset } from "@shared/modules/informatica/types";
import { percent, reportMonth } from "../aggregate";
import PageShell, { type InformaticaPageProps } from "./PageShell";

interface EncuestasPageProps extends InformaticaPageProps {
  dataset: InformaticaDataset;
}

/** The complete score scale is always visible, including scores with no answers. */
const SCORES = [1, 2, 3, 4, 5];

/**
 * `2.1.5 Encuestas Incidencias SSCC`: score, response count and share for the
 * latest closed month represented in the source data.
 */
export default function EncuestasPage({
  page,
  editing,
  onChange,
  dataset,
}: EncuestasPageProps) {
  const rows = dataset.encuestas ?? [];
  const month = reportMonth(dataset, rows, row => row.mes);
  const current = rows.filter(row => row.mes === month);
  const distribution = SCORES.map(score => ({
    score,
    responses: current
      .filter(row => Number(row.valoracion) === score)
      .reduce((sum, row) => sum + row.respuestas, 0),
  }));
  const total = distribution.reduce((sum, row) => sum + row.responses, 0);

  return (
    <PageShell page={page} editing={editing} onChange={onChange}>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full table-fixed border-collapse font-mono text-[1.35cqi] tabular-nums">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th
                scope="col"
                className="w-1/2 px-[0.8cqi] py-[0.8cqi] text-left font-normal"
              >
                Promedio de encuestas
              </th>
              <th
                scope="col"
                className="w-1/4 px-[0.8cqi] py-[0.8cqi] text-center font-normal"
              >
                Cantidad
              </th>
              <th
                scope="col"
                className="w-1/4 px-[0.8cqi] py-[0.8cqi] text-center font-normal"
              >
                Porcentaje
              </th>
            </tr>
          </thead>
          <tbody>
            {distribution.map(row => (
              <tr key={row.score} className="border-b border-border/60">
                <th
                  scope="row"
                  className="px-[0.8cqi] py-[0.95cqi] text-left text-[1.55cqi] font-normal"
                >
                  {row.score}
                </th>
                <td className="px-[0.8cqi] py-[0.95cqi] text-center">
                  {row.responses.toLocaleString("es-ES")}
                </td>
                <td className="px-[0.8cqi] py-[0.95cqi] text-center">
                  {total > 0 ? percent(row.responses / total) : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}
