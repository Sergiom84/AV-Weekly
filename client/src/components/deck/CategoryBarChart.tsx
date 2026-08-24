import { useLayoutEffect, useRef, useState } from "react";
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
import {
  COMPACT_LABELS_FROM,
  groupedLabelOffset,
  groupedLabelTopMargin,
} from "./CategoryBarLabelLayout";

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
  /**
   * Draws every category tick, angled, instead of letting Recharts drop the
   * ones that overlap. Opt-in: only needed for long text categories such as the
   * department axis of the AGA deck, where a hidden tick loses a whole bar's
   * identity. Month and year axes read better with the default.
   */
  angledCategories?: boolean;
}

/** Below this value a stacked segment is never labelled, however tall it draws. */
const MIN_STACK_LABEL_VALUE = 9;

/** Pixel box a stacked segment needs before its label fits inside. */
const MIN_STACK_LABEL_HEIGHT = 14;
const MIN_STACK_LABEL_WIDTH = 20;

/** Tilt of the category labels, in degrees below the axis. */
const CATEGORY_ANGLE = 32;

/** Share of the plot box the angled labels may take before the text shrinks. */
const CATEGORY_BAND = 0.4;

/** Nominal category font, as a fraction of the chart width (matches `1.1cqi`). */
const CATEGORY_FONT = 0.011;

/** Floor of the same font: below this the axis stops being readable. */
const CATEGORY_FONT_MIN = 0.0065;

/** Advance width of one JetBrains Mono glyph, relative to the font size. */
const MONO_ADVANCE = 0.6;

const RADIANS = (CATEGORY_ANGLE * Math.PI) / 180;

interface AngledTickProps {
  x?: number;
  y?: number;
  fontSize: number;
  payload?: { value?: string | number };
}

/**
 * Category label drawn at `CATEGORY_ANGLE`, in an explicit pixel size so the
 * axis can be measured. Recharts' own `angle` prop keeps the CSS font size,
 * which leaves the tick box and the text free to disagree and spill out of the
 * slide.
 */
function AngledTick({ x, y, fontSize, payload }: AngledTickProps) {
  return (
    <g transform={`translate(${Number(x)}, ${Number(y)})`}>
      <text
        transform={`rotate(-${CATEGORY_ANGLE})`}
        dy={fontSize * 0.8}
        textAnchor="end"
        fontSize={fontSize}
        fill="var(--muted-foreground)"
        className="font-mono"
      >
        {payload?.value}
      </text>
    </g>
  );
}

/**
 * Font size and axis box the angled categories need at the current chart size.
 *
 * The labels are rotated, so a long name eats both height (it descends below
 * the axis) and width (it reaches left past the first bar). Both are derived
 * from the longest label: the text shrinks only once the tilted text no longer
 * fits inside `CATEGORY_BAND` of the plot.
 */
function angledAxisMetrics(labels: string[], width: number, height: number) {
  const longest = labels.reduce((max, label) => Math.max(max, label.length), 0);
  const band = height * CATEGORY_BAND;

  // Largest font whose rotated text still fits the band, capped at the nominal
  // size so short labels are not blown up.
  const fitting = band / (longest * MONO_ADVANCE * Math.sin(RADIANS) + 1.8);
  const fontSize = Math.max(
    width * CATEGORY_FONT_MIN,
    Math.min(width * CATEGORY_FONT, fitting)
  );

  const textWidth = longest * MONO_ADVANCE * fontSize;
  const tickHeight = Math.ceil(textWidth * Math.sin(RADIANS) + fontSize * 1.8);

  // The leftmost label reaches back from its own tick; the Y axis and half a
  // slot already absorb part of that reach, the rest becomes left margin.
  const slot = Math.max(1, (width - Y_AXIS_WIDTH) / Math.max(1, labels.length));
  const overhang = textWidth * Math.cos(RADIANS) - Y_AXIS_WIDTH - slot / 2;
  const marginLeft = Math.round(Math.min(Math.max(overhang, 0), width * 0.12));

  return { fontSize, tickHeight, marginLeft };
}

