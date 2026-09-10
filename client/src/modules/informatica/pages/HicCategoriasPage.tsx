import CategoryBarChart, {
  type CategorySeries,
} from "@/components/deck/CategoryBarChart";
import EditableText from "@/components/deck/EditableText";
import MonthRangeSelector from "@/components/deck/MonthRangeSelector";
import RowFilterPanel from "@/components/deck/RowFilterPanel";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import {
  defaultMonthWindow,
  resolveMonthSelection,
} from "@shared/deck/core";
import KpiRow from "@/components/deck/KpiRow";
import { monthLabel, uniqueSorted } from "../aggregate";
import { componentSeriesColor } from "../palette";
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
const HIC_METRICS = [HIC_ASSIGNED, HIC_ASSIGNMENTS, HIC_RESOLVED];
const MIGRATION_NOTE =
  "En los meses de septiembre a noviembre de 2025 se aprecia un volumen elevado de incidencias asociado a la migración a W11.";

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
  const months = resolveMonthSelection(monthSelection, availableMonths);
  const month = months[months.length - 1] ?? null;
  const hiddenRows = page.hiddenRows ?? [];

  const monthlySeries: CategorySeries[] = HIC_METRICS.filter(
    metric => !hiddenRows.includes(metric)
  ).map((metric, index, list) => ({
    key: metric,
    label: metric,
    color: componentSeriesColor(index, list.length),
  }));

  const monthlyData = months.map(target => {
    const entry: Record<string, number | string> = { mes: monthLabel(target) };

    for (const metric of HIC_METRICS) {
      entry[metric] = totals
        .filter(row => row.mes === target && row.metrica === metric)
        .reduce((sum, row) => sum + row.total, 0);
    }

    return entry;
  });
  const note = page.text.footnote || MIGRATION_NOTE;

  const suffix = month ? ` ${monthLabel(month)}` : "";
  const latest = monthlyData[monthlyData.length - 1];
  const kpiItems = monthlySeries.map(entry => ({
    label: entry.label,
    value: Number(latest?.[entry.key] ?? 0).toLocaleString("es-ES"),
    accent: entry.color,
  }));

  return (
    <PageShell
      page={page}
      editing={editing}
      onChange={onChange}
      hideFootnote
      editor={
        editing && (
          <>
            <MonthRangeSelector
              selection={monthSelection}
              available={availableMonths}
              format={monthLabel}
              onChange={monthSelection => onChange({ monthSelection })}
            />

            <RowFilterPanel
              labels={[...HIC_METRICS]}
              hiddenRows={hiddenRows}
              scope={page.id}
              defaultHidden={[]}
              onChange={hiddenRows => onChange({ hiddenRows })}
            />
          </>
        )
      }
    >
      <KpiRow compact items={kpiItems} />

      <section className="flex min-h-0 flex-1 flex-col" aria-label="Volumen operativo mensual">
        <h3 className="shrink-0 pb-[0.7cqi] font-mono text-[1.35cqi] font-medium text-muted-foreground">
          Volumen Operativo Mensual: Abiertas, Reasignaciones y Resueltas{suffix ? ` · hasta${suffix}` : ""}
        </h3>
        {monthlySeries.length > 0 && (
          <CategoryBarChart
            categoryKey="mes"
            series={monthlySeries}
            data={monthlyData}
            fitGroupedValueLabels
            centerGroupedValueLabels
            allCategories
          />
        )}
      </section>
      <p className="shrink-0 border border-border bg-muted/30 px-[1.2cqi] py-[0.75cqi] text-center font-mono text-[1.2cqi] leading-snug text-muted-foreground">
        <EditableText
          value={note}
          onChange={value =>
            onChange({ text: { ...page.text, footnote: value } })
          }
          editing={editing}
          multiline
          ariaLabel="Nota del volumen operativo"
          className="block w-full text-center"
        />
      </p>
    </PageShell>
  );
}
