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
 * `1.2 Comparativa de incidencias resueltas sin validadoras`.
 *
 * The assigned slide over the resolved section: same scopes, same sample, same
 * reasons. See `AsignadasSemanalPage` for why the bars count the whole section
 * while the table lists eight elements and no total.
 */

/** Elements the printed slide samples, ranked by their year total. */
const SAMPLE_ROWS = 8;

/** Past years drawn next to the current one before the user picks otherwise. */
const DEFAULT_EXTRA_YEARS = 2;

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
