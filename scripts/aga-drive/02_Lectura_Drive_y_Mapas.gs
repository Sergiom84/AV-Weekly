/* -------------------------------------------------------------------------- */
/* Drive: reading the raw exports                                              */
/* -------------------------------------------------------------------------- */

var XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
var SHEETS_MIME = 'application/vnd.google-apps.spreadsheet';

/**
 * A Drive file as a Google Sheet, converting it when it is still an .xlsx.
 *
 * Uses the REST endpoint rather than the advanced Drive service so the
 * spreadsheet works with no service to enable: the OAuth token the script
 * already holds for DriveApp is enough.
 *
 * Returns `{ id, temporary }`. A temporary copy must be trashed by the caller.
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
        name: '[temporal AGA Weekly] ' + file.getName(),
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
 * Every tab of a workbook as `{ name, grid }`.
 *
 * Values are read raw, so dates stay `Date` objects and padded codes stay
 * strings; `dateParts` and `text` normalise at the point of use.
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
 * The first tab of a workbook whose header row carries every required column.
 *
 * The header is not always the first row: the GPS export puts a merged title
 * above it, and a converted workbook sometimes keeps a blank row on top, so a
 * few rows are scanned before giving up.
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

var REQUIRED = {
  gps: ['Nº Petición de sistemas', 'Departamento', 'Producto'],
  managed: ['Nº Petición de sistemas', 'Denominación Departamento', 'Denominación Producto', 'Fecha Gestionado', 'Denominación Edificio'],
  office: ['Nº Petición de sistemas', 'Denominación Producto', 'Fecha de inicio de la gestión'],
  buildings: ['Edificios', 'Ubicación']
};

/**
 * Classifies the files of the folder by what their header row says they are.
 *
 * Every candidate is opened, which is slower than matching on the name but is
 * the only rule that survives the weekly renaming. Files already produced by
 * this script are skipped by name, since a previous `PLANO` export in the same
 * folder is not an input.
 */
function classifyFolder(folderId) {
  var folder = DriveApp.getFolderById(folderId);
  var files = folder.getFiles();
  var found = { gps: null, managed: null, office: null, buildings: null };
  var handles = [];
  var skipped = [];

  while (files.hasNext()) {
    var file = files.next();
    var mime = file.getMimeType();

    if (mime !== XLSX_MIME && mime !== SHEETS_MIME && mime !== MimeType.MICROSOFT_EXCEL) {
      continue;
    }

    if (file.getName().indexOf('[temporal AGA Weekly]') === 0 || file.getId() === book().getId()) {
      continue;
    }

    if (normalize(file.getName()).indexOf('HISTO') === 0) {
      skipped.push(file.getName());
      continue;
    }

    var handle = null;

    try {
      handle = openAsSpreadsheet(file);
      handles.push(handle);

      var grids = readGrids(handle.id);
      var matched = false;

      // Order matters: the Gestionado and Office exports share several column
      // names, and Gestionado is the more specific of the two.
      var kinds = ['managed', 'office', 'gps', 'buildings'];

      for (var index = 0; index < kinds.length; index += 1) {
        var kind = kinds[index];
        var sheets = findDataSheets(grids, REQUIRED[kind]);

        if (sheets.length > 0) {
          // The newest file wins when the folder still holds last week's copy.
          if (!found[kind] || file.getLastUpdated() > found[kind].updated) {
            found[kind] = { file: file, sheets: sheets, updated: file.getLastUpdated() };
          }

          matched = true;
          break;
        }
      }

      if (!matched) {
        skipped.push(file.getName());
      }
    } catch (error) {
      discardTemporary(handle);
      throw error;
    }
  }

  return { found: found, handles: handles, skipped: skipped };
}

/* -------------------------------------------------------------------------- */
/* Mapping tabs                                                                */
/* -------------------------------------------------------------------------- */

/** A two-column mapping tab as a normalised lookup object. */
function readMapping(tabName) {
  var sheet = sheetByName(tabName, false);
  var mapping = {};

  if (!sheet || sheet.getLastRow() < 2) return mapping;

  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();

  for (var index = 0; index < rows.length; index += 1) {
    var key = normalize(rows[index][0]);
    var value = text(rows[index][1]);

    if (key !== '' && value !== '') {
      mapping[key] = value;
    }
  }

  return mapping;
}

