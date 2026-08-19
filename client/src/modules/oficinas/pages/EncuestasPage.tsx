import CategoryBarChart, {
  type CategorySeries,
} from "@/components/deck/CategoryBarChart";
import KpiRow from "@/components/deck/KpiRow";
import SeriesLineChart, {
  type LineSeries,
} from "@/components/deck/SeriesLineChart";
import ValueGrid from "@/components/deck/ValueGrid";
import {
  distributionTotal,
  surveyAverage,
} from "@shared/modules/oficinas/derived";
import { decimal, monthLabel, oficinasColor, percent } from "../aggregate";
import { cellKey, isOverridden, overriddenValue, withOverride } from "../overrides";
import PageShell, { type OficinasDataPageProps } from "./PageShell";

/** Row keys of the monthly series, and of the three distributions. */
const RESPONSES_ROW = "encuestas";

const SCORES: {
  field: "global" | "apertura" | "resolucion";
  label: string;
}[] = [
  { field: "global", label: "Valoración global" },
  { field: "apertura", label: "Apertura" },
  { field: "resolucion", label: "Resolución" },
];

/**
 * `1.4 Valoración de las encuestas`.
 *
 * The one section of the template that is not weekly: sheets 18 to 22 are keyed
 * by month, so the page is monthly and says so on its axis rather than folding
 * the months into week numbers, which would be a fabricated conversion.
 *
 * Two readings side by side. On the left the response count per month, which is
 * the only survey figure with any range — the scores sit at five almost every
 * month and a line of them is a flat rule. On the right the cumulative 1-to-5
 * distribution of the three scores, which is where that flatness becomes a fact
 * worth printing: it is drawn natively instead of pasted as the image the
 * current report carries.
 *
 * The headline averages are weighted by responses, not means of the monthly
 * means: a month with four answers must not weigh as one with a hundred.
 */
export default function EncuestasPage({
  page,
  editing,
  onChange,
  dataset,
}: OficinasDataPageProps) {
  const months = dataset.encuestas?.porMes ?? [];
  const distribucion = dataset.encuestas?.distribucion;

  const responses = months.map(month => {
    const key = cellKey(RESPONSES_ROW, month.month);

    return {
      key,
      month: month.month,
      value: overriddenValue(page, key, month.encuestas),
      overridden: isOverridden(page, key),
    };
  });

  const series: LineSeries[] = [
    { key: "encuestas", label: "Encuestas recibidas", color: oficinasColor(0) },
  ];

  const data = responses.map(entry => ({
    mes: monthLabel(entry.month),
    encuestas: entry.value,
  }));

  const scoreSeries: CategorySeries[] = SCORES.map((score, index) => ({
    key: score.field,
    label: score.label,
    color: oficinasColor(index),
  }));

  const distributionCells = SCORES.map(score =>
    [1, 2, 3, 4, 5].map(value => {
      const key = cellKey(score.field, String(value));

      return {
        key,
        value: overriddenValue(
          page,
          key,
          distribucion?.[score.field]?.[value - 1] ?? null
        ),
        overridden: isOverridden(page, key),
      };
    })
  );

  const distributionData = [1, 2, 3, 4, 5].map((value, index) => {
    const row: Record<string, number | string> = { nota: String(value) };

    SCORES.forEach((score, position) => {
      row[score.field] = distributionCells[position][index].value ?? 0;
    });

    return row;
  });

  const totalResponses = responses.reduce(
    (sum, entry) => sum + (entry.value ?? 0),
    0
  );
  const globalTotal = distributionTotal(distribucion?.global);
  const topShare =
    globalTotal === 0 ? 0 : (distribucion?.global?.[4] ?? 0) / globalTotal;

  return (
    <PageShell page={page} editing={editing} onChange={onChange}>
      <KpiRow
        items={[
          { label: "Encuestas", value: totalResponses.toLocaleString("es-ES") },
          ...SCORES.map(score => ({
            label: score.label,
            value: decimal(surveyAverage(dataset, score.field), 2),
          })),
          { label: "Valoradas con 5", value: percent(topShare) },
        ]}
      />

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-[1.5cqi]">
        <div className="flex min-h-0 flex-col">
          <p className="shrink-0 pb-[0.4cqi] font-mono text-[1.15cqi] uppercase tracking-wide text-muted-foreground">
            Encuestas por mes
          </p>
          <SeriesLineChart categoryKey="mes" series={series} data={data} />
        </div>

        <div className="flex min-h-0 flex-col">
          <p className="shrink-0 pb-[0.4cqi] font-mono text-[1.15cqi] uppercase tracking-wide text-muted-foreground">
            Distribución de la valoración, 1 a 5
          </p>
          <CategoryBarChart
            categoryKey="nota"
            series={scoreSeries}
            data={distributionData}
          />
        </div>
      </div>

      {editing && (
        <>
          <ValueGrid
            columns={responses.map(entry => monthLabel(entry.month))}
            rows={[
              {
                label: "Encuestas",
                color: oficinasColor(0),
                cells: responses.map(entry => ({
                  key: entry.key,
                  value: entry.value,
                  overridden: entry.overridden,
                })),
              },
            ]}
            onChange={(key, value) => onChange(withOverride(page, key, value))}
          />

          <ValueGrid
            columns={["1", "2", "3", "4", "5"]}
            rows={SCORES.map((score, index) => ({
              label: score.label,
              color: oficinasColor(index),
              cells: distributionCells[index],
            }))}
            onChange={(key, value) => onChange(withOverride(page, key, value))}
          />
        </>
      )}
    </PageShell>
  );
}
