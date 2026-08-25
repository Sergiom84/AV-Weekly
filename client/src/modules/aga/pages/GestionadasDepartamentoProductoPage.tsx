import { AGA_PAGE_DEPARTMENT } from "@shared/modules/aga/deck";
import { AGA_PRODUCT_CHART_ROWS, departmentProducts } from "@shared/modules/aga/managed";
import type { AgaDataset } from "@shared/modules/aga/types";
import ManagedBreakdown from "./ManagedBreakdown";
import type { AgaPageProps } from "./PageShell";

interface GestionadasDepartamentoProductoPageProps extends AgaPageProps {
  dataset: AgaDataset;
}

/**
 * Slides 2.5 to 2.7: the product detail of one department.
 *
 * The three slides are the same chart over a different department, so the
 * department is read from `AGA_PAGE_DEPARTMENT` by page id instead of being
 * hardcoded in three renderers.
 */
export default function GestionadasDepartamentoProductoPage({
  dataset,
  ...props
}: GestionadasDepartamentoProductoPageProps) {
  const department = AGA_PAGE_DEPARTMENT[props.page.id] ?? "";

  return (
    <ManagedBreakdown
      {...props}
      dataset={dataset}
      rows={departmentProducts(dataset.managed, department)}
      categoryKey="producto"
      limit={AGA_PRODUCT_CHART_ROWS}
    />
  );
}
