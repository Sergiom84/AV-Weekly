/**
 * Weekly Informatica report, assembled from the raw exports in a Drive folder.
 *
 * Paste this file into the Apps Script editor of the "SSCC- Informe Semanal
 * limpio" spreadsheet. It reads the five exports the team uploads, refreshes
 * the data tabs, moves the period markers, closes the month when asked, and
 * writes the PLANO tab that AV Weekly imports.
 *
 * It does not replace the formulas of the (Informe) tabs: those keep
 * calculating, because they are the part the team audits.
 *
 * Design rules, the same three that govern scripts/aga-drive/Codigo.gs:
 *
 * - Files are identified by their header row, never by their name. Here the
 *   rule is not a precaution but a repair: the work-order export is called
 *   "Peticiones ON SITE SSCC", so its name says the opposite of what it holds.
 *   The single exception is telling the backlog, released and managed exports
 *   apart, since the three share one 19-column header; requestKind reads the
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
 * Tab names exactly as the workbook spells them.
 *
 * Three of them look wrong and are not: the two 2.2.1 tabs lose their final
 * letters/parenthesis and 2.3.1 Volum de Citas SmartTech  ends in a space,
 * because Sheets truncates every tab name at 31 characters. Repairing any of
 * those strings means getSheetByName stops finding the tab.
 */
var TAB = {
  peticionesDatos: '2.2.1 Volum de peticiones (Dato',
  liberadas: 'Hoja 16',
  gestionadas: 'Hoja 17',
  encuestasDatos: '2.1.5 Encuestas (datos)',
  encuestasInforme: '2.1.5. Encuestas (Informe)',
  topCincoDatos: '2.1.2 Top 5 incidencias (Datos)',
  volumetria: '2.1.1 Volumetria de Incidencias',
  volumetriaHistorico: 'Hoja 13',
  workOrdersDatos: '2.1.6 Work Orders (Datos)',
  workOrdersInforme: '2.1.6 Work Orders (Informe)',
  workOrdersMensual: 'Hoja 14',
  totalMensual: 'Hoja 15',
  peticionesInforme: '2.2.1 Volum de peticiones (Info',
  citasDatos: '2.3.1 Volum de Citas SmartTech ',
  citasInforme: 'Hoja 18',
  imacsDatos: '2.4.1 Vol Imacs resuelos OnSite',
  imacsInforme: 'Hoja 19',
  config: 'Configuración',
  check: 'Comprobación',
  plano: 'PLANO'
};

var CONFIG_KEYS = {
  folder: 'Carpeta Drive',
  extraction: 'Fecha de extracción',
  windowMonths: 'Meses en la ventana de encuestas'
};

/**
 * ID de la carpeta de Drive que recibe los cinco volcados semanales.
 * inicializarHoja la deja puesta en la pestaña "Configuración" para no tener
 * que pegarla a mano; esa celda manda siempre, esto es solo la semilla.
 */
var DEFAULT_FOLDER_ID = '17O7dORS6oIDN0hyLP1AXQEN7tR6k3ZbH';

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
    .addItem('Cerrar mes', 'cerrarMes')
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

/* -------------------------------------------------------------------------- */
/* Sheet access                                                                */
/* -------------------------------------------------------------------------- */

