import type { YearSelection } from "@/components/deck/YearSelector";
import {
  persistOficinasYears,
  resolveOficinasYears,
} from "@shared/modules/oficinas/yearSelection";

export {
  DEFAULT_EXTRA_YEARS,
  hiddenCurrentYear,
  persistOficinasYears,
  resolveOficinasYears,
} from "@shared/modules/oficinas/yearSelection";

/** Year chips for an Oficinas weekly comparison, including the current year. */
export function oficinasYearSelector(input: {
  seriesYears: number[];
  year: number;
  stored: number[] | null;
  onChange: (years: number[]) => void;
}): YearSelection {
  const { available, selected } = resolveOficinasYears(
    input.seriesYears,
    input.year,
    input.stored
  );

  return {
    available,
    selected,
    onChange: years => input.onChange(persistOficinasYears(years, input.year)),
  };
}
