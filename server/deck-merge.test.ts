import { describe, expect, it } from "vitest";
import type { DeckPage, DeckState } from "../shared/deck/core.ts";
import { mergeDeckTemplate } from "../shared/deck/merge.ts";

function page(id: string, kind: string, title = id): DeckPage {
  return {
    id,
    kind,
    supportType: null,
    text: { title },
    visible: true,
    weekSelection: null,
    years: null,
    overrides: {},
  };
}

function deck(pages: DeckPage[]): DeckState {
  return { pages, updatedAt: "2026-08-01T00:00:00.000Z" };
}

const REFERENCE: DeckPage[] = [
  page("cover", "cover"),
  page("index", "index"),
  page("data", "section", "Datos"),
  page("closing", "closing", "Gracias"),
];

describe("mergeDeckTemplate", () => {
  it("inserts a missing page after the nearest surviving predecessor", () => {
    const stored = deck([
      page("cover", "cover"),
      page("index", "index"),
      page("closing", "closing", "Gracias"),
    ]);
    const merged = mergeDeckTemplate(stored, REFERENCE);

    expect(merged.pages.map((entry) => entry.id)).toEqual([
      "cover",
      "index",
      "data",
      "closing",
    ]);
  });

  it("places a page at the front when no predecessor survives", () => {
    const stored = deck([page("closing", "closing", "Gracias")]);
    const merged = mergeDeckTemplate(stored, REFERENCE);

    expect(merged.pages[0]?.id).toBe("cover");
    expect(merged.pages.map((entry) => entry.id)).toEqual([
      "cover",
      "index",
      "data",
      "closing",
    ]);
  });

  it("never inserts a non-closing page after the closing slide", () => {
    const stored = deck([
      page("cover", "cover"),
      page("closing", "closing", "Gracias"),
    ]);
    const merged = mergeDeckTemplate(stored, REFERENCE);
    const closingIndex = merged.pages.findIndex((entry) => entry.kind === "closing");

    expect(closingIndex).toBe(merged.pages.length - 1);
    expect(merged.pages.some((entry) => entry.id === "data")).toBe(true);
  });

  it("does not rewrite a stored page's title, visibility or order", () => {
    const stored = deck([
      page("cover", "cover", "Portada tocada"),
      { ...page("index", "index"), visible: false },
      page("data", "section", "Título del editor"),
      page("closing", "closing", "Gracias"),
    ]);
    const shuffled = {
      ...stored,
      pages: [stored.pages[0], stored.pages[2], stored.pages[1], stored.pages[3]],
    };
    const merged = mergeDeckTemplate(shuffled, REFERENCE);

    expect(merged.pages.map((entry) => entry.id)).toEqual([
      "cover",
      "data",
      "index",
      "closing",
    ]);
    expect(merged.pages.find((entry) => entry.id === "cover")?.text.title).toBe(
      "Portada tocada"
    );
    expect(merged.pages.find((entry) => entry.id === "index")?.visible).toBe(false);
    expect(merged.pages.find((entry) => entry.id === "data")?.text.title).toBe(
      "Título del editor"
    );
  });

  it("realigns only the kind of a stored id whose spec changed", () => {
    const stored = deck([
      page("cover", "cover"),
      page("index", "index"),
      page("data", "notes", "Datos"),
      page("closing", "closing", "Gracias"),
    ]);
    const merged = mergeDeckTemplate(stored, REFERENCE);
    const data = merged.pages.find((entry) => entry.id === "data");

    expect(data?.kind).toBe("section");
    expect(data?.text.title).toBe("Datos");
  });

  it("keeps a page the user added by hand", () => {
    const manual = page("manual-follow-up", "section", "Seguimiento");
    const stored = deck([
      page("cover", "cover"),
      page("index", "index"),
      page("data", "section", "Datos"),
      manual,
      page("closing", "closing", "Gracias"),
    ]);
    const merged = mergeDeckTemplate(stored, REFERENCE);
    const kept = merged.pages.find((entry) => entry.id === "manual-follow-up");

    expect(kept?.text).toEqual({ title: "Seguimiento" });
    expect(merged.pages.map((entry) => entry.id)).toEqual([
      "cover",
      "index",
      "data",
      "manual-follow-up",
      "closing",
    ]);
  });

  it("runs migratePage before kind realignment and does not overwrite a custom field", () => {
    const stored = deck([
      page("cover", "cover"),
      page("index", "index"),
      page("data", "notes", "viejo"),
      page("closing", "closing", "Gracias"),
    ]);
    const custom = deck([
      page("cover", "cover"),
      page("index", "index"),
      page("data", "notes", "personalizado"),
      page("closing", "closing", "Gracias"),
    ]);
    const migrate = (entry: DeckPage) =>
      entry.id === "data" && entry.text.title === "viejo"
        ? { ...entry, text: { ...entry.text, title: "nuevo" } }
        : entry;

    const migrated = mergeDeckTemplate(stored, REFERENCE, migrate);
    const preserved = mergeDeckTemplate(custom, REFERENCE, migrate);

    expect(migrated.pages.find((entry) => entry.id === "data")).toMatchObject({
      kind: "section",
      text: { title: "nuevo" },
    });
    expect(preserved.pages.find((entry) => entry.id === "data")).toMatchObject({
      kind: "section",
      text: { title: "personalizado" },
    });
  });

  it("does not mutate the stored pages array", () => {
    const stored = deck([
      page("cover", "cover"),
      page("index", "index"),
      page("closing", "closing", "Gracias"),
    ]);
    const before = stored.pages.slice();
    mergeDeckTemplate(stored, REFERENCE);

    expect(stored.pages).toEqual(before);
  });

  it("is a no-op on a deck that already matches the reference ids", () => {
    const stored = deck(REFERENCE.map((entry) => ({ ...entry })));
    const merged = mergeDeckTemplate(stored, REFERENCE);

    expect(merged.pages.map((entry) => entry.id)).toEqual(
      REFERENCE.map((entry) => entry.id)
    );
  });

  it("does not invent a closing page when the reference has none", () => {
    const reference = [page("cover", "cover"), page("data", "section", "Datos")];
    const stored = deck([page("cover", "cover")]);
    const merged = mergeDeckTemplate(stored, reference);

    expect(merged.pages.map((entry) => entry.id)).toEqual(["cover", "data"]);
    expect(merged.pages.some((entry) => entry.kind === "closing")).toBe(false);
  });
});
