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
  plano: 'PLANO'
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
  plano: 'PLANO'
};

/** Only operational tabs may be created; report/data tabs must already exist. */
var CREATABLE_TABS = {
  'Configuración': true,
  'Comprobación': true,
  PLANO: true
};

var CONFIG_KEYS = {
  folder: 'Carpeta Drive',
  outputFolder: 'Carpeta salida PLANO',
  extraction: 'Fecha de extracción',
  lastProcessed: 'Última extracción procesada',
  windowMonths: 'Meses en la ventana de encuestas'
};

/**
 * ID de la carpeta de Drive que recibe los cinco volcados semanales.
 * inicializarHoja la deja puesta en la pestaña "Configuración" para no tener
 * que pegarla a mano; esa celda manda siempre, esto es solo la semilla.
 */
var DEFAULT_FOLDER_ID = '17O7dORS6oIDN0hyLP1AXQEN7tR6k3ZbH';

/** Folder where the generated TXT is kept, separate from the raw uploads. */
var DEFAULT_OUTPUT_FOLDER_ID = '1b1yyWSoWIj3cNwuCn-1Co1jtqgdGK2_A';

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
  return SpreadsheetApp.getActiveSpreadsheet();
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

  var convertedId = JSON.parse(response.getContentText()).id;

  // A Drive conversion creates a new spreadsheet with its own default time
  // zone. If it differs from the report, getValues() returns Date objects whose
  // evening timestamps can fall on the following calendar day. Align the
  // temporary book before reading it so the Excel day survives unchanged.
  SpreadsheetApp.openById(convertedId).setSpreadsheetTimeZone(
    book().getSpreadsheetTimeZone()
  );

  return { id: convertedId, temporary: true };
}

function discardTemporary(handle) {
  if (handle && handle.temporary) {
    DriveApp.getFileById(handle.id).setTrashed(true);
  }
}

/**
 * A conversion left behind by a run that never reached its own cleanup.
 *
 * The normal path trashes every copy in a `finally`, and that holds for a run
 * that fails. It does not hold for one that is cancelled or killed on timeout:
 * the runtime stops without unwinding, and the copies stay in the input folder
 * for good, because the classifier only knew how to skip them. Eight of them
 * accumulated from the runs of 2026-08-28, two being 3.6 MB copies of the
 * template.
 *
 * Only old ones are swept. A copy created minutes ago may belong to a run that
 * is still going, and trashing it would break that run instead of tidying up
 * after this one.
 */
var ORPHAN_TEMPORARY_AGE_MS = 60 * 60 * 1000;

function discardOrphanTemporary(file, orphans) {
  if (new Date().getTime() - file.getLastUpdated().getTime() < ORPHAN_TEMPORARY_AGE_MS) {
    return;
  }

  file.setTrashed(true);
  orphans.push(file.getName());
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
  citas: ['Incidencia', 'Cita_Previa', 'Smart_Tech'],
  renove: ['Ubicación', 'Estado']
};

/**
 * The four summary tabs each Renove workbook derives from its own raw sheets.
 *
 * They are read, and the raw `Renove` and `Onboarding y averías` they come from
 * are not: six or seven tabs of the workbook carry the two columns above, so
 * the header signature alone would count the raw rows on top of their own
 * summaries. The names are matched without accents, because a workbook exported
 * to xlsx and back writes "averias", and a working copy named "Copia de Renove
 * semanal" is left out for the same reason it always was.
 */
var RENOVE_TABS = {
  'ONBOARDING SEMANAL': true,
  'RENOVADOS ONBOARDING': true,
  'RENOVE SEMANAL': true,
  'RENOVADOS RENOVE': true
};

/** Date column of a Renove tab, in order of preference. */
var RENOVE_DATE_HEADERS = ['Fecha Renovado', 'Fecha de Estado', 'Fecha'];

/**
 * Column that says a row is a unit of equipment. Named after the raw sheet it
 * comes from (`Petición GPS`), summarised as `Nº Petición`.
 */
var RENOVE_PETICION_HEADERS = ['Nº Petición', 'Petición GPS'];

/** True when the row carries a request reference, whatever is written in it. */
function renoveTienePeticion(row, columns) {
  for (var index = 0; index < RENOVE_PETICION_HEADERS.length; index += 1) {
    var at = columns[normalize(RENOVE_PETICION_HEADERS[index])];

    if (at === undefined) continue;
    if (text(row[at]) !== '') return true;
  }

  return false;
}

/**
 * Which scope a Renove workbook reports, by file name, or null.
 *
 * The scope used to be read off the tab prefix of `Dashboards Renoves SSCC`,
 * the board both workbooks published into. That board is gone from the routine:
 * on 21/09/2026 its eight tabs held Holding twice, its four "España - " tabs
 * having been published from the Holding workbook, so the report counted 789
 * renewals where the two sources hold 858 and the whole España population never
 * arrived. The workbooks are read directly and the scope is the file, which
 * cannot come apart the way two publications could.
 */
function renoveKind(fileName) {
  var upper = normalize(fileName);

  if (upper.indexOf('RENOVE') < 0) return null;
  if (upper.indexOf('HOLDING') >= 0) return 'renoveHolding';
  if (upper.indexOf('ESPANA') >= 0) return 'renoveEspana';

  return null;
}

/** The two Renove workbook kinds, in the order they are reported. */
var RENOVE_KINDS = ['renoveEspana', 'renoveHolding'];

/** Scope written into the PLANO for each of the two workbook kinds. */
var RENOVE_AMBITO = {
  renoveEspana: 'España',
  renoveHolding: 'Holding'
};

/** The four summary tabs of one Renove workbook, stamped with its scope. */
function renoveSheets(grids, ambito) {
  var candidates = findDataSheets(grids, REQUIRED.renove);
  var sheets = [];

  for (var index = 0; index < candidates.length; index += 1) {
    if (!RENOVE_TABS[normalize(candidates[index].name)]) continue;

    candidates[index].ambito = ambito;
    sheets.push(candidates[index]);
  }

  return sheets;
}

/** Fragment of the satisfaction question. Mirrors the server-side converter. */
var ENCUESTAS_SCORE_HINT = 'Nivel de satis';

/**
 * Which request export a file is, by name. They share a header.
 *
 * The monthly close uses a second trio, BacklogMes / LiberadasMes /
 * GestionadasMes (GestionadesMes is the spelling that arrived in the brief).
 * Those files are the whole month. The weekly names stay the week.
 */
function requestKind(fileName) {
  var compact = String(fileName).toLowerCase().replace(/[^a-z0-9]/g, '');

  if (compact.indexOf('acumuladas') >= 0) return 'acumuladas';
  if (compact.indexOf('backlogmes') >= 0) return 'backlogMes';
  if (compact.indexOf('liberadasmes') >= 0 || compact.indexOf('liberadesmes') >= 0) return 'liberadasMes';
  if (compact.indexOf('gestionadasmes') >= 0 || compact.indexOf('gestionadesmes') >= 0) return 'gestionadasMes';
  if (compact.indexOf('backlog') >= 0) return 'backlog';
  if (compact.indexOf('liberadas') >= 0) return 'liberadas';
  if (compact.indexOf('gestionadas') >= 0) return 'gestionadas';

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
 * told apart by requestKind. Acumuladas is the fourth of that family: same
 * header, monthly count of positions by Fecha Gestionado.
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
    backlogMes: null,
    liberadasMes: null,
    gestionadasMes: null,
    acumuladas: null,
    encuestas: null,
    workOrders: null,
    citas: null,
    imac: null,
    renoveEspana: null,
    renoveHolding: null
  };
  var handles = [];
  var skipped = [];
  var duplicated = [];
  var nombres = [];
  var modificados = [];
  var orphans = [];

  try {
    while (files.hasNext()) {
      var file = files.next();
      var mime = file.getMimeType();

      if (mime !== XLSX_MIME && mime !== SHEETS_MIME && mime !== MimeType.MICROSOFT_EXCEL) {
        continue;
      }

      if (file.getId() === book().getId()) {
        continue;
      }

      if (file.getName().indexOf(TEMPORARY_PREFIX) === 0) {
        discardOrphanTemporary(file, orphans);
        continue;
      }

      var handle = openAsSpreadsheet(file);

      handles.push(handle);

      nombres.push(file.getName());
      modificados.push(isoDate(file.getLastUpdated()));

      var grids = readGrids(handle.id);
      var matched = false;

      // Requests first: the four exports share one header, so the name is what
      // says which of them this is. A fifth file with that header and none of
      // the four words in its name is reported instead of guessed at.
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

      var renoveKindFound = renoveKind(file.getName());

      if (renoveKindFound !== null) {
        var renove = renoveSheets(grids, RENOVE_AMBITO[renoveKindFound]);

        if (renove.length > 0) {
          keepNewest(found, duplicated, renoveKindFound, file, renove, grids);
          matched = true;
        }
      }

      if (!matched) {
        skipped.push(file.getName());
      }
    }
  } catch (error) {
    // classifyFolder has no caller-owned result yet when it throws. Clean every
    // conversion accumulated so far here, including files opened before the
    // one that failed.
    for (var cleanup = 0; cleanup < handles.length; cleanup += 1) {
      discardTemporary(handles[cleanup]);
    }

    throw error;
  }

  return {
    found: found,
    handles: handles,
    skipped: skipped,
    duplicated: duplicated,
    nombres: nombres,
    modificados: modificados,
    orphans: orphans
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
  var outputFolderId = text(config[CONFIG_KEYS.outputFolder]) || DEFAULT_OUTPUT_FOLDER_ID;
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
    outputFolderId: outputFolderId,
    extraction: extraction,
    lastProcessed: configDate(config[CONFIG_KEYS.lastProcessed]),
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
 * True when this run is a new extraction date.
 *
 * Re-running the same Monday would copy the already-new H4:H6 onto
 * "Semana anterior" and zero the variation. The first run after an upgrade
 * has no stored date, so it still rolls — the same as today.
 */
function debeRodarSemanaAnterior(extraction, lastProcessed) {
  if (!extraction) return false;
  if (!lastProcessed) return true;

  return isoDate(extraction) !== isoDate(lastProcessed);
}

/**
 * True when the extraction date on Configuración is the one already processed.
 *
 * Running the same Monday twice is the most common mistake of the routine:
 * nothing errors, the week simply rewrites itself and "Semana anterior" stops
 * rolling, which is invisible on the sheet and wrong on the report. The run
 * stops on it instead of repeating the work.
 */
function extraccionYaProcesada(extraction, lastProcessed) {
  if (!extraction || !lastProcessed) return false;

  return isoDate(extraction) === isoDate(lastProcessed);
}

/**
 * This week's totals become next week's "Semana anterior".
 *
 * Must run BEFORE the data tabs are rewritten: H4:H6 are COUNTIF formulas, so
 * the moment the new rows land they recalculate and the old figure is gone.
 * The percentage in column J divides by these three cells.
 */
function rodarSemanaAnterior(extraction, lastProcessed) {
  if (!debeRodarSemanaAnterior(extraction, lastProcessed)) return false;

  var sheet = sheetByName(TAB.peticionesInforme, false);
  var actual = sheet.getRange('H4:H6').getValues();

  sheet.getRange('I4:I6').setValues(actual);

  return true;
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
/* Monthly close                                                               */
/* -------------------------------------------------------------------------- */

/** First day of the month after `month`, at UTC midnight. */
function mesSiguiente(month) {
  return new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));
}

/** Whether two usable dates belong to the same UTC calendar month. */
function mismoMes(left, right) {
  var a = toDate(left);
  var b = toDate(right);

  return Boolean(
    a &&
      b &&
      a.getUTCFullYear() === b.getUTCFullYear() &&
      a.getUTCMonth() === b.getUTCMonth()
  );
}

/** Last row whose selected column contains a valid date; physical rows do not count. */
function ultimaFilaFecha(sheet, column, firstRow) {
  var rowCount = sheet.getMaxRows() - firstRow + 1;

  if (rowCount < 1) return 0;

  var values = sheet.getRange(firstRow, column, rowCount, 1).getValues();
  var last = 0;

  for (var index = 0; index < values.length; index += 1) {
    if (toDate(values[index][0])) last = firstRow + index;
  }

  return last;
}

/** Last column whose selected row contains a valid date; formatted columns do not count. */
function ultimaColumnaFecha(sheet, row, firstColumn) {
  var columnCount = sheet.getMaxColumns() - firstColumn + 1;

  if (columnCount < 1) return 0;

  var values = sheet.getRange(row, firstColumn, 1, columnCount).getValues()[0];
  var last = 0;

  for (var index = 0; index < values.length; index += 1) {
    if (toDate(values[index])) last = firstColumn + index;
  }

  return last;
}

function asegurarFila(sheet, row) {
  if (row > sheet.getMaxRows()) {
    sheet.insertRowsAfter(sheet.getMaxRows(), row - sheet.getMaxRows());
  }
}

function asegurarColumna(sheet, column) {
  if (column > sheet.getMaxColumns()) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), column - sheet.getMaxColumns());
  }
}

/** Whether a range carries a value or a formula. Formatting alone is ignored. */
function rangoTieneContenido(range) {
  var values = range.getValues();
  var formulas = range.getFormulas();

  for (var row = 0; row < values.length; row += 1) {
    for (var column = 0; column < values[row].length; column += 1) {
      if (text(values[row][column]) !== '' || text(formulas[row][column]) !== '') return true;
    }
  }

  return false;
}

/** The survey live row is also the durable close marker. */
function mesYaCerrado(month) {
  var sheet = sheetByName(TAB.encuestasInforme, false);
  var liveRow = ultimaFilaFecha(sheet, 2, 4);

  if (liveRow === 0) return false;

  var date = toDate(sheet.getRange(liveRow, 2).getValue());

  return date ? date.getTime() >= month.getTime() : false;
}

/** First day of the live survey-history month, or null. */
function mesVivoEncuestas() {
  var sheet = sheetByName(TAB.encuestasInforme, false);
  var liveRow = ultimaFilaFecha(sheet, 2, 4);

  if (liveRow === 0) return null;

  var date = toDate(sheet.getRange(liveRow, 2).getValue());

  return date ? monthStart(date) : null;
}

/**
 * Freezes the current live month and opens `month`. Returns the frozen cells,
 * or null when that month is already open.
 */
function abrirMesNuevo(month, windowMonths) {
  if (mesYaCerrado(month)) return null;

  var frozenCells = describirCeldasCierre(month);

  cerrarVolumetria(month);
  cerrarHistoricoIncidencias(month);
  cerrarSeriesMensuales(month);
  cerrarImacs(month);
  cerrarBloqueTeclado(month);

  // This is deliberately last: its new live row is the idempotency marker.
  cerrarEncuestas(month, windowMonths);

  return frozenCells;
}

/**
 * Closes the extraction month and opens the following month exactly once.
 *
 * The guard compares the survey history with the NEW month. Closing August,
 * for example, opens 01/09/2026; comparing with August would skip the first
 * legitimate close because the live row already represents August.
 *
 * Weekly processing does not call this: it only catches up months that are
 * already behind the extraction date, so August stays live while August is
 * still being reported.
 */
