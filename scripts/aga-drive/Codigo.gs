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

/**
 * ID de la carpeta "bruto" del Drive corporativo, la que recibe los tres
 * ficheros semanales. `inicializarHoja` la deja puesta en la pestaña
 * "Configuración" para no tener que pegarla a mano; sigue siendo editable ahí
 * si la carpeta cambia algún día — esa celda manda siempre, esto es solo la
 * semilla inicial.
 */
var DEFAULT_FOLDER_ID = '1gqUPPVsPOE1xy3aJB2dSwNWD3WnDxK8a';

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
  'MICROSOFT WORD'
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
    ['CGR - AM', 'CGR_AM', '']
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
    .addItem('Procesar semana', 'procesarSemana')
    .addSeparator()
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

/* -------------------------------------------------------------------------- */
/* Counting                                                                    */
/* -------------------------------------------------------------------------- */

/** `week -> label -> count`, the shape every breakdown accumulates into. */
function bump(counts, week, label, amount) {
  if (!counts[week]) counts[week] = {};
  counts[week][label] = (counts[week][label] || 0) + (amount === undefined ? 1 : amount);
}

/** Labels of one week, descending by count and then alphabetically. */
function sortedLabels(byLabel) {
  var labels = Object.keys(byLabel || {});

  labels.sort(function (a, b) {
    return byLabel[b] - byLabel[a] || a.localeCompare(b, 'es');
  });

  return labels;
}

/** Rows of a breakdown as text lines, truncated to the charted maximum. */
function breakdownLines(counts, limit) {
  var weeks = Object.keys(counts).sort();
  var lines = [];

  for (var index = 0; index < weeks.length; index += 1) {
    var week = weeks[index];
    var labels = sortedLabels(counts[week]);
    var kept = limit > 0 ? labels.slice(0, limit) : labels;

    for (var position = 0; position < kept.length; position += 1) {
      lines.push([week, kept[position], counts[week][kept[position]]].join('\t'));
    }
  }

  return lines;
}

/** `week -> total` from a `week -> label -> count` breakdown. */
function sumByWeek(counts) {
  var totals = {};
  var weeks = Object.keys(counts);

  for (var index = 0; index < weeks.length; index += 1) {
    var byLabel = counts[weeks[index]];
    var labels = Object.keys(byLabel);
    var total = 0;

    for (var position = 0; position < labels.length; position += 1) {
      total += byLabel[labels[position]];
    }

    totals[weeks[index]] = total;
  }

  return totals;
}

function totalsLines(totals) {
  var weeks = Object.keys(totals).sort();
  var lines = [];

  for (var index = 0; index < weeks.length; index += 1) {
    lines.push([weeks[index], totals[weeks[index]]].join('\t'));
  }

  return lines;
}

/* -------------------------------------------------------------------------- */
/* Readers                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The GPS export: positions still in management.
 *
 * The raw export has no `semana` column — the colleague used to add it by hand
 * — so the extraction date from the Configuración tab is stamped on every row.
 * When the file does carry the column it wins, which is what makes a two-tab
 * GPS built the old way still import correctly.
 */
function readGps(entry, extractionDate, mappings) {
  var totals = {};
  var departments = {};
  var departmentsRaw = {};
  var projects = {};
  var rows = 0;

  for (var sheetIndex = 0; sheetIndex < entry.sheets.length; sheetIndex += 1) {
    var sheet = entry.sheets[sheetIndex];
    var requestAt = sheet.columns[normalize('Nº Petición de sistemas')];
    var departmentAt = sheet.columns[normalize('Departamento')];
    var projectAt = sheet.columns[normalize('Proyecto')];
    var weekAt = sheet.columns[normalize('semana')];

    for (var index = sheet.headerRow + 1; index < sheet.grid.length; index += 1) {
      var row = sheet.grid[index];

      if (text(row[requestAt]) === '') continue;

      var week = weekAt === undefined ? extractionDate : toIsoDate(row[weekAt]) || extractionDate;
      var rawDepartment = text(row[departmentAt]);

      totals[week] = (totals[week] || 0) + 1;
      bump(departments, week, departmentLabel(rawDepartment, mappings.departments.labels));
      bump(departmentsRaw, week, rawDepartment === '' ? 'Sin departamento' : rawDepartment);

      if (projectAt !== undefined) {
        var project = projectLabel(row[projectAt], mappings.projects);
        if (project !== '') bump(projects, week, project);
      }

      rows += 1;
    }
  }

  return {
    rows: rows,
    totals: totals,
    departments: departments,
    departmentsRaw: departmentsRaw,
    projects: projects
  };
}

