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
    config.getRange(1, 2, 3, 1).setNumberFormat('@');
    config
      .getRange(1, 1, 3, 2)
      .setValues([
        [CONFIG_KEYS.folder, obtenerIdCarpetaBrutoAga()],
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
    ['2. En la pestaña "' + TAB.config + '", pon la fecha de extracción (el lunes en que se sacan),'],
    ['   o usa "⭐ AGA Weekly > Poner lunes actual en Configuración" para rellenarla como texto.'],
    ['3. Menú "⭐ AGA Weekly" > "Procesar semana". Sale un recordatorio antes de empezar y guarda el .txt en Drive.'],
    ['4. Revisa la pestaña "' + TAB.check + '": el Gestionado es el fichero entero (una semana),'],
    ['   sin cortar por Fecha Gestionado. Office sí mira fechas (columna de inicio de gestión).'],
    ['5. Sube el fichero "AGA AAAA-MM-DD.txt" generado en Drive en AV Weekly > AGA > Texto plano (Drive)'],
    ['   (o copia la pestaña "' + TAB.plano + '" entera).'],
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
  // Headings found by their text, not by a row number: adding one line to the
  // steps above used to leave the bold rows pointing at the wrong sentences.
  var headings = [
    '⭐ AGA Weekly — informe semanal de AGA',
    'Cada semana',
    'Qué hace cada pestaña',
    'Si aparece un departamento, proyecto o edificio nuevo'
  ];

  for (var index = 0; index < lines.length; index += 1) {
    if (headings.indexOf(lines[index][0]) !== -1) {
      sheet.getRange(index + 1, 1, 1, 1).setFontWeight('bold');
    }
  }
}

