import type { DeckPage, InformeWeeklyDataset, WeekSelection } from "@shared/informe";
import { comparisonValue, defaultWeekSelection, resolveWeekSelection } from "@shared/informe";
import EditableText from "./EditableText";
import RowFilterPanel from "./RowFilterPanel";
import SlideHeading from "./SlideHeading";
import WeekRangeSelector from "./WeekRangeSelector";
import WeeklyBarChart, { type WeeklySeries } from "./WeeklyBarChart";
import WeeklyTable from "./WeeklyTable";

interface WeeklySupportPageProps {
  page: DeckPage;
  weekly: InformeWeeklyDataset;
  editing: boolean;
  onChange: (patch: Partial<DeckPage>) => void;
}

const CURRENT_SERIES_KEY = "actual";

const cellKey = (rowLabel: string, week: number) => `${rowLabel}:${week}`;

/**
 * Weekly support slide: total per selected week as grouped bars against the
 * previous year, with the per-row breakdown repeated in an editable table.
 * The week selector drives both the chart and the table.
 */
export default function WeeklySupportPage({
  page,
  weekly,
  editing,
  onChange,
}: WeeklySupportPageProps) {
  const setSlot = (key: string) => (value: string) =>
    onChange({ text: { ...page.text, [key]: value } });

  const typeData = page.supportType ? weekly.byType[page.supportType] : undefined;
  const matrix = typeData ? (typeData.categories ?? typeData.locations) : null;

  const heading = (
    <SlideHeading
      service={page.text.subtitle ?? ""}
      title={page.text.title ?? ""}
      editing={editing}
      onServiceChange={setSlot("subtitle")}
      onTitleChange={setSlot("title")}
    />
  );

  if (!matrix || matrix.weeks.length === 0) {
    return (
      <div className="@container flex h-full w-full flex-col text-foreground">
        {heading}
        <p className="mt-[2cqi] font-mono text-[1.3cqi] text-muted-foreground">
          Sin datos semanales importados para este tipo de soporte
        </p>
      </div>
    );
  }

  const selection: WeekSelection =
    page.weekSelection ?? defaultWeekSelection(matrix.weeks[matrix.weeks.length - 1]);
  const weeks = resolveWeekSelection(selection, matrix.weeks);

  const hiddenRows = page.hiddenRows ?? [];
  const visibleRows = matrix.rows.filter((row) => !hiddenRows.includes(row.label));

  const isOverridden = (rowLabel: string, week: number) =>
    Object.prototype.hasOwnProperty.call(page.overrides, cellKey(rowLabel, week));

  const valueAt = (rowLabel: string, week: number): number => {
    if (isOverridden(rowLabel, week)) {
      return page.overrides[cellKey(rowLabel, week)] ?? 0;
    }

    const row = matrix.rows.find((item) => item.label === rowLabel);
    if (!row) {
      return 0;
    }

    const index = matrix.weeks.indexOf(week);
    return index === -1 ? 0 : (row.values[index] ?? 0);
  };

  const totalFor = (week: number) =>
    visibleRows.reduce((sum, row) => sum + valueAt(row.label, week), 0);

  // Previous years, oldest first, so the current year sits last in each group.
  const comparisons = [...(typeData?.comparisons ?? [])].sort((a, b) => a.year - b.year);
  // The reported year is not stored with the weekly matrix; it is the one right
  // after the most recent comparison.
  const currentYear =
    comparisons.length > 0 ? comparisons[comparisons.length - 1].year + 1 : null;

  const series: WeeklySeries[] = [
    ...comparisons.map((comparison, index) => ({
      key: `y${comparison.year}`,
      label: String(comparison.year),
      color: `var(--informe-serie-${Math.min(3, index + 3)})`,
    })),
    {
      key: CURRENT_SERIES_KEY,
      label: currentYear ? String(currentYear) : "Total",
      color: "var(--informe-serie-4)",
    },
  ];

  const chartData = weeks.map((week) => {
    const row: Record<string, number | string> = {
      semana: `S${week}`,
      [CURRENT_SERIES_KEY]: totalFor(week),
    };

    for (const comparison of comparisons) {
      const value = comparisonValue(comparison, week);

      if (value !== null) {
        row[`y${comparison.year}`] = value;
      }
    }

    return row;
  });

  const setCell = (rowLabel: string, week: number, value: number | null) =>
    onChange({ overrides: { ...page.overrides, [cellKey(rowLabel, week)]: value } });

  return (
    <div className="@container flex h-full w-full flex-col text-foreground">
      {heading}

      {editing && (
        <div className="mt-[1cqi] shrink-0">
          <WeekRangeSelector
            selection={selection}
            available={matrix.weeks}
            onChange={(next) => onChange({ weekSelection: next })}
          />
        </div>
      )}

      {/* Fixed share of the 16:9 frame: a flex-1 chart collapses to 0 because the
          table below keeps its natural height. */}
      <div className="mt-[1.5cqi] flex h-[42%] shrink-0 flex-col">
        <WeeklyBarChart weeks={weeks} series={series} data={chartData} />
      </div>

      {editing && (
        <RowFilterPanel
          labels={matrix.rows.map((row) => row.label)}
          hiddenRows={hiddenRows}
          scope={page.id}
          onChange={(next) => onChange({ hiddenRows: next })}
        />
      )}

      <div className="mt-[1.5cqi] min-h-0 flex-1 overflow-auto">
        <WeeklyTable
          rowHeader={typeData?.categories ? "Categoría" : "Ubicación"}
          weeks={weeks}
          rows={visibleRows}
          editing={editing}
          valueAt={valueAt}
          isOverridden={isOverridden}
          onCellChange={setCell}
          totalFor={totalFor}
          comparisonRows={comparisons.map((comparison) => ({
            label: String(comparison.year),
            valueFor: (week: number) => comparisonValue(comparison, week),
          }))}
        />
      </div>

      <p className="mt-[1cqi] shrink-0 font-mono text-[1.15cqi] leading-snug text-muted-foreground">
        <EditableText
          value={page.text.footnote ?? ""}
          onChange={setSlot("footnote")}
          editing={editing}
          multiline
          ariaLabel="Nota al pie"
          className="block w-full"
        />
      </p>
    </div>
  );
}
