import {
  closedElementWeeks,
  elementWeeks,
  latestYear,
  reportedElementWeeks,
  reportWeek,
  totalOffices,
  valueAt,
} from "@shared/modules/oficinas/derived";
import type { OficinasElementWeek } from "@shared/modules/oficinas/types";
import {
  decimal,
  disambiguate,
  percent,
  readElementWeek,
  weekHeadline,
  weekLabel,
} from "../aggregate";
import CategorySharePage from "./CategorySharePage";
import ElementWeekSelector from "./ElementWeekSelector";
import type { OficinasDataPageProps } from "./PageShell";

/**
 * `1.2 Incidencias resueltas por elemento, última semana`.
 *
 * Same reading as `ResueltasElementoPage` — leading elements, their share, the
 * bars and the pivot underneath — restricted to one week instead of the year to
 * date. It answers what the accumulated slide cannot: which elements moved this
 * week, not which ones weigh most since January.
 *
 * Which week it publishes is a choice made in the editor and stored on the page,
 * not a rule: sheets 5 and 10 refresh their last column after the export, so the
 * report week is complete in some templates and half-filled in others, and the
 * data does not say which. "Semana anterior" is the default and is always safe;
 * "Semana actual" lines the slide up with the rest of the deck and is for a week
 * whose export the team has checked.
 *
 * Either way every figure on the slide carries its own week label instead of "la
 * semana", because the two readings are a week apart.
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

  const reported = reportWeek(dataset, year);
  const anchor = readElementWeek(page.elementWeek);
  const weeks = elementWeeks(rows, year, reported, anchor);
  const week = weeks[weeks.length - 1] ?? null;
  const previousWeek = weeks[weeks.length - 2] ?? null;
  // Both anchors resolved, so each button names the week it would publish and
  // the one that has no week to show is offered disabled instead of silently
  // falling back to the other.
  const anchorWeeks: Record<OficinasElementWeek, number | null> = {
    informe: reportedElementWeeks(rows, year, reported).at(-1) ?? null,
    anterior: closedElementWeeks(rows, year, reported).at(-1) ?? null,
  };

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
      editorControls={
        <ElementWeekSelector
          value={anchor}
          weeks={anchorWeeks}
          onChange={elementWeek => onChange({ elementWeek })}
        />
      }
      kpis={[
        {
          // Both cards name their week and their year, the same shape the rest
          // of the deck uses: the slide is read on its own and "la semana" says
          // nothing once the report is filed next to the previous ones.
          label:
            week === null
              ? "Total semana"
              : `Total ${weekHeadline(week)} - ${year}`,
          value: total.toLocaleString("es-ES"),
        },
        {
          label:
            previousWeek === null
              ? "Total semana anterior"
              : `Total ${weekHeadline(previousWeek)} - ${year}`,
          value:
            previousTotal === null
              ? "—"
              : previousTotal.toLocaleString("es-ES"),
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
