import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { usePresentationAnimation } from "@/contexts/PresentationAnimationContext";
import { formatChartMetric, metricAxisWidth } from "@shared/deck/core";

export interface LineSeries {
  key: string;
  label: string;
  color: string;
}

interface SeriesLineChartProps {
  /** Key of the category shown on the X axis. */
  categoryKey: string;
  series: LineSeries[];
  /** One entry per category. A `null` value is a gap, not a zero. */
  data: Record<string, number | string | null>[];
}

// Recharts inlines its own tick fill, which overrides a Tailwind class and
// leaves the axis unreadable in dark mode. Set the token explicitly.
const AXIS_TICK = { fill: "var(--muted-foreground)", className: "text-[1.1cqi]" };

interface CategoryTickProps {
  x?: number;
  y?: number;
  payload?: { value?: unknown };
}

/**
 * Axis tick that stacks a two-word category, `Ene 26`, on two lines.
 *
 * Every tick is printed rather than thinned out, so the widest label sets the
 * spacing the axis needs. A month that carries its year is twice as wide as its
 * neighbours and collides with them; stacked, it costs the same width as `Ene`
 * and still says which year the series turns on.
 */
function CategoryTick({ x, y, payload }: CategoryTickProps) {
  const [name, qualifier] = String(payload?.value ?? "").split(" ");

  return (
    <text
      x={x}
      y={y}
      dy={10}
      textAnchor="middle"
      fill={AXIS_TICK.fill}
      className={AXIS_TICK.className}
    >
      <tspan x={x}>{name}</tspan>
      {qualifier === undefined ? null : (
        <tspan x={x} dy="1.1em">
          {qualifier}
        </tspan>
      )}
    </text>
  );
}

/**
 * Multi-series line chart of the AGA deck: the Office families over the months
 * and the annual series over the twelve months of each year.
 *
 * Lines rather than columns because both pages carry four or five series over
 * more than twelve categories, which as grouped bars is sixty hairlines. And
 * `connectNulls` is off on purpose: a month a family was not reported on has to
 * read as a gap, never as a zero, which would say "none requested" instead of
 * "not measured".
 */
export default function SeriesLineChart({
  categoryKey,
  series,
  data,
}: SeriesLineChartProps) {
  const animate = usePresentationAnimation();
  const yAxisWidth = metricAxisWidth(
    data.flatMap(entry => series.map(item => entry[item.key]))
  );

  return (
    <>
      <ul className="flex shrink-0 flex-wrap items-center justify-center gap-x-[2cqi] gap-y-[0.4cqi] pb-[0.5cqi] font-mono text-[1.2cqi] text-muted-foreground">
        {series.map((entry) => (
          <li key={entry.key} className="flex items-center gap-[0.6cqi]">
            <span
              aria-hidden="true"
              className="inline-block h-[1.1cqi] w-[1.1cqi] rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            {entry.label}
          </li>
        ))}
      </ul>

      {/* Own flexible box: sharing height with the legend above collapses
          ResponsiveContainer to zero. */}
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          {/* The right margin is the width of the last dot plus its label: with
              none, the newest month is drawn half outside the plot and its tick
              collides with the previous one. It is the month being reported, so
              it is the one that must not be cut. */}
          <LineChart data={data} margin={{ top: 12, right: 18, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            {/* Every category is printed. Left to fit them itself, Recharts
                drops whichever ticks it decides do not fit, and the month it
                dropped on the Office slide was the one being reported. */}
            <XAxis
              dataKey={categoryKey}
              height={34}
              interval={0}
              stroke="var(--border)"
              tick={<CategoryTick />}
              tickLine={false}
              tickMargin={6}
            />
            <YAxis
              stroke="var(--border)"
              tick={AXIS_TICK}
              tickFormatter={formatChartMetric}
              tickLine={false}
              width={yAxisWidth}
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
            {series.map((entry) => (
              <Line
                key={entry.key}
                type="natural"
                dataKey={entry.key}
                name={entry.label}
                stroke={entry.color}
                strokeWidth={2.5}
                dot={{ r: 3, fill: entry.color, strokeWidth: 0 }}
                activeDot={{ r: 5, strokeWidth: 0 }}
                connectNulls={false}
                isAnimationActive={animate}
                animationDuration={900}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
