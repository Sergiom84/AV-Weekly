/**
 * Registry of the report modules the app exposes.
 *
 * One entry per module: its home card, its route, and — when the module ships a
 * real deck — the API base, the upload slots the sidebar renders, the artwork
 * behind the cover pages, the labels of its page kinds and the localStorage
 * prefix its sidebar uses.
 *
 * Both the router and the home read from here, so a module is declared once.
 * A module with `deck: null` is still routed, but as a placeholder screen.
 */

/** Module identifier. Doubles as the home card skin and hover tone. */
export type DeckModuleId = "oficinas" | "informatica" | "aga" | "av";

/** One upload zone of the sidebar. */
export interface DeckUploadSlot {
  /** Slot key. The page resolves the current source file from it. */
  id: string;
  label: string;
  /** POST endpoint that receives the workbook. */
  path: string;
  /** Message shown when the upload fails without a server message. */
  error: string;
  /**
   * The slot takes several workbooks at once and the server merges them.
   * Undefined or false means one file per upload, posted as the `file` field;
   * true posts every chosen file under the repeated `files` field.
   */
  multiple?: boolean;
  /** File picker filter. Defaults to ".xlsx,.xls" when omitted. */
  accept?: string;
}

/** Full-bleed artwork of the cover-like pages. */
export interface DeckArtwork {
  cover: string;
  divider: string;
}

export interface DeckModuleConfig {
  /** Base of the module API: `GET base`, `PUT base/deck`, `POST base/reset-deck`. */
  apiBase: string;
  uploads: DeckUploadSlot[];
  artwork: DeckArtwork;
  /** Human label per page kind, shown in the sidebar page list. */
  kindLabels: Record<string, string>;
  /** localStorage prefix of the collapsed state of the sidebar sections. */
  storagePrefix: string;
}

export interface DeckModule {
  id: DeckModuleId;
  name: string;
  meta: string;
  description: string;
  route: string;
  /** Decorative layers of the home card skin. */
  layers: 1 | 2 | 3;
  /** Null while the module has no deck behind it. */
  deck: DeckModuleConfig | null;
}

const CORE_KIND_LABELS: Record<string, string> = {
  cover: "Portada",
  index: "Índice",
  section: "Sección",
  closing: "Cierre",
  notes: "Notas",
};

