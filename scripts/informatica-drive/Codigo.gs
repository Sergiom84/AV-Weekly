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
 * Two of them look wrong and are not: 2.2.1 Volum de peticiones (Info has no
 * closing parenthesis and 2.3.1 Volum de Citas SmartTech  ends in a space,
 * both because Sheets truncates a tab name at 31 characters. Repairing either
 * string means getSheetByName stops finding the tab.
 */
var TAB = {
  peticionesDatos: '2.2.1 Volum de peticiones (Datos)',
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
function keepNewest(found, duplicated, kind, file, sheets) {
  var updated = file.getLastUpdated();

  if (found[kind] && found[kind].updated >= updated) {
    duplicated.push(file.getName());
    return;
  }

  if (found[kind]) {
    duplicated.push(found[kind].file.getName());
  }

  found[kind] = { file: file, sheets: sheets, updated: updated };
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
          keepNewest(found, duplicated, kind, file, requests);
          matched = true;
        }
      }

      var templates = encuestasSheets(grids);

      if (templates.length > 0) {
        keepNewest(found, duplicated, 'encuestas', file, templates);
        matched = true;
      }

      var orders = findDataSheets(grids, REQUIRED.workOrders);

      if (orders.length > 0) {
        keepNewest(found, duplicated, 'workOrders', file, orders);
        matched = true;
      }

      var appointments = findDataSheets(grids, REQUIRED.citas);

      if (appointments.length > 0) {
        keepNewest(found, duplicated, 'citas', file, appointments);
        matched = true;
      }

      var imacs = findDataSheets(grids, REQUIRED.imac);

      if (imacs.length > 0) {
        keepNewest(found, duplicated, 'imac', file, imacs);
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
