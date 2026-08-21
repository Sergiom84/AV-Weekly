import CategoryBarChart, {
  type CategorySeries,
} from "@/components/deck/CategoryBarChart";
import KpiRow from "@/components/deck/KpiRow";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import {
  monthLabel,
  percent,
  reportMonth,
  reportMonths,
  seriesColor,
  sumBy,
  topEntries,
} from "../aggregate";
import {
  HIC_ASSIGNED,
  HIC_RESOLVED,
  hicScopeLabel,
  hicScopes,
} from "../sources";
import PageShell, { type InformaticaPageProps } from "./PageShell";

interface HicCategoriasPageProps extends InformaticaPageProps {
  dataset: InformaticaDataset;
}

/** Months of the trailing window the columns cover. */
const WINDOW = 12;

/** Categories the breakdown draws before the axis stops being readable. */
const CATEGORY_LIMIT = 12;

/**
 * `2.1.1 Volumetría de Incidencias`: the same `Hic` sheet as the previous page,
 * read the other way round.
 *
 * Left, the main SSCC scope month by month as columns — the last year only, so
 * a grouped bar per month stays wide enough to read. Right, the same volume
 * split by `Categorization Tier 1` for the reported month, which is the pivot
 * the sheet ships and which reconciles exactly with the resolved series next to
 * it.
 *
 * Categories reported as zero are dropped rather than drawn flat: the source
 * pivot lists every catalogue entry every month, and twenty-four ticks of which
 * half are empty is an axis nobody can read.
 */
export default function HicCategoriasPage({
  page,
  editing,
  onChange,
  dataset,
}: HicCategoriasPageProps) {
  const rows = dataset.hic ?? [];
  const scopes = hicScopes(rows);

  const totals = rows.filter(
    row => row.categoria === "" && row.ambito === scopes.main
  );
  const months = reportMonths(dataset, totals, row => row.mes).slice(-WINDOW);
  const month = reportMonth(dataset, totals, row => row.mes);

  const monthlySeries: CategorySeries[] = [HIC_RESOLVED, HIC_ASSIGNED].map(
    (metric, index) => ({
      key: metric,
      label: metric,
      color: seriesColor(index),
    })
  );

  const monthlyData = months.map(target => {
    const entry: Record<string, number | string> = { mes: monthLabel(target) };

    for (const metric of [HIC_RESOLVED, HIC_ASSIGNED]) {
      entry[metric] = totals
        .filter(row => row.mes === target && row.metrica === metric)
        .reduce((sum, row) => sum + row.total, 0);
    }

    return entry;
  });

  const pivotRows = rows.filter(
    row =>
      row.categoria !== "" && row.ambito === scopes.pivot && row.mes === month
  );
  const byCategory = sumBy(
    pivotRows,
    row => row.categoria,
    row => row.total
  );
  const categories = topEntries(byCategory, CATEGORY_LIMIT);

  const categorySeries: CategorySeries[] = [
    { key: "total", label: "Incidencias", color: seriesColor(0) },
  ];
  const categoryData = categories.map(entry => ({
    categoria: entry.label,
    total: entry.value,
  }));

  const monthTotal = Array.from(byCategory.values()).reduce(
    (sum, value) => sum + value,
    0
  );
  const leader = categories[0];
  const suffix = month ? ` ${monthLabel(month)}` : "";

  return (
    <PageShell page={page} editing={editing} onChange={onChange}>
      <KpiRow
        items={[
          {
            label: `${hicScopeLabel(scopes.main ?? "", scopes)}${suffix}`,
            value: monthTotal.toLocaleString("es-ES"),
          },
          {
            label: "Categoría principal",
            value: leader ? leader.label : "",
          },
          {
            label: "Peso de la principal",
            value:
              leader && monthTotal > 0
                ? percent(leader.value / monthTotal)
                : "",
          },
        ]}
      />

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-[1.5cqi]">
        <div className="flex min-h-0 flex-col">
          <p className="shrink-0 pb-[0.4cqi] font-mono text-[1.15cqi] uppercase tracking-wide text-muted-foreground">
            Incidencias por mes
          </p>
          <CategoryBarChart
            categoryKey="mes"
            series={monthlySeries}
            data={monthlyData}
          />
        </div>

        <div className="flex min-h-0 flex-col">
          <p className="shrink-0 pb-[0.4cqi] font-mono text-[1.15cqi] uppercase tracking-wide text-muted-foreground">
            Categorías{suffix}
          </p>
          <CategoryBarChart
            categoryKey="categoria"
            series={categorySeries}
            data={categoryData}
            angledCategories
          />
        </div>
      </div>
    </PageShell>
  );
}
