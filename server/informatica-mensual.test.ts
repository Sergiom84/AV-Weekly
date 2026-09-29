import { describe, expect, it } from "vitest";
import {
  buildInformeMensual,
  closedMonth,
  informeMensualSpeech,
  reportedMonth,
} from "../shared/modules/informatica/mensual.ts";
import type { InformaticaDataset } from "../shared/modules/informatica/types.ts";

const labels = {
  workOrder: (raw: string) => raw,
  smartTech: (raw: string) => raw,
  workOrderSites: ["Recoletos"],
  smartTechSites: ["Sede"],
};

function dataset(): InformaticaDataset {
  return {
    source: { sourceFile: "Informatica 2026-09-28.txt", uploadedAt: null, asOfDate: "2026-09-28" },
    incidenciasOnsite: [
      { mes: "2026/09", metrica: "Resueltas", total: 720 },
      { mes: "2026/09", metrica: "Abiertas", total: 736 },
      { mes: "2026/09", metrica: "Backlog", total: 47 },
    ],
    encuestas: [{ fecha: "2026-09-01", mes: "2026/09", valoracion: "5", respuestas: 10 }],
    workOrders: [
      {
        fecha: "2026-09-02",
        mes: "2026/09",
        semana: 36,
        edificio: "Recoletos",
        tipo: "IMAC",
        ordenes: 12,
      },
    ],
    citas: [
      {
        fecha: "2026-09-03",
        mes: "2026/09",
        semana: 36,
        edificio: "Sede",
        tipo: "Con Cita",
        citas: 4,
      },
      {
        fecha: "2026-09-03",
        mes: "2026/09",
        semana: 36,
        edificio: "Sede",
        tipo: "Sin Cita",
        citas: 6,
      },
    ],
    hic: [
      { ambito: "2-2 - HIC (SSCC) Mensual - Inci", mes: "2026/08", categoria: "EQUIPO", metrica: "Incidencias", total: 100 },
      { ambito: "2-2 - HIC (SSCC) Mensual - Inci", mes: "2026/09", categoria: "EQUIPO", metrica: "Incidencias", total: 140 },
      { ambito: "2-2 - HIC (SSCC) Mensual - Inci", mes: "2026/09", categoria: "APLICACIONES", metrica: "Incidencias", total: 20 },
    ],
    slas: [
      { mes: "2026/08", svt: "WPSPAIN_Minsait.Inc.Resolución.P3.SSCC", cumplido: 98, incumplido: 2, total: 100 },
      { mes: "2026/09", svt: "WPSPAIN_Minsait.Inc.Resolución.P3.SSCC", cumplido: 90, incumplido: 10, total: 100 },
      { mes: "2026/09", svt: "WPSPAIN_Minsait.Inc.Resolución.P4.SSCC", cumplido: 95, incumplido: 5, total: 100 },
      { mes: "2026/09", svt: "WPSPAIN_Minsait.Inc.Reacción.P4.SSCC", cumplido: 95, incumplido: 5, total: 100 },
      { mes: "2026/09", svt: "WPSPAIN_Minsait.Inc.Reacción.P3.SSCC", cumplido: 96, incumplido: 4, total: 100 },
    ],
    renove: [
      { fecha: "2026-09-04", mes: "2026/09", semana: 36, ambito: "España", estado: "RENOVADO", equipos: 37 },
      { fecha: "2026-09-04", mes: "2026/09", semana: 36, ambito: "Holding", estado: "RENOVADO", equipos: 10 },
      { fecha: null, mes: "", semana: 0, ambito: "España", estado: "PENDIENTE USUARIO", equipos: 4 },
    ],
    peticionesMes: [
      { mes: "2026/09", origen: "On Site", estado: "Gestionadas", total: 3 },
    ],
  };
}