function cerrarMes() {
  var config = readConfig();
  var nextMonth = mesSiguiente(monthBounds(config.extraction).first);
  var frozenCells = abrirMesNuevo(nextMonth, config.windowMonths);

  if (!frozenCells) {
    actualizarComprobacionCierre('Sin cambios', 'El mes ' + fechaLegible(nextMonth) + ' ya estaba abierto.');
    return false;
  }

  actualizarComprobacionCierre('OK', frozenCells.join('; '));

  return true;
}

/**
 * When extraction has moved into a later month, freeze every live month that
 * is now in the past. August stays live while extraction is still in August.
 */
function cerrarMesesPendientes(extraction, windowMonths) {
  var target = monthBounds(extraction).first;
  var details = [];
  var live = mesVivoEncuestas();
  var guard = 0;

  if (!live || !fechaOperativa(live) || live.getTime() >= target.getTime()) return details;

  while (!mesYaCerrado(target) && guard < 24) {
    live = mesVivoEncuestas();

    if (!live || !fechaOperativa(live)) break;

    var next = mesSiguiente(live);

    if (next.getTime() > target.getTime() || !fechaOperativa(next)) break;

    var frozenCells = abrirMesNuevo(next, windowMonths);

    if (!frozenCells) break;

    details.push('Abierto ' + fechaLegible(next) + ' (' + frozenCells.join('; ') + ')');
    guard += 1;
  }

  if (guard >= 24 && !mesYaCerrado(target)) {
    throw new Error(
      'No se pudieron cerrar los meses pendientes hasta ' + fechaLegible(target) +
        '. No se escriben los volcados de esta semana.'
    );
  }

  return details;
}

function columnLetters(column) {
  var value = column;
  var out = '';

  while (value > 0) {
    var remainder = (value - 1) % 26;
    out = String.fromCharCode(65 + remainder) + out;
    value = Math.floor((value - 1) / 26);
  }

  return out;
}

/** Exact live cells that the close turns into values before opening the new month. */
function describirCeldasCierre(month) {
  var incidenceSheet = sheetByName(TAB.volumetriaHistorico, false);
  var incidenceColumn = ultimaColumnaFecha(incidenceSheet, 2, 3);
  var closedMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1));
  var workSheet = sheetByName(TAB.workOrdersMensual, false);
  var workColumn = columnaAnual(workSheet, closedMonth.getUTCFullYear());
  var workRow = 4 + closedMonth.getUTCMonth();
  var totalSheet = sheetByName(TAB.totalMensual, false);
  var totalRow = ultimaFilaFecha(totalSheet, 1, 2);
  var surveySheet = sheetByName(TAB.encuestasInforme, false);
  var surveyRow = ultimaFilaFecha(surveySheet, 2, 4);
  var cells = [];

  if (incidenceColumn > 0) {
    cells.push(
      physicalSheetName(TAB.volumetriaHistorico) + '!' + columnLetters(incidenceColumn) + '3:' +
        columnLetters(incidenceColumn) + '11'
    );
  }
  if (workColumn > 0) {
    cells.push(physicalSheetName(TAB.workOrdersMensual) + '!' + columnLetters(workColumn) + workRow);
  }
  if (totalRow > 0) {
    cells.push(physicalSheetName(TAB.totalMensual) + '!B' + totalRow + ':C' + totalRow);
  }
  if (surveyRow > 0) {
    cells.push(physicalSheetName(TAB.encuestasInforme) + '!C' + surveyRow + ':D' + surveyRow);
  }

  return cells;
}

/** Opens one empty dated row while preserving the preceding row's formatting. */
function abrirFilaVolumetria(sheet, month, firstColumn) {
  var liveRow = ultimaFilaFecha(sheet, firstColumn, 4);

  if (liveRow === 0) {
    throw new Error('La volumetría no trae ninguna fecha válida en la columna ' + firstColumn + '.');
  }

  var liveDate = toDate(sheet.getRange(liveRow, firstColumn).getValue());

  if (liveDate.getTime() >= month.getTime()) return false;
  if (!mismoMes(liveDate, new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1)))) {
    throw new Error('La volumetría no termina en el mes que se intenta cerrar.');
  }

  var newRow = liveRow + 1;

  asegurarFila(sheet, newRow);
  sheet.getRange(liveRow, firstColumn, 1, 4).copyTo(sheet.getRange(newRow, firstColumn, 1, 4));
  sheet.getRange(newRow, firstColumn, 1, 4).clearContent();
  sheet.getRange(newRow, firstColumn).setValue(month).setNumberFormat('dd/mm/yyyy');

  return true;
}

/** Adds the new month to both independent blocks of 2.1.1. */
function cerrarVolumetria(month) {
  var sheet = sheetByName(TAB.volumetria, false);

  abrirFilaVolumetria(sheet, month, 1);
  abrirFilaVolumetria(sheet, month, 6);
}

/** Freezes Hoja 13's live column and opens the next column from its real pattern. */
function cerrarHistoricoIncidencias(month) {
  var sheet = sheetByName(TAB.volumetriaHistorico, false);
  var liveColumn = ultimaColumnaFecha(sheet, 2, 3);

  if (liveColumn === 0) throw new Error('Hoja 13 no trae ninguna cabecera mensual válida.');

  var liveDate = toDate(sheet.getRange(2, liveColumn).getValue());

  if (liveDate.getTime() >= month.getTime()) return false;
  if (!mismoMes(liveDate, new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1)))) {
    throw new Error('Hoja 13 no termina en el mes que se intenta cerrar.');
  }

  var newColumn = liveColumn + 1;

  asegurarColumna(sheet, newColumn);

  // A side table may eventually reach the next history column. Move it instead
  // of overwriting it; formulas elsewhere follow the inserted column.
  if (rangoTieneContenido(sheet.getRange(2, newColumn, 10, 1))) {
    sheet.insertColumnBefore(newColumn);
  }

  sheet.getRange(2, liveColumn, 10, 1).copyTo(sheet.getRange(2, newColumn, 10, 1));
  sheet.getRange(2, newColumn).setValue(month).setNumberFormat('dd/mm/yyyy');

  var frozen = sheet.getRange(3, liveColumn, 9, 1).getValues();
  sheet.getRange(3, liveColumn, 9, 1).setValues(frozen);

  return true;
}

function columnaAnual(sheet, year) {
  var width = sheet.getMaxColumns();
  var grid = sheet.getRange(1, 1, 3, width).getValues();

  for (var row = 0; row < grid.length; row += 1) {
    for (var index = 0; index < grid[row].length; index += 1) {
      if (yearFromCell(grid[row][index]) === year) return index + 1;
    }
  }

  return 0;
}

/** Creates a year column in Hoja 14 only when January crosses the boundary. */
function asegurarColumnaAnual(sheet, year, sourceColumn) {
  var existing = columnaAnual(sheet, year);

  if (existing !== 0) return existing;

  var targetColumn = sourceColumn + 1;

  asegurarColumna(sheet, targetColumn);
  if (rangoTieneContenido(sheet.getRange(3, targetColumn, 14, 1))) {
    sheet.insertColumnBefore(targetColumn);
  }

  var annualFormula = sheet.getRange(16, sourceColumn).getFormulaR1C1();

  sheet.getRange(3, sourceColumn, 14, 1).copyTo(sheet.getRange(3, targetColumn, 14, 1));
  sheet.getRange(3, targetColumn, 14, 1).clearContent();
  sheet.getRange(3, targetColumn).setValue(year);

  if (annualFormula !== '') sheet.getRange(16, targetColumn).setFormulaR1C1(annualFormula);

  return targetColumn;
}

/** Freezes Hoja 14's current cell and opens the following month. */
function cerrarWorkOrdersMensual(month) {
  var sheet = sheetByName(TAB.workOrdersMensual, false);
  var closedMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1));
  var sourceColumn = columnaAnual(sheet, closedMonth.getUTCFullYear());

  if (sourceColumn === 0) throw new Error('Hoja 14 no trae la columna del año que se cierra.');

  var targetColumn = asegurarColumnaAnual(sheet, month.getUTCFullYear(), sourceColumn);
  var sourceRow = 4 + closedMonth.getUTCMonth();
  var targetRow = 4 + month.getUTCMonth();
  var target = sheet.getRange(targetRow, targetColumn);

  if (text(target.getFormula()) !== '') return false;

  var source = sheet.getRange(sourceRow, sourceColumn);
  var formula = source.getFormulaR1C1();

  if (formula === '') throw new Error('Hoja 14 no trae fórmula viva para abrir el mes siguiente.');

  target.setFormulaR1C1(formula);
  source.setValue(source.getValue());

  return true;
}

/** Freezes Hoja 15's live sources and copies its exact formula pattern below. */
function cerrarTotalMensual(month) {
  var sheet = sheetByName(TAB.totalMensual, false);
  var liveRow = ultimaFilaFecha(sheet, 1, 2);

  if (liveRow === 0) throw new Error('Hoja 15 no trae ninguna fecha mensual válida.');

  var liveDate = toDate(sheet.getRange(liveRow, 1).getValue());

  if (liveDate.getTime() >= month.getTime()) return false;
  if (!mismoMes(liveDate, new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1)))) {
    throw new Error('Hoja 15 no termina en el mes que se intenta cerrar.');
  }

  var source = sheet.getRange(liveRow, 1, 1, 4);
  var newRow = liveRow + 1;

  asegurarFila(sheet, newRow);
  source.copyTo(sheet.getRange(newRow, 1, 1, 4));
  sheet.getRange(newRow, 1).setValue(month).setNumberFormat('dd/mm/yyyy');

  var frozen = sheet.getRange(liveRow, 2, 1, 2).getValues();
  sheet.getRange(liveRow, 2, 1, 2).setValues(frozen);

  return true;
}

/** Monthly series kept in rows: Hoja 14 and Hoja 15. */
function cerrarSeriesMensuales(month) {
  cerrarWorkOrdersMensual(month);
  cerrarTotalMensual(month);
}

/** Last complete two-column month in Hoja 19, based only on its date bounds. */
function ultimaParejaImacs(sheet) {
  var lastStart = 0;

  for (var column = 3; column < sheet.getMaxColumns(); column += 2) {
    var first = toDate(sheet.getRange(5, column).getValue());
    var last = toDate(sheet.getRange(5, column + 1).getValue());

    if (!first || !last) break;
    lastStart = column;
  }

  return lastStart;
}

/**
 * Extends both IMAC blocks by one month without overwriting the table at AT.
 *
 * In the reference book August occupies AQ:AR, AS is the gutter and the side
 * table begins at AT. Two columns are inserted before AS, so the copied pair
 * becomes AS:AT and the original gutter/table move together to AU/AV.
 */
function cerrarImacs(month) {
  var sheet = sheetByName(TAB.imacsInforme, false);
  var liveStart = ultimaParejaImacs(sheet);

  if (liveStart === 0) throw new Error('Hoja 19 no trae ningún par mensual válido.');

  var liveDate = toDate(sheet.getRange(5, liveStart).getValue());

  if (liveDate.getTime() >= month.getTime()) return false;
  if (!mismoMes(liveDate, new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1)))) {
    throw new Error('Hoja 19 no termina en el mes que se intenta cerrar.');
  }

  var newStart = liveStart + 2;

  asegurarColumna(sheet, newStart + 1);

  if (rangoTieneContenido(sheet.getRange(1, newStart, 50, 2))) {
    sheet.insertColumnsBefore(newStart, 2);
  }

  sheet.getRange(5, liveStart, 46, 2).copyTo(sheet.getRange(5, newStart, 46, 2));

  // Headers are data, not part of the copied formula blocks. A new year is
  // labelled only on its first pair; the second cell of each pair stays empty.
  sheet.getRange(3, newStart, 2, 2).clearContent();
  if (month.getUTCMonth() === 0) sheet.getRange(3, newStart).setValue(month.getUTCFullYear());
  sheet.getRange(4, newStart).setValue(nombreMesEspanol(month));

  var bounds = monthBounds(month);

  sheet
    .getRange(5, newStart, 1, 2)
    .setValues([[bounds.first, bounds.last]])
    .setNumberFormat('dd/mm/yyyy');
  sheet
    .getRange(30, newStart, 1, 2)
    .setValues([[bounds.first, bounds.last]])
    .setNumberFormat('dd/mm/yyyy');

  return true;
}

function dosDigitos(value) {
  return value < 10 ? '0' + value : String(value);
}

function literalFecha(date) {
  return (
    dosDigitos(date.getUTCDate()) +
    '/' +
    dosDigitos(date.getUTCMonth() + 1) +
    '/' +
    date.getUTCFullYear()
  );
}

function numeroMesEspanol(value) {
  var months = {
    ENE: 1,
    ENERO: 1,
    FEB: 2,
    FEBRERO: 2,
    MAR: 3,
    MARZO: 3,
    ABR: 4,
    ABRIL: 4,
    MAY: 5,
    MAYO: 5,
    JUN: 6,
    JUNIO: 6,
    JUL: 7,
    JULIO: 7,
    AGO: 8,
    AGOSTO: 8,
    SEP: 9,
    SEPT: 9,
    SET: 9,
    SEPTIEMBRE: 9,
    OCT: 10,
    OCTUBRE: 10,
    NOV: 11,
    NOVIEMBRE: 11,
    DIC: 12,
    DICIEMBRE: 12
  };

  return months[normalize(value)] || 0;
}

function nombreMesEspanol(date) {
  var months = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre'
  ];

  return months[date.getUTCMonth()];
}

/** Repairs the merged year headers and derives every date literal from its month header. */
function cerrarBloqueTeclado(month) {
  var sheet = sheetByName(TAB.workOrdersInforme, false);
  var year = month.getUTCFullYear();

  // C45:D45 and E45:N45 are merged independently; both anchors need the real year.
  sheet.getRange('C45').setValue(year);
  sheet.getRange('E45').setValue(year);

  for (var column = 3; column <= 14; column += 1) {
    var monthNumber = numeroMesEspanol(sheet.getRange(46, column).getValue());

    if (monthNumber === 0) {
      throw new Error('El bloque de teclado trae una cabecera de mes desconocida.');
    }

    var bounds = monthBounds(new Date(Date.UTC(year, monthNumber - 1, 1)));
    var firstLiteral = '">=' + literalFecha(bounds.first) + '"';
    var lastLiteral = '"<=' + literalFecha(bounds.last) + '"';

    for (var row = 47; row <= 49; row += 1) {
      var cell = sheet.getRange(row, column);
      var formula = cell.getFormula();

      if (formula === '') throw new Error('Falta una fórmula del bloque de teclado.');

      var updated = formula
        .replace(/">=\d{2}\/\d{2}\/\d{4}"/g, firstLiteral)
        .replace(/"<=\d{2}\/\d{2}\/\d{4}"/g, lastLiteral);

      if (updated === formula && formula.indexOf(firstLiteral) < 0 && formula.indexOf(lastLiteral) < 0) {
        throw new Error('No se pudieron derivar los límites de una fórmula del bloque de teclado.');
      }

      cell.setFormula(updated);
    }
  }
}

