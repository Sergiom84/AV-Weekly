import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  BuildingLocationResolver,
  normalizeInformaticaBuildingLocations,
} from "./buildingLocationMaster.ts";
import { convertInformaticaTemplateWorkbook } from "./convertInformaticaRaw.ts";
import { parseInformaticaPlanoWorkbook } from "./parseInformaticaPlano.ts";

const workOrdersHeader = [
  "DWP_SRID",
  "Submit Date",
  "Work Order ID",
  "ASGRP",
  "Status",
  "Submitter",
  "ContactFullName",
  "Categorization Tier 1",
  "Categorization Tier 2",
  "Categorization Tier 3",
  "Site",
  "Site Group",
  "Chg Location Address",
  "Ubicacion_asociada",
  "Detailed Description",
];

function resolver(): BuildingLocationResolver {
  return new BuildingLocationResolver([
    { building: "MADRID-PASEO DE LA CASTELLANA, 81,", location: "Madrid" },
    { building: "BILBAO-GRAN VIA, 12,", location: "Bilbao" },
    { building: "MADRID-PASEO DE RECOLETOS, 10,", location: "Recoletos" },
    { building: "MADRID-PASEO DE RECOLETOS, 10", location: "Madrid" },
  ]);
}

describe("building location master", () => {
  it("matches exact labels and address formatting variants without fuzzy distance", () => {
    const buildings = resolver();

    expect(buildings.resolve("bilbao gran vía 12")).toBe("Bilbao");
    expect(buildings.resolve("CASTELLANA, 81")).toBe("Madrid");
    expect(buildings.resolve("CASTELLANA 81 - EDIFICIO 3")).toBe("Madrid");
    expect(buildings.resolve("CASTELLANA, 18")).toBeNull();
  });

  it("refuses a master key assigned to two different locations", () => {
    expect(resolver().resolve("Madrid - Paseo de Recoletos, 10")).toBeNull();
  });

  it("uses a proven WorkOrder address to normalise the same Site alias in Incidencias", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        workOrdersHeader,
        [
          "1598502",
          "27/07/2026",
          "WO0000000213510",
          "ON SITE SSCC",
          "Asignado",
          "",
          "",
          "PETICION",
          "DISPOSITIVOS",
          "BAJA DISPOSITIVO",
          "0182-0065 - ADMON.CENTRAL MADRID",
          "MADRID",
          "CASTELLANA, 81",
          "",
          "",
        ],
      ]),
      "Work Orders"
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        [
          "Numero_incidencia",
          "Abierta",
          "Resuelta",
          "Categorization Tier 1",
          "Categorization Tier 2",
          "Site",
          "Edificio",
        ],
        [
          "INC200001265112",
          "16/06/2026",
          "16/06/2026",
          "EQUIPO",
          "PORTATIL",
          "0182-0065 - ADMON.CENTRAL MADRID",
          "",
        ],
      ]),
      "Incidencias"
    );

    const flat = convertInformaticaTemplateWorkbook(workbook, resolver());
    const dataset = parseInformaticaPlanoWorkbook(flat).dataset;

    expect(dataset.workOrders?.map(row => row.edificio)).toEqual(["Madrid"]);
    expect(new Set(dataset.incidencias?.map(row => row.edificio))).toEqual(
      new Set(["Madrid"])
    );
  });

  it("keeps an unknown flat value and reports it instead of guessing", () => {
    const dataset = {
      incidencias: [
        {
          fecha: "2026-07-01",
          semana: 27,
          mes: "2026/07",
          categoria: "EQUIPO",
          subcategoria: "PORTATIL",
          metrica: "Asignadas",
          edificio: "Edificio inventado sin dirección",
          tickets: 2,
        },
      ],
      source: { sourceFile: null, uploadedAt: null },
    };

    const normalized = normalizeInformaticaBuildingLocations(
      dataset,
      resolver()
    );

    expect(normalized.dataset.incidencias?.[0]?.edificio).toBe(
      "Edificio inventado sin dirección"
    );
    expect(normalized.report).toMatchObject({
      matchedRows: 0,
      unchangedRows: 1,
      unknown: [{ building: "Edificio inventado sin dirección", rows: 1 }],
    });
  });

  it("reuses a persisted alias in a later flat batch and backfills stored rows", () => {
    const firstBatch = resolver();
    expect(
      firstBatch.observe("0182-0065 - ADMON.CENTRAL MADRID", "CASTELLANA, 81")
    ).toBe("Madrid");

    const secondBatch = new BuildingLocationResolver(
      [{ building: "MADRID-PASEO DE LA CASTELLANA, 81,", location: "Madrid" }],
      firstBatch.learnedAliases()
    );
    const stored = {
      workOrders: [
        {
          fecha: "2026-06-16",
          semana: 25,
          mes: "2026/06",
          edificio: "0182-0065 - ADMON.CENTRAL MADRID",
          tipo: "PORTATIL",
          ordenes: 1,
        },
      ],
      source: {
        sourceFile: "anterior.xlsx",
        uploadedAt: "2026-06-17T00:00:00Z",
      },
    };

    const normalized = normalizeInformaticaBuildingLocations(
      stored,
      secondBatch
    );

    expect(normalized.dataset.workOrders?.[0]?.edificio).toBe("Madrid");
    expect(normalized.report).toMatchObject({
      matchedRows: 1,
      unchangedRows: 0,
    });
  });
});
