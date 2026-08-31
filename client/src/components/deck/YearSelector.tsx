export interface YearSelection {
  /** Years available in the imported series, oldest first. */
  available: number[];
  /** Years currently drawn, a subset of `available`. */
  selected: number[];
  onChange: (years: number[]) => void;
}

interface YearSelectorProps {
  selection: YearSelection;
}

/**
 * Editor-only chips for the annual series displayed in a chart.
 *
 * The reader identifies each year from the chart legend; these buttons decide
 * which years, including the report year, the editor wants on the axis.
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
