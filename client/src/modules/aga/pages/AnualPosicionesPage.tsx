import type { AgaDataset } from "@shared/modules/aga/types";
import AnualEvolution from "./AnualEvolution";
import type { AgaPageProps } from "./PageShell";

interface AnualPosicionesPageProps extends AgaPageProps {
  dataset: AgaDataset;
}

/** `3.2 Evolución anual de posiciones`: same chart as 3.1, on positions. */
export default function AnualPosicionesPage({
  dataset,
  ...props
}: AnualPosicionesPageProps) {
  return <AnualEvolution {...props} years={dataset.annual?.posiciones ?? []} />;
}