/** Freezes the live survey row, opens the next one and slides the configured window. */
function cerrarEncuestas(month, windowMonths) {
  var sheet = sheetByName(TAB.encuestasInforme, false);
  var liveRow = ultimaFilaFecha(sheet, 2, 4);

  if (liveRow === 0) throw new Error('El histórico de encuestas no trae ninguna fecha válida.');

  var liveDate = toDate(sheet.getRange(liveRow, 2).getValue());

  if (liveDate.getTime() >= month.getTime()) return false;
  if (!mismoMes(liveDate, new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1)))) {
    throw new Error('El histórico de encuestas no termina en el mes que se intenta cerrar.');
  }

  var width = Number(windowMonths);

  if (!isFinite(width) || width < 1) width = DEFAULT_WINDOW_MONTHS;
  width = Math.round(width);

  var newRow = liveRow + 1;
  var firstWindowRow = newRow - width + 1;

  if (firstWindowRow < 4) {
    throw new Error('La ventana de encuestas es mayor que el histórico disponible.');
  }

  asegurarFila(sheet, newRow);
  asegurarColumna(sheet, 6 + width);

  var frozen = sheet.getRange(liveRow, 3, 1, 2).getValues();

  sheet.getRange(liveRow, 3, 1, 2).setValues(frozen);
  sheet.getRange(liveRow, 5).setValue('Histórico');

  sheet.getRange(liveRow, 2, 1, 4).copyTo(sheet.getRange(newRow, 2, 1, 4));
  sheet.getRange(newRow, 2).setValue(month).setNumberFormat('dd/mm/yyyy');
  sheet.getRange(newRow, 3).setFormula('=C31');
  sheet.getRange(newRow, 4).setFormula('=J33');
  sheet.getRange(newRow, 5).setValue('Vivo (C31 y J33)');
  sheet.getRange('L24').setValue(month).setNumberFormat('dd/mm/yyyy');

  var dates = [];
  var averages = [];

  for (var index = 0; index < width; index += 1) {
    dates.push('=B' + (firstWindowRow + index));
    averages.push('=D' + (firstWindowRow + index));
  }

  sheet.getRange(2, 7, 1, width).setFormulas([dates]);
  sheet.getRange(3, 7, 1, width).setFormulas([averages]);
  sheet.getRange('F1').setValue(width + ' meses');

  return true;
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
      return {
        name: grids[index].name,
        grid: grid,
        headerRow: 1,
        columns: headerIndex(mergedHeaderRow(grid, 1)),
      };
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

/** Counts occupied source-width rows without reading or reporting their contents. */
function contarFilasDestino(tabName, firstRow, firstColumn, width) {
  var sheet = sheetByName(tabName, false);

  if (!sheet || sheet.getLastRow() < firstRow) return 0;

  var values = sheet
    .getRange(firstRow, firstColumn, sheet.getLastRow() - firstRow + 1, width)
    .getValues();
  var count = 0;

  for (var row = 0; row < values.length; row += 1) {
    if (rowHasValue(values[row])) count += 1;
  }

  return count;
}

/**
 * Replaces the weekly data tabs while preserving all hand-kept master ranges.
 * `clasificacion` accepts the object returned by classifyFolder; accepting its
 * `found` member too keeps the function convenient for the local verifier.
 */
function escribirDatos(clasificacion, informe) {
  var found = clasificacion.found || clasificacion;
  var written = informe.escritas || {};
  var read = informe.leidas || {};
  var unknownWorkOrders = [];
  var unknownAddresses = [];
  var grids = templateGrids(found);
  var extraction = informe.extraction ? toDate(informe.extraction) : readConfig().extraction;

  if (!extraction) throw new Error('No hay una fecha de extracción válida para seleccionar los IMAC.');

  var backlog = rowsBelowHeader(firstSource(found.backlog, 'Backlog'), 19);
  var released = rowsBelowHeader(firstSource(found.liberadas, 'Liberadas'), 19);
  var managed = rowsBelowHeader(firstSource(found.gestionadas, 'Gestionadas'), 19);

  read[TAB.peticionesDatos] = backlog.length;
  read[TAB.liberadas] = released.length;
  read[TAB.gestionadas] = managed.length;

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

  read[TAB.encuestasDatos] = surveys.length;

  written[TAB.encuestasDatos] = writeGrid(TAB.encuestasDatos, surveys, 4, 1, 13);
  setDateFormat(TAB.encuestasDatos, 4, 3, surveys.length);

  var topSource = topFiveSource(grids);
  var topRows = rowsBelowHeader(topSource, 19);

  for (var topRow = 0; topRow < topRows.length; topRow += 1) {
    for (var topColumn = 2; topColumn < 19; topColumn += 1) {
      topRows[topRow][topColumn] = toNumber(topRows[topRow][topColumn]);
    }
  }

  read[TAB.topCincoDatos] = topRows.length;

  written[TAB.topCincoDatos] = writeGrid(TAB.topCincoDatos, topRows, 3, 1, 19);

  var bbva = latestMonthlyRow(monthlySource(grids, '3-3'));
  var bbvaTech = latestMonthlyRow(monthlySource(grids, '4-4'));

  writeMonthlyRow(TAB.volumetria, bbva, 4, 1);
  writeMonthlyRow(TAB.volumetria, bbvaTech, 4, 6);
  read[TAB.volumetria] = 2;
  written[TAB.volumetria] = 2;

  var workSource = firstSource(found.workOrders, 'Work Orders');
  var workOrders = rowsBelowHeader(workSource, 15);
  var technicianLookup = readLookup(TAB.workOrdersDatos, 25, 26, 2);
  var territorials = [];

  for (var workRow = 0; workRow < workOrders.length; workRow += 1) {
    workOrders[workRow][1] = toDate(workOrders[workRow][1]) || '';
    territorials.push([lookup(technicianLookup, workOrders[workRow][5], 0, unknownWorkOrders)]);
  }

  read[TAB.workOrdersDatos] = workOrders.length;

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

  read[TAB.citasDatos] = appointments.length;

  written[TAB.citasDatos] = writeGrid(TAB.citasDatos, appointments, 2, 1, 8);
  writeGrid(TAB.citasDatos, [], 2, 11, 7);
  writeGrid(TAB.citasDatos, walkupDates, 2, 10, 1);
  writeGrid(TAB.citasDatos, bookingDates, 2, 14, 1);
  setDateFormat(TAB.citasDatos, 2, 10, appointments.length);
  setDateFormat(TAB.citasDatos, 2, 14, appointments.length);

  var imacSource = yearSource(found.imac, extraction);
  var imacs = rowsBelowHeader(imacSource, 7);

  informe.imacAnterior = contarFilasDestino(TAB.imacsDatos, 2, 1, 7);
  informe.imacActual = imacs.length;
  read[TAB.imacsDatos] = imacs.length;

  for (var imacRow = 0; imacRow < imacs.length; imacRow += 1) {
    imacs[imacRow][0] = toDate(imacs[imacRow][0]) || '';
    imacs[imacRow][5] = toNumber(imacs[imacRow][5]);
  }

  written[TAB.imacsDatos] = writeGrid(TAB.imacsDatos, imacs, 2, 1, 7);
  setDateFormat(TAB.imacsDatos, 2, 1, imacs.length);

  informe.leidas = read;
  informe.escritas = written;
  informe.desconocidos = informe.desconocidos || [];

  for (var unknownWork = 0; unknownWork < unknownWorkOrders.length; unknownWork += 1) {
    informe.desconocidos.push('Técnico sin territorial: ' + unknownWorkOrders[unknownWork]);
  }

  for (var unknownAddress = 0; unknownAddress < unknownAddresses.length; unknownAddress += 1) {
    informe.desconocidos.push('Dirección sin DT/edificio: ' + unknownAddresses[unknownAddress]);
  }

  escribirPeticionesAnual(found, informe);
  escribirCitasMensuales(found, informe);
}

/* -------------------------------------------------------------------------- */
/* Formula repairs                                                             */
/* -------------------------------------------------------------------------- */

function escapeRegex(value) {
  return String(value).replace(/[.*+?^{}$()|[\]\\]/g, '\\$&');
}

/** Last row occupied by the latest write, or by the current data as fallback. */
function ultimaFilaEscrita(informe, tabName, firstRow, firstColumn, width) {
  var written = informe && informe.escritas ? informe.escritas[tabName] : null;

  if (typeof written === 'number') {
    // Sheets cannot express an empty A2:A1 range. A single blank row still makes
    // every aggregate used here return zero when the source has no records.
    return Math.max(firstRow, firstRow + written - 1);
  }

  var sheet = sheetByName(tabName, false);
  var physicalLast = sheet.getLastRow();

  if (physicalLast < firstRow) return firstRow;

  var values = sheet
    .getRange(firstRow, firstColumn, physicalLast - firstRow + 1, width)
    .getValues();

  // Count is not enough here: a blank internal row must not shorten the bound.
  for (var row = values.length - 1; row >= 0; row -= 1) {
    if (rowHasValue(values[row])) return firstRow + row;
  }

  return firstRow;
}

/** Replaces only same-column ranges that belong to the named data tab. */
function acotarRangosFormula(formula, dataTab, firstRow, lastRow) {
  var pattern = new RegExp(
    '(' + escapeRegex(formulaSheetPrefix(dataTab)) +
      ')\\$?([A-Z]+)(?:\\$?\\d+)?:\\$?([A-Z]+)(?:\\$?\\d+)?',
    'g'
  );

  return formula.replace(pattern, function (match, prefix, firstColumn, lastColumn) {
    if (firstColumn !== lastColumn) return match;

    return prefix + '$' + firstColumn + '$' + firstRow + ':$' + lastColumn + '$' + lastRow;
  });
}

/**
 * Bounds aggregate formulas without touching values or the masters that share
 * those report tabs. Existing bounded ranges are refreshed to the new last row,
 * so the operation is both idempotent and valid after a shorter/larger import.
 */
