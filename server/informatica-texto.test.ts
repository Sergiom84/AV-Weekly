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
          fecha: null,
          semana: 34,
          mes: "2026/08",
          origen: "On Site",
          estado: "En vuelo",
          entidad: "Peticiones",
          total: 306,
        },
      ],
      encuestas: [{ fecha: null, mes: "2026/08", valoracion: "5", respuestas: 412 }],
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
      "2026/08\t5\t412",
      "",
      "[PETICIONES]",
      "2026/08\t34\tOn Site\tEn vuelo\tPeticiones\t306",
    ]);
  });

  it("omite las secciones sin filas", () => {
    const texto = serializeInformaticaTexto({ source }, {});

    expect(texto).toBe(INFORMATICA_TEXTO_HEADER);
  });
});
