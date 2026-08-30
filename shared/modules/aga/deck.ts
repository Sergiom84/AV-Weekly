import { mergeDeckTemplate } from "../../deck/merge.ts";
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
 * Pages of sections 2 and 3.
 *
 * They do not come from the GPS: section 2 is the managed-positions export and
 * section 3 the annual one, both seeded separately. They are data pages all the
 * same — each declares the dataset section it needs, and falls back to the
 * pending slide while that section is missing rather than shipping a sample
 * figure, which in a corporate report is worse than a gap.
 *
 * The `section` dividers carry no data and declare no sections.
 *
 * Declared as data, not as literals inside `createDefaultAgaDeck`, so the merge
 * that repairs already stored decks stays generic over this list.
 */
interface TemplatePageSpec {
  id: string;
  kind: AgaDeckPage["kind"];
  title: string;
  sections?: AgaSectionKey[];
}

export const AGA_TEMPLATE_PAGE_SPECS: TemplatePageSpec[] = [
  { id: "seccion-gestionadas", kind: "section", title: "2. Peticiones gestionadas" },
  {
    id: "aga-gestionadas-total-semanal",
    kind: "agaGestTotal",
    title: "2.1 Total posiciones gestionadas por semana",
    sections: ["managed"],
  },
  {
    id: "aga-gestionadas-departamento",
    kind: "agaGestDept",
    title: "2.2 Top gestionadas por departamento",
    sections: ["managed"],
  },
  {
    id: "aga-gestionadas-producto",
    kind: "agaGestProduct",
    title: "2.3 Top gestionadas por producto",
    sections: ["managed"],
  },
  {
    id: "aga-gestionadas-ubicacion",
    kind: "agaGestLocation",
    title: "2.4 Top gestionadas por ubicación",
    sections: ["managed"],
  },
  {
    id: "aga-gestionadas-gam",
    kind: "agaGestGam",
    title: "2.5 GAM por producto",
    sections: ["managed"],
  },
  {
    id: "aga-gestionadas-portatiles",
    kind: "agaGestPortatiles",
    title: "2.6 Plataforma Portátiles por producto",
    sections: ["managed"],
  },
  {
    id: "aga-gestionadas-almacen",
    kind: "agaGestAlmacen",
    title: "2.7 Almacén por producto",
    sections: ["managed"],
  },
  {
    id: "aga-gestionadas-office",
    kind: "agaGestOffice",
    title: "2.8 Office",
    sections: ["office"],
  },
  { id: "seccion-anual", kind: "section", title: "3. Evolución anual" },
  {
    id: "aga-anual-peticiones",
    kind: "agaAnualPeticiones",
    title: "3.1 Evolución anual de peticiones",
    sections: ["annual"],
  },
  {
    id: "aga-anual-posiciones",
    kind: "agaAnualPosiciones",
    title: "3.2 Evolución anual de posiciones",
    sections: ["annual"],
  },
];

/**
 * Department each per-department product page reports on.
 *
 * The label is the key into `managed.byDepartmentProduct`, so the page picks its
 * rows without the renderer hardcoding a department per slide id.
 */
export const AGA_PAGE_DEPARTMENT: Record<string, string> = {
  "aga-gestionadas-gam": "GAM",
  "aga-gestionadas-portatiles": "Plataforma Portátiles",
  "aga-gestionadas-almacen": "Almacén",
};

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

  if (spec.kind === "notes") {
    return {
      ...base,
      text: { title: spec.title, subtitle: SERVICE, body: "" },
      images: [],
    };
  }

  return { ...base, text: { title: spec.title, subtitle: SERVICE, footnote: "" } };
}

/** Sections a page needs, by page id. Empty for the pages with no dataset. */
export const AGA_PAGE_SECTIONS: Record<string, AgaSectionKey[]> = {
  ...Object.fromEntries(AGA_PAGE_SPECS.map((spec) => [spec.id, spec.sections])),
  ...Object.fromEntries(
    AGA_TEMPLATE_PAGE_SPECS.filter((spec) => spec.sections).map((spec) => [
      spec.id,
      spec.sections!,
    ])
  ),
};

/**
 * True when the section carries something to draw.
 *
 * Per section rather than a generic "is a non-empty array": `weeks` is a list,
 * but `managed` is an object whose emptiness means "no week reported", and
 * `office`/`annual` are empty when they have no series. A section present but
 * empty must still fall back to the pending slide.
 */
function sectionHasRows(dataset: AgaDataset, section: AgaSectionKey): boolean {
  switch (section) {
    case "weeks":
      return Array.isArray(dataset.weeks) && dataset.weeks.length > 0;
    case "managed":
      return (dataset.managed?.weeklyTotals?.length ?? 0) > 0;
    case "office":
      return (
        (dataset.office?.months?.length ?? 0) > 0 &&
        (dataset.office?.families?.length ?? 0) > 0
      );
    case "annual":
      return (
        (dataset.annual?.peticiones?.length ?? 0) > 0 ||
        (dataset.annual?.posiciones?.length ?? 0) > 0
      );
    default:
      return false;
  }
}

/** True when every section the page needs carries at least one row. */
export function hasSectionData(
  dataset: AgaDataset | null,
  sections: AgaSectionKey[]
): boolean {
  if (!dataset || sections.length === 0) {
    return false;
  }

  return sections.every((section) => sectionHasRows(dataset, section));
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
 * Generic over `createDefaultAgaDeck`: adding a page to the specs is enough.
 * The insert and kind-realignment rules live in `mergeDeckTemplate`.
 */
export function mergeAgaDeckTemplate(deck: AgaDeckState): AgaDeckState {
  return mergeDeckTemplate(deck, createDefaultAgaDeck().pages);
}
