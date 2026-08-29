import {
  latestYear,
  rankedRows,
  reportWeek,
  rowTotal,
} from "@shared/modules/oficinas/derived";
import CategorySharePage from "./CategorySharePage";
import type { OficinasDataPageProps } from "./PageShell";

/**
 * `1.5 Recicladores por elemento`.
 *
 * Six elements over the whole year, so every row is both charted and listed:
 * unlike the incident matrices there is nothing here to leave out.
 */
export default function RecicladoresElementoPage({
  page,
  editing,
  onChange,
  dataset,
}: OficinasDataPageProps) {
  const rows = dataset.recicladores?.byElemento ?? [];
  const year =
    dataset.year ??
    latestYear(rows.flatMap(row => row.values)) ??
    new Date().getFullYear();

  const throughWeek = reportWeek(dataset, year) ?? undefined;
  const ranked = rankedRows(rows, year, throughWeek);
  const entries = ranked.map(row => ({
    label: row.label,
    imported: rowTotal(row, year, throughWeek),
  }));
  const total = entries.reduce((sum, entry) => sum + (entry.imported ?? 0), 0);

  return (
    <CategorySharePage
      page={page}
      editing={editing}
      onChange={onChange}
      entries={entries}
      column={String(year)}
      seriesLabel="Elemento"
      compactPresentation
      kpis={[
        { label: `Total ${year}`, value: total.toLocaleString("es-ES") },
        { label: "Elementos", value: String(entries.length) },
      ]}
    />
  );
}
