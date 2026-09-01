import { describe, expect, it } from "vitest";
import type { InformaticaRenoveRow } from "../shared/modules/informatica/types.ts";
import {
  renoveGrupo,
  renoveInMonth,
  renoveInWeek,
  renoveMonthSeries,
  renovePendientesUsuario,
  renoveReportedRows,
  renoveTotals,
  renoveWeekLabel,
  renoveWeekSeries,
  renoveWindow,
} from "../client/src/modules/informatica/renove.ts";

function row(
  fecha: string | null,
  ambito: string,
  estado: string,
  equipos: number
): InformaticaRenoveRow {
  return {
    fecha,
    mes: fecha === null ? "" : `${fecha.slice(0, 4)}/${fecha.slice(5, 7)}`,
    semana: 0,
    ambito,
    estado,
    equipos,
  };
}

describe("Renove status grouping", () => {
  it("counts renewed and dismissed as decided and everything else as pending", () => {
    expect(renoveGrupo("RENOVADO")).toBe("renovado");
    expect(renoveGrupo("Renovada")).toBe("renovado");
    expect(renoveGrupo("RECHAZADO")).toBe("desestimado");
    expect(renoveGrupo("NO RENOVAR")).toBe("desestimado");
    expect(renoveGrupo("PENDIENTE USUARIO")).toBe("pendiente");
    expect(renoveGrupo("PENDIENTE ENVÍO")).toBe("pendiente");
  });

  /**
   * A wording nobody anticipated must not inflate the campaign. The colleagues
   * type the status by hand, so the fallback has to be the state that keeps the
   * row out of the total.
   */
  it("leaves an unknown status out of the totals", () => {
    const rows = [
      row("2026-08-19", "España", "RENOVADO", 3),
      row("2026-08-19", "España", "A LA ESPERA DE PIEZA", 5),
    ];

    expect(renoveTotals(rows).total).toBe(3);
  });
});

describe("Renove totals", () => {
  /**
   * The reference slide `2.7.1` prints `800 Renovados`, `36 Desestimados` and
   * `Total 836`. The 36 are inside the 800, not next to them: their box adds
   * the two and double counts the dismissed units.
   */
  it("keeps the dismissed units inside the accumulated figure", () => {
    const rows = [
      row("2026-04-07", "Holding", "RENOVADO", 764),
      row("2026-04-07", "España", "RECHAZADO", 36),
      row("2026-04-07", "España", "PENDIENTE USUARIO", 181),
    ];
    const totals = renoveTotals(rows);

    expect(totals.total).toBe(800);
    expect(totals.renovados).toBe(764);
    expect(totals.desestimados).toBe(36);
    expect(totals.porAmbito.Holding + totals.porAmbito["España"]).toBe(800);
  });

  it("counts the units waiting on the user apart from the campaign", () => {
    const rows = [
      row("2026-08-19", "España", "RENOVADO", 25),
      row(null, "Holding", "Pendiente Usuario", 181),
    ];

    expect(renovePendientesUsuario(rows)).toBe(181);
    expect(renoveTotals(rows).total).toBe(25);
  });
});

