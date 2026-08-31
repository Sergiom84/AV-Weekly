import {
  latestYear,
  reportWeek,
  seriesYears,
} from "@shared/modules/oficinas/derived";
import { oficinasYearSelector } from "../yearSelection";
import type { OficinasDataPageProps } from "./PageShell";
import SemanalPage from "./SemanalPage";

/**
 * `1.3 Volumetría de peticiones resueltas por territorial`.
 *
 * The only section whose total sheet already spans every year the deck holds,
 * so both the current line and the past ones read from `totalsByWeek` and no
 * historico is involved. The table is the whole directorate matrix, so it does
 * close with its total.
 */

export default function PeticionesDTSemanalPage({
  page,
  editing,
  onChange,
  dataset,
}: OficinasDataPageProps) {
  const rows = dataset.peticiones?.byDT ?? [];
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
      rowHeader="Territorial"
      year={year}
      totals={totals}
      comparison={totals}
      throughWeek={reportWeek(dataset, year)}
      rankByAverage
      layout="peticiones-territorial-semanal"
      yearSelector={oficinasYearSelector({
        seriesYears: seriesYears(totals),
        year,
        stored: page.years,
        onChange: years => onChange({ years }),
      })}
    />
  );
}
