/* -------------------------------------------------------------------------- */
/* Main action                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The extraction cell exactly as the sheet holds it, for the reminder.
 *
 * Read raw and never thrown from: the whole point is to show a cell that is
 * already wrong, before `readConfig` refuses it. A `Date` here is the defect
 * itself — Sheets converted the text — so it is shown as a date, which is what
 * makes the swapped day and month visible.
 */
function extraccionEscrita() {
  try {
    var sheet = sheetByName(TAB.config, false);

    if (!sheet) return '';

    var values = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), 2).getValues();

    for (var index = 0; index < values.length; index += 1) {
      if (text(values[index][0]) === CONFIG_KEYS.extraction) {
        var value = values[index][1];

        return value instanceof Date
          ? 'convertida por Sheets a ' + isoDate(new Date(Date.UTC(
              value.getFullYear(), value.getMonth(), value.getDate()
            )))
          : text(value);
      }
    }
  } catch (err) {
    // A malformed sheet must not block the reminder.
  }

  return '';
}

/**
 * Reminder shown before the week is processed.
 *
 * The two defects it names are the two that reached a published report and
 * that nothing downstream can repair on its own:
 *
 * - An extraction date typed without the apostrophe. Sheets reads `07/09/2026`
 *   as month first and stores 9 July; every week of section 1 is then filed
 *   under S28 and the deck charts a second one. Gestionado is stamped with
 *   that same Monday, so a converted extraction date misfiles section 2 too.
 * - A building missing from the mapping tab. Its positions carry no location,
 *   so slide 2.4 draws bars that add up to less than the week.
 *
 * It runs before `readConfig` so it is seen even when the date is the problem,
 * and it is cancellable: the point is to be read, not clicked through.
 */
function recordatorioAntesDeProcesar(ui) {
  var escrita = extraccionEscrita();
  var lines = [
    'Antes de procesar, comprueba dos cosas.',
    '',
    '1. La fecha de extracción, en la pestaña "' + TAB.config + '".',
    '   Es el lunes en que se sacan los ficheros y se escribe con apóstrofo',
    '   delante, como texto:   \'2026-09-07',
    '   Sin el apóstrofo, Sheets la convierte y el 7 de septiembre se guarda',
    '   como 9 de julio: el informe sale con la semana equivocada.'
  ];

  if (escrita !== '') {
    lines.push('   Ahora mismo la hoja dice: ' + escrita);
  }

  lines.push(
    '',
    '2. Los edificios nuevos, en la pestaña "' + TAB.buildings + '".',
    '   Si subes el fichero de Edificios a la carpeta, la pestaña se actualiza',
    '   sola y no hay nada que hacer.',
    '   Si no, añade una fila: el edificio tal cual lo escribe el export en la',
    '   primera columna, y su ubicación en la segunda.',
    '   Un edificio sin ubicación cuenta como "Sin clasificar" y la 2.4 deja de',
    '   cuadrar con el total de la semana.',
    '',
    '¿Continúo?'
  );

  return ui.alert('⭐ AGA Weekly', lines.join('\n'), ui.ButtonSet.OK_CANCEL) ===
    ui.Button.OK;
}

function procesarSemana() {
  var ui = SpreadsheetApp.getUi();

  if (!recordatorioAntesDeProcesar(ui)) {
    return;
  }

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
    var managed = found.managed ? readManaged(found.managed, mappings, config.extraction) : null;
    var office = found.office ? readOffice(found.office, config.extraction) : null;
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

      if (office.corregidas > 0) {
        summary.push(
          'Fechas Office con día y mes intercambiados, corregidas: ' + office.corregidas +
            '. El fichero llegó convertido en formato americano.'
        );
      }

      if (office.fueraDeVentana > 0) {
        summary.push(
          'Posiciones Office fuera del mes informado y el anterior, descartadas: ' +
            office.fueraDeVentana +
            '. Revisa las fechas del fichero antes de presentar la 2.8: el histórico no se toca.'
        );
      }

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

    var savedTxt = escribirPlanoTxtEnCarpeta(lines, config);
    summary.push('TXT guardado: "' + savedTxt.name + '" en la carpeta.');

    if (classified.skipped.length > 0) {
      summary.push('Ficheros ignorados por no reconocer su cabecera: ' + classified.skipped.join(', ') + '.');
    }

    ui.alert('⭐ AGA Weekly', summary.join('\n\n'), ui.ButtonSet.OK);

    if (managed) {
      mostrarAvisoEdificiosSinClasificar(ui, managed.unknownBuildings);
    }
  } finally {
    for (var index = 0; index < classified.handles.length; index += 1) {
      discardTemporary(classified.handles[index]);
    }
  }
}

