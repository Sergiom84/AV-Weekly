import KpiRow from "@/components/deck/KpiRow";
import ValueGrid from "@/components/deck/ValueGrid";
import WeekRangeSelector from "@/components/deck/WeekRangeSelector";
import WeeklyBarChart, {
  type WeeklySeries,
} from "@/components/deck/WeeklyBarChart";
import {
  defaultWeekSelection,
  resolveWeekSelection,
  type WeekSelection,
} from "@shared/deck/core";
import {
  latestYear,
  rankedRows,
  reportWeek,
  seriesWeeks,
} from "@shared/modules/oficinas/derived";
import {
  CURRENT_YEAR_COLOR,
  PREVIOUS_YEAR_COLOR,
  decimal,
  semanalMediaWeeks,
  weekLabel,
} from "../aggregate";
import { imacSeries } from "../imacSeries";
import { withOverride } from "../overrides";
import { semanalLayoutRules } from "../semanalLayout";
import PageShell, { type OficinasDataPageProps } from "./PageShell";
import SemanalTable from "./SemanalTable";

/** Override row keys of the two charted series. */
const REQUESTS_ROW = "peticiones";
const UNITS_ROW = "intervenciones";

/**
 * `1.3 Volumetría de peticiones IMAC`.
 *
 * The two figures the Soporte Oficinas team asked for side by side: the
 * requests closed in a week and the work that closing them took. They are not
 * the same measure and the slide must not let them read as one — a request can
 * carry up to five products, so a quiet week of twenty requests can move more
 * material than a busy one of thirty.
 *
 * Both come from the raw listing, folded into weeks at import. The section only
 * carries the current year: the listing is exported as "Año En Curso" and there
 * is no historic equivalent, so there is no year comparison here and none is
 * invented.
 *
 * The table underneath opens with the same two series the chart draws, which is
 * the table the team asked for, and follows with the request types, the only
 * breakdown the source supports.
 */
export default function ImacPage({
  page,
  editing,
  onChange,
  dataset,
}: OficinasDataPageProps) {
  const imac = dataset.imac;
  const requests = imac?.peticionesByWeek ?? [];
  const units = imac?.intervencionesByWeek ?? [];
  const year =
    dataset.year ?? latestYear(requests) ?? new Date().getFullYear();
  const throughWeek = reportWeek(dataset, year);

  const weeks = seriesWeeks(requests, year).filter(
    week => throughWeek === null || week <= throughWeek
  );
  const weekSelection: WeekSelection =
    page.weekSelection ?? defaultWeekSelection(weeks[weeks.length - 1] ?? 1);
  const selectedWeeks = resolveWeekSelection(weekSelection, weeks);

  const COLORS: Record<string, string> = {
    [REQUESTS_ROW]: CURRENT_YEAR_COLOR,
    [UNITS_ROW]: PREVIOUS_YEAR_COLOR,
  };
  const seriesRows = imacSeries(page, year, weeks, [
    { key: REQUESTS_ROW, label: "Peticiones", values: requests },
    { key: UNITS_ROW, label: "Intervenciones", values: units },
  ]);

  const series: WeeklySeries[] = seriesRows.map(entry => ({
    key: entry.key,
    label: entry.label,
    color: COLORS[entry.key],
  }));

  const data = weeks.map((week, index) => {
    const point: Record<string, number | string | null> = {
      semana: weekLabel(week),
    };

    for (const entry of seriesRows) {
      point[entry.key] = entry.cells[index].value;
    }

    return point;
  });
  const chartData = data.filter((_, index) =>
    selectedWeeks.includes(weeks[index])
  );

  // The team asked for "the assigned requests and the work done per week", so
  // both series lead the table and the request types follow underneath. The
  // "Peticiones" row is the sum of those types, which is why no total closes
  // the table.
  const tableRows = [
    ...seriesRows.map(entry => entry.row),
    ...rankedRows(imac?.byTipo ?? [], year, throughWeek ?? undefined),
  ];

  const lastWeek = weeks[weeks.length - 1] ?? null;
  const valueOf = (row: (typeof seriesRows)[number]) =>
    lastWeek === null
      ? null
      : (row.cells[weeks.indexOf(lastWeek)]?.value ?? null);
  const closedRequests = valueOf(seriesRows[0]);
  const closedUnits = valueOf(seriesRows[1]);

  const items =
    lastWeek === null
      ? []
      : [
          {
            label: `Peticiones ${weekLabel(lastWeek)}`,
            value: (closedRequests ?? 0).toLocaleString("es-ES"),
          },
          {
            label: `Intervenciones ${weekLabel(lastWeek)}`,
            value: (closedUnits ?? 0).toLocaleString("es-ES"),
          },
          {
            label: "Unidades por petición",
            value: decimal(
              closedRequests ? (closedUnits ?? 0) / closedRequests : null
            ),
          },
        ];

  return (
    <PageShell page={page} editing={editing} onChange={onChange}>
      {editing && (
        <WeekRangeSelector
          selection={weekSelection}
          available={weeks}
          onChange={next => onChange({ weekSelection: next })}
        />
      )}

      <KpiRow items={items} compact />

      <div className="flex min-h-0 flex-[3] flex-col">
        <WeeklyBarChart
          weeks={selectedWeeks}
          series={series}
          data={chartData}
          labels
        />
      </div>

      <div className="min-h-0 flex-[2]">
        <SemanalTable
          rowHeader="Serie"
          rows={tableRows}
          year={year}
          visibleWeeks={selectedWeeks}
          mediaWeeks={semanalMediaWeeks(tableRows, year, throughWeek)}
          // The two series open the table and the types follow, so the closing
          // total is left out: it would add the units to the requests and to
          // the types that already are those requests, three times the same
          // week under one figure.
          totalRow={false}
          rankByAverage={false}
          layout={semanalLayoutRules("volumetrias-semanales")}
        />
      </div>

      {editing && (
        <ValueGrid
          columns={weeks.map(weekLabel)}
          rows={seriesRows.map(entry => ({
            label: entry.label,
            color: COLORS[entry.key],
            cells: entry.cells,
          }))}
          onChange={(key, value) => onChange(withOverride(page, key, value))}
        />
      )}
    </PageShell>
  );
}