export const DECK_MODULES: DeckModule[] = [
  {
    id: "oficinas",
    name: "Oficinas",
    meta: "Módulo 01",
    description:
      "Informe semanal de Soporte Oficinas: incidencias, peticiones, encuestas y recicladores.",
    route: "/oficinas",
    layers: 3,
    deck: {
      apiBase: "/api/oficinas",
      uploads: [
        {
          id: "plano",
          label: "Template semanal",
          path: "/api/oficinas/upload/plano",
          error: "No se pudo cargar el template semanal de Oficinas",
          multiple: false,
          accept: ".xlsx,.xls",
        },
      ],
      // No Oficinas artwork has been produced yet, so it reuses the corporate
      // covers the other decks already ship.
      artwork: {
        cover: "/informe/portada.png",
        divider: "/informe/contraportada.png",
      },
      kindLabels: {
        ...CORE_KIND_LABELS,
        ofiAsignadasDT: "Asignadas por DT",
        ofiAsignadasElemento: "Asignadas por elemento",
        ofiResueltasDT: "Resueltas por DT",
        ofiResueltasElemento: "Resueltas por elemento",
        ofiPeticionesDT: "Peticiones por DT",
        ofiPeticionesTipo: "Peticiones por tipo",
        ofiEncuestas: "Encuestas",
        ofiRecicladoresDT: "Recicladores por DT",
        ofiRecicladoresElemento: "Recicladores por elemento",
      },
      storagePrefix: "av-weekly:oficinas-sidebar-collapsed:",
    },
  },
  {
    id: "informatica",
    name: "Informática",
    meta: "Módulo 02",
    description:
      "Incidencias, work orders, citas SmartTech, peticiones, IMACS, WASP y Renove.",
    route: "/informatica",
    layers: 2,
    deck: {
      apiBase: "/api/informatica",
      uploads: [
        {
          id: "plano",
          label: "Libro plano",
          path: "/api/informatica/upload/plano",
          error: "No se pudo cargar el libro plano",
          multiple: true,
          accept: ".xlsx,.xls,.csv",
        },
      ],
      artwork: {
        cover: "/informe/portada.png",
        divider: "/informe/contraportada.png",
      },
      kindLabels: {
        ...CORE_KIND_LABELS,
        itIncidencias: "Incidencias",
        itEncuestas: "Encuestas",
        itWorkOrders: "Work Orders",
        itPeticiones: "Peticiones",
        itPeticionesProducto: "Peticiones por producto",
        itPeticionesAnual: "Peticiones anual",
        itCitas: "Citas SmartTech",
        itCitasAnual: "Citas anual",
        itImacs: "IMACS",
        itWasp: "WASP",
        itRenove: "Renove",
      },
      storagePrefix: "av-weekly:informatica-sidebar-collapsed:",
    },
  },
  {
    id: "aga",
    name: "AGA",
    meta: "Módulo 03",
    description:
      "Informe semanal de PetMicro: peticiones en gestión, gestionadas y evolución anual.",
    route: "/aga",
    layers: 2,
    deck: {
      apiBase: "/api/aga",
      uploads: [
        {
          id: "plano",
          label: "Excel GPS semanal",
          path: "/api/aga/upload/plano",
          error: "No se pudo cargar el excel GPS",
          multiple: false,
          accept: ".xlsx,.xls",
        },
      ],
      // No AGA artwork has been produced yet, so it reuses the corporate
      // covers the other decks already ship.
      artwork: {
        cover: "/informe/portada.png",
        divider: "/informe/contraportada.png",
      },
      kindLabels: {
        ...CORE_KIND_LABELS,
        agaTotalWeekly: "Total por semana",
        agaDeptEvolution: "Evolución por departamento",
        agaDeptCompare: "Comparativa por departamento",
        agaProjectCompare: "Comparativa por proyecto",
        agaGestTotal: "Gestionadas por semana",
        agaGestDept: "Gestionadas por departamento",
        agaGestProduct: "Gestionadas por producto",
        agaGestLocation: "Gestionadas por ubicación",
        agaGestGam: "GAM por producto",
        agaGestPortatiles: "Plataforma Portátiles por producto",
        agaGestAlmacen: "Almacén por producto",
        agaGestOffice: "Office",
        agaAnualPeticiones: "Anual de peticiones",
        agaAnualPosiciones: "Anual de posiciones",
      },
      storagePrefix: "av-weekly:aga-sidebar-collapsed:",
    },
  },
  {
    id: "av",
    name: "AV",
    meta: "Módulo 04",
    description:
      "Informe semanal de Audiovisuales: soporte, detalle por resolución y tendencia.",
    route: "/av",
    layers: 2,
    deck: {
      apiBase: "/api/informe",
      uploads: [
        {
          id: "semanal",
          label: "Plantilla semanal",
          path: "/api/informe/upload/semanal",
          error: "No se pudo cargar la plantilla semanal",
        },
        {
          id: "tendencia",
          label: "Tendencia mensual",
          path: "/api/informe/upload/tendencia",
          error: "No se pudo cargar la tendencia mensual",
        },
        {
          id: "plano",
          label: "Detalle por resolución",
          path: "/api/informe/upload/plano",
          error: "No se pudo cargar el fichero plano",
        },
      ],
      artwork: {
        cover: "/informe/portada.png",
        divider: "/informe/contraportada.png",
      },
      kindLabels: {
        ...CORE_KIND_LABELS,
        monthlyTrend: "Tendencia mensual",
        weeklySupport: "Soporte semanal",
        resolutionDetail: "Detalle de resolución",
        pendingItems: "Asuntos pendientes",
      },
      storagePrefix: "av-weekly:sidebar-collapsed:",
    },
  },
];

export function getDeckModule(id: DeckModuleId): DeckModule {
  const found = DECK_MODULES.find((module) => module.id === id);

  if (!found) {
    throw new Error(`Módulo desconocido: ${id}`);
  }

  return found;
}
