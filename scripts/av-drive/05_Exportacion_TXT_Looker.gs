// ==========================================
// 05. LOOKER STUDIO, EXPORTACION TXT Y RECUPERACION HISTORICA
// ==========================================

function volcarDatosLookerStudio() {
  const ss = obtenerLibroTendencias();

  let hojaUbicacion = ss.getSheetByName('Ubicacion');
  if (!hojaUbicacion) hojaUbicacion = ss.insertSheet('Ubicacion');
  hojaUbicacion.clearContents();

  let hojaResolucion = ss.getSheetByName('Resolucion');
  if (!hojaResolucion) hojaResolucion = ss.insertSheet('Resolucion');
  hojaResolucion.clearContents();

  const cabecerasUbicacion = ['Fecha', 'Semana', 'Tipo Soporte', 'Edificio', 'Tickets'];
  const cabecerasResolucion = ['Fecha', 'Semana', 'Tipo Soporte', 'Categoría', 'Acción', 'Tickets'];

  const datosUbicacion = [cabecerasUbicacion];
  const datosResolucion = [cabecerasResolucion];

  const getFechaLunesSemana = (semana) => {
    const fecha = new Date(2025, 11, 29);
    fecha.setDate(fecha.getDate() + ((semana - 1) * 7));
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const dia = String(fecha.getDate()).padStart(2, '0');
    return `${fecha.getFullYear()}-${mes}-${dia}`;
  };

  CONF_UBICACION_AV.forEach((conf) => {
    const hoja = ss.getSheetByName(conf.hoja);
    if (!hoja) return;
    const limiteCol = Math.min(hoja.getLastColumn(), 56);
    const valoresRango = hoja.getRange(1, 1, hoja.getLastRow(), limiteCol).getValues();
    for (let col = 3; col < limiteCol; col++) {
      const numSemana = Number(valoresRango[conf.fSem - 1][col]);
      if (Number.isInteger(numSemana) && numSemana >= 1 && numSemana <= 53) {
        const fecha = getFechaLunesSemana(numSemana);
        for (let fila in conf.filas) {
          const val = valoresRango[fila - 1][col];
          const tickets = (val === '') ? 0 : Number(val);
          datosUbicacion.push([fecha, numSemana, conf.tipo, conf.filas[fila], tickets]);
        }
      }
    }
  });

  CONF_RESOLUCION_AV.forEach((conf) => {
    const hoja = ss.getSheetByName(conf.hoja);
    if (!hoja) return;
    const inicioCol = (conf.tipo === 'REMOTO') ? 1 : 3;
    const maxColSemana = inicioCol + 53;
    const limiteCol = Math.min(hoja.getLastColumn(), maxColSemana);
    const valoresRango = hoja.getRange(1, 1, hoja.getLastRow(), limiteCol).getValues();
    for (let col = inicioCol; col < limiteCol; col++) {
      const numSemana = Number(valoresRango[conf.fSem - 1][col]);
      if (Number.isInteger(numSemana) && numSemana >= 1 && numSemana <= 53) {
        const fecha = getFechaLunesSemana(numSemana);
        for (let fila in conf.filas) {
          const val = valoresRango[fila - 1][col];
          const tickets = (val === '') ? 0 : Number(val);
          datosResolucion.push([fecha, numSemana, conf.tipo, conf.filas[fila][0], conf.filas[fila][1], tickets]);
        }
      }
    }
  });

  if (datosUbicacion.length > 1) {
    hojaUbicacion.getRange(1, 1, datosUbicacion.length, datosUbicacion[0].length).setValues(datosUbicacion);
  }
  if (datosResolucion.length > 1) {
    hojaResolucion.getRange(1, 1, datosResolucion.length, datosResolucion[0].length).setValues(datosResolucion);
  }

  return true;
}

function maxSemanaConDato() {
  const hoja = obtenerLibroTendencias().getSheetByName('Remotos');
  if (!hoja) return 0;
  const maxCol = Math.min(hoja.getLastColumn(), 54);
  if (maxCol < 2) return 0;
  const fila = hoja.getRange(5, 1, 1, maxCol).getValues()[0];
  const valores = hoja.getRange(6, 1, 1, maxCol).getValues()[0];
  let max = 0;
  for (let i = 1; i < fila.length; i++) {
    const semana = Number(fila[i]);
    const tickets = Number(valores[i]);
    if (Number.isInteger(semana) && semana >= 1 && semana <= 53 && tickets > 0) max = Math.max(max, semana);
  }
  return max;
}

