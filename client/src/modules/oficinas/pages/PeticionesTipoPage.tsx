import {
  latestYear,
  reportWeek,
  weekShares,
} from "@shared/modules/oficinas/derived";
import CategorySharePage from "./CategorySharePage";
import type { OficinasDataPageProps } from "./PageShell";
import { variationLabel, weekLabel } from "../aggregate";
import { previousTypeEntries } from "../peticionesTipoComparison";

/**
 * `1.3 Peticiones por tipo`.
 *
 * Charted on the last completed week, the same week the directorate table of
 * the previous slide closes on: the template is exported mid-week and its final
 * column is a partial week, which on a breakdown of eight types reads as a
 * collapse rather than as an export date.
 */
export default function PeticionesTipoPage({
  page,
  editing,
  onChange,
  dataset,
}: OficinasDataPageProps) {
  const rows = dataset.peticiones?.byTipo ?? [];
  const year =
    dataset.year ??
    latestYear(rows.flatMap(row => row.values)) ??
    new Date().getFullYear();

  const week = reportWeek(dataset, year);

  const shares = week === null ? [] : weekShares(rows, year, week);
  const entries = shares.map(entry => ({
    label: entry.label,
    imported: entry.value,
  }));

  const total = shares.reduce((sum, entry) => sum + entry.value, 0);
  const previousYear = year - 1;
  const previousEntries =
    week === null
      ? []
      : previousTypeEntries(
          rows,
          dataset.peticiones?.byTipoPrevious ?? [],
          previousYear,
          week
        );
  const previousReported = previousEntries.some(entry => entry.imported !== null);
  const previousTotal = previousReported
    ? previousEntries.reduce((sum, entry) => sum + (entry.imported ?? 0), 0)
    : null;

  return (
    <CategorySharePage
      page={page}
      editing={editing}
      onChange={onChange}
      entries={entries}
      column={week === null ? String(year) : weekLabel(week)}
      seriesLabel={String(year)}
      categoryHeader="Tipo de petición"
      comparison={
        week === null || !previousReported
          ? undefined
          : { label: String(previousYear), entries: previousEntries }
      }
      compactPresentation
      kpis={
        week === null
          ? []
          : [
              { label: `${year} ${weekLabel(week)}`, value: total.toLocaleString("es-ES") },
              {
                label: `${previousYear} ${weekLabel(week)}`,
                value:
                  previousTotal === null ? "—" : previousTotal.toLocaleString("es-ES"),
              },
              { label: "Variación", value: variationLabel(previousTotal, total) },
            ]
      }
    />
  );
}
