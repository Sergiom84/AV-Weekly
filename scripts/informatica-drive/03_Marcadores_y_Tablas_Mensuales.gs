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
 * True when the extraction date is the calendar day already stored.
 *
 * Procesar semana does not stop on this. A second click the same day refreshes
 * the data. Semana anterior stays put because debeRodarSemanaAnterior is false
 * for that same day.
 */
function extraccionYaProcesada(extraction, lastProcessed) {
  if (!extraction || !lastProcessed) return false;

  return isoDate(extraction) === isoDate(lastProcessed);
}

/** Today as `yyyy-mm-dd` in the script's time zone, local time outside Apps Script. */
function hoyIso(now) {
  var date = now || new Date();

  if (typeof Utilities !== 'undefined' && typeof Session !== 'undefined') {
    return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }

  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
}

/**
 * True when the extraction date is later than today.
 *
 * The date drives the month close: a future date freezes the month still in
 * progress with partial data and opens months that have not begun, and the
 * book cannot undo that by itself. No export can come from the future.
 */
function extraccionFutura(extraction, now) {
  if (!extraction) return false;

  return isoDate(extraction) > hoyIso(now);
}

function comprobarExtraccionNoFutura(extraction, now) {
  if (!extraccionFutura(extraction, now)) return;

  var today = hoyIso(now).split('-');

  throw new Error(
    'La fecha de extracción (' + fechaCorta(extraction) + ') es posterior a hoy (' +
      today[2] + '/' + today[1] + '/' + today[0] + '). Escribe en "' + CONFIG_KEYS.extraction +
      '" el día en que se sacaron los ficheros.'
  );
}

/**
 * UTC midnight of today in the script time zone.
 *
 * This is the extraction date of every run. The operator does not type it,
 * and a future date left in the cell cannot survive into the month close.
 */
function extraccionDeHoy(now) {
  var parts = hoyIso(now).split('-');

  return utcDate(Number(parts[0]), Number(parts[1]), Number(parts[2]));
}

