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
import type { OficinasDataPageProps } from "./PageShell";
import SemanalPage from "./SemanalPage";

/**
 * `1.2 Comparativa de incidencias resueltas sin validadoras`.
 *
 * The assigned slide over the resolved section: same scopes, same sample, same
 * reasons. See `AsignadasSemanalPage` for why the bars count the whole section
 * while the table lists eight elements and no total.
 */

/** Elements the printed slide samples, ranked by their year total. */
const SAMPLE_ROWS = 8;

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
  ).slice(0, SAMPLE_ROWS);
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
