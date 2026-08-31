import {
  latestYear,
  recicladoresSeries,
  reportWeek,
  seriesYears,
} from "@shared/modules/oficinas/derived";
import { oficinasYearSelector } from "../yearSelection";
import type { OficinasDataPageProps } from "./PageShell";
import SemanalPage from "./SemanalPage";

/**
 * `1.5 Recicladores resueltos por elemento`.
 *
 * The same chart as the territorial recycler slide over the element pivot of the
 * section, printed right after it. `byElemento` is the whole matrix, not a
 * sample, so the table closes with its total.
 */

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
      yearSelector={oficinasYearSelector({
        seriesYears: seriesYears(series),
        year,
        stored: page.years,
        onChange: years => onChange({ years }),
      })}
    />
  );
}
