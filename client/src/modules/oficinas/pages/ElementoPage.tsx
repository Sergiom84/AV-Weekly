import {
  latestYear,
  rankedRows,
  reportWeek,
  rowTotal,
} from "@shared/modules/oficinas/derived";
import type { OficinasIncidencias } from "@shared/modules/oficinas/types";
import { disambiguate } from "../aggregate";
import CategorySharePage from "./CategorySharePage";
import type { OficinasDataPageProps } from "./PageShell";

interface ElementoPageProps extends OficinasDataPageProps {
  section: OficinasIncidencias | undefined;
  /** Applies the compact card-and-table treatment of the assigned slide. */
  compactPresentation?: boolean;
}

/**
 * `1.1` and `1.2` by element.
 *
 * The element matrix carries eighty-five rows over thirty-four weeks. Neither a
 * matrix of that size nor a bar per row fits a slide, so the page charts the
 * leading elements of the year and lists them with their share of the whole
 * section — the same reading the printed deck gives, without the rows that draw
 * as a hairline.
 *
 * The year total, not the weekly average, is what ranks them: the average over
 * the same weeks orders them identically and reads worse next to a count.
 */

/**
 * Elements the slide carries, charted and listed.
 *
 * Twelve is what the angled axis holds before the labels stop being legible,
 * and what the table lists without a scrollbar. Chart and table show the same
 * rows on purpose: a bar with no line under it reads as a missing figure.
 */
const CHART_ROWS = 12;

export default function ElementoPage({
  page,
  editing,
  onChange,
  dataset,
  section,
  compactPresentation = false,
}: ElementoPageProps) {
  const rows = section?.byElement ?? [];
  const year =
    dataset.year ??
    latestYear(rows.flatMap(row => row.values)) ??
    new Date().getFullYear();

  const throughWeek = reportWeek(dataset, year) ?? undefined;
  const ranked = rankedRows(rows, year, throughWeek);
  const shown = ranked.slice(0, CHART_ROWS);
  const labels = disambiguate(shown);

  const entries = shown.map((row, index) => ({
    label: labels[index],
    imported: rowTotal(row, year, throughWeek),
  }));

  const total = ranked.reduce(
    (sum, row) => sum + rowTotal(row, year, throughWeek),
    0
  );

  return (
    <CategorySharePage
      page={page}
      editing={editing}
      onChange={onChange}
      entries={entries}
      column={String(year)}
      seriesLabel="Elemento"
      topN={CHART_ROWS}
      total={total}
      compactPresentation={compactPresentation}
      kpis={[
        { label: `Total ${year}`, value: total.toLocaleString("es-ES") },
        { label: "Elementos", value: String(ranked.length) },
        {
          label: `Primeros ${CHART_ROWS}`,
          value: entries
            .reduce((sum, entry) => sum + (entry.imported ?? 0), 0)
            .toLocaleString("es-ES"),
        },
      ]}
    />
  );
}