function serializarPlanoAv(numSemana) {
  const ss = obtenerLibroTendencias();
  const anio = anioInformeActual();
  const semana = Number(numSemana) || maxSemanaConDato();
  const lineas = [
    'AV TEXTO PLANO v1',
    'semana\t' + semana,
    'anio\t' + anio,
    'generado\t' + new Date().toISOString(),
    'origen\tTendencias AV'
  ];

  const hojaUbicacion = ss.getSheetByName('Ubicacion');
  if (hojaUbicacion && hojaUbicacion.getLastRow() > 1) {
    lineas.push('', '[UBICACION]');
    const ubic = hojaUbicacion.getRange(2, 1, hojaUbicacion.getLastRow() - 1, 5).getValues();
    for (let i = 0; i < ubic.length; i++) {
      const semanaU = Number(ubic[i][1]);
      const tipoU = String(ubic[i][2] || '').trim();
      const edificio = String(ubic[i][3] || '').trim();
      const ticketsU = Number(ubic[i][4]);
      if (!semanaU || !tipoU || !edificio) continue;
      lineas.push([semanaU, tipoU, edificio, ticketsU].join('\t'));
    }
  }

  const hojaResolucion = ss.getSheetByName('Resolucion');
  if (hojaResolucion && hojaResolucion.getLastRow() > 1) {
    lineas.push('', '[RESOLUCION]');
    const reso = hojaResolucion.getRange(2, 1, hojaResolucion.getLastRow() - 1, 6).getValues();
    for (let r = 0; r < reso.length; r++) {
      const semanaR = Number(reso[r][1]);
      const tipoR = String(reso[r][2] || '').trim();
      const categoria = String(reso[r][3] || '').trim();
      const accion = String(reso[r][4] || '').trim();
      const ticketsR = Number(reso[r][5]);
      if (!semanaR || !tipoR) continue;
      lineas.push([semanaR, tipoR, categoria, accion, ticketsR].join('\t'));
    }
  }

  const tipoPorClave = {
    REMOTOS: 'REMOTO',
    PROGRAMADOS: 'PROGRAMADO',
    PRESENCIALES: 'PRESENCIAL',
    INCIDENCIAS: 'INCIDENCIA',
    CORRECTIVOS: 'CORRECTIVO'
  };
  lineas.push('', '[MENSUAL]');
  Object.keys(CONFIG_MENSUAL).forEach((clave) => {
    const conf = CONFIG_MENSUAL[clave];
    const hoja = ss.getSheetByName(conf.hoja);
    if (!hoja) return;
    const colActual = columnaAIndice(conf.colActual);
    const colPasado = columnaAIndice(conf.colPasado);
    const tipo = tipoPorClave[clave];
    for (let mes = 0; mes < 12; mes++) {
      const fila = conf.rangoFilas[0] + mes;
      const actual = hoja.getRange(fila, colActual).getValue();
      const pasado = hoja.getRange(fila, colPasado).getValue();
      if (actual !== '' && actual !== null && !isNaN(Number(actual))) {
        lineas.push([anio, mes + 1, tipo, Number(actual)].join('\t'));
      }
      if (pasado !== '' && pasado !== null && !isNaN(Number(pasado))) {
        lineas.push([anio - 1, mes + 1, tipo, Number(pasado)].join('\t'));
      }
    }
  });

  lineas.push('', '[COMPARATIVA]');
  const hojasComp = [
    { hoja: 'Remotos', tipo: 'REMOTO' },
    { hoja: 'Programados', tipo: 'PROGRAMADO' },
    { hoja: 'Presenciales', tipo: 'PRESENCIAL' },
    { hoja: 'Incidencias', tipo: 'INCIDENCIA' },
    { hoja: 'Correctivos', tipo: 'CORRECTIVO' }
  ];
  const anioPasado = anio - 1;
  hojasComp.forEach((item) => {
    const hoja = ss.getSheetByName(item.hoja);
    if (!hoja) return;
    const maxCol = Math.max(hoja.getLastColumn(), 56);
    const valores = hoja.getRange(1, 1, hoja.getLastRow(), maxCol).getValues();
    for (let fila = 0; fila < valores.length; fila++) {
      let colMarca = -1;
      for (let c = 0; c <= 2 && c < valores[fila].length; c++) {
        if (Number(valores[fila][c]) === anioPasado) {
          colMarca = c;
          break;
        }
      }
      if (colMarca < 0) continue;
      const siguiente = valores[fila + 1] || [];
      const limiteCol = Math.min(valores[fila].length, colMarca + 54);
      for (let col = colMarca + 1; col < limiteCol; col++) {
        const semanaC = Number(valores[fila][col]);
        if (!Number.isInteger(semanaC) || semanaC < 1 || semanaC > 53) continue;
        const ticketsC = Number(siguiente[col]);
        if (isNaN(ticketsC)) continue;
        lineas.push([anioPasado, semanaC, item.tipo, ticketsC].join('\t'));
      }
      break;
    }
  });

  const hojaExtr = ss.getSheetByName(CONFIG_EVENTOS_EXTR.hoja);
  if (hojaExtr && hojaExtr.getLastRow() >= 3) {
    lineas.push('', '[EVENTOS_EXTR]');
    const resumenVal = String(hojaExtr.getRange('A16').getValue() || '').replace(/\r?\n/g, ' ').trim();
    if (resumenVal) {
      lineas.push('resumen\t' + resumenVal);
    }
    const maxFila = Math.min(hojaExtr.getLastRow(), 25);
    const datosExtr = hojaExtr.getRange(2, 1, maxFila - 1, 9).getValues();
    for (let eIdx = 1; eIdx < datosExtr.length; eIdx++) {
      const filaMes = datosExtr[eIdx];
      const nombreFila = String(filaMes[0] || '').trim();
      if (!nombreFila) continue;
      const vals = [];
      for (let c = 1; c < 9; c++) {
        const v = Number(filaMes[c]);
        vals.push(isNaN(v) ? 0 : v);
      }
      lineas.push([nombreFila].concat(vals).join('\t'));
      if (nombreFila.toLowerCase() === 'total') break;
    }
  }

  return lineas.join('\n') + '\n';
}