function acotarFormulasAgregacion(reportTab, dataTab, firstRow, lastRow) {
  var sheet = sheetByName(reportTab, false);
  var range = sheet.getDataRange();
  var formulas = range.getFormulas();
  var values = range.getValues();
  var changedCells = [];
  var changed = 0;

  for (var row = 0; row < formulas.length; row += 1) {
    changedCells[row] = [];

    for (var column = 0; column < formulas[row].length; column += 1) {
      var formula = formulas[row][column];

      if (!/(?:COUNTIFS|SUMIFS)\s*\(/i.test(formula)) continue;

      var repaired = acotarRangosFormula(formula, dataTab, firstRow, lastRow);

      if (repaired !== formula) {
        formulas[row][column] = repaired;
        changedCells[row].push(column);
        changed += 1;
      }
    }
  }

  // One write per safe row segment instead of one remote call per formula.
  // Adjacent repairs may span cells only when those gaps are genuinely blank;
  // report values and hand-kept masters are therefore never rewritten.
  for (var writeRow = 0; writeRow < changedCells.length; writeRow += 1) {
    var columns = changedCells[writeRow];
    var start = 0;

    while (start < columns.length) {
      var firstColumn = columns[start];
      var lastColumn = firstColumn;
      var next = start + 1;

      while (next < columns.length) {
        var candidate = columns[next];
        var safeGap = true;

        for (var gap = lastColumn + 1; gap < candidate; gap += 1) {
          if (
            formulas[writeRow][gap] !== '' ||
            (values[writeRow][gap] !== '' && values[writeRow][gap] !== null)
          ) {
            safeGap = false;
            break;
          }
        }

        if (!safeGap) break;

        lastColumn = candidate;
        next += 1;
      }

      sheet
        .getRange(writeRow + 1, firstColumn + 1, 1, lastColumn - firstColumn + 1)
        .setFormulas([formulas[writeRow].slice(firstColumn, lastColumn + 1)]);
      start = next;
    }
  }

  return changed;
}

/** Changes a same-column range while retaining its absolute markers and rows. */
function cambiarColumnaRango(formula, dataTab, currentColumn, newColumn) {
  var pattern = new RegExp(
    '(' + escapeRegex(formulaSheetPrefix(dataTab)) + ')(\\$?)' + currentColumn +
      '(\\$?\\d*)?:(\\$?)' + currentColumn + '(\\$?\\d*)?',
    'g'
  );

  return formula.replace(pattern, function (match, prefix, firstDollar, firstRow, lastDollar, lastRow) {
    return prefix + firstDollar + newColumn + (firstRow || '') + ':' +
      lastDollar + newColumn + (lastRow || '');
  });
}

function filaSemantica(sheet, column, label, firstRow) {
  var start = firstRow || 1;
  var last = sheet.getLastRow();

  if (last < start) return 0;

  var values = sheet.getRange(start, column, last - start + 1, 1).getValues();

  for (var row = 0; row < values.length; row += 1) {
    if (normalize(values[row][0]) === normalize(label)) return start + row;
  }

  return 0;
}

/** Repairs the positions block from its labels instead of relying on rows 11-13. */
function repararPosiciones(sheet) {
  var positionsRow = filaSemantica(sheet, 3, 'Posiciones', 1);
  var originsRow = positionsRow > 0 ? filaSemantica(sheet, 3, 'Origen', positionsRow + 1) : 0;
  var dataTabs = {
    'EN VUELO': TAB.peticionesDatos,
    'LIBERADAS DURANTE LA SEMANA': TAB.liberadas,
    'GESTIONADAS DURANTE LA SEMANA': TAB.gestionadas
  };
  var changed = 0;

  if (originsRow === 0) throw new Error('No se encontró el bloque semántico de Posiciones.');

  for (var row = originsRow + 1; row <= sheet.getLastRow(); row += 1) {
    var state = normalize(sheet.getRange(row, 3).getValue());
    var dataTab = dataTabs[state];

    if (!dataTab) continue;

    for (var column = 4; column <= 7; column += 1) {
      var cell = sheet.getRange(row, column);
      var formula = cell.getFormula();
      var repaired = cambiarColumnaRango(formula, dataTab, 'P', 'S');

      if (repaired !== formula) {
        cell.setFormula(repaired);
        changed += 1;
      }
    }
  }

  return changed;
}

/** Restores the semantic Total row after the weekly template overwrites it. */
function repararTotalTopCinco(sheet) {
  var headerRow = filaSemantica(sheet, 1, 'Categorization Tier 1', 1);
  var totalRow = headerRow > 0 ? filaSemantica(sheet, 1, 'Total', headerRow + 1) : 0;

  if (headerRow === 0 || totalRow <= headerRow + 1) {
    throw new Error('No se encontró la fila Total del Top 5 tras sus categorías.');
  }

  var formulas = [];

  for (var column = 3; column <= 19; column += 1) {
    var letter = columnLetters(column);
    formulas.push('=SUM(' + letter + (headerRow + 1) + ':' + letter + (totalRow - 1) + ')');
  }

  var target = sheet.getRange(totalRow, 3, 1, formulas.length);
  var current = target.getFormulas()[0];

  if (current.join('\u0000') === formulas.join('\u0000')) return 0;

  target.setFormulas([formulas]);
  return formulas.length;
}

/**
 * Idempotent repairs for formula defects proven against the clean workbook.
 * It is called after every data write because that write restores the numeric
 * Total row from the template, and from initialization as a safe migration.
 */
function repararFormulas(informe) {
  var changes = 0;
  var requests = sheetByName(TAB.peticionesInforme, false);
  var g6 = requests.getRange('G6');
  var g6Formula = g6.getFormula();
  var fixedG6 = g6Formula.replace(/#REF!/g, '$G$1');

  if (fixedG6 !== g6Formula) {
    g6.setFormula(fixedG6);
    changes += 1;
  }

  var d4 = requests.getRange('D4');
  var d4Formula = d4.getFormula();
  var fixedD4 = d4Formula.replace(/-E5-F5-G5/g, '-E4-F4-G4');

  if (fixedD4 !== d4Formula) {
    d4.setFormula(fixedD4);
    changes += 1;
  }

  changes += repararPosiciones(requests);
  changes += repararTotalTopCinco(sheetByName(TAB.topCincoDatos, false));

  changes += acotarFormulasAgregacion(
    TAB.workOrdersInforme,
    TAB.workOrdersDatos,
    2,
    ultimaFilaEscrita(informe, TAB.workOrdersDatos, 2, 1, 15)
  );
  changes += acotarFormulasAgregacion(
    TAB.citasInforme,
    TAB.citasDatos,
    2,
    ultimaFilaEscrita(informe, TAB.citasDatos, 2, 1, 8)
  );
  // Hoja 19 uses SUMIFS rather than COUNTIFS, but has the same full-column
  // defect and is deliberately handled by the same source-scoped transform.
  changes += acotarFormulasAgregacion(
    TAB.imacsInforme,
    TAB.imacsDatos,
    2,
    ultimaFilaEscrita(informe, TAB.imacsDatos, 2, 1, 7)
  );

  return changes;
}

/* -------------------------------------------------------------------------- */
/* Aggregation and PLANO                                                       */
/* -------------------------------------------------------------------------- */

var SECTION = {
  edificios: 'EDIFICIOS',
  incidencias: 'INCIDENCIAS',
  encuestas: 'ENCUESTAS',
  workOrders: 'WORKORDERS',
  peticiones: 'PETICIONES',
  peticionesProducto: 'PETICIONESPRODUCTO',
  peticionesAnual: 'PETICIONESANUAL',
  citas: 'CITAS',
  citasAnual: 'CITASANUAL',
  imacs: 'IMACS'
  ,renove: 'RENOVE'
  ,hic: 'HIC'
  ,comparativas: 'COMPARATIVAS'
  ,slas: 'SLAS'
  ,incidenciasOnsite: 'INCIDENCIASONSITE'
  ,peticionesMes: 'PETICIONESMES'
};

var SECTION_ORDER = [
  'edificios',
  'incidencias',
  'encuestas',
  'workOrders',
  'peticiones',
  'peticionesProducto',
  'peticionesAnual',
  'citas',
  'citasAnual',
  'renove',
  'hic',
  'comparativas',
  'slas',
  'incidenciasOnsite',
  'peticionesMes',
  'imacs'
];

/** Adds amount to one aggregate tuple. The separator cannot occur in a sheet cell. */
function bump(buckets, keys, amount) {
  var key = keys.join('\u0000');

  buckets[key] = (buckets[key] || 0) + amount;
}

/** Stable aggregate rows, ready for the fixed-order text contract. */
function rows(buckets) {
  var out = [];

  for (var key in buckets) {
    if (Object.prototype.hasOwnProperty.call(buckets, key)) {
      out.push(key.split('\u0000').concat([buckets[key]]));
    }
  }

  return out.sort(function (left, right) {
    var a = left.join('\t');
    var b = right.join('\t');

    return a < b ? -1 : a > b ? 1 : 0;
  });
}

/** ISO week number, resolved through Thursday like the server parser. */
function isoWeekNumber(date) {
  var day = (date.getUTCDay() + 6) % 7;
  var thursday = new Date(date.getTime() + (3 - day) * 86400000);
  var firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  var firstOffset = (firstThursday.getUTCDay() + 6) % 7;
  var firstWeekThursday = new Date(firstThursday.getTime() + (3 - firstOffset) * 86400000);

  return 1 + Math.round((thursday.getTime() - firstWeekThursday.getTime()) / (7 * 86400000));
}

function monthLabel(date) {
  return date.getUTCFullYear() + '/' + pad2(date.getUTCMonth() + 1);
}

function monthStart(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function shiftMonthLabel(month, offset) {
  var match = /^(\d{4})\/(\d{2})$/.exec(month);
  if (!match) return '';

  return monthLabel(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + offset, 1)));
}

/**
 * Latest month of the small 3-3 HIC series. Do not scan the raw Work Orders
 * and Citas grids here: they contain tens of thousands of rows and do not own
 * the reporting month for relative comparison/SLA tables.
 */
function templateReferenceMonth(grids) {
  var source = monthlySource(grids, '3-3');
  var data = sourceRows(source);
  var latest = '';

  for (var rowIndex = 0; rowIndex < data.length; rowIndex += 1) {
    var date = toDate((data[rowIndex] || [])[0]);
    var month = date ? monthLabel(date) : '';

    if (month > latest) latest = month;
  }

  return latest;
}

function periodCells(date) {
  return [isoDate(date), monthLabel(date), isoWeekNumber(date)];
}

/** DD/MM/YYYY used by the yearly IMAC book, whose dates are not American. */
function imacDate(value) {
  var parsed = toDate(value);

  if (parsed && parsed.getUTCFullYear() >= 2000 && parsed.getUTCFullYear() <= 2100) return parsed;

  var match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text(value));

  if (!match || Number(match[3]) < 2000 || Number(match[3]) > 2100) return null;

  return utcDate(Number(match[3]), Number(match[2]), Number(match[1]));
}

function sourceRows(source) {
  return source.grid.slice(source.headerRow + 1);
}

function valueAt(row, columns, name) {
  var index = columns[normalize(name)];

  return index === undefined ? null : row[index];
}

function within(date, bounds) {
  var time = date.getTime();

  return time >= bounds.monday.getTime() && time <= bounds.sunday.getTime();
}

function peticionOrigin(product) {
  var value = normalize(product);

  if (value.indexOf('BBVA TECHNOLOGY') >= 0) return 'BBVA Tech';
  if (value.indexOf('APPLE DAAS') >= 0) return 'DAAS APPLE';
  if (
    value === 'PORTATIL' ||
    value.indexOf('PORTATIL ESTANDAR') >= 0 ||
    value.indexOf('PORTATIL WINDOWS ONBOARDING') >= 0 ||
    value.indexOf('TECLADO Y RATON INALAMBRICOS') >= 0
  ) {
    return 'RENOVE';
  }

  return 'On Site';
}

function agregarPeticiones(found, extraction, peticiones, productos) {
  var specs = [
    ['backlog', 'En vuelo'],
    ['liberadas', 'Liberadas'],
    ['gestionadas', 'Gestionadas']
  ];
  var period = periodCells(weekBounds(extraction).monday);

  for (var specIndex = 0; specIndex < specs.length; specIndex += 1) {
    var entry = found[specs[specIndex][0]];
    var state = specs[specIndex][1];

    if (!entry) continue;

    var source = firstSource(entry, state);
    var data = sourceRows(source);

    for (var rowIndex = 0; rowIndex < data.length; rowIndex += 1) {
      var row = data[rowIndex] || [];
      var product = text(valueAt(row, source.columns, 'Denominación Producto')) || 'Sin producto';
      var origin = peticionOrigin(product);
      var quantity = toNumber(valueAt(row, source.columns, 'Cantidad'));

      bump(peticiones, period.concat([origin, state, 'Peticiones']), 1);
      bump(peticiones, period.concat([origin, state, 'Posiciones']), quantity > 0 ? quantity : 1);

      // The workbook's product top-ten is the backlog, not movements already released/managed.
      if (specs[specIndex][0] === 'backlog') {
        bump(productos, period.concat([product, state]), 1);
      }
    }
  }
}

/**
 * Monthly matrix columns. Apple stays out of the Windows bucket: a product
 * that says Apple DAAS is Renove Apple even when the rest of the name would
 * also match a Windows portable.
 */
function peticionOrigenMensual(product) {
  var value = normalize(product);

  if (value.indexOf('APPLE DAAS') >= 0 || value.indexOf('DAAS APPLE') >= 0) return 'Renove Apple';
  if (value.indexOf('BBVA TECHNOLOGY') >= 0) return 'Technology';
  if (
    value === 'PORTATIL' ||
    value.indexOf('PORTATIL ESTANDAR') >= 0 ||
    value.indexOf('PORTATIL WINDOWS ONBOARDING') >= 0 ||
    value.indexOf('TECLADO Y RATON INALAMBRICOS') >= 0
  ) {
    return 'Renove Windows';
  }

  return 'On Site';
}

/**
 * Full-month request files. One data row is one count, the same grain as the
 * annual grid (August 2026 is 776 rows, not a sum of Cantidad). Missing files
 * leave the section empty; the weekly snapshot is not a substitute.
 *
 * The trio is filed under the month it covers, not the day the script runs:
 * the close is uploaded once the month is over. That month is the one most
 * Fecha liberación (LiberadasMes) and Fecha Gestionado (GestionadasMes) dates
 * fall in. BacklogMes is a stock with no such date and follows the other two;
 * with neither, the month before the extraction.
 */
function peticionesMesMonth(found, extraction) {
  var dated = [
    ['liberadasMes', 'Liberadas', 'Fecha liberación'],
    ['gestionadasMes', 'Gestionadas', 'Fecha Gestionado']
  ];
  var counts = {};
  var best = null;

  for (var index = 0; index < dated.length; index += 1) {
    var entry = found[dated[index][0]];

    if (!entry) continue;

    var source = firstSource(entry, dated[index][1]);
    var data = sourceRows(source);

    for (var rowIndex = 0; rowIndex < data.length; rowIndex += 1) {
      var date = citaDate(valueAt(data[rowIndex] || [], source.columns, dated[index][2]));

      if (!date || !fechaOperativa(date)) continue;

      var label = monthLabel(monthStart(date));

      counts[label] = (counts[label] || 0) + 1;

      if (best === null || counts[label] > counts[best]) best = label;
    }
  }

  if (best !== null) return best;

  return shiftMonthLabel(monthLabel(monthStart(toDate(extraction))), -1);
}

function agregarPeticionesMes(found, extraction, peticionesMes) {
  var specs = [
    ['backlogMes', 'Backlog'],
    ['liberadasMes', 'Liberadas'],
    ['gestionadasMes', 'Gestionadas']
  ];
  var month = peticionesMesMonth(found, extraction);

  for (var specIndex = 0; specIndex < specs.length; specIndex += 1) {
    var entry = found[specs[specIndex][0]];

    if (!entry) continue;

    var source = firstSource(entry, specs[specIndex][1]);
    var data = sourceRows(source);

    for (var rowIndex = 0; rowIndex < data.length; rowIndex += 1) {
      var row = data[rowIndex] || [];
      var product = text(valueAt(row, source.columns, 'Denominación Producto')) || 'Sin producto';

      bump(peticionesMes, [month, peticionOrigenMensual(product), specs[specIndex][1]], 1);
    }
  }
}

/**
 * Tab 7-7 of the weekly template: the on-site incident list.
 *
 * The service's rule, column by column: Abiertas is every row whose Abierta
 * date (column C) falls in the month, whatever its Estado; Resueltas is the
 * same filter narrowed to the resolved rows; Backlog is every Pendiente row of
 * any month, the stock of this extract, written on the extraction month.
 * Resolved means Resuelto or Cerrado: a ticket turns Cerrado a few days after
 * it is resolved, so on 2026-09-28 August holds 413 Cerrado and 0 Resuelto.
 * Incident numbers and descriptions stay in the sheet.
 */
function listadoOnsite(found) {
  var grids = [];
  var kinds = ['encuestas', 'workOrders', 'citas'];

  for (var index = 0; index < kinds.length; index += 1) {
    var entry = found[kinds[index]];

    if (entry && entry.grids && entry.grids.length > grids.length) grids = entry.grids;
  }

  for (var gridIndex = 0; gridIndex < grids.length; gridIndex += 1) {
    var name = normalize(grids[gridIndex].name);

    if (name.indexOf('7-7') === 0 || name.indexOf('DASHBOARD ONSITE') >= 0) return grids[gridIndex];
  }

  return null;
}

/** Resuelto or Cerrado: the states the service counts as done. */
function esEstadoResuelto(estado) {
  var value = normalize(estado);

  return value === 'RESUELTO' || value === 'CERRADO';
}

function agregarIncidenciasOnsite(found, extraction, incidenciasOnsite) {
  var listed = listadoOnsite(found);

  if (!listed) return;

  var header = listed.grid[0] || [];
  var columns = headerIndex(header);
  var estadoAt = columns[normalize('Estado')];
  var abiertaAt = columns[normalize('Abierta')];

  if (estadoAt === undefined || abiertaAt === undefined) {
    throw new Error('La pestaña 7-7 no trae Estado y Abierta.');
  }

  var pending = 0;

  for (var rowIndex = 1; rowIndex < listed.grid.length; rowIndex += 1) {
    var row = listed.grid[rowIndex] || [];
    var estado = text(row[estadoAt]);
    var abierta = citaDate(row[abiertaAt]);

    if (abierta && fechaOperativa(abierta)) {
      var mes = monthLabel(monthStart(abierta));

      bump(incidenciasOnsite, [mes, 'Abiertas'], 1);

      if (esEstadoResuelto(estado)) bump(incidenciasOnsite, [mes, 'Resueltas'], 1);
    }

    if (normalize(estado) === 'PENDIENTE') pending += 1;
  }

  var extractionDate = toDate(extraction);

  if (!extractionDate) return;

  bump(incidenciasOnsite, [monthLabel(monthStart(extractionDate)), 'Backlog'], pending);
}

