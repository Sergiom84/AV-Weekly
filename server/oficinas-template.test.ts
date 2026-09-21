import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseOficinasWorkbook } from "./parseOficinasPlano.ts";

function findTemplate(): string | null {
  const dir = "C:/Users/sergi/Desktop/MIX/AV weekly/Oficinas";

  if (!fs.existsSync(dir)) {
    return null;
  }

  const name = fs
    .readdirSync(dir)
    .find(
      (entry) =>
        entry.toLowerCase().startsWith("template oficinas") &&
        entry.toLowerCase().endsWith(".xlsx")
    );

  return name ? path.join(dir, name) : null;
}

const template = findTemplate();
const run = template ? it : it.skip;

describe("Oficinas weekly template (real workbook)", () => {
  run("folds the IMAC listing against sheet 11", () => {
    if (!template) {
      return;
    }

    const workbook = XLSX.readFile(template);
    const { dataset, report } = parseOficinasWorkbook(workbook, 2026);
    const listing = report.sheets.find((sheet) => sheet.named === "peticionesImac");
    const byWeek = new Map(
      (dataset.imac?.peticionesByWeek ?? [])
        .filter((entry) => entry.year === 2026)
        .map((entry) => [entry.week, entry.value])
    );
    const sheet11 = (dataset.peticiones?.totalsByWeek ?? []).filter(
      (entry) => entry.year === 2026
    );
    const diffs = sheet11.filter(
      (entry) => (byWeek.get(entry.week) ?? 0) !== entry.value
    );

    // Asserted as invariants and not as this week's figures: the team exports a
    // new workbook every Monday, one row and one column longer, so pinning
    // 2.559 rows or 36 weeks would turn a passing suite red every week for no
    // reason and train everyone to ignore it.
    const weeks = sheet11.map((entry) => entry.week).sort((a, b) => a - b);
    const first = weeks[0];
    const last = weeks[weeks.length - 1];

    expect(listing?.rows).toBeGreaterThan(1_000);
    expect(weeks.length).toBeGreaterThan(30);

    // Every week reconciles to the digit except, at most, two, and both for a
    // reason the source itself explains:
    //
    // - the first, where the pivot counts requests closed in January that were
    //   opened the year before and this listing, "Año En Curso", cannot see;
    // - the last, when it was still open as the listing was exported. Whether
    //   it is depends on the day the team pulled the file, so it is allowed to
    //   reconcile and not required to: the 21/09/2026 workbook closed week 38
    //   exactly and used to turn this red for no defect at all.
    //
    // Anything else means the listing stopped being read by closing date.
    expect(
      diffs.filter((entry) => entry.week !== first && entry.week !== last)
    ).toEqual([]);
    expect(diffs.map((entry) => entry.week)).toContain(first);
    expect(byWeek.get(first) ?? 0).toBeLessThan(
      sheet11.find((entry) => entry.week === first)!.value
    );
  });
});
