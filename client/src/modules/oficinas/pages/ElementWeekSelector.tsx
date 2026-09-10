import type { OficinasElementWeek } from "@shared/modules/oficinas/types";
import { ELEMENT_WEEK_OPTIONS } from "../aggregate";

interface ElementWeekSelectorProps {
  value: OficinasElementWeek;
  /** Week each option resolves to, so the choice names a number and not a rule. */
  weeks: Record<OficinasElementWeek, number | null>;
  onChange: (value: OficinasElementWeek) => void;
}

/**
 * Which week the single-week element slide publishes.
 *
 * Sheets 5 and 10 refresh their last column after the export, so the report
 * week is complete in some templates and half-filled in others, and nothing in
 * the data says which. The team decides it here, on the week they are sending,
 * instead of a helper guessing it every Monday.
 *
 * Each button carries the week it resolves to, taken from the dataset on
 * screen: "Semana actual" reads "Semana actual · S36" and the choice is a
 * number the editor can check against the template, not a rule to remember.
 *
 * Rendered only in edit mode, like `VariantSelector`. The published slide names
 * its week in every card, so the reader never needs the control.
 */
export default function ElementWeekSelector({
  value,
  weeks,
  onChange,
}: ElementWeekSelectorProps) {
  return (
    <div className="flex shrink-0 items-center gap-[0.6cqi] print:hidden">
      {ELEMENT_WEEK_OPTIONS.map(entry => {
        const week = weeks[entry.value];

        return (
          <button
            key={entry.value}
            type="button"
            aria-pressed={entry.value === value}
            onClick={() => onChange(entry.value)}
            disabled={week === null}
            className={
              entry.value === value
                ? "rounded-md border border-foreground px-[0.9cqi] py-[0.35cqi] font-mono text-[1.1cqi] text-foreground"
                : "rounded-md border border-border px-[0.9cqi] py-[0.35cqi] font-mono text-[1.1cqi] text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted-foreground"
            }
          >
            {week === null ? entry.label : `${entry.label} · S${week}`}
          </button>
        );
      })}
    </div>
  );
}
