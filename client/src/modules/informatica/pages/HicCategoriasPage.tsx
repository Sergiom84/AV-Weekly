import CategoryBarChart, {
  type CategorySeries,
} from "@/components/deck/CategoryBarChart";
import MonthRangeSelector from "@/components/deck/MonthRangeSelector";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import {
  defaultMonthWindow,
  resolveMonthSelection,
} from "@shared/deck/core";
import { monthLabel, seriesColor, uniqueSorted } from "../aggregate";
import { HIC_ASSIGNED, HIC_RESOLVED } from "../sources";
import PageShell, { type InformaticaPageProps } from "./PageShell";

interface HicCategoriasPageProps extends InformaticaPageProps {
  dataset: InformaticaDataset;
}

/**
 * Months of the trailing window the columns cover.
 *
 * Fourteen is the width of the block the clean workbook keeps for this slide,
 * and with the current extract it resolves to 2025/07–2026/08 — the exact range
 * of the reference chart. It also lands past 2025/05, the month HIC only covers
 * from the 12th, so the partial figure never reaches the axis.
 */
const WINDOW = 14;

const HIC_ASSIGNMENTS = "Asignaciones";

/**
 * `2.1.1 Volumetría de Incidencias`: the same `Hic` sheet as the previous page,
 * read the other way round.
 *
 * The presentation's second 2.1.1 slide is the operational monthly series:
 * assigned, assignments and resolved. It deliberately does not reuse the
 * category pivot from the combined slide: these three signed-off indicators
 * are a different source shape within HIC.
 *
 * All three add up both HIC scopes, for the same reason the combined slide does:
 * the workbook splits the figures into `3-3` (BBVA) and `4-4` (BBVA TECH) and
 * publishes the sum. Its own history block proves it, reporting `OnSite`,
 * `BBVAIT` and a total row that is the addition of the two.
 *
 * Like the combined slide it publishes the month in flight, which is what the
 * reference does and what the report is about.
 */
export default function HicCategoriasPage({
  page,
  editing,
  onChange,
  dataset,
}: HicCategoriasPageProps) {
  const rows = dataset.hic ?? [];
  const totals = rows.filter(row => row.categoria === "");
  const availableMonths = uniqueSorted(totals.map(row => row.mes));
  // `defaultMonthSelection` pins a single month — `from` and `to` are the same —
  // which on a monthly series collapses the chart to one column. The default
  // here is the window the slide is about; an editor's saved range still wins.
  const monthSelection = page.monthSelection ?? defaultMonthWindow(WINDOW);
  const months = resolveMonthSelection(monthSelection, availableMonths).slice(
    -WINDOW
  );
  const month = months[months.length - 1] ?? null;

  const monthlySeries: CategorySeries[] = [
    HIC_ASSIGNED,
    HIC_ASSIGNMENTS,
    HIC_RESOLVED,
  ].map(
    (metric, index) => ({
      key: metric,
      label: metric,
      color: seriesColor(index),
    })
  );

  const monthlyData = months.map(target => {
    const entry: Record<string, number | string> = { mes: monthLabel(target) };

    for (const metric of [HIC_ASSIGNED, HIC_ASSIGNMENTS, HIC_RESOLVED]) {
      entry[metric] = totals
        .filter(row => row.mes === target && row.metrica === metric)
        .reduce((sum, row) => sum + row.total, 0);
    }

    return entry;
  });

  const suffix = month ? ` ${monthLabel(month)}` : "";

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
      <section className="flex min-h-0 flex-1 flex-col" aria-label="Volumen operativo mensual">
        <h3 className="shrink-0 pb-[0.7cqi] font-mono text-[1.35cqi] font-medium text-muted-foreground">
          Volumen Operativo Mensual: Abiertas, Reasignaciones y Resueltas{suffix ? ` · hasta${suffix}` : ""}
        </h3>
        <CategoryBarChart
          categoryKey="mes"
          series={monthlySeries}
          data={monthlyData}
          fitGroupedValueLabels
          centerGroupedValueLabels
        />
      </section>
      <p className="shrink-0 border border-border bg-muted/30 px-[1.2cqi] py-[0.75cqi] text-center font-mono text-[1.2cqi] leading-snug text-muted-foreground">
        En los meses de septiembre a noviembre de 2025 se aprecia un volumen elevado de incidencias asociado a la migración a W11.
      </p>
    </PageShell>
  );
}
