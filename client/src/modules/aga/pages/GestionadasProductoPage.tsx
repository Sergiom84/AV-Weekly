import { AGA_PRODUCT_CHART_ROWS } from "@shared/modules/aga/managed";
import type { AgaDataset } from "@shared/modules/aga/types";
import ManagedBreakdown from "./ManagedBreakdown";
import type { AgaPageProps } from "./PageShell";

interface GestionadasProductoPageProps extends AgaPageProps {
  dataset: AgaDataset;
}

/**
 * `2.3 Top gestionadas por producto`: same comparison as 2.2, by product.
 *
 * The dataset carries every product of the week, some sixty of them, and the
 * slide draws the busiest ones. The cut is applied here rather than at import
 * so the previous-week bar of a product that has just reached the top is its
 * real figure and not a zero.
 */
export default function GestionadasProductoPage({
  dataset,
  ...props
}: GestionadasProductoPageProps) {
  return (
    <ManagedBreakdown
      {...props}
      dataset={dataset}
      rows={dataset.managed?.byProduct ?? []}
      categoryKey="producto"
      limit={AGA_PRODUCT_CHART_ROWS}
    />
  );
}
