import MatrixTable, { type MatrixRow } from "@/components/deck/MatrixTable";
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
import {
  monthLabel,
  pivot,
  reportMonth,
  reportMonths,
  seriesColor,
  sumBy,
  topEntries,
} from "../aggregate";
import { comparativaViews } from "../sources";
import PageShell, { type InformaticaPageProps } from "./PageShell";

interface TopTenIncidenciasPageProps extends InformaticaPageProps {
  dataset: InformaticaDataset;
}

interface ComparisonView {
  view: string;
  label: string;
  rows: MatrixRow[];
}

/** The "ten" of the title: rows kept per view, ranked by the latest month. */
const TOP = 10;

const DETAIL_ORDER = ["Portátil", "Software", "Sistema Operativo"];

const AXIS_TICK = {
  fill: "var(--muted-foreground)",
  className: "text-[1cqi] font-mono",
};

/** Components comparison as horizontal bars, with one series per month. */
function ComponentsChart({
  rows,
  columns,
}: {
  rows: MatrixRow[];
  columns: string[];
}) {
  const animate = usePresentationAnimation();
  const data = rows.map(row => ({
    componente: row.label,
    ...Object.fromEntries(
      columns.map((column, index) => [column, row.values[index] ?? 0])
    ),
  }));

  return (
    <div
      className="min-h-0 flex-1"
      role="img"
      aria-label="Comparativa mensual de componentes"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 36, bottom: 4, left: 8 }}
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
            tick={AXIS_TICK}
            tickLine={false}
            width={138}
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
              fill={seriesColor(index)}
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
  const rows = dataset.comparativas ?? [];
  const views = comparativaViews(rows);
  const months = reportMonths(dataset, rows, row => row.mes);
  const columns = months.map(monthLabel);
  const ranked = reportMonth(dataset, rows, row => row.mes);

  const tables: ComparisonView[] = views.map(({ view, label }) => {
    const viewRows = rows.filter(
      row => row.vista === view && months.includes(row.mes)
    );
    const ranking = topEntries(
      sumBy(
        viewRows.filter(row => row.mes === ranked),
        row => row.elemento,
        row => row.total
      ),
      TOP
    ).map(entry => entry.label);
    const order =
      ranking.length > 0
        ? ranking
        : topEntries(
            sumBy(
              viewRows,
              row => row.elemento,
              row => row.total
            ),
            TOP
          ).map(entry => entry.label);
    const matrix = pivot(
      viewRows,
      row => row.elemento,
      row => row.mes,
      row => row.total,
      { columns: months, rowOrder: order }
    );

    return { view, label, rows: matrix.rows };
  });

  const components = tables.find(table => table.label === "Componentes");
  const detailTables = DETAIL_ORDER.map(label =>
    tables.find(table => table.label === label)
  ).filter((table): table is ComparisonView => Boolean(table));

  return (
    <PageShell page={page} editing={editing} onChange={onChange}>
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-[1.7cqi]">
        <div className="flex min-h-0 flex-col">
          {components && (
            <ComponentsChart rows={components.rows} columns={columns} />
          )}
        </div>

        <div className="grid min-h-0 grid-rows-3 gap-[0.7cqi]">
          {detailTables.map(table => (
            <section key={table.view} className="flex min-h-0 flex-col">
              <h3 className="shrink-0 pb-[0.25cqi] font-mono text-[1.05cqi] uppercase tracking-wide text-muted-foreground">
                {table.label}
              </h3>
              <div className="min-h-0 flex-1 overflow-hidden">
                <MatrixTable
                  rowHeader="Componente"
                  columns={columns}
                  rows={table.rows}
                  rowTotals={false}
                />
              </div>
            </section>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
