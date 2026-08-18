import type { AgaDataset } from "@shared/modules/aga/types";
import type { AgaPageProps } from "./PageShell";
import TwoWeekCompare from "./TwoWeekCompare";

interface ComparativaProyectoPageProps extends AgaPageProps {
  dataset: AgaDataset;
}

/**
 * `Comparativa por proyecto`: grouped bars per project for the penultimate and
 * the last reported week. Rows with no project are already out of `byProject`,
 * so the totals here are lower than the weekly total on purpose.
 */
export default function ComparativaProyectoPage({
  dataset,
  ...props
}: ComparativaProyectoPageProps) {
  return (
    <TwoWeekCompare
      {...props}
      dataset={dataset}
      categoryKey="proyecto"
      breakdownOf={(week) => week.byProject}
    />
  );
}