/** The Gestionado ZPT025 export: positions closed in the week. */
function readManaged(entry, mappings) {
  var totals = {};
  var departments = {};
  var products = {};
  var locations = {};
  var departmentProducts = {};
  var unknownBuildings = {};
  var unmappedDepartments = {};
  var rows = 0;
  var skipped = 0;

  for (var sheetIndex = 0; sheetIndex < entry.sheets.length; sheetIndex += 1) {
    var sheet = entry.sheets[sheetIndex];
    var requestAt = sheet.columns[normalize('Nº Petición de sistemas')];
    var departmentAt = sheet.columns[normalize('Denominación Departamento')];
    var productAt = sheet.columns[normalize('Denominación Producto')];
    var dateAt = sheet.columns[normalize('Fecha Gestionado')];
    var buildingAt = sheet.columns[normalize('Denominación Edificio')];

    for (var index = sheet.headerRow + 1; index < sheet.grid.length; index += 1) {
      var row = sheet.grid[index];

      if (text(row[requestAt]) === '') continue;

      var week = managedWeekKey(row[dateAt]);

      if (!week) {
        skipped += 1;
        continue;
      }

      var rawDepartment = text(row[departmentAt]);
      var department = departmentLabel(rawDepartment, mappings.departments.labels);
      var chartedDepartment = managedDepartmentLabel(mappings.departments, rawDepartment, department);
      var product = text(row[productAt]);
      var building = text(row[buildingAt]);
      var location = locationLabel(building, mappings.buildings);

      if (location === 'Sin clasificar' && building !== '') {
        unknownBuildings[building] = (unknownBuildings[building] || 0) + 1;
      }

      if (!isMappedDepartment(mappings.departments, rawDepartment, department)) {
        unmappedDepartments[department] = (unmappedDepartments[department] || 0) + 1;
      }

      // The weekly total counts every position, including the departments the
      // deck does not chart in section 2. Only the breakdown is filtered, so
      // "300 gestionadas" stays the same number the colleague checks.
      totals[week] = (totals[week] || 0) + 1;
      if (chartedDepartment !== '') bump(departments, week, chartedDepartment);
      if (product !== '') bump(products, week, product);
      bump(locations, week, location);

      if (DETAIL_DEPARTMENTS.indexOf(department) >= 0 && product !== '') {
        if (!departmentProducts[department]) departmentProducts[department] = {};
        bump(departmentProducts[department], week, product);
      }

      rows += 1;
    }
  }

  return {
    rows: rows,
    skipped: skipped,
    totals: totals,
    departments: departments,
    products: products,
    locations: locations,
    departmentProducts: departmentProducts,
    unknownBuildings: unknownBuildings,
    unmappedDepartments: unmappedDepartments
  };
}

/** The Office export: licences per month and family. */
function readOffice(entry) {
  var counts = {};
  var unknownProducts = {};
  var rows = 0;
  var skipped = 0;

  for (var sheetIndex = 0; sheetIndex < entry.sheets.length; sheetIndex += 1) {
    var sheet = entry.sheets[sheetIndex];
    var requestAt = sheet.columns[normalize('Nº Petición de sistemas')];
    var productAt = sheet.columns[normalize('Denominación Producto')];
    var dateAt = sheet.columns[normalize('Fecha de inicio de la gestión')];

    for (var index = sheet.headerRow + 1; index < sheet.grid.length; index += 1) {
      var row = sheet.grid[index];

      if (text(row[requestAt]) === '') continue;

      var month = toIsoMonth(row[dateAt]);
      var family = officeFamily(row[productAt]);

      if (!month) {
        skipped += 1;
        continue;
      }

      if (family === '') {
        var product = text(row[productAt]) || '(en blanco)';
        unknownProducts[product] = (unknownProducts[product] || 0) + 1;
        skipped += 1;
        continue;
      }

      bump(counts, month, family);
      rows += 1;
    }
  }

  return { rows: rows, skipped: skipped, counts: counts, unknownProducts: unknownProducts };
}

