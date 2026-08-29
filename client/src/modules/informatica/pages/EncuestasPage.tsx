import type { InformaticaDataset } from "@shared/modules/informatica/types";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { decimal, monthLabel, percent, reportMonth, reportMonths } from "../aggregate";
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
  const average = total > 0
    ? distribution.reduce((sum, row) => sum + row.score * row.responses, 0) / total
    : null;
  const months = reportMonths(dataset, rows, row => row.mes);
  const trend = months.map(target => {
    const values = rows.filter(row => row.mes === target);
    const responses = values.reduce((sum, row) => sum + row.respuestas, 0);
    const satisfaction = responses > 0
      ? values.reduce((sum, row) => sum + Number(row.valoracion) * row.respuestas, 0) / responses
      : 0;

    return { mes: monthLabel(target), satisfaction };
  });
  const currentLabel = month ? monthLabel(month) : "Sin periodo";
  const gauge = average === null ? 0 : Math.max(0, Math.min(100, average * 20));

  return (
    <PageShell page={page} editing={editing} onChange={onChange}>
      <div className="grid min-h-0 flex-1 grid-cols-[.95fr_1.15fr_.8fr] grid-rows-[auto_1fr] gap-[1.4cqi]">
        <section className="col-span-2 overflow-hidden rounded-[1cqi] border border-border bg-card" aria-label="Satisfacción del mes en curso">
          <div className="bg-primary px-[1.2cqi] py-[0.55cqi] text-center font-mono text-[1.45cqi] font-semibold text-primary-foreground">
            Mes en curso: {currentLabel}
          </div>
          <div className="flex items-center gap-[1.5cqi] px-[1.25cqi] py-[1.1cqi]">
            <div
              className="grid h-[8.7cqi] w-[8.7cqi] shrink-0 place-items-center rounded-full p-[0.65cqi]"
              style={{ background: `conic-gradient(var(--informe-serie-3) ${gauge}%, var(--muted) 0)` }}
              aria-label={`Satisfacción ${average === null ? "sin respuestas" : `${decimal(average)} sobre 5`}`}
            >
              <div className="grid h-full w-full place-items-center rounded-full bg-card text-center font-mono">
                <span className="text-[2cqi] font-semibold tabular-nums">{decimal(average)}</span>
                <span className="text-[.85cqi] text-muted-foreground">/ 5,00</span>
              </div>
            </div>
            <div className="min-w-0 font-mono">
              <p className="text-[1.25cqi] text-muted-foreground">Grado de satisfacción</p>
              <p className="mt-[0.45cqi] text-[2.45cqi] font-semibold tabular-nums">
                {decimal(average)} <span className="text-[1.35cqi] font-normal">/ 5,00</span>
              </p>
              <p className="mt-[0.3cqi] text-[1.05cqi] text-muted-foreground">
                {total.toLocaleString("es-ES")} encuestas recibidas
              </p>
            </div>
          </div>
        </section>

        <section className="row-span-2 min-h-0 overflow-hidden rounded-[1cqi] border border-border bg-card px-[1.1cqi] py-[1cqi]" aria-label={`Resumen ${currentLabel}`}>
          <h3 className="border-b-2 border-border pb-[0.6cqi] text-center font-mono text-[1.3cqi] font-semibold">
            Resumen {currentLabel}
          </h3>
          <table className="mt-[0.35cqi] w-full table-fixed border-collapse font-mono text-[1.05cqi] tabular-nums">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="px-[0.25cqi] py-[0.45cqi] text-left font-normal">Promedio</th>
                <th className="px-[0.25cqi] py-[0.45cqi] text-center font-normal">Cantidad</th>
                <th className="px-[0.25cqi] py-[0.45cqi] text-center font-normal">Porcentaje</th>
              </tr>
            </thead>
            <tbody>
              {distribution.map(row => (
                <tr key={row.score} className="border-b border-border/60">
                  <th scope="row" className="px-[0.25cqi] py-[0.45cqi] text-left font-normal">{row.score}</th>
                  <td className="px-[0.25cqi] py-[0.45cqi] text-center">{row.responses.toLocaleString("es-ES")}</td>
                  <td className="px-[0.25cqi] py-[0.45cqi] text-center">{total > 0 ? percent(row.responses / total) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="col-span-2 min-h-0" aria-label="Satisfacción media por mes">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trend} margin={{ top: 24, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="mes" tickLine={false} stroke="var(--border)" tick={{ fill: "var(--muted-foreground)", fontSize: "0.9cqi" }} />
              <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tickLine={false} stroke="var(--border)" tick={{ fill: "var(--muted-foreground)", fontSize: "0.9cqi" }} width={28} />
              <Bar dataKey="satisfaction" name="Satisfacción" fill="var(--informe-serie-1)" radius={[2, 2, 0, 0]}>
                <LabelList dataKey="satisfaction" position="top" formatter={(value: number) => decimal(value)} className="fill-foreground text-[.8cqi]" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </section>
      </div>
    </PageShell>
  );
}
