import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";

/**
 * Header reading of the Drive script, against the two shapes the same file has.
 *
 * A merged header cell is materialised in every row it covers when the workbook
 * is read as XLSX, and only in the top row of the merge after Google converts it
 * to a native spreadsheet. The script runs against the converted copy but is
 * verified locally against the XLSX, so a reader that trusts a single row passes
 * every local check and silently drops its section in production. That is what
 * happened to the 2-2 pivot and to both SLA tabs.
 *
 * The rows below are transcribed from the real file in each environment.
 */

const source = readFileSync(
  fileURLToPath(new URL("../scripts/informatica-drive/Codigo.gs", import.meta.url)),
  "utf8"
);

interface DriveScript {
  mergedHeaderRow: (grid: unknown[][], lastRow: number) => unknown[];
  headerIndex: (row: unknown[]) => Record<string, number>;
  normalize: (value: unknown) => string;
  monthCellCount: (row: unknown[]) => number;
}

function loadScript(): DriveScript {
  const context = createContext({});

  runInContext(source, context);

  return context as unknown as DriveScript;
}

const script = loadScript();

/** `2-2 - HIC (SSCC) Mensual - Inci`, first two rows. */
const PIVOT_XLSX = [
  ["", "Fecha", "2025/05", "2025/06", "2025/07"],
  ["Categorization Tier 1", "", "2025/05", "2025/06", "2025/07"],
];
const PIVOT_SHEETS = [
  ["", "Fecha", "2025/05", "2025/06", "2025/07"],
  ["Categorization Tier 1", "", "", "", ""],
];

/** `12-11 - SLAs finalizados mes en`, first two rows. */
const SLAS_XLSX = [
  ["", "MeasurementStatus", "Cumplido", "Incumplido", "Total"],
  ["SVTTitle", "", "Cumplido", "Incumplido", "Total"],
];
const SLAS_SHEETS = [
  ["", "MeasurementStatus", "Cumplido", "Incumplido", "Total"],
  ["SVTTitle", "", "", "", ""],
];

describe("cabeceras de dos filas del script de Drive", () => {
  it("lee los meses del pivote en las dos formas del fichero", () => {
    for (const grid of [PIVOT_XLSX, PIVOT_SHEETS]) {
      const header = script.mergedHeaderRow(grid, 1);

      expect(script.monthCellCount(header)).toBe(3);
      expect(script.normalize(header[0])).toBe("CATEGORIZATION TIER 1");
    }
  });

  it("lee las columnas de SLAs en las dos formas del fichero", () => {
    for (const grid of [SLAS_XLSX, SLAS_SHEETS]) {
      const columns = script.headerIndex(script.mergedHeaderRow(grid, 1));

      expect(columns[script.normalize("Cumplido")]).toBe(2);
      expect(columns[script.normalize("Incumplido")]).toBe(3);
      expect(columns[script.normalize("Total")]).toBe(4);
    }
  });

  it("la fila de la cabecera por si sola no basta tras la conversión", () => {
    // Sin la fusión, que es exactamente lo que hacia el codigo anterior.
    expect(script.monthCellCount(PIVOT_SHEETS[1])).toBe(0);
    expect(
      script.headerIndex(SLAS_SHEETS[1])[script.normalize("Cumplido")]
    ).toBeUndefined();
  });
});