function formatearAvisoEdificios(unknownBuildings) {
  var unknown = sortedLabels(unknownBuildings);

  if (unknown.length === 0) return '';

  var totalPositions = 0;
  for (var index = 0; index < unknown.length; index += 1) {
    totalPositions += unknownBuildings[unknown[index]] || 0;
  }

  var maxListed = 15;
  var listed = unknown.slice(0, maxListed);
  var lines = [
    'Hay ' +
      unknown.length +
      (unknown.length === 1 ? ' edificio sin ubicación (' : ' edificios sin ubicación (') +
      totalPositions +
      (totalPositions === 1 ? ' posición).' : ' posiciones).'),
    'Se han contado como "Sin clasificar" en la slide 2.4.',
    '',
    'Edificios afectados:'
  ];

  for (var i = 0; i < listed.length; i += 1) {
    var name = listed[i];
    var count = unknownBuildings[name] || 0;
    lines.push('  · ' + name + ' (' + count + (count === 1 ? ' posición)' : ' posiciones)'));
  }

  if (unknown.length > maxListed) {
    lines.push(
      '  · … y ' +
        (unknown.length - maxListed) +
        ' más (ver lista completa en la pestaña "' +
        TAB.check +
        '").'
    );
  }

  lines.push(
    '',
    'Qué hacer para solucionarlo:',
    '· Opción 1 (manual):',
    '  1) Copia el nombre exacto de arriba (o de "' + TAB.check + '", filas "Gestionadas · edificio sin mapa").',
    '  2) Pégalo al final de la pestaña "' + TAB.buildings + '" en la columna A.',
    '  3) Escribe su ubicación en la columna B (ej. Sede, Tablas I, Madrid, Barcelona...).',
    '  4) Vuelve a ejecutar "⭐ AGA Weekly > Procesar semana".',
    '· Opción 2 (automática):',
    '  1) Sube el fichero maestro de Edificios a la carpeta de Drive.',
    '  2) Vuelve a ejecutar "⭐ AGA Weekly > Procesar semana" (la pestaña se actualiza sola).',
    '',
    'Nota: El TXT ya se ha guardado en Drive; corrige el mapeo y vuelve a pulsar "Procesar semana" antes de subirlo a AV Weekly para que la 2.4 salga completa.'
  );

  return lines.join('\n');
}

function mostrarAvisoEdificiosSinClasificar(ui, unknownBuildings) {
  var message = formatearAvisoEdificios(unknownBuildings);

  if (message === '') return;

  ui.alert('⚠️ AGA Weekly — Edificios sin clasificar', message, ui.ButtonSet.OK);
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
    var unknownList = sortedLabels(managed.unknownBuildings);
    for (var uIndex = 0; uIndex < unknownList.length; uIndex += 1) {
      var buildingName = unknownList[uIndex];
      rows.push([
        'Gestionadas · edificio sin mapa',
        config.extraction,
        buildingName,
        managed.unknownBuildings[buildingName]
      ]);
    }
    if (managed.datesIgnored) {
      rows.push([
        'Gestionadas · fechas',
        config.extraction,
        'Fecha Gestionado ignorada; todo a la extracción',
        managed.rows
      ]);
    }
  }

  if (office) {
    rows = rows.concat(checkBreakdown('Office · familia', office.counts));

    if (office.corregidas > 0) {
      rows.push(['Office · fechas', '', 'Día y mes intercambiados, corregidos', office.corregidas]);
    }

    if (office.fueraDeVentana > 0) {
      rows.push([
        'Office · fechas',
        '',
        'Fuera del mes informado y el anterior, descartadas',
        office.fueraDeVentana
      ]);
    }
  }

  sheet.clear();
  sheet.getRange(1, 2, rows.length, 1).setNumberFormat('@');
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

function escribirPlanoTxtEnCarpeta(lines, config) {
  var name = 'AGA ' + config.extraction + '.txt';
  var folder = DriveApp.getFolderById(obtenerIdCarpetaSalidaAga(config.folder));
  var existing = folder.getFilesByName(name);
  var archiveFolderName = obtenerNombreCarpetaHistoricoAga();

  while (existing.hasNext()) {
    archivarTxt(existing.next(), folder, archiveFolderName);
  }

  var file = folder.createFile(name, lines.join('\n'), MimeType.PLAIN_TEXT);

  return { id: file.getId(), name: name };
}

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

  var saved = escribirPlanoTxtEnCarpeta(lines, config);

  ui.alert('⭐ AGA Weekly', 'Guardado "' + saved.name + '" en la carpeta.\n\nSúbelo en AV Weekly > AGA > Texto plano (Drive).', ui.ButtonSet.OK);

  return saved.id;
}

