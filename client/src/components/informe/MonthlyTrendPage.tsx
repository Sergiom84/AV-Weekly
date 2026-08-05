import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DeckPage, InformeMonthlyDataset } from "@shared/informe";
import { MONTH_LABELS } from "@shared/informe";
import EditableNumber from "./EditableNumber";
import EditableText from "./EditableText";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface MonthlyTrendPageProps {
  page: DeckPage;
  monthly: InformeMonthlyDataset;
  editing: boolean;
  onChange: (patch: Partial<DeckPage>) => void;
}

const DEFAULT_YEARS = [2023, 2024, 2025, 2026];

const SERIES_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

// Recharts inlines its own tick fill, which overrides a Tailwind class and
// leaves the axis unreadable in dark mode. Set the token explicitly.
const AXIS_TICK = { fill: "var(--muted-foreground)", className: "text-[1.1cqi]" };

const cellKey = (year: number, monthIndex: number) => `${year}:${monthIndex}`;

/**
 * Yearly trend slide: one line per year over the twelve months, with the same
 * values repeated in an editable table underneath.
 */
export default function MonthlyTrendPage({
  page,
  monthly,
  editing,
  onChange,
}: MonthlyTrendPageProps) {
  const [yearDraft, setYearDraft] = useState("");

  const years = page.years && page.years.length > 0 ? page.years : DEFAULT_YEARS;
  const imported = page.supportType ? monthly.byType[page.supportType] : undefined;

  const isOverridden = (year: number, monthIndex: number) =>
    Object.prototype.hasOwnProperty.call(page.overrides, cellKey(year, monthIndex));

  const valueAt = (year: number, monthIndex: number): number | null => {
    if (isOverridden(year, monthIndex)) {
      return page.overrides[cellKey(year, monthIndex)];
    }

    return imported?.[String(year)]?.[monthIndex] ?? null;
  };

  const chartData = MONTH_LABELS.map((label, monthIndex) => {
    const point: Record<string, string | number | null> = { mes: label };
    for (const year of years) {
      point[String(year)] = valueAt(year, monthIndex);
    }
    return point;
  });

  const hasValues = years.some((year) =>
    MONTH_LABELS.some((_, monthIndex) => valueAt(year, monthIndex) != null)
  );

  const setSlot = (key: string) => (value: string) =>
    onChange({ text: { ...page.text, [key]: value } });

  const setCell = (year: number, monthIndex: number, value: number | null) =>
    onChange({ overrides: { ...page.overrides, [cellKey(year, monthIndex)]: value } });

  const setYears = (next: number[]) =>
    onChange({ years: Array.from(new Set(next)).sort((a, b) => a - b) });

  const candidateYears = Array.from(
    new Set([...DEFAULT_YEARS, ...monthly.years, ...years])
  ).sort((a, b) => a - b);

  const addDraftYear = () => {
    const parsed = Number(yearDraft.trim());
    if (Number.isInteger(parsed) && parsed > 1900 && parsed < 2200) {
      setYears([...years, parsed]);
      setYearDraft("");
    }
  };

  return (
    <div className="@container flex h-full w-full flex-col text-foreground">
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

      {editing && (
        <div className="mt-[1cqi] flex shrink-0 flex-wrap items-center gap-1">
          {candidateYears.map((year) => {
            const active = years.includes(year);
            return (
              <Button
                key={year}
                type="button"
                size="sm"
                variant={active ? "default" : "outline"}
                aria-pressed={active}
                className="h-7 px-2 font-mono text-xs tabular-nums"
                onClick={() =>
                  setYears(active ? years.filter((item) => item !== year) : [...years, year])
                }
              >
                {year}
              </Button>
            );
          })}
          <Input
            aria-label="Añadir año"
            inputMode="numeric"
            className="h-7 w-20 font-mono text-xs tabular-nums"
            value={yearDraft}
            onBlur={addDraftYear}
            onChange={(event) => setYearDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addDraftYear();
              }
            }}
          />
        </div>
      )}

      {/* Fixed share of the 16:9 frame: a flex-1 chart collapses to 0 because the
          table below keeps its natural height. */}
      <div className="mt-[1.5cqi] h-[46%] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="mes"
              stroke="var(--border)"
              tick={AXIS_TICK}
              tickLine={false}
            />
            <YAxis
              stroke="var(--border)"
              tick={AXIS_TICK}
              tickLine={false}
              width={40}
            />
            <Tooltip
              cursor={{ stroke: "var(--border)" }}
              contentStyle={{
                backgroundColor: "var(--popover)",
                color: "var(--popover-foreground)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                fontSize: "1.2cqi",
              }}
            />
            <Legend wrapperStyle={{ fontSize: "1.2cqi" }} />
            {years.map((year, index) => (
              <Line
                key={year}
                type="monotone"
                dataKey={String(year)}
                name={String(year)}
                stroke={SERIES_COLORS[index % SERIES_COLORS.length]}
                strokeWidth={2}
                dot={{ r: 2.5 }}
                activeDot={{ r: 4 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-[1.5cqi] min-h-0 flex-1 overflow-auto">
        <table className="w-full table-fixed border-collapse font-mono text-[1.15cqi] tabular-nums">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th scope="col" className="w-[9%] py-[0.3cqi] text-left font-normal">
                Año
              </th>
              {MONTH_LABELS.map((label) => (
                <th key={label} scope="col" className="py-[0.3cqi] text-center font-normal">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {years.map((year, index) => (
              <tr key={year} className="border-b border-border/60 last:border-b-0">
                <th scope="row" className="py-[0.25cqi] text-left font-normal whitespace-nowrap">
                  <span
                    aria-hidden="true"
                    className="inline-block size-[0.9cqi] rounded-full align-middle"
                    style={{ backgroundColor: SERIES_COLORS[index % SERIES_COLORS.length] }}
                  />
                  <span className="ml-[0.6cqi] align-middle">{year}</span>
                </th>
                {MONTH_LABELS.map((label, monthIndex) => (
                  <td key={label} className="px-[0.2cqi] py-[0.25cqi] text-center">
                    <EditableNumber
                      value={valueAt(year, monthIndex)}
                      onChange={(value) => setCell(year, monthIndex, value)}
                      editing={editing}
                      overridden={isOverridden(year, monthIndex)}
                      ariaLabel={`${label} ${year}`}
                      className="text-[1.15cqi]"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {!hasValues && (
          <p className="mt-[0.8cqi] font-mono text-[1.15cqi] text-muted-foreground">
            Sin datos importados para este tipo de soporte
          </p>
        )}
      </div>
    </div>
  );
}
