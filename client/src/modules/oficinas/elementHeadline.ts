import { totalOffices } from "@shared/modules/oficinas/derived";
import type { OficinasMasters } from "@shared/modules/oficinas/types";

export function elementHeadlineStats(
  total: number,
  masters: OficinasMasters | undefined,
  reportedWeeks: number
) {
  const offices = totalOffices(masters);

  return {
    total,
    offices,
    ratio: offices === 0 ? null : total / offices,
    average: reportedWeeks === 0 ? null : total / reportedWeeks,
  };
}
