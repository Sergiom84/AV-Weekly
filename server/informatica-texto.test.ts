import { describe, expect, it } from "vitest";
import {
  INFORMATICA_TEXTO_HEADER,
  serializeInformaticaTexto,
} from "../shared/modules/informatica/texto.ts";
import type { InformaticaDataset } from "../shared/modules/informatica/types.ts";

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
