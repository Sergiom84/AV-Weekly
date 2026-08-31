import CategoryBarChart, {
  type CategorySeries,
} from "@/components/deck/CategoryBarChart";
import MonthRangeSelector from "@/components/deck/MonthRangeSelector";
import RowFilterPanel from "@/components/deck/RowFilterPanel";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import {
  defaultMonthWindow,
  resolveMonthSelection,
} from "@shared/deck/core";
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
 *
 * Drawn as grouped columns with `CategoryBarChart`, the same component the two
 * 2.1.1 slides use. The reference is a line chart, but inside this deck the
 * block reads as one chart repeated with different series, and a lone line
 * chart in the middle of it looks like a different report.
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
  const series: CategorySeries[] = top.map((entry, index) => ({
    key: entry.label,
    label: entry.label,
    color: seriesColor(index),
  }));

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
        className="flex min-h-0 flex-1 flex-col"
        aria-label="Evolución mensual de las cinco principales categorías de incidencias"
      >
        <CategoryBarChart
          categoryKey="mes"
          series={series}
          data={data}
          fitGroupedValueLabels
          centerGroupedValueLabels
          allCategories
        />
      </section>
    </PageShell>
  );
}
