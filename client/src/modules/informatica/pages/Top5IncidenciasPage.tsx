import MonthRangeSelector from "@/components/deck/MonthRangeSelector";
import RowFilterPanel from "@/components/deck/RowFilterPanel";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import { usePresentationAnimation } from "@/contexts/PresentationAnimationContext";
import {
  defaultMonthWindow,
  resolveMonthSelection,
} from "@shared/deck/core";
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
import { monthLabel, seriesColor, sumBy, topEntries, uniqueSorted } from "../aggregate";
import PageShell, { type InformaticaPageProps } from "./PageShell";

interface Top5IncidenciasPageProps extends InformaticaPageProps {
  dataset: InformaticaDataset;
}

const TOP = 5;

/** Months of the trailing window, the same one the rest of the 2.1 block uses. */
const WINDOW = 14;

/**
 * `2.1.2 Top 5 de incidencias`: the five categories with most incidents, shown
 * as their monthly evolution. The reference slide is a trend, not a
 * single-month ranking: the ranking only chooses which five series are drawn.
 *
 * The source is the HIC pivot by `Categorization Tier 1` — the `hic` rows that
 * carry a `categoria` — and not the `incidencias` detail. They are not
 * interchangeable: the pivot is the signed-off monthly breakdown that
 * reconciles against the totals of the 2.1.1 slides, while `incidencias`
 * reports the same months without a category tree at all.
 *
 * Series are ranked by their total over the window rather than by the last
 * month, so the in-flight month — cut at the extraction date, and therefore a
 * fraction of a real one — cannot reorder the legend or swap a series out.
 */
export default function Top5IncidenciasPage({
  page,
  editing,
  onChange,
  dataset,
}: Top5IncidenciasPageProps) {
  const rows = (dataset.hic ?? []).filter(row => row.categoria !== "");
  const availableMonths = uniqueSorted(rows.map(row => row.mes));
  const monthSelection = page.monthSelection ?? defaultMonthWindow(WINDOW);
  const months = resolveMonthSelection(monthSelection, availableMonths).slice(
    -WINDOW
  );
  const drawn = new Set(months);

  const byCategory = sumBy(
    rows.filter(row => drawn.has(row.mes)),
    row => row.categoria,
    row => row.total
  );
  const allTop = topEntries(byCategory, TOP);
  const hiddenRows = page.hiddenRows ?? [];
  const top = allTop.filter(entry => !hiddenRows.includes(entry.label));

  const data = months.map(target => {
    const values = sumBy(
      rows.filter(row => row.mes === target),
      row => row.categoria,
      row => row.total
    );

    return {
      mes: monthLabel(target),
      ...Object.fromEntries(top.map(entry => [entry.label, values.get(entry.label) ?? 0])),
    };
  });
  const animate = usePresentationAnimation();

  return (
    <PageShell page={page} editing={editing} onChange={onChange}>
      {editing && (
        <MonthRangeSelector
          selection={monthSelection}
          available={availableMonths}
          format={monthLabel}
          onChange={monthSelection => onChange({ monthSelection })}
        />
      )}
      {editing && (
        <RowFilterPanel
          labels={allTop.map(entry => entry.label)}
          hiddenRows={hiddenRows}
          scope={page.id}
          defaultHidden={[]}
          onChange={hiddenRows => onChange({ hiddenRows })}
        />
      )}

      <section
        className="min-h-0 flex-1 border border-border/70 px-[0.7cqi] py-[0.5cqi]"
        role="img"
        aria-label="Evolución mensual de las cinco principales categorías de incidencias"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 24, right: 16, bottom: 6, left: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="mes"
              tickLine={false}
              stroke="var(--border)"
              tick={{ fill: "var(--muted-foreground)", fontSize: "1cqi" }}
            />
            <YAxis
              tickLine={false}
              stroke="var(--border)"
              tick={{ fill: "var(--muted-foreground)", fontSize: "1cqi" }}
              width={36}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--popover)",
                color: "var(--popover-foreground)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                fontSize: "1cqi",
              }}
            />
            <Legend
              verticalAlign="top"
              wrapperStyle={{ fontFamily: "JetBrains Mono, monospace", fontSize: "1cqi" }}
            />
            {top.map((entry, index) => (
              <Line
                key={entry.label}
                type="linear"
                dataKey={entry.label}
                name={entry.label}
                stroke={seriesColor(index)}
                strokeWidth={2}
                dot={{ r: 3, fill: seriesColor(index) }}
                activeDot={{ r: 4 }}
                isAnimationActive={animate}
                animationDuration={700}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </section>
    </PageShell>
  );
}
