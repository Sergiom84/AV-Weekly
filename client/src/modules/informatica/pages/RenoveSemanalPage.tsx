import CategoryBarChart, {
  type CategorySeries,
} from "@/components/deck/CategoryBarChart";
import KpiRow from "@/components/deck/KpiRow";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import { coverageEnd, monthLabel, seriesColor } from "../aggregate";
import {
  RENOVE_AMBITOS,
  renoveInMonth,
  renoveInWeek,
  renovePendientesUsuario,
  renoveTotals,
  renoveWeekLabel,
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
  color: seriesColor(index),
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
  const rows = dataset.renove ?? [];
  const window = renoveWindow(rows, coverageEnd(dataset));
  const week = window === null ? null : renoveWeekLabel(window.start);
  const month = window === null ? null : window.start.slice(0, 7).replace("-", "/");

  const weekTotals = renoveTotals(renoveInWeek(rows, window));
  const monthTotals = renoveTotals(renoveInMonth(rows, month));
  const data = renoveWeekSeries(rows, window);

  return (
    <PageShell page={page} editing={editing} onChange={onChange}>
      <KpiRow
        items={[
          {
            label: `Renovados ${week ?? ""}`.trim(),
            value: String(weekTotals.total),
          },
          {
            label: "España / Holding",
            value: `${weekTotals.porAmbito["España"]} / ${weekTotals.porAmbito.Holding}`,
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
        <CategoryBarChart
          categoryKey="semana"
          series={SERIES}
          data={data}
          stacked
        />
      </div>
    </PageShell>
  );
}
