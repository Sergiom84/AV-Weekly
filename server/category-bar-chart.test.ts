import { describe, expect, it } from "vitest";
import {
  groupedLabelOffset,
  groupedLabelTopMargin,
} from "../client/src/components/deck/CategoryBarLabelLayout.ts";

describe("CategoryBarChart grouped value labels", () => {
  it("gives every grouped series a distinct vertical level", () => {
    expect([0, 1, 2, 3].map(groupedLabelOffset)).toEqual([0, 12, 24, 36]);
  });

  it("reserves enough top margin for every label level", () => {
    expect(groupedLabelTopMargin(4)).toBe(52);
  });

  it("keeps the original top margin for a single series", () => {
    expect(groupedLabelTopMargin(1)).toBe(16);
  });
});
