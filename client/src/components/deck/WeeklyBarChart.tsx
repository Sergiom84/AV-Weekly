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
import { usePresentationAnimation } from "@/contexts/PresentationAnimationContext";
import { formatChartMetric, metricAxisWidth } from "@shared/deck/core";

export interface WeeklySeries {
  /** Key inside each chart row. */
  key: string;
  /** Legend and tooltip label, normally the year. */
  label: string;
  color: string;
}

interface WeeklyBarChartProps {
  weeks: number[];
  series: WeeklySeries[];
  /** One entry per week, holding a numeric value per series key. */
  data: Record<string, number | string | null>[];
  /**
   * Value on top of every bar. On by default, as the weekly support slides
   * print it.
   *
   * A full year against several past ones is the case that has to turn it off:
   * fifty-two weeks times three or four bars is more labels than the slide has
   * pixels, and the printed annual comparison carries none either.
   */
  labels?: boolean;
}

/** Above this many weeks grouped labels need the compact size to fit. */
const COMPACT_LABELS_FROM = 12;

interface WeeklyValueLabelProps {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  value?: number | string;
  compact: boolean;
}

/**
 * Centres each value exactly over its own bar. In dense weekly comparisons the
 * SVG text is condensed, never shifted sideways, so it cannot spill into the
 * neighbouring column or imply the wrong value-to-year association.
 */
function WeeklyValueLabel({
  x,
  y,
  width,
  value,
  compact,
}: WeeklyValueLabelProps) {
  const box = { x: Number(x), y: Number(y), width: Number(width) };

  if (
    value === undefined ||
    value === "" ||
    !Number.isFinite(box.x) ||
    !Number.isFinite(box.y) ||
    !Number.isFinite(box.width)
  ) {
    return null;
  }

  const maxWidth = Math.max(box.width - 2, 1);
  const preferredWidth = String(value).length * (compact ? 6 : 9);
  const textLength = Math.min(maxWidth, preferredWidth);

  return (
    <text
      x={box.x + box.width / 2}
      y={box.y - 3}
      textAnchor="middle"
      textLength={textLength}
      lengthAdjust="spacingAndGlyphs"
      className={`fill-foreground font-mono font-medium ${
        compact ? "text-[0.65cqi]" : "text-[0.9cqi]"
      }`}
    >
      {value}
    </text>
  );
}

// Recharts inlines its own tick fill, which overrides a Tailwind class and
// leaves the axis unreadable in dark mode. Set the token explicitly.
const AXIS_TICK = {
  fill: "var(--muted-foreground)",
  className: "text-[1.1cqi]",
};

/**
 * Weekly totals as grouped bars, one group per week and one bar per year.
 * Every bar carries its value on top, as in the printed report.
 */
export default function WeeklyBarChart({
  weeks,
  series,
  data,
  labels = true,
}: WeeklyBarChartProps) {
  const animate = usePresentationAnimation();
  const compactLabels = weeks.length >= COMPACT_LABELS_FROM;
  const yAxisWidth = metricAxisWidth(
    data.flatMap(entry => series.map(item => entry[item.key]))
  );

  return (
    <>
      {series.length > 1 && (
        <ul className="flex shrink-0 items-center justify-center gap-[2cqi] pb-[0.5cqi] font-mono text-[1.2cqi] text-muted-foreground">
          {series.map(entry => (
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
      )}

      {/* The chart needs its own flexible box: sharing height with the legend
          above collapses ResponsiveContainer to zero. */}
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 20, right: 0, bottom: 0, left: 0 }}
            barGap={1}
            barCategoryGap="5%"
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border)"
              vertical={false}
            />
            <XAxis
              dataKey="semana"
              stroke="var(--border)"
              tick={AXIS_TICK}
              tickLine={false}
            />
            <YAxis
              stroke="var(--border)"
              tick={AXIS_TICK}
              tickFormatter={formatChartMetric}
              tickLine={false}
              width={yAxisWidth}
            />
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
            {series.map(entry => (
              <Bar
                key={entry.key}
                dataKey={entry.key}
                name={entry.label}
                fill={entry.color}
                radius={[2, 2, 0, 0]}
                isAnimationActive={animate}
                animationDuration={700}
              >
                {labels && (
                  <LabelList
                    dataKey={entry.key}
                    content={<WeeklyValueLabel compact={compactLabels} />}
                  />
                )}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
