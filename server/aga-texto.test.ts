import { describe, expect, it } from "vitest";
import { mergeAgaAnnualSection, parseAgaTexto, projectAgaDatasetToWeek } from "./parseAgaTexto.ts";
import { serializeAgaTexto } from "../shared/modules/aga/texto.ts";
import type { AgaDataset } from "../shared/modules/aga/types.ts";

const SAMPLE = [
  "AGA TEXTO PLANO v1",
  "semana\t2026-08-17",
  "generado\t2026-08-24T08:00:00.000Z",
  "origen\t33 semana GPS.xlsx; Gestionado.xlsx; Office.xlsx",
  "",
  "# comentario del script",
  "[SEMANAS]",
  "2026-08-10\t806",
  "2026-08-17\t846",
  "",
  "[SEMANAS DEPARTAMENTO]",
  "2026-08-10\tGAM\t52",
  "2026-08-17\tGAM\t45",
  "2026-08-17\tSoporte Técnico\t705",
  "",
  "[SEMANAS PROYECTO]",
  "2026-08-17\tNuevas incorporaciones\t71",
  "2026-08-17\tRenove Holding\t67",
  "",
  "[GESTIONADAS]",
  "2026-08-17\t300",
  "",
  "[GESTIONADAS DEPARTAMENTO]",
  "2026-08-17\tAdministración de Red Local\t94",
  "2026-08-17\tGsam\t53",
  "",
  "[GESTIONADAS UBICACION]",
  "2026-08-17\tSede\t175",
  "2026-08-17\tTablas I\t37",
  "",
  "[GESTIONADAS UBICACION TOTAL]",
  "2026-08-17\t296",
  "",
  "[GESTIONADAS DEPARTAMENTO PRODUCTO]",
  "2026-08-17\tGAM\tPORTATIL\t6",
  "2026-08-17\tGAM\tPORTÁTIL WASP BBVA ESPAÑA CORPORATE SECURITY\t10",
  "",
  "[OFFICE]",
  "2026-07\tMICROSOFT OFFICE STANDARD\t40",
  "2026-08\tMICROSOFT OFFICE STANDARD\t30",
  "2026-08\tMICROSOFT OFFICE 365\t44",
  "",
  "[ANUAL PETICIONES]",
  "2026\t1\t1247",
  "2026\t7\t1361",
  "",
  "[ANUAL POSICIONES]",
  "2026\t1\t1639",
  "",
].join("\n");