function archivarTxtAnteriores(folder, nombreNuevo) {
  const historico = obtenerCarpetaHistorico();
  const archivos = folder.getFiles();
  const sello = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH-mm');
  while (archivos.hasNext()) {
    const archivo = archivos.next();
    const nombre = archivo.getName();
    if (!/^AV \d{4}-S\d+.*\.txt$/.test(nombre)) continue;
    if (nombre === nombreNuevo) archivo.setName(nombre.replace(/\.txt$/, ' (archivado ' + sello + ').txt'));
    archivo.moveTo(historico);
  }
}

function leerResolucionesTxt(texto) {
  const resultado = {};
  let seccion = '';
  texto.split('\n').forEach((linea) => {
    const limpia = linea.replace(/\r$/, '');
    if (/^\[.*\]$/.test(limpia)) { seccion = limpia; return; }
    if (seccion !== '[RESOLUCION]') return;
    const partes = limpia.split('\t');
    if (partes.length < 5) return;
    const tickets = Number(partes[4]);
    if (!(tickets > 0)) return;
    const clave = partes[1] + '|' + Number(partes[0]);
    resultado[clave] = resultado[clave] || {};
    const detalle = partes[2] + '|' + partes[3];
    resultado[clave][detalle] = (resultado[clave][detalle] || 0) + tickets;
  });
  return resultado;
}

function semanasSinDetalle(destinoSs) {
  const faltan = [];
  CONF_RESOLUCION_AV.forEach((conf) => {
    if (conf.tipo === 'REMOTO') return;
    const bloque = BLOQUES_SEMANALES.filter((b) => b.hoja === conf.hoja)[0];
    const hoja = destinoSs.getSheetByName(conf.hoja);
    if (!hoja || !bloque) return;
    const maxCol = Math.max(hoja.getLastColumn(), 58);
    const valores = hoja.getRange(1, 1, hoja.getLastRow(), maxCol).getValues();
    for (let semana = 1; semana <= 53; semana++) {
      const col = semana + bloque.desplazamiento - 1;
      if (col >= maxCol) continue;
      if (Number(valores[conf.fSem - 1][col]) !== semana) continue;
      let ubicaciones = 0;
      for (let f = bloque.filas[0]; f <= bloque.filas[1]; f++) ubicaciones += Number(valores[f - 1][col]) || 0;
      if (ubicaciones <= 0) continue;
      let detalle = 0;
      Object.keys(conf.filas).forEach((fila) => { detalle += Number(valores[fila - 1][col]) || 0; });
      if (detalle === 0) faltan.push({ conf: conf, hoja: hoja, semana: semana, col: col + 1, ubicaciones: ubicaciones });
    }
  });
  return faltan;
}