function agregarIncidencias(found, incidencias) {
  var grids = templateGrids(found);
  var series = [
    [monthlySource(grids, '3-3'), 'BBVA'],
    [monthlySource(grids, '4-4'), 'BBVA TECH']
  ];
  var metrics = ['Resueltas', 'Asignadas', 'Asignaciones'];

  for (var seriesIndex = 0; seriesIndex < series.length; seriesIndex += 1) {
    var source = series[seriesIndex][0];
    var scope = series[seriesIndex][1];
    var data = sourceRows(source);

    for (var rowIndex = 0; rowIndex < data.length; rowIndex += 1) {
      var parsedDate = toDate(data[rowIndex][0]);

      if (!parsedDate) continue;

      var date = monthStart(parsedDate);

      for (var metricIndex = 0; metricIndex < metrics.length; metricIndex += 1) {
        var amount = toNumber(data[rowIndex][metricIndex + 1]);

        bump(
          incidencias,
          periodCells(date).concat(['', '', scope + ' - ' + metrics[metricIndex], '']),
          amount
        );
      }
    }
  }

  var top = topFiveSource(grids);
  var header = top.grid[0] || [];

  for (var categoryRow = top.headerRow + 1; categoryRow < top.grid.length; categoryRow += 1) {
    var category = text((top.grid[categoryRow] || [])[0]);

    if (category === '' || normalize(category) === 'TOTAL') continue;

    for (var column = 2; column < header.length; column += 1) {
      var categoryDate = toDate(header[column]);

      if (!categoryDate) continue;

      bump(
        incidencias,
        periodCells(monthStart(categoryDate)).concat([category, '', 'Incidencias', '']),
        toNumber((top.grid[categoryRow] || [])[column])
      );
    }
  }
}

function agregarEncuestas(found, encuestas) {
  if (!found.encuestas) return;

  var source = firstSource(found.encuestas, 'Encuestas');
  var header = source.grid[source.headerRow] || [];
  var monthAt = source.columns[normalize('Fecha')];
  var scoreAt = columnLikeIndex(header, 'Nivel de satis');
  var data = sourceRows(source);

  if (monthAt === undefined || scoreAt < 0) {
    throw new Error('El template de encuestas no trae mes y valoración para PLANO.');
  }

  for (var rowIndex = 0; rowIndex < data.length; rowIndex += 1) {
    var date = toDate((data[rowIndex] || [])[monthAt]);
    var score = text((data[rowIndex] || [])[scoreAt]);

    if (!date || score === '') continue;

    date = monthStart(date);
    bump(encuestas, [isoDate(date), monthLabel(date), score], 1);
  }
}

function agregarWorkOrders(found, workOrders) {
  if (!found.workOrders) return;

  var source = firstSource(found.workOrders, 'Work Orders');
  var data = sourceRows(source);
  var technicianLookup = readLookup(TAB.workOrdersDatos, 25, 26, 2);

  for (var rowIndex = 0; rowIndex < data.length; rowIndex += 1) {
    var row = data[rowIndex] || [];
    var date = toDate(valueAt(row, source.columns, 'Submit Date'));

    if (!date) continue;

    var technician = valueAt(row, source.columns, 'Submitter');
    var resolved = technicianLookup[normalize(technician)];
    var building = resolved ? text(resolved[0]) : '#N/A';
    var kind = text(valueAt(row, source.columns, 'Categorization Tier 2')) || 'Sin tipo';

    bump(workOrders, periodCells(date).concat([building, kind]), 1);
  }
}

/**
 * Appointment dates are American (MM/DD/YYYY, with or without time). A Date
 * cell or an Excel serial still goes through toDate; text is tried as US
 * before the European fallback so 08/21/2026 is 21 August, not dropped.
 */
var US_CITA = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i;

function citaDate(value) {
  if (value instanceof Date || (typeof value === 'number' && isFinite(value))) {
    return toDate(value);
  }

  var raw = String(value == null ? '' : value).trim();

  if (raw === '') return null;

  var us = US_CITA.exec(raw);

  if (us) {
    var parsed = utcDate(Number(us[3]), Number(us[1]), Number(us[2]));

    if (parsed) return parsed;
  }

  return toDate(value);
}

/**
 * An appointment counts once it is Resuelto or Cerrado, the same rule as the
 * on-site incidents; Cancelado, Asignado and En curso stay out. The tab must
 * carry Estado: counting without it would pass cancellations as served.
 */
function citaAtendida(row, columns) {
  if (columns[normalize('Estado')] === undefined) {
    throw new Error('La pestaña de citas no trae Estado.');
  }

  return esEstadoResuelto(valueAt(row, columns, 'Estado'));
}

function agregarCitas(found, extraction, citas, citasAnual) {
  if (!found.citas) return;

  var source = firstSource(found.citas, 'Citas SmartTech');
  var data = sourceRows(source);
  var cutoff = isoDate(extraction);

  for (var rowIndex = 0; rowIndex < data.length; rowIndex += 1) {
    var row = data[rowIndex] || [];
    var booked = citaDate(valueAt(row, source.columns, 'Cita_Previa'));
    var walkup = booked ? null : citaDate(valueAt(row, source.columns, 'Walkup'));
    var date = booked || walkup;
    var building = text(valueAt(row, source.columns, 'Smart_Tech'));

    if (!date || isoDate(date) > cutoff || building === '' || normalize(building).indexOf('TELEFONIA') >= 0) {
      continue;
    }

    if (!citaAtendida(row, source.columns)) continue;

    bump(citas, periodCells(date).concat([building, booked ? 'Con Cita' : 'Sin Cita']), 1);
    bump(citasAnual, [String(date.getUTCFullYear()), monthLabel(date)], 1);
  }
}

/** HIC total series and its category pivot, kept separate from daily incidences. */
function agregarHic(found, hic) {
  var grids = templateGrids(found);
  var sources = [monthlySource(grids, '3-3'), monthlySource(grids, '4-4')];
  var metrics = ['Resueltas', 'Asignadas', 'Asignaciones'];

  for (var sourceIndex = 0; sourceIndex < sources.length; sourceIndex += 1) {
    var source = sources[sourceIndex];
    var data = sourceRows(source);

    for (var rowIndex = 0; rowIndex < data.length; rowIndex += 1) {
      var date = toDate((data[rowIndex] || [])[0]);

      if (!date) continue;

      for (var metricIndex = 0; metricIndex < metrics.length; metricIndex += 1) {
        bump(hic, [source.name, monthLabel(monthStart(date)), '', metrics[metricIndex]], toNumber((data[rowIndex] || [])[metricIndex + 1]));
      }
    }
  }

  var pivot = topFiveSource(grids);
  var header = mergedHeaderRow(pivot.grid, pivot.headerRow);
  var months = 0;

  for (var probe = 0; probe < header.length; probe += 1) {
    if (MONTH_TEXT.test(text(header[probe]))) months += 1;
  }

  // Finding the tab and then reading no month out of it is the failure this
  // whole helper exists to prevent, so it stops instead of publishing a HIC
  // section with the total series and no breakdown behind it.
  if (months === 0) {
    throw new Error('El bloque 2-2 no expone ningún mes en su cabecera.');
  }

  for (var categoryRow = pivot.headerRow + 1; categoryRow < pivot.grid.length; categoryRow += 1) {
    var category = text((pivot.grid[categoryRow] || [])[0]);

    if (category === '' || normalize(category) === 'TOTAL') continue;

    for (var column = 0; column < header.length; column += 1) {
      var month = text(header[column]);

      if (!MONTH_TEXT.test(month)) continue;

      bump(hic, [pivot.name, month, category, 'Incidencias'], toNumber((pivot.grid[categoryRow] || [])[column]));
    }
  }
}

function agregarComparativas(found, comparativas) {
  var grids = templateGrids(found);
  var reference = templateReferenceMonth(grids);

  if (reference === '') return;

  for (var gridIndex = 0; gridIndex < grids.length; gridIndex += 1) {
    var grid = grids[gridIndex].grid;
    var header = grid[0] || [];
    var offsets = [];

    for (var column = 0; column < header.length; column += 1) {
      var label = normalize(header[column]);

      if (label === 'MES ACTUAL' || label === 'MESACTUAL') offsets.push([column, 0]);
      if (label.indexOf('MES ANTERIOR') === 0 || label.indexOf('MESANTERIOR') === 0) offsets.push([column, -1]);
      if (label.indexOf('HACE DOS') === 0 || label.indexOf('HACEDOS') === 0) offsets.push([column, -2]);
    }

    if (offsets.length === 0) continue;

    for (var rowIndex = 1; rowIndex < grid.length; rowIndex += 1) {
      var element = text((grid[rowIndex] || [])[0]);

      if (element === '' || normalize(element) === 'TOTAL') continue;

      for (var offsetIndex = 0; offsetIndex < offsets.length; offsetIndex += 1) {
        var pair = offsets[offsetIndex];
        var raw = (grid[rowIndex] || [])[pair[0]];

        if (text(raw).toUpperCase() === 'N/A') continue;

        bump(comparativas, [grids[gridIndex].name, element, shiftMonthLabel(reference, pair[1])], toNumber(raw));
      }
    }
  }
}

function agregarSlas(found, slas) {
  var grids = templateGrids(found);
  var reference = templateReferenceMonth(grids);

  if (reference === '') return;

  for (var gridIndex = 0; gridIndex < grids.length; gridIndex += 1) {
    var grid = grids[gridIndex].grid;
    var headerAt = -1;

    // SLA identifies itself in the two header rows. Searching the raw grids
    // below would repeatedly traverse the 24k Work Orders and 45k Citas rows.
    for (var rowIndex = 0; rowIndex < Math.min(grid.length, 3); rowIndex += 1) {
      if (normalize((grid[rowIndex] || [])[0]) === 'SVTTITLE') { headerAt = rowIndex; break; }
    }

    if (headerAt < 0) continue;

    var headers = headerIndex(mergedHeaderRow(grid, headerAt));
    var met = headers[normalize('Cumplido')];
    var missed = headers[normalize('Incumplido')];
    var total = headers[normalize('Total')];

    // The tab named itself as an SLA block, so missing columns are a defect of
    // this reader and not an absent section. Failing here is what stops the
    // PLANO from silently shipping without SLAs.
    if (met === undefined || missed === undefined) {
      throw new Error(
        'La pestaña ' + grids[gridIndex].name + ' declara SVTTitle pero no expone Cumplido e Incumplido.'
      );
    }

    var month = normalize(grids[gridIndex].name).indexOf('MES AN') >= 0 ? shiftMonthLabel(reference, -1) : reference;

    for (var dataIndex = headerAt + 1; dataIndex < grid.length; dataIndex += 1) {
      var row = grid[dataIndex] || [];
      var svt = text(row[0]);

      if (svt === '' || normalize(svt) === 'TOTAL') continue;

      var metValue = leadingNumber(row[met]);
      var missedValue = leadingNumber(row[missed]);
      bump(slas, [month, svt, metValue, missedValue], total === undefined ? metValue + missedValue : leadingNumber(row[total]));
    }
  }
}

/**
 * Months the Acumuladas export does not cover. August 2026 is the last
 * published figure before that file became the weekly source.
 */
var PETICIONES_ANUAL_SEMILLA = [{ anio: 2026, mes: 8, peticiones: 776 }];

/** First data column of the annual-requests grid: M, year headers on row 3. */
var PETICIONES_ANUAL_FIRST_YEAR_COLUMN = 13;

/** L4:L15 hold Enero…Diciembre. */
var PETICIONES_ANUAL_MONTH_ROWS = 12;

/**
 * Consecutive year headers starting at M3, stopping at the first empty cell
 * or at a cell that is not a year. That stop is what keeps 2027 in R3 from
 * colliding with the "Datos Año" block that already occupies S3:T7.
 */
function aniosConsecutivos(headersFromM) {
  var years = [];

  for (var index = 0; index < headersFromM.length; index += 1) {
    if (text(headersFromM[index]) === '') break;

    var year = yearFromCell(headersFromM[index]);

    if (!year) break;

    years.push({ year: year, column: PETICIONES_ANUAL_FIRST_YEAR_COLUMN + index });
  }

  return years;
}

/**
 * Column for `year` in the annual grid. Reuses M…Q for 2022–2026. The first
 * empty cell after that block (R3) receives 2027. A non-empty neighbour — S3
 * today holds 2022 of "Datos Año" — is a hard stop, not a cell to overwrite.
 */
function columnaParaAnio(years, year, nextCellRaw) {
  for (var index = 0; index < years.length; index += 1) {
    if (years[index].year === year) return years[index].column;
  }

  var nextColumn =
    years.length === 0
      ? PETICIONES_ANUAL_FIRST_YEAR_COLUMN
      : years[years.length - 1].column + 1;

  if (text(nextCellRaw) !== '') {
    throw new Error(
      'No hay columna libre para el año ' +
        year +
        ' en 2.2.1 Volum de peticiones (Informe): ' +
        columnLetters(nextColumn) +
        '3 está ocupada.'
    );
  }

  return nextColumn;
}

function filaMesPeticiones(labels, monthNumber) {
  for (var index = 0; index < labels.length; index += 1) {
    if (numeroMesEspanol(labels[index][0]) === monthNumber) return 4 + index;
  }

  throw new Error(
    'L4:L15 de 2.2.1 Volum de peticiones (Informe) no contiene el mes ' + monthNumber + '.'
  );
}

/**
 * Positions per YYYY/MM from Fecha Gestionado. One row is one position, even
 * when several share the same Nº Petición. Rows without a usable date are
 * skipped rather than assigned to the extraction month.
 */
function contarPeticionesAcumuladas(found) {
  var result = { counts: {}, filas: 0, sinFecha: 0 };

  if (!found || !found.acumuladas || !found.acumuladas.sheets || found.acumuladas.sheets.length === 0) {
    return result;
  }

  var source = found.acumuladas.sheets[0];
  var header = source.grid[source.headerRow] || [];
  var columns = headerIndex(header);
  var dateAt = columns[normalize('Fecha Gestionado')];

  if (dateAt === undefined) {
    throw new Error('Acumuladas no trae la columna Fecha Gestionado.');
  }

  for (var rowIndex = source.headerRow + 1; rowIndex < source.grid.length; rowIndex += 1) {
    var row = source.grid[rowIndex] || [];

    if (!rowHasValue(row)) continue;

    result.filas += 1;

    var date = toDate(row[dateAt]);

    if (!date || !fechaOperativa(date)) {
      result.sinFecha += 1;
      continue;
    }

    var key = date.getUTCFullYear() + '/' + pad2(date.getUTCMonth() + 1);

    result.counts[key] = (result.counts[key] || 0) + 1;
  }

  return result;
}

/** Seed first, then the live Acumuladas counts, which win on overlap. */
function totalesPeticionesAnual(found) {
  var totals = {};
  var seed = PETICIONES_ANUAL_SEMILLA;

  for (var index = 0; index < seed.length; index += 1) {
    totals[seed[index].anio + '/' + pad2(seed[index].mes)] = seed[index].peticiones;
  }

  var counted = contarPeticionesAcumuladas(found);
  var keys = Object.keys(counted.counts);

  for (var keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
    totals[keys[keyIndex]] = counted.counts[keys[keyIndex]];
  }

  return totals;
}

