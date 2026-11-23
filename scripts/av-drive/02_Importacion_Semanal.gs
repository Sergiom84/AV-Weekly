// ==========================================
// 02. IMPORTACION DE TEMPLATES SEMANALES (MULTI-TEMPLATE)
// ==========================================

function clasificarTemplate(nombre) {
  const texto = String(nombre || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (texto.startsWith('templates semanales') || /semanal/.test(texto)) return 'SEMANAL';
  if (/^audiovisuales\s*-\s*resuelta/.test(texto) || /\bmes\b/.test(texto)) return 'MENSUAL';
  if (/evento/.test(texto)) return 'EVENTOS';
  return null;
}

function buscarTemplatesPorTipo(tipo) {
  const archivos = obtenerCarpetaTemplates().getFilesByType(MimeType.GOOGLE_SHEETS);
  const lista = [];
  while (archivos.hasNext()) {
    const archivo = archivos.next();
    if (clasificarTemplate(archivo.getName()) === tipo) {
      lista.push(archivo);
    }
  }
  return lista;
}

function buscarTemplate(tipo) {
  const lista = buscarTemplatesPorTipo(tipo);
  let elegido = null;
  lista.forEach((archivo) => {
    if (!elegido || archivo.getLastUpdated() > elegido.getLastUpdated()) {
      elegido = archivo;
    }
  });
  return elegido;
}

function buscarTemplatesSemanales() {
  return buscarTemplatesPorTipo('SEMANAL');
}

function buscarTemplatesMensuales() {
  return buscarTemplatesPorTipo('MENSUAL');
}

function buscarTemplateSemanal() {
  return buscarTemplate('SEMANAL');
}

function listarExcelPendientes(tipo) {
  const carpeta = obtenerCarpetaTemplates();
  const archivos = carpeta.getFiles();
  const hojasExistentes = {};
  buscarTemplatesPorTipo(tipo).forEach((archivo) => {
    hojasExistentes[normalizarTextoAV(archivo.getName())] = true;
  });
  const pendientes = [];
  while (archivos.hasNext()) {
    const archivo = archivos.next();
    if (archivo.getMimeType() === MimeType.GOOGLE_SHEETS) continue;
    const nombre = archivo.getName();
    if (!/\.xlsx?$/i.test(nombre)) continue;
    if (clasificarTemplate(nombre) !== tipo) continue;
    const base = normalizarTextoAV(nombre.replace(/\.xlsx?$/i, ''));
    if (!hojasExistentes[base]) pendientes.push(nombre);
  }
  return pendientes;
}

function obtenerHojaOrigenPorFragmento(ss, fragmento) {
  const hojas = ss.getSheets();
  for (let i = 0; i < hojas.length; i++) {
    if (hojas[i].getName().includes(fragmento)) return hojas[i];
  }
  return null;
}

function valorOBlancoAV(val) {
  return val > 0 ? val : '';
}

function obtenerNumeroSemanaValido(valor) {
  const num = Number(valor);
  return (!isNaN(num) && num > 0 && num <= 53) ? num : null;
}

function obtenerColumnaSemanaOrigen(hoja, filaCabecera, colTotal, numSemanaObjetivo) {
  const objetivo = Number(numSemanaObjetivo);
  const fila2 = colTotal > 1 ? hoja.getRange(2, 1, 1, colTotal - 1).getValues()[0] : [];
  for (let col = 1; col < colTotal; col++) {
    if (obtenerNumeroSemanaValido(filaCabecera[col - 1]) === objetivo) return col;
    if (obtenerNumeroSemanaValido(fila2[col - 1]) === objetivo) return col;
  }
  return -1;
}

function leerUbicacionesHojaSemanal(origenSs, fragmentoHoja, errorFalta, numSemana, etiquetas) {
  const hoja = obtenerHojaOrigenPorFragmento(origenSs, fragmentoHoja);
  if (!hoja) throw new Error(errorFalta);
  const fila1 = hoja.getRange('A1:ZZ1').getValues()[0];
  let colTotal = -1;
  for (let i = 0; i < fila1.length; i++) {
    if (String(fila1[i]).toUpperCase().trim() === 'TOTAL') { colTotal = i + 1; break; }
  }
  if (colTotal === -1) throw new Error(`No se encontró "Total" en la primera fila de ${fragmentoHoja}.`);
  const colDatos = obtenerColumnaSemanaOrigen(hoja, fila1, colTotal, numSemana);
  const datos = hoja.getDataRange().getValues();
  const valores = {};
  etiquetas.forEach((u) => { valores[u] = ''; });
  for (let f = 0; colDatos > 0 && f < datos.length; f++) {
    const colA = normalizarTextoAV(datos[f][0]);
    const colB = normalizarTextoAV(datos[f][1]);
    etiquetas.forEach((ubicacion) => {
      if (colA === ubicacion || colB === ubicacion) {
        valores[ubicacion] = valorOBlancoAV(Number(datos[f][colDatos - 1]));
      }
    });
  }
  return valores;
}

function sumaUbicacionesDestino(hojaDestino, filasUbic, colDestino) {
  let total = 0;
  Object.keys(filasUbic).forEach((ubic) => {
    total += Number(hojaDestino.getRange(filasUbic[ubic], colDestino).getValue()) || 0;
  });
  return total;
}

const BLOQUES_IMPORTACION_SEMANAL = [
  {
    nombre: 'PROGRAMADOS',
    hojaDestino: 'Programados',
    hojaUbicOrigen: '2-Soporte Programado',
    errorUbicOrigen: 'No se encontró "2-Soporte Programado".',
    filaSem1: 19,
    filaSem2: 26,
    filasUbicDestino: { 'CIUDAD': 27, 'CAMPUS': 28, 'VELA': 29, 'TERRITORIOS': 30, 'RECOLETOS': 31, 'TABLAS': 32 },
    hojaResOrigen: '7-Soporte Programado',
    errorResOrigen: 'No se encontró "7-Soporte Programado - Detalle".',
    filasResExactas: {
      'SALA|PREPARACION SALA': 5, 'SALA|PRESTAMO': 6, 'WEBEX|CONEXION': 7,
      'WEBEX|SEMINARIO WEB': 8, 'WEBEX|TRADUCCION': 9, 'MEET|CONEXION': 10,
      'MEET|TRADUCCION': 11, 'OTRAS VC|CONEXION': 12
    },
    filasResSuma: null,
    todasFilasResDestino: [5, 6, 7, 8, 9, 10, 11, 12],
    filaAjuste: 5,
    etiquetaAjuste: 'SALA|PREPARACION SALA'
  },
  {
    nombre: 'PRESENCIALES',
    hojaDestino: 'Presenciales',
    hojaUbicOrigen: '3-Soporte Presencial',
    errorUbicOrigen: 'No se encontró "3-Soporte Presencial".',
    filaSem1: 21,
    filaSem2: 28,
    filasUbicDestino: { 'TERRITORIOS': 29, 'CIUDAD': 30, 'CAMPUS': 31, 'RECOLETOS': 32, 'TABLAS': 33, 'VELA': 34 },
    hojaResOrigen: '8-Soporte Presencial',
    errorResOrigen: 'No se encontró la pestaña "8-Soporte Presencial".',
    filasResExactas: {
      'SALA|PREPARACION SALA': 5, 'SALA|DES/INSTALACION': 6, 'SALA|DES/MONTAJE': 7,
      'SALA|ENCENDIDO/APAGADO': 8, 'SALA|EVENTO': 9, 'SALA|ETIQUETADO': 10,
      'WEBEX|CONEXION': 11, 'WEBEX|TRADUCCION': 12, 'OTRAS VC|CONEXION': 13, 'MEET|CONEXION': 14
    },
    filasResSuma: null,
    todasFilasResDestino: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
    filaAjuste: 7,
    etiquetaAjuste: 'SALA|DES/MONTAJE',
    normalizarTier2: function (valB) { return valB === 'SALAS' ? 'SALA' : valB; },
    normalizarTier3: function (tier2, valC) { return (tier2 === 'SALA' && valC === '') ? 'DES/INSTALACION' : valC; }
  },
  {
    nombre: 'INCIDENCIAS',
    hojaDestino: 'Incidencias',
    hojaUbicOrigen: '4-Incidencias por semanas',
    errorUbicOrigen: 'No se encontró "4-Incidencias por semanas".',
    filaSem1: 41,
    filaSem2: 48,
    filasUbicDestino: { 'CIUDAD': 49, 'TERRITORIOS': 50, 'CAMPUS': 51, 'RECOLETOS': 52, 'VELA': 53, 'TABLAS': 54 },
    hojaResOrigen: '9-Incidencias',
    errorResOrigen: 'No se encontró la pestaña "9-Incidencias".',
    filasResExactas: {
      'WEBEX|CONEXION': 6, 'WEBEX|FORMACION': 7, 'WEBEX|GESTION': 8,
      'CABLEADO|PRESTAMO': 10, 'CABLEADO|SANEADO': 11, 'CABLEADO|SUSTITUCION': 12,
      'PC\\PORTATIL|CONFIGURACION': 14, 'PC/PORTATIL|CONFIGURACION': 14,
      'PC\\PORTATIL|FORMACION': 15, 'PC/PORTATIL|FORMACION': 15,
      'DOMOTICA|CONFIGURACION': 17, 'DOMOTICA|FORMACION': 18, 'DOMOTICA|REINICIO': 19, 'DOMOTICA|SUSTITUCION': 20,
      'MEET|CONEXION': 22, 'MEET|FORMACION': 23
    },
    filasResSuma: {
      'EQUIPO VIDEO': 24, 'EQUIPO DE VIDEO': 24, 'MONITOR': 25, 'EQUIPO AUDIO': 26,
      'VC. CISCO': 27, 'VC CISCO': 27, 'PERIFERICO PC': 28, 'OTRAS VC': 29,
      'PROYECTOR': 30, 'TRADUCCION': 31, 'ROOMWIZARD\\QR': 32, 'ROOMWIZARD/QR': 32, 'VIDEO WALL': 33, 'VIDEOWALL': 33
    },
    todasFilasResDestino: [6, 7, 8, 10, 11, 12, 14, 15, 17, 18, 19, 20, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33],
    filaAjuste: 11,
    etiquetaAjuste: 'CABLEADO|SANEADO'
  },
  {
    nombre: 'CORRECTIVOS',
    hojaDestino: 'Correctivos',
    hojaUbicOrigen: '6-Mantenimientos correctivos po',
    errorUbicOrigen: 'No se encontró "6-Mantenimientos correctivos po".',
    filaSem1: 37,
    filaSem2: 44,
    filasUbicDestino: { 'CIUDAD': 45, 'TERRITORIOS': 46, 'CAMPUS': 47, 'RECOLETOS': 48, 'VELA': 49, 'TABLAS': 50 },
    hojaResOrigen: '10-Mantenimientos correctivos',
    errorResOrigen: 'No se encontró "10-Mantenimientos correctivos".',
    filasResExactas: {
      'ALMACEN|INVENTARIO': 6, 'ALMACEN|TRASLADO': 7,
      'CABLEADO|SANEADO': 9, 'CABLEADO|SUSTITUCION': 10,
      'PC\\PORTATIL|CONFIGURACION': 12, 'PC/PORTATIL|CONFIGURACION': 12,
      'PC\\PORTATIL|REINICIO': 13, 'PC/PORTATIL|REINICIO': 13,
      'PC\\PORTATIL|SUSTITUCION': 14, 'PC/PORTATIL|SUSTITUCION': 14,
      'EQUIPO AUDIO|CONFIGURACION': 16, 'EQUIPO AUDIO|REINICIO': 17, 'EQUIPO AUDIO|SUSTITUCION': 18,
      'EQUIPO VIDEO|CONFIGURACION': 20, 'EQUIPO VIDEO|REINICIO': 21, 'EQUIPO VIDEO|SUSTITUCION': 22
    },
    filasResSuma: {
      'PERIFERICO PC': 23, 'MONITOR': 24, 'DOMOTICA': 25,
      'VIDEO WALL': 26, 'VIDEOWALL': 26, 'PROYECTOR': 27,
      'VC. CISCO': 28, 'VC CISCO': 28, 'VC USB': 29, 'VC.USB': 29,
      'ROOMWIZARD\\QR': 30, 'ROOMWIZARD/QR': 30
    },
    todasFilasResDestino: [6, 7, 9, 10, 12, 13, 14, 16, 17, 18, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
    filaAjuste: 16,
    etiquetaAjuste: 'EQUIPO AUDIO|CONFIGURACION'
  }
];

function aplicarEstiloEncabezadoSemana(hoja, fila, col) {
  const celda = hoja.getRange(fila, col);
  celda
    .setFontFamily('Arial')
    .setFontSize(12)
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center');
}

function aplicarEstiloDatosSemana(hoja, filaInicio, numFilas, col) {
  hoja.getRange(filaInicio, col, numFilas, 1)
    .setFontFamily('Calibri')
    .setFontSize(11)
    .setFontColor('#000000')
    .setHorizontalAlignment('center');
}

function filasAConsecutivos(filas) {
  if (!filas || filas.length === 0) return [];
  const ordenadas = filas.slice().sort((a, b) => a - b);
  const tramos = [];
  let inicio = ordenadas[0];
  let fin = ordenadas[0];
  for (let i = 1; i < ordenadas.length; i++) {
    if (ordenadas[i] === fin + 1) {
      fin = ordenadas[i];
    } else {
      tramos.push([inicio, fin]);
      inicio = ordenadas[i];
      fin = ordenadas[i];
    }
  }
  tramos.push([inicio, fin]);
  return tramos;
}

function aplicarFormatoSemanaTablas(destinoSs, numSemana) {
  const semana = Number(numSemana);
  if (!semana || semana < 1 || semana > 53) return;

  const hojaRem = destinoSs.getSheetByName('Remotos');
  if (hojaRem) {
    const colRem = semana + 1;
    aplicarEstiloEncabezadoSemana(hojaRem, 5, colRem);
    aplicarEstiloDatosSemana(hojaRem, 6, 1, colRem);
    aplicarEstiloEncabezadoSemana(hojaRem, 12, colRem);
    aplicarEstiloDatosSemana(hojaRem, 13, 5, colRem);
  }

  BLOQUES_IMPORTACION_SEMANAL.forEach((cfg) => {
    const hoja = destinoSs.getSheetByName(cfg.hojaDestino);
    if (!hoja) return;
    const col = semana + 3;
    aplicarEstiloEncabezadoSemana(hoja, cfg.filaSem1, col);
    aplicarEstiloDatosSemana(hoja, cfg.filaSem1 + 1, 1, col);
    aplicarEstiloEncabezadoSemana(hoja, cfg.filaSem2, col);

    const filasUbic = Object.values(cfg.filasUbicDestino);
    filasAConsecutivos(filasUbic).forEach((tramo) => {
      aplicarEstiloDatosSemana(hoja, tramo[0], tramo[1] - tramo[0] + 1, col);
    });

    filasAConsecutivos(cfg.todasFilasResDestino).forEach((tramo) => {
      aplicarEstiloDatosSemana(hoja, tramo[0], tramo[1] - tramo[0] + 1, col);
    });
  });
}

function procesarBloqueSemanal(origenSs, destinoSs, numSemana, conDetalle, soloDetalle, cfg) {
  const hojaDestino = destinoSs.getSheetByName(cfg.hojaDestino);
  const colDestino = numSemana + 3;
  let totalUbic = 0;

  if (!soloDetalle) {
    const valoresUbic = leerUbicacionesHojaSemanal(
      origenSs, cfg.hojaUbicOrigen, cfg.errorUbicOrigen, numSemana, Object.keys(cfg.filasUbicDestino)
    );
    hojaDestino.getRange(cfg.filaSem1, colDestino).setValue(numSemana);
    hojaDestino.getRange(cfg.filaSem2, colDestino).setValue(numSemana);
    for (let ubicacion in cfg.filasUbicDestino) {
      hojaDestino.getRange(cfg.filasUbicDestino[ubicacion], colDestino).setValue(valoresUbic[ubicacion]);
    }
    totalUbic = Object.values(valoresUbic).reduce((acc, val) => acc + (Number(val) || 0), 0);
  } else {
    totalUbic = sumaUbicacionesDestino(hojaDestino, cfg.filasUbicDestino, colDestino);
  }

  if (!conDetalle) {
    return `✅ ${cfg.nombre}: ubicaciones (sin detalle de resolución).\n`;
  }

  const hojaOrigenRes = obtenerHojaOrigenPorFragmento(origenSs, cfg.hojaResOrigen);
  if (!hojaOrigenRes) throw new Error(cfg.errorResOrigen);
  const datosRes = hojaOrigenRes.getDataRange().getValues();
  const valoresRes = {};
  let lastTier2 = '';

  for (let f = 1; f < datosRes.length; f++) {
    const valA = normalizarTextoAV(datosRes[f][0]);
    if (valA === 'TOTAL') break;
    let valB = normalizarTextoAV(datosRes[f][1]);
    let valC = normalizarTextoAV(datosRes[f][2]);
    const valD = Number(datosRes[f][3]) || 0;
    if (valB !== '') {
      if (cfg.normalizarTier2) valB = cfg.normalizarTier2(valB);
      lastTier2 = valB;
    }
    if (cfg.normalizarTier3) valC = cfg.normalizarTier3(lastTier2, valC);
    const llave = lastTier2 + '|' + valC;
    const filaDest = cfg.filasResExactas[llave] || (cfg.filasResSuma ? cfg.filasResSuma[lastTier2] : undefined);
    if (filaDest) valoresRes[filaDest] = (valoresRes[filaDest] || 0) + valD;
  }

  cfg.todasFilasResDestino.forEach((filaRes) => {
    hojaDestino.getRange(filaRes, colDestino).setValue(valorOBlancoAV(valoresRes[filaRes] || 0));
  });

  const totalRes = Object.values(valoresRes).reduce((acc, val) => acc + (Number(val) || 0), 0);
  const dif = totalUbic - totalRes;
  if (dif !== 0) {
    const valActual = Number(valoresRes[cfg.filaAjuste]) || 0;
    hojaDestino.getRange(cfg.filaAjuste, colDestino).setValue(valorOBlancoAV(valActual + dif));
    return `✅ ${cfg.nombre}: ${soloDetalle ? 'Detalle completado' : 'Completado'} (Ajuste: ${dif > 0 ? '+' : ''}${dif} en ${cfg.etiquetaAjuste}).\n`;
  }
  return `✅ ${cfg.nombre}: ${soloDetalle ? 'Detalle completado' : 'Completado'}.\n`;
}

function importarSemana(origenSs, destinoSs, semana, conDetalle, opciones) {
  const soloDetalle = Boolean(opciones && opciones.soloDetalle);
  let resumenImportacion = '';
  const numSemana = Number(semana);

  if (!soloDetalle) {
    const hojaOrigenRemotos = obtenerHojaOrigenPorFragmento(origenSs, '1-Soporte Remoto');
    if (!hojaOrigenRemotos) throw new Error('No se encontró la pestaña de "1-Soporte Remoto".');
    const fila1Rem = hojaOrigenRemotos.getRange('A1:ZZ1').getValues()[0];
    let colTotalRem = -1;
    for (let i = 0; i < fila1Rem.length; i++) {
      if (String(fila1Rem[i]).toUpperCase().trim() === 'TOTAL') { colTotalRem = i + 1; break; }
    }
    if (colTotalRem === -1) throw new Error('No se encontró "Total" en la primera fila de Remotos.');
    const colDatosRem = obtenerColumnaSemanaOrigen(hojaOrigenRemotos, fila1Rem, colTotalRem, numSemana);
    const datosRemOrigen = hojaOrigenRemotos.getDataRange().getValues();
    const valorRemoto = (etiqueta) => {
      if (colDatosRem < 0) return 0;
      for (let f = 0; f < datosRemOrigen.length; f++) {
        if (normalizarTextoAV(datosRemOrigen[f][0]) === etiqueta) return Number(datosRemOrigen[f][colDatosRem - 1]) || 0;
      }
      return 0;
    };
    const hojaDestinoRem = destinoSs.getSheetByName('Remotos');
    const colDestinoRem = numSemana + 1;
    hojaDestinoRem.getRange(5, colDestinoRem).setValue(numSemana);
    hojaDestinoRem.getRange(12, colDestinoRem).setValue(numSemana);
    hojaDestinoRem.getRange(13, colDestinoRem).setValue(valorOBlancoAV(valorRemoto('ERRORES')));
    hojaDestinoRem.getRange(14, colDestinoRem).setValue(valorOBlancoAV(valorRemoto('CONEXION')));
    hojaDestinoRem.getRange(15, colDestinoRem).setValue(valorOBlancoAV(valorRemoto('OPERATIVA')));
    hojaDestinoRem.getRange(16, colDestinoRem).setValue(valorOBlancoAV(valorRemoto('BLUE BRANCH')));
    hojaDestinoRem.getRange(17, colDestinoRem).setValue(valorOBlancoAV(valorRemoto('VIDEO')));
    resumenImportacion += '✅ REMOTOS: Completado.\n';
  }

  BLOQUES_IMPORTACION_SEMANAL.forEach((cfg) => {
    resumenImportacion += procesarBloqueSemanal(origenSs, destinoSs, numSemana, conDetalle, soloDetalle, cfg);
  });

  aplicarFormatoSemanaTablas(destinoSs, numSemana);

  return resumenImportacion;
}

function semanaConDatos(destinoSs, semana) {
  return BLOQUES_SEMANALES.some((bloque) => {
    const hoja = destinoSs.getSheetByName(bloque.hoja);
    if (!hoja) return false;
    const valores = hoja.getRange(bloque.filas[0], semana + bloque.desplazamiento, bloque.filas[1] - bloque.filas[0] + 1, 1).getValues();
    return valores.some((fila) => Number(fila[0]) > 0);
  });
}

function semanasDelTemplate(origenSs) {
  const hoja = origenSs.getSheets().find((h) => h.getName().includes('1-Soporte Remoto'));
  if (!hoja) throw new Error('No se encontró la pestaña de "1-Soporte Remoto".');
  const cabecera = hoja.getRange(1, 1, 2, hoja.getLastColumn()).getValues();
  const semanas = [];
  for (let col = 0; col < cabecera[0].length; col++) {
    if (String(cabecera[0][col]).toUpperCase().trim() === 'TOTAL') break;
    const semana = Number(cabecera[0][col]) || Number(cabecera[1][col]);
    if (semana >= 1 && semana <= 53 && semanas.indexOf(semana) < 0) semanas.push(semana);
  }
  return semanas.sort((a, b) => a - b);
}

// Lee todos los templates semanales de Bruto, usa cada uno para el detalle de su
// ultima semana (pestanas 7-10) y completa semanas vacias o sin detalle en Tendencias.
function importarDatosSemanales() {
  const ui = SpreadsheetApp.getUi();
  try {
    const archivos = buscarTemplatesSemanales();
    if (archivos.length === 0) {
      const xlsxPendientes = listarExcelPendientes('SEMANAL');
      const extra = xlsxPendientes.length > 0
        ? `\n\nArchivos .xlsx pendientes de abrir como Google Sheets:\n- ${xlsxPendientes.join('\n- ')}`
        : '';
      ui.alert('Sin template', 'No hay un template semanal en formato Google Sheets en la carpeta de templates.' + extra, ui.ButtonSet.OK);
      return;
    }

    const infoArchivos = archivos.map((archivo) => {
      const ss = SpreadsheetApp.openById(archivo.getId());
      const sems = semanasDelTemplate(ss);
      const ultimaSem = sems.length > 0 ? sems[sems.length - 1] : 0;
      return { archivo, ss, semanas: sems, ultima: ultimaSem, fecha: archivo.getLastUpdated() };
    }).filter((info) => info.ultima > 0);

    if (infoArchivos.length === 0) throw new Error('Los templates de la carpeta no contienen semanas válidas.');

    infoArchivos.sort((a, b) => (a.ultima - b.ultima) || (b.fecha - a.fecha));

    const mapaDetalleSemana = {};
    infoArchivos.forEach((info) => {
      if (!mapaDetalleSemana[info.ultima]) {
        mapaDetalleSemana[info.ultima] = info;
      }
    });

    const principal = infoArchivos[infoArchivos.length - 1];
    const destinoSs = obtenerLibroTendencias();
    const semanas = principal.semanas;
    const ultima = principal.ultima;

    const semanasIncompletas = new Set(semanasSinDetalle(destinoSs).map((f) => f.semana));
    const pendientes = semanas.filter((semana) => {
      const vacia = !semanaConDatos(destinoSs, semana);
      const faltaDetalleYHayTemplate = semanasIncompletas.has(semana) && Boolean(mapaDetalleSemana[semana]);
      return vacia || faltaDetalleYHayTemplate;
    });

    if (pendientes.length === 0) {
      semanas.slice(-2).forEach((s) => aplicarFormatoSemanaTablas(destinoSs, s));
      const recuperadas = recuperarDetalleDesdeHistorico(destinoSs);
      const evExtrRes = sincronizarEventosExtrSilencioso(destinoSs);
      const avisos = revisarSemanas(destinoSs, ultima);
      let texto = `Tendencias ya tiene todas las semanas al día (hasta la ${ultima}).`;
      if (recuperadas.length > 0) texto += '\n\nRecuperado del histórico:\n' + recuperadas.join('\n');
      if (evExtrRes) {
        texto += `\n\nEventos Extr.: ${evExtrRes.totalEventos} eventos sincronizados (${evExtrRes.mesNombre}).`;
      }
      if (avisos.length > 0) texto += '\n\nRevisar:\n' + avisos.join('\n');
      if (recuperadas.length > 0 || evExtrRes) {
        SpreadsheetApp.flush();
        volcarDatosLookerStudio();
        texto += `\n\nTXT: ${escribirPlanoTxt(ultima).getName()}`;
      }
      ui.alert('AV Weekly', texto, ui.ButtonSet.OK);
      return;
    }

    const detallesDisponibles = pendientes.filter((s) => Boolean(mapaDetalleSemana[s]));
    const sinDetalle = pendientes.filter((s) => !mapaDetalleSemana[s]);
    const xlsxPendientes = listarExcelPendientes('SEMANAL');

    let aviso = `Semanas a procesar o completar en Tendencias: ${pendientes.join(', ')}.\n\n`;
    if (detallesDisponibles.length > 0) {
      aviso += `✅ Con detalle completo (ubicaciones + resolución): Semanas ${detallesDisponibles.join(', ')}.\n`;
    }
    if (sinDetalle.length > 0) {
      aviso += `⚠️ Solo ubicaciones y Remotos (falta su template específico en la carpeta): Semanas ${sinDetalle.join(', ')}.\n`;
    }
    if (xlsxPendientes.length > 0) {
      aviso += `\n📄 Archivos .xlsx sin convertir a Google Sheets (ignorados):\n- ${xlsxPendientes.join('\n- ')}\n`;
    }

    if (ui.alert('Procesar semana', aviso + '\n¿Continuar?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

    let resumen = '';
    pendientes.forEach((semana) => {
      const infoOrigen = mapaDetalleSemana[semana] || principal;
      const tieneDetalle = Boolean(mapaDetalleSemana[semana]);
      const soloDetalle = semanaConDatos(destinoSs, semana) && semanasIncompletas.has(semana) && tieneDetalle;
      resumen += `Semana ${semana} (${infoOrigen.archivo.getName()})\n` +
        importarSemana(infoOrigen.ss, destinoSs, semana, tieneDetalle, { soloDetalle }) + '\n';
    });
    SpreadsheetApp.flush();

    const evExtrRes = sincronizarEventosExtrSilencioso(destinoSs);
    if (evExtrRes) {
      resumen += `✅ EVENTOS EXTR.: ${evExtrRes.totalEventos} eventos sincronizados (${evExtrRes.mesNombre}).\n\n`;
    }

    const recuperadas = recuperarDetalleDesdeHistorico(destinoSs);
    if (recuperadas.length > 0) resumen += 'Recuperado del histórico:\n' + recuperadas.join('\n') + '\n\n';
    SpreadsheetApp.flush();
    const avisos = revisarSemanas(destinoSs, ultima);
    if (avisos.length > 0) resumen += 'Revisar:\n' + avisos.join('\n') + '\n\n';

    volcarDatosLookerStudio();
    const archivoTxt = escribirPlanoTxt(ultima);

    ui.alert(
      'AV Weekly',
      `${resumen}TXT: ${archivoTxt.getName()}\nSúbelo en AV Weekly > Audiovisuales > Texto plano (Drive).`,
      ui.ButtonSet.OK
    );
  } catch (e) {
    ui.alert('⚠️ Error en la importación', e.message, ui.ButtonSet.OK);
  }
}
