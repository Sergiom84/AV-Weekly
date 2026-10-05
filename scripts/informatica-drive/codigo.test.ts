import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { edificioCode } from "../../shared/modules/informatica/buildingCodes.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

function loadCodigo() {
  const source = readFileSync(join(HERE, "Codigo.gs"), "utf8");
  const context = createContext({
    console,
    Date,
    MimeType: {
      MICROSOFT_EXCEL: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      PLAIN_TEXT: "text/plain",
    },
    SpreadsheetApp: {
      getActiveSpreadsheet() {
        return { getSheetByName() { return null; }, getId() { return ""; } };
      },
      getUi() {
        return { alert() {}, ButtonSet: { OK: "OK" } };
      },
    },
  });

  runInContext(source, context, { filename: "Codigo.gs" });

  return context as {
    esAliasEdificioBasura: (name: string) => boolean;
    debeRodarSemanaAnterior: (extraction: Date, lastProcessed: Date | null) => boolean;
    extraccionYaProcesada: (
      extraction: Date | null,
      lastProcessed: Date | null
    ) => boolean;
    fechaCorta: (date: Date) => string;
    totalesComprobacion: (
      agregado: Record<string, unknown[][]>,
      extraction: Date
    ) => { citas: number; vuelo: number };
    monthBounds: (extraction: Date) => { first: Date };
    mesSiguiente: (month: Date) => Date;
    toDate: (value: unknown) => Date | null;
    yearFromCell: (value: unknown) => number;
    fechaOperativa: (date: Date | null) => boolean;
    renoveKind: (fileName: string) => string | null;
    renoveSheets: (
      grids: { name: string; grid: unknown[][] }[],
      ambito: string
    ) => { name: string }[];
    agregarRenove: (
      found: Record<string, unknown>,
      buckets: Record<string, number>
    ) => void;
    rows: (buckets: Record<string, number>) => unknown[][];
    edificioCode: (name: string) => string;
    serializarPlano: (
      agregado: Record<string, unknown[][]>,
      meta: Record<string, string>
    ) => string;
    requestKind: (fileName: string) => string | null;
    fusionarPeticionesMes: (guardadas: unknown[][], nuevas: unknown[][]) => unknown[][];
    mesGuardado: (value: unknown) => string;
    PETICIONES_ANUAL_SEMILLA: { anio: number; mes: number; peticiones: number }[];
    aniosConsecutivos: (
      headersFromM: unknown[]
    ) => { year: number; column: number }[];
    columnaParaAnio: (
      years: { year: number; column: number }[],
      year: number,
      nextCellRaw: unknown
    ) => number;
    filaMesPeticiones: (labels: unknown[][], monthNumber: number) => number;
    contarPeticionesAcumuladas: (found: {
      acumuladas?: { sheets: { headerRow: number; grid: unknown[][] }[] };
    }) => { counts: Record<string, number>; filas: number; sinFecha: number };
    totalesPeticionesAnual: (found: {
      acumuladas?: { sheets: { headerRow: number; grid: unknown[][] }[] };
    }) => Record<string, number>;
    escribirPeticionesAnual: (
      found: Record<string, unknown>,
      informe: Record<string, unknown>
    ) => void;
    citaDate: (value: unknown) => Date | null;
    numeroMesEspanol: (value: unknown) => number;
    contarCitasMensuales: (
      found: {
        citas?: { sheets: { headerRow: number; grid: unknown[][]; columns?: Record<string, number> }[] };
      },
      extraction?: Date | null
    ) => {
      byBuilding: Record<string, Record<string, number>>;
      byMonth: Record<string, number>;
      filas: number;
      sinFecha: number;
    };
    escribirCitasMensuales: (
      found: Record<string, unknown>,
      informe: Record<string, unknown>
    ) => void;
    agregarCitas: (
      found: Record<string, unknown>,
      extraction: Date,
      citas: Record<string, number>,
      citasAnual: Record<string, number>
    ) => void;
    agregarIncidenciasOnsite: (
      found: Record<string, unknown>,
      extraction: Date,
      bucket: Record<string, number>
    ) => void;
    agregarPeticionesMes: (
      found: Record<string, unknown>,
      extraction: Date,
      bucket: Record<string, number>
    ) => void;
    findDataSheets: (
      grids: { name: string; grid: unknown[][] }[],
      required: string[]
    ) => { name: string; grid: unknown[][]; headerRow: number; columns: Record<string, number> }[];
    REQUIRED: { peticiones: string[]; citas: string[] };
    agregarSlas: (
      found: Record<string, unknown>,
      slas: Record<string, number>,
      extraction: Date
    ) => void;
    agregarComparativas: (
      found: Record<string, unknown>,
      comparativas: Record<string, number>,
      extraction: Date
    ) => void;
    validarOrigenes: (found: Record<string, unknown>, extraction: Date) => void;
    extraccionFutura: (extraction: Date | null, now?: Date) => boolean;
    extraccionDeHoy: (now?: Date) => Date;
    aplicarExtraccionDeHoy: (
      config: { extraction: Date | null },
      now?: Date
    ) => { extraction: Date };
    isoDate: (date: Date) => string;
    actualizarMeses: (
      found: Record<string, unknown>,
      extraction: Date,
      lastClosed: string,
      windowMonths: number
    ) => { cerrados: string[]; vivo: string; limpiados: string[]; ultimoCerrado: string };
    readConfig: () => {
      lastClosed: string;
      extraction: Date | null;
      lastProcessed: Date | null;
    };
  };
}

function memorySheet(grid: unknown[][]) {
  const formulas: Record<string, string> = {};

  function cell(row: number, column: number) {
    return (grid[row - 1] || [])[column - 1] ?? null;
  }

  function setCell(row: number, column: number, value: unknown) {
    while (grid.length < row) grid.push([]);
    const line = grid[row - 1];
    while (line.length < column) line.push(null);
    line[column - 1] = value;
    delete formulas[`${row}:${column}`];
  }

  return {
    grid,
    getMaxColumns() {
      return grid.reduce((max, row) => Math.max(max, row.length), 0);
    },
    insertColumnBefore(column: number) {
      for (const row of grid) {
        if (row.length >= column) row.splice(column - 1, 0, null);
      }
    },
    getRange(row: number, column: number, rowCount = 1, columnCount = 1) {
      const range = {
        getValue() {
          return cell(row, column);
        },
        getValues() {
          const values: unknown[][] = [];

          for (let r = 0; r < rowCount; r += 1) {
            const line: unknown[] = [];

            for (let c = 0; c < columnCount; c += 1) {
              line.push(cell(row + r, column + c));
            }

            values.push(line);
          }

          return values;
        },
        getFormula() {
          return formulas[`${row}:${column}`] ?? "";
        },
        setValue(value: unknown) {
          setCell(row, column, value);
          return range;
        },
        setValues(values: unknown[][]) {
          for (let r = 0; r < values.length; r += 1) {
            for (let c = 0; c < values[r].length; c += 1) {
              setCell(row + r, column + c, values[r][c]);
            }
          }
          return range;
        },
        setFormula(formula: string) {
          formulas[`${row}:${column}`] = formula;
          setCell(row, column, formula);
          return range;
        },
        setNumberFormat() {
          return range;
        },
      };

      return range;
    },
  };
}

function loadCodigoWithSheets(tabs: Record<string, ReturnType<typeof memorySheet>>) {
  const source = readFileSync(join(HERE, "Codigo.gs"), "utf8");
  const context = createContext({
    console,
    Date,
    MimeType: {
      MICROSOFT_EXCEL: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      PLAIN_TEXT: "text/plain",
    },
    SpreadsheetApp: {
      getActiveSpreadsheet() {
        return {
          getSheetByName(name: string) {
            return tabs[name] ?? null;
          },
          getId() {
            return "";
          },
        };
      },
      getUi() {
        return { alert() {}, ButtonSet: { OK: "OK" } };
      },
    },
  });

  runInContext(source, context, { filename: "Codigo.gs" });

  return context as ReturnType<typeof loadCodigo>;
}