function escribirCeldaPeticionAnual(sheet, year, month, value) {
  var headers = sheet.getRange(3, PETICIONES_ANUAL_FIRST_YEAR_COLUMN, 1, 20).getValues()[0];
  var years = aniosConsecutivos(headers);
  var nextIndex = years.length;
  var nextRaw = nextIndex < headers.length ? headers[nextIndex] : '';
  var column = columnaParaAnio(years, year, nextRaw);

  if (yearFromCell(sheet.getRange(3, column).getValue()) !== year) {
    sheet.getRange(3, column).setValue(year);
  }

  var labels = sheet.getRange(4, 12, PETICIONES_ANUAL_MONTH_ROWS, 1).getValues();
  var row = filaMesPeticiones(labels, month);

  sheet.getRange(row, column).setValue(value);
}

/**
 * Writes the annual-requests grid of 2.2.1 (Informe). Only the year/month
 * cells of that block are touched; the rest of the (Informe) tab stays as it
 * is. Months absent from both the seed and Acumuladas are left untouched.
 */
function escribirPeticionesAnual(found, informe) {
  var sheet = sheetByName(TAB.peticionesInforme, false);

  if (!sheet) {
    throw new Error('Falta la pestaña 2.2.1 Volum de peticiones (Informe).');
  }

  var counted = contarPeticionesAcumuladas(found);
  var totals = totalesPeticionesAnual(found);
  var keys = Object.keys(totals).sort();

  for (var index = 0; index < keys.length; index += 1) {
    var parts = keys[index].split('/');
    var year = Number(parts[0]);
    var month = Number(parts[1]);

    escribirCeldaPeticionAnual(sheet, year, month, totals[keys[index]]);
  }

  if (informe) {
    informe.peticionesAnualCeldas = keys.length;
    informe.peticionesAnualFilas = counted.filas;
    informe.peticionesAnualSinFecha = counted.sinFecha;
  }
}

/** AG: first monthly SmartTech column of 2.3.1 (Informe). */
var CITAS_MENSUAL_FIRST_COLUMN = 33;

/** AE4:AE22 / A4:A22: the nineteen published SmartTech points. */
var CITAS_MENSUAL_FIRST_ROW = 4;
var CITAS_MENSUAL_LAST_ROW = 22;

/**
 * Months written as values from the template. Earlier monthly columns stay as
 * the weekly SUM formulas the book already has.
 */
var CITAS_MENSUAL_DESDE = '2026/08';

function sitioSmartTech(building) {
  var cleaned = text(building).replace(/^\s*smart\s*tech\s+/i, '').trim();

  return cleaned === '' ? text(building) : cleaned;
}

function aliasCitaEdificio(building) {
  return normalize(building).indexOf('ZELANDIA') >= 0 ? 'Smart Tech Seguros Tablas I' : building;
}

function esCitaFueraDeInforme(building) {
  var key = normalize(building);

  return key.indexOf('TELEFONIA') >= 0 || key.indexOf('ANILLO') >= 0 || key.indexOf('OPPLUS') >= 0;
}

function mesDeCabeceraCitas(value) {
  if (typeof value === 'number' && isFinite(value) && value >= 2000 && value <= 2100) {
    return '';
  }

  if (value instanceof Date) {
    var fromDate = toDate(value);

    return fromDate ? monthLabel(fromDate) : '';
  }

  var raw = text(value);

  if (MONTH_TEXT.test(raw)) return raw;

  var parsed = citaDate(value) || toDate(value);

  return parsed ? monthLabel(parsed) : '';
}

/**
 * Column where row 4 is "Ene": the annual comparison (AW today). Monthly
 * site columns live to its left; year headers AX…BB sit to its right.
 */
function columnaHistoricoMesesCitas(sheet) {
  var last = Math.min(sheet.getMaxColumns(), 80);
  var width = last - CITAS_MENSUAL_FIRST_COLUMN + 1;

  if (width < 1) return 0;

  var labels = sheet.getRange(4, CITAS_MENSUAL_FIRST_COLUMN, 1, width).getValues()[0];

  for (var index = 0; index < labels.length; index += 1) {
    if (numeroMesEspanol(labels[index]) === 1) {
      return CITAS_MENSUAL_FIRST_COLUMN + index;
    }
  }

  return 0;
}

function primerDiaMes(monthKey) {
  var match = /^(\d{4})\/(\d{2})$/.exec(monthKey);

  if (!match) return null;

  return utcDate(Number(match[1]), Number(match[2]), 1);
}

/**
 * Counts appointments per YYYY/MM and Smart_Tech, using American dates.
 * Telephony is dropped here the same way agregarCitas drops it.
 */
function contarCitasMensuales(found, extraction) {
  var result = { byBuilding: {}, byMonth: {}, filas: 0, sinFecha: 0 };

  if (!found || !found.citas) return result;

  var source = firstSource(found.citas, 'Citas SmartTech');
  var data = sourceRows(source);
  var cutoff = extraction ? isoDate(extraction) : '';
  var columns = source.columns || headerIndex(source.grid[source.headerRow] || []);

  for (var rowIndex = 0; rowIndex < data.length; rowIndex += 1) {
    var row = data[rowIndex] || [];
    var booked = citaDate(valueAt(row, columns, 'Cita_Previa'));
    var walkup = booked ? null : citaDate(valueAt(row, columns, 'Walkup'));
    var date = booked || walkup;
    var building = text(valueAt(row, columns, 'Smart_Tech'));

    if (building === '' || normalize(building).indexOf('TELEFONIA') >= 0) continue;

    if (!citaAtendida(row, columns)) continue;

    if (!date) {
      result.sinFecha += 1;
      continue;
    }

    if (cutoff && isoDate(date) > cutoff) continue;

    result.filas += 1;

    var month = monthLabel(date);

    result.byMonth[month] = (result.byMonth[month] || 0) + 1;

    if (!result.byBuilding[month]) result.byBuilding[month] = {};

    result.byBuilding[month][building] = (result.byBuilding[month][building] || 0) + 1;
  }

  return result;
}

function filasCitasInforme(sheet) {
  var height = CITAS_MENSUAL_LAST_ROW - CITAS_MENSUAL_FIRST_ROW + 1;
  var names = sheet.getRange(CITAS_MENSUAL_FIRST_ROW, 1, height, 3).getValues();
  var shorts = sheet.getRange(CITAS_MENSUAL_FIRST_ROW, 32, height, 1).getValues();
  var rows = [];

  for (var index = 0; index < names.length; index += 1) {
    rows.push({
      row: CITAS_MENSUAL_FIRST_ROW + index,
      full: text(names[index][0]),
      dt: text(names[index][1]),
      shortA: text(names[index][2]),
      shortAf: text(shorts[index][0])
    });
  }

  return rows;
}

function filaCitaEdificio(rows, building) {
  var aliased = aliasCitaEdificio(building);
  var key = normalize(aliased);
  var site = normalize(sitioSmartTech(aliased));

  for (var index = 0; index < rows.length; index += 1) {
    var current = rows[index];
    var full = normalize(current.full);
    var shortAf = normalize(current.shortAf);
    var shortA = normalize(current.shortA);
    var siteFull = normalize(sitioSmartTech(current.full));

    if (full === key || siteFull === site || shortAf === site || shortA === site) {
      return current;
    }
  }

  return null;
}

function asegurarColumnaMesCitas(sheet, monthKey) {
  var hist = columnaHistoricoMesesCitas(sheet);

  if (hist === 0) {
    throw new Error('2.3.1 (Informe) no tiene la columna de meses Ene–Dic del histórico anual.');
  }

  var width = hist - CITAS_MENSUAL_FIRST_COLUMN;
  var headers = sheet.getRange(3, CITAS_MENSUAL_FIRST_COLUMN, 1, width).getValues()[0];
  var empty = 0;

  for (var index = 0; index < headers.length; index += 1) {
    var mes = mesDeCabeceraCitas(headers[index]);
    var column = CITAS_MENSUAL_FIRST_COLUMN + index;

    if (mes === monthKey) return column;

    if (mes === '' && text(headers[index]) === '' && empty === 0) empty = column;
  }

  if (empty > 0) {
    sheet.getRange(3, empty).setValue(primerDiaMes(monthKey)).setNumberFormat('yyyy/mm');
    return empty;
  }

  sheet.insertColumnBefore(hist);
  sheet.getRange(3, hist).setValue(primerDiaMes(monthKey)).setNumberFormat('yyyy/mm');

  return hist;
}

function escribirColumnaCitasMensual(sheet, column, rows, counts) {
  var height = rows.length;
  var values = [];
  var written = 0;

  for (var index = 0; index < height; index += 1) values.push([0]);

  var buildings = Object.keys(counts);

  for (var b = 0; b < buildings.length; b += 1) {
    if (esCitaFueraDeInforme(buildings[b])) continue;

    var target = filaCitaEdificio(rows, buildings[b]);

    if (!target) continue;

    values[target.row - CITAS_MENSUAL_FIRST_ROW][0] += counts[buildings[b]];
    written += counts[buildings[b]];
  }

  sheet.getRange(CITAS_MENSUAL_FIRST_ROW, column, height, 1).setValues(values);

  var totalCell = sheet.getRange(CITAS_MENSUAL_LAST_ROW + 1, column);
  var letter = columnLetters(column);

  if (text(totalCell.getFormula()) === '') {
    totalCell.setFormula(
      '=SUM(' + letter + CITAS_MENSUAL_FIRST_ROW + ':' + letter + CITAS_MENSUAL_LAST_ROW + ')'
    );
  }

  return written;
}

function escribirCeldaCitaAnual(sheet, year, monthNumber, value) {
  var hist = columnaHistoricoMesesCitas(sheet);

  if (hist === 0) {
    throw new Error('2.3.1 (Informe) no tiene la columna de meses Ene–Dic del histórico anual.');
  }

  var yearStart = hist + 1;
  var headers = sheet.getRange(3, yearStart, 1, 12).getValues()[0];
  var years = [];

  for (var index = 0; index < headers.length; index += 1) {
    if (text(headers[index]) === '') break;

    var headerYear = yearFromCell(headers[index]);

    if (!headerYear) break;

    years.push({ year: headerYear, column: yearStart + index });
  }

  var nextRaw = years.length < headers.length ? headers[years.length] : '';
  var nextColumn =
    years.length === 0 ? yearStart : years[years.length - 1].column + 1;
  var column;

  for (var yearIndex = 0; yearIndex < years.length; yearIndex += 1) {
    if (years[yearIndex].year === year) {
      column = years[yearIndex].column;
      break;
    }
  }

  if (!column) {
    if (text(nextRaw) !== '') {
      throw new Error(
        'No hay columna libre para el año ' +
          year +
          ' en 2.3.1 (Informe): ' +
          columnLetters(nextColumn) +
          '3 está ocupada.'
      );
    }

    column = nextColumn;
    sheet.getRange(3, column).setValue(year);
  }

  var labels = sheet.getRange(4, hist, 12, 1).getValues();
  var row = 0;

  for (var labelIndex = 0; labelIndex < labels.length; labelIndex += 1) {
    if (numeroMesEspanol(labels[labelIndex][0]) === monthNumber) {
      row = 4 + labelIndex;
      break;
    }
  }

  if (row === 0) {
    throw new Error('El histórico anual de 2.3.1 (Informe) no contiene el mes ' + monthNumber + '.');
  }

  sheet.getRange(row, column).setValue(value);
}

/**
 * Writes 2.3.1 (Informe) monthly site columns (AT = 2026/08, AU = 2026/09, …)
 * and the matching cells of the annual block (BB11 = August 2026). New months
 * occupy empty columns before "Ene"; if that block is reached, a column is
 * inserted so 2027/2028 stay at BC/BD relative to the years.
 */
function escribirCitasMensuales(found, informe) {
  if (!found || !found.citas) return;

  var sheet = sheetByName(TAB.citasInforme, false);

  if (!sheet) {
    throw new Error('Falta la pestaña 2.3.1 Volum de Citas SmartTech Semanal (Informe).');
  }

  var extraction = informe && informe.extraction ? toDate(informe.extraction) : null;
  var counted = contarCitasMensuales(found, extraction);
  var rows = filasCitasInforme(sheet);
  var months = Object.keys(counted.byMonth).sort();
  var written = 0;
  var unknown = {};

  for (var index = 0; index < months.length; index += 1) {
    if (months[index] < CITAS_MENSUAL_DESDE) continue;

    var column = asegurarColumnaMesCitas(sheet, months[index]);
    var buildings = counted.byBuilding[months[index]] || {};

    escribirColumnaCitasMensual(sheet, column, rows, buildings);

    var year = Number(months[index].slice(0, 4));
    var monthNumber = Number(months[index].slice(5, 7));

    escribirCeldaCitaAnual(sheet, year, monthNumber, counted.byMonth[months[index]]);
    written += 1;

    var names = Object.keys(buildings);

    for (var b = 0; b < names.length; b += 1) {
      if (esCitaFueraDeInforme(names[b])) continue;
      if (!filaCitaEdificio(rows, names[b])) unknown[names[b]] = true;
    }
  }

  if (informe) {
    informe.citasMensualColumnas = written;
    informe.citasMensualFilas = counted.filas;
    informe.desconocidos = informe.desconocidos || [];

    var missing = Object.keys(unknown).sort();

    for (var m = 0; m < missing.length; m += 1) {
      informe.desconocidos.push('SmartTech sin fila en 2.3.1 (Informe): ' + missing[m]);
    }
  }
}

/**
 * Reads the annual-requests grid after it has been written. Width follows the
 * consecutive year headers from M3, so 2027 in R3 is included without walking
 * into the "Datos Año" block at S3.
 */
function agregarPeticionesAnual(peticionesAnual) {
  var sheet = sheetByName(TAB.peticionesInforme, false);

  if (!sheet) return;

  var headerRow = sheet.getRange(3, PETICIONES_ANUAL_FIRST_YEAR_COLUMN, 1, 20).getValues()[0];
  var years = aniosConsecutivos(headerRow);

  if (years.length === 0) return;

  var lastColumn = years[years.length - 1].column;
  var width = lastColumn - 12 + 1;
  var values = sheet.getRange(3, 12, 13, width).getValues();

  for (var rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    var monthNumber = numeroMesEspanol(values[rowIndex][0]);

    if (monthNumber === 0) continue;

    for (var yearIndex = 0; yearIndex < years.length; yearIndex += 1) {
      var year = years[yearIndex].year;
      var raw = values[rowIndex][years[yearIndex].column - 12];

      if (text(raw) === '') continue;

      bump(peticionesAnual, [String(year), year + '/' + pad2(monthNumber)], toNumber(raw));
    }
  }
}

