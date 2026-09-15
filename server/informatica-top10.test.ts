import { describe, expect, it } from "vitest";
import { topTenComparison } from "../client/src/modules/informatica/aggregate.ts";
import type {
  InformaticaComparativaRow,
  InformaticaDataset,
  InformaticaIncidenciaRow,
} from "../shared/modules/informatica/types.ts";

/**
 * Ranking of the 2.1.3 slide. Months after the operational cut stay off the
 * axis; the month the cut falls in is drawn, even when it is still in progress.
 */

const COMPONENTS = "11-10 - Comparativa Comonente_";
const PORTATIL = "11-11 - Comparativa Portatil";
const SOFTWARE = "11-12 - Comparativa Software";
const SISTEMA = "11-13 - Comparativa SO";

function row(
  vista: string,
  elemento: string,
  mes: string,
  total: number
): InformaticaComparativaRow {
  return { vista, elemento, mes, total };
}

function incidencia(fecha: string): InformaticaIncidenciaRow {
  return {
    fecha,
    semana: 31,
    mes: fecha.slice(0, 7).replace("-", "/"),
    categoria: "",
    subcategoria: "",
    metrica: "",
    edificio: "",
    tickets: 0,
  };
}

function dataset(
  comparativas: InformaticaComparativaRow[],
  cut = "2026-07-31"
): InformaticaDataset {
  return {
    source: { sourceFile: "plano.xlsx", uploadedAt: null },
    comparativas,
    incidencias: [incidencia(cut)],
  };
}

function component(elemento: string, june: number, july: number, august: number) {
  return [
    row(COMPONENTS, elemento, "2026/06", june),
    row(COMPONENTS, elemento, "2026/07", july),
    row(COMPONENTS, elemento, "2026/08", august),
  ];
}

const comparativas: InformaticaComparativaRow[] = [
  ...component("PORTATIL", 40, 100, 900),
  ...component("SISTEMA OPERATIVO", 30, 90, 800),
  ...component("SOFTWARE", 20, 80, 700),
  ...component("RED", 10, 70, 600),
  ...component("IMPRESORA", 9, 60, 500),
  ...component("MONITOR", 8, 50, 400),
  ...component("TECLADO", 7, 40, 300),
  ...component("RATON", 6, 30, 200),
  ...component("AURICULARES", 5, 20, 100),
  ...component("WEBCAM", 4, 10, 90),
  ...component("DOCK", 3, 5, 80),
  ...component("CABLE", 100, 1, 70),
  row(PORTATIL, "AVERIA", "2026/06", 12),
  row(PORTATIL, "AVERIA", "2026/07", 8),
  row(SOFTWARE, "MIGRACION WINDOWS 11", "2026/06", 4),
  row(SOFTWARE, "MIGRACION WINDOWS 11", "2026/07", 15),
  row(SISTEMA, "REINSTALACION", "2026/06", 2),
  row(SISTEMA, "REINSTALACION", "2026/07", 9),
];

describe("Top Ten incidencias SSCC", () => {
  const result = topTenComparison(dataset(comparativas));

  it("cierra en julio y no dibuja meses posteriores al corte", () => {
    expect(result.columns).toEqual(["Jun 26", "Jul 26"]);
  });

  it("dibuja el mes en curso cuando el corte cae dentro de él", () => {
    const inFlight = topTenComparison(
      dataset(
        [
          ...comparativas,
          row(COMPONENTS, "PORTATIL", "2026/09", 67),
          row(COMPONENTS, "SOFTWARE", "2026/09", 46),
          row(COMPONENTS, "SISTEMA OPERATIVO", "2026/09", 27),
          row(COMPONENTS, "PORTATIL", "2026/10", 900),
          row(COMPONENTS, "SOFTWARE", "2026/10", 800),
          row(COMPONENTS, "SISTEMA OPERATIVO", "2026/10", 700),
        ],
        "2026-09-14"
      )
    );

    expect(inFlight.columns).toEqual(["Jun 26", "Jul 26", "Ago 26", "Sep 26"]);
  });

  it("ordena los diez por el mes cerrado, no por el extracto a medias", () => {
    expect(result.components?.rows.map(entry => entry.label)).toEqual([
      "PORTATIL",
      "SISTEMA OPERATIVO",
      "SOFTWARE",
      "RED",
      "IMPRESORA",
      "MONITOR",
      "TECLADO",
      "RATON",
      "AURICULARES",
      "WEBCAM",
    ]);
    expect(result.components?.rows.map(entry => entry.label)).not.toContain("CABLE");
    expect(result.components?.rows.map(entry => entry.label)).not.toContain("DOCK");
  });

  it("conserva los totales mensuales del mes cerrado en el orden de las columnas", () => {
    expect(result.components?.rows[0]?.values).toEqual([40, 100]);
  });

  it("publica las tres tablas de detalle en el orden de la slide", () => {
    expect(result.details.map(table => table.label)).toEqual([
      "Portátil",
      "Software",
      "Sistema Operativo",
    ]);
    expect(result.details[0]?.rows[0]?.label).toBe("AVERIA");
    expect(result.details[1]?.rows[0]?.label).toBe("MIGRACION WINDOWS 11");
    expect(result.details[2]?.rows[0]?.label).toBe("REINSTALACION");
  });

  it("cae al total de la ventana cuando el mes cerrado no tiene volumen", () => {
    const emptyJuly: InformaticaComparativaRow[] = [
      ...component("PORTATIL", 40, 0, 900),
      ...component("SISTEMA OPERATIVO", 30, 0, 800),
      ...component("SOFTWARE", 20, 0, 700),
      row(PORTATIL, "AVERIA", "2026/06", 12),
      row(SOFTWARE, "MIGRACION WINDOWS 11", "2026/06", 4),
      row(SISTEMA, "REINSTALACION", "2026/06", 2),
    ];
    const fallback = topTenComparison(dataset(emptyJuly));

    expect(fallback.components?.rows.map(entry => entry.label)).toEqual([
      "PORTATIL",
      "SISTEMA OPERATIVO",
      "SOFTWARE",
    ]);
  });
});
