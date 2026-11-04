import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));

function loadCodigo() {
  const source = readFileSync(join(HERE, "Codigo.gs"), "utf8");
  const context = createContext({
    console,
    Date,
    String,
    Number,
    parseInt,
    isNaN,
    Math,
    Object,
    Array,
    Logger: { log: () => {} },
    Utilities: { formatDate: () => "" },
    MimeType: {
      GOOGLE_SHEETS: "application/vnd.google-apps.spreadsheet",
      PLAIN_TEXT: "text/plain",
    },
    SpreadsheetApp: {
      getActiveSpreadsheet() {
        return { getSheetByName() { return null; }, getId() { return ""; } };
      },
      getUi() {
        return { alert() {}, ButtonSet: { OK: "OK" }, createMenu: () => ({ addItem: () => ({ addSeparator: () => ({ addItem: () => ({ addToUi: () => {} }) }) }) }) };
      },
      flush() {},
    },
    DriveApp: {
      getFolderById() {
        return { getFilesByType() { return { hasNext: () => false, next: () => null }; } };
      },
    },
  });

  runInContext(source, context, { filename: "Codigo.gs" });

  return context as unknown as {
    clasificarTemplate: (nombre: string) => string | null;
    normalizarTerritorialEvento: (dt: string) => string;
    parsearFechaEvento: (fecha: unknown, mesHint?: number) => { mes: number; anio: number } | null;
    extraerTituloEvento: (desc: string) => string;
    generarDestacadosMes: (
      items: { dt: string; edif?: string; esp?: string; desc?: string; tit: string }[],
      instalaciones?: string[]
    ) => string;
    CONFIG_EVENTOS_EXTR: {
      hoja: string;
      mesesFilas: Record<number, number>;
      columnasDT: string[];
    };
  };
}

