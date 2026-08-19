import { dtMatrix, latestYear } from "@shared/modules/oficinas/derived";
import type { OficinasIncidencias } from "@shared/modules/oficinas/types";
import { DEFAULT_VARIANT, readVariant, variantLabel } from "../aggregate";
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
 * Neither section ships a year-on-year sheet, so the line draws the current
 * year alone rather than a previous year of invented zeros.
 *
 * The charted total is the dedicated total sheet only while the page shows the
 * "con validadoras" matrix, which is what that sheet counts. On the other two
 * variants the line is the column total of the matrix on screen: a line that
 * counts more incidents than the table under it is worse than one that differs
 * from the published total.
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

  return (
    <DTPage
      page={page}
      editing={editing}
      onChange={onChange}
      rows={rows}
      year={year}
      masters={dataset.masters}
      totals={variant === DEFAULT_VARIANT ? section?.totalsByWeek : undefined}
      caption={variantLabel(variant)}
      controls={
        <VariantSelector
          value={variant}
          onChange={value => onChange({ supportType: value })}
        />
      }
    />
  );
}
