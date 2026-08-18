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