/**
 * Refreshes "Mapa edificios" from the Edificios master, without erasing rows
 * added by hand.
 *
 * The master is comprehensive but not instant: a branch opened this week can
 * show up in the Gestionado export before it reaches the master file. When
 * that happens the warning says to add the building to this tab by hand, and
 * that row has to survive the next run — otherwise every week undoes the fix
 * from the week before. The master still wins when a building is in both: it
 * is the authoritative source for the ones it lists, so a correction there
 * reaches the tab too.
 */
function refreshBuildingsTab(entry) {
  var sheet = entry.sheets[0];
  var buildingAt = sheet.columns[normalize('Edificios')];
  var locationAt = sheet.columns[normalize('Ubicación')];
  var merged = {};
  var order = [];

  function keep(building, location) {
    var key = normalize(building);

    if (building === '' || location === '') return;
    if (!(key in merged)) order.push(key);

    merged[key] = [building, location];
  }

  var existing = sheetByName(TAB.buildings, false);

  if (existing && existing.getLastRow() > 1) {
    var existingRows = existing.getRange(2, 1, existing.getLastRow() - 1, 2).getValues();

    for (var row = 0; row < existingRows.length; row += 1) {
      keep(text(existingRows[row][0]), text(existingRows[row][1]));
    }
  }

  for (var index = sheet.headerRow + 1; index < sheet.grid.length; index += 1) {
    keep(text(sheet.grid[index][buildingAt]), text(sheet.grid[index][locationAt]));
  }

  if (order.length === 0) return 0;

  var rows = order.map(function (key) {
    return merged[key];
  });

  var target = sheetByName(TAB.buildings, true);
  target.clear();
  target.getRange(1, 1, 1, 2).setValues([['Edificio (como lo escribe el export)', 'Ubicación']]);
  target.getRange(2, 1, rows.length, 2).setValues(rows);
  target.setFrozenRows(1);

  return rows.length;
}

/* -------------------------------------------------------------------------- */
/* Annual tab (section 3)                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The annual series, which the three weekly exports cannot produce.
 *
 * Section 3 compares whole years, and none of the three files carries more than
 * the current month. The numbers are therefore kept by hand in the `Anual` tab
 * — one row per year, twelve month columns — and simply forwarded. An empty tab
 * emits no section, and the app then keeps whatever it already held.
 */
function readAnnual() {
  var sheet = sheetByName(TAB.annual, false);
  var lines = { requests: [], positions: [] };

  if (!sheet || sheet.getLastRow() < 3) return lines;

  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 14).getValues();

  for (var index = 0; index < values.length; index += 1) {
    var row = values[index];
    var kind = normalize(row[0]);
    var year = Number(row[1]);

    if (!isFinite(year) || year < 2000 || year > 2100) continue;

    var target =
      kind.indexOf('PETICION') >= 0 ? lines.requests : kind.indexOf('POSICION') >= 0 ? lines.positions : null;

    if (!target) continue;

    for (var month = 1; month <= 12; month += 1) {
      var value = row[month + 1];

      // A blank month is a month with no data yet, and the chart has to leave
      // a gap there. Writing a zero would read as "none requested".
      if (value === '' || value === null || value === undefined) continue;

      var count = Number(value);
      if (!isFinite(count)) continue;

      target.push([year, month, Math.round(count)].join('\t'));
    }
  }

  return lines;
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

  var folder = text(config[CONFIG_KEYS.folder]);
  var extraction = toIsoDate(config[CONFIG_KEYS.extraction]);

  if (folder === '') {
    throw new Error('Falta el ID de la carpeta de Drive en la pestaña "' + TAB.config + '".');
  }

  if (!extraction) {
    throw new Error(
      'Falta la fecha de extracción en la pestaña "' + TAB.config + '". ' +
        'Es el lunes en el que se sacan los ficheros.'
    );
  }

  return {
    folder: folder,
    extraction: extraction,
    week: Number(config[CONFIG_KEYS.week]) || null
  };
}