function agregarImacs(found, imacs) {
  if (!found.imac || !found.imac.grids) return;

  for (var gridIndex = 0; gridIndex < found.imac.grids.length; gridIndex += 1) {
    var grid = found.imac.grids[gridIndex].grid;
    var header = grid[0] || [];
    var columns = headerIndex(header);
    var dateAt = columnLikeIndex(header, 'Fecha limite');

    if (dateAt < 0) dateAt = columnLikeIndex(header, 'Fecha solicitud');

    var buildingAt = columns[normalize('Edificio')];
    var jobsAt = columns[normalize('nº trabajos')];
    var requestsAt = columns[normalize('Solicitudes')];

    if (dateAt < 0 && buildingAt !== undefined) dateAt = 0;
    if (dateAt < 0 || buildingAt === undefined || jobsAt === undefined || requestsAt === undefined) continue;

    for (var rowIndex = 1; rowIndex < grid.length; rowIndex += 1) {
      var row = grid[rowIndex] || [];
      var date = imacDate(row[dateAt]);
      var city = text(row[buildingAt]);

      if (!date || city === '' || esAliasEdificioBasura(city)) continue;

      date = monthStart(date);
      bump(imacs, [isoDate(date), monthLabel(date), city, 'Solicitudes'], toNumber(row[requestsAt]));
      bump(imacs, [isoDate(date), monthLabel(date), city, 'Intervenciones'], toNumber(row[jobsAt]));
    }
  }
}

/**
 * First non-empty cell among the candidate date headers of a Renove row.
 *
 * Non-empty, not merely present: the weekly tabs date a row by the day its
 * status changed and the renewal tabs by the day the machine was swapped, so a
 * tab carries one column filled and may carry the other one blank.
 */
function renoveFecha(row, columns) {
  for (var index = 0; index < RENOVE_DATE_HEADERS.length; index += 1) {
    var at = columns[normalize(RENOVE_DATE_HEADERS[index])];

    if (at === undefined) continue;

    var value = row[at];

    if (value === null || value === undefined || text(value) === '') continue;

    return toDate(value);
  }

  return null;
}

/**
 * One row per unit of equipment, folded into counts by day, scope and status.
 *
 * A row counts when its request column carries anything at all, which is the
 * rule the team gave on 22/09/2026: one request number can cover several
 * positions, so `G500391` twice is two machines and not one counted twice —
 * verified on the raw sheets, where each repetition holds a different serial.
 * By the same rule the text placeholders count too: `Llamada Ivan` stands for
 * fifteen machines whose request has not been raised yet. A row with that cell
 * empty is not a unit, and there are four, all in España and all also missing
 * their serial.
 *
 * Undated rows are kept with an empty day: they are equipment whose state is
 * decided but not yet dated at source, and dropping them would silently shrink
 * the totals of `2.7.1`. Serials, locations and request numbers are read to
 * group the rows and never written out, the rule the whole PLANO follows.
 */
function agregarRenove(found, renove) {
  var sheets = [];
  var kinds = RENOVE_KINDS;

  for (var kindIndex = 0; kindIndex < kinds.length; kindIndex += 1) {
    var entry = found[kinds[kindIndex]];

    if (entry && entry.sheets) sheets = sheets.concat(entry.sheets);
  }

  for (var sheetIndex = 0; sheetIndex < sheets.length; sheetIndex += 1) {
    var source = sheets[sheetIndex];
    var data = sourceRows(source);

    for (var rowIndex = 0; rowIndex < data.length; rowIndex += 1) {
      var row = data[rowIndex] || [];
      var estado = text(valueAt(row, source.columns, 'Estado'));

      if (estado === '') continue;
      if (!renoveTienePeticion(row, source.columns)) continue;

      // An empty renewal date arrives as serial 0 on part of the rows, which
      // resolves to 1899-12-30. The unit is still counted, without a date, the
      // same as the rows that come with the cell blank.
      var date = renoveFecha(row, source.columns);

      if (!fechaOperativa(date)) date = null;

      bump(
        renove,
        [
          date ? isoDate(date) : '',
          date ? monthLabel(date) : '',
          date ? String(isoWeekNumber(date)) : '0',
          source.ambito,
          estado
        ],
        1
      );
    }
  }
}

/**
 * Pivot leftovers that are not sites. Drive materialises "Grand Total" as a
 * building because the IMAC workbook carries a pivot tab with that label.
 */
function esAliasEdificioBasura(name) {
  var key = normalize(name);

  return key === 'GRAND TOTAL' || key === 'TOTAL' || key === 'TOTAL GENERAL';
}

/** Emits only workbook masters; it never modifies them or infers cross-master aliases. */
function agregarEdificios(found) {
  var tuples = {};

  function add(building, dt, smartTech, workOrder, imac, peticion) {
    var cells = [text(building), text(dt), text(smartTech), text(workOrder), text(imac), text(peticion)];

    if (cells[0] === '' || esAliasEdificioBasura(cells[0])) return;

    tuples[cells.join('\u0000')] = cells;
  }

  var smartSheet = sheetByName(TAB.citasInforme, false);

  if (smartSheet && smartSheet.getLastRow() >= 4) {
    var smartRows = smartSheet.getRange(4, 1, Math.min(smartSheet.getLastRow() - 3, 100), 3).getValues();

    for (var smartIndex = 0; smartIndex < smartRows.length; smartIndex += 1) {
      if (normalize(smartRows[smartIndex][0]).indexOf('SMART TECH') === 0) {
        add(smartRows[smartIndex][2], smartRows[smartIndex][1], smartRows[smartIndex][0], '', '', '');
      }
    }
  }

  var petSheet = sheetByName(TAB.gestionadas, false);

  if (petSheet && petSheet.getLastRow() >= 2) {
    var petRows = petSheet.getRange(2, 24, Math.min(petSheet.getLastRow() - 1, 2000), 3).getValues();

    for (var petIndex = 0; petIndex < petRows.length; petIndex += 1) {
      add(petRows[petIndex][2], petRows[petIndex][1], '', '', '', petRows[petIndex][0]);
    }
  }

  var workSheet = sheetByName(TAB.workOrdersDatos, false);

  if (workSheet && workSheet.getLastRow() >= 2) {
    var workRows = workSheet.getRange(2, 28, Math.min(workSheet.getLastRow() - 1, 100), 1).getValues();

    for (var workIndex = 0; workIndex < workRows.length; workIndex += 1) {
      add(workRows[workIndex][0], '', '', workRows[workIndex][0], '', '');
    }
  }

  if (found.imac && found.imac.grids) {
    var seenImacs = {};

    for (var gridIndex = 0; gridIndex < found.imac.grids.length; gridIndex += 1) {
      var grid = found.imac.grids[gridIndex].grid;
      var columns = headerIndex(grid[0] || []);
      var buildingAt = columns[normalize('Edificio')];

      if (buildingAt === undefined) continue;

      for (var rowIndex = 1; rowIndex < grid.length; rowIndex += 1) {
        var building = text((grid[rowIndex] || [])[buildingAt]);

        if (building !== '' && !seenImacs[normalize(building)]) {
          seenImacs[normalize(building)] = true;
          add(building, '', '', '', building, '');
        }
      }
    }
  }

  var keys = Object.keys(tuples).sort();
  var out = [];

  for (var index = 0; index < keys.length; index += 1) {
    out.push(tuples[keys[index]].concat(['Si', index + 1]));
  }

  return out;
}

/** Builds the eight aggregate sections. No raw row or free-text field is returned. */
function agregar(clasificacion, extraction) {
  var found = clasificacion.found || clasificacion;
  var date = toDate(extraction);

  if (!date) throw new Error('No hay una fecha de extracción válida para generar PLANO.');

  var buckets = {
    incidencias: {},
    encuestas: {},
    workOrders: {},
    peticiones: {},
    peticionesProducto: {},
    peticionesAnual: {},
    citas: {},
    citasAnual: {},
    renove: {},
    hic: {},
    comparativas: {},
    slas: {},
    incidenciasOnsite: {},
    peticionesMes: {},
    imacs: {}
  };

  agregarIncidencias(found, buckets.incidencias);
  agregarIncidenciasOnsite(found, date, buckets.incidenciasOnsite);
  agregarPeticionesMes(found, date, buckets.peticionesMes);
  agregarEncuestas(found, buckets.encuestas);
  agregarWorkOrders(found, buckets.workOrders);
  agregarPeticiones(found, date, buckets.peticiones, buckets.peticionesProducto);
  agregarPeticionesAnual(buckets.peticionesAnual);
  agregarCitas(found, date, buckets.citas, buckets.citasAnual);
  agregarRenove(found, buckets.renove);
  agregarHic(found, buckets.hic);
  agregarComparativas(found, buckets.comparativas);
  agregarSlas(found, buckets.slas);
  agregarImacs(found, buckets.imacs);

  return {
    edificios: agregarEdificios(found),
    incidencias: rows(buckets.incidencias),
    encuestas: rows(buckets.encuestas),
    workOrders: rows(buckets.workOrders),
    peticiones: rows(buckets.peticiones),
    peticionesProducto: rows(buckets.peticionesProducto),
    peticionesAnual: rows(buckets.peticionesAnual),
    citas: rows(buckets.citas),
    citasAnual: rows(buckets.citasAnual),
    renove: rows(buckets.renove),
    hic: rows(buckets.hic),
    comparativas: rows(buckets.comparativas),
    slas: rows(buckets.slas),
    incidenciasOnsite: rows(buckets.incidenciasOnsite),
    peticionesMes: rows(buckets.peticionesMes),
    imacs: rows(buckets.imacs)
  };
}

function planoCell(value) {
  return String(value == null ? '' : value).replace(/[\t\r\n]+/g, ' ').trim();
}

/** Exact counterpart of shared/modules/informatica/texto.ts. */
function serializarPlano(agregado, meta) {
  agregado = codificarEdificiosAgregado(agregado);
  var out = [TEXTO_HEADER];

  if (meta.week) out.push('semana\t' + planoCell(meta.week));
  if (meta.generated) out.push('generado\t' + planoCell(meta.generated));
  if (meta.source) out.push('origen\t' + planoCell(meta.source));
  if (meta.asOfDate) out.push('asOfDate\t' + planoCell(meta.asOfDate));
  if (meta.scope === 'completo') out.push('alcance\tcompleto');

  for (var index = 0; index < SECTION_ORDER.length; index += 1) {
    var key = SECTION_ORDER[index];
    var values = agregado[key] || [];

    if (values.length === 0) continue;

    out.push('');
    out.push('[' + SECTION[key] + ']');

    for (var rowIndex = 0; rowIndex < values.length; rowIndex += 1) {
      var cells = [];

      for (var column = 0; column < values[rowIndex].length; column += 1) {
        cells.push(planoCell(values[rowIndex][column]));
      }

      out.push(cells.join('\t'));
    }
  }

  return out.join('\n');
}

function escribirPlano(textoPlano) {
  var sheet = sheetByName(TAB.plano, true);
  var lines = String(textoPlano).split('\n');
  var values = [];

  for (var index = 0; index < lines.length; index += 1) values.push([lines[index]]);

  sheet.clear();
  sheet.getRange(1, 1, values.length, 1).setValues(values);
}

/* -------------------------------------------------------------------------- */
/* Weekly orchestration and audit output                                       */
/* -------------------------------------------------------------------------- */

var REQUIRED_KINDS = [
  'backlog',
  'liberadas',
  'gestionadas',
  'encuestas',
  'workOrders',
  'citas',
  'imac'
];

function fechaLegible(value) {
  var date = value instanceof Date ? value : toDate(value);

  return date && !isNaN(date.getTime())
    ? pad2(date.getUTCDate()) + '/' + pad2(date.getUTCMonth() + 1) + '/' + date.getUTCFullYear()
    : '';
}

function fechaHoraLegible(value) {
  var date = value instanceof Date ? value : toDate(value);

  if (!date || isNaN(date.getTime())) return '';

  return (
    fechaLegible(date) + ' ' + pad2(date.getUTCHours()) + ':' + pad2(date.getUTCMinutes()) + ':' +
    pad2(date.getUTCSeconds())
  );
}

function sourceRecord(entry, rowsRead) {
  return {
    name: entry.file.getName(),
    modified: entry.updated,
    rows: rowsRead
  };
}

/** Data rows of one Renove workbook, over its four summary tabs. */
function filasRenove(entry) {
  var total = 0;

  for (var index = 0; index < entry.sheets.length; index += 1) {
    total += sourceRows(entry.sheets[index]).length;
  }

  return total;
}

/** The physical inputs, without any cell contents from their raw rows. */
function registrarArchivosLeidos(clasificacion, informe) {
  var found = clasificacion.found;
  var read = informe.leidas;
  var templateRows =
    read[TAB.encuestasDatos] +
    read[TAB.topCincoDatos] +
    read[TAB.volumetria] +
    read[TAB.workOrdersDatos] +
    read[TAB.citasDatos];

  informe.archivos = [
    sourceRecord(found.backlog, read[TAB.peticionesDatos]),
    sourceRecord(found.liberadas, read[TAB.liberadas]),
    sourceRecord(found.gestionadas, read[TAB.gestionadas]),
    sourceRecord(found.encuestas, templateRows),
    sourceRecord(found.imac, read[TAB.imacsDatos])
  ];

  // Both Renove workbooks are optional and write no tab of the book: they only
  // feed the RENOVE section of PLANO. Each absence is stated on its own instead
  // of left blank, because a week missing one of the two publishes that scope
  // empty and that is indistinguishable from a scope with nothing to renew.
  for (var renoveIndex = 0; renoveIndex < RENOVE_KINDS.length; renoveIndex += 1) {
    var renoveKey = RENOVE_KINDS[renoveIndex];
    var renoveEntry = found[renoveKey];

    if (renoveEntry) {
      informe.archivos.push(sourceRecord(renoveEntry, filasRenove(renoveEntry)));
    } else {
      informe.archivos.push({
        name: 'Renove ' + RENOVE_AMBITO[renoveKey] + ' (ausente)',
        modified: null,
        rows: 0
      });
    }
  }

  // Acumuladas is optional the same way: a missing file keeps the annual grid
  // as last written (plus the August 2026 seed) instead of aborting the week.
  if (found.acumuladas) {
    informe.archivos.push(
      sourceRecord(found.acumuladas, informe.peticionesAnualFilas || 0)
    );
  } else {
    informe.archivos.push({
      name: 'Acumuladas (ausente)',
      modified: null,
      rows: 0
    });
  }

  // The monthly request trio is optional and must not be filled from the
  // weekly snapshot. One absence line when none of the three files is there.
  var meses = ['backlogMes', 'liberadasMes', 'gestionadasMes'];
  var algunMes = false;

  for (var mesIndex = 0; mesIndex < meses.length; mesIndex += 1) {
    if (found[meses[mesIndex]]) {
      informe.archivos.push(sourceRecord(found[meses[mesIndex]], 0));
      algunMes = true;
    }
  }

  if (!algunMes) {
    informe.archivos.push({
      name: 'Peticiones de mes (ausente)',
      modified: null,
      rows: 0
    });
  }

  informe.duplicados = clasificacion.duplicated || [];
  informe.ignorados = clasificacion.skipped || [];
  informe.huerfanos = clasificacion.orphans || [];
}

function sumarFilas(rowsValue, predicate) {
  var total = 0;

  for (var index = 0; index < rowsValue.length; index += 1) {
    if (predicate(rowsValue[index])) total += toNumber(rowsValue[index][rowsValue[index].length - 1]);
  }

  return total;
}

