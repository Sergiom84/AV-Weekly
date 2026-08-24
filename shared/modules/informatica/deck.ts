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
 * The data pages of the report, in the order of the original deck.
 *
 * `sections` drives the "Próximamente" fallback: a page whose sections are not
 * all present in the imported workbook renders the notice instead of a chart.
 */
export const INFORMATICA_PAGE_SPECS: PageSpec[] = [
  /**
   * Both 2.1.1 pages read the `Hic` sheet, not `Incidencias`.
   *
   * `Incidencias` is the daily ticket detail; the two volumetry slides of the
   * original deck are the monthly series the provider reports, which is exactly
   * what `Hic` carries. Recomputing them from the daily detail would give a
   * number close to but not equal to the reported one — 754 against 722 for
   * 2026/07 — and the report must print the figure the client signs off, not
   * ours.
   */
  {
    id: "volumetria-incidencias-wo",
    kind: "itHic",
    title: "2.1.1 Volumetría de Incidencias",
    sections: ["hic"],
  },
  {
    id: "top5-incidencias",
    kind: "itIncidencias",
    title: "2.1.2 Top 5 de incidencias",
    sections: ["incidencias"],
  },
  {
    id: "top-ten-incidencias",
    kind: "itComparativas",
    title: "2.1.3 Top Ten incidencias SSCC",
    sections: ["comparativas"],
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
  /**
   * SLAs closes the 2.1 block. The original deck pastes it as an image and
   * gives it no number, so `2.1.7` is ours: it is the first free slot after
   * `2.1.6 WorkOrders`, which is also where the page belongs — next to the
   * incident pages whose response and resolution times it measures.
   */
  {
    id: "slas",
    kind: "itSlas",
    title: "2.1.7 SLAs",
    sections: ["slas"],
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

/**
 * Brings a stored deck up to date with the pages the specs declare.
 *
 * The deck is persisted whole, so the first time anybody edits it the saved
 * copy freezes the page list of that moment: a page added to
 * `INFORMATICA_PAGE_SPECS` afterwards would never appear again without a manual
 * reset. This adds only what is missing, matched by id, and never touches a page
 * that is already stored — titles, footnotes, visibility, overrides, week and
 * year selections and the order the user chose all survive, and pages the user
 * added by hand stay where they are.
 *
 * A missing page is inserted right after the nearest preceding reference page
 * the stored deck still has, so it lands in its intended slot without assuming
 * the rest of the deck kept the default order. When none of its predecessors
 * survive it goes to the front, which is the only position that is still
 * defensible.
 *
 * Unlike AGA and Oficinas, this deck has no closing page: the reference ends on
 * the last data page. The clamp that keeps an inserted page ahead of the closing
 * slide is kept anyway because it is guarded by "is there one at all", so it
 * costs nothing today and does the right thing the day a closing page is seeded.
 *
 * Deliberately a copy of `mergeAgaDeckTemplate` and `mergeOficinasDeckTemplate`
 * rather than a shared helper: the three decks are typed over different page
 * kinds, and the note left in the Oficinas copy — generalise once a third module
 * needs it — is now due. Doing it here would mean touching the two modules
 * already in production in the same change that fixes this one, so it is left as
 * the next step instead of bundled in.
 */
export function mergeInformaticaDeckTemplate(
  deck: InformaticaDeckState
): InformaticaDeckState {
  const reference = createDefaultInformaticaDeck().pages;
  const kinds = new Map(reference.map((page) => [page.id, page.kind]));

  // This former fourth slide was folded into the preceding volumetry page.
  // Removing it here also migrates already persisted decks; matching by the
  // seeded id leaves user-created pages untouched.
  const retiredIds = new Set(["volumetria-incidencias"]);

  // A page whose spec changed kind — a placeholder promoted to a data page, or
  // an incident page re-pointed at the `hic`/`comparativas` sections — keeps its
  // stored id, so a deck saved before the change carries the old kind and would
  // render the old page forever. Only the kind is realigned; everything the user
  // wrote or moved is theirs, not the template's.
  const pages = deck.pages.flatMap((page) => {
    if (retiredIds.has(page.id)) {
      return [];
    }

    const kind = kinds.get(page.id);

    // Adopt the new title only while the stored page still has the old seeded
    // title. An editor's custom title remains authoritative.
    const text =
      page.id === "volumetria-incidencias-wo" &&
      page.text.title === "2.1.1 Volumetría de Incidencias y Work Orders"
        ? { ...page.text, title: "2.1.1 Volumetría de Incidencias" }
        : page.text;

    return [
      kind && kind !== page.kind
        ? { ...page, kind, text }
        : text !== page.text
          ? { ...page, text }
          : page,
    ];
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
