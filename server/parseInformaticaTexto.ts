import { unwrapDriveCopiedTexto } from "./driveTexto.ts";
import {
  INFORMATICA_TEXTO_HEADER,
  INFORMATICA_TEXTO_META,
  INFORMATICA_TEXTO_SECTIONS,
  type InformaticaTextoMeta,
} from "../shared/modules/informatica/texto.ts";
import type {
  InformaticaDataset,
  InformaticaSectionKey,
} from "../shared/modules/informatica/types.ts";

/**
 * Reads the text the Drive spreadsheet writes into its `PLANO` tab.
 *
 * The format is deliberately dumb, so the reader is too: it fails only on a
 * wrong header, and skips anything it cannot make sense of. A malformed row is
 * dropped rather than aborting the import, because the alternative is a week
 * with no report at all over one bad line.
 *
 * Cell order is the one `shared/modules/informatica/texto.ts` documents on each
 * section, and every section with a period leads with `fecha`.
 */

/** Cell count and builder of each section, keyed by its header text. */
const SECTIONS: Record<
  string,
  { key: InformaticaSectionKey; cells: number; build: (c: string[]) => unknown }
> = {
  [INFORMATICA_TEXTO_SECTIONS.edificios]: {
    key: "edificios",
    cells: 8,
    build: (c) => ({
      edificio: c[0],
      dt: c[1],
      aliasSmartTech: c[2],
      aliasWorkOrder: c[3],
      aliasImacs: c[4],
      aliasPeticiones: c[5],
      visible: !/^no$/i.test(c[6].trim()),
      orden: num(c[7]),
    }),
  },
  [INFORMATICA_TEXTO_SECTIONS.incidencias]: {
    key: "incidencias",
    cells: 8,
    build: (c) => ({
      fecha: day(c[0]),
      mes: c[1],
      semana: num(c[2]),
      categoria: c[3],
      subcategoria: c[4],
      metrica: c[5],
      edificio: c[6],
      tickets: num(c[7]),
    }),
  },
  [INFORMATICA_TEXTO_SECTIONS.encuestas]: {
    key: "encuestas",
    cells: 4,
    build: (c) => ({ fecha: day(c[0]), mes: c[1], valoracion: c[2], respuestas: num(c[3]) }),
  },
  [INFORMATICA_TEXTO_SECTIONS.workOrders]: {
    key: "workOrders",
    cells: 6,
    build: (c) => ({
      fecha: day(c[0]),
      mes: c[1],
      semana: num(c[2]),
      edificio: c[3],
      tipo: c[4],
      ordenes: num(c[5]),
    }),
  },
  [INFORMATICA_TEXTO_SECTIONS.peticiones]: {
    key: "peticiones",
    cells: 7,
    build: (c) => ({
      fecha: day(c[0]),
      mes: c[1],
      semana: num(c[2]),
      origen: c[3],
      estado: c[4],
      entidad: c[5],
      total: num(c[6]),
    }),
  },
  [INFORMATICA_TEXTO_SECTIONS.peticionesProducto]: {
    key: "peticionesProducto",
    cells: 6,
    build: (c) => ({
      fecha: day(c[0]),
      mes: c[1],
      semana: num(c[2]),
      producto: c[3],
      estado: c[4],
      total: num(c[5]),
    }),
  },
  [INFORMATICA_TEXTO_SECTIONS.peticionesAnual]: {
    key: "peticionesAnual",
    cells: 3,
    build: (c) => ({ anio: num(c[0]), mes: c[1], peticiones: num(c[2]) }),
  },
  [INFORMATICA_TEXTO_SECTIONS.citas]: {
    key: "citas",
    cells: 6,
    build: (c) => ({
      fecha: day(c[0]),
      mes: c[1],
      semana: num(c[2]),
      edificio: c[3],
      tipo: c[4],
      citas: num(c[5]),
    }),
  },
  [INFORMATICA_TEXTO_SECTIONS.citasAnual]: {
    key: "citasAnual",
    cells: 3,
    build: (c) => ({ anio: num(c[0]), mes: c[1], citas: num(c[2]) }),
  },
  [INFORMATICA_TEXTO_SECTIONS.imacs]: {
    key: "imacs",
    cells: 5,
    build: (c) => ({
      fecha: day(c[0]),
      mes: c[1],
      ciudad: c[2],
      metrica: c[3],
      total: num(c[4]),
    }),
  },
  [INFORMATICA_TEXTO_SECTIONS.wasp]: {
    key: "wasp",
    cells: 6,
    build: (c) => ({
      fecha: day(c[0]), mes: c[1], semana: num(c[2]), proveedor: c[3], estado: c[4], equipos: num(c[5]),
    }),
  },
  [INFORMATICA_TEXTO_SECTIONS.renove]: {
    key: "renove",
    cells: 6,
    build: (c) => ({
      fecha: day(c[0]), mes: c[1], semana: num(c[2]), ambito: c[3], estado: c[4], equipos: num(c[5]),
    }),
  },
  [INFORMATICA_TEXTO_SECTIONS.hic]: {
    key: "hic",
    cells: 5,
    build: (c) => ({ ambito: c[0], mes: c[1], categoria: c[2], metrica: c[3], total: num(c[4]) }),
  },
  [INFORMATICA_TEXTO_SECTIONS.comparativas]: {
    key: "comparativas",
    cells: 4,
    build: (c) => ({ vista: c[0], elemento: c[1], mes: c[2], total: num(c[3]) }),
  },
  [INFORMATICA_TEXTO_SECTIONS.slas]: {
    key: "slas",
    cells: 5,
    build: (c) => ({ mes: c[0], svt: c[1], cumplido: num(c[2]), incumplido: num(c[3]), total: num(c[4]) }),
  },
};

