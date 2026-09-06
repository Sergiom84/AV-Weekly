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
 * `1.2 Incidencias resueltas por elemento, semanal`.
 *
 * The assigned weekly-by-element slide over the resolved matrix, and it shares
 * its two rules: the bars are the section without validators, the scope the
 * past years were measured at, and the table is the printed sample of elements
 * rather than the seventy the matrix carries.
 */

export default function ResueltasSemanalPage({
  page,
  editing,
  onChange,
  dataset,
}: OficinasDataPageProps) {
  const section = dataset.resueltas;
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
