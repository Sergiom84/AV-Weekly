import type { AgaDataset } from "@shared/modules/aga/types";
import ManagedBreakdown from "./ManagedBreakdown";
import type { AgaPageProps } from "./PageShell";

interface GestionadasUbicacionPageProps extends AgaPageProps {
  dataset: AgaDataset;
}

/**
 * `2.4 Top gestionadas por ubicación`: bars for the last reported week, with
 * the share of the busiest building alongside.
 *
 * The denominator of that share is the sum of the drawn bars, not the week
 * total of slide 2.1: a position with no building is counted in the total and
 * in no bar, so the two disagree by design.
 */
export default function GestionadasUbicacionPage({
  dataset,
  ...props
}: GestionadasUbicacionPageProps) {
  return (
    <ManagedBreakdown
      {...props}
      dataset={dataset}
      rows={dataset.managed?.byLocation ?? []}
      categoryKey="ubicacion"
      topShare
    />
  );
}
