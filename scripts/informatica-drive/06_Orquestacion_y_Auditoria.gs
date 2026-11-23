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
    var guardados = informe.peticionesMesGuardados || [];

    informe.archivos.push({
      name: guardados.length > 0
        ? 'Peticiones de mes (ausente, se mantiene ' + guardados[guardados.length - 1] + ')'
        : 'Peticiones de mes (ausente)',
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

function procesarSemana() {
  var config = null;
  var clasificacion = null;

  try {
    config = readConfig();

    // Today, not the cell. A typed future date would close the live month.
    // The same calendar day is allowed: the second click refreshes the files
    // and debeRodarSemanaAnterior keeps Semana anterior from rolling twice.
    aplicarExtraccionDeHoy(config);
    comprobarExtraccionNoFutura(config.extraction);

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

    // Every source check that can fail runs here, before the week rolls or the
    // data tabs are written. The stamp above is only today's date. A second
    // click the same day refreshes the files and does not roll again.
    validarOrigenes(clasificacion.found, config.extraction);
    validarTablasMensuales();

    informe.semanaRodada = rodarSemanaAnterior(config.extraction, config.lastProcessed);
    writeConfigValue(CONFIG_KEYS.lastProcessed, config.extraction);
    escribirDatos(clasificacion.found, informe);
    repararFormulas(informe);
    escribirMarcadores(config.extraction);

    // After the dumps: a month is closed with the data of the first export of
    // the next month, which on the 1st is the whole month.
    var meses = actualizarMeses(
      clasificacion.found,
      config.extraction,
      config.lastClosed,
      config.windowMonths
    );
    var mesesEscritos = meses.cerrados.length + (meses.vivo === '' ? 0 : 1);

    informe.leidas[TAB.volumetria] = mesesEscritos * 2;
    informe.escritas[TAB.volumetria] = mesesEscritos * 2;
    informe.cierreStatus = meses.vivo === '' ? 'AVISO' : 'OK';
    informe.cierre = describirMeses(meses);

    var week = weekBounds(config.extraction);
    var month = monthBounds(config.extraction);

    informe.marcadores = {
      weekMonday: week.monday,
      weekSunday: week.sunday,
      monthFirst: month.first,
      monthLast: month.last
    };

    var agregado = agregar(clasificacion.found, config.extraction);

    // The monthly trio arrives once a month; every other week PLANO carries
    // what the tab remembers, so the monthly slide holds until the next close.
    agregado.peticionesMes = guardarPeticionesMes(agregado.peticionesMes);
    informe.peticionesMesGuardados = mesesDistintos(agregado.peticionesMes);

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
/**
 * Moves an earlier TXT to the archive subfolder instead of trashing it, so a
 * reprocessed week never loses the previous version. The subfolder is created
 * inside the output folder the first time it is needed.
 */
function archivarTxt(file, outputFolder, archiveName) {
  var folders = outputFolder.getFoldersByName(archiveName);
  var archive = folders.hasNext() ? folders.next() : outputFolder.createFolder(archiveName);
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH-mm');
  file.setName(file.getName().replace(/\.txt$/, ' (archivado ' + stamp + ').txt'));
  file.moveTo(archive);
}

function escribirPlanoTxt(notify) {
  var sheet = sheetByName(TAB.plano, false);

  if (!sheet || sheet.getLastRow() < 1) {
    throw new Error('La pestaña "' + TAB.plano + '" está vacía. Ejecuta antes "Procesar semana".');
  }

  var config = readConfig();

  if (!config.extraction) config.extraction = extraccionDeHoy();

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

  var archiveFolderName = obtenerNombreCarpetaHistoricoInformatica();

  while (existing.hasNext()) {
    var candidate = existing.next();

    if (candidate.getId() !== createdId) archivarTxt(candidate, folder, archiveFolderName);
  }

  // Versions created by the previous script lived beside the raw uploads.
  // Archive that misplaced copy only after the correct file exists.
  if (config.outputFolderId !== config.folderId) {
    var rawFolder = DriveApp.getFolderById(config.folderId);
    var misplaced = rawFolder.getFilesByName(name);

    while (misplaced.hasNext()) archivarTxt(misplaced.next(), folder, archiveFolderName);
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
      [CONFIG_KEYS.folder, obtenerIdCarpetaBrutoInformatica()],
      [CONFIG_KEYS.outputFolder, obtenerIdCarpetaSalidaInformatica()],
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
      [CONFIG_KEYS.outputFolder, obtenerIdCarpetaSalidaInformatica()]
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

