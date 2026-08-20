import CategoryBarChart, {
  type CategorySeries,
} from "@/components/deck/CategoryBarChart";
import KpiRow from "@/components/deck/KpiRow";
import SeriesLineChart, {
  type LineSeries,
} from "@/components/deck/SeriesLineChart";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import {
  decimal,
  monthLabel,
  percent,
  reportMonth,
  seriesColor,
  uniqueSorted,
} from "../aggregate";
import PageShell, { type InformaticaPageProps } from "./PageShell";

interface EncuestasPageProps extends InformaticaPageProps {
  dataset: InformaticaDataset;
}

/** The 1-to-5 scale, as the axis of the distribution. */
const SCORES = [1, 2, 3, 4, 5];

/**
 * `2.1.5 Encuestas Incidencias SSCC`: the reported month's score distribution
 * next to the response count month by month.
 *
 * The headline average is weighted by responses — the sum of score times
 * answers over the answers — not a mean of the five scores, which would let one
 * stray "1" weigh as much as a hundred fives and turn a 4,86 into a 3.
 *
 * The distribution is the reported month alone while the line covers every
 * month: the scores sit at five nearly always, so their line is a flat rule,
 * and what changes month to month is how many people answered.
 */
export default function EncuestasPage({
  page,
  editing,
  onChange,
  dataset,
}: EncuestasPageProps) {
  const rows = dataset.encuestas ?? [];
  const months = uniqueSorted(rows.map((row) => row.mes));
  const month = reportMonth(dataset, rows, (row) => row.mes);
  const current = rows.filter((row) => row.mes === month);

  const responsesFor = (score: number) =>
    current
      .filter((row) => Number(row.valoracion) === score)
      .reduce((sum, row) => sum + row.respuestas, 0);

  const distribution = SCORES.map((score) => ({
    score,
    respuestas: responsesFor(score),
  }));

  const answers = distribution.reduce((sum, entry) => sum + entry.respuestas, 0);
  const weighted = distribution.reduce(
    (sum, entry) => sum + entry.score * entry.respuestas,
    0
  );
  const average = answers > 0 ? weighted / answers : null;
  const topShare = answers > 0 ? responsesFor(5) / answers : 0;

  const monthlySeries: LineSeries[] = [
    { key: "respuestas", label: "Respuestas recibidas", color: seriesColor(0) },
  ];
  const monthlyData = months.map((target) => ({
    mes: monthLabel(target),
    respuestas: rows
      .filter((row) => row.mes === target)
      .reduce((sum, row) => sum + row.respuestas, 0),
  }));

  const distributionSeries: CategorySeries[] = [
    { key: "respuestas", label: "Respuestas", color: seriesColor(0) },
  ];
  const distributionData = distribution.map((entry) => ({
    nota: String(entry.score),
    respuestas: entry.respuestas,
  }));

  const suffix = month ? ` ${monthLabel(month)}` : "";

  return (
    <PageShell page={page} editing={editing} onChange={onChange}>
      <KpiRow
        items={[
          {
            label: `Respuestas${suffix}`,
            value: answers.toLocaleString("es-ES"),
          },
          { label: "Nota media", value: decimal(average) },
          { label: "Valoradas con 5", value: percent(topShare) },
        ]}
      />

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-[1.5cqi]">
        <div className="flex min-h-0 flex-col">
          <p className="shrink-0 pb-[0.4cqi] font-mono text-[1.15cqi] uppercase tracking-wide text-muted-foreground">
            Respuestas por mes
          </p>
          <SeriesLineChart
            categoryKey="mes"
            series={monthlySeries}
            data={monthlyData}
          />
        </div>

        <div className="flex min-h-0 flex-col">
          <p className="shrink-0 pb-[0.4cqi] font-mono text-[1.15cqi] uppercase tracking-wide text-muted-foreground">
            Distribución de la valoración, 1 a 5{suffix}
          </p>
          <CategoryBarChart
            categoryKey="nota"
            series={distributionSeries}
            data={distributionData}
          />
        </div>
      </div>
    </PageShell>
  );
}
