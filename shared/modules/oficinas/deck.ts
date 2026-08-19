import type {
  OficinasDataset,
  OficinasDeckPage,
  OficinasDeckState,
  OficinasSectionKey,
} from "./types.ts";

/**
 * Default deck of the Oficinas report.
 *
 * The order, the numbering and the titles are the ones of the published PDF
 * ("Informe semanal | Oficinas"). Page ids are a stored contract: a persisted
 * deck is resolved by id, so renaming one orphans the saved deck.
 *
 * The report is split into the five subsections of the PDF index rather than a
 * single "1. Servicio Soporte Oficinas" divider, which is what the index of the
 * published deck announces and what makes each pair of pages findable in the
 * sidebar.
 */

/** Service name shown as the dominant heading line on every Oficinas slide. */
export const OFICINAS_SERVICE = "Servicio Soporte Oficinas BBVA";
const SERVICE = OFICINAS_SERVICE;

interface PageSpec {
  id: string;
  kind: OficinasDeckPage["kind"];
  title: string;
  /** Dataset sections the page needs to render its data. Dividers declare none. */
  sections?: OficinasSectionKey[];
}

/**
 * Every page between the section divider "1." and the closing slide.
 *
 * Declared as data, not as literals inside `createDefaultOficinasDeck`, so the
 * merge that repairs already stored decks stays generic over this list: adding a
 * page here is enough, there is no second list of ids to keep in sync.
 */
export const OFICINAS_PAGE_SPECS: PageSpec[] = [
  { id: "oficinas-seccion-asignadas", kind: "section", title: "1.1 Incidencias asignadas" },
  {
    id: "oficinas-asignadas-dt",
    kind: "ofiAsignadasDT",
    title: "1.1 Incidencias asignadas por DT",
    sections: ["asignadas"],
  },
  {
    id: "oficinas-asignadas-elemento",
    kind: "ofiAsignadasElemento",
    title: "1.1 Incidencias asignadas por elemento",
    sections: ["asignadas"],
  },
  { id: "oficinas-seccion-resueltas", kind: "section", title: "1.2 Incidencias resueltas" },
  {
    id: "oficinas-resueltas-dt",
    kind: "ofiResueltasDT",
    title: "1.2 Incidencias resueltas por DT",
    sections: ["resueltas"],
  },
  {
    id: "oficinas-resueltas-elemento",
    kind: "ofiResueltasElemento",
    title: "1.2 Incidencias resueltas por elemento",
    sections: ["resueltas"],
  },
  { id: "oficinas-seccion-peticiones", kind: "section", title: "1.3 Peticiones" },
  {
    id: "oficinas-peticiones-dt",
    kind: "ofiPeticionesDT",
    title: "1.3 Peticiones por DT",
    sections: ["peticiones"],
  },
  {
    id: "oficinas-peticiones-tipo",
    kind: "ofiPeticionesTipo",
    title: "1.3 Peticiones por tipo",
    sections: ["peticiones"],
  },
  { id: "oficinas-seccion-encuestas", kind: "section", title: "1.4 Encuestas" },
  {
    id: "oficinas-encuestas",
    kind: "ofiEncuestas",
    title: "1.4 Valoración de las encuestas",
    sections: ["encuestas"],
  },
  { id: "oficinas-seccion-recicladores", kind: "section", title: "1.5 Recicladores" },
  {
    id: "oficinas-recicladores-dt",
    kind: "ofiRecicladoresDT",
    title: "1.5 Recicladores por DT",
    sections: ["recicladores"],
  },
  {
    id: "oficinas-recicladores-elemento",
    kind: "ofiRecicladoresElemento",
    title: "1.5 Recicladores por elemento",
    sections: ["recicladores"],
  },
  { id: "oficinas-seccion-kanban", kind: "section", title: "2. Kanban" },
  { id: "oficinas-kanban", kind: "notes", title: "2. Kanban" },
];

/** Sections a page needs, by page id. Empty for the pages with no dataset. */
export const OFICINAS_PAGE_SECTIONS: Record<string, OficinasSectionKey[]> =
  Object.fromEntries(
    OFICINAS_PAGE_SPECS.filter((spec) => spec.sections).map((spec) => [spec.id, spec.sections!])
  );

/**
 * True when the section carries something to draw.
 *
 * Per section rather than a generic "is a non-empty object": a section can be
 * present and empty — the upload writes `peticiones` even when the DT sheet is
 * missing — and a present-but-empty section must still fall back to the pending
 * slide rather than render an axis with no bars.
 */
function sectionHasRows(dataset: OficinasDataset, section: OficinasSectionKey): boolean {
  switch (section) {
    case "asignadas":
    case "resueltas": {
      const value = dataset[section];

      return (
        (value?.totalsByWeek?.length ?? 0) > 0 ||
        (value?.byDT?.some((matrix) => matrix.rows.length > 0) ?? false) ||
        (value?.byElement?.length ?? 0) > 0
      );
    }
    case "peticiones":
      return (
        (dataset.peticiones?.byDT?.length ?? 0) > 0 ||
        (dataset.peticiones?.byTipo?.length ?? 0) > 0
      );
    case "recicladores":
      return (
        (dataset.recicladores?.byDT?.length ?? 0) > 0 ||
        (dataset.recicladores?.byElemento?.length ?? 0) > 0
      );
    case "encuestas":
      return (dataset.encuestas?.porMes?.length ?? 0) > 0;
    default:
      return false;
  }
}