/** Measures the box the chart is drawn into, so the axis can be sized in pixels. */
function useChartBox() {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;

    const measure = (width: number, height: number) =>
      setBox(current =>
        current.width === width && current.height === height
          ? current
          : { width, height }
      );

    // Measured once up front: a `ResizeObserver` only delivers on a rendering
    // step, so a deck built off-screen — a hidden tab, the PDF pass — would
    // otherwise never get its size and would fall back to unmeasured axes.
    const first = node.getBoundingClientRect();
    measure(first.width, first.height);

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      measure(width, height);
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { ref, box };
}

interface StackLabelProps {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  value?: number | string;
  index?: number;
}

interface GroupedValueLabelProps extends StackLabelProps {
  seriesIndex: number;
  compact: boolean;
}

/**
 * Value above a grouped column, lifted onto a stable level per series.
 * Neighbouring series no longer print their values on the same baseline, and
 * the chart reserves the matching top margin so the highest level is not cut.
 */
function GroupedValueLabel({
  x,
  y,
  width,
  value,
  seriesIndex,
  compact,
}: GroupedValueLabelProps) {
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

  return (
    <text
      x={box.x + box.width / 2}
      y={box.y - 4 - groupedLabelOffset(seriesIndex)}
      textAnchor="middle"
      className={
        compact
          ? "fill-foreground text-[0.75cqi]"
          : "fill-foreground text-[1.1cqi]"
      }
      stroke="var(--background)"
      strokeWidth={2}
      paintOrder="stroke"
    >
      {value}
    </text>
  );
}

/**
 * Stack total, written above the column. Rendered from the topmost series, the
 * only one whose `y` is the top of the whole stack.
 */
function StackTotalLabel({
  x,
  y,
  width,
  index,
  totals,
}: StackLabelProps & { totals: number[] }) {
  const total = totals[Number(index)];
  const box = { x: Number(x), y: Number(y), width: Number(width) };

  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(box.x))
    return null;

  return (
    <text
      x={box.x + box.width / 2}
      y={box.y - 4}
      textAnchor="middle"
      className="fill-foreground text-[1.2cqi] font-medium"
    >
      {total}
    </text>
  );
}

/**
 * Value written inside a stacked segment. Recharts has no built-in position for
 * this that also skips the segments too small to hold text, so the segment box
 * is measured here and the label is dropped when it would not fit.
 *
 * White with a dark outline: the stack palette mixes light and dark fills and a
 * single flat colour is unreadable on half of them.
 */
function StackValueLabel({ x, y, width, height, value }: StackLabelProps) {
  const numeric = Number(value);
  const box = {
    x: Number(x),
    y: Number(y),
    width: Number(width),
    height: Number(height),
  };

  if (!Number.isFinite(numeric) || numeric < MIN_STACK_LABEL_VALUE) return null;
  if (box.height < MIN_STACK_LABEL_HEIGHT || box.width < MIN_STACK_LABEL_WIDTH)
    return null;

  return (
    <text
      x={box.x + box.width / 2}
      y={box.y + box.height / 2}
      textAnchor="middle"
      dominantBaseline="central"
      className="fill-white text-[1.1cqi] font-medium"
      stroke="rgba(0, 0, 0, 0.45)"
      strokeWidth={2}
      paintOrder="stroke"
    >
      {numeric}
    </text>
  );
}

// Recharts inlines its own tick fill, which overrides a Tailwind class and
// leaves the axis unreadable in dark mode. Set the token explicitly.
const AXIS_TICK = {
  fill: "var(--muted-foreground)",
  className: "text-[1.1cqi]",
};

/** Kept in sync with the `<YAxis width>` below; the axis maths needs the number. */
const Y_AXIS_WIDTH = 40;

