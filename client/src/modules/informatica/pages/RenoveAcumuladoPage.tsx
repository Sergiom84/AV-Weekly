import CategoryBarChart, {
  type CategorySeries,
} from "@/components/deck/CategoryBarChart";
import KpiRow from "@/components/deck/KpiRow";
import RowFilterPanel from "@/components/deck/RowFilterPanel";
import ValueGrid from "@/components/deck/EditorValueGrid";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import { correctSeries, figureCell, gridRow, withOverride } from "../overrides";
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
  const imported = renoveMonthSeries(rows);
  const columnIds = imported.map(point => String(point.mes));
  const correctedSeries = RENOVE_AMBITOS.map((ambito, index) =>
    correctSeries(
      page,
      ambito,
      ambito,
      columnIds,
      imported.map(point => Number(point[ambito] ?? 0)),
      componentSeriesColor(index, RENOVE_AMBITOS.length)
    )
  );
  const data = imported.map((point, index) => {
    const next = { ...point };

    RENOVE_AMBITOS.forEach((ambito, ambitoIndex) => {
      next[ambito] = correctedSeries[ambitoIndex]?.drawn[index] ?? 0;
    });

    return next;
  });
  const totalCell = figureCell(page, "indicador", "acumulado", totals.total);
  const dismissedCell = figureCell(
    page,
    "indicador",
    "desestimados",
    totals.desestimados
  );
  const holdingCell = figureCell(
    page,
    "indicador",
    "holding",
    totals.porAmbito.Holding
  );
  const spainCell = figureCell(
    page,
    "indicador",
    "espana",
    totals.porAmbito["España"]
  );
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
  const charted = data.reduce((sum, point) => sum + Number(point["España"] ?? 0), 0);

  return (
    <PageShell
      page={page}
      editing={editing}
      onChange={onChange}
      editor={
        editing && (
          <>
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
              columns={["Acumulado", "Desestimados", "Holding", "España"]}
              rows={[
                gridRow("Indicadores", [
                  totalCell,
                  dismissedCell,
                  holdingCell,
                  spainCell,
                ]),
              ]}
              onChange={(key, value) => onChange(withOverride(page, key, value))}
            />
          </>
        )
      }
    >
      <KpiRow
        items={[
          { label: "Renovado Acumulado", value: String(totalCell.drawn) },
          { label: "Desestimados", value: String(dismissedCell.drawn) },
          {
            label: "Holding",
            value: String(holdingCell.drawn),
            accent: colorOf("Holding"),
          },
          {
            label: "España",
            value: String(spainCell.drawn),
            accent: colorOf("España"),
          },
          ...(charted < totalCell.drawn
            ? [{ label: "Sin fecha", value: String(totalCell.drawn - charted) }]
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
