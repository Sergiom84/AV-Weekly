import { describe, expect, it } from "vitest";
import { DECK_MODULES } from "../shared/deck/registry.ts";

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
