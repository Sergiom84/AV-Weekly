import { describe, expect, it } from "vitest";
import { DECK_MODULES, getDeckModule } from "../shared/deck/registry.ts";

describe("deck artwork", () => {
  it("gives each module its own cover", () => {
    const covers = DECK_MODULES.map(module => module.deck?.artwork.cover);

    expect(covers).toEqual([
      "/informe/oficinas.png",
      "/informe/sscc.png",
      "/informe/aga.png",
      "/informe/portada.png",
    ]);
    expect(new Set(covers).size).toBe(covers.length);
  });
});

describe("informatica sources", () => {
  it("only offers the Drive text upload in the sidebar", () => {
    const uploads = getDeckModule("informatica").deck?.uploads ?? [];

    expect(uploads.map(slot => slot.id)).toEqual(["texto"]);
    expect(uploads.some(slot => slot.id === "plano")).toBe(false);
  });
});

describe("av sources", () => {
  it("offers the Drive text as the weekly input", () => {
    const uploads = getDeckModule("av").deck?.uploads ?? [];

    expect(uploads.map(slot => slot.id)).toEqual(["texto"]);
    expect(uploads[0]).toMatchObject({
      path: "/api/informe/upload/texto",
      accept: ".txt,.tsv,.csv",
    });
  });
});
