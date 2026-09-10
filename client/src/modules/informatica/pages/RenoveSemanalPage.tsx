import CategoryBarChart, {
  type CategorySeries,
} from "@/components/deck/CategoryBarChart";
import KpiRow from "@/components/deck/KpiRow";
import RowFilterPanel from "@/components/deck/RowFilterPanel";
import WeekRangeSelector from "@/components/deck/WeekRangeSelector";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import {
  defaultWeekSelection,
  resolveWeekSelection,
} from "@shared/deck/core";
import { coverageEnd, monthLabel } from "../aggregate";
import { renoveAmbitoColor } from "../palette";
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

const SERIES: CategorySeries[] = RENOVE_AMBITOS.map(ambito => ({
  key: ambito,
  label: ambito,
  color: renoveAmbitoColor(ambito),
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
  const weekSlots = allData.map((_, index) => index + 1);
  const weekSelection =
    page.weekSelection ?? defaultWeekSelection(weekSlots.at(-1) ?? 1);
  const visibleSlots = new Set(resolveWeekSelection(weekSelection, weekSlots));
  const data = allData.filter((_, index) => visibleSlots.has(index + 1));
  const hiddenRows = page.hiddenRows ?? [];
  const series = SERIES.filter(entry => !hiddenRows.includes(entry.label));

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
            value: String(weekTotals.total),
          },
          {
            label: "Holding",
            value: String(weekTotals.porAmbito.Holding),
            accent: renoveAmbitoColor("Holding"),
          },
          {
            label: "España",
            value: String(weekTotals.porAmbito["España"]),
            accent: renoveAmbitoColor("España"),
          },
          {
            label: `Renovados ${month === null ? "" : monthLabel(month)}`.trim(),
            value: String(monthTotals.total),
          },
          {
            label: "Pdte Usuario",
            value: String(renovePendientesUsuario(rows)),
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
            stacked
            angledCategories
          />
        )}
      </div>
    </PageShell>
  );
}
