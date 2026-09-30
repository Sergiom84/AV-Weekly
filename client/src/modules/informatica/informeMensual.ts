import {
  buildInformeMensual,
  mesCerrado,
  type InformeMensual,
  type MensualLabels,
  type MensualSlides,
} from "@shared/modules/informatica/mensual";
import { edificioCodeKey } from "@shared/modules/informatica/buildingCodes";
import type {
  InformaticaDataset,
  InformaticaEdificioRow,
} from "@shared/modules/informatica/types";
import {
  buildingDirectory,
  reportedSmartTechRows,
  WORK_ORDER_FALLBACK_SITE,
  workOrdersWithFallbackSite,
} from "./sources";

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
 * Dataset and site labels every monthly figure reads. Sites go through the same
 * filters as the weekly slides: unreported SmartTech points dropped, renamed
 * ones folded, and unmapped work orders under Sede.
 */
function monthlyInputs(dataset: InformaticaDataset): {
  scoped: InformaticaDataset;
  labels: MensualLabels;
} {
  const workOrders = siteLabeler(dataset.edificios ?? [], (row) => row.aliasWorkOrder);
  const smartTech = siteLabeler(dataset.edificios ?? [], (row) => row.aliasSmartTech);

  return {
    scoped: {
      ...dataset,
      citas: reportedSmartTechRows(dataset.citas ?? []),
      workOrders: workOrdersWithFallbackSite(dataset.workOrders ?? []),
    },
    labels: {
      workOrder: workOrders.labelOf,
      smartTech: smartTech.labelOf,
      workOrderSites: workOrders.sites,
      smartTechSites: smartTech.sites,
    },
  };
}

/** The monthly figures of one whole month. */
function informeDelMes(dataset: InformaticaDataset, month: string | null): InformeMensual {
  const { scoped, labels } = monthlyInputs(dataset);

  return buildInformeMensual(scoped, month, labels);
}

/**
 * Work-order site renamed to the SmartTech site of the same building, the way
 * the service names cities on the monthly slides. Zelandia reports under
 * Seguros, and the two Barcelona sites under Barcelona. A site missing here
 * keeps its city, the text before the comma, so two addresses in one city fold
 * into one row.
 */
const WORK_ORDER_SMARTTECH_SITE: Record<string, string> = {
  "Alicante, Méndez Nuñez": "Alicante",
  "Antoni Maura": "Barcelona",
  "Asia Planta 3 Ciudad BBVA": "Sede - Asia",
  "Baleares, Plaza del Olivar": "Mallorca",
  "Las Palmas, Albareda": "Canarias",
  "Principal América del Norte Ciudad BBVA": "Sede - Principal",
  "Tenerife La Marina": "Tenerife",
  "Tenerife, La Marina": "Tenerife",
  Terrasa: "Barcelona",
  Zelandia: "Seguros",
};

function smartTechSiteOf(site: string): string {
  return WORK_ORDER_SMARTTECH_SITE[site] ?? site.split(",")[0].trim();
}

/**
 * Work orders of a month by SmartTech site, alphabetical: every SmartTech site
 * listed, and the unmapped Sede bucket last.
 */
function workOrdersPorSede(
  workOrders: { site: string; total: number }[],
  smartTechSites: string[]
): { site: string; total: number }[] {
  const totals = new Map<string, number>(smartTechSites.map((site) => [smartTechSiteOf(site), 0]));
  let unmapped = 0;

  for (const row of workOrders) {
    if (row.site === WORK_ORDER_FALLBACK_SITE) {
      unmapped += row.total;
      continue;
    }

    const site = smartTechSiteOf(row.site);
    totals.set(site, (totals.get(site) ?? 0) + row.total);
  }

  const rows = Array.from(totals, ([site, total]) => ({ site, total })).sort((left, right) =>
    left.site.localeCompare(right.site, "es")
  );

  return unmapped > 0 ? [...rows, { site: WORK_ORDER_FALLBACK_SITE, total: unmapped }] : rows;
}

/**
 * Everything the two monthly slides draw, for the month before the extraction.
 * The slides and the speech both read it, so the speech says what is shown.
 */
export function mensualSlides(dataset: InformaticaDataset): MensualSlides {
  const { month, incidencias, encuestas } = mesCerrado(dataset);
  const informe = informeDelMes(dataset, month);
  const hasImacs = (dataset.imacs ?? []).some((row) => row.mes === month);
  const hasHic = (dataset.hic ?? []).some((row) => row.mes === month);

  return {
    month,
    incidencias,
    encuestas,
    peticiones: informe.peticiones,
    imacs: hasImacs ? informe.imacs : null,
    workOrders: workOrdersPorSede(
      informe.workOrders,
      informe.smartTech.map((row) => row.site)
    ),
    smartTech: informe.smartTech,
    topTen: hasHic ? [...informe.topTen].sort((left, right) => right.total - left.total) : null,
    slas: informe.slas,
  };
}
