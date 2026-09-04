import {
  latestYear,
  recicladoresSeries,
  reportWeek,
} from "@shared/modules/oficinas/derived";
import CategorySharePage from "./CategorySharePage";
import type { OficinasDataPageProps } from "./PageShell";
import { variationLabel } from "../aggregate";
import { recicladoresYtd } from "../recicladoresYtd";

/**
 * `1.5 Recicladores por elemento, acumulado anual`.
 *
 * The same breakdown as the slide before it, read over the year instead of over
 * the closed week. One reads the week that is being reported; this one says
 * whether the year is running above or below the last one, which a single week
 * cannot answer.
 *
 * Both years are cut at the same week. Comparing thirty-five weeks of 2026
 * against a full 2025 would print a fall of a third that means nothing, so the
 * previous year is accumulated through the report week and the cards say so.
 * When a week of the previous year was never measured it is left out of the sum
 * rather than counted as zero, which is the rule the whole module follows.
 */
export default function RecicladoresElementoAnualPage({
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
  const previousYear = year - 1;
  const { entries, total, previous } = recicladoresYtd(
    rows,
    recicladoresSeries(dataset.recicladores),
    year,
    week
  );

  const span = week === null ? "" : ` · S1-S${week}`;

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
        {
          label: `${year}${span}`,
          value: total.toLocaleString("es-ES"),
        },
        {
          label: `${previousYear}${span}`,
          value: previous === null ? "—" : previous.toLocaleString("es-ES"),
        },
        { label: "Variación", value: variationLabel(previous, total) },
      ]}
    />
  );
}