function loadCodigoWithInforme(grid: unknown[][]) {
  const sheet = memorySheet(grid);
  const gs = loadCodigoWithSheets({
    "2.2.1 Volum de peticiones (Info": sheet,
    "2.2.1 Volum de peticiones (Informe)": sheet,
  });

  return { sheet, gs };
}

describe("Codigo.gs weekly safeguards", () => {
  const gs = loadCodigo();

  it("usa el mismo código de edificio que la app", () => {
    expect(gs.edificioCode("-PL ANTONIO MAURA, 6,")).toBe(
      edificioCode("-PL ANTONIO MAURA, 6,")
    );
    expect(gs.edificioCode("Smart Tech Antoni Maura")).toBe(
      edificioCode("Smart Tech Antoni Maura")
    );
  });

  it("codifica edificios en el TXT y no escribe direcciones", () => {
    const { serializarPlano } = gs;
    const address = "-PL ANTONIO MAURA, 6,";
    const texto = serializarPlano(
      {
        edificios: [
          ["A. Maura", "DT Cataluña", "", "", address, "", "Si", "1"],
        ],
        workOrders: [
          ["2026-09-11", "2026/09", "37", "A. Maura", "TRASLADO", "1"],
        ],
        citas: [
          [
            "2026-09-11",
            "2026/09",
            "37",
            "Smart Tech Antoni Maura",
            "Con Cita",
            "2",
          ],
        ],
        imacs: [["2026-09-01", "2026/09", address, "Solicitudes", "3"]],
      },
      { week: "2026-09-15", scope: "completo" }
    );

    expect(texto).not.toMatch(/ANTONIO MAURA/i);
    expect(texto).not.toMatch(/\[EDIFICIOS\]/);
    expect(texto).toContain(edificioCode("A. Maura"));
    expect(texto).toContain(edificioCode(address));
  });

  it("descarta Grand Total y Total como edificios", () => {
    expect(gs.esAliasEdificioBasura("Grand Total")).toBe(true);
    expect(gs.esAliasEdificioBasura("TOTAL GENERAL")).toBe(true);
    expect(gs.esAliasEdificioBasura("Madrid SEDE")).toBe(false);
  });

  it("no rueda semana anterior si la extracción no ha cambiado", () => {
    const extraction = new Date("2026-08-24T00:00:00.000Z");

    expect(gs.debeRodarSemanaAnterior(extraction, extraction)).toBe(false);
    expect(gs.debeRodarSemanaAnterior(extraction, null)).toBe(true);
    expect(
      gs.debeRodarSemanaAnterior(new Date("2026-08-31T00:00:00.000Z"), extraction)
    ).toBe(true);
  });

  it("reconoce el mismo día sin tratar la hora como otra extracción", () => {
    const extraction = new Date("2026-09-15T00:00:00.000Z");

    expect(gs.extraccionYaProcesada(extraction, extraction)).toBe(true);
    // La primera vez no hay fecha guardada: Semana anterior sí rueda.
    expect(gs.extraccionYaProcesada(extraction, null)).toBe(false);
    expect(gs.debeRodarSemanaAnterior(extraction, null)).toBe(true);
    expect(
      gs.extraccionYaProcesada(extraction, new Date("2026-09-08T00:00:00.000Z"))
    ).toBe(false);
    // La hora no decide: Configuración guarda el día y la comparación es por día.
    expect(
      gs.extraccionYaProcesada(extraction, new Date("2026-09-15T23:30:00.000Z"))
    ).toBe(true);
    // El mismo día no detiene el proceso: se refrescan los datos y no se rueda.
    expect(gs.debeRodarSemanaAnterior(extraction, extraction)).toBe(false);
    expect(gs.fechaCorta(extraction)).toBe("15/09/2026");
  });

  it("sella la extracción con hoy aunque la celda traiga un día futuro o esté vacía", () => {
    const now = new Date(2026, 9, 3, 18, 30);
    const futura = bookSheet([
      ["Carpeta Drive", "17O7dORS6oIDN0hyLP1AXQEN7tR6k3ZbH"],
      ["Fecha de extracción", new Date(Date.UTC(2026, 9, 4))],
      ["Última extracción procesada", null],
    ]);
    const vacia = bookSheet([
      ["Carpeta Drive", "17O7dORS6oIDN0hyLP1AXQEN7tR6k3ZbH"],
      ["Fecha de extracción", ""],
    ]);
    const gsFutura = loadCodigoWithSheets({
      Configuración: futura,
    } as unknown as Record<string, ReturnType<typeof memorySheet>>);
    const gsVacia = loadCodigoWithSheets({
      Configuración: vacia,
    } as unknown as Record<string, ReturnType<typeof memorySheet>>);

    expect(gsVacia.readConfig().extraction).toBeNull();

    const config = gsFutura.readConfig();
    gsFutura.aplicarExtraccionDeHoy(config, now);

    expect(gsFutura.isoDate(config.extraction)).toBe("2026-10-03");
    expect(gsFutura.extraccionFutura(config.extraction, now)).toBe(false);
    expect(futura.grid[1][1]).toEqual(config.extraction);
    expect(gsFutura.debeRodarSemanaAnterior(config.extraction, null)).toBe(true);
    expect(
      gsFutura.debeRodarSemanaAnterior(gsFutura.extraccionDeHoy(now), config.extraction)
    ).toBe(false);
  });

  it("cuenta solo las citas de la semana de extracción, no el histórico", () => {
    const extraction = new Date("2026-08-24T00:00:00.000Z");
    const totals = gs.totalesComprobacion(
      {
        peticiones: [],
        workOrders: [],
        incidencias: [],
        citas: [
          ["2026-05-12", "2026/05", 20, "Sede", "Con Cita", 100],
          ["2026-08-24", "2026/08", 35, "Sede", "Con Cita", 7],
          ["2026-08-25", "2026/08", 35, "Sede", "Sin Cita", 3],
          ["2026-08-31", "2026/08", 36, "Sede", "Con Cita", 9],
        ],
      },
      extraction
    );

    expect(totals.citas).toBe(7);
  });

  it("no trata recuentos de encuestas como fechas de 1900", () => {
    expect(gs.toDate(91)).toBeNull();
    expect(gs.toDate(285)).toBeNull();
    expect(gs.fechaOperativa(new Date(Date.UTC(1900, 2, 31)))).toBe(false);
    expect(gs.fechaOperativa(new Date(Date.UTC(2026, 7, 1)))).toBe(true);
  });

  it("lee el año de Hoja 14 aunque venga como número, texto o fecha", () => {
    expect(gs.yearFromCell(2026)).toBe(2026);
    expect(gs.yearFromCell("2026")).toBe(2026);
    expect(gs.yearFromCell(new Date(2026, 0, 1))).toBe(2026);
  });

  it("resuelve el ámbito de Renove por el nombre del fichero", () => {
    expect(gs.renoveKind("Renove Global PC Holding.xlsx")).toBe("renoveHolding");
    expect(gs.renoveKind("Renove Global PC España 2026.xlsx")).toBe("renoveEspana");
    expect(gs.renoveKind("renove global pc espana 2026.xlsx")).toBe("renoveEspana");
    // Sin la palabra Renove no es uno de los dos libros, y sin ámbito tampoco:
    // adivinarlo colocaría una población entera bajo la etiqueta equivocada.
    expect(gs.renoveKind("Backlog20260914.xlsx")).toBeNull();
    expect(gs.renoveKind("Renove Global PC.xlsx")).toBeNull();
    expect(gs.renoveKind("Dashboards Renoves SSCC.xlsx")).toBeNull();
  });

  it("lee solo las cuatro pestañas derivadas, no las crudas de las que salen", () => {
    const grids = [
      { name: "Renove semanal", grid: [["Ubicación", "Estado"]] },
      { name: "Renovados renove", grid: [["Ubicación", "Estado"]] },
      { name: "Onboarding semanal", grid: [["Ubicación", "Estado"]] },
      { name: "Renovados onboarding", grid: [["Ubicación", "Estado"]] },
      // Las crudas comparten la firma de cabeceras y son el origen de las
      // derivadas: contarlas sumaría cada equipo dos veces.
      { name: "Renove", grid: [["Ubicación", "Estado"]] },
      { name: "Onboarding y averías", grid: [["Ubicación", "Estado"]] },
      { name: "Copia de Renove semanal", grid: [["Ubicación", "Estado"]] },
    ];

    expect(gs.renoveSheets(grids, "España").map(sheet => sheet.name)).toEqual([
      "Renove semanal",
      "Renovados renove",
      "Onboarding semanal",
      "Renovados onboarding",
    ]);
  });

  it("agrupa Renove por día, ámbito y estado sin leer serial ni ubicación", () => {
    const holding = [
      {
        name: "Renove semanal",
        grid: [
          ["Ubicación", "Estado", "Fecha de Estado", "Serial", "Nº Petición"],
          ["SEDE Principal", "PENDIENTE USUARIO", null, "PF5WQS8W", "G500744"],
          ["SEDE Principal", "PENDIENTE USUARIO", null, "PF63YRLT", "G500741"],
          ["SEDE Principal", "", null, "PF63XDTH", "G500737"],
        ],
      },
      {
        name: "Copia de Renove semanal",
        grid: [
          ["Ubicación", "Estado", "Fecha de Estado", "Serial", "Nº Petición"],
          ["SEDE Principal", "RENOVADO", new Date(2026, 3, 22), "PF5WQS8W", "G500744"],
        ],
      },
    ];
    const espana = [
      {
        name: "Renovados renove",
        grid: [
          ["Ubicación", "Estado", "Fecha", "Nº Petición"],
          ["Antoni Maura", "RENOVADO", new Date(2026, 3, 22), "G500287"],
          ["Antoni Maura", "RENOVADO", new Date(2026, 3, 22), "G500292"],
          ["Antoni Maura", "RECHAZADO", new Date(2026, 3, 20), "G500283"],
          // Sin nada en la columna de petición no es un equipo. En los libros
          // del 21/09/2026 son cuatro filas, y tampoco traen serial.
          ["Antoni Maura", "RENOVADO", new Date(2026, 3, 22), ""],
        ],
      },
      // Las crudas viajan en el mismo libro y no deben sumarse sobre su resumen.
      {
        name: "Renove",
        grid: [
          ["Ubicación", "Estado", "Fecha", "Nº Petición"],
          ["Antoni Maura", "RENOVADO", new Date(2026, 3, 22), "G500287"],
        ],
      },
    ];
    const buckets: Record<string, number> = {};

    gs.agregarRenove(
      {
        renoveHolding: { sheets: gs.renoveSheets(holding, "Holding") },
        renoveEspana: { sheets: gs.renoveSheets(espana, "España") },
      },
      buckets
    );

    expect(gs.rows(buckets)).toEqual([
      ["", "", "0", "Holding", "PENDIENTE USUARIO", 2],
      ["2026-04-20", "2026/04", "17", "España", "RECHAZADO", 1],
      ["2026-04-22", "2026/04", "17", "España", "RENOVADO", 2],
    ]);
  });

  it("cuenta una línea por equipo, aunque repita petición o no la tenga aún", () => {
    // Regla del equipo de Informática, 22/09/2026: cada línea con algo en la
    // columna de petición es un equipo. Una petición puede cubrir varias
    // posiciones, así que G500391 dos veces son dos máquinas — comprobado en
    // las pestañas crudas, donde cada repetición lleva un serial distinto.
    const grids = [
      {
        name: "Renovados onboarding",
        grid: [
          ["Ubicación", "Estado", "Fecha", "Nº Petición"],
          ["Tablas I", "RENOVADO", new Date(2026, 3, 22), "G500391"],
          ["Tablas I", "RENOVADO", new Date(2026, 3, 22), "G500391"],
          // Los marcadores de texto son equipos cuya petición no existe todavía.
          ["Tablas I", "RENOVADO", new Date(2026, 3, 22), "Llamada Ivan"],
          ["Tablas I", "RENOVADO", new Date(2026, 3, 22), "VIP"],
          // Sin petición no cuenta.
          ["Tablas I", "RENOVADO", new Date(2026, 3, 22), ""],
          ["Tablas I", "RENOVADO", new Date(2026, 3, 22), null],
        ],
      },
    ];
    const buckets: Record<string, number> = {};

    gs.agregarRenove(
      { renoveEspana: { sheets: gs.renoveSheets(grids, "España") } },
      buckets
    );

    expect(gs.rows(buckets)).toEqual([
      ["2026-04-22", "2026/04", "17", "España", "RENOVADO", 4],
    ]);
  });

  it("el cierre automático apunta al mes de extracción, no al siguiente", () => {
    const extraction = new Date("2026-09-07T00:00:00.000Z");
    const target = gs.monthBounds(extraction).first;

    expect(target.toISOString().slice(0, 10)).toBe("2026-09-01");
    expect(gs.mesSiguiente(new Date("2026-08-01T00:00:00.000Z")).toISOString().slice(0, 10)).toBe(
      "2026-09-01"
    );
  });
});

