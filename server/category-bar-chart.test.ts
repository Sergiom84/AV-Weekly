import { describe, expect, it } from "vitest";
import { groupedLabelPlacement } from "../client/src/components/deck/CategoryBarLabelLayout.ts";

describe("CategoryBarChart grouped value labels", () => {
  it("opens the first pair horizontally instead of cascading it vertically", () => {
    expect([0, 1].map(groupedLabelPlacement)).toEqual([
      { offset: -1, textAnchor: "end" },
      { offset: 1, textAnchor: "start" },
    ]);
  });

  it("repeats the same placement for the HIC pair", () => {
    expect([2, 3].map(groupedLabelPlacement)).toEqual([
      { offset: -1, textAnchor: "end" },
      { offset: 1, textAnchor: "start" },
    ]);
  });

  it("never leaves a grouped label centred on its neighbour", () => {
    expect(
      [0, 1, 2, 3].map(index => groupedLabelPlacement(index).offset)
    ).toEqual([-1, 1, -1, 1]);
  });
});
