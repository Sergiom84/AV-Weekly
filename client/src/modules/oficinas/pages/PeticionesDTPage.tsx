import { latestYear } from "@shared/modules/oficinas/derived";
import DTPage from "./DTPage";
import type { OficinasDataPageProps } from "./PageShell";

/**
 * `1.3 Peticiones por territorial`.
 *
 * The one incident-like section whose template does ship the previous year
 * (sheet 13), so the line carries both and the headline states the variation.
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

  return (
    <DTPage
      page={page}
      editing={editing}
      onChange={onChange}
      rows={rows}
      previousRows={dataset.peticiones?.byDTPrevious ?? []}
      year={year}
      masters={dataset.masters}
      totals={dataset.peticiones?.totalsByWeek}
    />
  );
}
