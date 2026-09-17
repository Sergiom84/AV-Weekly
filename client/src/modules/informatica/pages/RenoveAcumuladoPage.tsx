import CategoryBarChart, {
  type CategorySeries,
} from "@/components/deck/CategoryBarChart";
import KpiRow from "@/components/deck/KpiRow";
import RowFilterPanel from "@/components/deck/RowFilterPanel";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import { componentSeriesColor } from "../palette";
import {
  RENOVE_AMBITOS,
  renoveMonthSeries,
  renoveReportedRows,
  renoveTotals,
} from "../renove";
import PageShell, { type InformaticaPageProps } from "./PageShell";

interface RenoveAcumuladoPageProps extends InformaticaPageProps {
  dataset: InformaticaDataset;
}

const SERIES: CategorySeries[] = RENOVE_AMBITOS.map((ambito, index) => ({
  key: ambito,
  label: ambito,
  color: componentSeriesColor(index, RENOVE_AMBITOS.length),
}));

/**
 * `2.7.1 Renove`: the campaign to date, month by month.
 *
 * The accumulated figure counts every unit that left the queue, renewed or
 * dismissed, so the dismissed ones are inside the total rather than added to
 * it. The monthly bars only carry the dated rows, and the source leaves the
 * date empty on part of them: the KPI strip is therefore larger than the sum
 * of the columns, which is the honest reading of an incomplete source.
 */
export default function RenoveAcumuladoPage({
  page,
  editing,
  onChange,
  dataset,
}: RenoveAcumuladoPageProps) {
  const rows = renoveReportedRows(dataset.renove ?? []);
  const totals = renoveTotals(rows);
  const data = renoveMonthSeries(rows);
  const hiddenRows = page.hiddenRows ?? [];
  const series = SERIES.filter(entry => !hiddenRows.includes(entry.label)).map(
    (entry, index, list) => ({
      ...entry,
      color: componentSeriesColor(index, list.length),
    })
  );
  const colorOf = (ambito: string) =>
    series.find(entry => entry.label === ambito)?.color;
  // Only the national scope adds up to the KPI: Holding is a subset of España
  // and its column is drawn beside it, not on top of it.
  const charted = data.reduce((sum, point) => sum + point["España"], 0);

  return (
    <PageShell
      page={page}
      editing={editing}
      onChange={onChange}
      editor={
        editing && (
          <RowFilterPanel
            labels={[...RENOVE_AMBITOS]}
            hiddenRows={hiddenRows}
            scope={page.id}
            defaultHidden={[]}
            onChange={hiddenRows => onChange({ hiddenRows })}
          />
        )
      }
    >
      <KpiRow
        items={[
          { label: "Renovado Acumulado", value: String(totals.total) },
          { label: "Desestimados", value: String(totals.desestimados) },
          {
            label: "Holding",
            value: String(totals.porAmbito.Holding),
            accent: colorOf("Holding"),
          },
          {
            label: "España",
            value: String(totals.porAmbito["España"]),
            accent: colorOf("España"),
          },
          ...(charted < totals.total
            ? [{ label: "Sin fecha", value: String(totals.total - charted) }]
            : []),
        ]}
      />

      <div className="flex min-h-0 flex-1 flex-col">
        {series.length > 0 && (
          <CategoryBarChart categoryKey="mes" series={series} data={data} />
        )}
      </div>
    </PageShell>
  );
}
