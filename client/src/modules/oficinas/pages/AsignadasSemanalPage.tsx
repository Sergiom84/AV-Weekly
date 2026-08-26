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
import type { OficinasDataPageProps } from "./PageShell";
import SemanalPage from "./SemanalPage";

/**
 * `1.1 Comparativa de incidencias asignadas sin validadoras`.
 *
 * Chart and table answer two different questions on this slide, which is why
 * they are not the same figures:
 *
 * - The bars are the whole section without validators. That is the scope the
 *   printed slide names in its own title and the scope the historico was
 *   measured at, so it is the only one a past year may be charted against.
 * - The table is a sample of elements, not the seventy-six the matrix carries.
 *   The printed slide lists eight and says so in its footnote; a total of that
 *   sample would be a figure nothing on the slide supports, so the closing row
 *   is left out exactly as the print leaves it out.
 */

/** Elements the printed slide samples, ranked by their year total. */
const SAMPLE_ROWS = 8;

/** Past years drawn next to the current one before the user picks otherwise. */
const DEFAULT_EXTRA_YEARS = 2;

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
  ).slice(0, SAMPLE_ROWS);
  const labels = disambiguate(sample);
  const rows = sample.map((row, index) => ({
    label: labels[index],
    values: row.values,
  }));

  const comparison = comparisonSeries(section, "sin");
  const availableYears = seriesYears(comparison).filter(y => y !== year);
  const defaultYears = availableYears
    .filter(y => y >= year - DEFAULT_EXTRA_YEARS && y < year)
    .sort((a, b) => a - b);
  const selectedYears = page.years
    ? page.years.filter(y => availableYears.includes(y))
    : defaultYears;

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
      yearSelector={
        availableYears.length > 0
          ? {
              available: availableYears,
              selected: selectedYears,
              onChange: years => onChange({ years }),
            }
          : undefined
      }
    />
  );
}
