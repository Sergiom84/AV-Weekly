import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { appendPdfPages } from "./pdf-render.js";

describe("slide PDF assembly", () => {
  it("preserves every page, source order and the 16:9 canvas", async () => {
    const result = await PDFDocument.create();
    for (const widths of [[1200], [1200, 600], [1200]]) {
      const source = await PDFDocument.create();
      for (const width of widths) source.addPage([width, 675]);
      await appendPdfPages(result, await source.save());
    }
    const saved = await PDFDocument.load(await result.save());
    expect(saved.getPages().map(page => page.getSize())).toEqual([
      { width: 1200, height: 675 },
      { width: 1200, height: 675 },
      { width: 600, height: 675 },
      { width: 1200, height: 675 },
    ]);
  });
});
