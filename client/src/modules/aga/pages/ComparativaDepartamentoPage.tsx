import type { AgaDataset } from "@shared/modules/aga/types";
import { withoutSupport } from "../aggregate";
import type { AgaPageProps } from "./PageShell";
import TwoWeekCompare from "./TwoWeekCompare";

interface ComparativaDepartamentoPageProps extends AgaPageProps {
  dataset: AgaDataset;
}

/**
 * `Comparativa dos semanas por departamento`: grouped bars per department for
 * the penultimate and the last reported week. Regional support is out of the
 * chart — see `EXCLUDED_DEPARTMENT`.
 */
export default function ComparativaDepartamentoPage({
  dataset,
  ...props
}: ComparativaDepartamentoPageProps) {
  return (
    <TwoWeekCompare
      {...props}
      dataset={dataset}
      categoryKey="departamento"
      breakdownOf={(week) => withoutSupport(week.byDepartment)}
    />
  );
}
