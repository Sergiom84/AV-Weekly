import type {
  AgaDataset,
  AgaDeckPage,
  AgaDeckState,
  AgaSectionKey,
} from "./types.ts";

/**
 * Default deck of the AGA report (weekly PetMicro follow-up).
 *
 * The page order and the titles are the ones of the original PPTX. Page ids are
 * a stored contract: a persisted deck is resolved by id, so renaming one
 * orphans the saved deck.
 */

/** Service name shown as the dominant heading line on every AGA slide. */
export const AGA_SERVICE = "Servicio PetMicro";
const SERVICE = AGA_SERVICE;

interface PageSpec {
  id: string;
  kind: AgaDeckPage["kind"];
  title: string;
  footnote?: string;
  /** Dataset sections the page needs to render its data. */
  sections: AgaSectionKey[];
}

/** The four data pages of the report, in the order of the original deck. */
export const AGA_PAGE_SPECS: PageSpec[] = [
  {
    id: "aga-total-semanal",
    kind: "agaTotalWeekly",
    title: "Total posiciones en gestión por semana",
    sections: ["weeks"],
  },
  {
    id: "aga-evolucion-departamento",
    kind: "agaDeptEvolution",
    title: "Evolución semanal por departamento",
    sections: ["weeks"],
  },
  {
    id: "aga-comparativa-departamento",
    kind: "agaDeptCompare",
    title: "Comparativa dos semanas por departamento",
    sections: ["weeks"],
  },
  {
    id: "aga-comparativa-proyecto",
    kind: "agaProjectCompare",
    title: "Comparativa por proyecto",
    sections: ["weeks"],
  },
];

/**
 * Pages of the presented PPTX that are not automated yet.
 *
 * They come from exports the module does not read, so they ship as free-form
 * `notes` slides carrying nothing but their title: the responsible pastes the
 * chart image or writes the text by hand. No sample figures and no sample copy
 * are seeded — a placeholder number in a corporate report is worse than a gap.
 *
 * Declared as data, not as literals inside `createDefaultAgaDeck`, so the
 * merge that repairs already stored decks stays generic over this list.
 */
interface TemplatePageSpec {
  id: string;
  kind: "section" | "notes";
  title: string;
}

export const AGA_TEMPLATE_PAGE_SPECS: TemplatePageSpec[] = [
  { id: "seccion-gestionadas", kind: "section", title: "2. Peticiones gestionadas" },
  {
    id: "aga-gestionadas-total-semanal",
    kind: "notes",
    title: "2.1 Total posiciones gestionadas por semana",
  },
  {
    id: "aga-gestionadas-departamento",
    kind: "notes",
    title: "2.2 Top gestionadas por departamento",
  },
  {
    id: "aga-gestionadas-producto",
    kind: "notes",
    title: "2.3 Top gestionadas por producto",
  },
  {
    id: "aga-gestionadas-ubicacion",
    kind: "notes",
    title: "2.4 Top gestionadas por ubicación",
  },
  { id: "aga-gestionadas-gam", kind: "notes", title: "2.5 GAM por producto" },
  {
    id: "aga-gestionadas-portatiles",
    kind: "notes",
    title: "2.6 Plataforma Portátiles por producto",
  },
  { id: "aga-gestionadas-almacen", kind: "notes", title: "2.7 Almacén por producto" },
  { id: "aga-gestionadas-office", kind: "notes", title: "2.8 Office" },
  { id: "seccion-anual", kind: "section", title: "3. Evolución anual" },
  {
    id: "aga-anual-peticiones",
    kind: "notes",
    title: "3.1 Evolución anual de peticiones",
  },
  {
    id: "aga-anual-posiciones",
    kind: "notes",
    title: "3.2 Evolución anual de posiciones",
  },
];

function createTemplatePage(spec: TemplatePageSpec): AgaDeckPage {
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

  return {
    ...base,
    text: { title: spec.title, subtitle: SERVICE, body: "" },
    images: [],
  };
}

/** Sections a page needs, by page id. Empty for the pages with no dataset. */
export const AGA_PAGE_SECTIONS: Record<string, AgaSectionKey[]> =
  Object.fromEntries(AGA_PAGE_SPECS.map((spec) => [spec.id, spec.sections]));

/** True when every section the page needs carries at least one row. */
export function hasSectionData(
  dataset: AgaDataset | null,
  sections: AgaSectionKey[]
): boolean {
  if (!dataset || sections.length === 0) {
    return false;
  }

  return sections.every((section) => {
    const rows = dataset[section];
    return Array.isArray(rows) && rows.length > 0;
  });
}

export function emptyAgaDataset(): AgaDataset {
  return { weeks: [], source: { sourceFile: null, uploadedAt: null } };
}

export function createDefaultAgaDeck(): AgaDeckState {
  const pages: AgaDeckPage[] = [
    {
      id: "cover",
      kind: "cover",
      supportType: null,
      text: {
        title: "Informe de seguimiento del servicio",
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
        item1: "1. Peticiones en gestión",
        item2: "2. Peticiones gestionadas",
        item3: "3. Evolución anual",
      },
      visible: true,
      weekSelection: null,
      years: null,
      overrides: {},
      hiddenRows: [],
    },
    {
      id: "seccion-peticiones",
      kind: "section",
      supportType: null,
      text: { title: "1. Peticiones en gestión", subtitle: SERVICE },
      visible: true,
      weekSelection: null,
      years: null,
      overrides: {},
    },
  ];

  for (const spec of AGA_PAGE_SPECS) {
    pages.push({
      id: spec.id,
      kind: spec.kind,
      supportType: null,
      text: {
        title: spec.title,
        subtitle: SERVICE,
        footnote: spec.footnote ?? "",
      },
      visible: true,
      weekSelection: null,
      years: null,
      overrides: {},
    });
  }

  for (const spec of AGA_TEMPLATE_PAGE_SPECS) {
    pages.push(createTemplatePage(spec));
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
 * The deck is persisted whole, so a deck saved before a template page existed
 * would never show it again. This adds only what is missing, by id, and never
 * touches a page that is already there: titles, bodies, images, visibility and
 * the order the user chose survive untouched, and pages the user added by hand
 * stay where they are.
 *
 * A missing page is inserted right after the nearest preceding default page
 * that the stored deck still has, which puts it in its intended place without
 * assuming the rest of the deck kept the default order. It is never placed
 * after the closing slide.
 *
 * Generic over `createDefaultAgaDeck`: adding a page to the specs is enough,
 * there is no second list of ids to keep in sync.
 */
export function mergeAgaDeckTemplate(deck: AgaDeckState): AgaDeckState {
  const reference = createDefaultAgaDeck().pages;
  const pages = [...deck.pages];
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
