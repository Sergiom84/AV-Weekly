import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../client/src/index.css", import.meta.url), "utf8");

describe("deck print layout", () => {
  it("removes screen spacing before paginating fixed-height slides", () => {
    expect(css).toMatch(
      /\[data-deck-list\]\s*>\s*\[data-deck-slide\][\s\S]*?margin-block:\s*0\s*!important/
    );
    expect(css).toMatch(
      /\[data-deck-slide\][\s\S]*?height:\s*900px\s*!important[\s\S]*?overflow:\s*hidden\s*!important/
    );
  });
});
