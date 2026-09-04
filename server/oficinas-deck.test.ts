import { describe, expect, it } from "vitest";
import { createNotesPage, createSectionPage } from "../shared/deck/core.ts";
import {
  OFICINAS_SERVICE,
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

  it("never seeds a retired page back into a deck", () => {
    const ids = mergeOficinasDeckTemplate(createDefaultOficinasDeck()).pages.map(
      (page) => page.id
    );

    for (const retired of [
      "oficinas-asignadas-total-semanal",
      "oficinas-resueltas-total-semanal",
      "oficinas-peticiones-dt-semanal",
      "oficinas-seccion-kanban",
      "oficinas-kanban",
    ]) {
      expect(ids).not.toContain(retired);
    }
  });

  it("hides a retired page already stored instead of throwing its content away", () => {
    const deck = createDefaultOficinasDeck();
    const kanban = createNotesPage<"notes", string>(
      "oficinas-kanban",
      "notes",
      OFICINAS_SERVICE
    ) as OficinasDeckPage;
    kanban.text = { ...kanban.text, title: "2. Kanban", body: "tablero de la semana" };
    const closingIndex = deck.pages.findIndex((page) => page.kind === "closing");
    deck.pages.splice(closingIndex, 0, kanban);

    const stored = mergeOficinasDeckTemplate(deck).pages.find(
      (page) => page.id === "oficinas-kanban"
    );

    expect(stored?.visible).toBe(false);
    expect(stored?.text.body).toBe("tablero de la semana");
  });

  it("rewords the retitled pages and leaves a custom title alone", () => {
    const deck = createDefaultOficinasDeck();
    const assigned = deck.pages.find((page) => page.id === "oficinas-asignadas-dt");
    const resolved = deck.pages.find((page) => page.id === "oficinas-resueltas-dt");

    if (!assigned || !resolved) {
      throw new Error("Missing territorial Oficinas pages");
    }

    // The wording the team had typed into their own stored deck.
    assigned.text = {
      ...assigned.text,
      title: "1.1 Volumetría de incidencias asignadas por Territorial",
    };
    resolved.text = { ...resolved.text, title: "1.2 Título del equipo" };

    const merged = mergeOficinasDeckTemplate(deck);

    expect(
      merged.pages.find((page) => page.id === "oficinas-asignadas-dt")?.text.title
    ).toBe("1.1 Volumetría de incidencias gestionadas sin validadoras");
    expect(
      merged.pages.find((page) => page.id === "oficinas-resueltas-dt")?.text.title
    ).toBe("1.2 Título del equipo");
  });

  it("clears the stored Kanban index entry without touching a reused slot", () => {
    const withSeeded = createDefaultOficinasDeck();
    const seeded = withSeeded.pages.find((page) => page.id === "index");
    const withReused = createDefaultOficinasDeck();
    const reused = withReused.pages.find((page) => page.id === "index");

    if (!seeded || !reused) {
      throw new Error("Missing index page in default Oficinas deck");
    }

    seeded.text = { ...seeded.text, item7: "2. Kanban" };
    reused.text = { ...reused.text, item7: "2. Plan de mejora" };

    expect(
      mergeOficinasDeckTemplate(withSeeded).pages.find((page) => page.id === "index")
        ?.text.item7
    ).toBe("1.6 Resumen mensual");
    expect(
      mergeOficinasDeckTemplate(withReused).pages.find((page) => page.id === "index")
        ?.text.item7
    ).toBe("2. Plan de mejora");
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
    // The last page the specs declare, so its only surviving anchors precede it
    // and a naive append would land it behind the closing slide.
    deck.pages = deck.pages.filter(
      (page) => page.id !== "oficinas-recicladores-elemento"
    );

    const merged = mergeOficinasDeckTemplate(deck);
    const closingIndex = merged.pages.findIndex((page) => page.kind === "closing");

    expect(closingIndex).toBe(merged.pages.length - 1);
    expect(
      merged.pages.some((page) => page.id === "oficinas-recicladores-elemento")
    ).toBe(true);
  });

  it("seeds every page of a new deck visible", () => {
    const deck = createDefaultOficinasDeck();

    expect(deck.pages.filter((page) => page.visible !== true)).toEqual([]);
  });

  it("brings the weekly element pages back once, then leaves them alone", () => {
    const deck = createDefaultOficinasDeck();
    const resolved = deck.pages.find(
      (page) => page.id === "oficinas-resueltas-semanal"
    );
    const element = deck.pages.find(
      (page) => page.id === "oficinas-asignadas-elemento"
    );

    if (!resolved || !element) {
      throw new Error("Missing seeded Oficinas pages");
    }

    // The stored deck as the previous migration left it: hidden, and still
    // carrying the title it was seeded with.
    resolved.visible = false;
    resolved.text = {
      ...resolved.text,
      title: "1.2 Comparativa de incidencias resueltas por elemento, sin validadoras",
    };
    element.visible = false;

    const restored = mergeOficinasDeckTemplate(deck).pages.find(
      (page) => page.id === resolved.id
    );

    expect(restored?.visible).toBe(true);
    expect(restored?.text.title).toBe("1.2 Incidencias resueltas por elemento, semanal");
    // A page the restore does not name keeps whatever the user chose.
    expect(
      mergeOficinasDeckTemplate(deck).pages.find((page) => page.id === element.id)
        ?.visible
    ).toBe(false);

    // Second pass over the already-migrated deck: the title no longer matches,
    // so hiding the page again is not undone on the next read.
    const hiddenAgain = mergeOficinasDeckTemplate({
      ...deck,
      pages: deck.pages.map((page) =>
        page.id === resolved.id
          ? { ...restored!, visible: false }
          : page
      ),
    }).pages.find((page) => page.id === resolved.id);

    expect(hiddenAgain?.visible).toBe(false);
  });

  it("recovers a missing page into the slot its specs give it", () => {
    const deck = createDefaultOficinasDeck();
    deck.pages = deck.pages.filter(
      (page) =>
        page.id !== "oficinas-asignadas-elemento" &&
        page.id !== "oficinas-resueltas-elemento"
    );

    const ids = mergeOficinasDeckTemplate(deck).pages.map((page) => page.id);

    expect(ids.indexOf("oficinas-asignadas-elemento")).toBe(
      ids.indexOf("oficinas-asignadas-semanal") + 1
    );
    expect(ids.indexOf("oficinas-resueltas-elemento")).toBe(
      ids.indexOf("oficinas-resueltas-semanal") + 1
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
