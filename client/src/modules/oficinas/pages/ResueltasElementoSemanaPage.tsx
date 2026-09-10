import {
  closedElementWeeks,
  latestYear,
  reportWeek,
  totalOffices,
  valueAt,
} from "@shared/modules/oficinas/derived";
import {
  decimal,
  disambiguate,
  percent,
  variationLabel,
  weekHeadline,
  weekLabel,
} from "../aggregate";
import CategorySharePage from "./CategorySharePage";
import type { OficinasDataPageProps } from "./PageShell";

/**
 * `1.2 Incidencias resueltas por elemento, última semana`.
 *
 * Same reading as `ResueltasElementoPage` — leading elements, their share, the
 * bars and the pivot underneath — restricted to one week instead of the year to
 * date. It answers what the accumulated slide cannot: which elements moved this
 * week, not which ones weigh most since January.
 *
 * The week is not the report week but the last one `closedElementWeeks` allows,
 * which is one behind it: the element pivot of the report week is still partial
 * when the deck is sent. The slide therefore reads a week behind the rest of the
 * report, and that is why every figure on it carries its own week label instead
 * of "la semana".
 */

/** Elements charted and listed, the same twelve the accumulated slide holds. */
const CHART_ROWS = 12;

export default function ResueltasElementoSemanaPage({
  page,
  editing,
  onChange,
  dataset,
}: OficinasDataPageProps) {
  const rows = dataset.resueltas?.byElement ?? [];
  const year =
    dataset.year ??
    latestYear(rows.flatMap(row => row.values)) ??
    new Date().getFullYear();

  const weeks = closedElementWeeks(rows, year, reportWeek(dataset, year));
  const week = weeks[weeks.length - 1] ?? null;
  const previousWeek = weeks[weeks.length - 2] ?? null;

  const weekTotal = (target: number) =>
    rows.reduce((sum, row) => sum + valueAt(row.values, year, target), 0);

  const entries =
    week === null
      ? []
      : (() => {
          const ranked = [...rows].sort(
            (a, b) =>
              valueAt(b.values, year, week) - valueAt(a.values, year, week) ||
              a.label.localeCompare(b.label, "es")
          );
          const shown = ranked.slice(0, CHART_ROWS);
          const labels = disambiguate(shown);

          return shown.map((row, index) => ({
            label: labels[index],
            imported: valueAt(row.values, year, week),
          }));
        })();

  const total = week === null ? 0 : weekTotal(week);
  const previousTotal = previousWeek === null ? null : weekTotal(previousWeek);
  // The share of the whole week the charted twelve carry. Written out because
  // the table divides each row by the same total and a reader has no other way
  // to tell whether the rows past the twelfth are a tail or half the week.
  const charted = entries.reduce((sum, entry) => sum + (entry.imported ?? 0), 0);
  const offices = totalOffices(dataset.masters);

  return (
    <CategorySharePage
      page={page}
      editing={editing}
      onChange={onChange}
      entries={entries}
      column={week === null ? String(year) : weekLabel(week)}
      seriesLabel={week === null ? String(year) : weekLabel(week)}
      categoryHeader="Elemento"
      topN={CHART_ROWS}
      total={total}
      compactPresentation
      kpis={[
        {
          label: week === null ? "Total semana" : `Total ${weekHeadline(week)}`,
          value: total.toLocaleString("es-ES"),
        },
        {
          label:
            previousWeek === null
              ? "Variación semanal"
              : `Variación vs ${weekHeadline(previousWeek)}`,
          value: variationLabel(previousTotal, week === null ? null : total),
        },
        {
          label: "Ratio por oficina",
          value: decimal(offices === 0 ? null : total / offices, 2),
        },
        {
          label: `Top ${CHART_ROWS}`,
          value: total === 0 ? "—" : percent(charted / total),
        },
      ]}
    />
  );
}
