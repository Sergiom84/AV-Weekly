import { useEffect, useRef, useState } from "react";
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
import YearSelector from "@/components/deck/YearSelector";
import SlideHeading from "@/components/deck/SlideHeading";
import { usePresentationAnimation } from "@/contexts/PresentationAnimationContext";
import { yearSeriesColor } from "@/lib/yearSeries";

interface MonthlyTrendPageProps {
  page: DeckPage;
  monthly: InformeMonthlyDataset;
  editing: boolean;
  onChange: (patch: Partial<DeckPage>) => void;
}

const DEFAULT_YEARS = [2024, 2025, 2026];

// Recharts inlines its own tick fill, which overrides a Tailwind class and
// leaves the axis unreadable in dark mode. Set the token explicitly.
const AXIS_TICK = {
  fill: "var(--muted-foreground)",
  className: "text-[1.1cqi]",
};

const cellKey = (year: number, monthIndex: number) => `${year}:${monthIndex}`;

/**
 * Share of the width taken by the year badge, the table's first column.
 *
 * The chart gives the same share to its Y axis so that the twelve months of the
 * plot span exactly the twelve columns underneath. See `useContentWidth`.
 */
const YEAR_COLUMN_SHARE = 0.09;

/** Width of an element, tracked as the slide is resized or zoomed. */
function useContentWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const node = ref.current;

    if (!node) return;

    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
    });

    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  return { ref, width };
}

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
  const animate = usePresentationAnimation();
  const { ref: chartRef, width: chartWidth } = useContentWidth();

  // The plot is laid out on the table's grid: the Y axis takes the width of the
  // year badge and each month gets one of the twelve columns left. Half a column
  // of padding at both ends moves the points from the edges of the plot to the
  // middle of their column, which is where the month is written.
  const axisWidth = Math.round(chartWidth * YEAR_COLUMN_SHARE);
  const monthColumn = chartWidth === 0 ? 0 : (chartWidth - axisWidth) / 12;

  const imported = page.supportType
    ? monthly.byType[page.supportType]
    : undefined;
  const availableYears = Array.from(
    new Set([...DEFAULT_YEARS, ...monthly.years].filter(year => year >= 2024))
  ).sort((a, b) => a - b);
  // Sorted here and not only where the selector saves it: the chart draws one
  // line per year in this order, and the report reads oldest to newest.
  const years = (
    page.years
      ? page.years.filter(year => availableYears.includes(year))
      : availableYears
  ).toSorted((a, b) => a - b);

  const isOverridden = (year: number, monthIndex: number) =>
    Object.prototype.hasOwnProperty.call(
      page.overrides,
      cellKey(year, monthIndex)
    );

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
    onChange({
      overrides: { ...page.overrides, [cellKey(year, monthIndex)]: value },
    });

  const setYears = (next: number[]) =>
    onChange({ years: Array.from(new Set(next)).sort((a, b) => a - b) });

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
        <div className="mt-[1cqi]">
          <YearSelector
            selection={{
              available: availableYears,
              selected: years,
              onChange: setYears,
            }}
          />
        </div>
      )}

      <div className="mt-[1.2cqi] flex shrink-0 items-center justify-center gap-[2.4cqi] font-mono text-[1.3cqi] text-foreground">
        {years.map(year => (
          <span key={year} className="flex items-center gap-[0.6cqi]">
            <span
              aria-hidden="true"
              className="inline-block size-[1.1cqi] rounded-full"
              style={{ backgroundColor: yearSeriesColor(year) }}
            />
            <span className="tabular-nums">{year}</span>
          </span>
        ))}
      </div>

      {/* Fixed share of the 16:9 frame: a flex-1 chart collapses to 0 because the
          table below keeps its natural height. */}
      <div className="mt-[0.6cqi] h-[46%] shrink-0" ref={chartRef}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 8, right: 0, bottom: 0, left: 0 }}
          >
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="mes"
              axisLine={false}
              tickLine={false}
              tick={AXIS_TICK}
              tickMargin={6}
              interval={0}
              padding={{ left: monthColumn / 2, right: monthColumn / 2 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={AXIS_TICK}
              width={axisWidth}
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
            {years.map(year => (
              <Line
                key={year}
                type="natural"
                dataKey={String(year)}
                name={String(year)}
                stroke={yearSeriesColor(year)}
                strokeWidth={3}
                dot={{ r: 4, fill: yearSeriesColor(year), strokeWidth: 0 }}
                activeDot={{ r: 5, strokeWidth: 0 }}
                connectNulls={false}
                isAnimationActive={animate}
                animationDuration={900}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Months are not repeated here: the X axis above already labels them. */}
      <div className="mt-[1.4cqi] min-h-0 flex-1 overflow-auto">
        <table className="w-full table-fixed border-collapse font-mono text-[1.15cqi] tabular-nums">
          <tbody>
            {years.map(year => (
              <tr key={year}>
                <th
                  scope="row"
                  className="w-[9%] px-[0.4cqi] py-[0.45cqi] text-center text-[1.25cqi] font-bold text-white dark:text-[color:var(--background)]"
                  style={{ backgroundColor: yearSeriesColor(year) }}
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
                      onChange={value => setCell(year, monthIndex, value)}
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
