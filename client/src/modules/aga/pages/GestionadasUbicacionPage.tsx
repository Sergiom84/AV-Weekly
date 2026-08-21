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
 * A full location total supplied by the source is the denominator. Legacy
 * chart-only datasets fall back to the drawn bars and label that value as a
 * subtotal instead of presenting it as complete.
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
