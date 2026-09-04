import { latestYear, reportWeek } from "@shared/modules/oficinas/derived";
import DTPage from "./DTPage";
import type { OficinasDataPageProps } from "./PageShell";

/**
 * `1.5 Recicladores por territorial`.
 *
 * The section has no total sheet, so the line is the column total of the
 * matrix. Its previous-year sheet jumps from week 1 to week 21: those weeks are
 * drawn as a gap, never as zeros, which would claim a year that was measured
 * and empty instead of one that was not measured.
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

  return (
    <DTPage
      page={page}
      editing={editing}
      onChange={onChange}
      rows={rows}
      tables={[{ caption: "Recicladores por DT", rows }]}
      previousRows={dataset.recicladores?.byDTPrevious ?? []}
      year={year}
      masters={dataset.masters}
      throughWeek={reportWeek(dataset, year)}
      metricLabel="Recicladores"
      weekYearHeadline
      layout="incidencias-territoriales"
      compactWeekPriority
    />
  );
}
