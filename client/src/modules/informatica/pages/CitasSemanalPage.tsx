import CategoryBarChart, {
  type CategorySeries,
} from "@/components/deck/CategoryBarChart";
import KpiRow from "@/components/deck/KpiRow";
import MatrixTable from "@/components/deck/MatrixTable";
import ValueGrid from "@/components/deck/EditorValueGrid";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import {
  coverageEnd,
  inWeek,
  lastClosedWeek,
  latestOf,
  monthLabel,
  monthsEndingAt,
  orderColumns,
  pivot,
  reportedWeek,
  uniqueSorted,
} from "../aggregate";
import { correctSeries, withOverride } from "../overrides";
import { componentSeriesColor } from "../palette";
import { reportedSmartTechRows, siteLabels, smartTechSite } from "../sources";
import PageShell, { type InformaticaPageProps } from "./PageShell";

interface CitasSemanalPageProps extends InformaticaPageProps {
  dataset: InformaticaDataset;
}

/** Column order of the report: booked first, walk-up second. */
const TYPES = ["Con Cita", "Sin Cita"];

/** Months of the trailing window, the same one the rest of the deck uses. */
const WINDOW = 14;

/**
 * `2.3.1 Volumetría de Citas SmartTech Semanal`: booked versus walk-up
 * attention per SmartTech point during the reported week.
 *
 * The week is resolved by date, not by picking the highest `Semana`. The sheet
 * spans more than a year, so every week number occurs twice and the highest is
 * week 52 — the previous Christmas. Appointments are also booked ahead, past
 * the day the extract was cut, which is why the window stops at the coverage
 * end instead of at the last row.
 */
export default function CitasSemanalPage({
  page,
  editing,
  onChange,
  dataset,
}: CitasSemanalPageProps) {
  const rows = reportedSmartTechRows(dataset.citas ?? []);
  const cutoff = coverageEnd(dataset);
  const window =
    reportedWeek(cutoff) ?? lastClosedWeek(rows, row => row.fecha, cutoff);
  const current = rows.filter(row => inWeek(row.fecha, window));
  const week = current[0]?.semana ?? null;

  const columns = orderColumns(
    uniqueSorted(current.map(row => row.tipo)),
    TYPES
  );
  // Sites come from the master, so the table keeps its nineteen rows whether or
  // not a point saw anyone this week, and each one is named the way the report
  // names it. A point the extract reports and the master does not map is kept
  // and pushed to the end: dropping it would hide real appointments, and
  // merging it into a mapped site would misattribute them.
  const { labelOf, order: rowOrder } = siteLabels(
    dataset.edificios ?? [],
    row => row.aliasSmartTech,
    current.map(row => row.edificio),
    { allSites: true, clean: smartTechSite }
  );
  const matrix = pivot(
    current,
    row => labelOf(row.edificio),
    row => row.tipo,
    row => row.citas,
    { columns, rowOrder }
  );
  const emptySite = { label: "", values: columns.map(() => 0) };
  const weekId = window?.start ?? "semana";
  const siteRows = rowOrder.map(site => {
    const imported =
      matrix.rows.find(row => row.label === site) ?? { ...emptySite, label: site };
    const series = correctSeries(
      page,
      `semana:${site}`,
      site,
      columns.map(type => `${weekId}:${type}`),
      imported.values
    );

    return { label: site, values: series.drawn, grid: series.row };
  });

  const totalOf = (type: string) =>
    siteRows.reduce(
      (sum, row) => sum + (row.values[columns.indexOf(type)] ?? 0),
      0
    );

  const total = siteRows.reduce(
    (sum, row) => sum + row.values.reduce((cellSum, value) => cellSum + value, 0),
    0
  );

  // The trend covers whole months, including the one in flight, which is what
  // the reference plots and what the weekly table sits next to.
  const latestMonth = latestOf(rows, row => row.mes);
  const months = latestMonth === null ? [] : monthsEndingAt(latestMonth, WINDOW);
  const trendSeries: CategorySeries[] = columns.map((type, index) => ({
    key: type,
    label: type,
    color: componentSeriesColor(index, columns.length),
  }));
  const trendCorrected = columns.map((type, index) =>
    correctSeries(
      page,
      `mes:${type}`,
      type,
      months,
      months.map(month =>
        rows
          .filter(row => row.mes === month && row.tipo === type)
          .reduce((sum, row) => sum + row.citas, 0)
      ),
      componentSeriesColor(index, columns.length)
    )
  );
  const trend = months.map((month, index) => {
    const entry: Record<string, string | number> = {
      mes: monthLabel(month),
    };

    columns.forEach((type, typeIndex) => {
      entry[type] = trendCorrected[typeIndex]?.drawn[index] ?? 0;
    });

    return entry;
  });

  return (
    <PageShell
      page={page}
      editing={editing}
      onChange={onChange}
      editor={
        editing && (
          <>
            <ValueGrid
              columns={columns}
              rows={siteRows.map(row => row.grid)}
              onChange={(key, value) => onChange(withOverride(page, key, value))}
            />
            <ValueGrid
              columns={months.map(monthLabel)}
              rows={trendCorrected.map(series => series.row)}
              onChange={(key, value) => onChange(withOverride(page, key, value))}
            />
          </>
        )
      }
    >
      <KpiRow
        items={[
          ...columns.map((type, index) => ({
            label: type,
            value: String(totalOf(type)),
            accent: componentSeriesColor(index, columns.length),
          })),
          {
            label: week === null ? "Total" : `Semana ${week}`,
            value: String(total),
          },
        ]}
      />

      <div className="grid min-h-0 flex-1 grid-cols-[34%_1fr] gap-[1.4cqi]">
        <div className="min-h-0 overflow-hidden">
          <MatrixTable
            rowHeader="SmartTech"
            columns={columns}
            rows={siteRows}
            // A site with no appointments this week reports a zero, not a gap:
            // every row of this table is counted, so an empty cell would read
            // as "not measured" for a point that was simply quiet.
            formatValue={value => String(value)}
            variant="report"
          />
        </div>
        <div className="flex min-h-0 flex-col">
          <CategoryBarChart
            categoryKey="mes"
            series={trendSeries}
            data={trend}
            fitGroupedValueLabels
            centerGroupedValueLabels
            allCategories
          />
        </div>
      </div>
    </PageShell>
  );
}
