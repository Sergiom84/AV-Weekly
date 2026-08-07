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

export interface CategorySeries {
  /** Key inside each chart row. */
  key: string;
  /** Legend and tooltip label. */
  label: string;
  color: string;
}

interface CategoryBarChartProps {
  /** Key of the category shown on the X axis. */
  categoryKey: string;
  series: CategorySeries[];
  /** One entry per category, holding a numeric value per series key. */
  data: Record<string, number | string>[];
  /** Stacks the series instead of grouping them side by side. */
  stacked?: boolean;
}

/** Above this many categories the value labels need the compact size to fit. */
const COMPACT_LABELS_FROM = 14;

// Recharts inlines its own tick fill, which overrides a Tailwind class and
// leaves the axis unreadable in dark mode. Set the token explicitly.
const AXIS_TICK = { fill: "var(--muted-foreground)", className: "text-[1.1cqi]" };

/**
 * Grouped or stacked bars over an arbitrary category axis: month, year, week or
 * supplier. The weekly variant of the AV deck stays in `WeeklyBarChart`.
 */
export default function CategoryBarChart({
  categoryKey,
  series,
  data,
  stacked = false,
}: CategoryBarChartProps) {
  const labelClass =
    data.length > COMPACT_LABELS_FROM
      ? "fill-foreground text-[0.75cqi]"
      : "fill-foreground text-[1.1cqi]";

  return (
    <>
      {series.length > 1 && (
        <ul className="flex shrink-0 items-center justify-center gap-[2cqi] pb-[0.5cqi] font-mono text-[1.2cqi] text-muted-foreground">
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
      )}

      {/* The chart needs its own flexible box: sharing height with the legend
          above collapses ResponsiveContainer to zero. */}
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 16, right: 8, bottom: 0, left: 0 }} barGap={1}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey={categoryKey}
              stroke="var(--border)"
              tick={AXIS_TICK}
              tickLine={false}
            />
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
            {series.map((entry) => (
              <Bar
                key={entry.key}
                dataKey={entry.key}
                name={entry.label}
                fill={entry.color}
                stackId={stacked ? "stack" : undefined}
                radius={[2, 2, 0, 0]}
                isAnimationActive={false}
              >
                {!stacked && (
                  <LabelList dataKey={entry.key} position="top" className={labelClass} />
                )}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
