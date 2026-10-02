import { describe, expect, it } from "vitest";
import {
  buildInformeMensual,
  closedMonth,
  informeMensualSpeech,
  mesCerrado,
  reportedMonth,
  type MensualComparativa,
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
    source.incidenciasOnsite!.push(
      { mes: "2026/08", metrica: "Abiertas", total: 416 },
      { mes: "2026/08", metrica: "Resueltas", total: 413 }
    );
    const agosto = mesCerrado(source);

    expect(agosto.month).toBe("2026/08");
    // Resuelto plus Cerrado; it need not match Abiertas.
    expect(agosto.incidencias).toEqual({ resueltas: 413, abiertas: 416, backlog: 47 });
    expect(agosto.encuestas.numero).toBe(10);
    expect(agosto.encuestas.promedio).toBeCloseTo(4.9);
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

  it("expone el mes como en una reunión: qué cambia, dónde y por qué", () => {
    const slides: MensualSlides = {
      month: "2026/08",
      incidencias: { resueltas: 413, abiertas: 416, backlog: 47 },
      encuestas: { numero: 121, promedio: 4.93 },
      peticiones: [
        { origen: "On Site", backlog: 359, liberadas: 739, gestionadas: 680 },
        { origen: "Technology", backlog: 20, liberadas: 23, gestionadas: 32 },
      ],
      imacs: { solicitudes: 13, trabajos: 28 },
      workOrders: [
        { site: "Recoletos", total: 331 },
        { site: "Sevilla", total: 23 },
        { site: "Canarias", total: 44 },
      ],
      smartTech: [
        { site: "Sede - Principal", conCita: 183, sinCita: 486 },
        { site: "Bilbao", conCita: 3, sinCita: 92 },
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
    const comparativa: MensualComparativa = {
      previousMonth: "2026/07",
      incidencias: { anterior: 758, media: 794 },
      topTenAnterior: [
        { categoria: "EQUIPO", total: 397 },
        { categoria: "APLICACIONES", total: 111 },
        { categoria: "IMPRESORA", total: 106 },
        { categoria: "WEBEX", total: 2 },
      ],
      workOrders: [
        {
          site: "Recoletos",
          total: 331,
          anterior: 330,
          media: 320,
          desglose: [{ nombre: "otros", total: 67, anterior: 60 }],
        },
        {
          site: "Sevilla",
          total: 23,
          anterior: 7,
          media: 9,
          desglose: [
            { nombre: "consulta usuarios", total: 18, anterior: 2 },
            { nombre: "otros", total: 5, anterior: 5 },
          ],
        },
        {
          site: "Canarias",
          total: 44,
          anterior: 149,
          media: 120,
          desglose: [{ nombre: "revisión equipamiento", total: 4, anterior: 39 }],
        },
      ],
      workOrdersAnterior: 486,
      smartTech: [
        {
          site: "Sede - Principal",
          total: 669,
          anterior: 1342,
          media: 1200,
          desglose: [
            { nombre: "las citas con cita previa", total: 183, anterior: 550 },
            { nombre: "las visitas sin cita", total: 486, anterior: 792 },
          ],
        },
        {
          site: "Bilbao",
          total: 95,
          anterior: 158,
          media: 60,
          desglose: [],
        },
      ],
      smartTechAnterior: 1500,
    };
    const speech = informeMensualSpeech(slides, comparativa, "El bloqueo de Bitlocker ha subido.");

    expect(speech.startsWith("Buenas tardes, os comparto el informe mensual de agosto.")).toBe(true);
    expect(speech).toContain("El bloqueo de Bitlocker ha subido.");
    expect(speech).toContain(
      "En incidencias On Site se han abierto 416 y resuelto 413, con un backlog de 47. Son 342 menos que en julio (758, -45 %) y quedan por debajo de la media de los seis meses anteriores (794)."
    );
    expect(speech).toContain("El descenso viene sobre todo de EQUIPO, que pasa de 397 a 178.");
    expect(speech).toContain("Por categorías, lideran EQUIPO (178), APLICACIONES (129) y IMPRESORA (42).");
    expect(speech).toContain(
      "Donde más crecen es en Sevilla, de 7 a 23, sobre todo por consulta usuarios (+16)."
    );
    expect(speech).toContain(
      "La mayor bajada es en Canarias, de 149 a 44, sobre todo por revisión equipamiento (-35)."
    );
    expect(speech).toContain("Smart Tech suma 764 citas, 186 con cita y 578 sin cita, 736 menos que en julio (1.500, -49 %).");
    expect(speech).toContain(
      "Sede - Principal concentra el mayor volumen, con 669 citas. Es también donde más baja, de 1.342 a 669, sobre todo por las citas con cita previa (-367)."
    );
    expect(speech).toContain("En peticiones hay un backlog de 379, 762 liberadas y 712 gestionadas.");
    expect(speech).toContain("En SLA's, quedan por debajo del 95 % Resolución 4 (90 %).");
    expect(speech.endsWith("Un saludo.")).toBe(true);
  });

  it("no compara cuando falta el mes anterior", () => {
    const slides: MensualSlides = {
      month: "2026/08",
      incidencias: { resueltas: 413, abiertas: 416, backlog: null },
      encuestas: { numero: null, promedio: null },
      peticiones: [],
      imacs: null,
      workOrders: [{ site: "Recoletos", total: 12 }],
      smartTech: [],
      topTen: null,
      slas: [],
    };
    const speech = informeMensualSpeech(
      slides,
      {
        previousMonth: "2026/07",
        incidencias: { anterior: null, media: null },
        topTenAnterior: null,
        workOrders: [{ site: "Recoletos", total: 12, anterior: 0, media: null, desglose: [] }],
        workOrdersAnterior: null,
        smartTech: [],
        smartTechAnterior: null,
      },
      ""
    );

    expect(speech).toContain("En incidencias On Site se han abierto 416 y resuelto 413.");
    expect(speech).toContain("Los work orders suman 12. Recoletos concentra el mayor volumen");
    expect(speech).not.toMatch(/julio|Donde más crecen|bajada/);
  });
});
