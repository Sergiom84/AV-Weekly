import {
  comparisonSeries,
  dtMatrix,
  latestYear,
  reportWeek,
  seriesYears,
  weeklyTotals,
} from "@shared/modules/oficinas/derived";
import type { OficinasIncidencias } from "@shared/modules/oficinas/types";
import { oficinasYearSelector } from "../yearSelection";
import type { OficinasDataPageProps } from "./PageShell";
import SemanalPage from "./SemanalPage";

interface IncidenciasTotalSemanalPageProps extends OficinasDataPageProps {
  section: OficinasIncidencias | undefined;
  headlineLabel: string;
}

/**
 * Total-only weekly comparison for assigned/resolved incidents.
 *
 * Both years use the same "sin validadoras" population: the current line is
 * summed from that DT matrix and previous years come from the historical
 * series tagged with the same scope. The one-row table exposes weekly totals,
 * not an element breakdown or a reconstructed historical pivot.
 */
function IncidenciasTotalSemanalPage({
  page,
  editing,
  onChange,
  dataset,
  section,
  headlineLabel,
}: IncidenciasTotalSemanalPageProps) {
  const matrix = dtMatrix(section, "sin");
  const totals = weeklyTotals(matrix);
  const comparison = comparisonSeries(section, "sin");
  const year =
    dataset.year ??
    latestYear(totals) ??
    new Date().getFullYear();

  return (
    <SemanalPage
      page={page}
      editing={editing}
      onChange={onChange}
      rows={[{ label: "Total semanal", values: totals }]}
      rowHeader="Serie"
      year={year}
      totals={totals}
      comparison={comparison}
      throughWeek={reportWeek(dataset, year)}
      defaultToReportedWeek
      caption="Sin validadoras"
      totalRow={false}
      layout="total-semanal-comparativa"
      headlineLabel={headlineLabel}
      yearSelector={oficinasYearSelector({
        seriesYears: seriesYears(comparison),
        year,
        stored: page.years,
        defaultExtraYears: 1,
        onChange: years => onChange({ years }),
      })}
    />
  );
}

export function AsignadasTotalSemanalPage(props: OficinasDataPageProps) {
  return (
    <IncidenciasTotalSemanalPage
      {...props}
      section={props.dataset.asignadas}
      headlineLabel="Asignadas"
    />
  );
}

export function ResueltasTotalSemanalPage(props: OficinasDataPageProps) {
  return (
    <IncidenciasTotalSemanalPage
      {...props}
      section={props.dataset.resueltas}
      headlineLabel="Resueltas"
    />
  );
}
