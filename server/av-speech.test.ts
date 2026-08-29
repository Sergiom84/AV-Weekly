import { describe, expect, it } from "vitest";
import {
  calculateResolutionTableTotals,
  createDefaultDeck,
  emptyWeeklyDataset,
  generateWeeklySpeech,
  reportedWeekAvailability,
  resolutionValueAt,
  resolveWeekSelection,
} from "../shared/informe.ts";
import type {
  InformeWeeklyDataset,
  ResolutionRow,
  SupportType,
} from "../shared/informe.ts";

const weeks = [31, 32, 33, 34];

function comparison(type: SupportType, value: number) {
  return { year: 2025, totalsByWeek: { "34": value } };
}

function matrix(rows: Array<[string, number]>) {
  return {
    weeks,
    rows: rows.map(([label, value]) => ({
      label,
      values: [0, 0, 0, value],
      total: value,
    })),
    totals: weeks.map((_, index) =>
      rows.reduce(
        (sum, [, value]) => sum + (index === weeks.length - 1 ? value : 0),
        0
      )
    ),
  };
}

function resolution(
  tier2: string,
  tier3: string,
  total: number
): ResolutionRow {
  return { category: "AV", tier2, tier3, total };
}

function speechDataset(): InformeWeeklyDataset {
  const weekly = emptyWeeklyDataset();
  weekly.maxWeek = 34;

  weekly.byType.Remotos.categories = matrix([
    ["ERRORES", 5],
    ["CONEXION", 6],
    ["OPERATIVA", 0],
    ["VIDEO", 9],
  ]);
  weekly.byType.Remotos.comparisons = [comparison("Remotos", 19)];

  weekly.byType.Programados.locations = matrix([
    ["CIUDAD", 1],
    ["CAMPUS", 0],
    ["TERRITORIOS", 0],
  ]);
  weekly.byType.Programados.resolutionsByWeek = {
    "34": [resolution("SALA", "PREPARACION SALA", 1)],
  };
  weekly.byType.Programados.comparisons = [comparison("Programados", 2)];

  weekly.byType.Presenciales.locations = matrix([
    ["TERRITORIOS", 7],
    ["CIUDAD", 1],
    ["CAMPUS", 11],
  ]);
  weekly.byType.Presenciales.resolutionsByWeek = {
    "34": [
      resolution("SALA", "DES/INSTALACION", 3),
      resolution("SALA", "DES/MONTAJE", 16),
    ],
  };
  weekly.byType.Presenciales.comparisons = [comparison("Presenciales", 13)];

  weekly.byType.Incidencias.locations = matrix([
    ["CIUDAD", 0],
    ["RECOLETOS", 1],
  ]);
  weekly.byType.Incidencias.resolutionsByWeek = {
    "34": [resolution("PROYECTOR", "REINICIO", 1)],
  };
  weekly.byType.Incidencias.comparisons = [comparison("Incidencias", 1)];

  weekly.byType.Correctivos.locations = matrix([
    ["CIUDAD", 17],
    ["TERRITORIOS", 2],
    ["CAMPUS", 3],
  ]);
  weekly.byType.Correctivos.resolutionsByWeek = {
    "34": [
      resolution("VC. CISCO", "SUSTITUCION", 8),
      resolution("CABLEADO", "SANEADO", 1),
      resolution("CABLEADO", "SUSTITUCION", 4),
      resolution("ALMACEN", "INVENTARIO", 2),
      resolution("EQUIPO VIDEO", "REINICIO", 2),
      resolution("PC/PORTATIL", "REINICIO", 2),
      resolution("ROOMWIZARD/QR", "REINICIO", 2),
      resolution("VIDEO WALL", "ENCENDIDO/APAGADO", 1),
    ],
  };
  weekly.byType.Correctivos.comparisons = [comparison("Correctivos", 7)];

  return weekly;
}

