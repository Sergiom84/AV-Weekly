import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { usePresentationAnimation } from "@/contexts/PresentationAnimationContext";
import { decimal } from "../aggregate";

export interface ScorePoint {
  /** Category label already formatted for the axis, e.g. `Ago 26`. */
  mes: string;
  /** Score of the month, 1 to 5, or `null` when the month reported none. */
  valoracion: number | null;
}

/**
 * Monthly satisfaction bars, the reading the Informática deck publishes and the
 * one the Soporte Oficinas team asked to adopt here.
 *
 * The axis is fixed to 0-5 and not fitted to the data, which is the whole
 * reason this is a chart of its own rather than the shared `CategoryBarChart`.
 * These scores sit at five nearly every month, so an axis fitted to them would
 * stretch a difference of one hundredth into half the plot and print a collapse
 * in satisfaction that never happened. Fixed to the scale of the measure, the
 * bars read as what they are — a flat, very high series — and the value labels
 * carry the variation the heights honestly cannot show.
 *
 * A month with no score is a gap, not a zero: Recharts draws no bar for `null`,
 * and a zero would claim a month rated one out of five.
 */
export default function ScoreBarChart({ data }: { data: ScorePoint[] }) {
  // Every other chart of the deck takes this from the presentation context, and
  // it is not decoration: with the animation left on, Recharts 2 never mounts
  // the value labels. That is why the Informática slide this one copies prints
  // bars with no numbers on them — which on a series pinned at five would leave
  // fifteen identical columns saying nothing.
  const animate = usePresentationAnimation();

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 24, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="mes"
          tickLine={false}
          stroke="var(--border)"
          interval={0}
          tick={{ fill: "var(--muted-foreground)", fontSize: "0.9cqi" }}
        />
        <YAxis
          domain={[0, 5]}
          ticks={[0, 1, 2, 3, 4, 5]}
          tickLine={false}
          stroke="var(--border)"
          tick={{ fill: "var(--muted-foreground)", fontSize: "0.9cqi" }}
          width={28}
        />
        <Bar
          dataKey="valoracion"
          name="Valoración"
          fill="var(--informe-serie-1)"
          radius={[2, 2, 0, 0]}
          isAnimationActive={animate}
          animationDuration={700}
        >
          <LabelList
            dataKey="valoracion"
            position="top"
            formatter={(value: number | null) => decimal(value ?? null)}
            className="fill-foreground text-[.8cqi]"
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
