import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DeckPage, InformeMonthlyDataset } from "@shared/informe";
import { MONTH_LABELS } from "@shared/informe";
import EditableNumber from "@/components/deck/EditableNumber";
import EditableText from "@/components/deck/EditableText";
import SlideHeading from "@/components/deck/SlideHeading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface MonthlyTrendPageProps {
  page: DeckPage;
  monthly: InformeMonthlyDataset;
  editing: boolean;
  onChange: (patch: Partial<DeckPage>) => void;
}

const DEFAULT_YEARS = [2023, 2024, 2025, 2026];

// Report palette, assigned by position in the ascending year list so adding or
// removing a year keeps the sequence intact.
const SERIES_COLORS = [
  "var(--informe-serie-1)",
  "var(--informe-serie-2)",
  "var(--informe-serie-3)",
  "var(--informe-serie-4)",
];

const seriesColor = (index: number) => SERIES_COLORS[index % SERIES_COLORS.length];

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

  const years = [
    ...(page.years && page.years.length > 0 ? page.years : DEFAULT_YEARS),
  ].sort((a, b) => a - b);
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
      <SlideHeading
        service={page.text.subtitle ?? ""}
        title={page.text.title ?? ""}
        editing={editing}
        onServiceChange={setSlot("subtitle")}
        onTitleChange={setSlot("title")}
      />

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

      <div className="mt-[1.2cqi] flex shrink-0 items-center justify-center gap-[2.4cqi] font-mono text-[1.3cqi] text-foreground">
        {years.map((year, index) => (
          <span key={year} className="flex items-center gap-[0.6cqi]">
            <span
              aria-hidden="true"
              className="inline-block size-[1.1cqi] rounded-full"
              style={{ backgroundColor: seriesColor(index) }}
            />
            <span className="tabular-nums">{year}</span>
          </span>
        ))}
      </div>

      {/* Fixed share of the 16:9 frame: a flex-1 chart collapses to 0 because the
          table below keeps its natural height. */}
      <div className="mt-[0.6cqi] h-[46%] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="mes"
              axisLine={false}
              tickLine={false}
              tick={AXIS_TICK}
              tickMargin={6}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={AXIS_TICK}
              width={40}
              domain={[0, "auto"]}
              allowDecimals={false}
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
            {years.map((year, index) => (
              <Line
                key={year}
                type="natural"
                dataKey={String(year)}
                name={String(year)}
                stroke={seriesColor(index)}
                strokeWidth={3}
                dot={{ r: 4, fill: seriesColor(index), strokeWidth: 0 }}
                activeDot={{ r: 5, strokeWidth: 0 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Months are not repeated here: the X axis above already labels them. */}
      <div className="mt-[1.4cqi] min-h-0 flex-1 overflow-auto">
        <table className="w-full table-fixed border-collapse font-mono text-[1.15cqi] tabular-nums">
          <tbody>
            {years.map((year, index) => (
              <tr key={year}>
                <th
                  scope="row"
                  className="w-[9%] px-[0.4cqi] py-[0.45cqi] text-center text-[1.25cqi] font-bold text-white dark:text-[color:var(--background)]"
                  style={{ backgroundColor: seriesColor(index) }}
                >
                  {year}
                </th>
                {MONTH_LABELS.map((label, monthIndex) => (
                  <td
                    key={label}
                    className="border border-border px-[0.2cqi] py-[0.45cqi] text-center"
                  >
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
      </div>
    </div>
  );
}
