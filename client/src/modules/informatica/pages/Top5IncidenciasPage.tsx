import MonthRangeSelector from "@/components/deck/MonthRangeSelector";
import RowFilterPanel from "@/components/deck/RowFilterPanel";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import { usePresentationAnimation } from "@/contexts/PresentationAnimationContext";
import {
  defaultMonthSelection,
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
import { monthLabel, reportMonth, seriesColor, sumBy, topEntries } from "../aggregate";
import PageShell, { type InformaticaPageProps } from "./PageShell";

interface Top5IncidenciasPageProps extends InformaticaPageProps {
  dataset: InformaticaDataset;
}

/** Metric the ranking counts. Assigned tickets are a workload, not a volume. */
const METRIC = "Resueltas";

const TOP = 5;

/**
 * `2.1.2 Top 5 de incidencias`: the five categories that resolved most tickets
 * in the reported month, shown as their monthly evolution. The reference slide
 * is a trend, not a single-month ranking: ranking chooses the five series and
 * the complete selected range is retained on the chart.
 *
 * Grouped by `Categoria`, not `Subcategoria`, because that is the level the
 * original slide ranks — five names against the two hundred-odd subcategories
 * the catalogue carries, which no top five would summarise. The subcategory
 * detail is kept as the caption of each bar so the slide still answers "of
 * what", which is the first question a category name raises.
 */
export default function Top5IncidenciasPage({
  page,
  editing,
  onChange,
  dataset,
}: Top5IncidenciasPageProps) {
  const rows = (dataset.incidencias ?? []).filter(
    row => row.metrica === METRIC
  );
  const availableMonths = Array.from(new Set(rows.map(row => row.mes))).sort();
  const monthSelection =
    page.monthSelection ??
    defaultMonthSelection(
      reportMonth(dataset, rows, row => row.mes) ??
        availableMonths[availableMonths.length - 1] ??
        ""
    );
  const months = resolveMonthSelection(monthSelection, availableMonths);
  const month = months[months.length - 1] ?? null;
  const current = rows.filter(row => row.mes === month);

  const byCategory = sumBy(
    current,
    row => row.categoria,
    row => row.tickets
  );
  const allTop = topEntries(byCategory, TOP);
  const hiddenRows = page.hiddenRows ?? [];
  const top = allTop.filter(entry => !hiddenRows.includes(entry.label));

  const data = months.map(target => {
    const values = sumBy(
      rows.filter(row => row.mes === target),
      row => row.categoria,
      row => row.tickets
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
