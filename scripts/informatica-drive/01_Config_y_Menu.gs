/**
 * Weekly Informatica report, assembled from the raw exports in a Drive folder.
 *
 * Paste this file into the Apps Script editor of the "SSCC- Informe Semanal
 * limpio" spreadsheet. It reads the weekly exports the team uploads, refreshes
 * the data tabs, writes the annual-requests grid from Acumuladas, moves the
 * period markers, closes the month when asked, and writes the PLANO tab that
 * AV Weekly imports.
 *
 * It does not replace the formulas of the (Informe) tabs: those keep
 * calculating, because they are the part the team audits. The exception is
 * the annual-requests grid of 2.2.1 (Informe), a block of values filled from
 * Acumuladas and the August 2026 seed.
 *
 * Design rules, the same three that govern scripts/aga-drive/Codigo.gs:
 *
 * - Files are identified by their header row, never by their name. Here the
 *   rule is not a precaution but a repair: the work-order export is called
 *   "Peticiones ON SITE SSCC", so its name says the opposite of what it holds.
 *   The single exception is telling the backlog, released, managed and
 *   acumuladas exports apart, since the four share one 19-column header.
 *   A file named BacklogMes, LiberadasMes or GestionadasMes is the full
 *   month and is kept out of the weekly snapshot. requestKind reads the
 *   file name for that and for nothing else.
 * - The workbook keeps its shape. This script writes the data tabs, the period
 *   markers and the month close, and never the hand-kept masters listed under
 *   "Zonas intocables" in SPEC.md.
 * - Only counts leave this script. The raw rows carry user ids, free-text
 *   answers and technician names; none of that reaches the PLANO tab.
 *
 * See SPEC.md next to this file for the sheet-by-sheet mapping.
 *
 * Install: Extensiones > Apps Script, paste this file, save, reload the
 * spreadsheet, then run "⭐ Informática Weekly > Inicializar hoja".
 */

/* -------------------------------------------------------------------------- */
/* Tabs and configuration                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Tab aliases exposed by the local XLSX export. Google Sheets keeps the full
 * native names, while Excel rewrites names over 31 characters and replaces
 * several collisions with Hoja 13...19. TAB_NATIVE below is the source of
 * truth in the live spreadsheet; sheetByName resolves both representations.
 */
var TAB = {
  peticionesDatos: '2.2.1 Volum de peticiones (Dato',
  liberadas: 'Hoja 16',
  gestionadas: 'Hoja 17',
  encuestasDatos: '2.1.5 Encuestas (datos)',
  encuestasInforme: '2.1.5. Encuestas (Informe)',
  topCincoDatos: '2.1.2 Top 5 incidencias (Datos)',
  topCincoInforme: '2.1.2 Top 5 incidencias (Inform',
  volumetria: '2.1.1 Volumetria de Incidencias',
  volumetriaHistorico: 'Hoja 13',
  workOrdersDatos: '2.1.6 Work Orders (Datos)',
  workOrdersInforme: '2.1.6 Work Orders (Informe)',
  workOrdersAnualDatos: '2.1.7 Volumetria de WO anuales ',
  workOrdersMensual: 'Hoja 14',
  totalMensualDatos: '2.1.8 Volumetria de incidencias',
  totalMensual: 'Hoja 15',
  peticionesInforme: '2.2.1 Volum de peticiones (Info',
  citasDatos: '2.3.1 Volum de Citas SmartTech ',
  citasInforme: 'Hoja 18',
  imacsDatos: '2.4.1 Vol Imacs resuelos OnSite',
  imacsInforme: 'Hoja 19',
  config: 'Configuración',
  check: 'Comprobación',
  plano: 'PLANO',
  peticionesMes: 'Peticiones mes'
};

