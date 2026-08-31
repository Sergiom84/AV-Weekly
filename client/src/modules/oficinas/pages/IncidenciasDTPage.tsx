import {
  comparisonSeries,
  dtMatrix,
  latestYear,
  reportWeek,
  seriesYears,
} from "@shared/modules/oficinas/derived";
import type { OficinasIncidencias } from "@shared/modules/oficinas/types";
import { readVariant, variantLabel } from "../aggregate";
import { oficinasYearSelector } from "../yearSelection";
import DTPage from "./DTPage";
import { type OficinasDataPageProps } from "./PageShell";
import VariantSelector from "./VariantSelector";

interface IncidenciasDTPageProps extends OficinasDataPageProps {
  section: OficinasIncidencias | undefined;
}

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
 * The slide prints the three validator matrices side by side, so the variant
 * selector does not choose a table: it chooses the scope the bars are drawn at,
 * and with it the past years the year selector may offer.
 *
 * The two selectors compose, and the second is bounded by the first.
 * `comparisonSeries` answers which years exist at the scope the page is charting,
 * so switching to "solo validadoras" drops the past-year chips rather than
 * charting a "sin validadoras" past year against a "solo" present one. Today
 * the historico is a "sin validadoras" series, which is the variant the client
 * deck publishes; the "con" bars keep the template's own total sheet, which is
 * what that sheet counts.
 *
 * The charted current year follows the same rule: the total sheet while the page
 * charts the "con validadoras" matrix, and the column total of the matrix on
 * screen otherwise. Bars that count more incidents than the table under them are
 * worse than ones that differ from the published total.
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
  return (
    <DTPage
      page={page}
      editing={editing}
      onChange={onChange}
      rows={rows}
      tables={[
        {
          caption: "Comparativa sin Validadoras",
          rows: dtMatrix(section, "sin"),
        },
        { caption: "Total con Validadoras", rows: dtMatrix(section, "con") },
        {
          caption: "Validadoras",
          rows: dtMatrix(section, "solo"),
          aggregates: false,
        },
      ]}
      year={year}
      masters={dataset.masters}
      totals={variant === "con" ? section?.totalsByWeek : undefined}
      throughWeek={reportWeek(dataset, year)}
      layout="incidencias-territoriales"
      caption={variantLabel(variant)}
      controls={
        <VariantSelector
          value={variant}
          onChange={value => onChange({ supportType: value })}
        />
      }
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
