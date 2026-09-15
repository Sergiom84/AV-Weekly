import { describe, expect, it } from "vitest";
import {
  catalogFromEdificios,
  edificioCode,
  expandEdificioCode,
  isEdificioCode,
  resolveInformaticaBuildingCodes,
} from "../shared/modules/informatica/buildingCodes.ts";
import type { InformaticaDataset } from "../shared/modules/informatica/types.ts";

const edificios = [
  {
    edificio: "A. Maura",
    dt: "DT Cataluña",
    aliasSmartTech: "Smart Tech Antoni Maura",
    aliasWorkOrder: "Barcelona Antoni Maura",
    aliasImacs: "-PL ANTONIO MAURA, 6,",
    aliasPeticiones: "",
    visible: true,
    orden: 1,
  },
];

describe("edificioCode", () => {
  it("is stable and never looks like an address", () => {
    const code = edificioCode("-PL ANTONIO MAURA, 6,");

    expect(isEdificioCode(code)).toBe(true);
    expect(code).not.toMatch(/ANTONIO|MAURA|PLAZA|CALLE/i);
    expect(edificioCode("-PL ANTONIO MAURA, 6,")).toBe(code);
    expect(edificioCode("A. Maura")).not.toBe(code);
    expect(edificioCode("")).toBe("");
  });

  it("restores the catalog label that produced the code", () => {
    const catalog = catalogFromEdificios(edificios);
    const coded = edificioCode("-PL ANTONIO MAURA, 6,");

    expect(expandEdificioCode(coded, catalog)).toBe("-PL ANTONIO MAURA, 6,");
    expect(expandEdificioCode("A. Maura", catalog)).toBe("A. Maura");
  });

  it("expands coded rows of an imported dataset", () => {
    const dataset: InformaticaDataset = {
      source: { sourceFile: "PLANO", uploadedAt: null },
      workOrders: [
        {
          fecha: "2026-09-11",
          semana: 37,
          mes: "2026/09",
          edificio: edificioCode("Barcelona Antoni Maura"),
          tipo: "TRASLADO",
          ordenes: 1,
        },
      ],
      citas: [
        {
          fecha: "2026-09-11",
          semana: 37,
          mes: "2026/09",
          edificio: edificioCode("Smart Tech Antoni Maura"),
          tipo: "Con Cita",
          citas: 2,
        },
      ],
      imacs: [
        {
          fecha: "2026-09-01",
          mes: "2026/09",
          ciudad: edificioCode("-PL ANTONIO MAURA, 6,"),
          metrica: "Solicitudes",
          total: 3,
        },
      ],
    };

    const expanded = resolveInformaticaBuildingCodes(
      dataset,
      catalogFromEdificios(edificios)
    );

    expect(expanded.workOrders?.[0]?.edificio).toBe("Barcelona Antoni Maura");
    expect(expanded.citas?.[0]?.edificio).toBe("Smart Tech Antoni Maura");
    expect(expanded.imacs?.[0]?.ciudad).toBe("-PL ANTONIO MAURA, 6,");
  });
});
