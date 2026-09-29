import CategoryBarChart, {
  type CategorySeries,
} from "@/components/deck/CategoryBarChart";
import KpiRow from "@/components/deck/KpiRow";
import RowFilterPanel from "@/components/deck/RowFilterPanel";
import ValueGrid from "@/components/deck/EditorValueGrid";
import WeekRangeSelector from "@/components/deck/WeekRangeSelector";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import {
  defaultWeekSelection,
  resolveWeekSelection,
} from "@shared/deck/core";
import { coverageEnd, monthLabel } from "../aggregate";
import { correctSeries, figureCell, gridRow, withOverride } from "../overrides";
import { componentSeriesColor } from "../palette";
import {
  RENOVE_AMBITOS,
  renoveInMonth,
  renoveInWeek,
  renovePendientesUsuario,
  renoveReportedRows,
  renoveTotals,
  renoveWeekLabel,
  renoveWeekNumber,
  renoveWeekSeries,
  renoveWindow,
} from "../renove";
import PageShell, { type InformaticaPageProps } from "./PageShell";

interface RenoveSemanalPageProps extends InformaticaPageProps {
  dataset: InformaticaDataset;
}

const SERIES: CategorySeries[] = RENOVE_AMBITOS.map((ambito, index) => ({
  key: ambito,
  label: ambito,
  color: componentSeriesColor(index, RENOVE_AMBITOS.length),
}));

/**
 * `2.7 Renove`: equipment taken out of the renewal queue, week by week.
 *
 * The week is resolved by date rather than by the highest `Semana`, as
 * everywhere else in the module: the section opens in December and every week
 * number occurs twice. The bars run from the first week with data to the
 * reported one, which is what the reference chart plots — no trailing window,
 * because the campaign is read as a whole.
 */
export default function RenoveSemanalPage({
  page,
  editing,
  onChange,
  dataset,
}: RenoveSemanalPageProps) {
  const rows = renoveReportedRows(dataset.renove ?? []);
  const window = renoveWindow(rows, coverageEnd(dataset));
  const week = window === null ? null : renoveWeekLabel(window.start);
  const weekNumber = window === null ? null : renoveWeekNumber(window.start);
  const month = window === null ? null : window.start.slice(0, 7).replace("-", "/");

  const weekTotals = renoveTotals(renoveInWeek(rows, window));
  const monthTotals = renoveTotals(renoveInMonth(rows, month));
  const allData = renoveWeekSeries(rows, window);
  const columnIds = allData.map((point, index) => {
    const label = String(point.semana);
    const earlier = allData
      .slice(0, index)
      .filter(item => item.semana === point.semana).length;

    return earlier === 0 ? label : `${label}#${earlier + 1}`;
  });
  const correctedSeries = RENOVE_AMBITOS.map((ambito, index) =>
    correctSeries(
      page,
      ambito,
      ambito,
      columnIds,
      allData.map(point => Number(point[ambito] ?? 0)),
      componentSeriesColor(index, RENOVE_AMBITOS.length)
    )
  );
  const correctedData = allData.map((point, index) => {
    const next = { ...point };

    RENOVE_AMBITOS.forEach((ambito, ambitoIndex) => {
      next[ambito] = correctedSeries[ambitoIndex]?.drawn[index] ?? 0;
    });

    return next;
  });
  const reported = correctedData.at(-1);
  const reportedTotal = RENOVE_AMBITOS.reduce(
    (sum, ambito) => sum + Number(reported?.[ambito] ?? 0),
    0
  );
  const monthCell = figureCell(
    page,
    "indicador",
    `mes:${month ?? "sin-mes"}`,
    monthTotals.total
  );
  const pendingCell = figureCell(
    page,
    "indicador",
    "pdte-usuario",
    renovePendientesUsuario(rows)
  );
  const weekSlots = allData.map((_, index) => index + 1);
  const weekSelection =
    page.weekSelection ?? defaultWeekSelection(weekSlots.at(-1) ?? 1);
  const visibleSlots = new Set(resolveWeekSelection(weekSelection, weekSlots));
  const data = correctedData.filter((_, index) => visibleSlots.has(index + 1));
  const hiddenRows = page.hiddenRows ?? [];
  const series = SERIES.filter(entry => !hiddenRows.includes(entry.label)).map(
    (entry, index, list) => ({
      ...entry,
      color: componentSeriesColor(index, list.length),
    })
  );
  const colorOf = (ambito: string) =>
    series.find(entry => entry.label === ambito)?.color;

  return (
    <PageShell
      page={page}
      editing={editing}
      onChange={onChange}
      editor={
        editing && (
          <>
            {weekSlots.length > 0 && (
              <WeekRangeSelector
                selection={weekSelection}
                available={weekSlots}
                format={week => String(allData[week - 1]?.semana ?? `S${week}`)}
                onChange={weekSelection => onChange({ weekSelection })}
              />
            )}

            <RowFilterPanel
              labels={[...RENOVE_AMBITOS]}
              hiddenRows={hiddenRows}
              scope={page.id}
              defaultHidden={[]}
              onChange={hiddenRows => onChange({ hiddenRows })}
            />

            <ValueGrid
              columns={columnIds}
              rows={correctedSeries.map(series => series.row)}
              onChange={(key, value) => onChange(withOverride(page, key, value))}
            />
            <ValueGrid
              columns={["Renovados del mes", "Pdte Usuario"]}
              rows={[gridRow("Indicadores", [monthCell, pendingCell])]}
              onChange={(key, value) => onChange(withOverride(page, key, value))}
            />
          </>
        )
      }
    >
      <KpiRow
        items={[
          {
            label:
              weekNumber === null
                ? "Renovados"
                : `Renovados semana ${weekNumber}`,
            value: String(reportedTotal),
          },
          {
            label: "Holding",
            value: String(reported?.Holding ?? weekTotals.porAmbito.Holding),
            accent: colorOf("Holding"),
          },
          {
            label: "España",
            value: String(reported?.["España"] ?? weekTotals.porAmbito["España"]),
            accent: colorOf("España"),
          },
          {
            label: `Renovados ${month === null ? "" : monthLabel(month)}`.trim(),
            value: String(monthCell.drawn),
          },
          {
            label: "Pdte Usuario",
            value: String(pendingCell.drawn),
          },
        ]}
      />

      <div className="flex min-h-0 flex-1 flex-col">
        {/* Every week is drawn, tilted. Left to itself the axis drops the ticks
            that overlap and prints one week in two, so half the columns lose
            the only thing that identifies them. */}
        {series.length > 0 && (
          <CategoryBarChart
            categoryKey="semana"
            series={series}
            data={data}
            angledCategories
          />
        )}
      </div>
    </PageShell>
  );
}
