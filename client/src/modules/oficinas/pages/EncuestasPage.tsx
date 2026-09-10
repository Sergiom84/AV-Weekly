import { KPI_CARD_HOVER } from "@/components/deck/KpiRow";
import MonthRangeSelector from "@/components/deck/MonthRangeSelector";
import ValueGrid from "@/components/deck/EditorValueGrid";
import {
  defaultMonthWindow,
  resolveMonthSelection,
} from "@shared/deck/core";
import { surveyAverage } from "@shared/modules/oficinas/derived";
import { decimal, monthLabel, oficinasColor, sharePercent } from "../aggregate";
import { surveyYtdSeries } from "../surveyYtd";
import { cellKey, isOverridden, overriddenValue, withOverride } from "../overrides";
import PageShell, { type OficinasDataPageProps } from "./PageShell";
import ScoreBarChart from "./ScoreBarChart";

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
 * The layout is the one the Informática survey slide publishes, adopted here at
 * the team's request: gauge, current-month card and 1-to-5 table above the
 * monthly score bars.
 *
 * One reading differs from Informática and the heading says so. There, the
 * table is the distribution of the month on show, because that source carries a
 * score per answer per month. Here sheets 20 to 22 hold a single distribution
 * accumulated over the whole series, and sheet 19 carries only a monthly
 * average, so no monthly distribution exists to draw. The table is therefore
 * labelled "Resumen acumulado" rather than with the month, which is the only
 * honest label for what it sums.
 *
 * The distribution stays editable below in edit mode: the table is published
 * from it, so dropping the grid would leave figures with no way to correct
 * them, and the table reads the overrides rather than the raw import.
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

  const ytd = surveyYtdSeries(responses);

  // Same trailing window as the Informática slide. The series starts in August
  // 2024 and grows a month at a time, so an unbounded axis would keep shrinking
  // the bars until the labels stopped fitting.
  const monthSelection = page.monthSelection ?? defaultMonthWindow(15);
  const availableMonths = months.map(month => month.month);
  const shownMonths = new Set(
    resolveMonthSelection(monthSelection, availableMonths)
  );
  const scoreData = months
    .filter(month => shownMonths.has(month.month))
    .map(month => ({
      mes: monthLabel(month.month),
      valoracion: month.global,
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

  const latestYear = ytd.latestYear ?? "";
  const latestYtd = ytd.latestYtd;

  // The table sums the edited cells, not the import, so a correction typed in
  // the grid moves the published percentages with it.
  const globalDistribution = distributionCells[0].map((cell, index) => ({
    score: index + 1,
    responses: cell.value ?? 0,
  }));
  const globalTotal = globalDistribution.reduce(
    (sum, row) => sum + row.responses,
    0
  );

  // The month the gauge and the big figure report on: the last one on show that
  // actually carries a score. A month can arrive with responses and no average.
  const current =
    months
      .filter(month => shownMonths.has(month.month) && month.global !== null)
      .at(-1) ?? null;
  const currentLabel = current ? monthLabel(current.month) : "Sin periodo";
  const currentResponses =
    current === null
      ? null
      : (responses.find(entry => entry.month === current.month)?.value ??
        current.encuestas);
  const gauge =
    current?.global == null
      ? 0
      : Math.max(0, Math.min(100, current.global * 20));

  return (
    <PageShell
      page={page}
      editing={editing}
      onChange={onChange}
      editor={
        editing && (
          <>
            <MonthRangeSelector
              selection={monthSelection}
              available={availableMonths}
              format={monthLabel}
              onChange={next => onChange({ monthSelection: next })}
            />

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
        )
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-[1.1cqi]">
        <div className="flex shrink-0 items-start gap-[1.1cqi]">
          <section
            className="shrink-0 overflow-hidden rounded-[1cqi] border border-border bg-card"
            aria-label="Valoración global del mes en curso"
          >
            <div className="grid place-items-center px-[1.3cqi] py-[1cqi]">
              <div
                className="grid h-[9.2cqi] w-[9.2cqi] place-items-center rounded-full p-[0.65cqi]"
                style={{
                  background: `conic-gradient(var(--informe-serie-3) ${gauge}%, var(--muted) 0)`,
                }}
                aria-label={`Valoración ${
                  current?.global == null
                    ? "sin respuestas"
                    : `${decimal(current.global)} sobre 5`
                }`}
              >
                <div className="grid h-full w-full place-items-center rounded-full bg-card text-center font-mono">
                  <span className="text-[2cqi] font-semibold tabular-nums">
                    {decimal(current?.global ?? null)}
                  </span>
                  <span className="text-[.85cqi] text-muted-foreground">/ 5,00</span>
                </div>
              </div>
            </div>
          </section>

          <section className="flex min-h-[11.2cqi] min-w-0 flex-1 flex-col justify-center overflow-hidden rounded-[1cqi] border border-border bg-card px-[1.4cqi] py-[1cqi]">
            <p className="font-mono text-[1.15cqi] uppercase tracking-wide text-muted-foreground">
              Mes en curso: {currentLabel}
            </p>
            <p className="mt-[0.55cqi] font-mono text-[1.25cqi] text-muted-foreground">
              Valoración global
            </p>
            <p className="mt-[0.2cqi] font-mono text-[2.45cqi] font-semibold tabular-nums">
              {decimal(current?.global ?? null)}{" "}
              <span className="text-[1.35cqi] font-normal">/ 5,00</span>
            </p>
            <p className="mt-[0.2cqi] font-mono text-[1.05cqi] text-muted-foreground">
              {currentResponses === null
                ? "Sin encuestas recibidas"
                : `${currentResponses.toLocaleString("es-ES")} encuestas recibidas`}
            </p>
            <dl className="mt-[0.6cqi] flex flex-wrap items-baseline gap-x-[1.6cqi] gap-y-[0.25cqi] border-t border-border pt-[0.5cqi] font-mono text-[1.05cqi] text-muted-foreground">
              {SCORES.filter(score => score.field !== "global").map(score => (
                <div key={score.field} className="flex items-baseline gap-[0.4cqi]">
                  <dt>{score.label}</dt>
                  <dd className="font-semibold tabular-nums text-foreground">
                    {decimal(surveyAverage(dataset, score.field), 2)}
                  </dd>
                </div>
              ))}
              <div className="flex items-baseline gap-[0.4cqi]">
                <dt>
                  {latestYear === "" ? "Acumulado anual" : `Acumulado ${latestYear}`}
                </dt>
                <dd className="font-semibold tabular-nums text-foreground">
                  {latestYtd === null ? "—" : latestYtd.toLocaleString("es-ES")}
                </dd>
              </div>
            </dl>
          </section>

          <section
            className={`w-[28cqi] shrink-0 self-start overflow-hidden rounded-[1cqi] border border-border bg-card px-[1.1cqi] py-[0.85cqi] ${KPI_CARD_HOVER}`}
            aria-label="Resumen acumulado de la valoración global"
          >
            <h3 className="border-b-2 border-border pb-[0.45cqi] text-center font-mono text-[1.2cqi] font-semibold">
              Resumen acumulado
            </h3>
            <table className="mt-[0.2cqi] w-full table-fixed border-collapse font-mono text-[1.05cqi] tabular-nums">
              <thead className="border-b border-border text-muted-foreground">
                <tr>
                  <th className="px-[0.25cqi] py-[0.35cqi] text-left font-normal">
                    Valoración
                  </th>
                  <th className="px-[0.25cqi] py-[0.35cqi] text-center font-normal">
                    Cantidad
                  </th>
                  <th className="px-[0.25cqi] py-[0.35cqi] text-center font-normal">
                    Porcentaje
                  </th>
                </tr>
              </thead>
              <tbody>
                {globalDistribution.map(row => (
                  <tr key={row.score} className="border-b border-border/60 last:border-b-0">
                    <th
                      scope="row"
                      className="px-[0.25cqi] py-[0.32cqi] text-left font-normal"
                    >
                      {row.score}
                    </th>
                    <td className="px-[0.25cqi] py-[0.32cqi] text-center">
                      {row.responses.toLocaleString("es-ES")}
                    </td>
                    <td className="px-[0.25cqi] py-[0.32cqi] text-center">
                      {globalTotal > 0 ? sharePercent(row.responses / globalTotal) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <p className="shrink-0 pb-[0.4cqi] font-mono text-[1.15cqi] uppercase tracking-wide text-muted-foreground">
            Valoración global por mes
          </p>
          <div className="min-h-0 flex-1">
            <ScoreBarChart data={scoreData} />
          </div>
        </div>
      </div>
    </PageShell>
  );
}
