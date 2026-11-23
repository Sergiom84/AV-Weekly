import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { parseAvTexto } from "../../server/parseAvTexto.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

class MockRange {
  private sheet: MockSheet;
  private r1: number;
  private c1: number;
  private numRows: number;
  private numCols: number;

  constructor(sheet: MockSheet, r1: number, c1: number, numRows: number, numCols: number) {
    this.sheet = sheet;
    this.r1 = r1;
    this.c1 = c1;
    this.numRows = numRows;
    this.numCols = numCols;
  }

  getValues(): unknown[][] {
    const out: unknown[][] = [];
    for (let r = 0; r < this.numRows; r++) {
      const row: unknown[] = [];
      for (let c = 0; c < this.numCols; c++) {
        row.push(this.sheet.getCell(this.r1 + r, this.c1 + c));
      }
      out.push(row);
    }
    return out;
  }

  getValue(): unknown {
    return this.sheet.getCell(this.r1, this.c1);
  }

  setValues(values: unknown[][]): this {
    for (let r = 0; r < values.length; r++) {
      for (let c = 0; c < values[r].length; c++) {
        this.sheet.setCell(this.r1 + r, this.c1 + c, values[r][c]);
      }
    }
    return this;
  }

  setValue(value: unknown): this {
    this.sheet.setCell(this.r1, this.c1, value);
    return this;
  }

  clearContent(): this {
    for (let r = 0; r < this.numRows; r++) {
      for (let c = 0; c < this.numCols; c++) {
        this.sheet.setCell(this.r1 + r, this.c1 + c, "");
      }
    }
    return this;
  }

  setFontWeight(): this {
    return this;
  }

  private applyStyle(key: string, val: unknown): this {
    for (let r = 0; r < this.numRows; r++) {
      for (let c = 0; c < this.numCols; c++) {
        this.sheet.setStyle(this.r1 + r, this.c1 + c, key, val);
      }
    }
    return this;
  }

  setFontFamily(font: string): this {
    return this.applyStyle("fontFamily", font);
  }

  setFontSize(size: number): this {
    return this.applyStyle("fontSize", size);
  }

  setFontColor(color: string): this {
    return this.applyStyle("fontColor", color);
  }

  setHorizontalAlignment(align: string): this {
    return this.applyStyle("horizontalAlignment", align);
  }
}

class MockSheet {
  private name: string;
  private grid: unknown[][];
  private styles = new Map<string, Record<string, unknown>>();

  constructor(name: string, initialGrid: unknown[][] = []) {
    this.name = name;
    this.grid = initialGrid.map((row) => [...row]);
  }

  setStyle(row1: number, col1: number, key: string, val: unknown): void {
    const k = `${row1}:${col1}`;
    const prev = this.styles.get(k) ?? {};
    prev[key] = val;
    this.styles.set(k, prev);
  }

  getStyle(row1: number, col1: number): Record<string, unknown> {
    return this.styles.get(`${row1}:${col1}`) ?? {};
  }

  getName(): string {
    return this.name;
  }

  getCell(row1: number, col1: number): unknown {
    const r = this.grid[row1 - 1];
    if (!r) return "";
    const v = r[col1 - 1];
    return v === undefined ? "" : v;
  }

  setCell(row1: number, col1: number, value: unknown): void {
    while (this.grid.length < row1) this.grid.push([]);
    const row = this.grid[row1 - 1];
    while (row.length < col1) row.push("");
    row[col1 - 1] = value;
  }

  getLastRow(): number {
    for (let r = this.grid.length - 1; r >= 0; r--) {
      if (this.grid[r].some((v) => v !== "" && v !== undefined && v !== null)) {
        return r + 1;
      }
    }
    return 0;
  }

  getLastColumn(): number {
    let max = 0;
    for (const row of this.grid) {
      for (let c = row.length - 1; c >= 0; c--) {
        if (row[c] !== "" && row[c] !== undefined && row[c] !== null) {
          max = Math.max(max, c + 1);
          break;
        }
      }
    }
    return max;
  }

  getDataRange(): MockRange {
    const r = Math.max(1, this.getLastRow());
    const c = Math.max(1, this.getLastColumn());
    return new MockRange(this, 1, 1, r, c);
  }

  clearContents(): this {
    this.grid = [];
    return this;
  }

  getRange(a1OrRow: string | number, col?: number, numRows?: number, numCols?: number): MockRange {
    if (typeof a1OrRow === "number") {
      return new MockRange(this, a1OrRow, col ?? 1, numRows ?? 1, numCols ?? 1);
    }
    const [startStr, endStr] = a1OrRow.split(":");
    const parseCell = (ref: string) => {
      const m = ref.match(/^([A-Z]+)(\d+)$/i);
      if (!m) throw new Error(`Invalid A1 ref: ${ref}`);
      let cIdx = 0;
      for (const ch of m[1].toUpperCase()) cIdx = cIdx * 26 + (ch.charCodeAt(0) - 64);
      return { r: Number(m[2]), c: cIdx };
    };
    const start = parseCell(startStr);
    const end = endStr ? parseCell(endStr) : start;
    return new MockRange(this, start.r, start.c, end.r - start.r + 1, end.c - start.c + 1);
  }
}

