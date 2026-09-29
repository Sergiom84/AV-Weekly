import type { InformaticaDataset, InformaticaDateCell } from "./types.ts";

/**
 * Plain-text exchange format of the Informatica module.
 *
 * Same reasoning as `shared/modules/aga/texto.ts`: the weekly aggregation runs
 * in a Drive spreadsheet, the aggregates have to be auditable before they reach
 * the deck, and the raw exports name individuals while this format carries
 * counts only.
 *
 * Sections have no column-header line. The order of the cells is fixed and
 * documented on each entry below, and the reader depends on that order.
 *
 * Every section that has a period leads with `fecha`, as `YYYY-MM-DD`. It is
 * not redundant with `mes` and `semana`: the client resolves the reported
 * window from the date and not from the largest `semana`, because over a sheet
 * spanning more than a year the largest week number falls in the previous
 * December. Dropping `fecha` empties the weekly pages instead of breaking them,
 * which is the kind of failure that ships unnoticed.
 */
export const INFORMATICA_TEXTO_HEADER = "INFORMATICA TEXTO PLANO v1";

export const INFORMATICA_TEXTO_SECTIONS = {
  /**
   * `edificio` `dt` `aliasSmartTech` `aliasWorkOrder` `aliasImacs` `aliasPeticiones` `visible` `orden`
   * — dimension table, no period. The weekly Drive text omits this section so
   * street addresses never leave the spreadsheet; data rows use `E{hash}` and
   * the app expands them against the stored table.
   */
  edificios: "EDIFICIOS",
  /** `fecha` `mes` `semana` `categoria` `subcategoria` `metrica` `edificio` `tickets` */
  incidencias: "INCIDENCIAS",
  /** `fecha` `mes` `valoracion` `respuestas` */
  encuestas: "ENCUESTAS",
  /** `fecha` `mes` `semana` `edificio` `tipo` `ordenes` */
  workOrders: "WORKORDERS",
  /** `fecha` `mes` `semana` `origen` `estado` `entidad` `total` */
  peticiones: "PETICIONES",
  /** `fecha` `mes` `semana` `producto` `estado` `total` */
  peticionesProducto: "PETICIONESPRODUCTO",
  /** `anio` `mes` `peticiones` — historical annual comparison. */
  peticionesAnual: "PETICIONESANUAL",
  /** `fecha` `mes` `semana` `edificio` `tipo` `citas` */
  citas: "CITAS",
  /** `anio` `mes` `citas` — historical annual comparison. */
  citasAnual: "CITASANUAL",
  /** `fecha` `mes` `ciudad` `metrica` `total` */
  imacs: "IMACS",
  /** `fecha` `mes` `semana` `proveedor` `estado` `equipos` — optional until its source is supplied. */
  wasp: "WASP",
  /** `fecha` `mes` `semana` `ambito` `estado` `equipos` — optional and not active in the deck. */
  renove: "RENOVE",
  /** `ambito` `mes` `categoria` `metrica` `total` — historical incident volumetry. */
  hic: "HIC",
  /** `vista` `elemento` `mes` `total` — three-month incident comparison. */
  comparativas: "COMPARATIVAS",
  /** `mes` `svt` `cumplido` `incumplido` `total` — monthly SLA results. */
  slas: "SLAS",
  /** `mes` `metrica` `total` — opened, resolved and pending stock from tab 7-7. */
  incidenciasOnsite: "INCIDENCIASONSITE",
  /** `mes` `origen` `estado` `total` — full-month request files, separate from the weekly snapshot. */
  peticionesMes: "PETICIONESMES",
} as const;

/** Metadata keys of the preamble, written as `clave<TAB>valor`. */
export const INFORMATICA_TEXTO_META = {
  /** Reported extraction date, `YYYY-MM-DD`. Informative: every row carries its own period. */
  week: "semana",
  /** ISO timestamp of the Drive run. */
  generated: "generado",
  /** Source files the run read, separated by `;`. */
  source: "origen",
  /** Explicit extraction date for period-sensitive sections. */
  asOfDate: "asOfDate",
  /** The whole dataset snapshot is present; omitted sections must not survive from an older import. */
  scope: "alcance",
} as const;

export interface InformaticaTextoMeta {
  week?: string;
  generated?: string;
  source?: string;
  asOfDate?: string;
  scope?: string;
}

const TAB = "\t";

function line(...cells: (string | number)[]): string {
  return cells.join(TAB);
}

function section(name: string, rows: string[]): string[] {
  return rows.length === 0 ? [] : ["", "[" + name + "]", ...rows];
}

/** `Si`/`No` of `Visible` as the sheet writes it, so a round trip is stable. */
function flag(value: boolean): string {
  return value ? "Si" : "No";
}

/** Excel counts days from this date, and 1900 is wrongly a leap year in it. */
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

const ISO_DAY = /^\d{4}-\d{2}-\d{2}/;

/**
 * `fecha` as `YYYY-MM-DD`, or an empty cell when the row has no date.
 *
 * `InformaticaDateCell` admits the Excel serial the template writes, ISO text
 * from a workbook edited by hand, and `null`. The serial is resolved here
 * rather than passed through, so the reader never has to know the epoch and the
 * text stays legible to the colleague who audits it.
 *
 * The time of day is dropped: a timestamp near midnight moves the day when it
 * is rendered in another timezone, and with the day moves the week the row is
 * counted in. An empty cell round-trips back to `null`, which is why a missing
 * date is written as nothing at all and never as a placeholder.
 */