/** Full names in the native Google Sheet, in the same logical slots as TAB. */
var TAB_NATIVE = {
  volumetria: '2.1.1 Volumetria de Incidencias (Datos)',
  volumetriaHistorico: '2.1.1 Volumetria de Incidencias (Informe)',
  topCincoDatos: '2.1.2 Top 5 incidencias (Datos)',
  topCincoInforme: '2.1.2 Top 5 incidencias (Informe)',
  encuestasDatos: '2.1.5 Encuestas (datos)',
  encuestasInforme: '2.1.5. Encuestas (Informe)',
  workOrdersDatos: '2.1.6 Work Orders (Datos)',
  workOrdersInforme: '2.1.6 Work Orders (Informe)',
  workOrdersAnualDatos: '2.1.7 Volumetria de WO anuales (Datos)',
  workOrdersMensual: '2.1.7 Volumetria de WO anuales (Informe)',
  totalMensualDatos: '2.1.8 Volumetria de incidencias y WO(Datos)',
  totalMensual: '2.1.8 Volumetria de incidencias y WO(Informe)',
  peticionesDatos: '2.2.1 Volum de peticiones (Datos Backlog)',
  liberadas: '2.2.1 Volum de peticiones (Datos Liberadas)',
  gestionadas: '2.2.1 Volum de peticiones (Datos Gestionadas)',
  peticionesInforme: '2.2.1 Volum de peticiones (Informe)',
  citasDatos: '2.3.1 Volum de Citas SmartTech Semanal  (Datos)',
  citasInforme: '2.3.1 Volum de Citas SmartTech Semanal  (Informe)',
  imacsDatos: '2.4.1 Vol Imacs resuelos OnSite (Datos)',
  imacsInforme: '2.4.1 Vol Imacs resuelos OnSite (Informe)',
  config: 'Configuración',
  check: 'Comprobación',
  plano: 'PLANO',
  peticionesMes: 'Peticiones mes'
};

/** Only operational tabs may be created; report/data tabs must already exist. */
var CREATABLE_TABS = {
  'Configuración': true,
  'Comprobación': true,
  PLANO: true,
  'Peticiones mes': true
};

var CONFIG_KEYS = {
  folder: 'Carpeta Drive',
  outputFolder: 'Carpeta salida PLANO',
  extraction: 'Fecha de extracción',
  lastProcessed: 'Última extracción procesada',
  windowMonths: 'Meses en la ventana de encuestas',
  lastClosed: 'Último mes cerrado'
};


/**
 * Width of the survey window, in months.
 *
 * The workbook draws 19 today, while the label in 2.1.5. (Informe)!F1 still
 * says 14. The number lives in "Configuración" so widening the chart is one
 * cell and not nineteen rewritten formulas.
 */
var DEFAULT_WINDOW_MONTHS = 19;

/** Header of the plain-text format. Must match INFORMATICA_TEXTO_HEADER. */
var TEXTO_HEADER = 'INFORMATICA TEXTO PLANO v1';

/* -------------------------------------------------------------------------- */
/* Menu                                                                        */
/* -------------------------------------------------------------------------- */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('⭐ Informática Weekly')
    .addItem('Inicializar hoja', 'inicializarHoja')
    .addItem('Procesar semana', 'procesarSemana')
    .addItem('Guardar PLANO como .txt en la carpeta', 'guardarPlanoTxt')
    .addToUi();
}

/* -------------------------------------------------------------------------- */
/* Text helpers                                                                */
/* -------------------------------------------------------------------------- */