/** Stamps Configuración with today and returns that date on `config`. */
function aplicarExtraccionDeHoy(config, now) {
  config.extraction = extraccionDeHoy(now);
  writeConfigValue(CONFIG_KEYS.extraction, config.extraction);

  return config;
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
/* Month helpers                                                               */
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

/* -------------------------------------------------------------------------- */
/* Monthly tables                                                              */
/* -------------------------------------------------------------------------- */

/**
 * First month the script writes in the monthly tables (2.1.1, Hoja 13, 14,
 * 15 and the survey history). July 2026 and earlier were closed by hand and
 * are never touched.
 */
var MES_GESTION_INICIAL = '2026/08';

/** Last closed month while Configuración does not say: the last one closed by hand. */
var MES_CERRADO_INICIAL = '2026/07';

/** First day of a `yyyy/mm` month, at UTC midnight. */
function fechaDeMes(month) {
  var match = MONTH_TEXT.exec(month);

  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
}

/** `yyyy/mm` of a cell that holds a month (a date or `2026/08`), or ''. */
function mesDeCelda(value) {
  var date = toDate(value);

  return date && fechaOperativa(date) ? monthLabel(date) : '';
}

/** Months from `from` to `to`, both included. */
function mesesEntre(from, to) {
  var months = [];

  for (var month = from; month !== '' && month <= to && months.length < 240; month = shiftMonthLabel(month, 1)) {
    months.push(month);
  }

  return months;
}

function pestanaMensual(name) {
  var sheet = sheetByName(name, false);

  if (!sheet) throw new Error('Falta la pestaña ' + name + '.');

  return sheet;
}

function recalcular() {
  if (typeof SpreadsheetApp !== 'undefined' && typeof SpreadsheetApp.flush === 'function') {
    SpreadsheetApp.flush();
  }
}

function copiarFormato(source, target) {
  source.copyTo(target, { formatOnly: true });
}

/** Resolved, assigned and assignments by month of one HIC block (3-3 or 4-4). */
function serieMensualHic(source) {
  var series = {};
  var data = sourceRows(source);

  for (var rowIndex = 0; rowIndex < data.length; rowIndex += 1) {
    var row = data[rowIndex] || [];
    var date = toDate(row[0]);

    if (!date || !fechaOperativa(date)) continue;

    series[monthLabel(date)] = [toNumber(row[1]), toNumber(row[2]), toNumber(row[3])];
  }

  return series;
}

/**
 * Surveys by month of tab 1-1: answers rated 1 to 5 and their sum, the same
 * figures C31 and J33 of the survey report compute for the month in L24.
 */
function serieMensualEncuestas(found) {
  var source = firstSource(found.encuestas, 'Encuestas');
  var header = source.grid[source.headerRow] || [];
  var monthAt = headerIndex(header)[normalize('Fecha')];
  var scoreAt = columnLikeIndex(header, 'Nivel de satis');
  var series = {};

  if (monthAt === undefined || scoreAt < 0) {
    throw new Error('El template de encuestas no trae Fecha y la valoración general.');
  }

  for (var rowIndex = source.headerRow + 1; rowIndex < source.grid.length; rowIndex += 1) {
    var row = source.grid[rowIndex] || [];
    var date = toDate(row[monthAt]);
    var score = toNumber(row[scoreAt]);

    if (!date || !fechaOperativa(date) || text(row[scoreAt]) === '') continue;
    if (score < 1 || score > 5 || Math.floor(score) !== score) continue;

    var month = monthLabel(date);
    var current = series[month] || { numero: 0, suma: 0 };

    current.numero += 1;
    current.suma += score;
    series[month] = current;
  }

  return series;
}

/** Row and column of the month total in the site-by-type table of 2.1.6 (Informe). */
function celdaTotalWorkOrders(sheet) {
  var grid = sheet
    .getRange(1, 1, Math.min(sheet.getMaxRows(), 120), Math.min(sheet.getMaxColumns(), 40))
    .getValues();

  for (var rowIndex = 0; rowIndex < grid.length; rowIndex += 1) {
    if (normalize(grid[rowIndex][1]) !== 'EDIFICIO') continue;

    // The small per-site table at the top also says Edificio / Total, with
    // Total in C; the site-by-type table keeps it after the type columns.
    var totalAt = -1;

    for (var column = 6; column < grid[rowIndex].length; column += 1) {
      if (normalize(grid[rowIndex][column]) === 'TOTAL') totalAt = column;
    }

    if (totalAt < 0) continue;

    for (var below = rowIndex + 1; below < grid.length; below += 1) {
      if (text(grid[below][0]) === '' && text(grid[below][1]) === '') {
        return { row: below + 1, column: totalAt + 1 };
      }
    }
  }

  throw new Error('2.1.6 Work Orders (Informe) no trae la tabla Edificio por tipo con su columna Total.');
}

/**
 * Work orders of `month` as the report counts them: the book's own table,
 * filtered by territorial and type, read with its date markers H1:I1 on that
 * month. The markers are put back afterwards.
 */
function workOrdersDelMes(month) {
  var sheet = pestanaMensual(TAB.workOrdersInforme);
  var cell = celdaTotalWorkOrders(sheet);
  var markers = sheet.getRange(1, 8, 1, 2);
  var previous = markers.getValues();
  var bounds = monthBounds(fechaDeMes(month));

  markers.setValues([[bounds.first, bounds.last]]);
  recalcular();

  var value = toNumber(sheet.getRange(cell.row, cell.column).getValue());

  markers.setValues(previous);

  return value;
}

/** Month → row of a dated column, and the row of the latest month. */
function filasPorMes(sheet, column, firstRow) {
  var count = sheet.getMaxRows() - firstRow + 1;
  var result = { rows: {}, last: firstRow - 1, lastMonth: '' };

  if (count < 1) return result;

  var values = sheet.getRange(firstRow, column, count, 1).getValues();

  for (var index = 0; index < values.length; index += 1) {
    var month = mesDeCelda(values[index][0]);

    if (month === '') continue;

    result.rows[month] = firstRow + index;

    if (month > result.lastMonth) {
      result.lastMonth = month;
      result.last = firstRow + index;
    }
  }

  return result;
}

/** Month → column of a dated header row, and the column of the latest month. */
function columnasPorMes(sheet, row, firstColumn) {
  var count = sheet.getMaxColumns() - firstColumn + 1;
  var result = { columns: {}, last: firstColumn - 1, lastMonth: '' };

  if (count < 1) return result;

  var values = sheet.getRange(row, firstColumn, 1, count).getValues()[0];

  for (var index = 0; index < values.length; index += 1) {
    var month = mesDeCelda(values[index]);

    if (month === '') continue;

    result.columns[month] = firstColumn + index;

    if (month > result.lastMonth) {
      result.lastMonth = month;
      result.last = firstColumn + index;
    }
  }

  return result;
}

/**
 * Row of `month` in a dated column, appended after the latest month when it
 * is missing. Every written row takes the format of the last hand-closed
 * month, so rows opened by earlier versions of this script line up again.
 */
function filaDelMes(sheet, column, firstRow, width, month) {
  var found = filasPorMes(sheet, column, firstRow);
  var row = found.rows[month];

  if (!row) {
    row = found.last + 1;
    asegurarFila(sheet, row);
  }

  var model = found.rows[MES_CERRADO_INICIAL] || (row > firstRow ? row - 1 : 0);

  if (model >= firstRow && model !== row) {
    copiarFormato(sheet.getRange(model, column, 1, width), sheet.getRange(row, column, 1, width));
  }

  return row;
}

function limpiarFilasPosteriores(sheet, column, firstRow, width, limit, cleared) {
  var found = filasPorMes(sheet, column, firstRow);

  for (var month in found.rows) {
    if (month <= limit || month < MES_GESTION_INICIAL) continue;

    sheet.getRange(found.rows[month], column, 1, width).clearContent();
    cleared[month] = true;
  }
}

/** 2.1.1: one block (A for 3-3, F for 4-4), date and the three HIC figures. */
function escribirMesVolumetria(sheet, column, month, values) {
  var row = filaDelMes(sheet, column, 4, 4, month);

  sheet.getRange(row, column, 1, 4).setValues([[fechaDeMes(month)].concat(values || ['', '', ''])]);
}

/** Hoja 13: totals (3-5), BBVA (6-8) and BBVA Tech (9-11) under the month header. */
function escribirMesHistorico(sheet, month, bbva, tech) {
  var found = columnasPorMes(sheet, 2, 3);
  var column = found.columns[month];

  if (!column) {
    column = found.last + 1;
    asegurarColumna(sheet, column);

    // A side table may sit right after the history. Move it instead of
    // writing over it; formulas elsewhere follow the inserted column.
    if (rangoTieneContenido(sheet.getRange(2, column, 10, 1))) sheet.insertColumnBefore(column);
  }

  var model = found.columns[MES_CERRADO_INICIAL];

  if (model && model !== column) {
    copiarFormato(sheet.getRange(2, model, 10, 1), sheet.getRange(2, column, 10, 1));
  }

  var values = [['']];

  if (bbva || tech) {
    var b = bbva || [0, 0, 0];
    var t = tech || [0, 0, 0];

    values = [[b[0] + t[0]], [b[1] + t[1]], [b[2] + t[2]], [b[0]], [b[1]], [b[2]], [t[0]], [t[1]], [t[2]]];
  } else {
    values = [[''], [''], [''], [''], [''], [''], [''], [''], ['']];
  }

  sheet.getRange(2, column).setValue(fechaDeMes(month));
  sheet.getRange(3, column, 9, 1).setValues(values);
}

function limpiarColumnasPosteriores(sheet, limit, cleared) {
  var found = columnasPorMes(sheet, 2, 3);

  for (var month in found.columns) {
    if (month <= limit || month < MES_GESTION_INICIAL) continue;

    sheet.getRange(2, found.columns[month], 10, 1).clearContent();
    cleared[month] = true;
  }
}

/** Hoja 14: the month cell of the year column, a new year column when January needs it. */
function escribirMesWorkOrdersAnual(sheet, month, value) {
  var date = fechaDeMes(month);
  var year = date.getUTCFullYear();
  var column = columnaAnual(sheet, year);

  if (column === 0) {
    var previous = columnaAnual(sheet, year - 1);

    if (previous === 0) throw new Error('Hoja 14 no trae la columna del año ' + (year - 1) + '.');

    column = asegurarColumnaAnual(sheet, year, previous);
  }

  sheet.getRange(4 + date.getUTCMonth(), column).setValue(value);
}

function limpiarWorkOrdersAnualPosteriores(sheet, limit, cleared) {
  var months = mesesEntre(shiftMonthLabel(limit, 1), shiftMonthLabel(limit, 12));

  for (var index = 0; index < months.length; index += 1) {
    if (months[index] < MES_GESTION_INICIAL) continue;

    var date = fechaDeMes(months[index]);
    var column = columnaAnual(sheet, date.getUTCFullYear());

    if (column === 0) continue;

    var cell = sheet.getRange(4 + date.getUTCMonth(), column);

    if (text(cell.getValue()) === '' && text(cell.getFormula()) === '') continue;

    cell.clearContent();
    cleared[months[index]] = true;
  }
}

/** Hoja 15: incidents (BBVA + BBVA Tech resolved), work orders and their sum. */
function escribirMesTotal(sheet, month, incidencias, workOrders) {
  var row = filaDelMes(sheet, 1, 2, 4, month);

  sheet.getRange(row, 1, 1, 3).setValues([[fechaDeMes(month), incidencias, workOrders]]);

  if (text(sheet.getRange(row, 4).getFormula()) === '') {
    sheet.getRange(row, 4).setFormula('=SUM(B' + row + ':C' + row + ')');
  }
}

/** 2.1.5 (Informe): surveys and mean of the month, Histórico or Vivo. */
function escribirMesEncuestas(sheet, month, survey, live) {
  var row = filaDelMes(sheet, 2, 4, 4, month);
  var numero = survey ? survey.numero : 0;

  sheet.getRange(row, 2, 1, 4).setValues([
    [fechaDeMes(month), numero, numero > 0 ? survey.suma / numero : '', live ? 'Vivo' : 'Histórico']
  ]);

  return row;
}

/** Points the chart window G2:… at the last `windowMonths` rows up to the live one. */
function ventanaEncuestas(sheet, liveRow, windowMonths) {
  var width = Number(windowMonths);

  if (!isFinite(width) || width < 1) width = DEFAULT_WINDOW_MONTHS;
  width = Math.min(Math.round(width), liveRow - 3);

  var firstRow = liveRow - width + 1;
  var dates = [];
  var averages = [];

  for (var index = 0; index < width; index += 1) {
    dates.push('=B' + (firstRow + index));
    averages.push('=D' + (firstRow + index));
  }

  asegurarColumna(sheet, 6 + width);
  sheet.getRange(2, 7, 1, width).setFormulas([dates]);
  sheet.getRange(3, 7, 1, width).setFormulas([averages]);
  sheet.getRange(1, 6).setValue(width + ' meses');
}

/**
 * Hoja 19 keeps one formula pair per month, bounded by its own dates, so it
 * needs no freezing: pairs are added up to the live month and pairs after it
 * are emptied.
 */
function ajustarImacs(current, limit, cleared) {
  var sheet = pestanaMensual(TAB.imacsInforme);

  for (var guard = 0; guard < 24; guard += 1) {
    var live = ultimaParejaImacs(sheet);

    if (live === 0) throw new Error('Hoja 19 no trae ningún par mensual válido.');

    var liveMonth = mesDeCelda(sheet.getRange(5, live).getValue());

    if (liveMonth === '' || liveMonth >= current) break;

    cerrarImacs(fechaDeMes(shiftMonthLabel(liveMonth, 1)));
  }

  for (var column = 3; column < sheet.getMaxColumns(); column += 2) {
    var month = mesDeCelda(sheet.getRange(5, column).getValue());

    if (month === '') break;
    if (month <= limit || month < MES_GESTION_INICIAL) continue;

    sheet.getRange(3, column, 48, 2).clearContent();
    cleared[month] = true;
  }
}

/** Every tab the monthly tables write, checked before the first write of a run. */
function validarTablasMensuales() {
  var names = [
    TAB.volumetria,
    TAB.volumetriaHistorico,
    TAB.workOrdersMensual,
    TAB.totalMensual,
    TAB.encuestasInforme,
    TAB.imacsInforme
  ];

  for (var index = 0; index < names.length; index += 1) pestanaMensual(names[index]);

  celdaTotalWorkOrders(pestanaMensual(TAB.workOrdersInforme));
}

/**
 * Writes the monthly tables as values, from the months after the last closed
 * one up to the extraction month.
 *
 * Months before the extraction month are written once, with the most complete
 * data there is (the export of the 1st), and from then on are closed: a late
 * survey or correction does not change them. The extraction month stays live
 * and is rewritten on every run. Anything after it is emptied, so the next run
 * with a right date undoes a run made with a wrong one.
 */
function actualizarMeses(found, extraction, lastClosed, windowMonths) {
  var current = monthLabel(extraction);
  var result = { cerrados: [], vivo: '', limpiados: [], ultimoCerrado: lastClosed };

  // An extraction inside an already closed month has nothing left to write.
  if (current <= lastClosed) return result;

  var next = shiftMonthLabel(lastClosed, 1);
  var months = mesesEntre(next > MES_GESTION_INICIAL ? next : MES_GESTION_INICIAL, current);
  var grids = templateGrids(found);
  var bbva = serieMensualHic(monthlySource(grids, '3-3'));
  var tech = serieMensualHic(monthlySource(grids, '4-4'));
  var surveys = serieMensualEncuestas(found);
  var volumetria = pestanaMensual(TAB.volumetria);
  var historico = pestanaMensual(TAB.volumetriaHistorico);
  var anual = pestanaMensual(TAB.workOrdersMensual);
  var total = pestanaMensual(TAB.totalMensual);
  var encuestas = pestanaMensual(TAB.encuestasInforme);
  var cleared = {};

  // Cleared first, so a missing month is appended right after the real last one.
  limpiarFilasPosteriores(volumetria, 1, 4, 4, current, cleared);
  limpiarFilasPosteriores(volumetria, 6, 4, 4, current, cleared);
  limpiarColumnasPosteriores(historico, current, cleared);
  limpiarWorkOrdersAnualPosteriores(anual, current, cleared);
  limpiarFilasPosteriores(total, 1, 2, 4, current, cleared);
  limpiarFilasPosteriores(encuestas, 2, 4, 4, current, cleared);

  var liveRow = 0;

  for (var index = 0; index < months.length; index += 1) {
    var month = months[index];
    var workOrders = workOrdersDelMes(month);
    var b = bbva[month] || null;
    var t = tech[month] || null;
    var incidencias = b || t ? (b ? b[0] : 0) + (t ? t[0] : 0) : '';

    escribirMesVolumetria(volumetria, 1, month, b);
    escribirMesVolumetria(volumetria, 6, month, t);
    escribirMesHistorico(historico, month, b, t);
    escribirMesWorkOrdersAnual(anual, month, workOrders);
    escribirMesTotal(total, month, incidencias, workOrders);
    liveRow = escribirMesEncuestas(encuestas, month, surveys[month], month === current);

    if (month < current) result.cerrados.push(month);
  }

  ventanaEncuestas(encuestas, liveRow, windowMonths);
  ajustarImacs(current, current, cleared);

  var keyboard = pestanaMensual(TAB.workOrdersInforme);

  if (yearFromCell(keyboard.getRange(45, 3).getValue()) !== extraction.getUTCFullYear()) {
    cerrarBloqueTeclado(fechaDeMes(current));
  }

  var closed = shiftMonthLabel(current, -1);

  if (closed > lastClosed) {
    writeConfigValue(CONFIG_KEYS.lastClosed, closed);
    result.ultimoCerrado = closed;
  }

  result.vivo = current;
  result.limpiados = Object.keys(cleared).sort();

  return result;
}

/** One line for Comprobación: what was closed, what is live, what was emptied. */
function describirMeses(result) {
  if (result.vivo === '') {
    return 'La extracción cae en un mes ya cerrado (' + result.ultimoCerrado + '): no se escribe ningún mes.';
  }

  var parts = [];

  if (result.cerrados.length > 0) parts.push('Cerrados: ' + result.cerrados.join(', '));
  parts.push('vivo: ' + result.vivo);
  if (result.limpiados.length > 0) parts.push('vaciados: ' + result.limpiados.join(', '));

  return parts.join('; ');
}

