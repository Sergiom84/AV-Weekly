import type { AgaDataset } from "@shared/modules/aga/types";
import ManagedBreakdown from "./ManagedBreakdown";
import type { AgaPageProps } from "./PageShell";

interface GestionadasProductoPageProps extends AgaPageProps {
  dataset: AgaDataset;
}

/** `2.3 Top gestionadas por producto`: same comparison as 2.2, by product. */
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
    />
  );
}