/* -------------------------------------------------------------------------- */
/* Main action                                                                 */
/* -------------------------------------------------------------------------- */

function procesarSemana() {
  var ui = SpreadsheetApp.getUi();
  var config = readConfig();
  var mappings = {
    departments: readDepartments(),
    projects: readMapping(TAB.projects),
    buildings: readMapping(TAB.buildings)
  };

  var classified = classifyFolder(config.folder);
  var summary = [];

  try {
    var found = classified.found;

    if (!found.gps && !found.managed && !found.office) {
      throw new Error(
        'En la carpeta no hay ningún fichero reconocible. ' +
          'Se esperan el GPS de peticiones pendientes, el Gestionado de ZPT025 y el de licencias Office.'
      );
    }

    // The buildings master refreshes the mapping tab before anything reads it,
    // so a week that ships a new branch office is classified in the same run.
    if (found.buildings) {
      var buildingRows = refreshBuildingsTab(found.buildings);
      mappings.buildings = readMapping(TAB.buildings);
      summary.push('Edificios: ' + buildingRows + ' filas desde "' + found.buildings.file.getName() + '".');
    }

    var gps = found.gps ? readGps(found.gps, config.extraction, mappings) : null;
    var managed = found.managed ? readManaged(found.managed, mappings) : null;
    var office = found.office ? readOffice(found.office) : null;
    var annual = readAnnual();

    var lines = [TEXTO_HEADER];
    lines.push('semana\t' + config.extraction);
    lines.push('generado\t' + new Date().toISOString());
    lines.push(
      'origen\t' +
        [
          found.gps ? found.gps.file.getName() : '',
          found.managed ? found.managed.file.getName() : '',
          found.office ? found.office.file.getName() : ''
        ]
          .filter(function (name) {
            return name !== '';
          })
          .join('; ')
    );

    if (gps) {
      appendSection(lines, SECTION.weeks, totalsLines(gps.totals));
      appendSection(lines, SECTION.weekDepartments, breakdownLines(gps.departments, 0));
      appendSection(lines, SECTION.weekDepartmentsRaw, breakdownLines(gps.departmentsRaw, 0));
      appendSection(lines, SECTION.weekProjects, breakdownLines(gps.projects, 0));
      summary.push('En gestión: ' + gps.rows + ' posiciones desde "' + found.gps.file.getName() + '".');
    }

    if (managed) {
      appendSection(lines, SECTION.managed, totalsLines(managed.totals));
      appendSection(lines, SECTION.managedDepartments, breakdownLines(managed.departments, 0));
      // Every product, not the top fifteen. The slide draws fifteen, but it
      // chooses them once both weeks are in the app: truncating here stores the
      // top fifteen of each week apart, and a product that reaches the top this
      // week would be charted as a zero for a previous week it did have.
      appendSection(lines, SECTION.managedProducts, breakdownLines(managed.products, 0));
      appendSection(lines, SECTION.managedLocations, breakdownLines(managed.locations, 0));
      // Denominator of the "Sede es el X% del total" sentence. Summed from the
      // locations rather than reusing the weekly total so it stays right if the
      // location breakdown ever starts being truncated like the products are.
      appendSection(lines, SECTION.managedLocationTotals, totalsLines(sumByWeek(managed.locations)));
      appendSection(
        lines,
        SECTION.managedDepartmentProducts,
        departmentProductLines(managed.departmentProducts, 0)
      );
      summary.push('Gestionadas: ' + managed.rows + ' posiciones desde "' + found.managed.file.getName() + '".');

      var unknown = sortedLabels(managed.unknownBuildings);
      if (unknown.length > 0) {
        summary.push(
          'Edificios sin ubicación (' + unknown.length + '): ' + unknown.slice(0, 5).join(', ') +
            '. Añádelos a "' + TAB.buildings + '".'
        );
      }

      var unmapped = sortedLabels(managed.unmappedDepartments);
      if (unmapped.length > 0) {
        summary.push(
          'Departamentos nuevos en gestionadas (' + unmapped.length + '): ' + unmapped.join(', ') +
            '. Salen en la gráfica con su nombre; déjalos en blanco en la tercera columna de "' +
            TAB.departments + '" si no deben salir.'
        );
      }
    }

    if (office) {
      appendSection(lines, SECTION.office, breakdownLines(office.counts, 0));
      summary.push('Office: ' + office.rows + ' posiciones desde "' + found.office.file.getName() + '".');

      var unknownProducts = sortedLabels(office.unknownProducts);
      if (unknownProducts.length > 0) {
        summary.push(
          'Productos Office sin familia (' + unknownProducts.length + '): ' +
            unknownProducts.slice(0, 5).join(', ') + '.'
        );
      }
    }

    appendSection(lines, SECTION.annualRequests, annual.requests);
    appendSection(lines, SECTION.annualPositions, annual.positions);

    writePlano(lines);
    writeCheck(gps, managed, office, config);

    if (classified.skipped.length > 0) {
      summary.push('Ficheros ignorados por no reconocer su cabecera: ' + classified.skipped.join(', ') + '.');
    }

    ui.alert('⭐ AGA Weekly', summary.join('\n\n'), ui.ButtonSet.OK);
  } finally {
    for (var index = 0; index < classified.handles.length; index += 1) {
      discardTemporary(classified.handles[index]);
    }
  }
}