describe("speech semanal AV", () => {
  it("reproduce el speech de Sergio desde la última semana global", () => {
    expect(generateWeeklySpeech(speechDataset())).toMatchInlineSnapshot(`
      "Buenos días a todos,
      Soporte remoto:
      Se han resuelto 5 incidencias en remoto, gestionado 6 conexiones y se ha guiado al usuario en 0 ocasiones. Dando un total de 11 soportes remotos, 8 menos que el año pasado.
      ----------------------------------------------------
      En Soporte programado:
      Se han realizado 1 en CIUDAD, sumando 1. Son 1 menos que el año pasado (2).
      Dentro del tipo de resolución: 1 preparación sala.
      ----------------------------------------------------
      Soportes presenciales:
      En la volumetría semanal, el equipo ha realizado los siguientes presenciales: 7 en TERRITORIOS, 1 en CIUDAD y 11 en CAMPUS. Total semanal: 19. Son 6 más que el año pasado.
      El motivo de ésta diferencia es debido a los etiquetados.
      Dentro del tipo de resolución: Ha habido 16 des/montaje y 3 des/instalacion.
      ----------------------------------------------------
      Incidencias:
      1 en RECOLETOS, sumando 1. Son 0 más que el año pasado (1)
      Dentro del tipo de resolución, destacamos: 1 en proyector.
      ----------------------------------------------------
      Y finalizamos con Correctivos:
      17 en CIUDAD, 2 en TERRITORIOS y 3 en CAMPUS, sumando 22. Son 15 más que en el año pasado (7).
      Dentro del tipo de resolución, destacan: 8 vc. cisco y 5 cableado."
    `);
  });

  it("ignora filtros y filas ocultas del deck", () => {
    const weekly = speechDataset();
    const deck = createDefaultDeck();
    for (const page of deck.pages) {
      if (page.kind === "weeklySupport" || page.kind === "resolutionDetail") {
        page.weekSelection = { mode: "list", from: 31, to: 31, weeks: [31] };
        page.hiddenRows = ["CIUDAD", "TERRITORIOS", "CONEXION"];
      }
    }

    expect(generateWeeklySpeech(weekly, deck)).toBe(
      generateWeeklySpeech(weekly)
    );
  });
});

describe("totales de resolución", () => {
  it("muestra cero cuando una resolución no tiene fila en una semana disponible", () => {
    expect(
      resolutionValueAt(
        { "34": [resolution("SALA", "MONTAJE", 3)] },
        {},
        { tier2: "SALA", tier3: "MONTAJE" },
        33
      )
    ).toBe(0);
  });

  it("mantiene el total acumulado al filtrar columnas y respeta overrides", () => {
    const byWeek = {
      "31": [resolution("SALA", "MONTAJE", 2)],
      "32": [resolution("SALA", "MONTAJE", 0)],
      "34": [resolution("SALA", "MONTAJE", 3)],
    };
    const rows = [
      { tier2: "SALA", tier3: "MONTAJE" },
      { tier2: "SALA", tier3: "SIN ACTIVIDAD" },
    ];
    const overrides = { "SALA|MONTAJE:31": 4 };

    expect(
      resolveWeekSelection(
        { mode: "range", from: 34, to: 34, weeks: [] },
        weeks
      )
    ).toEqual([34]);
    expect(
      resolveWeekSelection(
        { mode: "window", from: 31, to: 34, weeks: [], size: 2 },
        weeks
      )
    ).toEqual([33, 34]);
    expect(reportedWeekAvailability(Array.from({ length: 52 }, (_, index) => index + 1), weeks)).toEqual(
      Array.from({ length: 34 }, (_, index) => index + 1)
    );

    const totals = calculateResolutionTableTotals(
      weeks,
      rows,
      byWeek,
      overrides
    );
    expect(totals).toEqual({
      rowTotals: {
        "SALA|MONTAJE": 7,
        "SALA|SIN ACTIVIDAD": 0,
      },
      weekTotals: { "31": 4, "32": 0, "33": 0, "34": 3 },
      grandTotal: 7,
    });
  });
});
