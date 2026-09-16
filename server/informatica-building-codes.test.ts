import { describe, expect, it } from "vitest";
import {
  catalogFromEdificios,
  edificioCode,
  expandEdificioCode,
  isEdificioCode,
  resolveInformaticaBuildingCodes,
  unresolvedEdificioCodes,
} from "../shared/modules/informatica/buildingCodes.ts";
import {
  mergeEdificioCatalog,
  parseEdificioCatalogTsv,
} from "./informaticaEdificios.ts";
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
    expect(unresolvedEdificioCodes(expanded)).toEqual([]);
  });
});

describe("unresolvedEdificioCodes", () => {
  const coded = (edificio: string): InformaticaDataset => ({
    source: { sourceFile: "PLANO", uploadedAt: null },
    citas: [
      {
        fecha: "2026-09-11",
        semana: 37,
        mes: "2026/09",
        edificio,
        tipo: "Con Cita",
        citas: 2,
      },
    ],
  });

  it("reports the codes an empty catalog leaves behind", () => {
    const dataset = coded(edificioCode("Smart Tech Antoni Maura"));

    // The early return of resolveInformaticaBuildingCodes on an empty catalog
    // is exactly the case that shipped hashes to the printed deck.
    expect(resolveInformaticaBuildingCodes(dataset, [])).toBe(dataset);
    expect(unresolvedEdificioCodes(dataset)).toEqual([
      edificioCode("Smart Tech Antoni Maura"),
    ]);
  });

  it("ignores buildings that are already names", () => {
    expect(unresolvedEdificioCodes(coded("Smart Tech Antoni Maura"))).toEqual([]);
    expect(unresolvedEdificioCodes(coded(""))).toEqual([]);
  });
});

describe("catálogo de edificios", () => {
  const otro = {
    edificio: "Recoletos",
    dt: "DT Madrid",
    aliasSmartTech: "Smart Tech Recoletos",
    aliasWorkOrder: "",
    aliasImacs: "",
    aliasPeticiones: "",
    visible: true,
    orden: 2,
  };

  it("crece en vez de reemplazar", () => {
    const merged = mergeEdificioCatalog(edificios, [otro]);

    expect(merged).toHaveLength(2);
    expect(merged.map(row => row.edificio)).toEqual(["A. Maura", "Recoletos"]);
    // The point of the table: a building dropped from this week's export still
    // names the rows of every earlier week.
    expect(mergeEdificioCatalog(merged, [otro])).toHaveLength(2);
  });

  it("refresca visibilidad y orden de una fila conocida", () => {
    const merged = mergeEdificioCatalog(edificios, [
      { ...edificios[0], visible: false, orden: 9 },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].visible).toBe(false);
    expect(merged[0].orden).toBe(9);
  });

  it("lee el asset semilla y descarta comentarios", () => {
    const rows = parseEdificioCatalogTsv(
      [
        "# comentario",
        "",
        "A. Maura\tDT Cataluña\t\t\t\t-PL ANTONIO MAURA, 6,\tSi\t1",
        "Recoletos\tDT Madrid\tSmart Tech Recoletos\t\t\t\tNo\t2",
      ].join("\n")
    );

    expect(rows).toHaveLength(2);
    expect(rows[0].aliasPeticiones).toBe("-PL ANTONIO MAURA, 6,");
    expect(rows[0].visible).toBe(true);
    expect(rows[1].visible).toBe(false);
    expect(rows[1].orden).toBe(2);
  });

  it("no acepta una fila con otro número de celdas", () => {
    expect(() => parseEdificioCatalogTsv("A. Maura\tDT Cataluña\tSi")).toThrow(
      /Filas invalidas/
    );
  });
});
