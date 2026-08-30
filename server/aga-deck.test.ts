import { describe, expect, it } from "vitest";
import { createSectionPage } from "../shared/deck/core.ts";
import {
  createDefaultAgaDeck,
  mergeAgaDeckTemplate,
} from "../shared/modules/aga/deck.ts";
import type { AgaDeckPage, AgaDeckState } from "../shared/modules/aga/types.ts";

function withManualPage(deck: AgaDeckState): AgaDeckState {
  const manual = createSectionPage<"section", string>(
    "manual-follow-up",
    "section",
    "Seguimiento manual"
  ) as AgaDeckPage;
  const closingIndex = deck.pages.findIndex((page) => page.kind === "closing");
  const pages = [...deck.pages];
  pages.splice(closingIndex === -1 ? pages.length : closingIndex, 0, manual);

  return { ...deck, pages };
}

describe("mergeAgaDeckTemplate", () => {
  it("keeps a page the user added by hand", () => {
    const merged = mergeAgaDeckTemplate(withManualPage(createDefaultAgaDeck()));

    expect(merged.pages.find((page) => page.id === "manual-follow-up")?.text).toEqual(
      { title: "Seguimiento manual", subtitle: "" }
    );
  });

  it("seeds a template page into a deck that never had it", () => {
    const deck = createDefaultAgaDeck();
    deck.pages = deck.pages.filter((page) => page.id !== "aga-gestionadas-office");

    const merged = mergeAgaDeckTemplate(deck);
    const ids = merged.pages.map((page) => page.id);
    const almacen = ids.indexOf("aga-gestionadas-almacen");
    const office = ids.indexOf("aga-gestionadas-office");

    expect(office).toBe(almacen + 1);
    expect(merged.pages[office]?.kind).toBe("agaGestOffice");
  });

  it("realigns only the kind of a stored placeholder that the specs promoted", () => {
    const deck = createDefaultAgaDeck();
    const office = deck.pages.find((page) => page.id === "aga-gestionadas-office");

    if (!office) {
      throw new Error("Missing office page in default AGA deck");
    }

    office.kind = "notes";
    office.text = { ...office.text, title: "Office personalizado", body: "nota" };

    const merged = mergeAgaDeckTemplate(deck);
    const restored = merged.pages.find((page) => page.id === "aga-gestionadas-office");

    expect(restored?.kind).toBe("agaGestOffice");
    expect(restored?.text.title).toBe("Office personalizado");
    expect(restored?.text.body).toBe("nota");
  });

  it("does not rewrite a customized title", () => {
    const deck = createDefaultAgaDeck();
    const total = deck.pages.find((page) => page.id === "aga-total-semanal");

    if (!total) {
      throw new Error("Missing weekly total page in default AGA deck");
    }

    total.text = { ...total.text, title: "Volumetría personalizada" };

    const merged = mergeAgaDeckTemplate(deck);

    expect(
      merged.pages.find((page) => page.id === "aga-total-semanal")?.text.title
    ).toBe("Volumetría personalizada");
  });

  it("preserves the stored order when every template page is already present", () => {
    const deck = createDefaultAgaDeck();
    const first = deck.pages.findIndex((page) => page.id === "aga-total-semanal");
    const second = deck.pages.findIndex(
      (page) => page.id === "aga-comparativa-proyecto"
    );
    const pages = [...deck.pages];
    [pages[first], pages[second]] = [pages[second], pages[first]];

    const merged = mergeAgaDeckTemplate({ ...deck, pages });

    expect(merged.pages.map((page) => page.id)).toEqual(pages.map((page) => page.id));
  });

  it("never places a recovered page after the closing slide", () => {
    const deck = createDefaultAgaDeck();
    deck.pages = deck.pages.filter((page) => page.id !== "aga-anual-posiciones");

    const merged = mergeAgaDeckTemplate(deck);
    const closingIndex = merged.pages.findIndex((page) => page.kind === "closing");

    expect(closingIndex).toBe(merged.pages.length - 1);
    expect(merged.pages.some((page) => page.id === "aga-anual-posiciones")).toBe(
      true
    );
  });
});
