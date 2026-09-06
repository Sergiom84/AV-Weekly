import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const PAGES_DIR = path.resolve(
  import.meta.dirname,
  "../client/src/modules/oficinas/pages"
);

function pageSources(): { name: string; source: string }[] {
  return fs
    .readdirSync(PAGES_DIR)
    .filter((name) => name.endsWith(".tsx"))
    .map((name) => ({
      name,
      source: fs.readFileSync(path.join(PAGES_DIR, name), "utf8"),
    }));
}

/**
 * The rule a printed pivot has to follow: whoever draws a chart and a table of
 * the same measure must resolve the manual corrections once, in a helper, and
 * feed both from it.
 *
 * Pinned as a sweep of the sources because the suite runs on Node with no DOM,
 * so there is no way to render a slide and compare the two halves. It is a
 * blunt instrument, and it is aimed at a failure that already happened: the
 * IMAC table was added reading the imported series while the chart read the
 * corrected one, so a week typed as 99 printed 99 in the bars and 10 in the
 * table underneath, on the same slide.
 */
describe("Oficinas manual corrections", () => {
  it("keeps every page that prints a pivot table off the raw override reader", () => {
    const sources = pageSources();

    // The sweep has to find the directory it is guarding, or it passes by
    // finding nothing the day the pages move.
    expect(sources.length).toBeGreaterThan(10);

    const offenders = sources
      .filter(({ source }) => source.includes("<SemanalTable"))
      .filter(({ source }) => /\boverriddenValue\s*\(/.test(source))
      .map(({ name }) => name);

    expect(offenders).toEqual([]);
  });

  it("builds the IMAC slide's chart and table from the same helper", () => {
    const imac = pageSources().find(({ name }) => name === "ImacPage.tsx");

    if (!imac) {
      throw new Error("Missing ImacPage.tsx in the Oficinas pages directory");
    }

    expect(imac.source).toContain('from "../imacSeries"');
    // The table rows are the helper's rows, not a second pass over the dataset.
    expect(imac.source).toContain("seriesRows.map(entry => entry.row)");
  });
});
