import {
  buildInformeMensual,
  mesCerrado,
  previousMonth,
  type InformeMensual,
  type MensualComparativa,
  type MensualEvolucion,
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
import { workOrderTypeLabel } from "./palette";

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
 * Seguros. A site missing here
 * keeps its city, the text before the comma, so two addresses in one city fold
 * into one row.
 */
const WORK_ORDER_SMARTTECH_SITE: Record<string, string> = {
  "Alicante, Méndez Nuñez": "Alicante",
  "Asia Planta 3 Ciudad BBVA": "Sede - Asia",
  "Baleares, Plaza del Olivar": "Mallorca",
  "Las Palmas, Albareda": "Canarias",
  "Principal América del Norte Ciudad BBVA": "Sede - Principal",
  "Tenerife La Marina": "Tenerife",
  "Tenerife, La Marina": "Tenerife",
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

/** Months compared against: the six before the reported one. */
const HISTORY_MONTHS = 6;

function monthsBefore(month: string, count: number): string[] {
  const months: string[] = [];
  let cursor = month;

  for (let index = 0; index < count; index += 1) {
    cursor = previousMonth(cursor);
    months.push(cursor);
  }

  return months;
}

function average(values: number[]): number | null {
  return values.length === 0
    ? null
    : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/** Work orders of a month by final site and type, `site -> type -> total`. */
function workOrderTypes(dataset: InformaticaDataset, month: string): Map<string, Map<string, number>> {
  const { labels } = monthlyInputs(dataset);
  const bySite = new Map<string, Map<string, number>>();

  for (const row of workOrdersWithFallbackSite(dataset.workOrders ?? [])) {
    if (row.mes !== month) {
      continue;
    }

    const raw = labels.workOrder(row.edificio);
    const site = raw === WORK_ORDER_FALLBACK_SITE ? raw : smartTechSiteOf(raw);
    const types = bySite.get(site) ?? new Map<string, number>();
    const tipo = workOrderTypeLabel(row.tipo).toLowerCase();

    types.set(tipo, (types.get(tipo) ?? 0) + row.ordenes);
    bySite.set(site, types);
  }

  return bySite;
}

/**
 * The closed month against the one before and the six before, for the
 * speech: incidents opened, the top ten, and every work-order and SmartTech
 * site with what its figure is made of.
 */
export function mensualComparativa(
  dataset: InformaticaDataset,
  slides: MensualSlides
): MensualComparativa {
  const month = slides.month;

  if (month === null) {
    return {
      previousMonth: null,
      incidencias: { anterior: null, media: null },
      topTenAnterior: null,
      workOrders: [],
      workOrdersAnterior: null,
      smartTech: [],
      smartTechAnterior: null,
    };
  }

  const previous = previousMonth(month);
  const history = monthsBefore(month, HISTORY_MONTHS);
  const monthsWith = (rows: { mes: string }[] | undefined) =>
    new Set((rows ?? []).map((row) => row.mes));
  const workMonths = monthsWith(dataset.workOrders);
  const citaMonths = monthsWith(dataset.citas);
  const perMonth = new Map(
    [previous, ...history].map((target) => [target, informeDelMes(dataset, target)])
  );
  const sitesOf = (target: string) => {
    const informe = perMonth.get(target)!;

    return {
      work: new Map(
        workOrdersPorSede(informe.workOrders, informe.smartTech.map((row) => row.site)).map(
          (row) => [row.site, row.total]
        )
      ),
      citas: new Map(informe.smartTech.map((row) => [row.site, row])),
    };
  };
  const before = sitesOf(previous);
  const past = history.map((target) => ({ target, ...sitesOf(target) }));

  const opened = (target: string) =>
    (dataset.incidenciasOnsite ?? [])
      .filter((row) => row.mes === target && row.metrica.trim().toUpperCase() === "ABIERTAS")
      .reduce<number | null>((sum, row) => (sum ?? 0) + row.total, null);

  const typesNow = workOrderTypes(dataset, month);
  const typesBefore = workOrderTypes(dataset, previous);
  const workOrders: MensualEvolucion[] = slides.workOrders.map((row) => {
    const now = typesNow.get(row.site) ?? new Map<string, number>();
    const then = typesBefore.get(row.site) ?? new Map<string, number>();
    const tipos = new Set([...Array.from(now.keys()), ...Array.from(then.keys())]);

    return {
      site: row.site,
      total: row.total,
      anterior: before.work.get(row.site) ?? 0,
      media: average(
        past
          .filter((entry) => workMonths.has(entry.target))
          .map((entry) => entry.work.get(row.site) ?? 0)
      ),
      desglose: Array.from(tipos).map((nombre) => ({
        nombre,
        total: now.get(nombre) ?? 0,
        anterior: then.get(nombre) ?? 0,
      })),
    };
  });
  const smartTech: MensualEvolucion[] = slides.smartTech.map((row) => {
    const then = before.citas.get(row.site);

    return {
      site: row.site,
      total: row.conCita + row.sinCita,
      anterior: then ? then.conCita + then.sinCita : 0,
      media: average(
        past
          .filter((entry) => citaMonths.has(entry.target))
          .map((entry) => {
            const cita = entry.citas.get(row.site);
            return cita ? cita.conCita + cita.sinCita : 0;
          })
      ),
      desglose: [
        { nombre: "las citas con cita previa", total: row.conCita, anterior: then?.conCita ?? 0 },
        { nombre: "las visitas sin cita", total: row.sinCita, anterior: then?.sinCita ?? 0 },
      ],
    };
  });
  const hasHicBefore = (dataset.hic ?? []).some((row) => row.mes === previous);

  return {
    previousMonth: previous,
    incidencias: {
      anterior: opened(previous),
      media: average(
        history.map(opened).filter((value): value is number => value !== null)
      ),
    },
    topTenAnterior: hasHicBefore ? perMonth.get(previous)!.topTen : null,
    workOrders,
    workOrdersAnterior: workMonths.has(previous)
      ? Array.from(before.work.values()).reduce((sum, value) => sum + value, 0)
      : null,
    smartTech,
    smartTechAnterior: citaMonths.has(previous)
      ? Array.from(before.citas.values()).reduce((sum, row) => sum + row.conCita + row.sinCita, 0)
      : null,
  };
}
