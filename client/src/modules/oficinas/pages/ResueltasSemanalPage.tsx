import {
  comparisonSeries,
  dtMatrix,
  latestYear,
  rankedRows,
  reportWeek,
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
      caption="Sin validadoras"
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