function appendSection(lines, name, rows) {
  if (!rows || rows.length === 0) return;

  lines.push('');
  lines.push('[' + name + ']');

  for (var index = 0; index < rows.length; index += 1) {
    lines.push(rows[index]);
  }
}

function departmentProductLines(departmentProducts, limit) {
  var lines = [];
  var departments = Object.keys(departmentProducts);

  departments.sort();

  for (var index = 0; index < departments.length; index += 1) {
    var department = departments[index];
    var rows = breakdownLines(departmentProducts[department], limit);

    for (var position = 0; position < rows.length; position += 1) {
      var cells = rows[position].split('\t');
      lines.push([cells[0], department, cells[1], cells[2]].join('\t'));
    }
  }

  return lines;
}

/* -------------------------------------------------------------------------- */
/* Output tabs                                                                 */
/* -------------------------------------------------------------------------- */

function writePlano(lines) {
  var sheet = sheetByName(TAB.plano, true);

  sheet.clear();

  var values = [];
  for (var index = 0; index < lines.length; index += 1) {
    values.push([lines[index]]);
  }

  sheet.getRange(1, 1, values.length, 1).setValues(values);
  sheet.setColumnWidth(1, 720);
  sheet.getRange(1, 1, values.length, 1).setFontFamily('Courier New');
}

/**
 * The numbers the colleague used to read off his pivot tables.
 *
 * Not an input to anything: it exists so the week can be checked before the
 * text is uploaded, which is the step the old process did by comparing two
 * copies of the same pivot.
 */
function writeCheck(gps, managed, office, config) {
  var sheet = sheetByName(TAB.check, true);
  var rows = [['Bloque', 'Semana o mes', 'Etiqueta', 'Total']];

  if (gps) {
    rows = rows.concat(checkRows('En gestión · total', gps.totals));
    rows = rows.concat(checkBreakdown('En gestión · departamento', gps.departments));
    rows = rows.concat(checkBreakdown('En gestión · proyecto', gps.projects));
  }

  if (managed) {
    rows = rows.concat(checkRows('Gestionadas · total', managed.totals));
    rows = rows.concat(checkBreakdown('Gestionadas · departamento', managed.departments));
    rows = rows.concat(checkBreakdown('Gestionadas · ubicación', managed.locations));
  }

  if (office) {
    rows = rows.concat(checkBreakdown('Office · familia', office.counts));
  }

  sheet.clear();
  sheet.getRange(1, 1, rows.length, 4).setValues(rows);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, 4).setFontWeight('bold');
  sheet
    .getRange(1, 1, 1, 4)
    .setNote('Generado el ' + new Date().toLocaleString('es-ES') + ' para la extracción ' + config.extraction);
}