/** True when every section the page needs carries at least one row. */
export function hasSectionData(
  dataset: OficinasDataset | null,
  sections: OficinasSectionKey[]
): boolean {
  if (!dataset || sections.length === 0) {
    return false;
  }

  return sections.every((section) => sectionHasRows(dataset, section));
}

export function emptyOficinasDataset(): OficinasDataset {
  return { source: { sourceFile: null, uploadedAt: null } };
}

function createPage(spec: PageSpec): OficinasDeckPage {
  const base = {
    id: spec.id,
    kind: spec.kind,
    supportType: null,
    visible: true,
    weekSelection: null,
    years: null,
    overrides: {},
  } as const;

  if (spec.kind === "section") {
    return { ...base, text: { title: spec.title, subtitle: SERVICE } };
  }

  if (spec.kind === "notes") {
    return {
      ...base,
      text: { title: spec.title, subtitle: SERVICE, body: "" },
      images: [],
    };
  }

  return { ...base, text: { title: spec.title, subtitle: SERVICE, footnote: "" } };
}

export function createDefaultOficinasDeck(): OficinasDeckState {
  const pages: OficinasDeckPage[] = [
    {
      id: "cover",
      kind: "cover",
      supportType: null,
      text: {
        title: "Informe semanal del servicio",
        subtitle: SERVICE,
        period: "",
      },
      visible: true,
      weekSelection: null,
      years: null,
      overrides: {},
    },
    {
      id: "index",
      kind: "index",
      supportType: null,
      text: {
        title: "Contenido",
        item1: "1. Servicio Soporte Oficinas",
        item2: "2. Kanban",
      },
      visible: true,
      weekSelection: null,
      years: null,
      overrides: {},
      hiddenRows: [],
    },
    {
      id: "oficinas-seccion-servicio",
      kind: "section",
      supportType: null,
      text: { title: "1. Servicio Soporte Oficinas", subtitle: SERVICE },
      visible: true,
      weekSelection: null,
      years: null,
      overrides: {},
    },
  ];

  for (const spec of OFICINAS_PAGE_SPECS) {
    pages.push(createPage(spec));
  }

  pages.push({
    id: "closing",
    kind: "closing",
    supportType: null,
    text: { title: "Gracias", subtitle: "" },
    visible: true,
    weekSelection: null,
    years: null,
    overrides: {},
  });

  return { pages, updatedAt: null };
}

/**
 * Brings a stored deck up to date with the pages the default deck declares.
 *
 * The deck is persisted whole, so a deck saved before a page existed would never
 * show it again. This adds only what is missing, by id, and never touches a page
 * that is already there: titles, bodies, images, visibility and the order the
 * user chose survive untouched, and pages the user added by hand stay put.
 *
 * A missing page is inserted right after the nearest preceding default page the
 * stored deck still has, which puts it in its intended place without assuming
 * the rest of the deck kept the default order. It is never placed after the
 * closing slide.
 *
 * Deliberately a copy of `mergeAgaDeckTemplate` and not a shared helper: making
 * it generic would mean changing the AGA module, whose deck is the one already
 * in production. Generalising both is worth doing once a third module needs it.
 */
export function mergeOficinasDeckTemplate(deck: OficinasDeckState): OficinasDeckState {
  const reference = createDefaultOficinasDeck().pages;
  const kinds = new Map(reference.map((page) => [page.id, page.kind]));

  // A page the specs promoted from a placeholder to a data page keeps its stored
  // id, so a deck saved before the promotion carries the old kind and would
  // render as a placeholder forever. Only the kind is realigned; the text, the
  // images, the visibility and the position are the user's, not the template's.
  const pages = deck.pages.map((page) => {
    const kind = kinds.get(page.id);

    return kind && kind !== page.kind ? { ...page, kind } : page;
  });

  const present = new Set(pages.map((page) => page.id));

  reference.forEach((refPage, refIndex) => {
    if (present.has(refPage.id)) {
      return;
    }

    let insertAt = 0;

    for (let i = refIndex - 1; i >= 0; i -= 1) {
      const anchor = pages.findIndex((page) => page.id === reference[i].id);

      if (anchor !== -1) {
        insertAt = anchor + 1;
        break;
      }
    }

    if (refPage.kind !== "closing") {
      const closingIndex = pages.findIndex((page) => page.kind === "closing");

      if (closingIndex !== -1 && insertAt > closingIndex) {
        insertAt = closingIndex;
      }
    }

    pages.splice(insertAt, 0, refPage);
    present.add(refPage.id);
  });

  return { ...deck, pages };
}
