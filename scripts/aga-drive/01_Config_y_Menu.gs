/**
 * AV Weekly — AGA. Google Apps Script bound to the "AV Weekly - AGA" spreadsheet.
 *
 * Replaces the manual pivot-table process: the three raw exports are dropped
 * into a Drive folder, this script reads them, aggregates them and writes the
 * `PLANO` tab in the plain-text format `shared/modules/aga/texto.ts` declares.
 * That text is then uploaded to AV Weekly, which builds the deck from it.
 *
 * Design rules, mirrored from the server parsers:
 *
 * - Files are identified by their header row, never by their name. The exports
 *   are renamed every week and a name-based match would break the first time
 *   somebody types "S34".
 * - Presentation labels are resolved here, from the mapping tabs, and written
 *   final into the text. AV Weekly does not re-derive them, so those tabs are
 *   the single place where a new department or project is named.
 * - Only counts leave this script. The raw rows carry the assignee, the
 *   beneficiary and the machine name; none of that reaches the text.
 *
 * Install: Extensiones > Apps Script, paste this file, save, reload the
 * spreadsheet, then run "⭐ AGA Weekly > Inicializar hoja".
 */

/* -------------------------------------------------------------------------- */
/* Tabs and configuration                                                      */
/* -------------------------------------------------------------------------- */

var TAB = {
  instructions: 'Instrucciones',
  config: 'Configuración',
  departments: 'Mapa departamentos',
  projects: 'Mapa proyectos',
  buildings: 'Mapa edificios',
  annual: 'Anual',
  check: 'Comprobación',
  plano: 'PLANO'
};

/**
 * There is no "máximo de productos" here on purpose.
 *
 * How many bars slide 2.3 draws is a decision of the deck, which applies it
 * after both weeks are joined. A limit at this end would decide instead which
 * rows survive the export, and that loses the previous-week figure of every
 * product that has just reached the top.
 */
var CONFIG_KEYS = {
  folder: 'Carpeta de Drive (ID)',
  extraction: 'Fecha de extracción (lunes)',
  week: 'Semana AGA (opcional)'
};


/** Header of the plain-text format. Must match `AGA_TEXTO_HEADER` in the app. */
var TEXTO_HEADER = 'AGA TEXTO PLANO v1';

/** Section names. Must match `AGA_TEXTO_SECTIONS` in the app. */
var SECTION = {
  weeks: 'SEMANAS',
  weekDepartments: 'SEMANAS DEPARTAMENTO',
  weekDepartmentsRaw: 'SEMANAS DEPARTAMENTO BRUTO',
  weekProjects: 'SEMANAS PROYECTO',
  managed: 'GESTIONADAS',
  managedDepartments: 'GESTIONADAS DEPARTAMENTO',
  managedProducts: 'GESTIONADAS PRODUCTO',
  managedLocations: 'GESTIONADAS UBICACION',
  managedLocationTotals: 'GESTIONADAS UBICACION TOTAL',
  managedDepartmentProducts: 'GESTIONADAS DEPARTAMENTO PRODUCTO',
  office: 'OFFICE',
  annualRequests: 'ANUAL PETICIONES',
  annualPositions: 'ANUAL POSICIONES'
};

/**
 * Departments broken out by product on their own slide (2.5 to 2.7).
 *
 * Keys are the label the mapping tab produces, not the raw export value.
 */
var DETAIL_DEPARTMENTS = ['GAM', 'Plataforma Portátiles', 'Almacén'];

/** Office families, in the order the chart stacks them. */
var OFFICE_FAMILIES = [
  'MICROSOFT OFFICE STANDARD',
  'MICROSOFT OFFICE EXCEL',
  'MICROSOFT OFFICE 365',
  'MICROSOFT ACCESS',
  'MICROSOFT WORD',
  'MICROSOFT OFFICE 2021 (MAC)'
];

/**
 * Mapping tables the spreadsheet is seeded with, taken from the published
 * report. They live at the top level, and not inside `inicializarHoja`, so
 * `verificar-local.mjs` can run the same aggregation outside Google against the
 * real exports. The colleague owns them in the tabs from then on.
 */