function checkRows(block, totals) {
  var weeks = Object.keys(totals).sort();
  var rows = [];

  for (var index = 0; index < weeks.length; index += 1) {
    rows.push([block, weeks[index], '', totals[weeks[index]]]);
  }

  return rows;
}

function checkBreakdown(block, counts) {
  var weeks = Object.keys(counts).sort();
  var rows = [];

  for (var index = 0; index < weeks.length; index += 1) {
    var week = weeks[index];
    var labels = sortedLabels(counts[week]);

    for (var position = 0; position < labels.length; position += 1) {
      rows.push([block, week, labels[position], counts[week][labels[position]]]);
    }
  }

  return rows;
}

/** The PLANO tab as a `.txt` in the same folder, for uploading to AV Weekly. */
function guardarPlanoTxt() {
  var ui = SpreadsheetApp.getUi();
  var sheet = sheetByName(TAB.plano, false);

  if (!sheet || sheet.getLastRow() === 0) {
    ui.alert('⭐ AGA Weekly', 'La pestaña "' + TAB.plano + '" está vacía. Ejecuta antes "Procesar semana".', ui.ButtonSet.OK);
    return;
  }

  var config = readConfig();
  var values = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues();
  var lines = [];

  for (var index = 0; index < values.length; index += 1) {
    lines.push(text(values[index][0]) === '' ? '' : String(values[index][0]));
  }

  var name = 'AGA ' + config.extraction + '.txt';
  var folder = DriveApp.getFolderById(config.folder);
  var existing = folder.getFilesByName(name);

  while (existing.hasNext()) {
    existing.next().setTrashed(true);
  }

  var file = folder.createFile(name, lines.join('\n'), MimeType.PLAIN_TEXT);

  ui.alert('⭐ AGA Weekly', 'Guardado "' + name + '" en la carpeta.\n\nSúbelo en AV Weekly > AGA > Texto plano (Drive).', ui.ButtonSet.OK);

  return file.getId();
}

/* -------------------------------------------------------------------------- */
/* Bootstrap                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Creates every tab the script needs, seeded with the mappings the published
 * report already uses. Safe to run again: existing tabs keep their contents.
 */