describe("parseAgaTexto", () => {
  it("reads a Drive paste with quoted TSV cells", () => {
    const fromDrive = SAMPLE.split("\n")
      .map(line =>
        line.includes("\t") ? `"${line.replace(/"/g, '""')}"` : line
      )
      .join("\n");

    expect(parseAgaTexto(fromDrive).report.meta).toEqual(
      parseAgaTexto(SAMPLE).report.meta
    );
    expect(parseAgaTexto(fromDrive).weeks[1]?.total).toBe(846);
  });

  it("reads the preamble metadata", () => {
    const { report } = parseAgaTexto(SAMPLE);

    expect(report.meta).toEqual({
      week: "2026-08-17",
      generated: "2026-08-24T08:00:00.000Z",
      source: "33 semana GPS.xlsx; Gestionado.xlsx; Office.xlsx",
    });
  });

  it("builds one aggregate per week, with the AGA reporting week", () => {
    const { weeks } = parseAgaTexto(SAMPLE);

    expect(weeks.map((week) => week.week)).toEqual(["2026-08-10", "2026-08-17"]);
    // The 2026-08-17 extraction reports the completed period before it: week 33.
    expect(weeks[1].reportWeek).toBe(33);
    expect(weeks[1].total).toBe(846);
    expect(weeks[1].byDepartment).toEqual([
      { label: "Soporte Técnico", count: 705 },
      { label: "GAM", count: 45 },
    ]);
    expect(weeks[1].byProject).toEqual([
      { label: "Nuevas incorporaciones", count: 71 },
      { label: "Renove Holding", count: 67 },
    ]);
  });

  it("falls back to the raw departments when the section is absent", () => {
    const { weeks } = parseAgaTexto(SAMPLE);

    expect(weeks[1].byDepartmentRaw).toEqual(weeks[1].byDepartment);
  });

  it("keeps the declared located total apart from the charted locations", () => {
    const { managed } = parseAgaTexto(SAMPLE);

    expect(managed?.weeklyTotals).toEqual([{ week: "2026-08-17", total: 300 }]);
    expect(managed?.locationTotals).toEqual([{ week: "2026-08-17", total: 296 }]);
    expect(managed?.byLocation.map((row) => row.label)).toEqual(["Sede", "Tablas I"]);
  });

  it("orders each breakdown by the latest week", () => {
    const { managed } = parseAgaTexto(SAMPLE);
    const gam = managed?.byDepartmentProduct.find((entry) => entry.department === "GAM");

    expect(gam?.rows.map((row) => row.label)).toEqual([
      "PORTÁTIL WASP BBVA ESPAÑA CORPORATE SECURITY",
      "PORTATIL",
    ]);
  });

  it("leaves a gap, not a zero, for an Office month a family was not reported on", () => {
    const { office } = parseAgaTexto(SAMPLE);

    expect(office?.months).toEqual(["2026-07", "2026-08"]);
    expect(office?.families.find((family) => family.label === "MICROSOFT OFFICE 365")?.values).toEqual([
      null,
      44,
    ]);
  });

  it("pads an annual series to twelve months", () => {
    const { annual } = parseAgaTexto(SAMPLE);

    expect(annual?.peticiones).toEqual([
      { year: 2026, values: [1247, null, null, null, null, null, 1361, null, null, null, null, null] },
    ]);
  });

  it("adds up repeated label rows instead of overwriting them", () => {
    const { weeks } = parseAgaTexto(
      ["AGA TEXTO PLANO v1", "[SEMANAS DEPARTAMENTO]", "2026-08-17\tGAM\t5", "2026-08-17\tGAM\t3"].join(
        "\n"
      )
    );

    expect(weeks[0].byDepartment).toEqual([{ label: "GAM", count: 8 }]);
    // No `[SEMANAS]` row, so the total comes from the departments.
    expect(weeks[0].total).toBe(8);
  });

  it("accepts a locale-formatted thousands separator", () => {
    const { managed } = parseAgaTexto(
      ["AGA TEXTO PLANO v1", "[GESTIONADAS]", "2026-08-17\t1.480"].join("\n")
    );

    expect(managed?.weeklyTotals).toEqual([{ week: "2026-08-17", total: 1480 }]);
  });

  it("folds a split Gestionado block onto the extraction Monday", () => {
    const { managed } = parseAgaTexto(
      [
        "AGA TEXTO PLANO v1",
        "semana\t2026-09-14",
        "[GESTIONADAS]",
        "2026-07-13\t132",
        "2026-08-10\t180",
        "2026-09-14\t110",
        "2026-10-12\t227",
        "2026-11-16\t109",
        "[GESTIONADAS PRODUCTO]",
        "2026-09-14\tRATON INALAMBRICO\t14",
        "2026-08-10\tRATON INALAMBRICO\t30",
        "2026-10-12\tRATON INALAMBRICO\t36",
      ].join("\n")
    );

    expect(managed?.weeklyTotals).toEqual([{ week: "2026-09-14", total: 758 }]);
    expect(
      managed?.byProduct.find((row) => row.label === "RATON INALAMBRICO")?.counts
    ).toEqual([{ week: "2026-09-14", count: 80 }]);
  });

  it("rejects a text without the version header", () => {
    expect(() => parseAgaTexto("[SEMANAS]\n2026-08-17\t846")).toThrow(/AGA TEXTO PLANO v1/);
  });

  it("rejects an unknown section instead of ignoring it", () => {
    expect(() =>
      parseAgaTexto(["AGA TEXTO PLANO v1", "[GESTIONADAS POR LUNA]", "2026-08-17\t1"].join("\n"))
    ).toThrow(/desconocida/);
  });

  it("rejects a malformed row and names its line", () => {
    expect(() =>
      parseAgaTexto(["AGA TEXTO PLANO v1", "[SEMANAS]", "semana 33\t846"].join("\n"))
    ).toThrow(/Línea 3/);
  });

  it("rejects a decimal count", () => {
    expect(() =>
      parseAgaTexto(["AGA TEXTO PLANO v1", "[SEMANAS]", "2026-08-17\t846,5"].join("\n"))
    ).toThrow(/no es un número entero/);
  });

  it("rejects a text with no sections at all", () => {
    expect(() => parseAgaTexto("AGA TEXTO PLANO v1\nsemana\t2026-08-17")).toThrow(
      /ninguna sección/
    );
  });
});

describe("serializeAgaTexto", () => {
  it("round-trips a dataset through the text format", () => {
    const parsed = parseAgaTexto(SAMPLE);
    const dataset: AgaDataset = {
      weeks: parsed.weeks,
      managed: parsed.managed ?? undefined,
      office: parsed.office ?? undefined,
      annual: parsed.annual ?? undefined,
      source: { sourceFile: "test", uploadedAt: "2026-08-24T08:00:00.000Z" },
    };

    const again = parseAgaTexto(serializeAgaTexto(dataset));

    expect(again.weeks).toEqual(parsed.weeks);
    expect(again.managed).toEqual(parsed.managed);
    expect(again.office).toEqual(parsed.office);
    expect(again.annual).toEqual(parsed.annual);
  });
});

