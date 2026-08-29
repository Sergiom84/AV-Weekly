import {
  latestYear,
  reportWeek,
  weekShares,
} from "@shared/modules/oficinas/derived";
import CategorySharePage from "./CategorySharePage";
import type { OficinasDataPageProps } from "./PageShell";
import { weekLabel } from "../aggregate";

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

  return (
    <CategorySharePage
      page={page}
      editing={editing}
      onChange={onChange}
      entries={entries}
      column={week === null ? String(year) : weekLabel(week)}
      seriesLabel="Tipo de petición"
      compactPresentation
      kpis={
        week === null
          ? []
          : [
              { label: `Semana ${week}`, value: total.toLocaleString("es-ES") },
              { label: "Tipos", value: String(entries.length) },
            ]
      }
    />
  );
}
