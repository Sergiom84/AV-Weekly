import { describe, expect, it } from "vitest";
import {
  INFORMATICA_TEXTO_HEADER,
  serializeInformaticaTexto,
} from "../shared/modules/informatica/texto.ts";
import type { InformaticaDataset } from "../shared/modules/informatica/types.ts";
import { parseInformaticaTexto } from "./parseInformaticaTexto.ts";

const source = { sourceFile: "Backlog.xlsx", uploadedAt: "2026-08-24T09:00:00.000Z" };

describe("serializeInformaticaTexto", () => {
  it("escribe cabecera, metadatos y una seccion por concepto", () => {
    const dataset: InformaticaDataset = {
      source,
      peticiones: [
        {
          fecha: "2026-08-17",
          semana: 34,
          mes: "2026/08",
          origen: "On Site",
          estado: "En vuelo",
          entidad: "Peticiones",
          total: 306,
        },
      ],
      encuestas: [{ fecha: "2026-08-01", mes: "2026/08", valoracion: "5", respuestas: 412 }],
    };

    const texto = serializeInformaticaTexto(dataset, {
      week: "2026-08-24",
      generated: "2026-08-24T09:00:00.000Z",
      source: "Backlog.xlsx",
    });

    expect(texto.split("\n")).toEqual([
      INFORMATICA_TEXTO_HEADER,
      "semana\t2026-08-24",
      "generado\t2026-08-24T09:00:00.000Z",
      "origen\tBacklog.xlsx",
      "",
      "[ENCUESTAS]",
      "2026-08-01\t2026/08\t5\t412",
      "",
      "[PETICIONES]",
      "2026-08-17\t2026/08\t34\tOn Site\tEn vuelo\tPeticiones\t306",
    ]);
  });

  it("omite las secciones sin filas", () => {
    const texto = serializeInformaticaTexto({ source }, {});

    expect(texto).toBe(INFORMATICA_TEXTO_HEADER);
  });

  it("escribe la fecha en ISO desde texto, desde serial de Excel y vacia si no hay", () => {
    const dataset: InformaticaDataset = {
      source,
      citas: [
        {
          fecha: "2026-08-17",
          semana: 34,
          mes: "2026/08",
          edificio: "Sede - Principal",
          tipo: "Con Cita",
          citas: 96,
        },
        {
          fecha: 46251,
          semana: 34,
          mes: "2026/08",
          edificio: "Sede - Principal",
          tipo: "Sin Cita",
          citas: 12,
        },
        {
          fecha: null,
          semana: 34,
          mes: "2026/08",
          edificio: "Sede - Norte",
          tipo: "Con Cita",
          citas: 7,
        },
      ],
    };

    const filas = serializeInformaticaTexto(dataset, {}).split("\n").slice(3);

    expect(filas).toEqual([
      "2026-08-17\t2026/08\t34\tSede - Principal\tCon Cita\t96",
      "2026-08-17\t2026/08\t34\tSede - Principal\tSin Cita\t12",
      "\t2026/08\t34\tSede - Norte\tCon Cita\t7",
    ]);
  });
});

