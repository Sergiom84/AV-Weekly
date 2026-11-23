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

/**
 * The Gestionado ZPT025 export: positions closed in the reported week.
 *
 * The colleague uploads one week and only one week. `Fecha Gestionado` is not
 * the week key: Drive and Sheets routinely convert that column, and a Monday
 * whose closing days are all 1–12 leaves no text cell to detect the swap.
 * Every counted row is stamped with the extraction Monday from Configuración.
 * Office is the file that still has to interpret dates.
 */
function readManaged(entry, mappings, extraction) {
  if (!extraction) {
    throw new Error(
      'Gestionado necesita la fecha de extracción (el lunes de Configuración).'
    );
  }

  var totals = {};
  var departments = {};
  var products = {};
  var locations = {};
  var departmentProducts = {};
  var unknownBuildings = {};
  var unmappedDepartments = {};
  var rows = 0;
  var skipped = 0;
  var week = extraction;

  for (var sheetIndex = 0; sheetIndex < entry.sheets.length; sheetIndex += 1) {
    var sheet = entry.sheets[sheetIndex];
    var requestAt = sheet.columns[normalize('Nº Petición de sistemas')];
    var departmentAt = sheet.columns[normalize('Denominación Departamento')];
    var productAt = sheet.columns[normalize('Denominación Producto')];
    var buildingAt = sheet.columns[normalize('Denominación Edificio')];

    for (var index = sheet.headerRow + 1; index < sheet.grid.length; index += 1) {
      var row = sheet.grid[index];

      if (text(row[requestAt]) === '') continue;

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
    datesIgnored: true,
    totals: totals,
    departments: departments,
    products: products,
    locations: locations,
    departmentProducts: departmentProducts,
    unknownBuildings: unknownBuildings,
    unmappedDepartments: unmappedDepartments
  };
}

/** `dd/mm/yyyy` or `dd.mm.yyyy` text, as `[day, month, year]`. */
var TEXT_DATE = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/;

/**
 * Whether a wholly converted `Fecha Gestionado` column reads as one week once
 * its day and month are exchanged.
 *
 * `columnaConFechasIntercambiadas` needs a text cell to anchor the reading, and
 * the export only leaves one behind when some closing day is 13 or higher. The
 * ZPT025 of 14/09/2026 closed between the 7th and the 11th, so every cell came
 * back converted and the column read as "the 9th" of five different months:
 * one week spread over five, of which only the fragment that landed on the
 * reported week was charted.
 *
 * The tell that stands without a text cell is the export itself: it lists the
 * positions closed in one week. Mirrors `agaManagedDatesAreSwapped`.
 */
function columnaDeUnaSemanaIntercambiada(sheet, at) {
  var literal = {};
  var intercambiada = {};
  var textos = {};
  var convertidas = 0;

  for (var index = sheet.headerRow + 1; index < sheet.grid.length; index += 1) {
    var value = (sheet.grid[index] || [])[at];
    var parts = celdaDeFecha(value);

    if (!parts) {
      var semanaTexto = managedWeekKey(value);
      if (semanaTexto) textos[semanaTexto] = true;
      continue;
    }

    if (parts[2] > 12) return false;

    var semanaLiteral = managedWeekKey(parts[0] + '-' + pad2(parts[1]) + '-' + pad2(parts[2]));
    var semanaCambiada = managedWeekKey(parts[0] + '-' + pad2(parts[2]) + '-' + pad2(parts[1]));

    if (!semanaLiteral || !semanaCambiada) return false;

    convertidas += 1;
    literal[semanaLiteral] = true;
    intercambiada[semanaCambiada] = true;
  }

  var semanas = Object.keys(intercambiada);

  if (convertidas === 0 || semanas.length !== 1 || Object.keys(literal).length < 2) {
    return false;
  }

  return Object.keys(textos).every(function(semana) { return semana === semanas[0]; });
}

/**
 * Whether a date column was converted by a spreadsheet reading `dd/mm/yyyy` as
 * `mm/dd/yyyy`.
 *
 * The tell is a column that mixes text and dates. A day of 13 or higher cannot
 * be read as a month, so those cells stay text; the rest become real dates with
 * the day and the month exchanged. A column that is all text or all dates is
 * left alone, and so is one where some date cell has a day above 12, because
 * then the exchange does not explain what is in the column and repairing it
 * would be a guess.
 */
function columnaConFechasIntercambiadas(sheet, at) {
  var textos = 0;
  var fechas = 0;
  var intercambiables = 0;

  for (var index = sheet.headerRow + 1; index < sheet.grid.length; index += 1) {
    var value = (sheet.grid[index] || [])[at];
    var parts = celdaDeFecha(value);

    if (parts) {
      fechas += 1;
      if (parts[2] <= 12) intercambiables += 1;
      continue;
    }

    var match = TEXT_DATE.exec(text(value));

    if (match && Number(match[1]) > 12) textos += 1;
  }

  if (!(textos > 0 && fechas > 0 && intercambiables === fechas)) return false;
  var mesesTexto = {};
  var native = [];
  for (var j = sheet.headerRow + 1; j < sheet.grid.length; j += 1) {
    var cell = (sheet.grid[j] || [])[at];
    if (celdaDeFecha(cell)) native.push(cell);
    var match = TEXT_DATE.exec(text(cell));
    if (!match || Number(match[1]) <= 12) continue;
    mesesTexto[match[3] + '-' + pad2(Number(match[2]))] = true;
    var next = new Date(Date.UTC(Number(match[3]), Number(match[2]), 1));
    mesesTexto[next.getUTCFullYear() + '-' + pad2(next.getUTCMonth() + 1)] = true;
  }
  if (native.every(function(cell) { return !!mesesTexto[toIsoMonth(cell)]; })) return false;
  return native.every(function(cell) { return !!mesesTexto[mesIntercambiado(cell)]; });
}

/**
 * A cell the spreadsheet already resolved into a date: a `Date` or the Excel
 * serial the same cell becomes in a converted workbook. Textual dates are left
 * out: those are the ones the American conversion could not touch.
 */
function celdaDeFecha(value) {
  if (value instanceof Date || typeof value === 'number') return dateParts(value);

  return null;
}

/** `YYYY-MM` of a swapped cell, reading its day as the month. */
function mesIntercambiado(value) {
  var parts = celdaDeFecha(value);

  return parts && parts[2] <= 12 ? parts[0] + '-' + pad2(parts[2]) : null;
}

/** `YYYY-MM` of the month before the given one. */
function mesAnterior(month) {
  var year = Number(month.slice(0, 4));
  var number = Number(month.slice(5, 7));
  var date = new Date(Date.UTC(year, number - 2, 1));

  return date.getUTCFullYear() + '-' + pad2(date.getUTCMonth() + 1);
}

/**
 * The Office export: licences per month and family.
 *
 * `extraction` bounds the months to the reported one and the one before it. The
 * export lists the licences handled in the current month, and at the start of a
 * month it still drags the closing of the previous one; anything else is
 * history. A row outside that window is dropped and counted instead of
 * imported, because writing it would overwrite a month of the stored series
 * that nothing will write again — which is exactly what a mangled date column
 * does when nobody bounds it.
 */
function readOffice(entry, extraction) {
  var counts = {};
  var unknownProducts = {};
  var rows = 0;
  var skipped = 0;
  var corregidas = 0;
  var fueraDeVentana = 0;
  var limite = extraction ? toIsoMonth(extraction) : null;
  var anterior = limite ? mesAnterior(limite) : null;

  for (var sheetIndex = 0; sheetIndex < entry.sheets.length; sheetIndex += 1) {
    var sheet = entry.sheets[sheetIndex];
    var requestAt = sheet.columns[normalize('Nº Petición de sistemas')];
    var productAt = sheet.columns[normalize('Denominación Producto')];
    var dateAt = sheet.columns[normalize('Fecha de inicio de la gestión')];
    var intercambiadas = columnaConFechasIntercambiadas(sheet, dateAt);
    if (!intercambiadas && limite) {
      var dates = sheet.grid.slice(sheet.headerRow + 1).filter(function(row) {
        return text(row[requestAt]) !== '';
      }).map(function(row) { return row[dateAt]; });
      var inWindow = function(month) { return month === limite || month === anterior; };
      if (dates.length > 0 && !dates.every(function(cell) { return inWindow(toIsoMonth(cell)); })) {
        // The repair is taken when it explains the whole column: every cell
        // readable as `mm/dd`, every repaired month inside the window and no
        // repaired date after the extraction. The literal reading only has to
        // fail somewhere. Demanding that it fail everywhere blocked the real
        // September export, where 5 of its 42 converted rows happened to land
        // on August and September. Mirrors `agaOfficeDatesNeedRepair`.
        var allRepaired = dates.every(function(cell) {
          var parts = celdaDeFecha(cell);
          if (!parts || parts[2] > 12) return false;
          var repaired = parts[0] + '-' + pad2(parts[2]) + '-' + pad2(parts[1]);
          return inWindow(mesIntercambiado(cell)) && repaired <= extraction;
        });
        if (!allRepaired) {
          throw new Error('Fechas Office ambiguas o fuera del periodo informado. Revisa día/mes y la fecha de extracción.');
        }
        intercambiadas = true;
      }
    }

    for (var index = sheet.headerRow + 1; index < sheet.grid.length; index += 1) {
      var row = sheet.grid[index];

      if (text(row[requestAt]) === '') continue;

      var cell = row[dateAt];
      var corregido = intercambiadas ? mesIntercambiado(cell) : null;

      if (corregido) corregidas += 1;

      var month = corregido || toIsoMonth(cell);
      var family = officeFamily(row[productAt]);

      if (!month) {
        throw new Error('Office contiene una fecha vacía o inválida. Corrige el origen antes de generar el TXT.');
      }

      if (limite && (month > limite || month < anterior)) {
        fueraDeVentana += 1;
        skipped += 1;
        continue;
      }

      if (family === '') {
        var product = text(row[productAt]) || '(en blanco)';
        throw new Error('Producto Office sin familia: ' + product + '. Define su clasificación antes de generar el TXT.');
      }

      bump(counts, month, family);
      rows += 1;
    }
  }

  if (fueraDeVentana > 0) throw new Error('Office contiene posiciones fuera del periodo informado. Revisa las fechas antes de generar el TXT.');

  return {
    rows: rows,
    skipped: skipped,
    corregidas: corregidas,
    fueraDeVentana: fueraDeVentana,
    counts: counts,
    unknownProducts: unknownProducts
  };
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