describe("Codigo.gs Acumuladas → 2.2.1 anual", () => {
  const gs = loadCodigo();

  const monthLabels = [
    ["Enero"],
    ["Febrero"],
    ["Marzo"],
    ["Abril"],
    ["Mayo"],
    ["Junio"],
    ["Julio"],
    ["Agosto"],
    ["Septiembre"],
    ["Octubre"],
    ["Noviembre"],
    ["Diciembre"],
  ];

  function acumuladasFound(rows: unknown[][]) {
    return {
      acumuladas: {
        sheets: [
          {
            headerRow: 0,
            grid: [
              ["Denominación Producto", "Estatus de la Posición", "Fecha Gestionado"],
              ...rows,
            ],
          },
        ],
      },
    };
  }

  it("reconoce Acumuladas por nombre, no por cabecera", () => {
    expect(gs.requestKind("Acumuladas150926.xlsx")).toBe("acumuladas");
    expect(gs.requestKind("SSCC Acumuladas.xlsx")).toBe("acumuladas");
    expect(gs.requestKind("Gestionadas SSCC.xlsx")).toBe("gestionadas");
    expect(gs.requestKind("Peticiones ON SITE SSCC.xlsx")).toBeNull();
  });

  it("cuenta posiciones, no Nº Petición distintos, por Fecha Gestionado", () => {
    const counted = gs.contarPeticionesAcumuladas(
      acumuladasFound([
        ["PORTATIL", "@08@", new Date(2026, 8, 9)],
        ["PORTATIL", "@08@", new Date(2026, 8, 10)],
        ["HIBRIDO", "@08@", new Date(2026, 8, 11)],
        ["TECLADO", "@08@", new Date(2026, 7, 20)],
        ["", "", ""],
        ["SIN FECHA", "@08@", null],
      ])
    );

    expect(counted.filas).toBe(5);
    expect(counted.sinFecha).toBe(1);
    expect(counted.counts["2026/09"]).toBe(3);
    expect(counted.counts["2026/08"]).toBe(1);
  });

  it("la semilla de agosto 2026 es 776 y el Excel la pisa si trae agosto", () => {
    expect(gs.PETICIONES_ANUAL_SEMILLA).toEqual([
      { anio: 2026, mes: 8, peticiones: 776 },
    ]);

    const withoutFile = gs.totalesPeticionesAnual({});
    expect(withoutFile["2026/08"]).toBe(776);
    expect(withoutFile["2026/09"]).toBeUndefined();

    const withSeptember = gs.totalesPeticionesAnual(
      acumuladasFound(Array.from({ length: 319 }, () => ["P", "@08@", new Date(2026, 8, 15)]))
    );
    expect(withSeptember["2026/08"]).toBe(776);
    expect(withSeptember["2026/09"]).toBe(319);
  });

  it("mapea agosto a Q11 y septiembre a Q12", () => {
    const years = gs.aniosConsecutivos([2022, 2023, 2024, 2025, 2026, null, 2022]);

    expect(years).toEqual([
      { year: 2022, column: 13 },
      { year: 2023, column: 14 },
      { year: 2024, column: 15 },
      { year: 2025, column: 16 },
      { year: 2026, column: 17 },
    ]);
    expect(gs.columnaParaAnio(years, 2026, null)).toBe(17);
    expect(gs.filaMesPeticiones(monthLabels, 8)).toBe(11);
    expect(gs.filaMesPeticiones(monthLabels, 9)).toBe(12);
  });

  it("abre 2027 en R3 y rechaza 2028 si S3 está ocupada", () => {
    const years = gs.aniosConsecutivos([2022, 2023, 2024, 2025, 2026]);

    expect(gs.columnaParaAnio(years, 2027, "")).toBe(18);
    expect(() => gs.columnaParaAnio(years, 2027, 2022)).toThrow(/R3 está ocupada/);

    const with2027 = years.concat([{ year: 2027, column: 18 }]);
    expect(() => gs.columnaParaAnio(with2027, 2028, 2022)).toThrow(/S3 está ocupada/);
  });

  it("escribe Q11=776 y Q12=319 sin tocar el resto del informe", () => {
    const grid: unknown[][] = [];
    grid[0] = [];
    grid[1] = [];
    grid[2] = [];
    grid[2][12] = 2022;
    grid[2][13] = 2023;
    grid[2][14] = 2024;
    grid[2][15] = 2025;
    grid[2][16] = 2026;
    grid[2][18] = 2022;
    const months = [
      "Enero",
      "Febrero",
      "Marzo",
      "Abril",
      "Mayo",
      "Junio",
      "Julio",
      "Agosto",
      "Septiembre",
      "Octubre",
      "Noviembre",
      "Diciembre",
    ];
    for (let index = 0; index < months.length; index += 1) {
      grid[3 + index] = [];
      grid[3 + index][11] = months[index];
    }
    grid[10][16] = 180;

    const { sheet, gs: writer } = loadCodigoWithInforme(grid);
    const informe: Record<string, unknown> = {};

    writer.escribirPeticionesAnual(
      acumuladasFound(Array.from({ length: 319 }, () => ["P", "@08@", new Date(2026, 8, 15)])),
      informe
    );

    expect(sheet.grid[10][16]).toBe(776);
    expect(sheet.grid[11][16]).toBe(319);
    expect(sheet.grid[2][18]).toBe(2022);
    expect(informe.peticionesAnualCeldas).toBe(2);
    expect(informe.peticionesAnualFilas).toBe(319);
  });
});