/**
 * Grouped or stacked bars over an arbitrary category axis: month, year, week or
 * supplier. The weekly variant of the AV deck stays in `WeeklyBarChart`.
 */
export default function CategoryBarChart({
  categoryKey,
  series,
  data,
  stacked = false,
  angledCategories = false,
}: CategoryBarChartProps) {
  const animate = usePresentationAnimation();
  const { ref: chartRef, box } = useChartBox();
  const angledAxis =
    angledCategories && box.width > 0 && box.height > 0
      ? angledAxisMetrics(
          data.map(entry => String(entry[categoryKey] ?? "")),
          box.width,
          box.height
        )
      : null;
  const stackTotals = stacked
    ? data.map(entry =>
        series.reduce((sum, item) => sum + (Number(entry[item.key]) || 0), 0)
      )
    : [];
  const topSeriesKey = series[series.length - 1]?.key;
  const compactGroupedLabels =
    series.length > 1 || data.length > COMPACT_LABELS_FROM;

  return (
    <>
      {/* Wrapping matters once a stack carries ten-plus departments: on a single
          row the long names collide and each item breaks mid-label. */}
      {series.length > 1 && (
        <ul className="flex shrink-0 flex-wrap items-center justify-center gap-x-[1.8cqi] gap-y-[0.5cqi] pb-[0.8cqi] font-mono text-[1.2cqi] text-muted-foreground">
          {series.map(entry => (
            <li
              key={entry.key}
              className="flex items-center gap-[0.6cqi] whitespace-nowrap"
            >
              <span
                aria-hidden="true"
                className="inline-block h-[1.1cqi] w-[1.1cqi] shrink-0 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              {entry.label}
            </li>
          ))}
        </ul>
      )}

      {/* The chart needs its own flexible box: sharing height with the legend
          above collapses ResponsiveContainer to zero. */}
      <div ref={chartRef} className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{
              top: stacked ? 16 : groupedLabelTopMargin(series.length),
              right: 8,
              bottom: angledCategories ? 8 : 0,
              left: angledAxis?.marginLeft ?? 0,
            }}
            barGap={1}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border)"
              vertical={false}
            />
            <XAxis
              dataKey={categoryKey}
              stroke="var(--border)"
              tickLine={false}
              // Spread rather than passing `undefined` per prop: Recharts still
              // relies on defaultProps for `height`, and React 19 no longer
              // fills them in, so an explicit `undefined` reaches the SVG as NaN.
              {...(angledAxis
                ? {
                    interval: 0 as const,
                    tick: <AngledTick fontSize={angledAxis.fontSize} />,
                    height: angledAxis.tickHeight,
                  }
                : { tick: AXIS_TICK })}
            />
            <YAxis
              stroke="var(--border)"
              tick={AXIS_TICK}
              tickLine={false}
              width={40}
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
            {series.map((entry, seriesIndex) => (
              <Bar
                key={entry.key}
                dataKey={entry.key}
                name={entry.label}
                fill={entry.color}
                stackId={stacked ? "stack" : undefined}
                radius={[2, 2, 0, 0]}
                isAnimationActive={animate}
                animationDuration={700}
              >
                {/* An array, not a fragment: Recharts walks the children of a
                    `Bar` with `Children.forEach`, which flattens arrays but
                    steps over fragments, and the labels would never render. */}
                {stacked ? (
                  [
                    <LabelList
                      key="value"
                      dataKey={entry.key}
                      content={<StackValueLabel />}
                    />,
                    entry.key === topSeriesKey ? (
                      <LabelList
                        key="total"
                        dataKey={entry.key}
                        content={<StackTotalLabel totals={stackTotals} />}
                      />
                    ) : null,
                  ]
                ) : (
                  <LabelList
                    dataKey={entry.key}
                    content={
                      <GroupedValueLabel
                        seriesIndex={seriesIndex}
                        compact={compactGroupedLabels}
                      />
                    }
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
