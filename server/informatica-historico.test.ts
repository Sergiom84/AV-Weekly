import { describe, expect, it } from "vitest";
import {
  historicoByMonth,
  monthsEndingAt,
  publishedMonthlyTotals,
  publishedTotal,
} from "../client/src/modules/informatica/aggregate.ts";
import { isReportedWorkOrder } from "../client/src/modules/informatica/sources.ts";
import type { InformaticaDataset } from "../shared/modules/informatica/types.ts";
import { INFORMATICA_HISTORICO_UNTIL } from "../shared/modules/informatica/types.ts";

/**
 * The 2.1.1 slide is assembled from two sources that disagree on purpose: the
 * weekly extracts, which only cover full months from 2025/06, and the figures
 * frozen in the clean workbook, which are the ones already presented to the
 * client. Every number below was read off that workbook, so a failure here means
 * the deck stopped matching the document it replaces.
 */

const dataset: InformaticaDataset = {
  source: { sourceFile: null, uploadedAt: null },
  historico: [
    { serie: "incidencias", mes: "2025/03", total: 877 },
    { serie: "incidencias", mes: "2025/04", total: 875 },
    { serie: "incidencias", mes: "2025/05", total: 788 },
    { serie: "incidencias", mes: "2025/06", total: 771 },
    { serie: "workOrders", mes: "2025/03", total: 1472 },
    { serie: "workOrders", mes: "2025/05", total: 1263 },
    { serie: "workOrders", mes: "2025/06", total: 941 },
  ],
};

describe("series congeladas de Informática", () => {
  it("separa las series y no mezcla sus meses", () => {
    const incidencias = historicoByMonth(dataset, "incidencias");
    const workOrders = historicoByMonth(dataset, "workOrders");

    expect(incidencias.get("2025/03")).toBe(877);
    expect(workOrders.get("2025/03")).toBe(1472);
    expect(workOrders.get("2025/04")).toBeUndefined();
  });

  it("devuelve un mapa vacío cuando el histórico no está cargado", () => {
    const sinHistorico: InformaticaDataset = {
      source: { sourceFile: null, uploadedAt: null },
    };

    expect(historicoByMonth(sinHistorico, "incidencias").size).toBe(0);
  });

  it("publica el histórico hasta la frontera y el cálculo a partir de ella", () => {
    const incidencias = historicoByMonth(dataset, "incidencias");

    // 2025/05 se calcula en 171 porque el extracto arranca el día 12; lo
    // publicado fue 788.
    expect(publishedTotal("incidencias", "2025/05", incidencias, 171)).toBe(788);
    // 2025/06 en adelante manda el cálculo, aunque el histórico exista.
    expect(publishedTotal("incidencias", "2025/06", incidencias, 770)).toBe(770);
    expect(INFORMATICA_HISTORICO_UNTIL.incidencias).toBe("2025/05");
  });

  it("calcula siempre los Work Orders, que no tienen frontera", () => {
    const workOrders = historicoByMonth(dataset, "workOrders");

    // El extracto cubre meses enteros desde 2025/02, asi que el congelado nunca
    // manda: 2025/06 vale 1532 y no los 941 que se capturaron con ventana corta.
    expect(publishedTotal("workOrders", "2025/03", workOrders, 1536)).toBe(1536);
    expect(publishedTotal("workOrders", "2025/06", workOrders, 1532)).toBe(1532);
    expect(INFORMATICA_HISTORICO_UNTIL.workOrders).toBeUndefined();
  });

  it("cae al cálculo cuando el histórico no cubre un mes bajo la frontera", () => {
    const incidencias = historicoByMonth(dataset, "incidencias");

    expect(publishedTotal("incidencias", "2025/01", incidencias, 1202)).toBe(1202);
  });

  it("construye una ventana de 18 meses naturales, sin saltarse los vacíos", () => {
    const months = monthsEndingAt("2026/08", 18);

    expect(months).toHaveLength(18);
    expect(months[0]).toBe("2025/03");
    expect(months.at(-1)).toBe("2026/08");
    expect(months).toContain("2025/12");
    expect(months).toContain("2026/01");
  });
});

/**
 * The yearly citas chart: the extract starts halfway through May 2025 and the
 * frozen series carries the whole year. Figures read off the clean workbook,
 * Hoja 18.
 */
describe("serie anual de citas publicada", () => {
  const citas: InformaticaDataset = {
    source: { sourceFile: null, uploadedAt: null },
    historico: [
      { serie: "citas", mes: "2024/12", total: 1435 },
      { serie: "citas", mes: "2025/04", total: 2273 },
      { serie: "citas", mes: "2025/05", total: 2465 },
      { serie: "citas", mes: "2025/06", total: 2503 },
    ],
  };
  const extracto = [
    { mes: "2025/05", citas: 4 },
    { mes: "2025/06", citas: 2469 },
    { mes: "2025/07", citas: 2219 },
  ];

  it("completa los meses que el extracto no alcanza y respeta la frontera", () => {
    const monthly = publishedMonthlyTotals(
      citas,
      "citas",
      extracto,
      row => row.mes,
      row => row.citas
    );

    expect(monthly).toEqual([
      // Abril no está en el extracto y el histórico manda hasta mayo.
      { mes: "2025/04", total: 2273 },
      // Mayo a medias en el extracto: 4 frente a las 2465 publicadas.
      { mes: "2025/05", total: 2465 },
      // Junio ya es del extracto aunque el histórico lo tenga.
      { mes: "2025/06", total: 2469 },
      { mes: "2025/07", total: 2219 },
    ]);
  });

  it("no resucita un año que el extracto no cubre", () => {
    const monthly = publishedMonthlyTotals(
      citas,
      "citas",
      extracto,
      row => row.mes,
      row => row.citas
    );

    expect(monthly.some(row => row.mes.startsWith("2024"))).toBe(false);
  });
});

describe("alcance publicado de los Work Orders", () => {
  it("cuenta sólo las categorías y los edificios de la matriz del informe", () => {
    expect(isReportedWorkOrder({ edificio: "Tablas I", tipo: "TRASLADO" })).toBe(true);
    // Categoría real del extracto, pero reportada en otras páginas.
    expect(isReportedWorkOrder({ edificio: "Tablas I", tipo: "PETICIONES IMAC" })).toBe(false);
    // Fila cuya dirección no resolvió contra el maestro de edificios.
    expect(isReportedWorkOrder({ edificio: "#N/A", tipo: "TRASLADO" })).toBe(false);
    expect(isReportedWorkOrder({ edificio: "", tipo: "TRASLADO" })).toBe(false);
  });
});