describe("Codigo.gs citas mensuales 2.3.3", () => {
  const gs = loadCodigo();

  function citasFound(rows: unknown[][]) {
    return {
      citas: {
        sheets: [
          {
            headerRow: 0,
            grid: [
              [
                "Incidencia",
                "Walkup",
                "Cita_Previa",
                "Remitente",
                "Estado",
                "Descripcion",
                "Asignado_a",
                "Smart_Tech",
              ],
              ...rows,
            ],
          },
        ],
      },
    };
  }

  it("lee fechas americanas de citas antes que el formato europeo", () => {
    const us = gs.citaDate("08/21/2026, 01:39:57 PM");
    const shortUs = gs.citaDate("8/21/2026");
    const eu = gs.citaDate("21/08/2026");

    expect(us?.toISOString().slice(0, 10)).toBe("2026-08-21");
    expect(shortUs?.toISOString().slice(0, 10)).toBe("2026-08-21");
    expect(eu?.toISOString().slice(0, 10)).toBe("2026-08-21");
    expect(gs.numeroMesEspanol("Ene")).toBe(1);
    expect(gs.numeroMesEspanol("Ago")).toBe(8);
  });

  it("cuenta por mes y sede, excluye Telefonía y respeta el corte", () => {
    const counted = gs.contarCitasMensuales(
      citasFound([
        ["1", null, new Date(2026, 7, 10), "", "Cerrado", "", "", "Smart Tech Principal AN"],
        ["2", null, "08/15/2026, 09:00:00 AM", "", "Resuelto", "", "", "Smart Tech Principal AN"],
        ["3", null, new Date(2026, 8, 2), "", "Cerrado", "", "", "Smart Tech Sevilla, Palmera"],
        ["4", null, new Date(2026, 8, 3), "", "Cerrado", "", "", "Smart Tech Telefonía"],
        ["5", null, new Date(2026, 8, 20), "", "Cerrado", "", "", "Smart Tech Tablas I"],
        // Not served: out of the count.
        ["6", null, new Date(2026, 7, 11), "", "Cancelado", "", "", "Smart Tech Principal AN"],
        ["7", new Date(2026, 8, 4), null, "", "Asignado", "", "", "Smart Tech Sevilla, Palmera"],
      ]),
      new Date(Date.UTC(2026, 8, 17))
    );

    expect(counted.byMonth["2026/08"]).toBe(2);
    expect(counted.byMonth["2026/09"]).toBe(1);
    expect(counted.byBuilding["2026/08"]["Smart Tech Principal AN"]).toBe(2);
    expect(counted.byBuilding["2026/09"]["Smart Tech Sevilla, Palmera"]).toBe(1);
    expect(counted.filas).toBe(3);
  });

  it("cuenta en la semanal solo las citas Resuelto o Cerrado", () => {
    const citas: Record<string, number> = {};
    const anual: Record<string, number> = {};
    const grid = citasFound([
      ["1", null, new Date(Date.UTC(2026, 8, 22)), "", "Cerrado", "", "", "Smart Tech Tablas I"],
      ["2", new Date(Date.UTC(2026, 8, 22)), null, "", "Resuelto", "", "", "Smart Tech Tablas I"],
      ["3", null, new Date(Date.UTC(2026, 8, 23)), "", "Cancelado", "", "", "Smart Tech Tablas I"],
      ["4", new Date(Date.UTC(2026, 8, 23)), null, "", "En curso", "", "", "Smart Tech Tablas I"],
    ]).citas.sheets[0].grid;
    const found = {
      citas: { sheets: gs.findDataSheets([{ name: "Citas", grid }], gs.REQUIRED.citas) },
    };

    gs.agregarCitas(found, new Date(Date.UTC(2026, 8, 28)), citas, anual);

    expect(gs.rows(anual)).toEqual([["2026", "2026/09", 2]]);
    expect(
      gs.rows(citas).map((row: unknown[]) => row.slice(-2))
    ).toEqual([
      ["Con Cita", 1],
      ["Sin Cita", 1],
    ]);
  });

  it("falla si la pestaña de citas no trae Estado", () => {
    const found = citasFound([]);
    found.citas.sheets[0].grid = [
      ["Incidencia", "Walkup", "Cita_Previa", "Smart_Tech"],
      ["1", null, new Date(2026, 8, 2), "Smart Tech Tablas I"],
    ];

    expect(() => gs.contarCitasMensuales(found, new Date(Date.UTC(2026, 8, 28)))).toThrow(
      "no trae Estado"
    );
  });

  it("escribe AT agosto, AU septiembre y BB11/BB12 del histórico anual", () => {
    const grid: unknown[][] = [];
    for (let r = 0; r < 23; r += 1) grid[r] = [];

    grid[2][32] = new Date(2025, 6, 1);
    for (let offset = 0; offset < 13; offset += 1) {
      grid[2][32 + offset] = new Date(2025, 6 + offset, 1);
    }
    grid[2][45] = new Date(2026, 7, 1);
    grid[3][48] = "Ene";
    for (let month = 2; month <= 12; month += 1) {
      grid[2 + month][48] = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"][
        month - 1
      ];
    }
    grid[2][49] = 2022;
    grid[2][50] = 2023;
    grid[2][51] = 2024;
    grid[2][52] = 2025;
    grid[2][53] = 2026;
    grid[2][55] = 2022;

    grid[3][0] = "Smart Tech Las Palmas, Albareda";
    grid[3][1] = "DT Canarias";
    grid[3][2] = "Canarias";
    grid[3][31] = "Canarias";
    grid[8][0] = "Smart Tech Principal AN";
    grid[8][1] = "DT Centro";
    grid[8][2] = "Sede - Principal";
    grid[8][31] = "Sede - Principal";
    grid[21][0] = "Smart Tech Sevilla, Palmera";
    grid[21][1] = "DT Sur";
    grid[21][2] = "Sevilla";
    grid[21][31] = "Sevilla";

    const sheet = memorySheet(grid);
    const writer = loadCodigoWithSheets({
      "Hoja 18": sheet,
      "2.3.1 Volum de Citas SmartTech Semanal  (Informe)": sheet,
    });
    const informe: Record<string, unknown> = {
      extraction: new Date(Date.UTC(2026, 8, 17)),
    };

    writer.escribirCitasMensuales(
      citasFound([
        ["1", null, new Date(2026, 7, 10), "", "Cerrado", "", "", "Smart Tech Principal AN"],
        ["2", null, new Date(2026, 7, 11), "", "Cerrado", "", "", "Smart Tech Principal AN"],
        ["3", null, new Date(2026, 8, 2), "", "Cerrado", "", "", "Smart Tech Sevilla, Palmera"],
        ["4", null, new Date(2026, 8, 3), "", "Cerrado", "", "", "Smart Tech Telefonía"],
      ]),
      informe
    );

    expect(sheet.grid[8][45]).toBe(2);
    expect(sheet.grid[21][46]).toBe(1);
    expect(sheet.grid[2][46] instanceof Date || String(sheet.grid[2][46]).includes("2026")).toBe(true);
    expect(sheet.grid[10][53]).toBe(2);
    expect(sheet.grid[11][53]).toBe(1);
    expect(informe.citasMensualColumnas).toBe(2);
  });
});

