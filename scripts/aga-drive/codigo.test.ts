import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));

function moduleFileNames(): string[] {
  return readdirSync(HERE)
    .filter((f) => /^\d+_.*\.gs$/.test(f))
    .sort();
}

function loadModularAga(options?: {
  overrideEnvFile?: string;
  configRows?: unknown[][];
}) {
  const configRows = options?.configRows ?? [
    ["Carpeta de Drive (ID)", ""],
    ["Fecha de extracción (lunes)", "2026-11-23"],
    ["Semana AGA (opcional)", ""],
  ];

  const configSheet = {
    getLastRow: () => configRows.length,
    getRange: (row: number, col: number, numRows: number, numCols: number) => ({
      getValues: () =>
        Array.from({ length: numRows }, (_, rIdx) => {
          const src = configRows[row - 1 + rIdx] ?? [];
          return Array.from({ length: numCols }, (_, cIdx) => src[col - 1 + cIdx] ?? "");
        }),
    }),
  };

  const context = createContext({
    console,
    Date,
    MimeType: {
      MICROSOFT_EXCEL: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      PLAIN_TEXT: "text/plain",
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: (name: string) => (name === "Configuración" ? configSheet : null),
      }),
      getUi: () => ({ alert() {}, ButtonSet: { OK: "OK" } }),
    },
  });

  for (const file of moduleFileNames()) {
    const filePath =
      file === "00_Entorno_IDs.gs" && options?.overrideEnvFile
        ? options.overrideEnvFile
        : join(HERE, file);
    runInContext(readFileSync(filePath, "utf8"), context, { filename: file });
  }

  return context as {
    ENTORNO_AGA: {
      NOMBRE: string;
      ID_CARPETA_BRUTO: string;
      ID_CARPETA_SALIDA_PLANO: string;
      ID_HOJA_INFORME: string;
      NOMBRE_CARPETA_HISTORICO_TXT: string;
    };
    onOpen: () => void;
    inicializarHoja: () => void;
    ponerLunesActual: () => void;
    lunesActualIso: () => string;
    formatearAvisoEdificios: (unknown: Record<string, number>) => string;
    procesarSemana: () => void;
    guardarPlanoTxt: () => void;
    readConfig: () => { folder: string; extraction: string; week: number | null };
    obtenerIdCarpetaBrutoAga: () => string;
    obtenerIdCarpetaSalidaAga: (fallbackFolderId?: string) => string;
    obtenerNombreCarpetaHistoricoAga: () => string;
  };
}

describe("scripts/aga-drive modular (00_–05_)", () => {
  it("contiene los seis bloques 00_ a 05_ y expone los puntos de entrada", () => {
    expect(moduleFileNames()).toEqual([
      "00_Entorno_IDs.gs",
      "01_Config_y_Menu.gs",
      "02_Lectura_Drive_y_Mapas.gs",
      "03_Agregacion_y_Fuentes.gs",
      "04_Procesar_Semana_y_PLANO.gs",
      "05_Inicializacion.gs",
    ]);

    const gs = loadModularAga();

    expect(gs.ENTORNO_AGA.NOMBRE).toBe("PERSONAL");
    expect(gs.obtenerIdCarpetaBrutoAga()).toBe("1D4AmMBILXmjuYaD2ngDg413pJfYoHgEP");
    expect(gs.obtenerIdCarpetaSalidaAga()).toBe("1D4AmMBILXmjuYaD2ngDg413pJfYoHgEP");
    expect(gs.obtenerNombreCarpetaHistoricoAga()).toBe("histórico AGA - txt");
    expect(typeof gs.onOpen).toBe("function");
    expect(typeof gs.inicializarHoja).toBe("function");
    expect(typeof gs.ponerLunesActual).toBe("function");
    expect(gs.lunesActualIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof gs.procesarSemana).toBe("function");
    expect(typeof gs.guardarPlanoTxt).toBe("function");
    expect(gs.readConfig()).toEqual({
      folder: "1D4AmMBILXmjuYaD2ngDg413pJfYoHgEP",
      extraction: "2026-11-23",
      week: null,
    });
    expect(gs.formatearAvisoEdificios({})).toBe("");
    const aviso = gs.formatearAvisoEdificios({
      "EDIFICIO NUEVO A": 2,
      "EDIFICIO NUEVO B": 1,
    });
    expect(aviso).toContain("EDIFICIO NUEVO A (2 posiciones)");
    expect(aviso).toContain("EDIFICIO NUEVO B (1 posición)");
    expect(aviso).toContain("Mapa edificios");
    expect(aviso).toContain("Comprobación");
    expect(aviso).toContain("Procesar semana");
  });

  it("permite sustituir solo 00_Entorno_IDs.gs por trabajo/00_Entorno_IDs.gs sin errores", () => {
    const gsTrabajo = loadModularAga({
      overrideEnvFile: join(HERE, "trabajo", "00_Entorno_IDs.gs"),
    });

    expect(gsTrabajo.ENTORNO_AGA.NOMBRE).toBe("TRABAJO");
    expect(gsTrabajo.obtenerIdCarpetaBrutoAga()).toBe("1gqUPPVsPOE1xy3aJB2dSwNWD3WnDxK8a");
    expect(gsTrabajo.obtenerIdCarpetaSalidaAga()).toBe("1gqUPPVsPOE1xy3aJB2dSwNWD3WnDxK8a");
    expect(gsTrabajo.obtenerNombreCarpetaHistoricoAga()).toBe("histórico AGA - txt");
    expect(gsTrabajo.readConfig().folder).toBe("1gqUPPVsPOE1xy3aJB2dSwNWD3WnDxK8a");
  });
});
