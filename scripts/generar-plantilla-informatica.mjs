/**
 * Generates the empty template of the flat workbook for the Informatica report.
 *
 * The report needs six raw dumps today and still only covers 7 of its 17 pages.
 * This template replaces them with a single workbook in long format: one sheet
 * per concept, one row per combination of dimensions plus a measure column, and
 * no personal data at all. The pivoting (building x type, month x year) belongs
 * to the renderer, exactly like "Tendencias AV (plano)".
 *
 * The sample rows are invented: no real name, address, email or phone number is
 * used anywhere in the file.
 *
 *   node scripts/generar-plantilla-informatica.mjs [salida.xlsx]
 */

import { createRequire } from "node:module";
import path from "node:path";

// The xlsx build ships as CommonJS, so it is loaded through require.
const XLSX = createRequire(import.meta.url)("xlsx");

const DEFAULT_OUTPUT = path.join(
  "Documentación",
  "Informática",
  "Informatica (plano).xlsx"
);

const DATE_FORMAT = "dd/mm/yyyy";
const MIN_WIDTH = 10;
const MAX_WIDTH = 42;

/** ISO week number of a UTC date. */
function isoWeek(date) {
  const target = new Date(date.getTime());
  const dayOfWeek = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayOfWeek + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayOfWeek = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayOfWeek + 3);
  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86400000));
}

