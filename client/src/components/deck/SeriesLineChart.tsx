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
          <LineChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey={categoryKey}
              stroke="var(--border)"
              tick={AXIS_TICK}
              tickLine={false}
              tickMargin={6}
            />
            <YAxis
              stroke="var(--border)"
              tick={AXIS_TICK}
              tickLine={false}
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
