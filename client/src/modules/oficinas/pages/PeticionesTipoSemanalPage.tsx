import {
  latestYear,
  reportWeek,
  seriesYears,
} from "@shared/modules/oficinas/derived";
import { oficinasYearSelector } from "../yearSelection";
import type { OficinasDataPageProps } from "./PageShell";
import SemanalPage from "./SemanalPage";

/**
 * `1.3 Volumetría de peticiones resueltas` por tipo.
 *
 * The same chart as the territorial slide — one section, one weekly total — over
 * the other pivot of it. The two slides are printed back to back for exactly
 * that reason: the bars are the same, the breakdown underneath is not.
 */

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
      yearSelector={oficinasYearSelector({
        seriesYears: seriesYears(totals),
        year,
        stored: page.years,
        onChange: years => onChange({ years }),
      })}
    />
  );
}
