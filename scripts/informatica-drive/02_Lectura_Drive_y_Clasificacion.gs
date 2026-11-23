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
 *
 * The month can also be named instead of the word Mes: the close of
 * 2026-09 arrived as BacklogSeptiembre, GestionadasSeptiembre and
 * LiberadasSepriembre. Read as weekly, those three replaced the weekly trio
 * because they were newer, and the monthly section came out empty. Weekly
 * exports carry a date (Backlog 20261005), never a word, so any word after
 * the kind that is Mes or a month — one typo allowed — makes it monthly.
 */
function requestKind(fileName) {
  var base = String(fileName).replace(/\.[a-z0-9]+$/i, '');
  var compact = normalize(base).toLowerCase().replace(/[^a-z0-9]/g, '');
  var words = normalize(base).toLowerCase().replace(/[^a-z]+/g, ' ').trim().split(' ');
  var kinds = [
    ['backlog', 'backlog', 'backlogMes'],
    ['liberadas', 'liberadas', 'liberadasMes'],
    ['liberades', 'liberadas', 'liberadasMes'],
    ['gestionadas', 'gestionadas', 'gestionadasMes'],
    ['gestionades', 'gestionadas', 'gestionadasMes']
  ];

  if (compact.indexOf('acumuladas') >= 0) return 'acumuladas';

  for (var index = 0; index < kinds.length; index += 1) {
    var stem = kinds[index][0];

    for (var wordIndex = 0; wordIndex < words.length; wordIndex += 1) {
      var at = words[wordIndex].indexOf(stem);

      if (at < 0) continue;

      var tail = [words[wordIndex].slice(at + stem.length)].concat(words.slice(wordIndex + 1));

      for (var tailIndex = 0; tailIndex < tail.length; tailIndex += 1) {
        if (esPalabraDeMes(tail[tailIndex])) return kinds[index][2];
      }

      return kinds[index][1];
    }
  }

  return null;
}

var MESES_NOMBRE = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'setiembre', 'octubre', 'noviembre', 'diciembre'
];
var MESES_ABREVIATURA = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'sept', 'set', 'oct', 'nov', 'dic'
];

/** Mes, a month abbreviation, or a month name at most one edit away. */
function esPalabraDeMes(word) {
  if (!word) return false;
  if (word === 'mes' || MESES_ABREVIATURA.indexOf(word) >= 0) return true;
  if (word.length < 4) return false;

  for (var index = 0; index < MESES_NOMBRE.length; index += 1) {
    if (distanciaEdicion(word, MESES_NOMBRE[index]) <= 1) return true;
  }

  return false;
}

/** Levenshtein distance; the words compared are a dozen letters long. */
function distanciaEdicion(a, b) {
  var previous = [];

  for (var j = 0; j <= b.length; j += 1) previous.push(j);

  for (var i = 1; i <= a.length; i += 1) {
    var current = [i];

    for (var k = 1; k <= b.length; k += 1) {
      current.push(Math.min(
        previous[k] + 1,
        current[k - 1] + 1,
        previous[k - 1] + (a.charAt(i - 1) === b.charAt(k - 1) ? 0 : 1)
      ));
    }

    previous = current;
  }

  return previous[b.length];
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

