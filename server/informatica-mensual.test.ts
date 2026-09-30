import { describe, expect, it } from "vitest";
import {
  buildInformeMensual,
  closedMonth,
  informeMensualSpeech,
  mesCerrado,
  reportedMonth,
  type MensualSlides,
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
      { mes: "2026/09", metrica: "Resuelto", total: 117 },
      { mes: "2026/09", metrica: "Abiertas", total: 736 },
      { mes: "2026/09", metrica: "Backlog", total: 47 },
    ],
    encuestas: [
      { fecha: "2026-08-01", mes: "2026/08", valoracion: "5", respuestas: 9 },
      { fecha: "2026-08-01", mes: "2026/08", valoracion: "4", respuestas: 1 },
    ],
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

  it("lee el mes anterior a la extracción y toma el backlog de la foto posterior", () => {
    const source = dataset();
    source.incidenciasOnsite!.push({ mes: "2026/08", metrica: "Abiertas", total: 416 });
    const agosto = mesCerrado(source);

    expect(agosto.month).toBe("2026/08");
    // No August row still in Resuelto: zero, not blank, once the metric exists.
    expect(agosto.incidencias).toEqual({ resueltas: 0, abiertas: 416, backlog: 47 });
    expect(agosto.encuestas.numero).toBe(10);
    expect(agosto.encuestas.promedio).toBeCloseTo(4.9);
  });

  it("deja Resueltas en blanco cuando el extracto es anterior a la métrica Resuelto", () => {
    const source = dataset();
    source.incidenciasOnsite = [
      { mes: "2026/08", metrica: "Abiertas", total: 416 },
      { mes: "2026/08", metrica: "Resueltas", total: 413 },
    ];

    expect(mesCerrado(source).incidencias.resueltas).toBeNull();
  });

  it("publica al 100 % un nivel de SLA sin incidencias en un mes con resultados", () => {
    const informe = buildInformeMensual(dataset(), "2026/09", labels);
    const share = (id: string) => informe.slas.find((row) => row.id === id)?.share;

    expect(share("reaccion.p1")).toBe(1);
    expect(share("resolucion.p3")).toBeCloseTo(0.9);
    expect(buildInformeMensual(dataset(), "2026/07", labels).slas.every((row) => row.share === null)).toBe(true);
  });

  it("arma las cifras por sede, el top ten y la matriz de peticiones del mes", () => {
    const informe = buildInformeMensual(dataset(), "2026/09", labels);

    expect(informe.workOrders).toEqual([{ site: "Recoletos", total: 12 }]);
    expect(informe.smartTech).toEqual([{ site: "Sede", conCita: 4, sinCita: 6 }]);
    expect(informe.topTen.find((row) => row.categoria === "EQUIPO")).toEqual({
      categoria: "EQUIPO",
      total: 140,
    });
    expect(informe.peticiones.find((row) => row.origen === "On Site")?.gestionadas).toBe(3);
    expect(informe.peticiones.find((row) => row.origen === "Technology")?.gestionadas).toBe(0);
    // No Liberadas row at all: that file was not uploaded.
    expect(informe.peticiones.every((row) => row.liberadas === null)).toBe(true);
  });

  it("deja las peticiones en blanco cuando no hay fichero de mes", () => {
    const source = dataset();
    delete source.peticionesMes;
    const informe = buildInformeMensual(source, "2026/09", labels);

    expect(informe.peticiones.every((row) => row.gestionadas === null)).toBe(true);
  });

  it("redacta el speech con lo que muestran las dos slides y la casuística escrita a mano", () => {
    const slides: MensualSlides = {
      month: "2026/08",
      incidencias: { resueltas: 0, abiertas: 416, backlog: 47 },
      encuestas: { numero: 121, promedio: 4.93 },
      peticiones: [
        { origen: "On Site", backlog: 359, liberadas: 739, gestionadas: 680 },
        { origen: "Technology", backlog: 20, liberadas: 23, gestionadas: 32 },
      ],
      imacs: { solicitudes: 13, trabajos: 28 },
      workOrders: [
        { site: "Recoletos", total: 331 },
        { site: "Tablas I", total: 178 },
        { site: "Sede", total: 37 },
      ],
      smartTech: [
        { site: "Sede - Principal", conCita: 183, sinCita: 486 },
        { site: "Sevilla", conCita: 86, sinCita: 53 },
      ],
      topTen: [
        { categoria: "EQUIPO", total: 178 },
        { categoria: "APLICACIONES", total: 129 },
        { categoria: "IMPRESORA", total: 42 },
        { categoria: "WEBEX", total: 0 },
      ],
      slas: [
        { id: "reaccion.p1", label: "Reacción 1", share: 1 },
        { id: "resolucion.p4", label: "Resolución 4", share: 0.9 },
      ],
    };
    const speech = informeMensualSpeech(slides, "El bloqueo de Bitlocker ha subido.");

    expect(speech.startsWith("Buenas tardes, os comparto el informe mensual de Agosto.")).toBe(true);
    expect(speech).toContain("El bloqueo de Bitlocker ha subido.");
    expect(speech).toContain(
      "En incidencias On Site se han abierto 416 y resuelto 0, con un backlog de 47."
    );
    expect(speech).toContain("Las encuestas del mes son 121, con un promedio de 4,93.");
    expect(speech).toContain("En peticiones hay un backlog de 379, 762 liberadas y 712 gestionadas.");
    expect(speech).toContain("En IMACS se han gestionado 13 solicitudes con 28 trabajos.");
    expect(speech).toContain(
      "Los work orders suman 546, con más volumen en Recoletos (331) y Tablas I (178)."
    );
    expect(speech).toContain(
      "Smart Tech suma 808 citas, 269 con cita y 539 sin cita, con más volumen en Sede - Principal (669) y Sevilla (139)."
    );
    expect(speech).toContain(
      "El top de incidencias lo encabezan EQUIPO (178), APLICACIONES (129) y IMPRESORA (42)."
    );
    expect(speech).toContain("En SLA's, quedan por debajo del 95 % Resolución 4 (90 %).");
    expect(speech).not.toMatch(/Renove|renovado|WASP|media de los seis/);
    expect(speech.endsWith("Un saludo.")).toBe(true);
  });
});