describe("AV Codigo.gs - Eventos Extr.", () => {
  const codigo = loadCodigo();

  describe("clasificarTemplate", () => {
    it("clasifica correctamente archivo semanal", () => {
      expect(codigo.clasificarTemplate("Templates semanales audiovisuales")).toBe("SEMANAL");
      expect(codigo.clasificarTemplate("Informe semanal AV.xlsx")).toBe("SEMANAL");
    });

    it("clasifica correctamente archivo mensual", () => {
      expect(codigo.clasificarTemplate("Audiovisuales - Resueltas mes anterior")).toBe("MENSUAL");
      expect(codigo.clasificarTemplate("Resueltas mes 2026-10")).toBe("MENSUAL");
    });

    it("clasifica correctamente archivo de eventos", () => {
      expect(codigo.clasificarTemplate("Eventos AV 2026")).toBe("EVENTOS");
      expect(codigo.clasificarTemplate("eventos e instalaciones.xlsx")).toBe("EVENTOS");
    });

    it("retorna null para nombres no reconocidos", () => {
      expect(codigo.clasificarTemplate("Backlog20261026.xlsx")).toBeNull();
    });
  });

  describe("normalizarTerritorialEvento", () => {
    it("mapea DT SUR a Sur", () => {
      expect(codigo.normalizarTerritorialEvento("DT SUR")).toBe("Sur");
      expect(codigo.normalizarTerritorialEvento("Sur")).toBe("Sur");
    });

    it("mapea DT NOROESTE a Galicia", () => {
      expect(codigo.normalizarTerritorialEvento("DT NOROESTE")).toBe("Galicia");
      expect(codigo.normalizarTerritorialEvento("Galicia")).toBe("Galicia");
    });

    it("mapea DT NORTE a Norte", () => {
      expect(codigo.normalizarTerritorialEvento("DT NORTE")).toBe("Norte");
    });

    it("mapea DT CATALUNYA a Cataluña", () => {
      expect(codigo.normalizarTerritorialEvento("DT CATALUNYA")).toBe("Cataluña");
      expect(codigo.normalizarTerritorialEvento("Cataluña")).toBe("Cataluña");
    });

    it("mapea DT CANARIAS y GC a GC", () => {
      expect(codigo.normalizarTerritorialEvento("DT CANARIAS")).toBe("GC");
      expect(codigo.normalizarTerritorialEvento("Gran Canarias")).toBe("GC");
      expect(codigo.normalizarTerritorialEvento("GC")).toBe("GC");
    });

    it("mapea DT ESTE a Este", () => {
      expect(codigo.normalizarTerritorialEvento("DT ESTE")).toBe("Este");
    });

    it("mapea DT CENTRO, HOLDING y SEDE a Centro", () => {
      expect(codigo.normalizarTerritorialEvento("DT CENTRO")).toBe("Centro");
      expect(codigo.normalizarTerritorialEvento("HOLDING")).toBe("Centro");
      expect(codigo.normalizarTerritorialEvento("Sede")).toBe("Centro");
    });
  });

  describe("parsearFechaEvento", () => {
    it("parsea fechas con día > 12 como DD/MM/YYYY", () => {
      expect(codigo.parsearFechaEvento("14/10/2026")).toEqual({ mes: 10, anio: 2026 });
      expect(codigo.parsearFechaEvento("28/09/2026")).toEqual({ mes: 9, anio: 2026 });
    });

    it("parsea fechas con mes > 12 como MM/DD/YYYY", () => {
      expect(codigo.parsearFechaEvento("09/14/2026")).toEqual({ mes: 9, anio: 2026 });
      expect(codigo.parsearFechaEvento("10/27/2026")).toEqual({ mes: 10, anio: 2026 });
    });

    it("resuelve ambigüedades usando mesActualHint", () => {
      expect(codigo.parsearFechaEvento("09/01/2026", 9)).toEqual({ mes: 9, anio: 2026 });
      expect(codigo.parsearFechaEvento("10/01/2026", 10)).toEqual({ mes: 10, anio: 2026 });
    });

    it("parsea rangos de fechas (ej. 26-29/10/2026)", () => {
      expect(codigo.parsearFechaEvento("26-29/10/2026")).toEqual({ mes: 10, anio: 2026 });
      expect(codigo.parsearFechaEvento("01-02/07/2026")).toEqual({ mes: 7, anio: 2026 });
    });

    it("acepta objetos Date directamente", () => {
      const d = new Date(2026, 9, 15);
      expect(codigo.parsearFechaEvento(d)).toEqual({ mes: 10, anio: 2026 });
    });
  });

  describe("extraerTituloEvento", () => {
    it("extrae el título limpio de comillas y saltos de línea", () => {
      const desc = ' “Plenarias BC D.T Norte” \n 70 personas aprox';
      expect(codigo.extraerTituloEvento(desc)).toBe("Plenarias BC D.T Norte");
    });
  });

  describe("generarDestacadosMes", () => {
    it("genera el formato conciso solicitado para el mes en curso con eventos destacados", () => {
      const items = [
        { dt: "Norte", edif: "Gran via 12", tit: "People with Values" },
        { dt: "Cataluña", edif: "Antoni Maura", tit: "People with Values" },
        { dt: "Galicia", edif: "Canton Pequeño", tit: "People with Values" },
        { dt: "GC", edif: "Dunas", tit: "People with Values" },
        { dt: "Sur", edif: "Palmera", tit: "People with Values" },
        { dt: "Centro", edif: "Recoletos", esp: "Recoletos. Sala Fronteras", tit: "XXI Comisión Biodiversidad Premios Fronteras" },
        { dt: "Centro", edif: "Tres Cantos", esp: "TC. Salas Multiusos", tit: "Town Hall CIB/Alfatech" },
      ];
      const resultado = codigo.generarDestacadosMes(items, []);
      expect(resultado).toContain("Destacan:");
      expect(resultado).toContain("Despliegue global People with Values en 5 territoriales");
      expect(resultado).toContain("XXI Comisión Biodiversidad (Recoletos)");
      expect(resultado).toContain("Town Hall CIB/Alfatech (Tres Cantos)");
    });

    it("añade instalaciones del mes si existen", () => {
      const items = [{ dt: "Centro", edif: "Ciudad BBVA", tit: "DemoDay" }];
      const inst = ["Extensores USB-C Crestron"];
      const res = codigo.generarDestacadosMes(items, inst);
      expect(res).toContain("Destacan: DemoDay (Ciudad BBVA).");
      expect(res).toContain("Instalaciones: Extensores USB-C Crestron.");
    });

    it("retorna mensaje amigable si el mes no tiene eventos", () => {
      expect(codigo.generarDestacadosMes([], [])).toBe("Sin eventos destacados registrados este mes.");
    });
  });

  describe("CONFIG_EVENTOS_EXTR", () => {
    it("tiene la configuración esperada de filas para los meses", () => {
      expect(codigo.CONFIG_EVENTOS_EXTR.hoja).toBe("Eventos Extr.");
      expect(codigo.CONFIG_EVENTOS_EXTR.mesesFilas[6]).toBe(8);
      expect(codigo.CONFIG_EVENTOS_EXTR.mesesFilas[7]).toBe(9);
      expect(codigo.CONFIG_EVENTOS_EXTR.mesesFilas[9]).toBe(10);
      expect(codigo.CONFIG_EVENTOS_EXTR.mesesFilas[10]).toBe(11);
      expect(codigo.CONFIG_EVENTOS_EXTR.mesesFilas[11]).toBe(12);
    });
  });
});