function inicializarHoja() {
  var created = [];

  if (!book().getSheetByName(TAB.config)) {
    var config = sheetByName(TAB.config, true);
    config
      .getRange(1, 1, 3, 2)
      .setValues([
        [CONFIG_KEYS.folder, DEFAULT_FOLDER_ID],
        [CONFIG_KEYS.extraction, ''],
        [CONFIG_KEYS.week, '']
      ]);
    config.getRange(1, 1, 3, 1).setFontWeight('bold');
    config.setColumnWidth(1, 260);
    config.setColumnWidth(2, 320);
    created.push(TAB.config);
  }

  created = created.concat(
    seedMapping(
      TAB.departments,
      [
        'Departamento (como lo escribe el export)',
        'Etiqueta en la sección 1',
        'Etiqueta en gestionadas (vacío = no sale)'
      ],
      SEEDS.departments
    )
  );

  created = created.concat(
    seedMapping(TAB.projects, ['Proyecto (como lo escribe el export)', 'Etiqueta del informe'], SEEDS.projects)
  );

  created = created.concat(
    seedMapping(TAB.buildings, ['Edificio (como lo escribe el export)', 'Ubicación'], SEEDS.buildings)
  );

  if (!book().getSheetByName(TAB.annual)) {
    var annual = sheetByName(TAB.annual, true);
    annual
      .getRange(1, 1, 1, 14)
      .setValues([
        ['Serie', 'Año', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
      ]);
    annual.getRange(2, 1, 2, 2).setValues([['Peticiones', ''], ['Posiciones', '']]);
    annual.getRange(1, 1, 1, 14).setFontWeight('bold');
    annual.setFrozenRows(1);
    created.push(TAB.annual);
  }

  if (!book().getSheetByName(TAB.instructions)) {
    writeInstructions();
    created.push(TAB.instructions);
  }

  SpreadsheetApp.getUi().alert(
    '⭐ AGA Weekly',
    created.length === 0
      ? 'Todas las pestañas ya existían. No se ha cambiado nada.'
      : 'Pestañas creadas: ' + created.join(', ') + '.\n\nRellena "' + TAB.config + '" antes de procesar.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function seedMapping(name, header, rows) {
  if (book().getSheetByName(name)) return [];

  var sheet = sheetByName(name, true);
  var width = header.length;

  sheet.getRange(1, 1, 1, width).setValues([header]);
  sheet.getRange(2, 1, rows.length, width).setValues(rows);
  sheet.getRange(1, 1, 1, width).setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 380);

  for (var column = 2; column <= width; column += 1) {
    sheet.setColumnWidth(column, 260);
  }

  return [name];
}

function writeInstructions() {
  var sheet = sheetByName(TAB.instructions, true);
  var lines = [
    ['⭐ AGA Weekly — informe semanal de AGA'],
    [''],
    ['Cada semana'],
    ['1. Sube a la carpeta de Drive los tres ficheros tal cual llegan, sin tocarlos:'],
    ['   · el GPS de peticiones pendientes, · el Gestionado de ZPT025, · el de licencias Office.'],
    ['2. En la pestaña "' + TAB.config + '", pon la fecha de extracción (el lunes en que se sacan).'],
    ['3. Menú "⭐ AGA Weekly" > "Procesar semana".'],
    ['4. Revisa la pestaña "' + TAB.check + '": son los mismos totales de las tablas dinámicas.'],
    ['5. Copia la pestaña "' + TAB.plano + '" entera y súbela en AV Weekly > AGA > Texto plano (Drive).'],
    ['   También puedes usar "Guardar PLANO como .txt en la carpeta" y subir el fichero.'],
    [''],
    ['Qué hace cada pestaña'],
    ['· ' + TAB.config + ': carpeta de Drive y fecha de extracción.'],
    ['· ' + TAB.departments + ': nombre del departamento en el export y nombre en el informe.'],
    ['· ' + TAB.projects + ': lo mismo para los proyectos. Holding Renove y Renove Holding van juntos.'],
    ['· ' + TAB.buildings + ': edificio y ubicación. Se actualiza sola si subes el fichero de Edificios.'],
    ['· ' + TAB.annual + ': los totales anuales de la sección 3, que no salen de los tres ficheros.'],
    ['· ' + TAB.check + ': los totales para comprobar antes de subir.'],
    ['· ' + TAB.plano + ': el texto que lee AV Weekly. No se edita a mano.'],
    [''],
    ['Si aparece un departamento, proyecto o edificio nuevo'],
    ['El aviso al terminar dice cuáles. Añádelos a su pestaña de mapa y vuelve a procesar.'],
    ['Nada se descarta: lo que no está mapeado sale con su nombre en bruto, y los edificios'],
    ['desconocidos se cuentan como "Sin clasificar", para que los totales sigan cuadrando.']
  ];

  sheet.clear();
  sheet.getRange(1, 1, lines.length, 1).setValues(lines);
  sheet.setColumnWidth(1, 820);
  sheet.getRange(1, 1, 1, 1).setFontWeight('bold');
  sheet.getRange(3, 1, 1, 1).setFontWeight('bold');
  sheet.getRange(12, 1, 1, 1).setFontWeight('bold');
  sheet.getRange(21, 1, 1, 1).setFontWeight('bold');
}