var SEEDS = {
  /**
   * `[nombre en el export, etiqueta en la sección 1, etiqueta en la sección 2]`.
   *
   * The third column is empty for the departments the deck has never charted
   * in section 2, which is how the published slide 2.2 shows six bars while
   * section 1 shows every department. It is a label and not a yes/no because
   * the two sections have always named the same department differently
   * ("Plataforma Portátiles" against "Portatiles Plataforma"), and the deck
   * merges rows by label.
   */
  departments: [
    ['GAM (GESTION APROVISIONAMIENTO MICRO)', 'GAM', 'GAM'],
    ['GAM', 'GAM', 'GAM'],
    ['PORTATILES PLATAFORMA', 'Plataforma Portátiles', 'Portatiles Plataforma'],
    ['ADMINISTRACION RED LOCAL', 'Administración de Red Local', 'Administración de Red Local'],
    ['ADMINISTRACIÓN RED LOCAL', 'Administración de Red Local', 'Administración de Red Local'],
    ['ALMACEN', 'Almacén', 'Almacén'],
    ['GSAM', 'GSAM', 'GSAM'],
    ['BBVA_SPAIN_SD_JAMF', 'BBVA_SPAIN_SD_JAMF', 'BBVA_SPAIN_SD_JAMF'],
    ['SOPORTE TÉCNICO', 'Soporte Técnico', ''],
    ['SOPORTE VIP', 'Soporte VIP', ''],
    ['TODOMOVIL', 'TodoMóvil', ''],
    ['HOMOLOGACIONES SOFTWARE', 'Homologaciones Software', ''],
    ['TEI AUDIOVISUALES', 'TEI Audiovisuales', ''],
    ['CGR - AM', 'CGR_AM', ''],
    ['HIC', 'HIC', '']
  ],
  projects: [
    ['ONBOARDING', 'Nuevas incorporaciones'],
    ['NUEVAS INCORPORACIONES EN BBVA', 'Nuevas incorporaciones'],
    ['DAASAPPLE', 'Renove Apple'],
    ['RENOVE DAAS APPLE', 'Renove Apple'],
    // Two codes of the same campaign, reported as a single bar.
    ['HOLDINGREN', 'Renove Holding'],
    ['RENOVEHOLD', 'Renove Holding'],
    ['HOLDING RENOVE', 'Renove Holding'],
    ['RENOVE HOLDING', 'Renove Holding'],
    ['SPAINREN', 'Renove España'],
    ['ESPAÑA RENOVE', 'Renove España'],
    ['WASP', 'WASP'],
    ['PROYECTO WASP', 'WASP']
  ],
  buildings: [
    ['MADRID-AZUL, 4,', 'Sede'],
    ['MADRID-C/ FEDERICO MOMPOU, 5,', 'Tablas I']
  ]
};

/* -------------------------------------------------------------------------- */
/* Menu                                                                        */
/* -------------------------------------------------------------------------- */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('⭐ AGA Weekly')
    .addItem('Inicializar hoja', 'inicializarHoja')
    .addItem('Poner lunes actual en Configuración', 'ponerLunesActual')
    .addItem('Procesar semana', 'procesarSemana')
    .addSeparator()
    .addItem('Guardar PLANO como .txt en la carpeta', 'guardarPlanoTxt')
    .addToUi();
}

function lunesActualIso() {
  var now = new Date();
  var local = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  var daysSinceMonday = (local.getUTCDay() + 6) % 7;
  local.setUTCDate(local.getUTCDate() - daysSinceMonday);
  return isoDate(local);
}