describe("mergeAgaAnnualSection", () => {
  it("fills months one by one instead of replacing the year", () => {
    const merged = mergeAgaAnnualSection(
      {
        peticiones: [{ year: 2026, values: [10, 20, 30, ...Array(9).fill(null)] }],
        posiciones: [],
      },
      {
        peticiones: [{ year: 2026, values: [null, null, 99, 40, ...Array(8).fill(null)] }],
        posiciones: [{ year: 2025, values: Array(12).fill(1) }],
      }
    );

    expect(merged.peticiones[0].values.slice(0, 4)).toEqual([10, 20, 99, 40]);
    expect(merged.posiciones).toHaveLength(1);
  });
});

describe("projectAgaDatasetToWeek", () => {
  it("slices weeks, managed, office and annual sections to activeWeek without mutating storage", () => {
    const dataset: AgaDataset = {
      activeWeek: "2026-08-17",
      weeks: [
        {
          week: "2026-08-10",
          reportWeek: 32,
          total: 800,
          byDepartment: [{ label: "GAM", count: 50 }],
          byDepartmentRaw: [{ label: "GAM", count: 50 }],
          byProject: [{ label: "A", count: 10 }],
        },
        {
          week: "2026-08-17",
          reportWeek: 33,
          total: 846,
          byDepartment: [{ label: "GAM", count: 45 }],
          byDepartmentRaw: [{ label: "GAM", count: 45 }],
          byProject: [{ label: "A", count: 12 }],
        },
        {
          week: "2026-09-07",
          reportWeek: 36,
          total: 900,
          byDepartment: [{ label: "GAM", count: 60 }],
          byDepartmentRaw: [{ label: "GAM", count: 60 }],
          byProject: [{ label: "A", count: 15 }],
        },
      ],
      managed: {
        weeklyTotals: [
          { week: "2026-08-17", total: 300 },
          { week: "2026-09-07", total: 350 },
        ],
        locationTotals: [
          { week: "2026-08-17", total: 296 },
          { week: "2026-09-07", total: 340 },
        ],
        byDepartment: [
          {
            label: "GAM",
            counts: [
              { week: "2026-08-17", count: 50 },
              { week: "2026-09-07", count: 70 },
            ],
          },
          {
            label: "SoloSeptiembre",
            counts: [{ week: "2026-09-07", count: 10 }],
          },
        ],
        byProduct: [
          {
            label: "PORTATIL",
            counts: [
              { week: "2026-08-17", count: 20 },
              { week: "2026-09-07", count: 25 },
            ],
          },
        ],
        byLocation: [
          {
            label: "Sede",
            counts: [
              { week: "2026-08-17", count: 175 },
              { week: "2026-09-07", count: 200 },
            ],
          },
        ],
        byDepartmentProduct: [
          {
            department: "GAM",
            rows: [
              {
                label: "PORTATIL",
                counts: [
                  { week: "2026-08-17", count: 6 },
                  { week: "2026-09-07", count: 9 },
                ],
              },
            ],
          },
        ],
      },
      office: {
        months: ["2026-07", "2026-08", "2026-09"],
        families: [{ label: "OFFICE 365", values: [30, 44, 55] }],
      },
      annual: {
        peticiones: [
          { year: 2025, values: Array(12).fill(100) },
          { year: 2026, values: [10, 20, 30, 40, 50, 60, 70, 80, 90, null, null, null] },
          { year: 2027, values: [5, ...Array(11).fill(null)] },
        ],
        posiciones: [
          { year: 2026, values: [11, 21, 31, 41, 51, 61, 71, 81, 91, null, null, null] },
        ],
      },
      source: { sourceFile: "test.txt", uploadedAt: "2026-08-24T08:00:00.000Z" },
    };

    const projected = projectAgaDatasetToWeek(dataset);

    expect(projected.weeks.map((w) => w.week)).toEqual(["2026-08-10", "2026-08-17"]);
    expect(projected.managed?.weeklyTotals).toEqual([{ week: "2026-08-17", total: 300 }]);
    expect(projected.managed?.locationTotals).toEqual([{ week: "2026-08-17", total: 296 }]);
    expect(projected.managed?.byDepartment).toEqual([
      { label: "GAM", counts: [{ week: "2026-08-17", count: 50 }] },
    ]);
    expect(projected.managed?.byDepartmentProduct[0].rows[0].counts).toEqual([
      { week: "2026-08-17", count: 6 },
    ]);
    expect(projected.office).toEqual({
      months: ["2026-07", "2026-08"],
      families: [{ label: "OFFICE 365", values: [30, 44] }],
    });
    expect(projected.annual?.peticiones).toEqual([
      { year: 2025, values: Array(12).fill(100) },
      { year: 2026, values: [10, 20, 30, 40, 50, 60, 70, 80, null, null, null, null] },
    ]);
    expect(projected.annual?.posiciones).toEqual([
      { year: 2026, values: [11, 21, 31, 41, 51, 61, 71, 81, null, null, null, null] },
    ]);
  });
});