describe("Renove weekly series", () => {
  /**
   * Weeks are labelled from the date, never from a `Semana` column: the section
   * opens in December and runs past the following August, so every number from
   * 1 to 52 occurs twice.
   */
  it("labels a week from the ISO week of its Monday", () => {
    expect(renoveWeekLabel("2025-12-01")).toBe("S49");
    expect(renoveWeekLabel("2025-12-22")).toBe("S52");
    expect(renoveWeekLabel("2025-12-29")).toBe("S01");
    expect(renoveWeekLabel("2026-08-17")).toBe("S34");
  });

  it("stacks the two scopes per week and stops at the reported one", () => {
    const rows = [
      row("2025-12-02", "Holding", "RENOVADO", 1),
      row("2026-08-19", "España", "RENOVADO", 17),
      row("2026-08-19", "Holding", "RENOVADO", 2),
      // The extract carries the start of the week after the reported one.
      row("2026-08-25", "España", "RENOVADO", 2),
    ];
    const window = renoveWindow(rows, "2026-08-24");

    // Subida del lunes 24: se informa la semana cerrada que va detrás.
    expect(window).toEqual({ start: "2026-08-17", end: "2026-08-23" });
    expect(renoveWeekSeries(rows, window)).toEqual([
      { semana: "S49", Holding: 1, España: 0 },
      { semana: "S34", Holding: 2, España: 17 },
    ]);
  });

  it("drops the undated rows from the chart and keeps them in the totals", () => {
    const rows = [
      row("2026-08-19", "España", "RENOVADO", 17),
      row(null, "Holding", "RECHAZADO", 34),
    ];
    const window = renoveWindow(rows, "2026-08-24");
    const charted = renoveWeekSeries(rows, window);

    expect(charted).toHaveLength(1);
    expect(charted[0].Holding).toBe(0);
    expect(renoveTotals(rows).total).toBe(51);
  });

  it("strips the 1899 date of a row and keeps the unit counted", () => {
    const rows = renoveReportedRows([
      row("1899-12-30", "Holding", "RENOVADO", 3),
      row("2026-08-19", "España", "RENOVADO", 17),
    ]);
    const window = renoveWindow(rows, "2026-08-24");
    const charted = renoveWeekSeries(rows, window);

    // Serial 0 of the workbook: it is an empty renewal date, not a week.
    expect(rows[0].fecha).toBeNull();
    expect(rows[0].mes).toBe("");
    expect(charted).toHaveLength(1);
    expect(charted[0].semana).toBe("S34");
    expect(renoveMonthSeries(rows)).toHaveLength(1);
    expect(renoveTotals(rows).total).toBe(20);
  });

  it("reads the reported week and its month from the same rows", () => {
    const rows = [
      row("2026-08-05", "España", "RENOVADO", 10),
      row("2026-08-19", "España", "RENOVADO", 17),
      row("2026-08-19", "Holding", "RENOVADO", 2),
    ];
    const window = renoveWindow(rows, "2026-08-24");

    expect(renoveTotals(renoveInWeek(rows, window)).total).toBe(19);
    expect(renoveTotals(renoveInMonth(rows, "2026/08")).total).toBe(29);
  });
});

describe("Renove monthly series", () => {
  it("orders the months chronologically across the year boundary", () => {
    const rows = [
      row("2026-01-08", "Holding", "RENOVADO", 56),
      row("2025-12-02", "Holding", "RENOVADO", 5),
      row("2026-01-08", "España", "RENOVADO", 25),
      row(null, "España", "RENOVADO", 39),
    ];

    expect(renoveMonthSeries(rows)).toEqual([
      { mes: "Dic 25", Holding: 5, España: 0 },
      { mes: "Ene 26", Holding: 56, España: 25 },
    ]);
  });
});

describe("Renove reporting window", () => {
  const rows = [
    row("2026-08-19", "España", "RENOVADO", 17),
    row("2026-08-26", "España", "RENOVADO", 2),
  ];

  it("no publica la semana en curso aunque el corte caiga dentro de ella", () => {
    // Corte en sábado: su propia semana aún no ha cerrado.
    expect(renoveWindow(rows, "2026-08-22")).toEqual({
      start: "2026-08-10",
      end: "2026-08-16",
    });
    // Corte en lunes, la rutina normal.
    expect(renoveWindow(rows, "2026-08-24")).toEqual({
      start: "2026-08-17",
      end: "2026-08-23",
    });
  });

  it("cae a las filas cuando Renove se importa sin fecha de corte", () => {
    // Sin corte manda la regla del viernes sobre la última renovación: el 26 es
    // miércoles, así que su semana todavía no cuenta como cerrada.
    expect(renoveWindow(rows, null)).toEqual({
      start: "2026-08-17",
      end: "2026-08-23",
    });
  });
});
