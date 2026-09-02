import { describe, expect, it } from "vitest";
import { deckChanges } from "./deck-change-history.js";

function page(overrides: Record<string, number> = {}, title = "Incidencias") {
  return {
    id: "page-1",
    kind: "chart",
    supportType: null,
    text: { title },
    visible: true,
    weekSelection: null,
    years: null,
    overrides,
  };
}

describe("deck change history", () => {
  it("records the changed cell with its visible slide number", () => {
    const changes = deckChanges(
      "oficinas",
      [page()],
      [page({ "total:S35": 99 })]
    );

    expect(changes).toEqual([
      expect.objectContaining({
        department: "oficinas",
        pageId: "page-1",
        slideNumber: 1,
        pageTitle: "Incidencias",
        fieldKey: "overrides.total:S35",
        fieldLabel: "total · S35",
        previousValue: null,
        newValue: 99,
      }),
    ]);
  });

  it("records text and visibility separately without logging unchanged fields", () => {
    const previous = page({}, "Antes");
    const next = { ...page({}, "Después"), visible: false };
    const changes = deckChanges("av", [previous], [next]);

    expect(changes.map(change => change.fieldLabel)).toEqual([
      "Título",
      "Visibilidad",
    ]);
    expect(changes.every(change => change.slideNumber === 1)).toBe(true);
  });
});
