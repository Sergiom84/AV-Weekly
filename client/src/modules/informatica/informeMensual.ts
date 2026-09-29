import {
  buildInformeMensual,
  closedMonth,
  reportedMonth,
  type InformeMensual,
} from "@shared/modules/informatica/mensual";
import { edificioCodeKey } from "@shared/modules/informatica/buildingCodes";
import type {
  InformaticaDataset,
  InformaticaDeckPage,
  InformaticaEdificioRow,
} from "@shared/modules/informatica/types";
import {
  buildingDirectory,
  reportedSmartTechRows,
  workOrdersWithFallbackSite,
} from "./sources";

export interface InformeMensualView {
  informe: InformeMensual;
  /** Months the editor can pick, oldest first. */
  months: string[];
}

/** Months with a monthly figure, up to the extraction month. */
function availableMonths(dataset: InformaticaDataset): string[] {
  const cut = reportedMonth(dataset.source?.asOfDate);
  const months = new Set<string>();

  for (const rows of [dataset.incidenciasOnsite, dataset.hic, dataset.slas, dataset.workOrders]) {
    for (const row of rows ?? []) {
      if (/^\d{4}\/\d{2}$/.test(row.mes) && (cut === null || row.mes <= cut)) {
        months.add(row.mes);
      }
    }
  }

  return Array.from(months).sort();
}

/**
 * Site of a raw label, matched the way the weekly text codes buildings.
 *
 * The coded text is decoded to the first catalogue label with the same code,
 * so August's Baleares orders come back as `Baleares Plaza del Olivar` while
 * the work-order alias reads `Baleares, Plaza del Olivar`. An exact lookup
 * would list the site twice, once empty; the code key treats them as one.
 */
function siteLabeler(
  edificios: InformaticaEdificioRow[],
  aliasOf: (row: InformaticaEdificioRow) => string
): { labelOf: (raw: string) => string; sites: string[] } {
  const directory = buildingDirectory(edificios, aliasOf);
  const byKey = new Map<string, string>();

  for (const row of edificios) {
    const alias = aliasOf(row).trim();
    const site = directory.nameOf(alias);

    if (alias !== "" && site !== null && !byKey.has(edificioCodeKey(alias))) {
      byKey.set(edificioCodeKey(alias), site);
    }
  }

  return {
    labelOf: (raw) => directory.nameOf(raw) ?? byKey.get(edificioCodeKey(raw)) ?? raw,
    sites: directory.sites,
  };
}

/**
 * The monthly close as the slide and the speech both read it.
 *
 * One place so the two cannot disagree. Sites go through the same filters as
 * the weekly slides: unreported SmartTech points dropped, renamed ones folded,
 * and unmapped work orders under Sede.
 */
export function informeMensualView(
  dataset: InformaticaDataset,
  page: InformaticaDeckPage | undefined
): InformeMensualView {
  const months = availableMonths(dataset);
  const picked = page?.monthSelection?.to;
  const fallback = closedMonth(dataset.source?.asOfDate);
  const month =
    picked && months.includes(picked)
      ? picked
      : fallback && months.includes(fallback)
        ? fallback
        : (months[months.length - 1] ?? null);
  const workOrders = siteLabeler(dataset.edificios ?? [], (row) => row.aliasWorkOrder);
  const smartTech = siteLabeler(dataset.edificios ?? [], (row) => row.aliasSmartTech);
  const scoped: InformaticaDataset = {
    ...dataset,
    citas: reportedSmartTechRows(dataset.citas ?? []),
    workOrders: workOrdersWithFallbackSite(dataset.workOrders ?? []),
  };

  return {
    months,
    informe: buildInformeMensual(scoped, month, {
      workOrder: workOrders.labelOf,
      smartTech: smartTech.labelOf,
      workOrderSites: workOrders.sites,
      smartTechSites: smartTech.sites,
    }),
  };
}
