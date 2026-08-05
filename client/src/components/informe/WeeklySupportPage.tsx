import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DeckPage, InformeWeeklyDataset, WeekSelection } from "@shared/informe";
import { defaultWeekSelection, resolveWeekSelection } from "@shared/informe";
import EditableNumber from "./EditableNumber";
import EditableText from "./EditableText";
import WeekRangeSelector from "./WeekRangeSelector";
import { Checkbox } from "@/components/ui/checkbox";

interface WeeklySupportPageProps {
  page: DeckPage;
  weekly: InformeWeeklyDataset;
  editing: boolean;
  onChange: (patch: Partial<DeckPage>) => void;
}

/** Above this many weeks the per-bar value labels stop fitting. */
const MAX_LABELLED_WEEKS = 20;

// Recharts inlines its own tick fill, which overrides a Tailwind class and
// leaves the axis unreadable in dark mode. Set the token explicitly.
const AXIS_TICK = { fill: "var(--muted-foreground)", className: "text-[1.1cqi]" };

const cellKey = (rowLabel: string, week: number) => `${rowLabel}:${week}`;

/**
 * Weekly support slide: total per selected week as bars, with the per-row
 * breakdown repeated in an editable table underneath. The week selector drives
 * both the chart and the table.
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

  const header = (
    <header className="shrink-0">
      <h2 className="text-[3.4cqi] leading-tight text-foreground">
        <EditableText
          value={page.text.title ?? ""}
          onChange={setSlot("title")}
          editing={editing}
          ariaLabel="Título de la página"
          className="block w-full"
        />
      </h2>
      <p className="font-mono text-[1.6cqi] uppercase tracking-wide text-muted-foreground">
        <EditableText
          value={page.text.subtitle ?? ""}
          onChange={setSlot("subtitle")}
          editing={editing}
          ariaLabel="Subtítulo de la página"
          className="block w-full"
        />
      </p>
    </header>
  );

  if (!matrix || matrix.weeks.length === 0) {
    return (
      <div className="@container flex h-full w-full flex-col text-foreground">
        {header}
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

  const chartData = weeks.map((week) => ({
    semana: `S${week}`,
    total: totalFor(week),
  }));

  const setCell = (rowLabel: string, week: number, value: number | null) =>
    onChange({ overrides: { ...page.overrides, [cellKey(rowLabel, week)]: value } });

  const toggleRow = (label: string, visible: boolean) =>
    onChange({
      hiddenRows: visible
        ? hiddenRows.filter((item) => item !== label)
        : [...hiddenRows, label],
    });

  return (
    <div className="@container flex h-full w-full flex-col text-foreground">
      {header}

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
      <div className="mt-[1.5cqi] h-[42%] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 14, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="semana" stroke="var(--border)" tick={AXIS_TICK} tickLine={false} />
            <YAxis stroke="var(--border)" tick={AXIS_TICK} tickLine={false} width={40} />
            <Tooltip
              cursor={{ fill: "var(--muted)", fillOpacity: 0.4 }}
              contentStyle={{
                backgroundColor: "var(--popover)",
                color: "var(--popover-foreground)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                fontSize: "1.2cqi",
              }}
            />
            <Bar
              dataKey="total"
              name="Total"
              fill="var(--chart-1)"
              radius={[3, 3, 0, 0]}
              isAnimationActive={false}
            >
              {weeks.length <= MAX_LABELLED_WEEKS && (
                <LabelList
                  dataKey="total"
                  position="top"
                  className="fill-foreground text-[1.1cqi]"
                />
              )}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {editing && matrix.rows.length > 0 && (
        <ul className="mt-[1cqi] flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs">
          {matrix.rows.map((row) => {
            const visible = !hiddenRows.includes(row.label);
            return (
              <li key={row.label} className="flex items-center gap-1.5">
                <Checkbox
                  id={`row-${page.id}-${row.label}`}
                  checked={visible}
                  onCheckedChange={(checked) => toggleRow(row.label, checked === true)}
                />
                <label htmlFor={`row-${page.id}-${row.label}`} className="cursor-pointer">
                  {row.label}
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-[1.5cqi] min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-full table-fixed border-collapse font-mono text-[1.15cqi] tabular-nums">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th scope="col" className="w-[18%] py-[0.3cqi] text-left font-normal">
                {typeData?.categories ? "Categoría" : "Ubicación"}
              </th>
              {weeks.map((week) => (
                <th key={week} scope="col" className="py-[0.3cqi] text-center font-normal">
                  {`S${week}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.label} className="border-b border-border/60">
                <th scope="row" className="truncate py-[0.25cqi] text-left font-normal">
                  {row.label}
                </th>
                {weeks.map((week) => (
                  <td key={week} className="px-[0.2cqi] py-[0.25cqi] text-center">
                    <EditableNumber
                      value={valueAt(row.label, week)}
                      onChange={(value) => setCell(row.label, week, value)}
                      editing={editing}
                      overridden={isOverridden(row.label, week)}
                      ariaLabel={`${row.label} semana ${week}`}
                      className="text-[1.15cqi]"
                    />
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t border-border font-medium">
              <th scope="row" className="py-[0.3cqi] text-left">
                Total
              </th>
              {weeks.map((week) => (
                <td key={week} className="px-[0.2cqi] py-[0.3cqi] text-center">
                  {totalFor(week)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
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