describe("Codigo.gs informe mensual", () => {
  const gs = loadCodigo();

  it("separa el volcado de mes del semanal por el nombre", () => {
    expect(gs.requestKind("BacklogMes.xlsx")).toBe("backlogMes");
    expect(gs.requestKind("Liberadas mes.xlsx")).toBe("liberadasMes");
    expect(gs.requestKind("GestionadesMes.xlsx")).toBe("gestionadasMes");
    expect(gs.requestKind("Backlog20260928.xlsx")).toBe("backlog");
    expect(gs.requestKind("Gestionadas20260928.xlsx")).toBe("gestionadas");
    expect(gs.requestKind("Acumuladas20260921.xlsx")).toBe("acumuladas");
  });

  it("reconoce el trío de mes por el nombre del mes, con erratas", () => {
    // The 2026-09 close as it reached the folder on 2026-10-05.
    expect(gs.requestKind("BacklogSeptiembre.xlsx")).toBe("backlogMes");
    expect(gs.requestKind("GestionadasSeptiembre.xlsx")).toBe("gestionadasMes");
    expect(gs.requestKind("LiberadasSepriembre.xlsx")).toBe("liberadasMes");
    expect(gs.requestKind("Liberadas de octubre.xlsx")).toBe("liberadasMes");
    expect(gs.requestKind("Gestionadas Oct 2026.xlsx")).toBe("gestionadasMes");
    expect(gs.requestKind("Backlog 20261005.xlsx")).toBe("backlog");
    expect(gs.requestKind("Liberadas 20261005.xlsx")).toBe("liberadas");
    expect(gs.requestKind("Copia de Gestionadas 20261005 (1).xlsx")).toBe("gestionadas");
    expect(gs.requestKind("Backlog semana 40.xlsx")).toBe("backlog");
  });

  it("conserva los meses guardados y sustituye solo el mes que llega", () => {
    const guardadas = [
      ["2026/08", "On Site", "Gestionadas", 600],
      ["2026/09", "On Site", "Gestionadas", 1],
      ["2026/09", "Technology", "Backlog", 9],
    ];
    const septiembre = [["2026/09", "On Site", "Gestionadas", 680]];

    expect(gs.fusionarPeticionesMes(guardadas, septiembre)).toEqual([
      ["2026/08", "On Site", "Gestionadas", 600],
      ["2026/09", "On Site", "Gestionadas", 680],
    ]);
    // A weekly run without the trio publishes what is stored.
    expect(gs.fusionarPeticionesMes(guardadas, [])).toEqual(guardadas);
  });

  it("lee el mes guardado aunque la hoja lo haya convertido en fecha", () => {
    expect(gs.mesGuardado("2026/09")).toBe("2026/09");
    expect(gs.mesGuardado(new Date(2026, 8, 1))).toBe("2026/09");
    expect(gs.mesGuardado("")).toBe("");
  });

  it("cuenta abiertas y resueltas por la fecha Abierta y el backlog pendiente", () => {
    const grid = [
      ["Estado", "Abierta", "Resuelta"],
      ["Cerrado", new Date(2026, 7, 15), new Date(2026, 7, 20)],
      // Opened in August, resolved in September: an August resolution.
      ["Cerrado", new Date(2026, 7, 30), new Date(2026, 8, 2)],
      ["Resuelto", "09/02/2026", "09/03/2026"],
      ["Pendiente", new Date(2026, 6, 1), null],
      ["Asignado", new Date(2026, 8, 4), null],
    ];
    const bucket: Record<string, number> = {};

    gs.agregarIncidenciasOnsite(
      { encuestas: { grids: [{ name: "7-7 - DashBoard Onsite - Listad", grid }] } },
      new Date(Date.UTC(2026, 8, 28)),
      bucket
    );

    const rows = gs.rows(bucket);
    const value = (month: string, metric: string) =>
      rows.find((row) => row[0] === month && row[1] === metric)?.[2];

    expect(value("2026/08", "Abiertas")).toBe(2);
    expect(value("2026/08", "Resueltas")).toBe(2);
    expect(value("2026/09", "Abiertas")).toBe(2);
    expect(value("2026/09", "Resueltas")).toBe(1);
    expect(value("2026/07", "Abiertas")).toBe(1);
    expect(value("2026/09", "Backlog")).toBe(1);
    expect(value("2026/07", "Backlog")).toBeUndefined();
  });

  it("cuenta una fila de GestionadasMes en su origen y no en la semana", () => {
    const grid = [
      ["Denominación Producto", "Estatus de la Posición", "Cantidad"],
      ["PORTATIL ESTANDAR", "Gestionada", 3],
      ["EQUIPAMIENTO APPLE DAAS", "Gestionada", 1],
      ["BBVA TECHNOLOGY - PORTATIL", "Gestionada", 2],
      ["TECLADO USB", "Gestionada", 4],
    ];
    const sheets = gs.findDataSheets([{ name: "Datos", grid }], gs.REQUIRED.peticiones);
    const bucket: Record<string, number> = {};

    gs.agregarPeticionesMes(
      { gestionadasMes: { sheets } },
      new Date(Date.UTC(2026, 8, 28)),
      bucket
    );

    const rows = gs.rows(bucket);

    // No Fecha Gestionado column: filed under the month before the extraction.
    expect(rows).toEqual([
      ["2026/08", "On Site", "Gestionadas", 1],
      ["2026/08", "Renove Apple", "Gestionadas", 1],
      ["2026/08", "Renove Windows", "Gestionadas", 1],
      ["2026/08", "Technology", "Gestionadas", 1],
    ]);
  });

  it("archiva el trio de mes en el mes que traen sus fechas, backlog incluido", () => {
    const gestionadas = [
      ["Denominación Producto", "Estatus de la Posición", "Fecha Gestionado"],
      ["PORTATIL ESTANDAR", "Gestionada", new Date(Date.UTC(2026, 6, 10))],
      ["TECLADO USB", "Gestionada", new Date(Date.UTC(2026, 6, 31))],
      ["TECLADO USB", "Gestionada", new Date(Date.UTC(2026, 7, 1))],
    ];
    const backlog = [
      ["Denominación Producto", "Estatus de la Posición"],
      ["TECLADO USB", "En vuelo"],
    ];
    const bucket: Record<string, number> = {};

    gs.agregarPeticionesMes(
      {
        gestionadasMes: { sheets: gs.findDataSheets([{ name: "Datos", grid: gestionadas }], gs.REQUIRED.peticiones) },
        backlogMes: { sheets: gs.findDataSheets([{ name: "Datos", grid: backlog }], gs.REQUIRED.peticiones) },
      },
      new Date(Date.UTC(2026, 8, 3)),
      bucket
    );

    expect(gs.rows(bucket)).toEqual([
      ["2026/07", "On Site", "Backlog", 1],
      ["2026/07", "On Site", "Gestionadas", 2],
      ["2026/07", "Renove Windows", "Gestionadas", 1],
    ]);
  });
});

