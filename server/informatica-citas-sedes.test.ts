import { describe, expect, it } from "vitest";
import {
  reportedSmartTechRows,
  siteLabels,
  smartTechSite,
} from "../client/src/modules/informatica/sources.ts";
import type {
  InformaticaCitaRow,
  InformaticaEdificioRow,
} from "../shared/modules/informatica/types.ts";

/**
 * SmartTech points of the citas slides, over the shape the extract really has.
 *
 * The three sites here are the ones the owner asked to correct: two the report
 * does not publish and never reached the master, and one the extract still
 * names by its previous name.
 */

function cita(edificio: string, mes: string, citas: number): InformaticaCitaRow {
  return {
    fecha: `${mes.replace("/", "-")}-15`,
    mes,
    semana: 1,
    edificio,
    tipo: "Con Cita",
    citas,
  };
}

function edificio(
  nombre: string,
  aliasSmartTech: string,
  orden: number
): InformaticaEdificioRow {
  return {
    edificio: nombre,
    dt: "DT Centro",
    aliasSmartTech,
    aliasWorkOrder: "",
    aliasImacs: "",
    aliasPeticiones: "",
    visible: true,
    orden,
  };
}

const MASTER: InformaticaEdificioRow[] = [
  edificio("Seguros", "Smart Tech Seguros Tablas I", 80),
  edificio("Tablas I", "Smart Tech Tablas I", 93),
];

describe("sedes SmartTech publicadas", () => {
  it("descarta Anillo y OPPLUS, que no están en el maestro", () => {
    const rows = [
      cita("Smart Tech Anillo Planta 2 AN", "2026/01", 1),
      cita("Smart Tech OPPLUS Málaga", "2026/07", 20),
      cita("Smart Tech Opplus Malaga", "2026/08", 12),
      cita("Smart Tech Tablas I", "2026/08", 92),
    ];

    expect(reportedSmartTechRows(rows).map(row => row.edificio)).toEqual([
      "Smart Tech Tablas I",
    ]);
  });

  it("lleva Zelandia al alias de Seguros y suma los meses que se solapan", () => {
    const rows = reportedSmartTechRows([
      cita("Smart Tech Zelandia", "2025/11", 44),
      cita("Smart Tech Seguros Tablas I", "2025/11", 3),
      cita("Smart Tech Zelandia", "2026/01", 61),
    ]);
    const { labelOf } = siteLabels(
      MASTER,
      row => row.aliasSmartTech,
      rows.map(row => row.edificio),
      { clean: smartTechSite }
    );

    expect(rows.map(row => labelOf(row.edificio))).toEqual([
      "Seguros",
      "Seguros",
      "Seguros",
    ]);
  });

  it("no toca las sedes que el maestro sí nombra", () => {
    const rows = [cita("Smart Tech Seguros Tablas I", "2026/08", 27)];

    expect(reportedSmartTechRows(rows)).toEqual(rows);
  });
});
