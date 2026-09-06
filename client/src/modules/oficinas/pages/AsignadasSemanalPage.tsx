import {
  comparisonSeries,
  dtMatrix,
  latestYear,
  rankedRows,
  reportWeek,
  seriesWeeks,
  seriesYears,
  weeklyTotals,
} from "@shared/modules/oficinas/derived";
import { disambiguate } from "../aggregate";
import { oficinasYearSelector } from "../yearSelection";
import { SEMANAL_ELEMENT_SAMPLE } from "../semanalLayout";
import type { OficinasDataPageProps } from "./PageShell";
import SemanalPage from "./SemanalPage";

/**
 * `1.1 Incidencias gestionadas por elemento, semanal`.
 *
 * Chart and table answer two different questions here, which is why they are
 * not the same figures:
 *
 * - The bars are the whole section without validators. That is the scope the
 *   historico was measured at, so it is the only one a past year may be charted
 *   against. Charting the element matrix instead would draw 5.069 incidents
 *   against past years of 4.466 and turn a flat year into a rise of thirteen
 *   per cent.
 * - The table is a sample of elements, not the seventy-nine the matrix carries.
 *   The published slide lists eight and says so in its footnote, and eight is
 *   also what the box holds: the full matrix renders four times taller than its
 *   slot, so the rows past the seventeenth and the closing total end up behind
 *   a scrollbar, which does not print.
 *
 * The sample is why there is no total row: a total of eight rows out of
 * seventy-nine is a figure nothing on the slide supports.
 */

export default function AsignadasSemanalPage({
  page,
  editing,
  onChange,
  dataset,
}: OficinasDataPageProps) {
  const section = dataset.asignadas;
  const matrix = dtMatrix(section, "sin");
  const year =
    dataset.year ??
    latestYear(matrix.flatMap(row => row.values)) ??
    new Date().getFullYear();
  const throughWeek = reportWeek(dataset, year);
  const sample = rankedRows(
    section?.byElement ?? [],
    year,
    throughWeek ?? undefined
  ).slice(0, SEMANAL_ELEMENT_SAMPLE);
  const labels = disambiguate(sample);
  const rows = sample.map((row, index) => ({
    label: labels[index],
    values: row.values,
  }));
  const comparison = comparisonSeries(section, "sin");
  // Chart and table come from different pivots of the template: the chart is
  // the territorial matrix without validators, running to the report week; the
  // table is the element matrix, which counts validators as one more element
  // and stops a week earlier. The two do not reconcile week by week, so the
  // slide names what each half is instead of letting one caption cover both.
  const elementWeeks = seriesWeeks(
    (section?.byElement ?? []).flatMap(row => row.values),
    year
  );
  const elementLast = elementWeeks[elementWeeks.length - 1] ?? null;
  const scope =
    elementLast === null
      ? "Gráfica sin validadoras · Tabla por elemento, con validadoras"
      : `Gráfica sin validadoras · Tabla por elemento, con validadoras, hasta S${elementLast}`;

  return (
    <SemanalPage
      page={page}
      editing={editing}
      onChange={onChange}
      rows={rows}
      rowHeader="Elemento"
      year={year}
      totals={weeklyTotals(matrix)}
      comparison={comparison}
      throughWeek={throughWeek}
      caption={scope}
      totalRow={false}
      rankByAverage
      layout="comparativas-semanales"
      yearSelector={oficinasYearSelector({
        seriesYears: seriesYears(comparison),
        year,
        stored: page.years,
        onChange: years => onChange({ years }),
      })}
    />
  );
}
