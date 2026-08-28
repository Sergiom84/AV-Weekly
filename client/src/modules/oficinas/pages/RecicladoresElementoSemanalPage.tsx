import {
  latestYear,
  recicladoresSeries,
  reportWeek,
  seriesYears,
} from "@shared/modules/oficinas/derived";
import type { OficinasDataPageProps } from "./PageShell";
import SemanalPage from "./SemanalPage";

/**
 * `1.5 Recicladores resueltos por elemento`.
 *
 * The same chart as the territorial recycler slide over the element pivot of the
 * section, printed right after it. `byElemento` is the whole matrix, not a
 * sample, so the table closes with its total.
 */

/** Past years drawn next to the current one before the user picks otherwise. */
const DEFAULT_EXTRA_YEARS = 2;

export default function RecicladoresElementoSemanalPage({
  page,
  editing,
  onChange,
  dataset,
}: OficinasDataPageProps) {
  const rows = dataset.recicladores?.byElemento ?? [];
  const series = recicladoresSeries(dataset.recicladores);
  const year =
    dataset.year ??
    latestYear(rows.flatMap(row => row.values)) ??
    latestYear(series) ??
    new Date().getFullYear();

  const availableYears = seriesYears(series).filter(y => y !== year);
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
      totals={series}
      comparison={series}
      throughWeek={reportWeek(dataset, year)}
      rankByAverage
      layout="volumetrias-semanales"
      headlineLabel="Recicladores"
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
