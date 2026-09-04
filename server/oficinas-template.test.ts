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

    expect(listing?.rows).toBe(2559);
    expect(sheet11).toHaveLength(36);
    expect(diffs.map((entry) => entry.week)).toEqual([1, 36]);
    expect(byWeek.get(1) ?? 0).toBe(6);
    expect(sheet11.find((entry) => entry.week === 1)?.value).toBe(9);
    expect(byWeek.get(36) ?? 0).toBe(0);
    expect(sheet11.find((entry) => entry.week === 36)?.value).toBe(30);
    expect(diffs).toHaveLength(2);
  });
});