/**
 * The small tabs of the template as exported on `latest`'s month: HIC series
 * up to that month, the two-row category pivot, one comparison and both SLA
 * tabs. `enCurso` is the "mes en curso" SLA tab, empty on the 1st.
 */
function templateFound(enCurso: unknown[][]) {
  const grids = [
    {
      name: "2-2 - HIC (SSCC) Mensual - Inci",
      grid: [
        ["", "Fecha", "2026/08", "2026/09", "Total"],
        ["Categorization Tier 1", "", "2026/08", "2026/09", "Total"],
        ["EQUIPO", "", "178", "474", "652"],
        ["Total", "", "178", "474", "652"],
      ],
    },
    {
      name: "3-3 - HIC (SSCC) - Incidencias ",
      grid: [
        ["Fecha", "Incidencias resueltas", "Asignadas", "Asignaciones"],
        ["2026/08", "408", "401", "442"],
        ["2026/09", "873", "864", "910"],
      ],
    },
    {
      name: "4-4 - HIC (SSCC) - Incidencias ",
      grid: [
        ["Fecha", "Incidencias resueltas", "Asignadas", "Asignaciones"],
        ["2026/09", "41", "44", "50"],
      ],
    },
    {
      name: "9-9 - Comparativa Comonente_ EQ",
      grid: [
        ["Modulo", "Mes Actual", "Mes Anterior", "Hace dos meses"],
        ["AVERIA", "N/A", "77", "18"],
      ],
    },
    { name: "12-11 - SLAs finalizados mes en", grid: enCurso },
    {
      name: "13-12 - SLAs finalizados mes an",
      grid: [
        ["", "MeasurementStatus", "Cumplido", "Incumplido", "Total"],
        ["SVTTitle", "", "Cumplido", "Incumplido", "Total"],
        ["WPSPAIN_Minsait.Inc.Reacción.P3.SSCC", "", "465 (90%)", "51 (10%)", "516"],
        ["Total", "", "465", "51", "516"],
      ],
    },
  ];

  return { encuestas: { grids } };
}

const EMPTY_EN_CURSO = [
  ["", "MeasurementStatus", "Total"],
  ["SVTTitle", "", "Total"],
  ["Total", "", "0"],
];

describe("Codigo.gs template del día 1", () => {
  const gs = loadCodigo();
  const firstOfOctober = new Date(Date.UTC(2026, 9, 1));

  it("salta la pestaña de SLAs en curso vacía y fecha la del mes anterior en el mes cerrado", () => {
    const slas: Record<string, number> = {};

    gs.agregarSlas(templateFound(EMPTY_EN_CURSO), slas, firstOfOctober);

    expect(gs.rows(slas)).toEqual([
      ["2026/09", "WPSPAIN_Minsait.Inc.Reacción.P3.SSCC", "465", "51", 516],
    ]);
  });

  it("en una semana normal mantiene el mes del HIC como mes en curso", () => {
    const slas: Record<string, number> = {};
    const enCurso = [
      ["", "MeasurementStatus", "Cumplido", "Incumplido", "Total"],
      ["SVTTitle", "", "Cumplido", "Incumplido", "Total"],
      ["WPSPAIN_Minsait.Inc.Reacción.P3.SSCC", "", "409 (91%)", "40 (9%)", "449"],
    ];

    gs.agregarSlas(templateFound(enCurso), slas, new Date(Date.UTC(2026, 8, 28)));

    expect(gs.rows(slas).map((row: unknown[]) => [row[0], row[4]])).toEqual([
      ["2026/08", 516],
      ["2026/09", 449],
    ]);
  });

  it("sigue fallando si una pestaña de SLAs con filas pierde sus columnas", () => {
    const sinColumnas = [
      ["", "MeasurementStatus", "Total"],
      ["SVTTitle", "", "Total"],
      ["WPSPAIN_Minsait.Inc.Reacción.P3.SSCC", "", "449"],
    ];

    expect(() => gs.agregarSlas(templateFound(sinColumnas), {}, firstOfOctober)).toThrow(
      "no expone Cumplido e Incumplido"
    );
  });

  it("ancla las comparativas en el mes de la extracción", () => {
    const comparativas: Record<string, number> = {};

    gs.agregarComparativas(templateFound(EMPTY_EN_CURSO), comparativas, firstOfOctober);

    expect(gs.rows(comparativas).map((row: unknown[]) => row.slice(1))).toEqual([
      ["AVERIA", "2026/08", 18],
      ["AVERIA", "2026/09", 77],
    ]);
  });

  it("valida el template antes de escribir y exige Estado en citas", () => {
    const found = {
      ...templateFound(EMPTY_EN_CURSO),
      citas: {
        sheets: gs.findDataSheets(
          [{ name: "Citas", grid: [["Incidencia", "Walkup", "Cita_Previa", "Smart_Tech"]] }],
          gs.REQUIRED.citas
        ),
      },
    };

    expect(() => gs.validarOrigenes(found, firstOfOctober)).toThrow("no trae Estado");
    expect(() =>
      gs.validarOrigenes({ ...templateFound(EMPTY_EN_CURSO) }, firstOfOctober)
    ).not.toThrow();
  });

  it("rechaza una fecha de extracción posterior a hoy", () => {
    const today = new Date(2026, 8, 30, 7, 48);

    expect(gs.extraccionFutura(new Date(Date.UTC(2026, 9, 4)), today)).toBe(true);
    expect(gs.extraccionFutura(new Date(Date.UTC(2026, 8, 30)), today)).toBe(false);
    expect(gs.extraccionFutura(new Date(Date.UTC(2026, 8, 28)), today)).toBe(false);
  });
});

/**
 * A sheet with what the monthly tables use: values, formulas, clears, format
 * copies (ignored) and inserted rows or columns. `computed` returns a live
 * value for a cell, the way a formula reads its markers.
 */
