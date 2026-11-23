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

/**
 * Month the template's relative tables ("Mes Actual", "SLAs finalizados mes
 * en curso") describe. Usually the latest HIC month, but the export of the
 * 1st has no row yet for the month that just began: its "mes en curso" is
 * already that month and "mes anterior" is the one just closed. The
 * extraction date settles it, so the later of the two wins.
 */
function templateCurrentMonth(grids, extraction) {
  var latest = templateReferenceMonth(grids);
  var date = toDate(extraction);
  var current = date ? monthLabel(date) : '';

  return current > latest ? current : latest;
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
 * The stored monthly request rows with this run's folded in.
 *
 * The trio is uploaded once a month, but PLANO is rebuilt every week and the
 * app replaces its dataset with each complete text. Without a memory here the
 * first weekly run after the close would publish the month empty again. A
 * month this run brings replaces itself; every other month stays as stored.
 */
function fusionarPeticionesMes(guardadas, nuevas) {
  var propios = {};
  var out = [];

  for (var index = 0; index < nuevas.length; index += 1) propios[String(nuevas[index][0])] = true;

  for (var stored = 0; stored < guardadas.length; stored += 1) {
    if (!propios[String(guardadas[stored][0])]) out.push(guardadas[stored]);
  }

  return out.concat(nuevas).sort(function (left, right) {
    var a = left.join('\t');
    var b = right.join('\t');

    return a < b ? -1 : a > b ? 1 : 0;
  });
}

/** Month label of a stored cell, which Sheets may have turned into a date. */
function mesGuardado(value) {
  if (value instanceof Date) return value.getFullYear() + '/' + pad2(value.getMonth() + 1);

  var match = /^(\d{4})[\/-](\d{1,2})/.exec(text(value));

  return match ? match[1] + '/' + pad2(Number(match[2])) : '';
}

/** Distinct months of a set of monthly rows, oldest first. */
function mesesDistintos(filas) {
  var vistos = {};
  var out = [];

  for (var index = 0; index < filas.length; index += 1) {
    var mes = String(filas[index][0]);

    if (!vistos[mes]) {
      vistos[mes] = true;
      out.push(mes);
    }
  }

  return out.sort();
}

function leerPeticionesMesGuardadas() {
  var sheet = sheetByName(TAB.peticionesMes, false);

  if (!sheet || sheet.getLastRow() < 2) return [];

  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
  var out = [];

  for (var index = 0; index < values.length; index += 1) {
    var mes = mesGuardado(values[index][0]);

    if (mes === '' || text(values[index][1]) === '' || text(values[index][2]) === '') continue;

    out.push([mes, text(values[index][1]), text(values[index][2]), toNumber(values[index][3])]);
  }

  return out;
}

/**
 * Keeps the monthly request rows in their own tab and returns the full set.
 *
 * The tab is only rewritten when this run brought the trio, so a weekly run
 * without it reads the history and leaves the sheet untouched. Column A is
 * plain text: typed as a value, 2026/09 would become a date.
 */
function guardarPeticionesMes(nuevas) {
  var todas = fusionarPeticionesMes(leerPeticionesMesGuardadas(), nuevas);

  if (nuevas.length === 0) return todas;

  var sheet = sheetByName(TAB.peticionesMes, true);
  var values = [['Mes', 'Origen', 'Métrica', 'Total']].concat(todas);

  sheet.clear();
  sheet.getRange(1, 1, values.length, 1).setNumberFormat('@');
  sheet.getRange(1, 1, values.length, 4).setValues(values);

  return todas;
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

/**
 * Runs, on throwaway buckets, the template reads that stop on a malformed
 * source, so procesarSemana fails before touching the book instead of after
 * the dumps. They only read the small HIC, comparison and SLA tabs.
 */
function validarOrigenes(found, extraction) {
  agregarHic(found, {});
  agregarComparativas(found, {}, extraction);
  agregarSlas(found, {}, extraction);

  var citas = found.citas && found.citas.sheets ? found.citas.sheets : [];

  for (var index = 0; index < citas.length; index += 1) {
    var columns = citas[index].columns || headerIndex(citas[index].grid[citas[index].headerRow] || []);

    if (columns[normalize('Estado')] === undefined) {
      throw new Error('La pestaña de citas no trae Estado.');
    }
  }
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

function agregarComparativas(found, comparativas, extraction) {
  var grids = templateGrids(found);
  var reference = templateCurrentMonth(grids, extraction);

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

/** Whether an SLA tab has any SVTTitle row besides the Total line. */
function slaTieneFilas(grid, headerAt) {
  for (var rowIndex = headerAt + 1; rowIndex < grid.length; rowIndex += 1) {
    var svt = text((grid[rowIndex] || [])[0]);

    if (svt !== '' && normalize(svt) !== 'TOTAL') return true;
  }

  return false;
}

function agregarSlas(found, slas, extraction) {
  var grids = templateGrids(found);
  var reference = templateCurrentMonth(grids, extraction);

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

    // If neither Cumplido nor Incumplido is present, this tab has no SLA
    // measurement data (e.g. empty month at the beginning of the period, or
    // SLAs not yet entered for this month). Skip it safely without failing.
    if (met === undefined && missed === undefined) continue;

    var month = normalize(grids[gridIndex].name).indexOf('MES AN') >= 0 ? shiftMonthLabel(reference, -1) : reference;

    for (var dataIndex = headerAt + 1; dataIndex < grid.length; dataIndex += 1) {
      var row = grid[dataIndex] || [];
      var svt = text(row[0]);

      if (svt === '' || normalize(svt) === 'TOTAL') continue;

      var metValue = met !== undefined ? leadingNumber(row[met]) : 0;
      var missedValue = missed !== undefined ? leadingNumber(row[missed]) : 0;
      var totalValue = total !== undefined ? leadingNumber(row[total]) : metValue + missedValue;
      bump(slas, [month, svt, metValue, missedValue], totalValue);
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
  agregarComparativas(found, buckets.comparativas, date);
  agregarSlas(found, buckets.slas, date);
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

