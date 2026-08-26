import {
  comparisonSeries,
  dtMatrix,
  latestYear,
  reportWeek,
  seriesYears,
} from "@shared/modules/oficinas/derived";
import type { OficinasIncidencias } from "@shared/modules/oficinas/types";
import { readVariant, variantLabel } from "../aggregate";
import DTPage from "./DTPage";
import { type OficinasDataPageProps } from "./PageShell";
import VariantSelector from "./VariantSelector";

interface IncidenciasDTPageProps extends OficinasDataPageProps {
  section: OficinasIncidencias | undefined;
}

/** Past years drawn next to the current one before the user picks otherwise. */
const DEFAULT_EXTRA_YEARS = 2;

/**
 * `1.1` and `1.2` by directorate: the same slide over the assigned and the
 * resolved matrices.
 *
 * Neither section ships a year-on-year sheet with a DT breakdown, so the past
 * years come from the historico seed (`scripts/importar-historico-oficinas.mjs`)
 * as a flat weekly total with no directorate. That is exactly what the
 * multi-year selector needs: it draws straight off that series rather than off a
 * per-DT matrix, so a past year is selectable without inventing a directorate
 * split the source never measured.
 *
 * The two selectors compose, and the second is bounded by the first.
 * `comparisonSeries` answers which years exist at the scope the page is showing,
 * so switching to "solo validadoras" leaves the year buttons out rather than
 * charting a "sin validadoras" past year against a "solo" present one. Today
 * the historico is a "sin validadoras" series, which is the variant the client
 * deck publishes; the "con" line keeps the template's own total sheet, which is
 * what that sheet counts.
 *
 * The charted current year follows the same rule: the total sheet while the page
 * shows the "con validadoras" matrix, and the column total of the matrix on
 * screen otherwise. A line that counts more incidents than the table under it is
 * worse than one that differs from the published total.
 */
export default function IncidenciasDTPage({
  page,
  editing,
  onChange,
  dataset,
  section,
}: IncidenciasDTPageProps) {
  const variant = readVariant(page.supportType);
  const rows = dtMatrix(section, variant);
  const year =
    dataset.year ??
    latestYear(rows.flatMap(row => row.values)) ??
    new Date().getFullYear();

  const comparison = comparisonSeries(section, variant);
  const availableYears = seriesYears(comparison).filter(y => y !== year);
  const defaultYears = availableYears
    .filter(y => y >= year - DEFAULT_EXTRA_YEARS && y < year)
    .sort((a, b) => a - b);
  // A year stored for another variant is dropped rather than carried over: the
  // selection is per page and the variants do not share the same set of years.
  const selectedYears = page.years
    ? page.years.filter(y => availableYears.includes(y))
    : defaultYears;

  return (
    <DTPage
      page={page}
      editing={editing}
      onChange={onChange}
      rows={rows}
      year={year}
      masters={dataset.masters}
      totals={variant === "con" ? section?.totalsByWeek : undefined}
      throughWeek={reportWeek(dataset, year)}
      caption={variantLabel(variant)}
      controls={
        <VariantSelector
          value={variant}
          onChange={value => onChange({ supportType: value })}
        />
      }
      comparison={comparison}
      yearSelector={
        availableYears.length > 0
          ? {
              available: availableYears,
              selected: selectedYears,
              onChange: years => onChange({ years }),
            }
          : undefined
      }
    />
  );
}
