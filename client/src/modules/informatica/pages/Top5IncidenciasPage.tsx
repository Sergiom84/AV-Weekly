import CategoryBarChart, {
  type CategorySeries,
} from "@/components/deck/CategoryBarChart";
import KpiRow from "@/components/deck/KpiRow";
import type { InformaticaDataset } from "@shared/modules/informatica/types";
import {
  monthLabel,
  percent,
  reportMonth,
  seriesColor,
  sumBy,
  topEntries,
} from "../aggregate";
import PageShell, { type InformaticaPageProps } from "./PageShell";

interface Top5IncidenciasPageProps extends InformaticaPageProps {
  dataset: InformaticaDataset;
}

/** Metric the ranking counts. Assigned tickets are a workload, not a volume. */
const METRIC = "Resueltas";

const TOP = 5;

/**
 * `2.1.2 Top 5 de incidencias`: the five categories that resolved most tickets
 * in the reported month, with the subcategory that leads each one underneath.
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
    (row) => row.metrica === METRIC
  );
  const month = reportMonth(dataset, rows, (row) => row.mes);
  const current = rows.filter((row) => row.mes === month);

  const byCategory = sumBy(
    current,
    (row) => row.categoria,
    (row) => row.tickets
  );
  const top = topEntries(byCategory, TOP);

  const monthTotal = Array.from(byCategory.values()).reduce(
    (sum, value) => sum + value,
    0
  );
  const topTotal = top.reduce((sum, entry) => sum + entry.value, 0);

  const leadingSubcategory = (category: string) => {
    const subcategories = sumBy(
      current.filter((row) => row.categoria === category),
      (row) => row.subcategoria,
      (row) => row.tickets
    );

    return topEntries(subcategories, 1)[0] ?? null;
  };

  const series: CategorySeries[] = [
    { key: "tickets", label: "Incidencias resueltas", color: seriesColor(0) },
  ];
  const data = top.map((entry) => ({
    categoria: entry.label,
    tickets: entry.value,
  }));

  const suffix = month ? ` ${monthLabel(month)}` : "";

  return (
    <PageShell page={page} editing={editing} onChange={onChange}>
      <KpiRow
        items={[
          {
            label: `Resueltas${suffix}`,
            value: monthTotal.toLocaleString("es-ES"),
          },
          { label: "En el top 5", value: topTotal.toLocaleString("es-ES") },
          {
            label: "Peso del top 5",
            value: monthTotal > 0 ? percent(topTotal / monthTotal) : "",
          },
        ]}
      />

      <div className="flex min-h-0 flex-1 flex-col">
        <CategoryBarChart categoryKey="categoria" series={series} data={data} />
      </div>

      <ul className="shrink-0 space-y-[0.3cqi] border-t border-border pt-[0.8cqi] font-mono text-[1.15cqi] text-muted-foreground">
        {top.map((entry) => {
          const leader = leadingSubcategory(entry.label);

          return (
            <li key={entry.label} className="flex justify-between gap-[1cqi]">
              <span className="truncate">
                {entry.label}
                {leader ? ` · ${leader.label}` : ""}
              </span>
              <span className="shrink-0 tabular-nums">
                {entry.value.toLocaleString("es-ES")}
                {leader ? ` (${leader.value.toLocaleString("es-ES")})` : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </PageShell>
  );
}
