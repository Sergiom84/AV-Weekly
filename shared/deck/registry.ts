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
      artwork: {
        cover: "/informe/oficinas.png",
        divider: "/informe/contraportada.png",
      },
      kindLabels: {
        ...CORE_KIND_LABELS,
        ofiAsignadasDT: "Asignadas por DT",
        ofiAsignadasElemento: "Asignadas por elemento",
        ofiAsignadasSemanal: "Asignadas, comparativa semanal",
        ofiAsignadasTotalSemanal: "Asignadas, total semanal",
        ofiResueltasDT: "Resueltas por DT",
        ofiResueltasElemento: "Resueltas por elemento",
        ofiResueltasSemanal: "Resueltas, comparativa semanal",
        ofiResueltasTotalSemanal: "Resueltas, total semanal",
        ofiPeticionesDT: "Peticiones por DT",
        ofiPeticionesDTSemanal: "Peticiones por DT, comparativa semanal",
        ofiPeticionesTipo: "Peticiones por tipo",
        ofiPeticionesTipoSemanal: "Peticiones por tipo, comparativa semanal",
        ofiEncuestas: "Encuestas",
        ofiRecicladoresDT: "Recicladores por DT",
        ofiRecicladoresDTSemanal: "Recicladores por DT, comparativa semanal",
        ofiRecicladoresElemento: "Recicladores por elemento",
        ofiRecicladoresElementoAnual: "Recicladores por elemento, acumulado anual",
        ofiRecicladoresElementoSemanal: "Recicladores por elemento, comparativa semanal",
      },
      storagePrefix: "av-weekly:oficinas-sidebar-collapsed:",
    },
  },
  {
    id: "informatica",
    name: "Informática",
    meta: "Módulo 02",
    description:
      "Incidencias, work orders, citas SmartTech, peticiones, IMACS y Renove.",
    route: "/informatica",
    layers: 2,
    deck: {
      apiBase: "/api/informatica",
      // The Informatica Drive spreadsheet (see scripts/informatica-drive/)
      // reads the raw exports and writes this text. The sidebar only offers
      // that one input; the workbook route still exists server-side for
      // direct use, like AGA's raw uploads.
      uploads: [
        {
          id: "texto",
          label: "Texto plano (Drive)",
          path: "/api/informatica/upload/texto",
          error: "No se pudo cargar el texto plano de Informática",
          multiple: false,
          accept: ".txt,.tsv,.csv",
        },
      ],
      artwork: {
        cover: "/informe/sscc.png",
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
      // The AGA Drive spreadsheet (see scripts/aga-drive/) reads the three raw
      // exports and writes this text. It is the only upload the sidebar shows;
      // the routes for the three raw workbooks still exist server-side (see
      // routes.ts) for direct use, but are not offered here — one input keeps
      // the weekly labels (department, project, building) owned in one place,
      // the Drive mapping tabs, instead of drifting between two.
      uploads: [
        {
          id: "texto",
          label: "Texto plano (Drive)",
          path: "/api/aga/upload/texto",
          error: "No se pudo cargar el texto plano de AGA",
          multiple: false,
          accept: ".txt,.tsv,.csv",
        },
      ],
      artwork: {
        cover: "/informe/aga.png",
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
          id: "texto",
          label: "Texto plano (Drive)",
          path: "/api/informe/upload/texto",
          error: "No se pudo cargar el texto plano de Audiovisuales",
          multiple: false,
          accept: ".txt,.tsv,.csv",
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
