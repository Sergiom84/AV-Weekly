import { describe, expect, it } from "vitest";
import { sumBy, topEntries, uniqueSorted } from "../client/src/modules/informatica/aggregate.ts";
import type { InformaticaHicRow } from "../shared/modules/informatica/types.ts";

/**
 * Ranking of the 2.1.2 slide, over the real shape of the HIC pivot.
 *
 * The numbers are the ones the clean workbook publishes for the last two months
 * of the window, so a change of source or of ranking criterion shows up here
 * instead of on the slide.
 */

const PIVOT = "2-2 - HIC (SSCC) Mensual - Inci";

function row(mes: string, categoria: string, total: number): InformaticaHicRow {
  return { ambito: PIVOT, mes, categoria, metrica: "Incidencias", total };
}

/** Last two months of the reference window, plus the in-flight one. */
const rows: InformaticaHicRow[] = [
  row("2026/06", "EQUIPO", 299),
  row("2026/06", "APLICACIONES", 107),
  row("2026/06", "IMPRESORA", 85),
  row("2026/06", "HARDWARE", 107),
  row("2026/06", "TELEFONO", 24),
  row("2026/06", "COMUNICACIONES", 12),
  row("2026/07", "EQUIPO", 397),
  row("2026/07", "APLICACIONES", 111),
  row("2026/07", "IMPRESORA", 106),
  row("2026/07", "HARDWARE", 73),
  row("2026/07", "TELEFONO", 11),
  row("2026/07", "COMUNICACIONES", 10),
  // 2026/08 is cut at the extraction date: a fraction of a real month.
  row("2026/08", "EQUIPO", 125),
  row("2026/08", "APLICACIONES", 106),
  row("2026/08", "IMPRESORA", 28),
  row("2026/08", "HARDWARE", 19),
  row("2026/08", "TELEFONO", 6),
  row("2026/08", "COMUNICACIONES", 1),
  // Total series of the same section: no category, must never be ranked.
  { ambito: "3-3 - HIC (SSCC) - Incidencias", mes: "2026/07", categoria: "", metrica: "Resueltas", total: 722 },
];

describe("Top 5 de incidencias", () => {
  const pivot = rows.filter(entry => entry.categoria !== "");

  it("ignora las series totales, que no llevan categoría", () => {
    expect(pivot).toHaveLength(rows.length - 1);
    expect(uniqueSorted(pivot.map(entry => entry.mes))).toEqual([
      "2026/06",
      "2026/07",
      "2026/08",
    ]);
  });

  it("ordena por el total de la ventana y devuelve las cinco de la referencia", () => {
    const totals = sumBy(pivot, entry => entry.categoria, entry => entry.total);
    const top = topEntries(totals, 5).map(entry => entry.label);

    expect(top).toEqual([
      "EQUIPO",
      "APLICACIONES",
      "IMPRESORA",
      "HARDWARE",
      "TELEFONO",
    ]);
  });

  it("suma la ventana entera en vez de mirar un solo mes", () => {
    const totals = sumBy(pivot, entry => entry.categoria, entry => entry.total);

    expect(totals.get("EQUIPO")).toBe(299 + 397 + 125);
    expect(totals.get("HARDWARE")).toBe(107 + 73 + 19);
    // Queda fuera del top cinco, pero por su volumen y no por descarte previo.
    expect(totals.get("COMUNICACIONES")).toBe(12 + 10 + 1);
  });

  it("deja fuera del top a la sexta categoría", () => {
    const totals = sumBy(pivot, entry => entry.categoria, entry => entry.total);
    const top = topEntries(totals, 5).map(entry => entry.label);

    expect(top).not.toContain("COMUNICACIONES");
    expect(top).toHaveLength(5);
  });
});