/**
 * The `fecha` cell, or `null` when the section left it empty.
 *
 * Not for the client's sake: `isoDay` in
 * `client/src/modules/informatica/aggregate.ts` already reads `""` and `null`
 * the same way, since neither matches its date pattern. The reason is the
 * contract. `InformaticaDateCell` is `number | string | null`, and `""` is a
 * string that means "no date" — a second spelling of absence that every
 * consumer would have to know about. It also breaks the round trip: the
 * serialiser writes `null` as an empty cell, so reading that cell back as `""`
 * would make serialise-then-parse stop being the identity.
 */
function day(value: string): string | null {
  const trimmed = String(value ?? "").trim();

  return trimmed === "" ? null : trimmed;
}

const META_BY_LABEL: Record<string, keyof InformaticaTextoMeta> = {
  [INFORMATICA_TEXTO_META.week]: "week",
  [INFORMATICA_TEXTO_META.generated]: "generated",
  [INFORMATICA_TEXTO_META.source]: "source",
  [INFORMATICA_TEXTO_META.asOfDate]: "asOfDate",
  [INFORMATICA_TEXTO_META.scope]: "scope",
};

/** `1.480` and `1,480` are the same number: the sheet writes group separators. */
function num(value: string): number {
  const parsed = Number(String(value).replace(/[.\s]/g, "").replace(",", "."));

  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseInformaticaTexto(texto: string): {
  dataset: InformaticaDataset;
  meta: InformaticaTextoMeta;
} {
  const lines = unwrapDriveCopiedTexto(texto).split("\n");

  if (lines.length === 0 || lines[0].trim() !== INFORMATICA_TEXTO_HEADER) {
    throw new Error(
      'El texto no empieza por "' + INFORMATICA_TEXTO_HEADER + '". Copia la pestaña PLANO entera.'
    );
  }

  const meta: InformaticaTextoMeta = {};
  const rows: Partial<Record<InformaticaSectionKey, unknown[]>> = {};
  let current: (typeof SECTIONS)[string] | null = null;

  for (const raw of lines.slice(1)) {
    const trimmed = raw.trim();

    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }

    const header = /^\[(.+)\]$/.exec(trimmed);

    if (header) {
      current = SECTIONS[header[1].trim().toUpperCase()] ?? null;
      continue;
    }

    const cells = raw.split("\t");

    if (current === null) {
      const key = META_BY_LABEL[cells[0]?.trim()];

      if (key && cells.length >= 2) {
        meta[key] = cells[1].trim();
      }

      continue;
    }

    if (cells.length < current.cells) {
      continue;
    }

    (rows[current.key] ??= []).push(current.build(cells.slice(0, current.cells)));
  }

  const dataset = { ...rows } as InformaticaDataset;

  dataset.sheetsFound = (Object.keys(rows) as InformaticaSectionKey[]).filter(
    (key) => (rows[key] ?? []).length > 0
  );

  return { dataset, meta };
}
