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
  var extraction = informe.extraction
    ? toDate(informe.extraction)
    : readConfig().extraction || extraccionDeHoy();

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

  // 2.1.1 is written month by month in actualizarMeses, after the markers.
  read[TAB.volumetria] = 0;
  written[TAB.volumetria] = 0;

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

