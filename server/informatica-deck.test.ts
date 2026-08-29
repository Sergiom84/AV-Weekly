import { describe, expect, it } from "vitest";
import { createSectionPage } from "../shared/deck/core.ts";
import {
  createDefaultInformaticaDeck,
  mergeInformaticaDeckTemplate,
} from "../shared/modules/informatica/deck.ts";
import type {
  InformaticaDeckPage,
  InformaticaDeckState,
} from "../shared/modules/informatica/types.ts";

const OLD_TITLE = "2.1.1 Volumetría de Incidencias";
const NEW_TITLE = "2.1.1 Volumetría de Incidencias y Work Orders";

function legacyDeck(title = OLD_TITLE): InformaticaDeckState {
  const deck = createDefaultInformaticaDeck();
  const retained = deck.pages.find(
    page => page.id === "volumetria-incidencias-wo"
  );

  if (!retained) {
    throw new Error("Missing retained volumetry page in default deck");
  }

  retained.text = { ...retained.text, title };
  const individual: InformaticaDeckPage = {
    ...retained,
    id: "volumetria-incidencias",
    text: { ...retained.text, title: NEW_TITLE },
  };
  const manual = createSectionPage<"section", string>(
    "manual-follow-up",
    "section",
    "Seguimiento manual"
  ) as InformaticaDeckPage;

  const renove: InformaticaDeckPage = {
    ...retained,
    id: "renove",
    kind: "itRenove",
    text: { ...retained.text, title: "2.7 Renove" },
  };
  const renoveAcumulado: InformaticaDeckPage = {
    ...renove,
    id: "renove-acumulado",
    text: { ...renove.text, title: "2.7.1 Renove" },
  };
  deck.pages.splice(3, 0, individual, renove, renoveAcumulado, manual);
  return deck;
}

describe("mergeInformaticaDeckTemplate", () => {
  it("removes Renove without losing the restored 2.1.1 or manual pages", () => {
    const merged = mergeInformaticaDeckTemplate(legacyDeck());

    expect(merged.pages.some(page => page.id === "volumetria-incidencias")).toBe(true);
    expect(merged.pages.some(page => page.id === "renove")).toBe(false);
    expect(merged.pages.some(page => page.id === "renove-acumulado")).toBe(false);
    expect(merged.pages.find(page => page.id === "manual-follow-up")?.text).toEqual(
      { title: "Seguimiento manual", subtitle: "" }
    );
  });

  it("migrates the exact old seeded title on the retained slide", () => {
    const merged = mergeInformaticaDeckTemplate(legacyDeck());

    expect(
      merged.pages.find(page => page.id === "volumetria-incidencias-wo")?.text
        .title
    ).toBe(NEW_TITLE);
  });

  it("keeps both 2.1.1 pages consecutive with their own data requirements", () => {
    const pages = createDefaultInformaticaDeck().pages;
    const combined = pages.findIndex(page => page.id === "volumetria-incidencias-wo");
    const individual = pages.findIndex(page => page.id === "volumetria-incidencias");

    expect(individual).toBe(combined + 1);
    expect(pages[combined]?.text.title).toBe(NEW_TITLE);
    expect(pages[individual]?.text.title).toBe(OLD_TITLE);
  });

  it("preserves a customized title on the retained slide", () => {
    const merged = mergeInformaticaDeckTemplate(
      legacyDeck("Volumetría personalizada")
    );

    expect(
      merged.pages.find(page => page.id === "volumetria-incidencias-wo")?.text
        .title
    ).toBe("Volumetría personalizada");
  });
});