function isoDay(value: InformaticaDateCell): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(EXCEL_EPOCH_UTC + Math.floor(value) * 86400000).toISOString().slice(0, 10);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    return ISO_DAY.test(trimmed) ? trimmed.slice(0, 10) : trimmed;
  }

  return "";
}

export function serializeInformaticaTexto(
  dataset: InformaticaDataset,
  meta: InformaticaTextoMeta
): string {
  const preamble: string[] = [];

  if (meta.week) preamble.push(line(INFORMATICA_TEXTO_META.week, meta.week));
  if (meta.generated) preamble.push(line(INFORMATICA_TEXTO_META.generated, meta.generated));
  if (meta.source) preamble.push(line(INFORMATICA_TEXTO_META.source, meta.source));
  if (meta.asOfDate) preamble.push(line(INFORMATICA_TEXTO_META.asOfDate, meta.asOfDate));
  if (meta.scope === "completo") preamble.push(line(INFORMATICA_TEXTO_META.scope, meta.scope));

  const body = [
    ...section(
      INFORMATICA_TEXTO_SECTIONS.edificios,
      (dataset.edificios ?? []).map((row) =>
        line(
          row.edificio,
          row.dt,
          row.aliasSmartTech,
          row.aliasWorkOrder,
          row.aliasImacs,
          row.aliasPeticiones,
          flag(row.visible),
          row.orden
        )
      )
    ),
    ...section(
      INFORMATICA_TEXTO_SECTIONS.incidencias,
      (dataset.incidencias ?? []).map((row) =>
        line(
          isoDay(row.fecha),
          row.mes,
          row.semana,
          row.categoria,
          row.subcategoria,
          row.metrica,
          row.edificio,
          row.tickets
        )
      )
    ),
    ...section(
      INFORMATICA_TEXTO_SECTIONS.encuestas,
      (dataset.encuestas ?? []).map((row) =>
        line(isoDay(row.fecha), row.mes, row.valoracion, row.respuestas)
      )
    ),
    ...section(
      INFORMATICA_TEXTO_SECTIONS.workOrders,
      (dataset.workOrders ?? []).map((row) =>
        line(isoDay(row.fecha), row.mes, row.semana, row.edificio, row.tipo, row.ordenes)
      )
    ),
    ...section(
      INFORMATICA_TEXTO_SECTIONS.peticiones,
      (dataset.peticiones ?? []).map((row) =>
        line(
          isoDay(row.fecha),
          row.mes,
          row.semana,
          row.origen,
          row.estado,
          row.entidad,
          row.total
        )
      )
    ),
    ...section(
      INFORMATICA_TEXTO_SECTIONS.peticionesProducto,
      (dataset.peticionesProducto ?? []).map((row) =>
        line(isoDay(row.fecha), row.mes, row.semana, row.producto, row.estado, row.total)
      )
    ),
    ...section(
      INFORMATICA_TEXTO_SECTIONS.peticionesAnual,
      (dataset.peticionesAnual ?? []).map((row) => line(row.anio, row.mes, row.peticiones))
    ),
    ...section(
      INFORMATICA_TEXTO_SECTIONS.citas,
      (dataset.citas ?? []).map((row) =>
        line(isoDay(row.fecha), row.mes, row.semana, row.edificio, row.tipo, row.citas)
      )
    ),
    ...section(
      INFORMATICA_TEXTO_SECTIONS.citasAnual,
      (dataset.citasAnual ?? []).map((row) => line(row.anio, row.mes, row.citas))
    ),
    ...section(
      INFORMATICA_TEXTO_SECTIONS.imacs,
      (dataset.imacs ?? []).map((row) =>
        line(isoDay(row.fecha), row.mes, row.ciudad, row.metrica, row.total)
      )
    ),
    ...section(
      INFORMATICA_TEXTO_SECTIONS.wasp,
      (dataset.wasp ?? []).map((row) =>
        line(isoDay(row.fecha), row.mes, row.semana, row.proveedor, row.estado, row.equipos)
      )
    ),
    ...section(
      INFORMATICA_TEXTO_SECTIONS.renove,
      (dataset.renove ?? []).map((row) =>
        line(isoDay(row.fecha), row.mes, row.semana, row.ambito, row.estado, row.equipos)
      )
    ),
    ...section(
      INFORMATICA_TEXTO_SECTIONS.hic,
      (dataset.hic ?? []).map((row) =>
        line(row.ambito, row.mes, row.categoria, row.metrica, row.total)
      )
    ),
    ...section(
      INFORMATICA_TEXTO_SECTIONS.comparativas,
      (dataset.comparativas ?? []).map((row) => line(row.vista, row.elemento, row.mes, row.total))
    ),
    ...section(
      INFORMATICA_TEXTO_SECTIONS.slas,
      (dataset.slas ?? []).map((row) =>
        line(row.mes, row.svt, row.cumplido, row.incumplido, row.total)
      )
    ),
    ...section(
      INFORMATICA_TEXTO_SECTIONS.incidenciasOnsite,
      (dataset.incidenciasOnsite ?? []).map((row) => line(row.mes, row.metrica, row.total))
    ),
    ...section(
      INFORMATICA_TEXTO_SECTIONS.peticionesMes,
      (dataset.peticionesMes ?? []).map((row) =>
        line(row.mes, row.origen, row.estado, row.total)
      )
    ),
  ];

  return [INFORMATICA_TEXTO_HEADER, ...preamble, ...body].join("\n");
}
