import {
  latestYear,
  recicladoresSeries,
  reportWeek,
  seriesYears,
} from "@shared/modules/oficinas/derived";
import { oficinasYearSelector } from "../yearSelection";
import DTPage from "./DTPage";
import type { OficinasDataPageProps } from "./PageShell";

/**
 * `1.5 Recicladores por territorial`.
 *
 * The section has no total sheet, so the line is the column total of the
 * matrix. Its previous-year sheet jumps from week 1 to week 21: those weeks are
 * drawn as a gap, never as zeros, which would claim a year that was measured
 * and empty instead of one that was not measured.
 *
 * 2024 was already in the dataset — the historico seeds it into `byDT` — but
 * the page only ever drew one previous year. It now reads the multi-year
 * selector off `recicladoresSeries`, which is where the three years already
 * live, so the year the team asked for needed no new import.
 */
export default function RecicladoresDTPage({
  page,
  editing,
  onChange,
  dataset,
}: OficinasDataPageProps) {
  const rows = dataset.recicladores?.byDT ?? [];
  const year =
    dataset.year ??
    latestYear(rows.flatMap(row => row.values)) ??
    new Date().getFullYear();
  const comparison = recicladoresSeries(dataset.recicladores);

  return (
    <DTPage
      page={page}
      editing={editing}
      onChange={onChange}
      rows={rows}
      tables={[{ caption: "Recicladores por DT", rows }]}
      year={year}
      masters={dataset.masters}
      throughWeek={reportWeek(dataset, year)}
      metricLabel="Recicladores"
      weekYearHeadline
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
