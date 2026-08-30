import { mergeDeckTemplate } from "../../deck/merge.ts";
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
 * Every page between the section divider "1." and the closing slide, in the
 * order of the published PDF ("Informe semanal | Oficinas").
 *
 * The report opens each subsection with a divider and then draws the same slide
 * twice, once per dimension: the territorial reading first and the component one
 * after it. That is why the numbering runs 1.1, 1.2, 1.1, 1.2 rather than
 * straight down — the PDF groups by dimension, not by section.
 *
 * Each `...Semanal` page is the clone of a printed slide. The page right after
 * it, where there is one, is the deck's own reading of the same data (the ranked
 * elements, the share by request type); they sit next to each other so the team
 * can compare and hide whichever they do not want to send.
 *
 * Declared as data, not as literals inside `createDefaultOficinasDeck`, so the
 * merge that repairs already stored decks stays generic over this list: adding a
 * page here is enough, there is no second list of ids to keep in sync. Page ids
 * are a stored contract and never change, so a page that moved or was retitled
 * keeps the id it was seeded with.
 */
export const OFICINAS_PAGE_SPECS: PageSpec[] = [
  {
    id: "oficinas-seccion-asignadas",
    kind: "section",
    title: "1.1 Incidencias asignadas y resueltas por territorial",
  },
  {
    id: "oficinas-asignadas-dt",
    kind: "ofiAsignadasDT",
    title: "1.1 Volumetría de incidencias asignadas",
    sections: ["asignadas"],
  },
  {
    id: "oficinas-resueltas-dt",
    kind: "ofiResueltasDT",
    title: "1.2 Volumetría de incidencias resueltas",
    sections: ["resueltas"],
  },
  {
    id: "oficinas-seccion-resueltas",
    kind: "section",
    title: "1.2 Incidencias asignadas y resueltas por componente",
  },
  {
    id: "oficinas-asignadas-semanal",
    kind: "ofiAsignadasSemanal",
    title: "1.1 Comparativa de incidencias asignadas sin validadoras",
    sections: ["asignadas"],
  },
  {
    id: "oficinas-asignadas-elemento",
    kind: "ofiAsignadasElemento",
    title: "1.1 Incidencias asignadas por elemento",
    sections: ["asignadas"],
  },
  {
    id: "oficinas-resueltas-semanal",
    kind: "ofiResueltasSemanal",
    title: "1.2 Comparativa de incidencias resueltas sin validadoras",
    sections: ["resueltas"],
  },
  {
    id: "oficinas-resueltas-elemento",
    kind: "ofiResueltasElemento",
    title: "1.2 Incidencias resueltas por elemento",
    sections: ["resueltas"],
  },
  { id: "oficinas-seccion-peticiones", kind: "section", title: "1.3 Peticiones resueltas" },
  {
    id: "oficinas-peticiones-dt-semanal",
    kind: "ofiPeticionesDTSemanal",
    title: "1.3 Volumetría de peticiones resueltas por territorial",
    sections: ["peticiones"],
  },
  {
    id: "oficinas-peticiones-dt",
    kind: "ofiPeticionesDT",
    title: "1.3 Peticiones por DT",
    sections: ["peticiones"],
  },
  {
    id: "oficinas-peticiones-tipo-semanal",
    kind: "ofiPeticionesTipoSemanal",
    title: "1.3 Volumetría de peticiones resueltas",
    sections: ["peticiones"],
  },
  {
    id: "oficinas-peticiones-tipo",
    kind: "ofiPeticionesTipo",
    title: "1.3 Peticiones por tipo",
    sections: ["peticiones"],
  },
  {
    id: "oficinas-seccion-encuestas",
    kind: "section",
    title: "1.4 Volumetría Encuestas Peticiones",
  },
  {
    id: "oficinas-encuestas",
    kind: "ofiEncuestas",
    title: "1.4 Volumetría de encuestas realizadas (Peticiones)",
    sections: ["encuestas"],
  },
  { id: "oficinas-seccion-recicladores", kind: "section", title: "1.5 Recicladores" },
  {
    id: "oficinas-recicladores-dt-semanal",
    kind: "ofiRecicladoresDTSemanal",
    title: "1.5 Volumetría de incidencias resueltas Recicladores",
    sections: ["recicladores"],
  },
  {
    id: "oficinas-recicladores-dt",
    kind: "ofiRecicladoresDT",
    title: "1.5 Recicladores por DT",
    sections: ["recicladores"],
  },
  {
    id: "oficinas-recicladores-elemento-semanal",
    kind: "ofiRecicladoresElementoSemanal",
    title: "1.5 Recicladores resueltos por elemento",
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
        title: "Informe de seguimiento de Oficinas",
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
      // Seven entries, which is one more than the index slide draws by default:
      // `Oficinas.tsx` widens `itemKeys` to match the printed index.
      text: {
        title: "Contenido",
        item1: "1. Revisión de métricas",
        item2: "1.1 Incidencias asignadas y resueltas por territorial",
        item3: "1.2 Incidencias asignadas y resueltas por componente",
        item4: "1.3 Peticiones",
        item5: "1.4 Volumetría Encuestas Peticiones",
        item6: "1.5 Recicladores",
        item7: "2. Kanban",
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
      text: { title: "1. Revisión de métricas", subtitle: SERVICE },
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
    text: { title: "¡Gracias!", subtitle: "" },
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
 * Generic over `createDefaultOficinasDeck`: adding a page to the specs is
 * enough. The insert and kind-realignment rules live in `mergeDeckTemplate`.
 */
export function mergeOficinasDeckTemplate(deck: OficinasDeckState): OficinasDeckState {
  return mergeDeckTemplate(deck, createDefaultOficinasDeck().pages);
}
