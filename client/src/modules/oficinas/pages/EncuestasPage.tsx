import KpiRow from "@/components/deck/KpiRow";
import MonthRangeSelector from "@/components/deck/MonthRangeSelector";
import ValueGrid from "@/components/deck/EditorValueGrid";
import {
  defaultMonthWindow,
  resolveMonthSelection,
} from "@shared/deck/core";
import {
  distributionTotal,
  surveyAverage,
} from "@shared/modules/oficinas/derived";
import { decimal, monthLabel, oficinasColor, percent } from "../aggregate";
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
 * The body is the monthly score, drawn as the Informática deck draws it, which
 * is what the Soporte Oficinas team asked for. It replaced two readings: the
 * accumulated response count, whose figure survives in the headline cards, and
 * the cumulative 1-to-5 distribution, which the team asked to take out.
 *
 * The distribution is still imported and still editable below in edit mode: the
 * "Valoradas con 5" card is computed from it, so dropping the grid would leave
 * a published figure with no way to correct it.
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
  const globalTotal = distributionTotal(distribucion?.global);
  const topShare =
    globalTotal === 0 ? 0 : (distribucion?.global?.[4] ?? 0) / globalTotal;

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
      <KpiRow
        compact
        items={[
          {
            label: latestYear === "" ? "Acumulado anual" : `Acumulado ${latestYear}`,
            value: latestYtd === null ? "—" : latestYtd.toLocaleString("es-ES"),
          },
          ...SCORES.map(score => ({
            label: score.label,
            value: decimal(surveyAverage(dataset, score.field), 2),
          })),
          { label: "Valoradas con 5", value: percent(topShare) },
        ]}
      />

      <div className="flex min-h-0 flex-1 flex-col">
        <p className="shrink-0 pb-[0.4cqi] font-mono text-[1.15cqi] uppercase tracking-wide text-muted-foreground">
          Valoración global por mes
        </p>
        <div className="min-h-0 flex-1">
          <ScoreBarChart data={scoreData} />
        </div>
      </div>

    </PageShell>
  );
}
