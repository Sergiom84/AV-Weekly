import CategoryBarChart, {
  type CategorySeries,
} from "@/components/deck/CategoryBarChart";
import KpiRow from "@/components/deck/KpiRow";
import MonthRangeSelector from "@/components/deck/MonthRangeSelector";
import RowFilterPanel from "@/components/deck/RowFilterPanel";
import ValueGrid from "@/components/deck/EditorValueGrid";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import {
  defaultMonthSelection,
  resolveMonthSelection,
} from "@shared/deck/core";
import {
  coverageEnd,
  lastClosedMonth,
  monthLabel,
} from "../aggregate";
import { correctSeries, withOverride } from "../overrides";
import { componentSeriesColor } from "../palette";
import { siteLabels } from "../sources";
import PageShell, { type InformaticaPageProps } from "./PageShell";

interface ImacsChartPageProps extends InformaticaPageProps {
  dataset: InformaticaDataset;
}

const SERIES: CategorySeries[] = [
  {
    key: "solicitudes",
    label: "Solicitudes",
    color: componentSeriesColor(0, 2),
  },
  {
    key: "intervenciones",
    label: "Intervenciones",
    color: componentSeriesColor(1, 2),
  },
];

/** Requests and interventions by building for the latest reported month. */
export default function ImacsChartPage({
  page,
  editing,
  onChange,
  dataset,
}: ImacsChartPageProps) {
  const rows = dataset.imacs ?? [];
  // `Fecha limite` can contain appointments through the unfinished current
  // month. When IMAC is the only uploaded source there is no operational
  // cutoff from incidents/requests, so today is the conservative fallback.
  const cutoff = coverageEnd(dataset) ?? new Date().toISOString().slice(0, 10);
  const availableMonths = rows
    .map(row => row.mes)
    .filter((month, index, all) => all.indexOf(month) === index)
    .sort();
  const monthSelection =
    page.monthSelection ??
    defaultMonthSelection(
      lastClosedMonth(availableMonths, cutoff) ??
        availableMonths[availableMonths.length - 1] ??
        ""
    );
  const selectedMonths = resolveMonthSelection(monthSelection, availableMonths);
  const month = selectedMonths[selectedMonths.length - 1] ?? null;
  const grouped = new Map<
    string,
    { solicitudes: number; intervenciones: number }
  >();

  // Same naming as the IMAC table, so the chart and the matrix next to it call
  // each site by the same name.
  const { labelOf } = siteLabels(
    dataset.edificios ?? [],
    row => row.aliasImacs,
    rows.map(row => row.ciudad)
  );

  for (const row of rows) {
    if (row.mes !== month) continue;

    const site = labelOf(row.ciudad);
    const current = grouped.get(site) ?? {
      solicitudes: 0,
      intervenciones: 0,
    };
    const metric = row.metrica.toLocaleLowerCase("es-ES");

    if (metric === "solicitudes") current.solicitudes += row.total;
    if (metric === "intervenciones") current.intervenciones += row.total;
    grouped.set(site, current);
  }

  const period = month ?? "sin-mes";
  const correctedSites = Array.from(grouped.entries())
    .map(([edificio, totals]) => {
      const series = correctSeries(
        page,
        edificio,
        edificio,
        [`${period}:solicitudes`, `${period}:intervenciones`],
        [totals.solicitudes, totals.intervenciones]
      );

      return {
        edificio,
        solicitudes: series.drawn[0] ?? 0,
        intervenciones: series.drawn[1] ?? 0,
        grid: series.row,
      };
    })
    .sort(
      (a, b) =>
        b.intervenciones - a.intervenciones ||
        b.solicitudes - a.solicitudes ||
        a.edificio.localeCompare(b.edificio, "es")
    );
  const allData = correctedSites;
  const hiddenRows = page.hiddenRows ?? [];
  const data = allData
    .filter(row => !hiddenRows.includes(row.edificio))
    .map(({ edificio, solicitudes, intervenciones }) => ({
      edificio,
      solicitudes,
      intervenciones,
    }));
  const totalRequests = data.reduce((sum, row) => sum + row.solicitudes, 0);
  const totalInterventions = data.reduce(
    (sum, row) => sum + row.intervenciones,
    0
  );

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
              onChange={monthSelection => onChange({ monthSelection })}
            />

            <RowFilterPanel
              labels={allData.map(row => row.edificio)}
              hiddenRows={hiddenRows}
              scope={page.id}
              defaultHidden={[]}
              onChange={hiddenRows => onChange({ hiddenRows })}
            />

            <ValueGrid
              columns={["Solicitudes", "Intervenciones"]}
              rows={allData.map(row => row.grid)}
              onChange={(key, value) => onChange(withOverride(page, key, value))}
            />
          </>
        )
      }
    >
      <KpiRow
        items={[
          { label: month ? monthLabel(month) : "Periodo", value: "IMACs" },
          {
            label: "Solicitudes",
            value: totalRequests.toLocaleString("es-ES"),
            accent: componentSeriesColor(0, 2),
          },
          {
            label: "Intervenciones",
            value: totalInterventions.toLocaleString("es-ES"),
            accent: componentSeriesColor(1, 2),
          },
        ]}
      />
      <div className="flex min-h-0 flex-1 flex-col">
        <CategoryBarChart
          categoryKey="edificio"
          series={SERIES}
          data={data}
          angledCategories
        />
      </div>
    </PageShell>
  );
}
