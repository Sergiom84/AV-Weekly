import {
  latestYear,
  peticionesSeries,
  reportWeek,
  seriesYears,
} from "@shared/modules/oficinas/derived";
import { oficinasYearSelector } from "../yearSelection";
import DTPage from "./DTPage";
import type { OficinasDataPageProps } from "./PageShell";

/**
 * `1.3 Peticiones por territorial`.
 *
 * The one incident-like section whose template does ship the previous year
 * (sheet 13), so 2025 is a real directorate matrix and not a reconstruction.
 *
 * The team asked for 2024 as well, which the template does not carry: it comes
 * from the manual historico as a flat weekly total with no directorate split.
 * That is what the multi-year selector draws from, so the page moved off the
 * single `previousRows` line and onto `comparison`. The precedence between the
 * two sources lives in `peticionesSeries`, and it keeps 2025 on the template's
 * own figures rather than on the historico's.
 */
export default function PeticionesDTPage({
  page,
  editing,
  onChange,
  dataset,
}: OficinasDataPageProps) {
  const rows = dataset.peticiones?.byDT ?? [];
  const year =
    dataset.year ??
    latestYear(rows.flatMap(row => row.values)) ??
    new Date().getFullYear();
  const comparison = peticionesSeries(dataset.peticiones);

  return (
    <DTPage
      page={page}
      editing={editing}
      onChange={onChange}
      rows={rows}
      tables={[{ caption: "Peticiones por DT", rows }]}
      year={year}
      masters={dataset.masters}
      totals={dataset.peticiones?.totalsByWeek}
      throughWeek={reportWeek(dataset, year)}
      metricLabel="Peticiones"
      layout="incidencias-territoriales"
      compactWeekPriority
      comparison={comparison}
      yearSelector={oficinasYearSelector({
        seriesYears: seriesYears(comparison),
        year,
        stored: page.years,
        onChange: years => onChange({ years }),
      })}
    />
  );
}
