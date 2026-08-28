import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  convertInformaticaTemplateWorkbook,
  convertRawCitasCsv,
  convertRawWorkOrdersCsv,
  detectRawInformaticaFormat,
} from "./convertInformaticaRaw.ts";
import {
  mergeInformaticaDataset,
  mergeInformaticaWorkbooks,
  parseInformaticaPlanoWorkbook,
  selectInformaticaWorkbooksForMerge,
} from "./parseInformaticaPlano.ts";
import type { InformaticaDataset } from "../shared/modules/informatica/types.ts";

const citasHeader = ["Incidencia", "Walkup", "Cita_Previa", "Smart_Tech"];
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

function tsv(rows: unknown[][]): string {
  return rows.map((row) => row.join("\t")).join("\n");
}

function weeklyTemplate(): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      citasHeader,
      ["INC-1", "", "15/07/2026", "Madrid Recoletos"],
    ]),
    "Citas semanal"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      workOrdersHeader,
      [
        "SR-1",
        "15/07/2026",
        "WO-1",
        "SSCC",
        "Assigned",
        "",
        "",
        "Hardware",
        "Instalacion",
        "",
        "Madrid Recoletos",
        "",
        "",
        "",
        "",
      ],
    ]),
    "Work Orders semanal"
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
      ],
      ["INC-2", "2026-07-15", "2026-07-16", "Hardware", "Monitor"],
    ]),
    "Incidencias semanal"
  );

  return workbook;
}

function parseBatch(
  extra: { workbook: XLSX.WorkBook; origin: "citas" | "workorders" }
) {
  const template = convertInformaticaTemplateWorkbook(weeklyTemplate());
  const selected = selectInformaticaWorkbooksForMerge([
    { workbook: template, origin: "template" },
    extra,
  ]);

  return {
    selected,
    dataset: parseInformaticaPlanoWorkbook(mergeInformaticaWorkbooks(selected)).dataset,
  };
}

describe("Informatica import source overlap", () => {
  it("does not double Citas when the weekly template and its CSV are uploaded together", () => {
    const rawCsv = tsv([
      citasHeader,
      ["INC-1", "", "15/07/2026", "Madrid Recoletos"],
    ]);
    const csv = convertRawCitasCsv(rawCsv);

    expect(detectRawInformaticaFormat(weeklyTemplate())).toBe("template");
    expect(detectRawInformaticaFormat(rawCsv)).toBe("citas");
    const { selected, dataset } = parseBatch({ workbook: csv, origin: "citas" });

    expect(selected).toHaveLength(1);
    expect(dataset.citas).toHaveLength(1);
    expect(dataset.citas?.[0]?.citas).toBe(1);
  });

  it("does not double Work Orders when the weekly template and its CSV are uploaded together", () => {
    const rawCsv = tsv([
      workOrdersHeader,
      [
        "SR-1",
        "15/07/2026",
        "WO-1",
        "SSCC",
        "Assigned",
        "",
        "",
        "Hardware",
        "Instalacion",
        "",
        "Madrid Recoletos",
        "",
        "",
        "",
        "",
      ],
    ]);
    const csv = convertRawWorkOrdersCsv(rawCsv);

    expect(detectRawInformaticaFormat(weeklyTemplate())).toBe("template");
    expect(detectRawInformaticaFormat(rawCsv)).toBe("workorders");
    const { selected, dataset } = parseBatch({ workbook: csv, origin: "workorders" });

    expect(selected).toHaveLength(1);
    expect(dataset.workOrders).toHaveLength(1);
    expect(dataset.workOrders?.[0]?.ordenes).toBe(1);
  });

  it("keeps a CSV when a partial converted template does not carry its section", () => {
    const partialTemplate = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      partialTemplate,
      XLSX.utils.aoa_to_sheet([["Mes", "SVT", "Cumplido", "Incumplido", "Total"], ["2026/07", "S1", 9, 1, 10]]),
      "Slas"
    );
    const csv = convertRawCitasCsv(
      tsv([citasHeader, ["INC-1", "", "15/07/2026", "Madrid Recoletos"]])
    );

    const selected = selectInformaticaWorkbooksForMerge([
      { workbook: partialTemplate, origin: "template" },
      { workbook: csv, origin: "citas" },
    ]);

    expect(selected).toHaveLength(2);
    expect(
      parseInformaticaPlanoWorkbook(mergeInformaticaWorkbooks(selected)).dataset.citas?.[0]?.citas
    ).toBe(1);
  });
});

function peticion(semana: number, total: number) {
  return {
    fecha: null,
    semana,
    mes: "2026/08",
    origen: "On Site",
    estado: "En vuelo",
    entidad: "Peticiones",
    total,
  };
}

describe("mergeInformaticaDataset con secciones semanales", () => {
  const source = { sourceFile: "PLANO", uploadedAt: "2026-08-24T09:00:00.000Z" };

  it("una subida solo posee su propia semana en peticiones", () => {
    const stored: InformaticaDataset = { source, peticiones: [peticion(33, 700)] };
    const incoming: InformaticaDataset = { source, peticiones: [peticion(34, 714)] };

    const merged = mergeInformaticaDataset(stored, incoming, source);

    expect(merged.peticiones).toEqual([peticion(33, 700), peticion(34, 714)]);
  });

  it("reenviar la misma semana la reescribe en vez de duplicarla", () => {
    const stored: InformaticaDataset = { source, peticiones: [peticion(34, 700)] };
    const incoming: InformaticaDataset = { source, peticiones: [peticion(34, 714)] };

    expect(mergeInformaticaDataset(stored, incoming, source).peticiones).toEqual([
      peticion(34, 714),
    ]);
  });

  it("ordena las semanas por numero, no por texto", () => {
    const stored: InformaticaDataset = { source, peticiones: [peticion(9, 1), peticion(10, 2)] };
    const incoming: InformaticaDataset = { source, peticiones: [peticion(11, 3)] };

    expect(
      mergeInformaticaDataset(stored, incoming, source).peticiones?.map((row) => row.semana)
    ).toEqual([9, 10, 11]);
  });
});
