import {
  latestYear,
  reportWeek,
  seriesYears,
} from "@shared/modules/oficinas/derived";
import type { OficinasDataPageProps } from "./PageShell";
import SemanalPage from "./SemanalPage";

/**
 * `1.3 Volumetría de peticiones resueltas` por tipo.
 *
 * The same chart as the territorial slide — one section, one weekly total — over
 * the other pivot of it. The two slides are printed back to back for exactly
 * that reason: the bars are the same, the breakdown underneath is not.
 */

/** Past years drawn next to the current one before the user picks otherwise. */
const DEFAULT_EXTRA_YEARS = 2;

export default function PeticionesTipoSemanalPage({
  page,
  editing,
  onChange,
  dataset,
}: OficinasDataPageProps) {
  const rows = dataset.peticiones?.byTipo ?? [];
  const totals = dataset.peticiones?.totalsByWeek ?? [];
  const year =
    dataset.year ??
    latestYear(rows.flatMap(row => row.values)) ??
    latestYear(totals) ??
    new Date().getFullYear();

  const availableYears = seriesYears(totals).filter(y => y !== year);
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
      rowHeader="Tipo"
      year={year}
      totals={totals}
      comparison={totals}
      throughWeek={reportWeek(dataset, year)}
      rankByAverage
      layout="volumetrias-semanales"
      headlineLabel="Peticiones"
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
