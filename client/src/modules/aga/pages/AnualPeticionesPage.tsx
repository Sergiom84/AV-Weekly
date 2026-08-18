import type { AgaDataset } from "@shared/modules/aga/types";
import AnualEvolution from "./AnualEvolution";
import type { AgaPageProps } from "./PageShell";

interface AnualPeticionesPageProps extends AgaPageProps {
  dataset: AgaDataset;
}

/** `3.1 Evolución anual de peticiones`: one line per year over the twelve months. */
export default function AnualPeticionesPage({
  dataset,
  ...props
}: AnualPeticionesPageProps) {
  return <AnualEvolution {...props} years={dataset.annual?.peticiones ?? []} />;
}