function book() {
  return SpreadsheetApp.getActiveSpreadsheet();
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
/* Drive: reading the raw exports                                              */
/* -------------------------------------------------------------------------- */

var XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
var SHEETS_MIME = 'application/vnd.google-apps.spreadsheet';

/** Prefix of the throwaway conversions, so a rerun never reads its own copies. */
var TEMPORARY_PREFIX = '[temporal Informática Weekly]';

/**
 * A Drive file as a Google Sheet, converting it when it is still an .xlsx.
 *
 * Uses the REST endpoint rather than the advanced Drive service so the
 * spreadsheet works with no service to enable: the OAuth token the script
 * already holds for DriveApp is enough.
 *
 * Returns { id, temporary }. A temporary copy must be trashed by the caller.
 */
function openAsSpreadsheet(file) {
  var mime = file.getMimeType();

  if (mime === SHEETS_MIME) {
    return { id: file.getId(), temporary: false };
  }

  var response = UrlFetchApp.fetch(
    'https://www.googleapis.com/drive/v3/files/' + file.getId() + '/copy?supportsAllDrives=true',
    {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      payload: JSON.stringify({
        name: TEMPORARY_PREFIX + ' ' + file.getName(),
        mimeType: SHEETS_MIME
      }),
      muteHttpExceptions: true
    }
  );

  if (response.getResponseCode() >= 300) {
    throw new Error(
      'No se pudo convertir "' + file.getName() + '" a hoja de cálculo. ' +
        'Respuesta de Drive: ' + response.getContentText()
    );
  }

  return { id: JSON.parse(response.getContentText()).id, temporary: true };
}

function discardTemporary(handle) {
  if (handle && handle.temporary) {
    DriveApp.getFileById(handle.id).setTrashed(true);
  }
}

/**
 * Every tab of a workbook as { name, grid }.
 *
 * Values are read raw, so dates stay Date objects and padded codes stay
 * strings; the conversions normalise at the point of use.
 */
function readGrids(spreadsheetId) {
  var sheets = SpreadsheetApp.openById(spreadsheetId).getSheets();
  var grids = [];

  for (var index = 0; index < sheets.length; index += 1) {
    var sheet = sheets[index];
    var lastRow = sheet.getLastRow();
    var lastColumn = sheet.getLastColumn();

    if (lastRow < 1 || lastColumn < 1) continue;

    grids.push({
      name: sheet.getName(),
      grid: sheet.getRange(1, 1, lastRow, lastColumn).getValues()
    });
  }

  return grids;
}

/**
 * Every tab of a workbook whose header row carries all the required columns.
 *
 * The header is not always the first row: some exports put a merged title above
 * it, and a converted workbook sometimes keeps a blank row on top, so a few rows
 * are scanned before giving up.
 */
var HEADER_SCAN_ROWS = 20;

function findDataSheets(grids, required) {
  var found = [];

  for (var index = 0; index < grids.length; index += 1) {
    var grid = grids[index].grid;
    var limit = Math.min(grid.length, HEADER_SCAN_ROWS);

    for (var row = 0; row < limit; row += 1) {
      var columns = headerIndex(grid[row] || []);

      if (hasColumns(columns, required)) {
        found.push({ name: grids[index].name, grid: grid, headerRow: row, columns: columns });
        break;
      }
    }
  }

  return found;
}

/**
 * Columns that identify each of the five formats, all of them verified against
 * server/convertInformaticaRaw.ts, which already reads these same files.
 *
 * encuestas is the one entry that is not a whole-name match on its own: it
 * pairs these two columns with the ENCUESTAS_SCORE_HINT fragment below,
 * because the satisfaction column is a full question and its wording moves.
 */
var REQUIRED = {
  peticiones: ['Denominación Producto', 'Estatus de la Posición'],
  imac: ['Fecha limite', 'nº trabajos'],
  encuestas: ['Incident Number', 'Fecha'],
  workOrders: ['DWP_SRID', 'Ubicacion_asociada'],
  citas: ['Incidencia', 'Cita_Previa', 'Smart_Tech']
};

/** Fragment of the satisfaction question. Mirrors the server-side converter. */
var ENCUESTAS_SCORE_HINT = 'Nivel de satis';

/** Which of the three request exports a file is, by name. They share a header. */
function requestKind(fileName) {
  var lower = String(fileName).toLowerCase();

  if (lower.indexOf('backlog') >= 0) return 'backlog';
  if (lower.indexOf('liberadas') >= 0) return 'liberadas';
  if (lower.indexOf('gestionadas') >= 0) return 'gestionadas';

  return null;
}

/**
 * Tabs of a workbook that hold the survey answers.
 *
 * Incident Number plus Fecha alone would also accept a sibling template, so
 * the satisfaction question decides. Dropping the tab is safer than reading the
 * wrong one: an empty survey section is visible, a wrong one is not.
 */
function encuestasSheets(grids) {
  var candidates = findDataSheets(grids, REQUIRED.encuestas);
  var sheets = [];

  for (var index = 0; index < candidates.length; index += 1) {
    if (hasColumnLike(candidates[index].columns, ENCUESTAS_SCORE_HINT)) {
      sheets.push(candidates[index]);
    }
  }

  return sheets;
}

/**
 * Stores a match, keeping the newest file when the folder holds two of a kind.
 *
 * The superseded name is reported rather than dropped: two backlogs in the
 * folder is how last week's figures get presented as this week's, and it is
 * invisible unless somebody says it out loud.
 */
function keepNewest(found, duplicated, kind, file, sheets, grids) {
  var updated = file.getLastUpdated();

  if (found[kind] && found[kind].updated >= updated) {
    duplicated.push(file.getName());
    return;
  }

  if (found[kind]) {
    duplicated.push(found[kind].file.getName());
  }

  found[kind] = { file: file, sheets: sheets, grids: grids, updated: updated };
}

/**
 * Classifies the files of the folder by what their header rows say they are.
 *
 * Every candidate is opened, which is slower than matching on the name but is
 * the only rule that survives an export whose name lies. Files this script
 * produced itself are skipped by name, since a previous PLANO export sitting
 * in the same folder is not an input.
 *
 * A workbook can match several kinds at once and that is expected: the
 * templates file carries the surveys, the work orders and the appointments on
 * three different tabs, so the kinds are all tried and none of them breaks the
 * loop. Only the request exports are exclusive, and among themselves they are
 * told apart by requestKind.
 *
 * Returns the matches, the handles to trash, the names that matched nothing,
 * the superseded duplicates, and nombres and modificados — the files read
 * and their modification dates, which the Comprobación tab writes so a bad
 * week can be spotted before it is presented.
 */
function classifyFolder(folderId) {
  var folder = DriveApp.getFolderById(folderId);
  var files = folder.getFiles();
  var found = {
    backlog: null,
    liberadas: null,
    gestionadas: null,
    encuestas: null,
    workOrders: null,
    citas: null,
    imac: null
  };
  var handles = [];
  var skipped = [];
  var duplicated = [];
  var nombres = [];
  var modificados = [];

  while (files.hasNext()) {
    var file = files.next();
    var mime = file.getMimeType();

    if (mime !== XLSX_MIME && mime !== SHEETS_MIME && mime !== MimeType.MICROSOFT_EXCEL) {
      continue;
    }

    if (file.getName().indexOf(TEMPORARY_PREFIX) === 0 || file.getId() === book().getId()) {
      continue;
    }

    var handle = null;

    try {
      handle = openAsSpreadsheet(file);
      handles.push(handle);

      nombres.push(file.getName());
      modificados.push(isoDate(file.getLastUpdated()));

      var grids = readGrids(handle.id);
      var matched = false;

      // Requests first: the three exports share one header, so the name is what
      // says which of them this is. A fourth file with that header and none of
      // the three words in its name is reported instead of guessed at.
      var requests = findDataSheets(grids, REQUIRED.peticiones);

      if (requests.length > 0) {
        var kind = requestKind(file.getName());

        if (kind !== null) {
          keepNewest(found, duplicated, kind, file, requests, grids);
          matched = true;
        }
      }

      var templates = encuestasSheets(grids);

      if (templates.length > 0) {
        keepNewest(found, duplicated, 'encuestas', file, templates, grids);
        matched = true;
      }

      var orders = findDataSheets(grids, REQUIRED.workOrders);

      if (orders.length > 0) {
        keepNewest(found, duplicated, 'workOrders', file, orders, grids);
        matched = true;
      }

      var appointments = findDataSheets(grids, REQUIRED.citas);

      if (appointments.length > 0) {
        keepNewest(found, duplicated, 'citas', file, appointments, grids);
        matched = true;
      }

      var imacs = findDataSheets(grids, REQUIRED.imac);

      if (imacs.length > 0) {
        keepNewest(found, duplicated, 'imac', file, imacs, grids);
        matched = true;
      }

      if (!matched) {
        skipped.push(file.getName());
      }
    } catch (error) {
      discardTemporary(handle);
      throw error;
    }
  }

  return {
    found: found,
    handles: handles,
    skipped: skipped,
    duplicated: duplicated,
    nombres: nombres,
    modificados: modificados
  };
}

/* -------------------------------------------------------------------------- */
/* Configuration                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The three settings of the "Configuración" tab.
 *
 * The extraction date is the only date the colleague types, and every period
 * marker of section 6 of SPEC.md is derived from it. It is returned as a UTC
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

  var folderId = text(config[CONFIG_KEYS.folder]);
  var extraction = configDate(config[CONFIG_KEYS.extraction]);
  var windowMonths = Number(config[CONFIG_KEYS.windowMonths]);

  if (folderId === '') {
    throw new Error('Falta el ID de la carpeta de Drive en la pestaña "' + TAB.config + '".');
  }

  if (!extraction) {
    throw new Error(
      'Falta la fecha de extracción en la pestaña "' + TAB.config + '". ' +
        'Es el lunes de la semana que se informa.'
    );
  }

  return {
    folderId: folderId,
    extraction: extraction,
    windowMonths: isFinite(windowMonths) && windowMonths > 0 ? Math.round(windowMonths) : DEFAULT_WINDOW_MONTHS
  };
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
function toDate(value) {
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;

    return utcDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  if (typeof value === 'number' && isFinite(value)) {
    return new Date(EXCEL_EPOCH + Math.floor(value) * 86400000);
  }

  var raw = String(value == null ? '' : value).trim();
  var us = US_DATETIME.exec(raw);

  if (us) {
    return utcDate(Number(us[3]), Number(us[1]), Number(us[2]));
  }

  var month = MONTH_TEXT.exec(raw);

  if (month) {
    return utcDate(Number(month[1]), Number(month[2]), 1);
  }

  return null;
}

/** '6,380' and '6.380' are the same number: the template writes separators. */
function toNumber(value) {
  if (typeof value === 'number') return value;

  var parsed = Number(String(value == null ? '' : value).replace(/[.,\s]/g, ''));

  return isFinite(parsed) ? parsed : 0;
}

/* -------------------------------------------------------------------------- */
/* Weekly period markers                                                       */
/* -------------------------------------------------------------------------- */

/** Monday and Sunday of the ISO week the extraction date falls in. */
function weekBounds(extraction) {
  var day = (extraction.getUTCDay() + 6) % 7;
  var monday = new Date(extraction.getTime() - day * 86400000);

  return { monday: monday, sunday: new Date(monday.getTime() + 6 * 86400000) };
}

/** First and last day of the month the extraction date falls in. */
function monthBounds(extraction) {
  var year = extraction.getUTCFullYear();
  var month = extraction.getUTCMonth();

  return {
    first: new Date(Date.UTC(year, month, 1)),
    last: new Date(Date.UTC(year, month + 1, 0))
  };
}

/**
 * This week's totals become next week's "Semana anterior".
 *
 * Must run BEFORE the data tabs are rewritten: H4:H6 are COUNTIF formulas, so
 * the moment the new rows land they recalculate and the old figure is gone.
 * The percentage in column J divides by these three cells.
 */
function rodarSemanaAnterior() {
  var sheet = sheetByName(TAB.peticionesInforme, false);
  var actual = sheet.getRange('H4:H6').getValues();

  sheet.getRange('I4:I6').setValues(actual);
}

/** Writes every marker that changes as part of the weekly processing. */
function escribirMarcadores(extraction) {
  var week = weekBounds(extraction);
  var month = monthBounds(extraction);

  sheetByName(TAB.workOrdersInforme, false)
    .getRange('H1:I1')
    .setValues([[month.first, month.last]])
    .setNumberFormat('dd/mm/yyyy');

  sheetByName(TAB.citasInforme, false)
    .getRange('J2:K2')
    .setValues([[week.monday, week.sunday]])
    .setNumberFormat('dd/mm/yyyy');

  sheetByName(TAB.encuestasInforme, false)
    .getRange('L24')
    .setValue(month.first)
    .setNumberFormat('dd/mm/yyyy');
}

/* -------------------------------------------------------------------------- */
/* Data-tab writes                                                             */
/* -------------------------------------------------------------------------- */

/** A row with exactly width cells, padding missing cells and dropping extras. */
function fixedWidth(row, width) {
  var fixed = [];

  for (var column = 0; column < width; column += 1) {
    fixed.push(column < row.length && row[column] != null ? row[column] : '');
  }

  return fixed;
}

function rowHasValue(row) {
  for (var column = 0; column < row.length; column += 1) {
    if (row[column] !== null && row[column] !== undefined && text(row[column]) !== '') return true;
  }

  return false;
}

/** Data below a detected header, without blank trailing rows. */
function rowsBelowHeader(source, width) {
  var rows = [];

  for (var row = source.headerRow + 1; row < source.grid.length; row += 1) {
    var fixed = fixedWidth(source.grid[row] || [], width);

    if (rowHasValue(fixed)) rows.push(fixed);
  }

  return rows;
}

/**
 * Writes a block and clears whatever the previous run left below it.
 *
 * Not clearing is the failure that does not announce itself: a week with fewer
 * rows than the last one leaves the old tail in place, and every COUNTIFS over
 * the tab counts it as if it were this week.
 */
function writeGrid(tabName, rows, firstRow, firstColumn, columnCount) {
  var sheet = sheetByName(tabName, false);
  var width = columnCount || (rows.length > 0 ? rows[0].length : 0);

  if (!sheet) throw new Error('Falta la pestaña de destino "' + tabName + '".');
  if (width === 0) return 0;

  var neededLastRow = firstRow + rows.length - 1;
  var lastRow = sheet.getMaxRows();

  if (neededLastRow > lastRow) {
    sheet.insertRowsAfter(lastRow, neededLastRow - lastRow);
    lastRow = neededLastRow;
  }

  if (lastRow >= firstRow) {
    sheet.getRange(firstRow, firstColumn, lastRow - firstRow + 1, width).clearContent();
  }

  if (rows.length > 0) {
    var values = [];

    for (var row = 0; row < rows.length; row += 1) {
      values.push(fixedWidth(rows[row], width));
    }

    sheet.getRange(firstRow, firstColumn, values.length, width).setValues(values);
  }

  return rows.length;
}

/** Resolves a lookup table into a plain object, so the sheet keeps no VLOOKUP. */
function readLookup(tabName, keyColumn, valueColumn, firstRow) {
  var sheet = sheetByName(tabName, false);

  if (!sheet) throw new Error('Falta la pestaña del maestro "' + tabName + '".');

  var last = sheet.getLastRow();
  var map = {};

  if (last < firstRow) return map;

  var width = valueColumn - keyColumn + 1;
  var values = sheet.getRange(firstRow, keyColumn, last - firstRow + 1, width).getValues();

  for (var row = 0; row < values.length; row += 1) {
    var key = normalize(values[row][0]);

    if (key !== '') map[key] = values[row].slice(1);
  }

  return map;
}

/** '#N/A' literal, like the VLOOKUP wrote, plus the unknown value for the report. */
function lookup(map, key, index, unknown) {
  var found = map[normalize(key)];

  if (!found) {
    if (text(key) !== '' && unknown.indexOf(String(key)) < 0) unknown.push(String(key));
    return '#N/A';
  }

  return found[index];
}

function firstSource(entry, label) {
  if (!entry || !entry.sheets || entry.sheets.length === 0) {
    throw new Error('No se encontró el origen de ' + label + '.');
  }

  return entry.sheets[0];
}

/** The complete weekly-template grids retained while the folder was classified. */
function templateGrids(found) {
  var kinds = ['encuestas', 'workOrders', 'citas'];

  for (var index = 0; index < kinds.length; index += 1) {
    var entry = found[kinds[index]];

    if (entry && entry.grids && entry.grids.length > 0) return entry.grids;
  }

  throw new Error('No se conservaron las pestañas del template semanal.');
}

function monthCellCount(row) {
  var count = 0;

  for (var column = 0; column < row.length; column += 1) {
    if (MONTH_TEXT.test(text(row[column]))) count += 1;
  }

  return count;
}

/** The two-row monthly pivot used by the Top 5 data tab. */
function topFiveSource(grids) {
  for (var index = 0; index < grids.length; index += 1) {
    var grid = grids[index].grid;
    var first = grid[0] || [];
    var second = grid[1] || [];

    if (monthCellCount(first) >= 2 && normalize(second[0]) === 'CATEGORIZATION TIER 1') {
      return { name: grids[index].name, grid: grid, headerRow: 1, columns: headerIndex(second) };
    }
  }

  throw new Error('No se encontró el bloque 2-2 del template semanal.');
}

/**
 * The 3-3 and 4-4 tabs have the same four-column header and no data marker that
 * says BBVA or BBVA TECH. Their documented numeric prefix is the only honest
 * discriminator; if it changes, stop instead of swapping the two series.
 */
function monthlySource(grids, prefix) {
  var required = ['Fecha', 'Incidencias resueltas', 'Asignadas', 'Asignaciones'];

  for (var index = 0; index < grids.length; index += 1) {
    var grid = grids[index].grid;
    var columns = headerIndex(grid[0] || []);

    if (hasColumns(columns, required) && text(grids[index].name).indexOf(prefix) === 0) {
      return { name: grids[index].name, grid: grid, headerRow: 0, columns: columns };
    }
  }

  throw new Error('No se encontró el bloque ' + prefix + ' del template semanal.');
}

function columnLikeIndex(row, fragment) {
  var needle = normalize(fragment);

  for (var column = 0; column < row.length; column += 1) {
    if (normalize(row[column]).indexOf(needle) >= 0) return column;
  }

  return -1;
}

function setDateFormat(tabName, firstRow, column, rowCount) {
  if (rowCount < 1) return;

  sheetByName(tabName, false)
    .getRange(firstRow, column, rowCount, 1)
    .setNumberFormat('dd/mm/yyyy');
}

/** Latest usable monthly row, converted to date plus three numbers. */
function latestMonthlyRow(source) {
  var latest = null;

  for (var row = source.headerRow + 1; row < source.grid.length; row += 1) {
    var current = source.grid[row] || [];
    var date = toDate(current[0]);

    if (!date) continue;

    if (!latest || date.getTime() > latest[0].getTime()) {
      latest = [date, toNumber(current[1]), toNumber(current[2]), toNumber(current[3])];
    }
  }

  if (!latest) throw new Error('El bloque "' + source.name + '" no trae ningún mes válido.');

  return latest;
}

/** Update the current month or append it into the first free history row. */
function writeMonthlyRow(tabName, row, firstRow, firstColumn) {
  var sheet = sheetByName(tabName, false);
  var last = Math.max(sheet.getLastRow(), firstRow);
  var dates = sheet.getRange(firstRow, firstColumn, last - firstRow + 1, 1).getValues();
  var target = 0;
  var firstBlank = 0;

  for (var index = 0; index < dates.length; index += 1) {
    var current = toDate(dates[index][0]);

    if (current && current.getTime() === row[0].getTime()) {
      target = firstRow + index;
      break;
    }

    if (!current && firstBlank === 0) firstBlank = firstRow + index;
  }

  if (target === 0) target = firstBlank || last + 1;
  if (target > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), target - sheet.getMaxRows());

  sheet.getRange(target, firstColumn, 1, 4).setValues([row]);
  sheet.getRange(target, firstColumn).setNumberFormat('dd/mm/yyyy');

  return 1;
}

