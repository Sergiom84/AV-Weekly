import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  catalogFromEdificios,
  edificioCode,
  expandEdificioCode,
} from "../shared/modules/informatica/buildingCodes.ts";
import { parseEdificioCatalogTsv } from "./informaticaEdificios.ts";

/**
 * The shipped catalogue against the building labels the report has seen.
 *
 * `informatica-edificios-observados.tsv` lists the names the weekly text was
 * writing before the buildings were coded. Coding each one and expanding it
 * back is the only check that is not circular: it asks whether this catalogue
 * can still read a text produced from the same sources. A label that falls out
 * of it is not a cosmetic defect — the weekly upload is refused until it is
 * added, which is the point of the guard.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const CATALOG = join(HERE, "assets", "informatica-edificios.tsv");
const OBSERVED = join(HERE, "assets", "informatica-edificios-observados.tsv");

/** `seccion -> etiquetas`, ignoring comment lines and blanks. */
function readObserved(): Map<string, string[]> {
  const bySection = new Map<string, string[]>();

  for (const raw of readFileSync(OBSERVED, "utf8").split(/\r?\n/)) {
    // The section leads every data line, so a leading `#` is always a comment
    // here — unlike the catalogue, where `#N/A` is a label in the first cell.
    if (raw.trim() === "" || raw.startsWith("#") || !raw.includes("\t")) {
      continue;
    }

    const separator = raw.indexOf("\t");
    const section = raw.slice(0, separator).trim();
    const label = raw.slice(separator + 1);

    if (section === "" || label.trim() === "") {
      continue;
    }

    bySection.set(section, [...(bySection.get(section) ?? []), label]);
  }

  return bySection;
}

describe("server/assets/informatica-edificios.tsv", () => {
  const catalog = catalogFromEdificios(parseEdificioCatalogTsv(readFileSync(CATALOG, "utf8")));
  const observed = readObserved();

  it("carries the catalogue the coded texts need", () => {
    expect(catalog.length).toBeGreaterThan(100);
  });

  it("was read against every section that codes a building", () => {
    // The sweep must have found all three sections with rows in each: a file
    // read empty would turn the guard below into a green test checking nothing.
    expect([...observed.keys()].sort()).toEqual(["CITAS", "IMACS", "WORKORDERS"]);

    for (const [section, labels] of observed) {
      expect(labels.length, section).toBeGreaterThan(0);
    }
  });

  for (const section of ["WORKORDERS", "CITAS", "IMACS"]) {
    it(`expands every building ${section} names`, () => {
      const labels = observed.get(section) ?? [];
      const missing = labels.filter(
        label => expandEdificioCode(edificioCode(label), catalog) === edificioCode(label)
      );

      expect(missing).toEqual([]);
    });
  }
});