function recuperarDetalleDesdeHistorico(destinoSs) {
  const faltan = semanasSinDetalle(destinoSs);
  if (faltan.length === 0) return [];

  const anio = anioInformeActual();
  const txts = [];
  [obtenerCarpetaHistorico(), obtenerCarpetaTxt()].forEach((carpeta) => {
    const archivos = carpeta.getFiles();
    while (archivos.hasNext()) {
      const archivo = archivos.next();
      const m = archivo.getName().match(/^AV (\d{4})-S\d+.*\.txt$/);
      if (m && Number(m[1]) === anio) txts.push(archivo);
    }
  });
  txts.sort((a, b) => b.getLastUpdated() - a.getLastUpdated());

  const lineas = [];
  const cache = {};
  faltan.forEach((falta) => {
    const clave = falta.conf.tipo + '|' + falta.semana;
    for (let i = 0; i < txts.length; i++) {
      const id = txts[i].getId();
      if (!cache[id]) cache[id] = leerResolucionesTxt(txts[i].getBlob().getDataAsString('UTF-8'));
      const detalle = cache[id][clave];
      if (!detalle) continue;
      let suma = 0;
      Object.keys(falta.conf.filas).forEach((fila) => {
        const par = falta.conf.filas[fila];
        const valor = detalle[par[0] + '|' + par[1]];
        if (!valor) return;
        const celda = falta.hoja.getRange(Number(fila), falta.col);
        if (celda.getValue() === '' || celda.getValue() === null) celda.setValue(valor);
        suma += valor;
      });
      lineas.push(`${falta.conf.hoja} S${falta.semana}: detalle recuperado de "${txts[i].getName()}" (${suma} de ${falta.ubicaciones}).`);
      return;
    }
  });
  return lineas;
}

function revisarSemanas(destinoSs, ultima) {
  const avisos = [];
  for (let semana = 1; semana <= ultima; semana++) {
    const vacias = BLOQUES_SEMANALES.filter((bloque) => {
      const hoja = destinoSs.getSheetByName(bloque.hoja);
      if (!hoja) return false;
      const valores = hoja.getRange(bloque.filas[0], semana + bloque.desplazamiento, bloque.filas[1] - bloque.filas[0] + 1, 1).getValues();
      return !valores.some((fila) => Number(fila[0]) > 0);
    }).map((bloque) => bloque.hoja);
    if (vacias.length === BLOQUES_SEMANALES.length) avisos.push(`S${semana}: vacía en todas las pestañas.`);
    else if (vacias.length > 0) avisos.push(`S${semana}: sin datos en ${vacias.join(', ')}.`);
  }
  semanasSinDetalle(destinoSs).forEach((falta) => {
    avisos.push(`${falta.conf.hoja} S${falta.semana}: ubicaciones sin detalle de resolución.`);
  });
  return avisos;
}

function escribirPlanoTxt(numSemana) {
  const ss = obtenerLibroTendencias();
  if (!ss.getSheetByName('Ubicacion') || !ss.getSheetByName('Resolucion')) {
    volcarDatosLookerStudio();
  }
  const semana = Number(numSemana) || maxSemanaConDato();
  const anio = anioInformeActual();
  const name = 'AV ' + anio + '-S' + semana + '.txt';
  const texto = serializarPlanoAv(semana);
  const folder = obtenerCarpetaTxt();
  archivarTxtAnteriores(folder, name);
  return folder.createFile(name, texto, MimeType.PLAIN_TEXT);
}

function guardarPlanoTxt() {
  const ui = SpreadsheetApp.getUi();
  try {
    volcarDatosLookerStudio();
    const archivo = escribirPlanoTxt();
    ui.alert(
      'AV Weekly',
      'Guardado "' + archivo.getName() + '" en la carpeta.\n\nSúbelo en AV Weekly > Audiovisuales > Texto plano (Drive).',
      ui.ButtonSet.OK
    );
    return archivo.getId();
  } catch (e) {
    ui.alert('AV Weekly', e.message, ui.ButtonSet.OK);
  }
}