/** NFD, no combining marks, single spaces, trimmed, upper. */
function normalize(value) {
  if (value === null || value === undefined) return '';

  return String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/**
 * Building key and FNV-1a code. Keep in lockstep with
 * `shared/modules/informatica/buildingCodes.ts`.
 */
function edificioCodeKey(value) {
  return String(value == null ? '' : value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function fnv1a32(value) {
  var hash = 2166136261;

  for (var index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  return hash;
}

function edificioCode(name) {
  var key = edificioCodeKey(name);

  return key === '' ? '' : 'E' + fnv1a32(key);
}

function encodeBuildingCell(value) {
  var label = planoCell(value);
  var code = edificioCode(label);

  return code === '' ? label : code;
}

/**
 * Replaces building labels with opaque codes and drops EDIFICIOS so the
 * weekly text never carries street addresses.
 */
function codificarEdificiosAgregado(agregado) {
  var encoded = {};
  var key;

  for (key in agregado) {
    if (!Object.prototype.hasOwnProperty.call(agregado, key)) continue;
    encoded[key] = agregado[key];
  }

  encoded.edificios = [];

  function encodeColumn(section, column) {
    var rows = encoded[section] || [];
    var copy = [];

    for (var index = 0; index < rows.length; index += 1) {
      var row = rows[index].slice();
      row[column] = encodeBuildingCell(row[column]);
      copy.push(row);
    }

    encoded[section] = copy;
  }

  encodeColumn('incidencias', 6);
  encodeColumn('workOrders', 3);
  encodeColumn('citas', 3);
  encodeColumn('imacs', 2);

  return encoded;
}

/** Trimmed text of a cell, collapsing the padding the exports add ("  001"). */
function text(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();

  return String(value).replace(/\s+/g, ' ').trim();
}

function pad2(value) {
  return value < 10 ? '0' + value : String(value);
}

function isoDate(date) {
  return date.getUTCFullYear() + '-' + pad2(date.getUTCMonth() + 1) + '-' + pad2(date.getUTCDate());
}

/** `dd/mm/aaaa`, the form Configuración shows, for messages read by a person. */
function fechaCorta(date) {
  return pad2(date.getUTCDate()) + '/' + pad2(date.getUTCMonth() + 1) + '/' + date.getUTCFullYear();
}

/* -------------------------------------------------------------------------- */
/* Sheet access                                                                */
/* -------------------------------------------------------------------------- */

function book() {
  return obtenerLibroInformatica();
}

/** Logical key shared by the native and XLSX representation of a tab. */
function tabKey(name) {
  var keys = Object.keys(TAB_NATIVE);

  for (var index = 0; index < keys.length; index += 1) {
    var key = keys[index];

    if (TAB_NATIVE[key] === name || TAB[key] === name) return key;
  }

  return '';
}

/** Native name first, then its local XLSX alias, without duplicates. */
function sheetNameCandidates(name) {
  var key = tabKey(name);

  if (key === '') return [name];

  var candidates = [TAB_NATIVE[key]];

  if (TAB[key] && TAB[key] !== TAB_NATIVE[key]) candidates.push(TAB[key]);

  return candidates;
}

function sheetByName(name, createIfMissing) {
  var spreadsheet = book();
  var candidates = sheetNameCandidates(name);
  var target = null;

  for (var index = 0; index < candidates.length; index += 1) {
    target = spreadsheet.getSheetByName(candidates[index]);

    if (target) break;
  }

  if (!target && createIfMissing) {
    if (!CREATABLE_TABS[name]) {
      throw new Error('No se puede crear automáticamente la pestaña funcional "' + name + '".');
    }

    target = spreadsheet.insertSheet(name);
  }

  return target;
}

/** Physical tab selected in the active workbook, for formulas and diagnostics. */
function physicalSheetName(name) {
  var sheet = sheetByName(name, false);

  if (!sheet) return name;
  if (typeof sheet.getName === 'function') return sheet.getName();

  return name;
}

/** Quotes and escapes a physical tab name for use inside an A1 formula. */
function formulaSheetPrefix(name) {
  return "'" + physicalSheetName(name).replace(/'/g, "''") + "'!";
}

/** Column name to index, from a header row. First occurrence wins. */
function headerIndex(row) {
  var columns = {};

  for (var index = 0; index < row.length; index += 1) {
    var key = normalize(row[index]);

    if (key !== '' && !(key in columns)) {
      columns[key] = index;
    }
  }

  return columns;
}

/**
 * Header of a table whose title block spans more than one row, flattened into
 * one row by taking the first non-empty cell of each column.
 *
 * A merged header cell is materialised in every row it covers when the workbook
 * is read as XLSX, but Google keeps the value only in the top row of the merge.
 * A reader that trusts a single row therefore finds the header locally and
 * nothing at all after the conversion — and finds it silently, because a header
 * that is not there just skips its column instead of failing. Both the 2-2
 * pivot and the two SLA tabs are shaped this way.
 */
function mergedHeaderRow(grid, lastRow) {
  var header = [];

  for (var rowIndex = 0; rowIndex <= lastRow; rowIndex += 1) {
    var row = grid[rowIndex] || [];

    for (var column = 0; column < row.length; column += 1) {
      if (text(header[column]) === '') {
        header[column] = row[column];
      }
    }
  }

  return header;
}

/** True when every required column is present in the header index. */
function hasColumns(columns, required) {
  for (var index = 0; index < required.length; index += 1) {
    if (!(normalize(required[index]) in columns)) return false;
  }

  return true;
}

/**
 * True when some column name contains fragment.
 *
 * Needed for one header only. hasColumns matches a whole column name, and the
 * satisfaction column of the survey template is a full question whose wording
 * the tooling has changed before; server/convertInformaticaRaw.ts matches it
 * on the fragment "NIVEL DE SATIS" for that reason, and this mirrors it.
 */
function hasColumnLike(columns, fragment) {
  var keys = Object.keys(columns);
  var needle = normalize(fragment);

  for (var index = 0; index < keys.length; index += 1) {
    if (keys[index].indexOf(needle) >= 0) return true;
  }

  return false;
}


/* -------------------------------------------------------------------------- */
/* Configuration                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Settings of the "Configuración" tab.
 *
 * Folder ids and the survey window stay on the sheet. The extraction date is
 * not typed: Procesar semana stamps today. A blank cell is normal, and a date
 * still present is only the stamp of the last run. It is returned as a UTC
 * midnight Date so the week and month bounds cannot drift a day when the
 * sheet renders it in another timezone.
 */
function readConfig() {
  var sheet = sheetByName(TAB.config, false);

  if (!sheet) {
    throw new Error(
      'Falta la pestaña "' + TAB.config + '". Ejecuta "⭐ Informática Weekly > Inicializar hoja".'
    );
  }

  var values = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), 2).getValues();
  var config = {};

  for (var index = 0; index < values.length; index += 1) {
    config[text(values[index][0])] = values[index][1];
  }

  var folderId = text(config[CONFIG_KEYS.folder]) || obtenerIdCarpetaBrutoInformatica();
  var outputFolderId = text(config[CONFIG_KEYS.outputFolder]) || obtenerIdCarpetaSalidaInformatica();
  var extraction = configDate(config[CONFIG_KEYS.extraction]);
  var windowMonths = Number(config[CONFIG_KEYS.windowMonths]);

  if (folderId === '') {
    throw new Error('Falta el ID de la carpeta de Drive en la pestaña "' + TAB.config + '" o en 00_Entorno_IDs.gs.');
  }

  return {
    folderId: folderId,
    outputFolderId: outputFolderId,
    extraction: extraction,
    lastProcessed: configDate(config[CONFIG_KEYS.lastProcessed]),
    lastClosed: mesDeCelda(config[CONFIG_KEYS.lastClosed]) || MES_CERRADO_INICIAL,
    windowMonths: isFinite(windowMonths) && windowMonths > 0 ? Math.round(windowMonths) : DEFAULT_WINDOW_MONTHS
  };
}

/** Writes or appends one Configuración row without touching the other keys. */
function writeConfigValue(key, value) {
  var sheet = sheetByName(TAB.config, false);
  var last = Math.max(sheet.getLastRow(), 1);
  var keys = sheet.getRange(1, 1, last, 1).getValues();
  var row = 0;

  for (var index = 0; index < keys.length; index += 1) {
    if (text(keys[index][0]) === key) {
      row = index + 1;
      break;
    }
  }

  if (row === 0) {
    row = last + 1;
    sheet.getRange(row, 1).setValue(key).setFontWeight('bold');
  }

  // `2026/09` would otherwise become a date that reads like a day.
  if (key === CONFIG_KEYS.lastClosed) sheet.getRange(row, 2).setNumberFormat('@');

  sheet.getRange(row, 2).setValue(value);

  if (key === CONFIG_KEYS.extraction || key === CONFIG_KEYS.lastProcessed) {
    sheet.getRange(row, 2).setNumberFormat('dd/mm/yyyy');
  }
}

function ensureConfigKey(key, value) {
  var sheet = sheetByName(TAB.config, false);
  var last = Math.max(sheet.getLastRow(), 1);
  var keys = sheet.getRange(1, 1, last, 1).getValues();

  for (var index = 0; index < keys.length; index += 1) {
    if (text(keys[index][0]) === key) return;
  }

  writeConfigValue(key, value);
}

/**
 * The extraction cell as a UTC midnight Date, or null.
 *
 * A date typed into the sheet arrives as a Date in the sheet's timezone, and
 * only the calendar day of that value is kept. Text is accepted in ISO form
 * too, which is what a pasted value tends to be.
 */
function configDate(value) {
  if (value instanceof Date) {
    return isNaN(value.getTime())
      ? null
      : new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  }

  var iso = /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/.exec(text(value));

  if (iso) {
    return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* Date and number conversion                                                  */
/* -------------------------------------------------------------------------- */

var EXCEL_EPOCH = Date.UTC(1899, 11, 30);
var US_DATETIME = /^(\d{2})\/(\d{2})\/(\d{4}),\s*(\d{2}):(\d{2}):(\d{2})\s*(AM|PM)$/i;
var MONTH_TEXT = /^(\d{4})\/(\d{2})$/;

/** A real UTC calendar date, or null when JavaScript would roll its parts. */
function utcDate(year, month, day) {
  var date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

/**
 * Any of the three date shapes the exports use, as a UTC midnight date.
 *
 * The American form is the one the annotation in '2.1.6 Work Orders (Informe)'
 * K3 complains about. The time of day is dropped on purpose: a timestamp at
 * 00:40 shifts the day when the sheet renders it in another timezone, and with
 * the day goes the week the row is counted in.
 */
/**
 * Excel serials below this are not report dates: survey counts (91, 285)
 * would otherwise become March 1900 and trigger a month close for year 1900.
 * 36526 is 2000-01-01.
 */
var MIN_EXCEL_SERIAL = 36526;

function toDate(value) {
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;

    return utcDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  if (typeof value === 'number' && isFinite(value)) {
    if (value < MIN_EXCEL_SERIAL) return null;

    return new Date(EXCEL_EPOCH + Math.floor(value) * 86400000);
  }

  var raw = String(value == null ? '' : value).trim();
  var us = US_DATETIME.exec(raw);

  if (us) {
    return utcDate(Number(us[3]), Number(us[1]), Number(us[2]));
  }

  var eu = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);

  if (eu) {
    return utcDate(Number(eu[3]), Number(eu[2]), Number(eu[1]));
  }

  var month = MONTH_TEXT.exec(raw);

  if (month) {
    return utcDate(Number(month[1]), Number(month[2]), 1);
  }

  return null;
}

/** True for months the Informatica book actually reports. */
function fechaOperativa(date) {
  if (!date) return false;

  var year = date.getUTCFullYear();

  return year >= 2022 && year <= 2030;
}

/** Year headers may be a number, the text "2026", or 01/01/2026. */
function yearFromCell(value) {
  if (typeof value === 'number' && isFinite(value) && value >= 2000 && value <= 2100) {
    if (Math.floor(value) === value) return value;
  }

  var asText = Number(text(value));

  if (asText >= 2000 && asText <= 2100 && asText === Math.floor(asText)) return asText;

  if (value instanceof Date) {
    var date = toDate(value);

    if (date && fechaOperativa(date)) return date.getUTCFullYear();
  }

  return 0;
}

/** '6,380' and '6.380' are the same number: the template writes separators. */
function toNumber(value) {
  if (typeof value === 'number') return value;

  var parsed = Number(String(value == null ? '' : value).replace(/[.,\s]/g, ''));

  return isFinite(parsed) ? parsed : 0;
}

/** First integer in report cells such as `127 (98%)`; never concatenate the percentage. */
function leadingNumber(value) {
  if (typeof value === 'number') return isFinite(value) ? value : 0;

  var match = /^\s*(-?[\d.,\s]+)/.exec(String(value == null ? '' : value));

  return match ? toNumber(match[1]) : 0;
}

