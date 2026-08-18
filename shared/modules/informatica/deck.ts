import type {
  InformaticaDataset,
  InformaticaDeckPage,
  InformaticaDeckState,
  InformaticaSectionKey,
} from "./types.ts";

/**
 * Default deck of the Informatica report.
 *
 * The page order and the titles are the ones of the original PPTX, transcribed
 * in `Documentación/Informática/_analisis-informatica.md`. Its numbering is
 * inconsistent on purpose: `2.3.2` is used twice, `2.1.4` and `2.5` do not
 * exist, and the slide order does not follow the numbers. That is the client's
 * numbering, not ours, so it is kept verbatim; normalising it here would make
 * the web report stop matching the document it replaces.
 *
 * Page ids are a stored contract: a persisted deck is resolved by id, so
 * renaming one orphans the saved deck.
 */

/** Service name shown as the dominant heading line on every Informática slide. */
export const INFORMATICA_SERVICE = "INFORMÁTICA";
const SERVICE = INFORMATICA_SERVICE;

interface PageSpec {
  id: string;
  kind: InformaticaDeckPage["kind"];
  title: string;
  footnote?: string;
  /** Dataset sections the page needs to render its data. */
  sections: InformaticaSectionKey[];
}

/**
 * The seventeen data pages of the report, in the order of the original deck.
 *
 * `sections` drives the "Próximamente" fallback: a page whose sections are not
 * all present in the imported workbook renders the notice instead of a chart.
 */
export const INFORMATICA_PAGE_SPECS: PageSpec[] = [
  {
    id: "volumetria-incidencias-wo",
    kind: "itIncidencias",
    title: "2.1.1 Volumetría de Incidencias y Work Orders",
    sections: ["incidencias", "workOrders"],
  },
  {
    id: "volumetria-incidencias",
    kind: "itIncidencias",
    title: "2.1.1 Volumetría de Incidencias",
    sections: ["incidencias"],
  },
  {
    id: "top5-incidencias",
    kind: "itIncidencias",
    title: "2.1.2 Top 5 de incidencias",
    sections: ["incidencias"],
  },
  {
    id: "top-ten-incidencias",
    kind: "itIncidencias",
    title: "2.1.3 Top Ten incidencias SSCC",
    sections: ["incidencias"],
  },
  {
    id: "encuestas-incidencias",
    kind: "itEncuestas",
    title: "2.1.5 Encuestas Incidencias SSCC",
    sections: ["encuestas"],
  },
  {
    id: "workorders",
    kind: "itWorkOrders",
    title: "2.1.6 WorkOrders",
    sections: ["workOrders"],
  },
  {
    id: "workorders-anual",
    kind: "itWorkOrders",
    title: "2.3.2 Volumetría de WorkOrders Anuales SSCC",
    sections: ["workOrders"],
  },
  {
    id: "peticiones",
    kind: "itPeticiones",
    title: "2.2.1 Volumetría Peticiones",
    sections: ["peticiones"],
  },
  {
    id: "peticiones-anual",
    kind: "itPeticionesAnual",
    title: "2.2.1 Volumetría de Peticiones Anual SSCC",
    sections: ["peticionesAnual"],
  },
  {
    id: "citas-semanal",
    kind: "itCitas",
    title: "2.3.1 Volumetría de Citas SmartTech Semanal",
    sections: ["citas"],
  },
  {
    id: "citas-mensual",
    kind: "itCitas",
    title: "2.3.3 Volumetría de Citas Mensuales SSCC",
    sections: ["citas"],
  },
  {
    id: "citas-anual",
    kind: "itCitasAnual",
    title: "2.3.2 Volumetría de Citas Anuales SSCC",
    sections: ["citasAnual"],
  },
  {
    id: "imacs-tablas",
    kind: "itImacs",
    title: "2.4.1 Volumetría de IMACS resueltos OnSite",
    sections: ["imacs"],
  },
  {
    id: "imacs-grafico",
    kind: "itImacs",
    title: "2.4.2 Volumetría de IMACS resueltos OnSite",
    sections: ["imacs"],
  },
  { id: "wasp", kind: "itWasp", title: "2.6 WASP", sections: ["wasp"] },
  { id: "renove", kind: "itRenove", title: "2.7 Renove", sections: ["renove"] },
  {
    id: "renove-acumulado",
    kind: "itRenove",
    title: "2.7.1 Renove",
    sections: ["renove"],
  },
];

/** Sections a page needs, by page id. Empty for the pages with no dataset. */
export const INFORMATICA_PAGE_SECTIONS: Record<string, InformaticaSectionKey[]> =
  Object.fromEntries(
    INFORMATICA_PAGE_SPECS.map((spec) => [spec.id, spec.sections])
  );

/** True when every section the page needs carries at least one row. */
export function hasSectionData(
  dataset: InformaticaDataset | null,
  sections: InformaticaSectionKey[]
): boolean {
  if (!dataset || sections.length === 0) {
    return false;
  }

  return sections.every((section) => {
    const rows = dataset[section];
    return Array.isArray(rows) && rows.length > 0;
  });
}

export function emptyInformaticaDataset(): InformaticaDataset {
  return { source: { sourceFile: null, uploadedAt: null } };
}

export function createDefaultInformaticaDeck(): InformaticaDeckState {
  const pages: InformaticaDeckPage[] = [
    {
      id: "cover",
      kind: "cover",
      supportType: null,
      text: {
        title: "Informe de seguimiento del servicio",
        subtitle: "Servicio Informática BBVA",
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
        title: "2 Revisión de métricas",
        item1: "2.1 Incidencias y Work Orders",
        item2: "2.2 Peticiones",
        item3: "2.3 Citas SmartTech",
        item4: "2.4 IMACS OnSite",
        item5: "2.6 WASP",
        item6: "2.7 Renove",
      },
      visible: true,
      weekSelection: null,
      years: null,
      overrides: {},
      hiddenRows: [],
    },
  ];

  for (const spec of INFORMATICA_PAGE_SPECS) {
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

  return { pages, updatedAt: null };
}
