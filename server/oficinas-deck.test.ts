import { describe, expect, it } from "vitest";
import { createSectionPage } from "../shared/deck/core.ts";
import {
  createDefaultOficinasDeck,
  mergeOficinasDeckTemplate,
} from "../shared/modules/oficinas/deck.ts";
import type {
  OficinasDeckPage,
  OficinasDeckState,
} from "../shared/modules/oficinas/types.ts";

function withManualPage(deck: OficinasDeckState): OficinasDeckState {
  const manual = createSectionPage<"section", string>(
    "manual-follow-up",
    "section",
    "Seguimiento manual"
  ) as OficinasDeckPage;
  const closingIndex = deck.pages.findIndex((page) => page.kind === "closing");
  const pages = [...deck.pages];
  pages.splice(closingIndex === -1 ? pages.length : closingIndex, 0, manual);

  return { ...deck, pages };
}

describe("mergeOficinasDeckTemplate", () => {
  it("keeps a page the user added by hand", () => {
    const merged = mergeOficinasDeckTemplate(
      withManualPage(createDefaultOficinasDeck())
    );

    expect(merged.pages.find((page) => page.id === "manual-follow-up")?.text).toEqual(
      { title: "Seguimiento manual", subtitle: "" }
    );
  });

  it("seeds Kanban into a deck that never had it", () => {
    const deck = createDefaultOficinasDeck();
    deck.pages = deck.pages.filter(
      (page) => page.id !== "oficinas-seccion-kanban" && page.id !== "oficinas-kanban"
    );

    const merged = mergeOficinasDeckTemplate(deck);
    const ids = merged.pages.map((page) => page.id);
    const recicladores = ids.indexOf("oficinas-recicladores-elemento");
    const section = ids.indexOf("oficinas-seccion-kanban");
    const kanban = ids.indexOf("oficinas-kanban");

    expect(section).toBe(recicladores + 1);
    expect(kanban).toBe(section + 1);
    expect(merged.pages[kanban]?.kind).toBe("notes");
  });

  it("realigns only the kind of a stored placeholder that the specs promoted", () => {
    const deck = createDefaultOficinasDeck();
    const asignadas = deck.pages.find((page) => page.id === "oficinas-asignadas-dt");

    if (!asignadas) {
      throw new Error("Missing asignadas DT page in default Oficinas deck");
    }

    asignadas.kind = "notes";
    asignadas.text = {
      ...asignadas.text,
      title: "Asignadas personalizado",
      body: "nota",
    };

    const merged = mergeOficinasDeckTemplate(deck);
    const restored = merged.pages.find((page) => page.id === "oficinas-asignadas-dt");

    expect(restored?.kind).toBe("ofiAsignadasDT");
    expect(restored?.text.title).toBe("Asignadas personalizado");
    expect(restored?.text.body).toBe("nota");
  });

  it("does not rewrite a customized title", () => {
    const deck = createDefaultOficinasDeck();
    const asignadas = deck.pages.find((page) => page.id === "oficinas-asignadas-dt");

    if (!asignadas) {
      throw new Error("Missing asignadas DT page in default Oficinas deck");
    }

    asignadas.text = { ...asignadas.text, title: "Volumetría personalizada" };

    const merged = mergeOficinasDeckTemplate(deck);

    expect(
      merged.pages.find((page) => page.id === "oficinas-asignadas-dt")?.text.title
    ).toBe("Volumetría personalizada");
  });

  it("preserves the stored order when every template page is already present", () => {
    const deck = createDefaultOficinasDeck();
    const first = deck.pages.findIndex((page) => page.id === "oficinas-asignadas-dt");
    const second = deck.pages.findIndex(
      (page) => page.id === "oficinas-recicladores-elemento"
    );
    const pages = [...deck.pages];
    [pages[first], pages[second]] = [pages[second], pages[first]];

    const merged = mergeOficinasDeckTemplate({ ...deck, pages });

    expect(merged.pages.map((page) => page.id)).toEqual(pages.map((page) => page.id));
  });

  it("never places a recovered page after the closing slide", () => {
    const deck = createDefaultOficinasDeck();
    deck.pages = deck.pages.filter((page) => page.id !== "oficinas-kanban");

    const merged = mergeOficinasDeckTemplate(deck);
    const closingIndex = merged.pages.findIndex((page) => page.kind === "closing");

    expect(closingIndex).toBe(merged.pages.length - 1);
    expect(merged.pages.some((page) => page.id === "oficinas-kanban")).toBe(true);
  });

  it("hides the two replaced weekly element pages by default", () => {
    const deck = createDefaultOficinasDeck();

    expect(
      deck.pages.find((page) => page.id === "oficinas-asignadas-semanal")?.visible
    ).toBe(false);
    expect(
      deck.pages.find((page) => page.id === "oficinas-resueltas-semanal")?.visible
    ).toBe(false);
  });

  it("hides both replaced pages while preserving unrelated visibility", () => {
    const deck = createDefaultOficinasDeck();
    const assigned = deck.pages.find(
      (page) => page.id === "oficinas-asignadas-semanal"
    );
    const resolved = deck.pages.find(
      (page) => page.id === "oficinas-resueltas-semanal"
    );
    const element = deck.pages.find(
      (page) => page.id === "oficinas-asignadas-elemento"
    );

    if (!assigned || !resolved || !element) {
      throw new Error("Missing seeded Oficinas pages");
    }

    assigned.visible = true;
    resolved.visible = true;
    element.visible = false;

    const merged = mergeOficinasDeckTemplate(deck);

    expect(
      merged.pages.find((page) => page.id === assigned.id)?.visible
    ).toBe(false);
    expect(
      merged.pages.find((page) => page.id === resolved.id)?.visible
    ).toBe(false);
    expect(
      merged.pages.find((page) => page.id === element.id)?.visible
    ).toBe(false);
  });

  it("replaces the hidden weekly slots before their element pages", () => {
    const deck = createDefaultOficinasDeck();
    deck.pages = deck.pages.filter(
      (page) =>
        page.id !== "oficinas-asignadas-total-semanal" &&
        page.id !== "oficinas-resueltas-total-semanal"
    );

    const ids = mergeOficinasDeckTemplate(deck).pages.map((page) => page.id);

    expect(ids.indexOf("oficinas-asignadas-total-semanal")).toBe(
      ids.indexOf("oficinas-asignadas-elemento") - 1
    );
    expect(ids.indexOf("oficinas-resueltas-total-semanal")).toBe(
      ids.indexOf("oficinas-resueltas-elemento") - 1
    );
  });

  it("removes only the obsolete S35 override from resolved territorial data", () => {
    const deck = createDefaultOficinasDeck();
    const resolved = deck.pages.find(
      (page) => page.id === "oficinas-resueltas-dt"
    );
    const assigned = deck.pages.find(
      (page) => page.id === "oficinas-asignadas-dt"
    );

    if (!resolved || !assigned) {
      throw new Error("Missing territorial Oficinas pages");
    }

    resolved.overrides = { "total:S34": 88, "total:S35": 7 };
    assigned.overrides = { "total:S35": 7 };

    const merged = mergeOficinasDeckTemplate(deck);

    expect(
      merged.pages.find((page) => page.id === resolved.id)?.overrides
    ).toEqual({ "total:S34": 88 });
    expect(
      merged.pages.find((page) => page.id === assigned.id)?.overrides
    ).toEqual({ "total:S35": 7 });
  });

  it("preserves a legitimate replacement value on resolved S35", () => {
    const deck = createDefaultOficinasDeck();
    const resolved = deck.pages.find(
      (page) => page.id === "oficinas-resueltas-dt"
    );

    if (!resolved) {
      throw new Error("Missing resolved territorial page");
    }

    resolved.overrides = { "total:S35": 98 };

    expect(
      mergeOficinasDeckTemplate(deck).pages.find(
        (page) => page.id === resolved.id
      )?.overrides
    ).toEqual({ "total:S35": 98 });
  });
});
