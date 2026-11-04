import { useMemo, useState } from "react";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { DeckPage, InformeMonthlyDataset } from "@shared/informe";
import {
  DEFAULT_TERRITORIALES_DATA,
  TERRITORIO_COLORS,
  TERRITORIOS_LABELS,
  type TerritorioKey,
} from "@shared/informe";
import EditableText from "@/components/deck/EditableText";
import SlideHeading from "@/components/deck/SlideHeading";
import { usePresentationAnimation } from "@/contexts/PresentationAnimationContext";

interface TerritorialEventsPageProps {
  page: DeckPage;
  monthly: InformeMonthlyDataset;
  editing: boolean;
  onChange: (patch: Partial<DeckPage>) => void;
}

interface CustomPieLabelProps {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  value?: number;
  name?: string;
}

const RADIAN = Math.PI / 180;

function renderCustomizedLabel({
  cx = 0,
  cy = 0,
  midAngle = 0,
  innerRadius = 0,
  outerRadius = 0,
  value = 0,
}: CustomPieLabelProps) {
  if (value <= 0) return null;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill="#ffffff"
      textAnchor="middle"
      dominantBaseline="central"
      className="font-mono text-[1.1cqi] font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
    >
      {value}
    </text>
  );
}

export default function TerritorialEventsPage({
  page,
  monthly,
  editing,
  onChange,
}: TerritorialEventsPageProps) {
  const animate = usePresentationAnimation();
  const setSlot = (key: string) => (value: string) =>
    onChange({ text: { ...page.text, [key]: value } });

  const territorialesData =
    monthly.territoriales ?? DEFAULT_TERRITORIALES_DATA;

  const meses = territorialesData.meses ?? DEFAULT_TERRITORIALES_DATA.meses;
  const totales = territorialesData.totales ?? DEFAULT_TERRITORIALES_DATA.totales;

  // Initial month is the last non-empty month (e.g. Octubre)
  const defaultMonth =
    territorialesData.mesActual ||
    DEFAULT_TERRITORIALES_DATA.mesActual ||
    "Octubre";

  const [selectedMonth, setSelectedMonth] = useState<string>(defaultMonth);

  // Totals pie data (only show territories with > 0 values)
  const pieData = useMemo(() => {
    return TERRITORIOS_LABELS.map((dt) => ({
      name: dt,
      value: totales[dt] ?? 0,
      color: TERRITORIO_COLORS[dt] ?? "#94A3B8",
    })).filter((entry) => entry.value > 0);
  }, [totales]);

  const totalEventos = totales.Total ?? totales.total ?? pieData.reduce((acc, it) => acc + it.value, 0);

  // Month data row for the small table
  const currentMonthRow = useMemo(() => {
    const found = meses.find(
      (m) => m.mes.toLowerCase() === selectedMonth.toLowerCase()
    );
    if (found) return found;
    return (
      meses[meses.length - 1] ?? {
        mes: selectedMonth,
        galicia: 0,
        norte: 0,
        cataluna: 0,
        este: 0,
        sur: 0,
        gc: 0,
        centro: 0,
        total: 0,
      }
    );
  }, [meses, selectedMonth]);

  // Body text: custom override takes precedence, fallback to sheet summary or default
  const bodyText =
    page.text.body ||
    territorialesData.resumen ||
    DEFAULT_TERRITORIALES_DATA.resumen;

  return (
    <div className="@container flex h-full w-full flex-col text-foreground">
      <SlideHeading
        service={page.text.subtitle ?? "AUDIOVISUALES"}
        title={page.text.title ?? "2.1 Territoriales"}
        editing={editing}
        onServiceChange={setSlot("subtitle")}
        onTitleChange={setSlot("title")}
      />

      <div className="mt-[1.2cqi] grid min-h-0 flex-1 grid-cols-12 gap-[1.5cqi]">
        {/* Left Column: Chart (60% width = col-span-7) */}
        <section
          aria-label="Gráfica de distribución por territoriales"
          className="col-span-7 flex min-h-0 flex-col rounded-lg border border-border/50 bg-card/40 p-[1.5cqi] shadow-sm"
        >
          <div className="mb-[0.5cqi] flex items-center justify-between">
            <span className="font-mono text-[1.1cqi] uppercase tracking-wider text-muted-foreground">
              Distribución territorial (Acumulado)
            </span>
            <span className="font-mono text-[1.1cqi] font-medium text-foreground">
              Total: {totalEventos}
            </span>
          </div>

          <div className="relative min-h-0 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                <Pie
                  data={pieData}
                  cx="48%"
                  cy="50%"
                  outerRadius="85%"
                  innerRadius="35%"
                  dataKey="value"
                  nameKey="name"
                  labelLine={false}
                  label={renderCustomizedLabel}
                  isAnimationActive={animate}
                  stroke="var(--card)"
                  strokeWidth={2}
                >
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val: number, name: string) => [
                    `${val} eventos (${((val / (totalEventos || 1)) * 100).toFixed(1)} %)`,
                    name,
                  ]}
                  contentStyle={{
                    backgroundColor: "var(--background)",
                    borderColor: "var(--border)",
                    borderRadius: "6px",
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.85rem",
                  }}
                />
                <Legend
                  layout="vertical"
                  align="right"
                  verticalAlign="middle"
                  iconType="circle"
                  iconSize={10}
                  wrapperStyle={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.85cqi",
                    paddingLeft: "10px",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Right Column: Resumen mensual + Pequeña tabla (40% width = col-span-5) */}
        <section
          aria-label="Resumen mensual y desglose por territoriales"
          className="col-span-5 flex min-h-0 flex-col justify-between gap-[1.2cqi]"
        >
          {/* Top card: Resumen mensual */}
          <div className="flex flex-1 flex-col rounded-lg border border-border/50 bg-card/40 p-[1.5cqi] shadow-sm">
            <div className="mb-[0.8cqi] flex items-center justify-between border-b border-border/40 pb-[0.4cqi]">
              <span className="font-mono text-[1.1cqi] uppercase tracking-wider text-muted-foreground">
                Actuaciones destacadas
              </span>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden font-mono text-[1.05cqi] leading-relaxed text-foreground">
              {editing ? (
                <EditableText
                  value={bodyText}
                  ariaLabel="Resumen mensual de actuaciones destacadas"
                  editing={editing}
                  onChange={setSlot("body")}
                  multiline
                  className="h-full w-full rounded border border-border/80 bg-background/80 p-2 font-mono text-[1.05cqi]"
                />
              ) : (
                <div className="flex h-full flex-col justify-center space-y-[0.6cqi] whitespace-pre-line">
                  {bodyText}
                </div>
              )}
            </div>
          </div>

          {/* Bottom card: Pequeña tabla con mes actual y territorios */}
          <div className="flex shrink-0 flex-col rounded-lg border border-border/50 bg-card/40 p-[1.2cqi] shadow-sm">
            <div className="mb-[0.6cqi] flex items-center justify-between">
              <span className="font-mono text-[1.05cqi] uppercase tracking-wider text-muted-foreground">
                Mes actual ({currentMonthRow.mes})
              </span>
              {editing && (
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="rounded border border-border bg-background px-2 py-0.5 font-mono text-[0.85cqi]"
                  aria-label="Seleccionar mes para la tabla"
                >
                  {meses.map((m) => (
                    <option key={m.mes} value={m.mes}>
                      {m.mes}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse font-mono text-[0.9cqi]">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/30 text-muted-foreground">
                    <th className="px-1.5 py-1 text-left font-normal">Mes</th>
                    <th className="px-1.5 py-1 text-center font-normal">Galicia</th>
                    <th className="px-1.5 py-1 text-center font-normal">Norte</th>
                    <th className="px-1.5 py-1 text-center font-normal">Cat.</th>
                    <th className="px-1.5 py-1 text-center font-normal">Sur</th>
                    <th className="px-1.5 py-1 text-center font-normal">GC</th>
                    <th className="px-1.5 py-1 text-center font-normal">Centro</th>
                    <th className="bg-primary/10 px-2 py-1 text-center font-semibold text-foreground">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/30">
                    <td className="px-1.5 py-1.5 font-medium text-foreground">
                      {currentMonthRow.mes}
                    </td>
                    <td className="px-1.5 py-1.5 text-center text-foreground">
                      {currentMonthRow.galicia}
                    </td>
                    <td className="px-1.5 py-1.5 text-center text-foreground">
                      {currentMonthRow.norte}
                    </td>
                    <td className="px-1.5 py-1.5 text-center text-foreground">
                      {currentMonthRow.cataluna}
                    </td>
                    <td className="px-1.5 py-1.5 text-center text-foreground">
                      {currentMonthRow.sur}
                    </td>
                    <td className="px-1.5 py-1.5 text-center text-foreground">
                      {currentMonthRow.gc}
                    </td>
                    <td className="px-1.5 py-1.5 text-center text-foreground">
                      {currentMonthRow.centro}
                    </td>
                    <td className="bg-primary/10 px-2 py-1.5 text-center font-bold text-primary">
                      {currentMonthRow.total}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
