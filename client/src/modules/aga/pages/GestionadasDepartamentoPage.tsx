import type { AgaDataset } from "@shared/modules/aga/types";
import ManagedBreakdown from "./ManagedBreakdown";
import type { AgaPageProps } from "./PageShell";

interface GestionadasDepartamentoPageProps extends AgaPageProps {
  dataset: AgaDataset;
}

/** `2.2 Top gestionadas por departamento`: grouped bars for the two last weeks. */
export default function GestionadasDepartamentoPage({
  dataset,
  ...props
}: GestionadasDepartamentoPageProps) {
  return (
    <ManagedBreakdown
      {...props}
      dataset={dataset}
      rows={dataset.managed?.byDepartment ?? []}
      categoryKey="departamento"
    />
  );
}
