import {
  latestYear,
  recicladoresSeries,
  reportWeek,
  seriesYears,
} from "@shared/modules/oficinas/derived";
import type { OficinasDataPageProps } from "./PageShell";
import SemanalPage from "./SemanalPage";

/**
 * `1.5 Volumetría de incidencias resueltas Recicladores` por territorial.
 *
 * The section publishes no total sheet and keeps its years in two separate
 * matrices — the template writes the current year into `byDT` and the previous
 * one into `byDTPrevious` — so the chart reads `recicladoresSeries`, which folds
 * both into the one multi-year series a chart can draw.
 *
 * The table stays on `byDT` and shows only the current year, which is what the
 * printed pivot lists.
 */

/** Past years drawn next to the current one before the user picks otherwise. */
const DEFAULT_EXTRA_YEARS = 2;

export default function RecicladoresDTSemanalPage({
  page,
  editing,
  onChange,
  dataset,
}: OficinasDataPageProps) {
  const rows = dataset.recicladores?.byDT ?? [];
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
      rowHeader="Territorial"
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