/** Key figures from aggregate tuples only; no raw identifiers or descriptions. */
function totalesComprobacion(agregado, extraction) {
  var month = monthLabel(extraction);
  var week = weekBounds(extraction);
  var monday = isoDate(week.monday);
  var sunday = isoDate(week.sunday);
  var cutoff = isoDate(extraction);

  function requestState(state) {
    return sumarFilas(agregado.peticiones || [], function (row) {
      return row[4] === state && row[5] === 'Peticiones';
    });
  }

  return {
    vuelo: requestState('En vuelo'),
    liberadas: requestState('Liberadas'),
    gestionadas: requestState('Gestionadas'),
    workOrders: sumarFilas(agregado.workOrders || [], function (row) {
      return row[1] === month;
    }),
    citas: sumarFilas(agregado.citas || [], function (row) {
      var day = String(row[0] || '');

      return day >= monday && day <= sunday && day <= cutoff;
    }),
    incidenciasResueltas: sumarFilas(agregado.incidencias || [], function (row) {
      return row[1] === month && / - Resueltas$/.test(row[5]);
    })
  };
}

function detalleArchivos(informe) {
  var details = [];
  var files = informe.archivos || [];

  for (var index = 0; index < files.length; index += 1) {
    details.push(
      files[index].name + ' | modificado ' + fechaHoraLegible(files[index].modified) + ' | ' +
        files[index].rows + ' filas'
    );
  }

  if ((informe.duplicados || []).length > 0) {
    details.push('Duplicados descartados: ' + informe.duplicados.join(', '));
  }
  if ((informe.ignorados || []).length > 0) {
    details.push('Cabecera no reconocida: ' + informe.ignorados.join(', '));
  }
  if ((informe.huerfanos || []).length > 0) {
    details.push(
      'Conversiones huérfanas enviadas a la papelera: ' + informe.huerfanos.join(', ')
    );
  }

  return details.length > 0 ? details.join('; ') : 'Sin datos de archivos en esta ejecución.';
}

function detalleComparacion(informe) {
  var read = informe.leidas || {};
  var written = informe.escritas || {};
  var tabs = Object.keys(read).sort();
  var details = [];

  for (var index = 0; index < tabs.length; index += 1) {
    details.push(tabs[index] + ': ' + read[tabs[index]] + ' leídas / ' + written[tabs[index]] + ' escritas');
  }

  return details.length > 0 ? details.join('; ') : 'Sin escritura de datos en esta ejecución.';
}

function comparacionCorrecta(informe) {
  var read = informe.leidas || {};
  var tabs = Object.keys(read);

  for (var index = 0; index < tabs.length; index += 1) {
    if (read[tabs[index]] !== (informe.escritas || {})[tabs[index]]) return false;
  }

  return tabs.length > 0;
}

function detalleMarcadores(informe) {
  if (!informe.marcadores) return 'No aplicados en esta ejecución.';

  return (
    physicalSheetName(TAB.workOrdersInforme) + '!H1:I1 ' + fechaLegible(informe.marcadores.monthFirst) + '–' +
    fechaLegible(informe.marcadores.monthLast) + '; ' + physicalSheetName(TAB.citasInforme) + '!J2:K2 ' +
    fechaLegible(informe.marcadores.weekMonday) + '–' + fechaLegible(informe.marcadores.weekSunday) + '; ' +
    physicalSheetName(TAB.encuestasInforme) + '!L24 ' + fechaLegible(informe.marcadores.monthFirst) +
    '; semana anterior ' + (informe.semanaRodada ? 'rodada' : 'conservada') +
    (informe.planoTxt ? '; TXT ' + informe.planoTxt : '') +
    (informe.planoTxtError ? '; TXT error: ' + informe.planoTxtError : '')
  );
}

function detalleTotales(informe) {
  var totals = informe.totales;

  if (!totals) return 'No calculados en esta ejecución.';

  return (
    'Peticiones en vuelo ' + totals.vuelo + '; liberadas ' + totals.liberadas + '; gestionadas ' +
    totals.gestionadas + '; work orders del mes ' + totals.workOrders + '; citas de la semana ' +
    totals.citas + '; incidencias resueltas del mes ' + totals.incidenciasResueltas
  );
}

/** Exactly the seven audit groups required by section 9 of SPEC.md. */
function filasComprobacion(informe) {
  var runAt = new Date();
  var unknown = informe.desconocidos || [];
  var imacStatus = 'Sin referencia';
  var imacDetail = 'No se comparó con una carga anterior.';
  var filesStatus = (informe.duplicados || []).length > 0 || (informe.ignorados || []).length > 0 ? 'AVISO' : 'OK';

  if (typeof informe.imacActual === 'number' && typeof informe.imacAnterior === 'number') {
    imacStatus = informe.imacActual < informe.imacAnterior ? 'AVISO' : 'OK';
    imacDetail = informe.imacAnterior + ' filas anteriores / ' + informe.imacActual + ' filas actuales';
  }

  return [
    [runAt, 'Archivos, fechas y filas leídas', filesStatus, detalleArchivos(informe)],
    [runAt, 'Filas escritas frente a leídas', comparacionCorrecta(informe) ? 'OK' : 'AVISO', detalleComparacion(informe)],
    [runAt, 'Desconocidos', unknown.length > 0 ? 'AVISO' : 'OK', unknown.length > 0 ? unknown.join('; ') : 'Ninguno'],
    [runAt, 'Caída IMAC', imacStatus, imacDetail],
    [
      runAt,
      'Marcadores de periodo',
      informe.planoTxtError ? 'AVISO' : informe.marcadores ? 'OK' : 'Sin cambios',
      detalleMarcadores(informe)
    ],
    [runAt, 'Cierre mensual', informe.cierreStatus || 'No ejecutado', informe.cierre || 'No ejecutado en esta ejecución.'],
    [runAt, 'Totales clave', informe.totales ? 'OK' : 'Sin datos', detalleTotales(informe)]
  ];
}

function escribirComprobacion(informe) {
  var sheet = sheetByName(TAB.check, true);
  var rowsValue = [['Ejecución', 'Grupo', 'Estado', 'Detalle']].concat(filasComprobacion(informe));

  sheet.clear();
  sheet.getRange(1, 1, rowsValue.length, 4).setValues(rowsValue);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, 4).setFontWeight('bold');
  sheet.getRange(2, 1, 7, 1).setNumberFormat('dd/mm/yyyy hh:mm:ss');
  sheet.setColumnWidth(1, 170);
  sheet.setColumnWidth(2, 260);
  sheet.setColumnWidth(3, 110);
  sheet.setColumnWidth(4, 900);
  sheet.getRange(1, 1, rowsValue.length, 4).setWrap(true);
}

/** Updates only the close row, preserving the latest weekly evidence. */
function actualizarComprobacionCierre(status, detail) {
  var sheet = sheetByName(TAB.check, true);

  if (sheet.getLastRow() < 8) {
    escribirComprobacion({ cierreStatus: status, cierre: detail });
    return;
  }

  var groups = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getValues();

  for (var index = 0; index < groups.length; index += 1) {
    if (text(groups[index][0]) === 'Cierre mensual') {
      sheet.getRange(index + 2, 1, 1, 4).setValues([[new Date(), 'Cierre mensual', status, detail]]);
      sheet.getRange(index + 2, 1).setNumberFormat('dd/mm/yyyy hh:mm:ss');
      return;
    }
  }

  escribirComprobacion({ cierreStatus: status, cierre: detail });
}

function procesarSemana() {
  var config = null;
  var clasificacion = null;

  try {
    config = readConfig();

    // Before classifyFolder, which opens and converts every workbook of the
    // folder: the run that must not happen is also the slowest thing to undo.
    if (extraccionYaProcesada(config.extraction, config.lastProcessed)) {
      throw new Error(
        'Membrillo, cambia la semana de extracción: "' +
          CONFIG_KEYS.extraction +
          '" y "' +
          CONFIG_KEYS.lastProcessed +
          '" tienen la misma fecha (' +
          fechaCorta(config.extraction) +
          '). Esa semana ya se procesó.'
      );
    }

    clasificacion = classifyFolder(config.folderId);

    var informe = {
      extraction: config.extraction,
      faltan: [],
      leidas: {},
      escritas: {},
      desconocidos: []
    };

    for (var required = 0; required < REQUIRED_KINDS.length; required += 1) {
      if (!clasificacion.found[REQUIRED_KINDS[required]]) informe.faltan.push(REQUIRED_KINDS[required]);
    }

    // Deliberately before rodarSemanaAnterior or any sheet output: a partial
    // week is less visible, and therefore more dangerous, than a hard stop.
    if (informe.faltan.length > 0) {
      throw new Error('Faltan ficheros o pestañas requeridos: ' + informe.faltan.join(', '));
    }

    // Freeze months that extraction has already left behind, using the data
    // still in the book. Writing the new dumps first would freeze August with
    // September's backlog snapshot.
    var cerrados = cerrarMesesPendientes(config.extraction, config.windowMonths);

    if (cerrados.length > 0) {
      informe.cierreStatus = 'OK';
      informe.cierre = cerrados.join('; ');
    } else {
      informe.cierreStatus = 'No ejecutado';
      informe.cierre = 'Sin meses pendientes detrás de la extracción.';
    }

    informe.semanaRodada = rodarSemanaAnterior(config.extraction, config.lastProcessed);
    writeConfigValue(CONFIG_KEYS.lastProcessed, config.extraction);
    escribirDatos(clasificacion.found, informe);
    repararFormulas(informe);
    escribirMarcadores(config.extraction);

    var week = weekBounds(config.extraction);
    var month = monthBounds(config.extraction);

    informe.marcadores = {
      weekMonday: week.monday,
      weekSunday: week.sunday,
      monthFirst: month.first,
      monthLast: month.last
    };

    var agregado = agregar(clasificacion.found, config.extraction);
    var textoPlano = serializarPlano(agregado, {
      week: isoDate(config.extraction),
      generated: new Date().toISOString(),
      source: clasificacion.nombres.join('; '),
      asOfDate: isoDate(config.extraction),
      scope: 'completo'
    });

    escribirPlano(textoPlano);
    registrarArchivosLeidos(clasificacion, informe);
    informe.totales = totalesComprobacion(agregado, config.extraction);

    try {
      informe.planoTxt = escribirPlanoTxt(false);
    } catch (err) {
      informe.planoTxtError = err && err.message ? String(err.message) : String(err);
    }

    escribirComprobacion(informe);

    return informe;
  } finally {
    if (clasificacion && clasificacion.handles) {
      for (var handle = 0; handle < clasificacion.handles.length; handle += 1) {
        discardTemporary(clasificacion.handles[handle]);
      }
    }
  }
}

/**
 * Writes the PLANO tab as `Informatica YYYY-MM-DD.txt` in the output folder.
 *
 * `notify` is only for the menu item. Weekly processing saves silently and
 * records the file name on Comprobación instead of opening a dialog.
 */
function escribirPlanoTxt(notify) {
  var sheet = sheetByName(TAB.plano, false);

  if (!sheet || sheet.getLastRow() < 1) {
    throw new Error('La pestaña "' + TAB.plano + '" está vacía. Ejecuta antes "Procesar semana".');
  }

  var config = readConfig();
  var values = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues();
  var lines = [];

  for (var index = 0; index < values.length; index += 1) {
    lines.push(values[index][0] == null ? '' : String(values[index][0]));
  }

  var name = 'Informatica ' + isoDate(config.extraction) + '.txt';
  var folder = DriveApp.getFolderById(config.outputFolderId);
  var created = folder.createFile(name, lines.join('\n'), MimeType.PLAIN_TEXT);
  var createdId = created.getId();
  var existing = folder.getFilesByName(name);

  while (existing.hasNext()) {
    var candidate = existing.next();

    if (candidate.getId() !== createdId) candidate.setTrashed(true);
  }

  // Versions created by the previous script lived beside the raw uploads.
  // Remove that misplaced copy only after the correct file exists.
  if (config.outputFolderId !== config.folderId) {
    var rawFolder = DriveApp.getFolderById(config.folderId);
    var misplaced = rawFolder.getFilesByName(name);

    while (misplaced.hasNext()) misplaced.next().setTrashed(true);
  }

  if (notify) {
    SpreadsheetApp.getUi().alert(
      'Informática Weekly',
      'Guardado "' + name + '" en la carpeta de salida PLANO.',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }

  return name;
}

/** Menu wrapper: save the current PLANO and tell the operator the file name. */
function guardarPlanoTxt() {
  try {
    return escribirPlanoTxt(true);
  } catch (err) {
    SpreadsheetApp.getUi().alert(
      'Informática Weekly',
      err && err.message ? String(err.message) : String(err),
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return null;
  }
}

/** Creates only the three script-owned tabs; existing workbook content is kept. */
function inicializarHoja() {
  var created = [];

  if (!sheetByName(TAB.config, false)) {
    var config = sheetByName(TAB.config, true);

    config.getRange(1, 1, 4, 2).setValues([
      [CONFIG_KEYS.folder, DEFAULT_FOLDER_ID],
      [CONFIG_KEYS.outputFolder, DEFAULT_OUTPUT_FOLDER_ID],
      [CONFIG_KEYS.extraction, ''],
      [CONFIG_KEYS.windowMonths, DEFAULT_WINDOW_MONTHS]
    ]);
    config.getRange(1, 1, 4, 1).setFontWeight('bold');
    config.getRange(3, 2).setNumberFormat('dd/mm/yyyy');
    config.setColumnWidth(1, 300);
    config.setColumnWidth(2, 340);
    created.push(TAB.config);
  }

  var liveConfig = sheetByName(TAB.config, false);
  var configValues = liveConfig.getRange(1, 1, Math.max(liveConfig.getLastRow(), 1), 1).getValues();
  var hasOutputFolder = false;

  for (var configRow = 0; configRow < configValues.length; configRow += 1) {
    if (text(configValues[configRow][0]) === CONFIG_KEYS.outputFolder) {
      hasOutputFolder = true;
      break;
    }
  }

  if (!hasOutputFolder) {
    var outputRow = liveConfig.getLastRow() + 1;

    liveConfig.getRange(outputRow, 1, 1, 2).setValues([
      [CONFIG_KEYS.outputFolder, DEFAULT_OUTPUT_FOLDER_ID]
    ]);
    liveConfig.getRange(outputRow, 1).setFontWeight('bold');
  }

  ensureConfigKey(CONFIG_KEYS.lastProcessed, '');

  if (!sheetByName(TAB.check, false)) {
    escribirComprobacion({});
    created.push(TAB.check);
  }

  if (!sheetByName(TAB.plano, false)) {
    var plano = sheetByName(TAB.plano, true);

    plano.setColumnWidth(1, 900);
    created.push(TAB.plano);
  }

  repararFormulas();

  SpreadsheetApp.getUi().alert(
    'Informática Weekly',
    created.length === 0
      ? 'Las pestañas necesarias ya existían. Fórmulas verificadas.'
      : 'Pestañas creadas: ' + created.join(', ') + '. Fórmulas verificadas.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );

  return created;
}