describe("parseInformaticaTexto", () => {
  it("rechaza un texto sin la cabecera del formato", () => {
    expect(() => parseInformaticaTexto("PEGADO CUALQUIERA\n")).toThrow(
      /INFORMATICA TEXTO PLANO v1/
    );
  });

  it("lee metadatos y filas, e ignora comentarios y lineas vacias", () => {
    const texto = [
      INFORMATICA_TEXTO_HEADER,
      "semana\t2026-08-24",
      "# esto es un comentario",
      "",
      "[PETICIONES]",
      "2026-08-17\t2026/08\t34\tOn Site\tEn vuelo\tPeticiones\t306",
      "",
      "[IMACS]",
      "2026-08-01\t2026/08\tMadrid SEDE\tSolicitudes\t218",
    ].join("\n");

    const { dataset, meta } = parseInformaticaTexto(texto);

    expect(meta.week).toBe("2026-08-24");
    expect(dataset.peticiones).toEqual([
      {
        fecha: "2026-08-17",
        semana: 34,
        mes: "2026/08",
        origen: "On Site",
        estado: "En vuelo",
        entidad: "Peticiones",
        total: 306,
      },
    ]);
    expect(dataset.imacs).toEqual([
      {
        fecha: "2026-08-01",
        mes: "2026/08",
        ciudad: "Madrid SEDE",
        metrica: "Solicitudes",
        total: 218,
      },
    ]);
    expect(dataset.sheetsFound).toEqual(["peticiones", "imacs"]);
  });

  it("descarta una fila con menos celdas de las que declara la seccion", () => {
    const texto = [
      INFORMATICA_TEXTO_HEADER,
      "[ENCUESTAS]",
      "2026-08-01\t2026/08\t5\t412",
      "2026-08-01\t2026/08\t4",
    ].join("\n");

    expect(parseInformaticaTexto(texto).dataset.encuestas).toHaveLength(1);
  });

  // `fecha` leads every section with a period, so reading `mes` out of the
  // first cell would shift every following field by one. The row below fails
  // that way and only that way: the cell count is right, the contents are not.
  it("coloca cada celda en su campo: la fecha no invade el mes", () => {
    const texto = [
      INFORMATICA_TEXTO_HEADER,
      "[PETICIONES]",
      "2026-08-17\t2026/08\t34\tOn Site\tEn vuelo\tPeticiones\t306",
    ].join("\n");

    const [fila] = parseInformaticaTexto(texto).dataset.peticiones ?? [];

    expect(fila?.fecha).toBe("2026-08-17");
    expect(fila?.mes).toBe("2026/08");
    expect(fila?.semana).toBe(34);
    expect(fila?.origen).toBe("On Site");
    expect(fila?.total).toBe(306);
  });

  // An empty date must come back as `null`, never as `""`: the round trip has
  // to be stable, and `InformaticaDateCell` declares the absence as `null`.
  it("lee como null la celda de fecha vacia, no como cadena vacia", () => {
    const texto = [
      INFORMATICA_TEXTO_HEADER,
      "[CITAS]",
      "\t2026/08\t34\tSede - Principal\tCon Cita\t96",
    ].join("\n");

    const [fila] = parseInformaticaTexto(texto).dataset.citas ?? [];

    expect(fila?.fecha).toBeNull();
    expect(fila).toEqual({
      fecha: null,
      semana: 34,
      mes: "2026/08",
      edificio: "Sede - Principal",
      tipo: "Con Cita",
      citas: 96,
    });
  });

  it("da la vuelta completa: serializar y volver a leer conserva las filas", () => {
    const dataset: InformaticaDataset = {
      source,
      citas: [
        {
          fecha: null,
          semana: 34,
          mes: "2026/08",
          edificio: "Sede - Principal",
          tipo: "Con Cita",
          citas: 96,
        },
        {
          fecha: "2026-08-17",
          semana: 34,
          mes: "2026/08",
          edificio: "Sede - Norte",
          tipo: "Sin Cita",
          citas: 12,
        },
      ],
      edificios: [
        {
          edificio: "Sede - Principal",
          dt: "DT Centro",
          aliasSmartTech: "Smart Tech Principal AN",
          aliasWorkOrder: "ED-M-SEDE - SEDE CENTRAL",
          aliasImacs: "Madrid SEDE",
          aliasPeticiones: "-CALLE DE EJEMPLO, 1,",
          visible: true,
          orden: 1,
        },
      ],
    };

    const round = parseInformaticaTexto(serializeInformaticaTexto(dataset, {})).dataset;

    expect(round.citas).toEqual(dataset.citas);
    expect(round.edificios).toEqual(dataset.edificios);
  });
});
