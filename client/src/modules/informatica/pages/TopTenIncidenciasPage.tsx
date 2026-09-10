import { useLayoutEffect, useRef, useState } from "react";
import type { MatrixRow } from "@/components/deck/MatrixTable";
import RowFilterPanel from "@/components/deck/RowFilterPanel";
import { usePresentationAnimation } from "@/contexts/PresentationAnimationContext";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import KpiRow from "@/components/deck/KpiRow";
import { topTenComparison } from "../aggregate";
import { topTenMonthColor } from "../palette";
import PageShell, { type InformaticaPageProps } from "./PageShell";

interface TopTenIncidenciasPageProps extends InformaticaPageProps {
  dataset: InformaticaDataset;
}

function DetailTable({
  label,
  columns,
  rows,
}: {
  label: string;
  columns: string[];
  rows: MatrixRow[];
}) {
  const totals = columns.map((_, index) =>
    rows.reduce((sum, row) => sum + (row.values[index] ?? 0), 0)
  );
  const gridTemplateColumns = `minmax(0, 2.4fr) repeat(${columns.length}, minmax(0, 0.85fr))`;

  return (
    <section className="flex min-h-0 flex-col" aria-label={label} lang="es">
      <h3 className="mb-[0.12cqi] shrink-0 font-mono text-[1.05cqi] uppercase leading-none tracking-wide text-muted-foreground">
        {label}
      </h3>
      <div
        className="flex min-h-0 flex-col overflow-hidden font-mono text-[0.78cqi] leading-snug tabular-nums"
        role="table"
      >
        <div
          className="grid shrink-0 border-b border-border py-[0.12cqi] text-muted-foreground"
          style={{ gridTemplateColumns }}
          role="row"
        >
          <span className="pr-[0.4cqi] text-left" role="columnheader">
            Componente
          </span>
          {columns.map(column => (
            <span key={column} className="text-center" role="columnheader">
              {column}
            </span>
          ))}
        </div>

        <div className="min-h-0 overflow-hidden" role="rowgroup">
          {rows.map(row => (
            <div
              key={row.label}
              className="grid min-h-[1.15cqi] items-center border-b border-border/60 py-[0.12cqi]"
              style={{ gridTemplateColumns }}
              role="row"
            >
              <span
                className="hyphens-auto pr-[0.4cqi] text-left break-words [overflow-wrap:break-word]"
                role="rowheader"
                title={row.label}
              >
                {row.label}
              </span>
              {columns.map((column, index) => (
                <span key={column} className="whitespace-nowrap text-center" role="cell">
                  {row.values[index] || ""}
                </span>
              ))}
            </div>
          ))}
        </div>

        <div
          className="grid shrink-0 bg-[var(--informe-serie-4)] py-[0.28cqi] font-medium text-white underline decoration-white/80 underline-offset-[0.18cqi]"
          style={{ gridTemplateColumns }}
          role="row"
        >
          <span className="pr-[0.4cqi] text-left" role="rowheader">
            Total
          </span>
          {totals.map((total, index) => (
            <span
              key={columns[index]}
              className="whitespace-nowrap text-center"
              role="cell"
            >
              {total || ""}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

const AXIS_TICK = {
  fill: "var(--muted-foreground)",
  className: "text-[0.85cqi] font-mono",
};

function CategoryTick({
  x,
  y,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value?: string | number };
}) {
  return (
    <text
      x={x}
      y={y}
      dy="0.32em"
      textAnchor="end"
      fill="var(--muted-foreground)"
      className="font-mono text-[0.82cqi]"
    >
      {payload?.value}
    </text>
  );
}

function yAxisWidthFor(labels: string[], chartWidth: number): number {
  const longest = labels.reduce((max, label) => Math.max(max, label.length), 0);
  const char = Math.max(5.4, chartWidth * 0.0085 * 0.62);
  const wanted = Math.ceil(longest * char + 12);
  const cap = Math.round(chartWidth * 0.4);
  return Math.min(Math.max(wanted, 108), Math.max(108, cap));
}

/** Components comparison as horizontal bars, with one series per month. */
function ComponentsChart({
  rows,
  columns,
}: {
  rows: MatrixRow[];
  columns: string[];
}) {
  const animate = usePresentationAnimation();
  const boxRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(0);
  const data = rows.map(row => ({
    componente: row.label,
    ...Object.fromEntries(
      columns.map((column, index) => [column, row.values[index] ?? 0])
    ),
  }));
  const yAxisWidth =
    chartWidth > 0
      ? yAxisWidthFor(
          rows.map(row => row.label),
          chartWidth
        )
      : 168;

  useLayoutEffect(() => {
    const node = boxRef.current;
    if (!node) return;
    const measure = () => {
      const width = node.getBoundingClientRect().width;
      setChartWidth(current => (current === width ? current : width));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={boxRef}
      className="min-h-0 flex-1"
      role="img"
      aria-label="Comparativa mensual de componentes"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 36, bottom: 4, left: 4 }}
          barGap={1}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            horizontal={false}
          />
          <XAxis
            type="number"
            stroke="var(--border)"
            tick={AXIS_TICK}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="componente"
            stroke="var(--border)"
            tick={<CategoryTick />}
            tickLine={false}
            interval={0}
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
          <Legend
            wrapperStyle={{
              color: "var(--muted-foreground)",
              fontFamily: "JetBrains Mono, monospace",
              fontSize: "1.05cqi",
            }}
          />
          {columns.map((column, index) => (
            <Bar
              key={column}
              dataKey={column}
              name={column}
              fill={topTenMonthColor(column, index, columns.length)}
              radius={[0, 2, 2, 0]}
              isAnimationActive={animate}
              animationDuration={700}
            >
              <LabelList
                dataKey={column}
                position="right"
                className="fill-foreground text-[0.9cqi]"
              />
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * `2.1.3 Top Ten incidencias SSCC`: components as the primary chart on the
 * left, with the three requested detail tables on the right.
 */
export default function TopTenIncidenciasPage({
  page,
  editing,
  onChange,
  dataset,
}: TopTenIncidenciasPageProps) {
  const { columns, components, details } = topTenComparison(dataset);
  const componentLabels = components?.rows.map(row => row.label) ?? [];
  const hiddenRows = page.hiddenRows ?? [];
  const visibleRows = components
    ? components.rows.filter(row => !hiddenRows.includes(row.label))
    : [];
  const monthTotals = columns.map((column, index) =>
    visibleRows.reduce((sum, row) => sum + (row.values[index] ?? 0), 0)
  );

  return (
    <PageShell
      page={page}
      editing={editing}
      onChange={onChange}
      editor={
        editing && (
          <RowFilterPanel
            labels={componentLabels}
            hiddenRows={hiddenRows}
            scope={page.id}
            defaultHidden={[]}
            onChange={hiddenRows => onChange({ hiddenRows })}
          />
        )
      }
    >
      <KpiRow
        compact
        items={columns.map((column, index) => ({
          label: column,
          value: monthTotals[index].toLocaleString("es-ES"),
          accent: topTenMonthColor(column, index, columns.length),
        }))}
      />

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.22fr)_minmax(0,0.78fr)] gap-[1.4cqi]">
        <div className="flex min-h-0 flex-col">
          {visibleRows.length > 0 && (
            <ComponentsChart rows={visibleRows} columns={columns} />
          )}
        </div>

        <div className="flex min-h-0 flex-col justify-start gap-[1.7cqi]">
          {details.map(table => (
            <DetailTable
              key={table.view}
              label={table.label}
              columns={columns}
              rows={table.rows}
            />
          ))}
        </div>
      </div>
    </PageShell>
  );
}
