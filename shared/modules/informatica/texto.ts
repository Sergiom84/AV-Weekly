import type { InformaticaDataset } from "./types.ts";

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
 */
export const INFORMATICA_TEXTO_HEADER = "INFORMATICA TEXTO PLANO v1";

export const INFORMATICA_TEXTO_SECTIONS = {
  /** `edificio` `dt` `aliasSmartTech` `aliasWorkOrder` `aliasImacs` `aliasPeticiones` `visible` `orden` */
  edificios: "EDIFICIOS",
  /** `mes` `semana` `categoria` `subcategoria` `metrica` `edificio` `tickets` */
  incidencias: "INCIDENCIAS",
  /** `mes` `valoracion` `respuestas` */
  encuestas: "ENCUESTAS",
  /** `mes` `semana` `edificio` `tipo` `ordenes` */
  workOrders: "WORKORDERS",
  /** `mes` `semana` `origen` `estado` `entidad` `total` */
  peticiones: "PETICIONES",
  /** `mes` `semana` `producto` `estado` `total` */
  peticionesProducto: "PETICIONESPRODUCTO",
  /** `mes` `semana` `edificio` `tipo` `citas` */
  citas: "CITAS",
  /** `mes` `ciudad` `metrica` `total` */
  imacs: "IMACS",
} as const;

/** Metadata keys of the preamble, written as `clave<TAB>valor`. */
export const INFORMATICA_TEXTO_META = {
  /** Reported extraction date, `YYYY-MM-DD`. Informative: every row carries its own period. */
  week: "semana",
  /** ISO timestamp of the Drive run. */
  generated: "generado",
  /** Source files the run read, separated by `;`. */
  source: "origen",
} as const;

export interface InformaticaTextoMeta {
  week?: string;
  generated?: string;
  source?: string;
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

export function serializeInformaticaTexto(
  dataset: InformaticaDataset,
  meta: InformaticaTextoMeta
): string {
  const preamble: string[] = [];

  if (meta.week) preamble.push(line(INFORMATICA_TEXTO_META.week, meta.week));
  if (meta.generated) preamble.push(line(INFORMATICA_TEXTO_META.generated, meta.generated));
  if (meta.source) preamble.push(line(INFORMATICA_TEXTO_META.source, meta.source));

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
      (dataset.encuestas ?? []).map((row) => line(row.mes, row.valoracion, row.respuestas))
    ),
    ...section(
      INFORMATICA_TEXTO_SECTIONS.workOrders,
      (dataset.workOrders ?? []).map((row) =>
        line(row.mes, row.semana, row.edificio, row.tipo, row.ordenes)
      )
    ),
    ...section(
      INFORMATICA_TEXTO_SECTIONS.peticiones,
      (dataset.peticiones ?? []).map((row) =>
        line(row.mes, row.semana, row.origen, row.estado, row.entidad, row.total)
      )
    ),
    ...section(
      INFORMATICA_TEXTO_SECTIONS.peticionesProducto,
      (dataset.peticionesProducto ?? []).map((row) =>
        line(row.mes, row.semana, row.producto, row.estado, row.total)
      )
    ),
    ...section(
      INFORMATICA_TEXTO_SECTIONS.citas,
      (dataset.citas ?? []).map((row) =>
        line(row.mes, row.semana, row.edificio, row.tipo, row.citas)
      )
    ),
    ...section(
      INFORMATICA_TEXTO_SECTIONS.imacs,
      (dataset.imacs ?? []).map((row) => line(row.mes, row.ciudad, row.metrica, row.total))
    ),
  ];

  return [INFORMATICA_TEXTO_HEADER, ...preamble, ...body].join("\n");
}
