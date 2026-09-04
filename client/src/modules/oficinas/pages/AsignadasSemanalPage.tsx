import {
  comparisonSeries,
  latestYear,
  rankedRows,
  reportWeek,
  seriesYears,
  weeklyTotals,
} from "@shared/modules/oficinas/derived";
import { disambiguate } from "../aggregate";
import { oficinasYearSelector } from "../yearSelection";
import type { OficinasDataPageProps } from "./PageShell";
import SemanalPage from "./SemanalPage";

/**
 * `1.1 Incidencias gestionadas por elemento, semanal`.
 *
 * Same anatomy as the recycler element weekly slide: the table is the whole
 * element matrix, ranked, with its total, and the bars are the year comparison
 * at the published "sin validadoras" scope.
 */

export default function AsignadasSemanalPage({
  page,
  editing,
  onChange,
  dataset,
}: OficinasDataPageProps) {
  const section = dataset.asignadas;
  const year =
    dataset.year ??
    latestYear(section?.byElement?.flatMap(row => row.values)) ??
    new Date().getFullYear();
  const throughWeek = reportWeek(dataset, year);
  const ranked = rankedRows(
    section?.byElement ?? [],
    year,
    throughWeek ?? undefined
  );
  const labels = disambiguate(ranked);
  const rows = ranked.map((row, index) => ({
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
      totals={weeklyTotals(section?.byElement ?? [])}
      comparison={comparison}
      throughWeek={throughWeek}
      totalRow
      rankByAverage
      layout="volumetrias-semanales"
      yearSelector={oficinasYearSelector({
        seriesYears: seriesYears(comparison),
        year,
        stored: page.years,
        onChange: years => onChange({ years }),
      })}
    />
  );
}
