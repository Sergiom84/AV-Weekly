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
  reportWeek,
  seriesWeeks,
  valueAt,
} from "@shared/modules/oficinas/derived";
import {
  CURRENT_YEAR_COLOR,
  PREVIOUS_YEAR_COLOR,
  decimal,
  semanalMediaWeeks,
  weekLabel,
} from "../aggregate";
import { cellKey, isOverridden, overriddenValue, withOverride } from "../overrides";
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
 * The table underneath is the request type, which is the breakdown the source
 * supports. It closes with its total because it is the whole matrix and not a
 * sample: every closed request has a type.
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

  const seriesRows = [
    {
      key: REQUESTS_ROW,
      label: "Peticiones",
      color: CURRENT_YEAR_COLOR,
      source: requests,
    },
    {
      key: UNITS_ROW,
      label: "Intervenciones",
      color: PREVIOUS_YEAR_COLOR,
      source: units,
    },
  ].map(entry => ({
    ...entry,
    cells: weeks.map(week => {
      const key = cellKey(entry.key, weekLabel(week));

      return {
        key,
        value: overriddenValue(page, key, valueAt(entry.source, year, week)),
        overridden: isOverridden(page, key),
      };
    }),
  }));

  const series: WeeklySeries[] = seriesRows.map(entry => ({
    key: entry.key,
    label: entry.label,
    color: entry.color,
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
          rowHeader="Tipo de petición"
          rows={imac?.byTipo ?? []}
          year={year}
          visibleWeeks={selectedWeeks}
          mediaWeeks={semanalMediaWeeks(imac?.byTipo ?? [], year, throughWeek)}
          totalRow
          rankByAverage
          layout={semanalLayoutRules("volumetrias-semanales")}
        />
      </div>

      {editing && (
        <ValueGrid
          columns={weeks.map(weekLabel)}
          rows={seriesRows.map(entry => ({
            label: entry.label,
            color: entry.color,
            cells: entry.cells,
          }))}
          onChange={(key, value) => onChange(withOverride(page, key, value))}
        />
      )}
    </PageShell>
  );
}