function bookSheet(grid: unknown[][], computed: Record<string, () => unknown> = {}) {
  const formulas: Record<string, string> = {};
  const key = (row: number, column: number) => `${row}:${column}`;
  const cell = (row: number, column: number) =>
    computed[key(row, column)]?.() ?? (grid[row - 1] || [])[column - 1] ?? null;
  const setCell = (row: number, column: number, value: unknown) => {
    while (grid.length < row) grid.push([]);
    const line = grid[row - 1];
    while (line.length < column) line.push(null);
    line[column - 1] = value;
    delete formulas[key(row, column)];
  };
  const width = () => grid.reduce((max, row) => Math.max(max, row.length), 0) + 4;

  const sheet = {
    grid,
    formulas,
    getMaxRows: () => grid.length + 4,
    getMaxColumns: width,
    getLastRow: () => grid.length,
    insertRowsAfter() {},
    insertColumnsAfter() {},
    insertColumnBefore(column: number) {
      for (const row of grid) if (row.length >= column) row.splice(column - 1, 0, null);
    },
    insertColumnsBefore(column: number, count: number) {
      for (let index = 0; index < count; index += 1) sheet.insertColumnBefore(column);
    },
    getRange(row: number, column: number, rows = 1, columns = 1) {
      const each = (fn: (r: number, c: number, i: number, j: number) => void) => {
        for (let i = 0; i < rows; i += 1) for (let j = 0; j < columns; j += 1) fn(row + i, column + j, i, j);
      };
      const range = {
        getValue: () => cell(row, column),
        getValues: () => {
          const out: unknown[][] = [];
          for (let i = 0; i < rows; i += 1) {
            const line: unknown[] = [];
            for (let j = 0; j < columns; j += 1) line.push(cell(row + i, column + j));
            out.push(line);
          }
          return out;
        },
        getFormula: () => formulas[key(row, column)] ?? "",
        getFormulas: () => {
          const out: string[][] = [];
          for (let i = 0; i < rows; i += 1) {
            const line: string[] = [];
            for (let j = 0; j < columns; j += 1) line.push(formulas[key(row + i, column + j)] ?? "");
            out.push(line);
          }
          return out;
        },
        getFormulaR1C1: () => formulas[key(row, column)] ?? "",
        setValue(value: unknown) {
          setCell(row, column, value);
          return range;
        },
        setValues(values: unknown[][]) {
          each((r, c, i, j) => setCell(r, c, values[i][j]));
          return range;
        },
        setFormula(formula: string) {
          setCell(row, column, formula);
          formulas[key(row, column)] = formula;
          return range;
        },
        setFormulaR1C1: (formula: string) => range.setFormula(formula),
        setFormulas(values: string[][]) {
          each((r, c, i, j) => {
            setCell(r, c, values[i][j]);
            formulas[key(r, c)] = values[i][j];
          });
          return range;
        },
        clearContent() {
          each((r, c) => setCell(r, c, null));
          return range;
        },
        copyTo(target: { copyFrom: (values: unknown[][], f: string[][]) => void }, options?: { formatOnly?: boolean }) {
          if (!options?.formatOnly) target.copyFrom(range.getValues(), range.getFormulas());
          return range;
        },
        copyFrom(values: unknown[][], copied: string[][]) {
          each((r, c, i, j) => {
            setCell(r, c, values[i]?.[j] ?? null);
            if (copied[i]?.[j]) formulas[key(r, c)] = copied[i][j];
          });
        },
        setNumberFormat: () => range,
        setFontWeight: () => range,
      };
      return range;
    },
  };

  return sheet;
}

const month = (label: string) => new Date(Date.UTC(Number(label.slice(0, 4)), Number(label.slice(5, 7)) - 1, 1));
const MONTHS_TO_NOV = ["2026/07", "2026/08", "2026/09", "2026/10", "2026/11"];

/**
 * The book as the 30/09 test run left it: September frozen with partial data,
 * October frozen at zero and November open with drifted formulas.
 */
function libroAdelantado() {
  const volumetria = bookSheet([
    ["BBVA"], ["TEMPLATE 3-3"], ["Fecha", "Resueltas", "Asignadas", "Asignaciones", "", "Fecha"],
    [month("2026/07"), 722, 709, 759, "", month("2026/07"), 44, 43, 49],
    [month("2026/08"), 379, 355, 381, "", month("2026/08"), 21, 23, 26],
    [month("2026/09"), 701, 704, 742, "", month("2026/09"), 35, 39, 45],
    [month("2026/10"), null, null, null, "", month("2026/10")],
    [month("2026/11"), null, null, null, "", month("2026/11")],
  ]);
  const historico = bookSheet([
    [],
    ["", "", ...MONTHS_TO_NOV.map(month), "", "Historico"],
    ["", "", 766, "#N/A", "#N/A", "#N/A", "=SUM(G6+G9)"],
    ...Array.from({ length: 8 }, () => ["", "", 1, "#N/A", "#N/A", "#N/A", "=VLOOKUP"]),
  ]);
  const anual: unknown[][] = [[], [], ["", "", 2025, 2026]];
  for (let index = 0; index < 12; index += 1) anual.push(["", "Mes", 1000 + index, index < 7 ? 900 : null]);
  anual[10][3] = 702;
  anual[13][3] = "='2.1.6 Work Orders (Informe)'!N46";
  const total = bookSheet([
    ["Mes", "Incidencias", "WO", "Total"],
    [month("2026/07"), 766, 1095, "=SUM(B2:C2)"],
    [month("2026/08"), 11382, 702, "=SUM(B3:C3)"],
    [month("2026/09"), 317, null, "=SUM(B4:C4)"],
    [month("2026/10"), null, null, "=SUM(B5:C5)"],
    [month("2026/11"), "='Top 5'!R30", "='WO'!N46", "=SUM(B6:C6)"],
  ]);
  const encuestas = bookSheet([
    [], [], ["", "Fecha", "Encuestas", "Media", "Histórico"],
    ["", month("2026/07"), 173, 4.86, "Histórico"],
  ]);
  encuestas.grid.push(["", month("2026/08"), 117, 4.92, "Histórico"]);
  encuestas.grid.push(["", month("2026/09"), 73, 4.9, "Histórico"]);
  encuestas.grid.push(["", month("2026/10"), 0, "#DIV/0!", "Histórico"]);
  encuestas.grid.push(["", month("2026/11"), "=C31", "=J33", "Vivo (C31 y J33)"]);

  const imacs: unknown[][] = [[], [], [], [], ["", ""]];
  MONTHS_TO_NOV.forEach((label) => {
    const first = month(label);
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
    imacs[4].push(first, last);
  });
  for (let row = 5; row < 50; row += 1) imacs.push([]);

  // Work orders the report table counts per month, read through its markers.
  const woByMonth: Record<string, number> = { "2026/08": 749, "2026/09": 858, "2026/10": 3 };
  const woGrid: unknown[][] = [[]];
  for (let row = 1; row < 45; row += 1) woGrid.push([]);
  woGrid[23] = ["", "Edificio", "Acompañamiento", "", "", "", "", "", "", "", "", "", "", "Total"];
  woGrid[24] = ["Alicante", "Alicante"];
  woGrid[44] = ["", "", 2026];
  const wo = bookSheet(woGrid, {
    "26:14": () => {
      const marker = woGrid[0][7] as Date | undefined;
      return marker ? woByMonth[`${marker.getUTCFullYear()}/${String(marker.getUTCMonth() + 1).padStart(2, "0")}`] ?? 0 : 0;
    },
  });
  wo.grid[0][7] = month("2026/10");
  wo.grid[0][8] = new Date(Date.UTC(2026, 9, 31));

  const config = bookSheet([
    ["Carpeta Drive", "x"],
    ["Fecha de extracción", new Date(Date.UTC(2026, 9, 1))],
  ]);

  return {
    volumetria,
    historico,
    anual: bookSheet(anual),
    total,
    encuestas,
    imacs: bookSheet(imacs),
    wo,
    config,
  };
}