class MockSpreadsheet {
  private id: string;
  private sheets: MockSheet[];
  private tz: string;

  constructor(id: string, sheets: MockSheet[], tz = "Europe/Madrid") {
    this.id = id;
    this.sheets = sheets;
    this.tz = tz;
  }

  getId(): string {
    return this.id;
  }

  getSpreadsheetTimeZone(): string {
    return this.tz;
  }

  getSheets(): MockSheet[] {
    return this.sheets;
  }

  getSheetByName(name: string): MockSheet | null {
    return this.sheets.find((s) => s.getName() === name) ?? null;
  }

  insertSheet(name: string): MockSheet {
    const sheet = new MockSheet(name);
    this.sheets.push(sheet);
    return sheet;
  }
}

interface MockFileEntry {
  id: string;
  name: string;
  mimeType: string;
  lastUpdated: Date;
  content?: string;
}

interface MockFolderNode {
  id: string;
  name: string;
  files: MockFileEntry[];
  subfolders: MockFolderNode[];
}

function makeIterator<T>(items: T[]) {
  let idx = 0;
  return {
    hasNext: () => idx < items.length,
    next: () => items[idx++],
  };
}

function loadModularScripts(options?: {
  overrideEnvFile?: string;
  activeSpreadsheet?: MockSpreadsheet | null;
  spreadsheetsById?: Record<string, MockSpreadsheet>;
  foldersById?: Record<string, MockFolderNode>;
  alerts?: { title: string; msg: string }[];
  menuItems?: { label: string; fn: string }[];
  alertChoice?: string;
}) {
  const gsFiles = readdirSync(HERE)
    .filter((f) => /^\d+_.*\.gs$/.test(f))
    .sort();

  const folders = options?.foldersById ?? {};
  const spreadsheets = options?.spreadsheetsById ?? {};
  const alerts = options?.alerts ?? [];
  let createdFileIdSeq = 1;

  const wrapFile = (file: MockFileEntry, parentFolder?: MockFolderNode) => ({
    getId: () => file.id,
    getName: () => file.name,
    setName: (n: string) => {
      file.name = n;
    },
    getMimeType: () => file.mimeType,
    getLastUpdated: () => file.lastUpdated,
    getBlob: () => ({ getDataAsString: () => file.content ?? "" }),
    moveTo: (destFolder: { _raw: MockFolderNode }) => {
      if (parentFolder) {
        parentFolder.files = parentFolder.files.filter((f) => f.id !== file.id);
      }
      destFolder._raw.files.push(file);
    },
  });

  const wrapFolder = (folder: MockFolderNode) => ({
    _raw: folder,
    getId: () => folder.id,
    getName: () => folder.name,
    getFolders: () => makeIterator(folder.subfolders.map((s) => wrapFolder(s))),
    createFolder: (name: string) => {
      const sub: MockFolderNode = {
        id: `folder_${createdFileIdSeq++}`,
        name,
        files: [],
        subfolders: [],
      };
      folder.subfolders.push(sub);
      folders[sub.id] = sub;
      return wrapFolder(sub);
    },
    getFiles: () => makeIterator(folder.files.map((f) => wrapFile(f, folder))),
    getFilesByType: (mime: string) =>
      makeIterator(folder.files.filter((f) => f.mimeType === mime).map((f) => wrapFile(f, folder))),
    createFile: (name: string, content: string, mime: string) => {
      const created: MockFileEntry = {
        id: `txt_${createdFileIdSeq++}`,
        name,
        mimeType: mime,
        lastUpdated: new Date(),
        content,
      };
      folder.files.push(created);
      return wrapFile(created, folder);
    },
  });

  const uiMock = {
    ButtonSet: { OK: "OK", YES_NO: "YES_NO" },
    Button: { YES: "YES", NO: "NO" },
    alert(title: string, msg?: string) {
      alerts.push({ title, msg: msg ?? "" });
      return options?.alertChoice ?? "YES";
    },
    showModalDialog() {},
    createMenu() {
      const menuApi = {
        addItem: (label: string, fn: string) => {
          options?.menuItems?.push({ label, fn });
          return menuApi;
        },
        addSeparator: () => menuApi,
        addToUi: () => {},
      };
      return menuApi;
    },
  };

  const context = createContext({
    console,
    Date,
    String,
    Number,
    Boolean,
    Set,
    parseInt,
    isNaN,
    Math,
    Object,
    Array,
    Logger: { log: () => {} },
    Session: { getScriptTimeZone: () => "Europe/Madrid" },
    Utilities: {
      formatDate: (d: Date, _tz: string, fmt: string) => {
        const pad = (n: number) => String(n).padStart(2, "0");
        if (fmt === "yyyy-MM-dd") {
          return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        }
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}`;
      },
    },
    MimeType: {
      GOOGLE_SHEETS: "application/vnd.google-apps.spreadsheet",
      MICROSOFT_EXCEL: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      PLAIN_TEXT: "text/plain",
    },
    HtmlService: {
      createHtmlOutput: (html: string) => ({
        _html: html,
        setWidth() { return this; },
        setHeight() { return this; },
      }),
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () =>
        options && "activeSpreadsheet" in options
          ? options.activeSpreadsheet
          : new MockSpreadsheet("default", []),
      openById: (id: string) => {
        const found = spreadsheets[id];
        if (!found) throw new Error(`Spreadsheet not found in mock: ${id}`);
        return found;
      },
      getUi: () => uiMock,
      flush: () => {},
    },
    DriveApp: {
      getFolderById: (id: string) => {
        const found = folders[id];
        if (!found) {
          return wrapFolder({ id, name: id, files: [], subfolders: [] });
        }
        return wrapFolder(found);
      },
    },
  });

  for (const file of gsFiles) {
    const filePath =
      file === "00_Entorno_IDs.gs" && options?.overrideEnvFile
        ? options.overrideEnvFile
        : join(HERE, file);
    runInContext(readFileSync(filePath, "utf8"), context, { filename: file });
  }

  return context as Record<string, any>;
}

describe("AV modular Apps Script (00..07 .gs)", () => {
  const codigo = loadModularScripts();

  describe("00_Entorno_IDs.gs — aislamiento de entornos", () => {
    it("en entorno personal usa los IDs explícitos configurados", () => {
      expect(codigo.obtenerIdCarpetaTemplates()).toBe("1Uz7rU5hm8jUvp1nLLQyALgaiYjhCR8LW");
      expect(codigo.obtenerIdCarpetaTxt()).toBe("1KdBpANFQ2O2_PBhlTtV8LpC2-xfyhNiR");
      expect(codigo.obtenerIdCarpetaHistorico()).toBe("10beuK3so7X4lHMVuWKQ4azWJDq7My99E");
    });

    it("en entorno trabajo resuelve Bruto y crea/encuentra histórico por nombre dentro de la carpeta contenedora", () => {
      const rootWork: MockFolderNode = {
        id: "1dre4ydY0a9jnJ9Mufpj2EJFe5Cvd-o8h",
        name: "AV",
        files: [],
        subfolders: [{ id: "work-bruto-id", name: "Bruto", files: [], subfolders: [] }],
      };
      const foldersById: Record<string, MockFolderNode> = { [rootWork.id]: rootWork };
      const workCtx = loadModularScripts({
        overrideEnvFile: join(HERE, "trabajo", "00_Entorno_IDs.gs"),
        foldersById,
      });

      expect(workCtx.obtenerIdCarpetaTemplates()).toBe("work-bruto-id");
      expect(workCtx.obtenerIdCarpetaTxt()).toBe("1dre4ydY0a9jnJ9Mufpj2EJFe5Cvd-o8h");
      const histId = workCtx.obtenerIdCarpetaHistorico();
      expect(histId).toBeTruthy();
      expect(rootWork.subfolders.some((s) => s.name === "histórico AV - txt" && s.id === histId)).toBe(true);
    });
  });

  describe("clasificarTemplate y buscarTemplateEventos", () => {
    it("clasifica correctamente semanal, mensual y eventos", () => {
      expect(codigo.clasificarTemplate("Templates semanales audiovisuales")).toBe("SEMANAL");
      expect(codigo.clasificarTemplate("Informe semanal AV.xlsx")).toBe("SEMANAL");
      expect(codigo.clasificarTemplate("Audiovisuales - Resueltas mes anterior")).toBe("MENSUAL");
      expect(codigo.clasificarTemplate("Resueltas mes 2026-10")).toBe("MENSUAL");
      expect(codigo.clasificarTemplate("Eventos AV 2026")).toBe("EVENTOS");
      expect(codigo.clasificarTemplate("Backlog20261026.xlsx")).toBeNull();
    });

    it("buscarTemplateEventos devuelve el template EVENTOS más reciente", () => {
      const bruto: MockFolderNode = {
        id: "1Uz7rU5hm8jUvp1nLLQyALgaiYjhCR8LW",
        name: "Bruto",
        subfolders: [],
        files: [
          { id: "ev1", name: "Eventos AV antiguo", mimeType: "application/vnd.google-apps.spreadsheet", lastUpdated: new Date(2026, 9, 1) },
          { id: "ev2", name: "Eventos AV 2026", mimeType: "application/vnd.google-apps.spreadsheet", lastUpdated: new Date(2026, 10, 18) },
        ],
      };
      const ctx = loadModularScripts({ foldersById: { [bruto.id]: bruto } });
      expect(ctx.buscarTemplateEventos().getId()).toBe("ev2");
    });
  });

  describe("Eventos Extr. — normalización, fechas, separadores y destacados", () => {
    it("normaliza las 7 territoriales", () => {
      expect(codigo.normalizarTerritorialEvento("DT SUR")).toBe("Sur");
      expect(codigo.normalizarTerritorialEvento("DT NOROESTE")).toBe("Galicia");
      expect(codigo.normalizarTerritorialEvento("DT NORTE")).toBe("Norte");
      expect(codigo.normalizarTerritorialEvento("DT CATALUNYA")).toBe("Cataluña");
      expect(codigo.normalizarTerritorialEvento("DT CANARIAS")).toBe("GC");
      expect(codigo.normalizarTerritorialEvento("DT ESTE")).toBe("Este");
      expect(codigo.normalizarTerritorialEvento("HOLDING")).toBe("Centro");
    });

    it("parsea fechas DD/MM, MM/DD, rangos y Date", () => {
      expect(codigo.parsearFechaEvento("14/10/2026")).toEqual({ mes: 10, anio: 2026 });
      expect(codigo.parsearFechaEvento("09/14/2026")).toEqual({ mes: 9, anio: 2026 });
      expect(codigo.parsearFechaEvento("11/04/2026", 11)).toEqual({ mes: 11, anio: 2026 });
      expect(codigo.parsearFechaEvento("26-29/10/2026")).toEqual({ mes: 10, anio: 2026 });
      expect(codigo.parsearFechaEvento(new Date(2026, 9, 15))).toEqual({ mes: 10, anio: 2026 });
    });

    it("ignora filas separadoras de mes y soporta Diciembre sin pisar Total", () => {
      const eventosSheet = new MockSheet("2026", [
        ["", "", "", "", "", 2026],
        ["Fecha", "DT", "Edificio", "Espacio", "", "", "", "", "", "Descripción"],
        ["Junio", "", "", "", "", "", "", "", "", ""], // separador sin evento
        ["10/06/2026", "DT NORTE", "Gran via 12", "Tapices", "", "", "", "", "", "Evento Junio"],
        ["Julio", "", "", "", "", "", "", "", "", ""], // separador sin evento
        ["12/07/2026", "DT SUR", "Palmera", "Sala 1", "", "", "", "", "", "Evento Julio"],
        ["Diciembre", "", "", "", "", "", "", "", "", ""],
        ["02/12/2026", "DT CENTRO", "Recoletos", "Sala 13", "", "", "", "", "", "Town Hall Diciembre"],
      ]);
      const eventosExtrDestino = new MockSheet("Eventos Extr.", [
        [],
        ["Mes", "Galicia", "Norte", "Cataluña", "Este", "Sur", "GC", "Centro", "Total"],
        ["Enero"], ["Febrero"], ["Marzo"], ["Abril"], ["Mayo"],
        ["Junio"], ["Julio"], ["Septiembre"], ["Octubre"], ["Noviembre"],
        ["Diciembre"],
        ["Total", 0, 0, 0, 0, 0, 0, 0, 0],
      ]);
      const destinoSs = new MockSpreadsheet("dest", [eventosExtrDestino]);
      const evSs = new MockSpreadsheet("ev-ss", [eventosSheet]);
      const ctx = loadModularScripts({
        activeSpreadsheet: destinoSs,
        spreadsheetsById: { "ev-ss": evSs },
      });

      const res = ctx.ejecutarSincronizacionEventosExtr(destinoSs, { getId: () => "ev-ss", getName: () => "Eventos AV 2026" }, 12);
      expect(res.totalEventos).toBe(3);
      expect(eventosExtrDestino.getCell(8, 3)).toBe(1); // Junio Norte = 1 (sin contar separador Julio)
      expect(eventosExtrDestino.getCell(9, 6)).toBe(1); // Julio Sur = 1
      expect(eventosExtrDestino.getCell(13, 8)).toBe(1); // Diciembre Centro = 1
      expect(eventosExtrDestino.getCell(14, 1)).toBe("Total"); // Total intacto en fila 14
      expect(String(eventosExtrDestino.getCell(16, 1))).toContain("Town Hall Diciembre (Recoletos)");
    });

    it("genera el formato conciso de destacados", () => {
      const items = [
        { dt: "Norte", edif: "Gran via 12", tit: "People with Values" },
        { dt: "Cataluña", edif: "Antoni Maura", tit: "People with Values" },
        { dt: "Galicia", edif: "Canton Pequeño", tit: "People with Values" },
        { dt: "GC", edif: "Dunas", tit: "People with Values" },
        { dt: "Sur", edif: "Palmera", tit: "People with Values" },
        { dt: "Centro", edif: "Recoletos", esp: "Recoletos. Sala Fronteras", tit: "XXI Comisión Biodiversidad Premios Fronteras" },
        { dt: "Centro", edif: "Tres Cantos", esp: "TC. Salas Multiusos", tit: "Town Hall CIB/Alfatech" },
      ];
      const resultado = codigo.generarDestacadosMes(items, ["Extensores USB-C Crestron"]);
      expect(resultado).toContain("Despliegue global People with Values en 5 territoriales");
      expect(resultado).toContain("XXI Comisión Biodiversidad (Recoletos)");
      expect(resultado).toContain("Instalaciones: Extensores USB-C Crestron.");
    });
  });

  describe("Importación multi-template, [COMPARATIVA] completo y TXT válido", () => {
    function buildTendenciasBase(): MockSpreadsheet {
      const remotos = new MockSheet("Remotos");
      remotos.setCell(5, 1, 2026);
      remotos.setCell(5, 46, 45); // col 46 = S45 (col = semana + 1)
      remotos.setCell(6, 46, 48);
      remotos.setCell(9, 46, 42);
      remotos.setCell(12, 46, 45);
      remotos.setCell(13, 1, "ERRORES");
      remotos.setCell(14, 1, "CONEXION");
      remotos.setCell(15, 1, "OPERATIVA");
      remotos.setCell(13, 46, 17);
      remotos.setCell(14, 46, 10);
      remotos.setCell(15, 46, 21);
      // 2025 en col A (idx 0)
      remotos.setCell(8, 1, 2025);
      remotos.setCell(8, 2, 1);
      remotos.setCell(9, 2, 7);
      // Mensual 2026 Oct (fila 30, col B) y 2025 (col X)
      remotos.setCell(30, 2, 196);
      remotos.setCell(30, 24, 216);

      const makeTab = (
        name: string,
        fSem1: number,
        fSem2: number,
        f2025: number,
        locLabels: Record<number, string>,
        locRow45: Record<number, number>,
        mensualRow: number,
        resSample: { row: number; tier2: string; tier3: string; val: number }[]
      ) => {
        const sh = new MockSheet(name);
        // S45 ya cargada con ubicaciones (col 48 = 45 + 3), pero SIN detalle de resolucion
        sh.setCell(fSem1, 48, 45);
        const total45 = Object.values(locRow45).reduce((s, n) => s + n, 0);
        sh.setCell(fSem1 + 1, 48, total45);
        sh.setCell(fSem2, 48, 45);
        for (const [r, label] of Object.entries(locLabels)) sh.setCell(Number(r), 3, label);
        for (const [r, val] of Object.entries(locRow45)) sh.setCell(Number(r), 48, val);
        // 2025 en col C (col 3, idx 2) -> fallo historico en Codigo.gs
        sh.setCell(f2025, 3, 2025);
        sh.setCell(f2025, 4, 1);
        sh.setCell(f2025 + 1, 4, 12);
        sh.setCell(f2025, 48, 45);
        sh.setCell(f2025 + 1, 48, 40);
        resSample.forEach((item) => {
          sh.setCell(item.row, 2, item.tier2);
          sh.setCell(item.row, 3, item.tier3);
        });
        sh.setCell(mensualRow, 2, 100);
        sh.setCell(mensualRow, 17, 90);
        sh.setCell(mensualRow, 16, 90);
        return sh;
      };

      const programados = makeTab(
        "Programados", 19, 26, 22,
        { 27: "CIUDAD", 28: "CAMPUS" }, { 27: 50, 28: 20 }, 45,
        [{ row: 5, tier2: "SALA", tier3: "PREPARACION SALA", val: 40 }, { row: 7, tier2: "WEBEX", tier3: "CONEXION", val: 30 }]
      );
      const presenciales = makeTab(
        "Presenciales", 21, 28, 24,
        { 30: "CIUDAD" }, { 30: 18 }, 46,
        [{ row: 7, tier2: "SALA", tier3: "DES/MONTAJE", val: 18 }]
      );
      // Columnas de medias anuales al final de la hoja (col 57/58 = BF/BG)
      presenciales.setCell(28, 57, 2025);
      presenciales.setCell(28, 58, 2026);
      presenciales.setCell(30, 57, 21.63);
      presenciales.setCell(30, 58, 12.14);
      const incidencias = makeTab(
        "Incidencias", 41, 48, 44,
        { 49: "CIUDAD" }, { 49: 15 }, 67,
        [{ row: 11, tier2: "CABLEADO", tier3: "TOTAL", val: 15 }]
      );
      const correctivos = makeTab(
        "Correctivos", 37, 44, 40,
        { 45: "CIUDAD" }, { 45: 12 }, 63,
        [{ row: 16, tier2: "EQUIPO AUDIO", tier3: "TOTAL", val: 12 }]
      );
      const eventosExtr = new MockSheet("Eventos Extr.", [
        [],
        ["Mes", "Galicia", "Norte", "Cataluña", "Este", "Sur", "GC", "Centro", "Total"],
        ["Octubre", 1, 4, 4, 0, 3, 2, 6, 20],
        ["Total", 1, 4, 4, 0, 3, 2, 6, 20],
      ]);
      eventosExtr.setCell(16, 1, "Destacan: Town Hall (Tres Cantos).");

      return new MockSpreadsheet("tendencias-id", [
        remotos, programados, presenciales, incidencias, correctivos, eventosExtr,
      ]);
    }

    function buildWeeklyTemplate(maxWeek: number): MockSpreadsheet {
      const headerWeeks = ["", "Semana"];
      for (let w = 1; w <= maxWeek; w++) headerWeeks.push(String(w));
      headerWeeks.push("Total");

      const rem = new MockSheet("1-Soporte Remoto por semanas - ", [
        headerWeeks,
        ["Categorization Tier 2"],
        ["ERRORES", "", ...Array.from({ length: maxWeek }, (_, i) => (i + 1 === maxWeek ? 13 : 17)), 100],
        ["OPERATIVA", "", ...Array.from({ length: maxWeek }, (_, i) => (i + 1 === maxWeek ? 26 : 21)), 100],
        ["CONEXION", "", ...Array.from({ length: maxWeek }, (_, i) => (i + 1 === maxWeek ? 5 : 10)), 100],
      ]);

      const makeLocSheet = (name: string, locs: [string, number][]) => {
        const rows: unknown[][] = [headerWeeks, []];
        locs.forEach(([label, val]) => {
          rows.push([label, "", ...Array.from({ length: maxWeek }, (_, i) => (i + 1 === maxWeek ? val : 999)), val]);
        });
        return new MockSheet(name, rows);
      };

      const prog = makeLocSheet("2-Soporte Programado por semana", [["CIUDAD", 40], ["CAMPUS", 33]]);
      const pres = makeLocSheet("3-Soporte Presencial por semana", [["CIUDAD", 22]]);
      const inc = makeLocSheet("4-Incidencias por semanas - año", [["CIUDAD", 19]]);
      const corr = makeLocSheet("6-Mantenimientos correctivos po", [["CIUDAD", 14]]);

      // Detalles (corresponden a maxWeek en su archivo)
      const progDet = new MockSheet("7-Soporte Programado - Detalle ", [
        ["Resolution Category", "Tier 2", "Tier 3", "Total"],
        ["V02", "SALA", "PREPARACION SALA", maxWeek === 45 ? 40 : 43],
        ["", "WEBEX", "CONEXION", 30],
        ["Total", "", "", maxWeek === 45 ? 70 : 73],
      ]);
      const presDet = new MockSheet("8-Soporte Presencial - Detalle ", [
        ["Resolution Category", "Tier 2", "Tier 3", "Total"],
        ["V03", "SALAS", "DES/MONTAJE", maxWeek === 45 ? 18 : 22],
        ["Total", "", "", maxWeek === 45 ? 18 : 22],
      ]);
      const incDet = new MockSheet("9-Incidencias - Detalle semana ", [
        ["Resolution Category", "Tier 2", "Tier 3", "Total"],
        ["V01", "CABLEADO", "SANEADO", maxWeek === 45 ? 15 : 19],
        ["Total", "", "", maxWeek === 45 ? 15 : 19],
      ]);
      const corrDet = new MockSheet("10-Mantenimientos correctivos -", [
        ["Resolution Category", "Tier 2", "Tier 3", "Total"],
        ["V04", "EQUIPO AUDIO", "CONFIGURACION", maxWeek === 45 ? 12 : 14],
        ["Total", "", "", maxWeek === 45 ? 12 : 14],
      ]);

      return new MockSpreadsheet(`tpl-${maxWeek}`, [rem, prog, pres, inc, corr, progDet, presDet, incDet, corrDet]);
    }

    it("completa S45 sin pisar sus ubicaciones, importa S46 y emite [COMPARATIVA] para los 5 tipos y [EVENTOS_EXTR]", () => {
      const destinoSs = buildTendenciasBase();
      const tpl45 = buildWeeklyTemplate(45);
      const tpl46 = buildWeeklyTemplate(46);

      const bruto: MockFolderNode = {
        id: "1Uz7rU5hm8jUvp1nLLQyALgaiYjhCR8LW",
        name: "Bruto",
        subfolders: [],
        files: [
          { id: "tpl-45", name: "Templates semanales audiovisuales (1)_semana45", mimeType: "application/vnd.google-apps.spreadsheet", lastUpdated: new Date(2026, 10, 10) },
          { id: "tpl-46", name: "Templates semanales audiovisuales", mimeType: "application/vnd.google-apps.spreadsheet", lastUpdated: new Date(2026, 10, 17) },
        ],
      };
      const avFolder: MockFolderNode = {
        id: "1KdBpANFQ2O2_PBhlTtV8LpC2-xfyhNiR",
        name: "AV",
        subfolders: [],
        files: [],
      };
      const histFolder: MockFolderNode = {
        id: "10beuK3so7X4lHMVuWKQ4azWJDq7My99E",
        name: "histórico AV - txt",
        subfolders: [],
        files: [],
      };
      const alerts: { title: string; msg: string }[] = [];

      const ctx = loadModularScripts({
        activeSpreadsheet: destinoSs,
        spreadsheetsById: { "tpl-45": tpl45, "tpl-46": tpl46 },
        foldersById: { [bruto.id]: bruto, [avFolder.id]: avFolder, [histFolder.id]: histFolder },
        alerts,
      });

      ctx.importarDatosSemanales();

      // S45 mantenia CIUDAD=50, CAMPUS=20 (no se piso con 999 del mock) y recibio su detalle 40 + 30
      const progSheet = destinoSs.getSheetByName("Programados")!;
      expect(progSheet.getCell(27, 48)).toBe(50);
      expect(progSheet.getCell(28, 48)).toBe(20);
      expect(progSheet.getCell(5, 48)).toBe(40);
      expect(progSheet.getCell(7, 48)).toBe(30);

      // S46 importada completa
      expect(progSheet.getCell(27, 49)).toBe(40);
      expect(progSheet.getCell(28, 49)).toBe(33);
      expect(progSheet.getCell(5, 49)).toBe(43);

      // Formato de encabezados (Arial 12 blanco centrado) y datos (Calibri 11 negro centrado) en las 5 pestanas
      const remSheet = destinoSs.getSheetByName("Remotos")!;
      const presSheet = destinoSs.getSheetByName("Presenciales")!;
      const incSheet = destinoSs.getSheetByName("Incidencias")!;
      const corrSheet = destinoSs.getSheetByName("Correctivos")!;
      const headerExpect = { fontFamily: "Arial", fontSize: 12, fontColor: "#ffffff", horizontalAlignment: "center" };
      const dataExpect = { fontFamily: "Calibri", fontSize: 11, fontColor: "#000000", horizontalAlignment: "center" };

      expect(remSheet.getStyle(5, 47)).toEqual(headerExpect);
      expect(remSheet.getStyle(12, 47)).toEqual(headerExpect);
      expect(remSheet.getStyle(6, 47)).toEqual(dataExpect);
      expect(remSheet.getStyle(13, 47)).toEqual(dataExpect);
      expect(progSheet.getStyle(19, 49)).toEqual(headerExpect);
      expect(progSheet.getStyle(26, 49)).toEqual(headerExpect);
      expect(progSheet.getStyle(27, 49)).toEqual(dataExpect);
      expect(progSheet.getStyle(5, 49)).toEqual(dataExpect);
      expect(presSheet.getStyle(21, 49)).toEqual(headerExpect);
      expect(presSheet.getStyle(30, 49)).toEqual(dataExpect);
      expect(incSheet.getStyle(41, 49)).toEqual(headerExpect);
      expect(incSheet.getStyle(11, 49)).toEqual(dataExpect);
      // Fila separadora 9 en Incidencias no se toca
      expect(incSheet.getStyle(9, 49)).toEqual({});
      expect(corrSheet.getStyle(37, 49)).toEqual(headerExpect);
      expect(corrSheet.getStyle(16, 49)).toEqual(dataExpect);
      expect(corrSheet.getStyle(8, 49)).toEqual({});

      // Alerta final sin el bug "Semana semana({..."
      const finalAlert = alerts[alerts.length - 1]?.msg ?? "";
      expect(finalAlert).toContain("TXT: AV 2026-S46.txt");
      expect(finalAlert).not.toContain("Semana semana(");

      // El TXT generado en carpeta contiene comparativas de los 5 tipos y EVENTOS_EXTR, y parseAvTexto lo acepta
      const txtEntry = avFolder.files.find((f) => f.name === "AV 2026-S46.txt");
      expect(txtEntry?.content).toBeTruthy();
      const parsed = parseAvTexto(txtEntry!.content!);
      expect(parsed.weekly.maxWeek).toBe(46);
      expect(parsed.resolutions.Programados["45"]?.reduce((s, r) => s + r.total, 0)).toBe(70);
      expect(parsed.resolutions.Programados["46"]?.reduce((s, r) => s + r.total, 0)).toBe(73);
      expect(parsed.comparisons.Remotos[0]?.totalsByWeek["1"]).toBe(7);
      expect(parsed.comparisons.Programados[0]?.totalsByWeek["1"]).toBe(12);
      expect(parsed.comparisons.Presenciales[0]?.totalsByWeek["1"]).toBe(12);
      expect(parsed.comparisons.Incidencias[0]?.totalsByWeek["1"]).toBe(12);
      expect(parsed.comparisons.Correctivos[0]?.totalsByWeek["1"]).toBe(12);
      expect(parsed.monthly.territoriales?.resumen).toContain("Town Hall");
    });

    it("el menú usa los nuevos títulos y omite Guardar PLANO y Actualizar Looker", () => {
      const menuItems: { label: string; fn: string }[] = [];
      const ctx = loadModularScripts({ menuItems });
      ctx.onOpen();
      const labels = menuItems.map((m) => m.label);
      expect(labels).toContain("Procesar semana");
      expect(labels).toContain("Procesar mes");
      expect(labels).toContain("Cierre media mensual");
      expect(labels).toContain("Añadir eventos extraordinarios");
      expect(labels).not.toContain("Sincronizar resumen multianual 2026");
      expect(labels).not.toContain("Sincronizar Eventos Extraordinarios");
      expect(labels).not.toContain("Guardar PLANO como .txt en la carpeta");
      expect(labels).not.toContain("Actualizar Looker Studio");
    });

    it("Procesar semana sincroniza Eventos Extr. automáticamente al importar y cuando las semanas están al día", () => {
      const destinoSs = buildTendenciasBase();
      const tpl45 = buildWeeklyTemplate(45);
      const tpl46 = buildWeeklyTemplate(46);
      const evSheet = new MockSheet("2026", [
        ["", "", "", "", "", 2026],
        ["Fecha", "DT", "Edificio", "Espacio", "", "", "", "", "", "Descripción"],
        ["12/10/2026", "DT SUR", "Palmera", "Sala 1", "", "", "", "", "", "Town Hall Sur"],
      ]);
      const evExtrDest = destinoSs.getSheetByName("Eventos Extr.")!;
      evExtrDest.clearContents();
      evExtrDest.getRange(2, 1, 1, 9).setValues([["Mes", "Galicia", "Norte", "Cataluña", "Este", "Sur", "GC", "Centro", "Total"]]);
      ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Septiembre", "Octubre", "Noviembre"].forEach((m, idx) => {
        evExtrDest.getRange(idx + 3, 1, 1, 9).setValues([[m, 0, 0, 0, 0, 0, 0, 0, 0]]);
      });
      evExtrDest.getRange(13, 1, 1, 9).setValues([["Total", 0, 0, 0, 0, 0, 0, 0, 0]]);

      const bruto: MockFolderNode = {
        id: "1Uz7rU5hm8jUvp1nLLQyALgaiYjhCR8LW",
        name: "Bruto",
        subfolders: [],
        files: [
          { id: "tpl-45", name: "Templates semanales audiovisuales (1)_semana45", mimeType: "application/vnd.google-apps.spreadsheet", lastUpdated: new Date(2026, 10, 10) },
          { id: "tpl-46", name: "Templates semanales audiovisuales", mimeType: "application/vnd.google-apps.spreadsheet", lastUpdated: new Date(2026, 10, 17) },
          { id: "ev-2026", name: "Eventos AV 2026", mimeType: "application/vnd.google-apps.spreadsheet", lastUpdated: new Date(2026, 10, 18) },
        ],
      };
      const avFolder: MockFolderNode = { id: "1KdBpANFQ2O2_PBhlTtV8LpC2-xfyhNiR", name: "AV", subfolders: [], files: [] };
      const histFolder: MockFolderNode = { id: "10beuK3so7X4lHMVuWKQ4azWJDq7My99E", name: "histórico AV - txt", subfolders: [], files: [] };
      const alerts: { title: string; msg: string }[] = [];

      const ctx = loadModularScripts({
        activeSpreadsheet: destinoSs,
        spreadsheetsById: { "tpl-45": tpl45, "tpl-46": tpl46, "ev-2026": new MockSpreadsheet("ev-2026", [evSheet]) },
        foldersById: { [bruto.id]: bruto, [avFolder.id]: avFolder, [histFolder.id]: histFolder },
        alerts,
      });

      ctx.importarDatosSemanales();
      expect(evExtrDest.getCell(11, 6)).toBe(1); // Octubre Sur = 1
      let txtEntry = avFolder.files.find((f) => f.name === "AV 2026-S46.txt");
      expect(txtEntry?.content).toContain("Town Hall Sur");

      // Segunda ejecución sin semanas nuevas: actualiza Eventos Extr. si cambió y regenera TXT
      evSheet.getRange(4, 1, 1, 10).setValues([["15/10/2026", "DT NORTE", "Gran Via", "Sala 2", "", "", "", "", "", "Premios Biodiversidad Norte"]]);
      ctx.importarDatosSemanales();
      expect(evExtrDest.getCell(11, 3)).toBe(1); // Octubre Norte = 1
      txtEntry = avFolder.files.find((f) => f.name === "AV 2026-S46.txt");
      expect(txtEntry?.content).toContain("Premios Biodiversidad Norte");
    });

    it("todos los generadores de speeches soportan semana 52, domótica y ajustes del speech real", () => {
      const destinoSs = buildTendenciasBase();
      const prog = destinoSs.getSheetByName("Programados")!;
      prog.setCell(5, 48, 40);
      prog.setCell(7, 48, 30);
      destinoSs.getSheetByName("Presenciales")!.setCell(7, 48, 18);
      const inc = destinoSs.getSheetByName("Incidencias")!;
      inc.setCell(11, 48, 15);
      const corr = destinoSs.getSheetByName("Correctivos")!;
      corr.setCell(16, 48, 12);

      // Semana 52 en columna 55 (52 + 3) + DOMOTICA como principal en Incidencias
      prog.setCell(19, 55, 52);
      prog.setCell(20, 55, 80);
      prog.setCell(27, 55, 80);
      prog.setCell(5, 55, 80);
      prog.setCell(22, 55, 52);
      prog.setCell(23, 55, 70);
      inc.setCell(17, 2, "DOMOTICA");
      inc.setCell(17, 3, "TOTAL");
      inc.setCell(41, 55, 52);
      inc.setCell(42, 55, 19);
      inc.setCell(44, 55, 52);
      inc.setCell(45, 55, 25);
      inc.setCell(49, 55, 19);
      inc.setCell(17, 55, 19);

      const ctx = loadModularScripts({ activeSpreadsheet: destinoSs });

      const htmlSem = ctx.generarSpeechSergioSemanalHtml();
      const htmlMes = ctx.generarSpeechSergioMensualHtml();
      expect(htmlSem).toContain("Soporte remoto:");
      expect(htmlSem).toContain("sumando 80");
      expect(htmlSem).toContain("domótica");
      expect(htmlSem).not.toContain("demótica");
      expect(htmlSem).not.toContain("que en el año pasado");
      expect(htmlMes).toContain("octubre");
      expect(htmlMes).not.toContain('<p class="vacio"></p>');
      expect(htmlMes).not.toContain("que en el año pasado");

      ["Sergio", "Carlos"].forEach((dest) => {
        ["SEMANAL", "MENSUAL"].forEach((per) => {
          expect(ctx.generarInformeRemoto(per, dest)).not.toContain("[Error");
          expect(ctx.generarInformeProgramado(per, dest)).not.toContain("[Error");
          expect(ctx.generarInformePresencial(per, dest)).not.toContain("[Error");
          expect(ctx.generarInformeIncidencias(per, dest)).not.toContain("[Error");
          expect(ctx.generarInformeCorrectivos(per, dest)).not.toContain("[Error");
        });
      });
    });
  });
});