function yearSource(entry, extraction) {
  var year = String(extraction.getUTCFullYear());

  for (var index = 0; index < entry.sheets.length; index += 1) {
    if (text(entry.sheets[index].name) === year) return entry.sheets[index];
  }

  throw new Error('El fichero IMAC no trae la pestaña del año ' + year + '.');
}

/**
 * Replaces the weekly data tabs while preserving all hand-kept master ranges.
 * `clasificacion` accepts the object returned by classifyFolder; accepting its
 * `found` member too keeps the function convenient for the local verifier.
 */
function escribirDatos(clasificacion, informe) {
  var found = clasificacion.found || clasificacion;
  var written = informe.escritas || {};
  var unknownWorkOrders = [];
  var unknownAddresses = [];
  var grids = templateGrids(found);
  var extraction = informe.extraction ? toDate(informe.extraction) : readConfig().extraction;

  if (!extraction) throw new Error('No hay una fecha de extracción válida para seleccionar los IMAC.');

  var backlog = rowsBelowHeader(firstSource(found.backlog, 'Backlog'), 19);
  var released = rowsBelowHeader(firstSource(found.liberadas, 'Liberadas'), 19);
  var managed = rowsBelowHeader(firstSource(found.gestionadas, 'Gestionadas'), 19);

  written[TAB.peticionesDatos] = writeGrid(TAB.peticionesDatos, backlog, 2, 1, 19);
  written[TAB.liberadas] = writeGrid(TAB.liberadas, released, 2, 1, 19);
  written[TAB.gestionadas] = writeGrid(TAB.gestionadas, managed, 2, 1, 19);

  var addressLookup = readLookup(TAB.gestionadas, 24, 26, 2);
  var managedDt = [];
  var managedBuilding = [];

  for (var managedRow = 0; managedRow < managed.length; managedRow += 1) {
    managedDt.push([lookup(addressLookup, managed[managedRow][8], 0, unknownAddresses)]);
    managedBuilding.push([lookup(addressLookup, managed[managedRow][8], 1, unknownAddresses)]);
  }

  writeGrid(TAB.gestionadas, managedDt, 2, 20, 1);
  writeGrid(TAB.gestionadas, managedBuilding, 2, 21, 1);

  var surveySource = firstSource(found.encuestas, 'Encuestas');
  var surveyHeader = surveySource.grid[surveySource.headerRow] || [];
  var surveyColumns = headerIndex(surveyHeader);
  var surveyMonth = surveyColumns[normalize('Fecha')];
  var surveyScore = columnLikeIndex(surveyHeader, 'Nivel de satis');
  var surveyEase = columnLikeIndex(surveyHeader, 'fácil el proceso de apertura');
  var surveySolution = columnLikeIndex(surveyHeader, 'satisfecho con la solución');

  if (
    surveyMonth === undefined ||
    surveyScore < 0 ||
    surveyEase < 0 ||
    surveySolution < 0
  ) {
    throw new Error('El template de encuestas no trae las cuatro columnas de cálculo esperadas.');
  }

  var surveys = [];

  for (var surveyRow = surveySource.headerRow + 1; surveyRow < surveySource.grid.length; surveyRow += 1) {
    var rawSurvey = surveySource.grid[surveyRow] || [];
    var month = toDate(rawSurvey[surveyMonth]);

    if (!month && text(rawSurvey[surveyScore]) === '') continue;

    var safeSurvey = ['', '', month || '', '', '', '', '', '', '', '', '', '', ''];
    safeSurvey[7] = rawSurvey[surveyScore] == null ? '' : rawSurvey[surveyScore];
    safeSurvey[8] = rawSurvey[surveyEase] == null ? '' : rawSurvey[surveyEase];
    safeSurvey[10] = rawSurvey[surveySolution] == null ? '' : rawSurvey[surveySolution];
    surveys.push(safeSurvey);
  }

  written[TAB.encuestasDatos] = writeGrid(TAB.encuestasDatos, surveys, 4, 1, 13);
  setDateFormat(TAB.encuestasDatos, 4, 3, surveys.length);

  var topSource = topFiveSource(grids);
  var topRows = rowsBelowHeader(topSource, 19);

  for (var topRow = 0; topRow < topRows.length; topRow += 1) {
    for (var topColumn = 2; topColumn < 19; topColumn += 1) {
      topRows[topRow][topColumn] = toNumber(topRows[topRow][topColumn]);
    }
  }

  written[TAB.topCincoDatos] = writeGrid(TAB.topCincoDatos, topRows, 3, 1, 19);

  var bbva = latestMonthlyRow(monthlySource(grids, '3-3'));
  var bbvaTech = latestMonthlyRow(monthlySource(grids, '4-4'));

  writeMonthlyRow(TAB.volumetria, bbva, 4, 1);
  writeMonthlyRow(TAB.volumetria, bbvaTech, 4, 6);
  written[TAB.volumetria] = 1;

  var workSource = firstSource(found.workOrders, 'Work Orders');
  var workOrders = rowsBelowHeader(workSource, 15);
  var technicianLookup = readLookup(TAB.workOrdersDatos, 25, 26, 2);
  var territorials = [];

  for (var workRow = 0; workRow < workOrders.length; workRow += 1) {
    workOrders[workRow][1] = toDate(workOrders[workRow][1]) || '';
    territorials.push([lookup(technicianLookup, workOrders[workRow][5], 0, unknownWorkOrders)]);
  }

  written[TAB.workOrdersDatos] = writeGrid(TAB.workOrdersDatos, workOrders, 2, 1, 15);
  writeGrid(TAB.workOrdersDatos, territorials, 2, 16, 1);
  setDateFormat(TAB.workOrdersDatos, 2, 2, workOrders.length);

  var appointmentSource = firstSource(found.citas, 'Citas SmartTech');
  var appointments = rowsBelowHeader(appointmentSource, 8);
  var walkupDates = [];
  var bookingDates = [];

  for (var appointmentRow = 0; appointmentRow < appointments.length; appointmentRow += 1) {
    walkupDates.push([toDate(appointments[appointmentRow][1]) || '']);
    bookingDates.push([toDate(appointments[appointmentRow][2]) || '']);
  }

  written[TAB.citasDatos] = writeGrid(TAB.citasDatos, appointments, 2, 1, 8);
  writeGrid(TAB.citasDatos, [], 2, 11, 7);
  writeGrid(TAB.citasDatos, walkupDates, 2, 10, 1);
  writeGrid(TAB.citasDatos, bookingDates, 2, 14, 1);
  setDateFormat(TAB.citasDatos, 2, 10, appointments.length);
  setDateFormat(TAB.citasDatos, 2, 14, appointments.length);

  var imacSource = yearSource(found.imac, extraction);
  var imacs = rowsBelowHeader(imacSource, 7);

  for (var imacRow = 0; imacRow < imacs.length; imacRow += 1) {
    imacs[imacRow][0] = toDate(imacs[imacRow][0]) || '';
    imacs[imacRow][5] = toNumber(imacs[imacRow][5]);
  }

  written[TAB.imacsDatos] = writeGrid(TAB.imacsDatos, imacs, 2, 1, 7);
  setDateFormat(TAB.imacsDatos, 2, 1, imacs.length);

  informe.escritas = written;
  informe.desconocidos = informe.desconocidos || [];

  for (var unknownWork = 0; unknownWork < unknownWorkOrders.length; unknownWork += 1) {
    informe.desconocidos.push('Técnico sin territorial: ' + unknownWorkOrders[unknownWork]);
  }

  for (var unknownAddress = 0; unknownAddress < unknownAddresses.length; unknownAddress += 1) {
    informe.desconocidos.push('Dirección sin DT/edificio: ' + unknownAddresses[unknownAddress]);
  }
}