function ponerLunesActual() {
  var ui = SpreadsheetApp.getUi();
  var sheet = sheetByName(TAB.config, false);

  if (!sheet) {
    throw new Error('Falta la pestaña "' + TAB.config + '". Ejecuta "⭐ AGA Weekly > Inicializar hoja".');
  }

  var rows = Math.max(sheet.getLastRow(), 1);
  var values = sheet.getRange(1, 1, rows, 2).getValues();
  var targetRow = -1;

  for (var index = 0; index < values.length; index += 1) {
    if (text(values[index][0]) === CONFIG_KEYS.extraction) {
      targetRow = index + 1;
      break;
    }
  }

  if (targetRow === -1) {
    targetRow = rows + 1;
    sheet.getRange(targetRow, 1).setValue(CONFIG_KEYS.extraction).setFontWeight('bold');
  }

  var monday = lunesActualIso();
  var cell = sheet.getRange(targetRow, 2);
  cell.setNumberFormat('@');
  cell.setValue(monday);

  ui.alert('⭐ AGA Weekly', 'Fecha de extracción actualizada a ' + monday + ' (formato texto).', ui.ButtonSet.OK);
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

var EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/**
 * A cell holding a date, as `[year, month, day]` in UTC.
 *
 * The exports disagree between themselves and between weeks: the same column
 * arrives as a `Date`, as an Excel serial and as `dd.mm.yyyy` text. A converted
 * workbook adds a fourth shape, the sheet's own locale format, which is why the
 * textual branch accepts both orders.
 */
function dateParts(value) {
  if (value instanceof Date) {
    return isNaN(value.getTime())
      ? null
      : [value.getFullYear(), value.getMonth() + 1, value.getDate()];
  }

  if (typeof value === 'number') {
    if (!isFinite(value) || value <= 0) return null;

    var fromSerial = new Date(EXCEL_EPOCH + Math.round(value) * 86400000);
    return [fromSerial.getUTCFullYear(), fromSerial.getUTCMonth() + 1, fromSerial.getUTCDate()];
  }

  var raw = text(value);
  if (raw === '') return null;

  var iso = raw.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
  if (iso) return [Number(iso[1]), Number(iso[2]), Number(iso[3])];

  var dmy = raw.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/);
  if (dmy) return [Number(dmy[3]), Number(dmy[2]), Number(dmy[1])];

  var serial = Number(raw);
  return isFinite(serial) && serial > 0 ? dateParts(serial) : null;
}

function toIsoDate(value) {
  var parts = dateParts(value);
  if (!parts) return null;

  return parts[0] + '-' + pad2(parts[1]) + '-' + pad2(parts[2]);
}

function toIsoMonth(value) {
  var parts = dateParts(value);
  if (!parts) return null;

  return parts[0] + '-' + pad2(parts[1]);
}

/**
 * Week key of a managed position: the Monday immediately after the work week
 * that contains `Fecha Gestionado`.
 *
 * AGA names a snapshot after the completed period before the extraction, so a
 * position closed on Tuesday 2026-08-11 belongs to the 2026-08-17 extraction.
 * This is `managedWeekKey` in `server/parseAgaGestionado.ts`; the two must
 * agree or the weekly totals land on different bars.
 */
function managedWeekKey(value) {
  var parts = dateParts(value);
  if (!parts) return null;

  var date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  if (isNaN(date.getTime())) return null;

  var daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday + 7);

  return isoDate(date);
}

/* -------------------------------------------------------------------------- */
/* Sheet access                                                                */
/* -------------------------------------------------------------------------- */

function book() {
  return obtenerLibroAga();
}

function sheetByName(name, createIfMissing) {
  var target = book().getSheetByName(name);

  if (!target && createIfMissing) {
    target = book().insertSheet(name);
  }

  return target;
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

/** True when every required column is present in the header index. */
function hasColumns(columns, required) {
  for (var index = 0; index < required.length; index += 1) {
    if (!(normalize(required[index]) in columns)) return false;
  }

  return true;
}


/* -------------------------------------------------------------------------- */
/* Configuration                                                               */
/* -------------------------------------------------------------------------- */

function readConfig() {
  var sheet = sheetByName(TAB.config, false);

  if (!sheet) {
    throw new Error('Falta la pestaña "' + TAB.config + '". Ejecuta "⭐ AGA Weekly > Inicializar hoja".');
  }

  var values = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), 2).getValues();
  var config = {};

  for (var index = 0; index < values.length; index += 1) {
    config[text(values[index][0])] = values[index][1];
  }

  var folder = text(config[CONFIG_KEYS.folder]) || obtenerIdCarpetaBrutoAga();
  var extraction = toIsoDate(config[CONFIG_KEYS.extraction]);

  if (folder === '') {
    throw new Error('Falta el ID de la carpeta de Drive en la pestaña "' + TAB.config + '" o en 00_Entorno_IDs.gs.');
  }

  if (!extraction) {
    throw new Error(
      'Falta la fecha de extracción en la pestaña "' + TAB.config + '". ' +
        'Es el lunes en el que se sacan los ficheros.'
    );
  }

  var cut = new Date(extraction + 'T00:00:00Z');
  if (isNaN(cut.getTime()) || cut.toISOString().slice(0, 10) !== extraction || cut.getUTCDay() !== 1) {
    throw new Error('La fecha de extracción debe ser un lunes válido en formato AAAA-MM-DD. Revisa día y mes.');
  }

  return {
    folder: folder,
    extraction: extraction,
    week: Number(config[CONFIG_KEYS.week]) || null
  };
}

