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

const OLD_TITLE = "2.1.1 Volumetría de Incidencias y Work Orders";
const NEW_TITLE = "2.1.1 Volumetría de Incidencias";

function legacyDeck(title = OLD_TITLE): InformaticaDeckState {
  const deck = createDefaultInformaticaDeck();
  const retained = deck.pages.find(
    page => page.id === "volumetria-incidencias-wo"
  );

  if (!retained) {
    throw new Error("Missing retained volumetry page in default deck");
  }

  retained.text = { ...retained.text, title };
  const retired: InformaticaDeckPage = {
    ...retained,
    id: "volumetria-incidencias",
    text: { ...retained.text, title: NEW_TITLE },
  };
  const manual = createSectionPage<"section", string>(
    "manual-follow-up",
    "section",
    "Seguimiento manual"
  ) as InformaticaDeckPage;

  deck.pages.splice(3, 0, retired, manual);
  return deck;
}

describe("mergeInformaticaDeckTemplate", () => {
  it("removes the retired slide without losing manual pages", () => {
    const merged = mergeInformaticaDeckTemplate(legacyDeck());

    expect(merged.pages.some(page => page.id === "volumetria-incidencias")).toBe(
      false
    );
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