/** `YYYY/MM` label of a UTC date. */
function monthLabel(date) {
  return `${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function day(iso) {
  const [year, month, date] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date));
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/**
 * Excel serial of a UTC midnight date, always an integer.
 *
 * The serial is computed here instead of letting the writer convert a `Date`:
 * that conversion goes through local time, so a UTC midnight date picks up the
 * timezone offset as a fraction of a day. A serial with a time component is a
 * trap for the importer, which derives the ISO week from the Thursday of the
 * week: a fraction can push a date across midnight into the previous week.
 */
function excelSerial(date) {
  return Math.round((date.getTime() - EXCEL_EPOCH) / 86400000);
}

/** Fills the derived time columns so the sample never contradicts itself. */
function withTime(iso, rest, { semana = true, mes = true } = {}) {
  const date = day(iso);
  const row = { Fecha: excelSerial(date) };
  if (semana) row.Semana = isoWeek(date);
  if (mes) row.Mes = monthLabel(date);
  return { ...row, ...rest };
}

// Reference week of the sample: ISO week 31 of 2026, the last one of the deck.
const L = "2026-07-27";
const M = "2026-07-28";
const X = "2026-07-29";

const SHEETS = [
  {
    name: "Edificios",
    header: [
      "Edificio",
      "DT",
      "Alias SmartTech",
      "Alias WorkOrder",
      "Alias IMACS",
      "Alias Peticiones",
      "Visible",
      "Orden",
    ],
    rows: [
      {
        Edificio: "Sede - Principal",
        DT: "DT Centro",
        "Alias SmartTech": "Smart Tech Principal AN",
        "Alias WorkOrder": "ED-M-SEDE - SEDE CENTRAL",
        "Alias IMACS": "Madrid SEDE",
        "Alias Peticiones": "-CALLE DE EJEMPLO, 1,",
        Visible: "Si",
        Orden: 1,
      },
      {
        Edificio: "Tablas I",
        DT: "DT Centro",
        "Alias SmartTech": "Smart Tech Tablas I",
        "Alias WorkOrder": "ED-M-TAB1 - TABLAS I",
        "Alias IMACS": "Madrid Tablas",
        "Alias Peticiones": "-AVENIDA DE EJEMPLO, 36,",
        Visible: "Si",
        Orden: 2,
      },
      {
        Edificio: "Bilbao",
        DT: "DT Norte",
        "Alias SmartTech": "Smart Tech Bilbao, Gran Vía",
        "Alias WorkOrder": "ED-B-GV01 - GRAN VIA",
        "Alias IMACS": "Bilbao",
        "Alias Peticiones": "-GRAN VIA, 12,",
        Visible: "Si",
        Orden: 3,
      },
      {
        Edificio: "Telefonía",
        DT: "",
        "Alias SmartTech": "Smart Tech Telefonía",
        "Alias WorkOrder": "",
        "Alias IMACS": "",
        "Alias Peticiones": "",
        Visible: "No",
        Orden: 99,
      },
    ],
  },
  {
    name: "Incidencias",
    header: [
      "Fecha",
      "Semana",
      "Mes",
      "Categoria",
      "Subcategoria",
      "Metrica",
      "Edificio",
      "Tickets",
    ],
    rows: [
      withTime(L, {
        Categoria: "EQUIPO",
        Subcategoria: "PORTATIL",
        Metrica: "Asignadas",
        Edificio: "Sede - Principal",
        Tickets: 184,
      }),
      withTime(L, {
        Categoria: "EQUIPO",
        Subcategoria: "PORTATIL",
        Metrica: "Resueltas",
        Edificio: "Sede - Principal",
        Tickets: 171,
      }),
      withTime(L, {
        Categoria: "EQUIPO",
        Subcategoria: "PORTATIL",
        Metrica: "Asignaciones",
        Edificio: "Sede - Principal",
        Tickets: 226,
      }),
      withTime(L, {
        Categoria: "APLICACIONES",
        Subcategoria: "SOFTWARE",
        Metrica: "Asignadas",
        Edificio: "Tablas I",
        Tickets: 97,
      }),
    ],
  },
  {
    name: "Encuestas",
    header: ["Fecha", "Mes", "Valoracion", "Respuestas"],
    rows: [
      withTime(L, { Valoracion: 5, Respuestas: 412 }, { semana: false }),
      withTime(L, { Valoracion: 4, Respuestas: 58 }, { semana: false }),
      withTime(L, { Valoracion: 3, Respuestas: 11 }, { semana: false }),
      withTime(L, { Valoracion: 1, Respuestas: 4 }, { semana: false }),
    ],
  },
  {
    name: "WorkOrders",
    header: ["Fecha", "Semana", "Mes", "Edificio", "Tipo", "Ordenes"],
    rows: [
      withTime(L, {
        Edificio: "Sede - Principal",
        Tipo: "Consulta usuarios",
        Ordenes: 63,
      }),
      withTime(L, {
        Edificio: "Sede - Principal",
        Tipo: "Revisión equipamiento",
        Ordenes: 24,
      }),
      withTime(L, { Edificio: "Tablas I", Tipo: "Otros", Ordenes: 41 }),
      withTime(L, { Edificio: "Bilbao", Tipo: "Reponer Tóner", Ordenes: 7 }),
    ],
  },
  {
    name: "Peticiones",
    header: ["Fecha", "Semana", "Mes", "Origen", "Estado", "Entidad", "Total"],
    rows: [
      withTime(L, {
        Origen: "On Site",
        Estado: "En vuelo",
        Entidad: "Peticiones",
        Total: 306,
      }),
      withTime(L, {
        Origen: "On Site",
        Estado: "En vuelo",
        Entidad: "Posiciones",
        Total: 313,
      }),
      withTime(L, {
        Origen: "RENOVE",
        Estado: "Liberadas",
        Entidad: "Peticiones",
        Total: 84,
      }),
      withTime(L, {
        Origen: "DAAS APPLE",
        Estado: "Gestionadas",
        Entidad: "Posiciones",
        Total: 12,
      }),
    ],
  },
  {
    name: "PeticionesProducto",
    header: ["Fecha", "Semana", "Mes", "Producto", "Estado", "Total"],
    rows: [
      withTime(L, {
        Producto: "PORTATIL ESTANDAR",
        Estado: "En vuelo",
        Total: 117,
      }),
      withTime(L, { Producto: "PORTATIL", Estado: "En vuelo", Total: 87 }),
      withTime(L, {
        Producto: "TECLADO Y RATON INALAMBRICOS",
        Estado: "En vuelo",
        Total: 41,
      }),
      withTime(L, { Producto: "PORTATIL RECICLADO", Estado: "Liberadas", Total: 19 }),
    ],
  },
  {
    name: "PeticionesAnual",
    header: ["Anio", "Mes", "Peticiones"],
    rows: [
      { Anio: 2022, Mes: "2022/01", Peticiones: 1204 },
      { Anio: 2022, Mes: "2022/02", Peticiones: 1118 },
      { Anio: 2023, Mes: "2023/01", Peticiones: 1147 },
      { Anio: 2024, Mes: "2024/01", Peticiones: 1032 },
    ],
  },
  {
    name: "Citas",
    header: ["Fecha", "Semana", "Mes", "Edificio", "Tipo", "Citas"],
    rows: [
      withTime(L, { Edificio: "Sede - Principal", Tipo: "Con Cita", Citas: 96 }),
      withTime(L, { Edificio: "Sede - Principal", Tipo: "Sin Cita", Citas: 88 }),
      withTime(M, { Edificio: "Tablas I", Tipo: "Con Cita", Citas: 34 }),
      withTime(X, { Edificio: "Bilbao", Tipo: "Sin Cita", Citas: 12 }),
    ],
  },
  {
    name: "CitasAnual",
    header: ["Anio", "Mes", "Citas"],
    rows: [
      { Anio: 2022, Mes: "2022/01", Citas: 1382 },
      { Anio: 2022, Mes: "2022/02", Citas: 1274 },
      { Anio: 2023, Mes: "2023/01", Citas: 2219 },
      { Anio: 2024, Mes: "2024/01", Citas: 2341 },
    ],
  },
  {
    name: "Imacs",
    header: ["Fecha", "Mes", "Ciudad", "Metrica", "Total"],
    rows: [
      withTime(L, { Ciudad: "Madrid SEDE", Metrica: "Solicitudes", Total: 218 }, { semana: false }),
      withTime(L, { Ciudad: "Madrid SEDE", Metrica: "Interacciones", Total: 341 }, { semana: false }),
      withTime(L, { Ciudad: "Barcelona Maura", Metrica: "Solicitudes", Total: 46 }, { semana: false }),
      withTime(L, { Ciudad: "Las Palmas", Metrica: "Interacciones", Total: 29 }, { semana: false }),
    ],
  },
  {
    name: "Wasp",
    header: ["Fecha", "Semana", "Mes", "Proveedor", "Estado", "Equipos"],
    rows: [
      withTime(L, { Proveedor: "PROVEEDOR A", Estado: "Instalados", Equipos: 42 }),
      withTime(L, { Proveedor: "PROVEEDOR A", Estado: "Pendiente recogida", Equipos: 15 }),
      withTime(L, { Proveedor: "PROVEEDOR B", Estado: "Pendiente", Equipos: 23 }),
      withTime(L, { Proveedor: "PROVEEDOR C", Estado: "Finalizado", Equipos: 8 }),
    ],
  },
  {
    name: "Renove",
    header: ["Fecha", "Semana", "Mes", "Ambito", "Estado", "Equipos"],
    rows: [
      withTime(L, { Ambito: "España", Estado: "Renovado", Equipos: 2 }),
      withTime(L, { Ambito: "Holding", Estado: "Renovado", Equipos: 4 }),
      withTime(L, { Ambito: "España", Estado: "Pendiente usuario", Equipos: 71 }),
      withTime(L, { Ambito: "Holding", Estado: "Desestimado", Equipos: 3 }),
    ],
  },
];

const DATE_COLUMN = "Fecha";

/** Column widths from the header and the sample values, clamped to a range. */
function columnWidths(header, rows) {
  return header.map((column) => {
    const longest = rows.reduce((width, row) => {
      // Date cells hold a serial but are displayed with the date format.
      const text = column === DATE_COLUMN ? DATE_FORMAT : String(row[column] ?? "");
      return Math.max(width, text.length);
    }, column.length);

    return { wch: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, longest + 2)) };
  });
}

/** Displays the "Fecha" serials as Spanish dates without a time component. */
function formatDates(sheet, header) {
  const index = header.indexOf(DATE_COLUMN);
  if (index === -1) return;

  const range = XLSX.utils.decode_range(sheet["!ref"]);

  // Row 0 is the header, so the data starts at row 1.
  for (let row = 1; row <= range.e.r; row += 1) {
    const cell = sheet[XLSX.utils.encode_cell({ r: row, c: index })];
    if (cell && cell.t === "n") {
      cell.z = DATE_FORMAT;
    }
  }
}

function generate(outputPath) {
  const workbook = XLSX.utils.book_new();

  for (const { name, header, rows } of SHEETS) {
    const sheet = XLSX.utils.json_to_sheet(rows, { header });
    sheet["!cols"] = columnWidths(header, rows);
    sheet["!freeze"] = { xSplit: 0, ySplit: 1 };
    formatDates(sheet, header);
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  }

  XLSX.writeFile(workbook, outputPath);

  console.log("Plantilla plana de Informática:");
  for (const { name, header, rows } of SHEETS) {
    console.log(
      `  ${name.padEnd(19)} ${String(header.length).padStart(2)} columnas` +
        `  ${String(rows.length).padStart(2)} filas de ejemplo`
    );
  }
  console.log(`  ${SHEETS.length} hojas en total`);
  console.log(`Escrito en ${outputPath}`);
}

const [output] = process.argv.slice(2);

if (output === "--help" || output === "-h") {
  console.error("Uso: node scripts/generar-plantilla-informatica.mjs [salida.xlsx]");
  process.exit(1);
}

generate(output ?? DEFAULT_OUTPUT);
