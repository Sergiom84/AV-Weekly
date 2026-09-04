import {
  latestYear,
  rankedRows,
  recicladoresSeries,
  reportWeek,
  valueAt,
} from "@shared/modules/oficinas/derived";
import CategorySharePage from "./CategorySharePage";
import type { OficinasDataPageProps } from "./PageShell";
import { variationLabel, weekLabel } from "../aggregate";

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

  const week = reportWeek(dataset, year);
  const ranked =
    week === null
      ? []
      : rankedRows(rows, year).filter(row =>
          row.values.some(entry => entry.year === year && entry.week === week)
        );
  const entries = ranked.map(row => ({
    label: row.label,
    imported: week === null ? null : valueAt(row.values, year, week),
  }));
  const total = entries.reduce((sum, entry) => sum + (entry.imported ?? 0), 0);
  const previousYear = year - 1;
  const comparison = recicladoresSeries(dataset.recicladores);
  const previousReported =
    week !== null &&
    comparison.some(entry => entry.year === previousYear && entry.week === week);
  const previous =
    week === null || !previousReported
      ? null
      : valueAt(comparison, previousYear, week);

  return (
    <CategorySharePage
      page={page}
      editing={editing}
      onChange={onChange}
      entries={entries}
      column={week === null ? String(year) : weekLabel(week)}
      seriesLabel="Elemento"
      compactPresentation
      kpis={[
        // "Semana 35 - 2026" rather than "2026 S35", the wording the team asked
        // for across the territorial slides. The bare year is the fallback for
        // a dataset with no closed week yet, where there is no week to name.
        {
          label: week === null ? String(year) : `Semana ${week} - ${year}`,
          value: total.toLocaleString("es-ES"),
        },
        {
          label:
            week === null
              ? String(previousYear)
              : `Semana ${week} - ${previousYear}`,
          value: previous === null ? "—" : previous.toLocaleString("es-ES"),
        },
        { label: "Variación", value: variationLabel(previous, total) },
      ]}
    />
  );
}