/**
 * The three-column department tab.
 *
 * Returns `{ labels, managed }`, where `managed` maps both the raw name and the
 * section-1 label to the section-2 label, and holds `''` for a department the
 * deck does not chart in section 2. Keying by both is what lets the grouped
 * "Soporte Técnico" row switch off every regional desk at once, since the
 * grouping happens before the tab is consulted.
 */
function readDepartments() {
  var sheet = sheetByName(TAB.departments, false);
  var result = { labels: {}, managed: {} };

  if (!sheet || sheet.getLastRow() < 2) return result;

  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();

  for (var index = 0; index < rows.length; index += 1) {
    var key = normalize(rows[index][0]);
    var label = text(rows[index][1]);

    if (key === '' || label === '') continue;

    result.labels[key] = label;
    result.managed[key] = text(rows[index][2]);
    result.managed[normalize(label)] = text(rows[index][2]);
  }

  return result;
}

/**
 * Section-2 label of a department, or `''` when the deck does not chart it.
 *
 * A department that is in no row of the tab is charted under its section-1
 * label and reported at the end of the run: dropping it silently would make
 * the bars stop adding up to the weekly total, which is the one number the
 * colleague checks.
 */
function managedDepartmentLabel(departments, raw, label) {
  var byRaw = departments.managed[normalize(raw)];
  if (byRaw !== undefined) return byRaw;

  var byLabel = departments.managed[normalize(label)];
  if (byLabel !== undefined) return byLabel;

  return label;
}

function isMappedDepartment(departments, raw, label) {
  return (
    departments.managed[normalize(raw)] !== undefined ||
    departments.managed[normalize(label)] !== undefined
  );
}

/**
 * Presentation label of a department.
 *
 * An unmapped department keeps its raw name rather than being dropped: it is
 * real data, and hiding it would make the bars stop adding up to the reported
 * total. Regional support desks are matched by prefix because the export ships
 * new cities without warning; the trailing space keeps "SOPORTE VIP" out.
 */
function departmentLabel(raw, mapping) {
  var key = normalize(raw);

  if (key === '') return 'Sin departamento';
  if (key === 'SOPORTE TECNICO' || key.indexOf('SOPORTE TECNICO ') === 0) return 'Soporte Técnico';

  return mapping[key] || text(raw);
}

/** Presentation label of a project. An empty result excludes the row. */
function projectLabel(raw, mapping) {
  var key = normalize(raw);

  if (key === '' || key === 'NONE') return '';

  return mapping[key] || text(raw);
}

/**
 * Location of a building.
 *
 * An unknown building is counted under "Sin clasificar" instead of being
 * dropped, so adding a branch office cannot silently lower the weekly total.
 */
function locationLabel(raw, mapping) {
  var key = normalize(raw);

  if (key === '') return 'Sin clasificar';

  return mapping[key] || 'Sin clasificar';
}

/** Canonical Office family. Mirrors `agaOfficeFamily` in the app. */
function officeFamily(product) {
  var value = normalize(product);
  if (/\bOFFICE\s+2021\s*\(MAC\)/.test(value)) return 'MICROSOFT OFFICE 2021 (MAC)';

  // An Apple licence counts as Standard, and the check runs first in case the
  // description also says Office.
  if (value.indexOf('APPLE') >= 0) return 'MICROSOFT OFFICE STANDARD';
  if (value.indexOf('OFFICE') >= 0 && value.indexOf('STANDARD') >= 0) return 'MICROSOFT OFFICE STANDARD';
  if (value.indexOf('EXCEL') >= 0) return 'MICROSOFT OFFICE EXCEL';
  if (value.indexOf('OFFICE 365') >= 0) return 'MICROSOFT OFFICE 365';
  if (value.indexOf('ACCESS') >= 0) return 'MICROSOFT ACCESS';
  if (value.indexOf('WORD') >= 0) return 'MICROSOFT WORD';

  return '';
}

