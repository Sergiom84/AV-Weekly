export interface YearSelection {
  /** Years the section has besides the current one, oldest first. */
  available: number[];
  /** Years currently drawn, a subset of `available`. */
  selected: number[];
  onChange: (years: number[]) => void;
}

interface YearSelectorProps {
  selection: YearSelection;
}

/**
 * Which past years the annual comparison draws, as a multiple choice.
 *
 * Rendered only while the deck is in edit mode, like the variant selector it
 * sits under and like the correction grid: it is the editor, not part of the
 * slide. The years themselves reach the reader through the chart legend, which
 * is where they belong.
 *
 * The years offered are decided by the page, not here: they depend on the
 * validator scope on screen (`comparisonSeries` in the shared contract), so a
 * page that has none for the current scope leaves the control out entirely
 * rather than showing an empty row.
 */
export default function YearSelector({ selection }: YearSelectorProps) {
  const { available, selected, onChange } = selection;

  return (
    <div
      role="group"
      aria-label="Años comparados"
      className="flex shrink-0 flex-wrap items-center gap-[0.6cqi] print:hidden"
    >
      {available.map(year => {
        const active = selected.includes(year);

        return (
          <button
            key={year}
            type="button"
            aria-pressed={active}
            onClick={() =>
              onChange(
                active
                  ? selected.filter(item => item !== year)
                  : [...selected, year]
              )
            }
            className={
              active
                ? "rounded-md border border-foreground px-[0.9cqi] py-[0.35cqi] font-mono text-[1.1cqi] tabular-nums text-foreground"
                : "rounded-md border border-border px-[0.9cqi] py-[0.35cqi] font-mono text-[1.1cqi] tabular-nums text-muted-foreground transition-colors hover:text-foreground"
            }
          >
            {year}
          </button>
        );
      })}
    </div>
  );
}