function loadWithBook(book: ReturnType<typeof libroAdelantado>) {
  return loadCodigoWithSheets({
    "2.1.1 Volumetria de Incidencias": book.volumetria,
    "Hoja 13": book.historico,
    "Hoja 14": book.anual,
    "Hoja 15": book.total,
    "2.1.5. Encuestas (Informe)": book.encuestas,
    "Hoja 19": book.imacs,
    "2.1.6 Work Orders (Informe)": book.wo,
    "Configuración": book.config,
  } as unknown as Record<string, ReturnType<typeof memorySheet>>);
}

/** The export of 01/10: HIC and surveys up to September, nothing of October yet. */
function exportDelDiaUno(gs: ReturnType<typeof loadCodigo>) {
  const template = templateFound(EMPTY_EN_CURSO).encuestas.grids;
  template[1].grid = [
    ["Fecha", "Incidencias resueltas", "Asignadas", "Asignaciones"],
    ["2026/07", "722", "709", "759"],
    ["2026/08", "408", "401", "442"],
    ["2026/09", "873", "864", "910"],
  ];
  template[2].grid = [
    ["Fecha", "Incidencias resueltas", "Asignadas", "Asignaciones"],
    ["2026/08", "21", "24", "27"],
    ["2026/09", "41", "44", "50"],
  ];
  const surveys = [
    ["Incident Number", "Fecha", "¿Cuál es tu nivel de satisfación en general con esta solicitud?"],
    ["1", "2026/08", "5"],
    ["2", "2026/08", "4"],
    ["3", "2026/09", "5"],
    ["4", "2026/09", "5"],
    ["5", "2026/09", "2"],
    ["6", "2026/09", ""],
  ];

  return {
    encuestas: {
      grids: template,
      sheets: gs.findDataSheets([{ name: "1-1", grid: surveys }], ["Incident Number", "Fecha"]),
    },
  };
}

describe("Codigo.gs tablas mensuales en valores", () => {
  it("repara el libro adelantado: cierra agosto y septiembre, deja octubre vivo y vacía noviembre", () => {
    const book = libroAdelantado();
    const gs = loadWithBook(book);
    const result = gs.actualizarMeses(exportDelDiaUno(gs), new Date(Date.UTC(2026, 9, 1)), "2026/07", 19);

    expect(result).toMatchObject({ cerrados: ["2026/08", "2026/09"], vivo: "2026/10", ultimoCerrado: "2026/09" });
    expect(result.limpiados).toEqual(["2026/11"]);

    // 2.1.1: September from the export of the 1st, October without data yet, November gone.
    expect(book.volumetria.grid[5].slice(1, 4)).toEqual([873, 864, 910]);
    expect(book.volumetria.grid[5].slice(6, 9)).toEqual([41, 44, 50]);
    expect(book.volumetria.grid[6].slice(1, 4)).toEqual(["", "", ""]);
    expect(book.volumetria.grid[7].slice(0, 4)).toEqual([null, null, null, null]);

    // Hoja 13: values instead of drifted formulas; November emptied, July untouched.
    expect(book.historico.grid.slice(2, 11).map((row) => row[4])).toEqual([914, 908, 960, 873, 864, 910, 41, 44, 50]);
    expect(book.historico.grid.slice(2, 11).map((row) => row[2])).toEqual([766, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(book.historico.grid[1][6]).toBeNull();
    expect(book.historico.formulas["3:7"]).toBeUndefined();
    expect(book.historico.grid[1][8]).toBe("Historico");

    // Hoja 14 and 15: work orders read through the markers of each month.
    expect(book.anual.grid.slice(10, 14).map((row) => row[3])).toEqual([749, 858, 3, null]);
    expect(book.total.grid.slice(2, 6)).toEqual([
      [month("2026/08"), 429, 749, "=SUM(B3:C3)"],
      [month("2026/09"), 914, 858, "=SUM(B4:C4)"],
      [month("2026/10"), "", 3, "=SUM(B5:C5)"],
      [null, null, null, null],
    ]);
    expect(book.wo.grid[0][7]).toEqual(month("2026/10"));

    // Surveys: 1 to 5 only; October live with none yet.
    expect(book.encuestas.grid.slice(4, 8).map((row) => row.slice(1, 5))).toEqual([
      [month("2026/08"), 2, 4.5, "Histórico"],
      [month("2026/09"), 3, 4, "Histórico"],
      [month("2026/10"), 0, "", "Vivo"],
      [null, null, null, null],
    ]);
    expect(book.encuestas.grid[1].slice(6, 8)).toEqual(["=B4", "=B5"]);
    expect(book.encuestas.grid[1][9]).toBe("=B7");

    // Hoja 19: the November pair is emptied, October stays.
    expect(book.imacs.grid[4].slice(8, 10)).toEqual([month("2026/10"), new Date(Date.UTC(2026, 9, 31))]);
    expect(book.imacs.grid[4].slice(10, 12)).toEqual([null, null]);

    expect(book.config.grid[2]).toEqual(["Último mes cerrado", "2026/09"]);
    expect(gs.readConfig().lastClosed).toBe("2026/09");
  });

  it("no vuelve a tocar un mes cerrado y reescribe el vivo", () => {
    const book = libroAdelantado();
    const gs = loadWithBook(book);
    const found = exportDelDiaUno(gs);

    gs.actualizarMeses(found, new Date(Date.UTC(2026, 9, 1)), "2026/07", 19);

    // A later export with a late survey of September and October started.
    found.encuestas.sheets[0].grid.push(["7", "2026/09", "1"], ["8", "2026/10", "5"]);
    const result = gs.actualizarMeses(found, new Date(Date.UTC(2026, 9, 5)), "2026/09", 19);

    expect(result.cerrados).toEqual([]);
    expect(book.encuestas.grid[5].slice(2, 4)).toEqual([3, 4]);
    expect(book.encuestas.grid[6].slice(2, 5)).toEqual([1, 5, "Vivo"]);
  });

  it("deshace en la siguiente ejecución lo que abrió una fecha equivocada", () => {
    const book = libroAdelantado();
    const gs = loadWithBook(book);
    const found = exportDelDiaUno(gs);

    // Normal close of September on the 1st, then October processed by mistake as December.
    gs.actualizarMeses(found, new Date(Date.UTC(2026, 9, 1)), "2026/07", 19);
    gs.actualizarMeses(found, new Date(Date.UTC(2026, 11, 7)), "2026/09", 19);
    expect(book.total.grid.slice(4, 7).map((row) => row[0])).toEqual([
      month("2026/10"),
      month("2026/11"),
      month("2026/12"),
    ]);

    // The right date: November and December are emptied, October is live again.
    gs.actualizarMeses(found, new Date(Date.UTC(2026, 9, 8)), "2026/09", 19);
    expect(book.total.grid.slice(4, 7).map((row) => row[0])).toEqual([month("2026/10"), null, null]);
    expect(book.encuestas.grid[6][4]).toBe("Vivo");
  });

  it("no escribe nada si la extracción cae en un mes ya cerrado", () => {
    const book = libroAdelantado();
    const gs = loadWithBook(book);
    const before = JSON.stringify(book.total.grid);
    const result = gs.actualizarMeses(exportDelDiaUno(gs), new Date(Date.UTC(2026, 8, 28)), "2026/09", 19);

    expect(result.vivo).toBe("");
    expect(JSON.stringify(book.total.grid)).toBe(before);
  });
});