describe("informe mensual", () => {
  it("toma el mes de la fecha de extracción y cierra el anterior por defecto", () => {
    expect(reportedMonth("2026-09-28")).toBe("2026/09");
    expect(reportedMonth("no-fecha")).toBeNull();
    expect(closedMonth("2026-09-28")).toBe("2026/08");
    expect(closedMonth("2026-01-05")).toBe("2025/12");
    expect(closedMonth(null)).toBeNull();
  });

  it("toma el backlog de la foto de la extracción para el mes cerrado", () => {
    const source = dataset();
    source.incidenciasOnsite!.push(
      { mes: "2026/08", metrica: "Abiertas", total: 416 },
      { mes: "2026/08", metrica: "Resueltas", total: 413 }
    );
    const agosto = buildInformeMensual(source, "2026/08", labels);

    expect(agosto.incidencias).toEqual({ resueltas: 413, abiertas: 416, backlog: 47 });
    expect(buildInformeMensual(source, "2026/10", labels).incidencias.backlog).toBeNull();
  });

  it("publica al 100 % un nivel de SLA sin incidencias en un mes con resultados", () => {
    const informe = buildInformeMensual(dataset(), "2026/09", labels);
    const share = (id: string) => informe.slas.find((row) => row.id === id)?.share;

    expect(share("reaccion.p1")).toBe(1);
    expect(share("resolucion.p3")).toBeCloseTo(0.9);
    expect(buildInformeMensual(dataset(), "2026/07", labels).slas.every((row) => row.share === null)).toBe(true);
  });

  it("destaca una sede muy por encima de su media de los seis meses anteriores", () => {
    const source = dataset();
    const orden = (mes: string, edificio: string, ordenes: number) => ({
      fecha: `${mes.replace("/", "-")}-02`,
      mes,
      semana: 1,
      edificio,
      tipo: "IMAC",
      ordenes,
    });
    source.workOrders = [
      orden("2026/07", "Recoletos", 10),
      orden("2026/08", "Recoletos", 14),
      orden("2026/09", "Recoletos", 40),
      orden("2026/08", "Sede", 20),
      orden("2026/09", "Sede", 22),
      orden("2026/09", "Tablas I", 90),
    ];
    const informe = buildInformeMensual(source, "2026/09", labels);

    expect(informe.destacados).toEqual([
      { bloque: "workOrders", site: "Recoletos", total: 40, media: 12 },
    ]);
  });

  it("arma el cierre con el listado on site, el renove del mes y la matriz de peticiones", () => {
    const informe = buildInformeMensual(dataset(), "2026/09", labels);

    expect(informe.incidencias).toEqual({ resueltas: 720, abiertas: 736, backlog: 47 });
    expect(informe.renove).toEqual({ espana: 37, holding: 10 });
    expect(informe.workOrdersTotal).toBe(12);
    expect(informe.smartTechConCita).toBe(4);
    expect(informe.smartTechSinCita).toBe(6);
    expect(informe.topTen.find((row) => row.categoria === "EQUIPO")).toEqual({
      categoria: "EQUIPO",
      total: 140,
      anterior: 100,
    });
    expect(informe.peticiones.find((row) => row.origen === "On Site")?.gestionadas).toBe(3);
    expect(informe.peticiones.find((row) => row.origen === "Technology")?.gestionadas).toBe(0);
    // No Liberadas row at all: that file was not uploaded.
    expect(informe.peticiones.every((row) => row.liberadas === null)).toBe(true);
    expect(informe.encuestas.promedio).toBe(5);
  });

  it("deja las peticiones en blanco cuando no hay fichero de mes", () => {
    const source = dataset();
    delete source.peticionesMes;
    const informe = buildInformeMensual(source, "2026/09", labels);

    expect(informe.peticionesDisponibles).toBe(false);
    expect(informe.peticiones.every((row) => row.gestionadas === null)).toBe(true);
  });

  it("redacta el speech con las cifras y la casuística escrita a mano", () => {
    const speech = informeMensualSpeech(
      buildInformeMensual(dataset(), "2026/09", labels),
      "El bloqueo de Bitlocker ha subido."
    );

    expect(speech.startsWith("Buenas tardes, os comparto el informe mensual de Septiembre.")).toBe(true);
    expect(speech).toContain("El bloqueo de Bitlocker ha subido.");
    expect(speech).toContain("En incidencias se han abierto 736 y resuelto 720, con un backlog de 47.");
    expect(speech).toContain("Se han renovado 47 equipos, 37 de España y 10 de Holding.");
    expect(speech).toContain("EQUIPO pasa de 100 a 140");
    expect(speech).toContain(
      "En SLA's, quedan por debajo del 95 % Resolución 3 (90 %), bajando Resolución 3 al 90 %."
    );
    expect(speech).not.toContain("Bitlocker ha subido.\n\nEl bloqueo");
    expect(speech.endsWith("Un saludo.")).toBe(true);
  });
});
