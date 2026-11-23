// ==========================================
// 03. PROCESAR MES Y RESUMEN MULTIANUAL 2026
// ==========================================

function tipoMensualDeTicket(grupo, modulo) {
  const g = normalizarTextoAV(grupo);
  const m = normalizarTextoAV(modulo);
  if (g === 'SOPORTE WEBEX') return 'REMOTOS';
  if (m === 'SOPORTE PROGRAMADO') return 'PROGRAMADOS';
  if (m === 'SOPORTE PRESENCIAL') return 'PRESENCIALES';
  if (m === 'MANTENIMIENTO CORRECTIVO') return 'CORRECTIVOS';
  if (m === 'MANTENIMIENTO') return null;
  return 'INCIDENCIAS';
}

function contarTemplateMensual(origenSs) {
  const valores = origenSs.getSheets()[0].getDataRange().getValues();
  const cabecera = valores[0].map((celda) => String(celda).trim().toUpperCase());
  const col = (nombre) => cabecera.indexOf(nombre);
  const colCerrada = col('CERRADA');
  const colGrupo = col('GRUPO');
  const colModulo = col('MODULO');
  const colId = col('INCIDENCIA');
  if (colCerrada < 0 || colGrupo < 0 || colModulo < 0) {
    throw new Error('El template mensual no tiene las columnas Cerrada, Grupo y Modulo.');
  }

  const zona = origenSs.getSpreadsheetTimeZone();
  const filas = valores.slice(1)
    .filter((fila) => fila[colCerrada] instanceof Date && (colId < 0 || fila[colId]))
    .map((fila) => ({ fila, dia: Utilities.formatDate(fila[colCerrada], zona, 'yyyy-MM-dd').split('-').map(Number) }));
  const porMes = {};
  filas.forEach((item) => {
    const clave = item.dia[0] + '-' + (item.dia[1] - 1);
    porMes[clave] = (porMes[clave] || 0) + 1;
  });
  const claves = Object.keys(porMes);
  if (claves.length === 0) throw new Error('El template mensual no tiene tickets con fecha de cierre.');
  const clave = claves.sort((a, b) => porMes[b] - porMes[a])[0];
  const anio = Number(clave.split('-')[0]);
  const mes = Number(clave.split('-')[1]);

  const conteo = { REMOTOS: 0, PROGRAMADOS: 0, PRESENCIALES: 0, INCIDENCIAS: 0, CORRECTIVOS: 0 };
  const porSemana = { REMOTOS: {}, PROGRAMADOS: {}, PRESENCIALES: {}, INCIDENCIAS: {}, CORRECTIVOS: {} };
  const dias = {};
  filas.forEach((item) => {
    const fila = item.fila;
    if (item.dia[0] !== anio || item.dia[1] - 1 !== mes) return;
    dias[item.dia[2]] = true;
    const tipo = tipoMensualDeTicket(fila[colGrupo], fila[colModulo]);
    if (tipo) {
      conteo[tipo]++;
      const semana = semanaIso(item.dia[0], item.dia[1], item.dia[2]);
      porSemana[tipo][semana] = (porSemana[tipo][semana] || 0) + 1;
    }
  });

  return {
    anio,
    mes,
    conteo,
    porSemana,
    fuera: filas.length - porMes[clave],
    primerDia: Math.min.apply(null, Object.keys(dias).map(Number)),
    ultimoDia: Math.max.apply(null, Object.keys(dias).map(Number))
  };
}

function semanaIso(anio, mes, dia) {
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  const diaSemana = fecha.getUTCDay() || 7;
  fecha.setUTCDate(fecha.getUTCDate() + 4 - diaSemana);
  const inicio = new Date(Date.UTC(fecha.getUTCFullYear(), 0, 1));
  return Math.ceil(((fecha - inicio) / 86400000 + 1) / 7);
}

function semanasCompletasDelMes(anio, mes) {
  const semanas = [];
  const diasMes = new Date(anio, mes + 1, 0).getDate();
  for (let dia = 1; dia <= diasMes; dia++) {
    const fecha = new Date(Date.UTC(anio, mes, dia));
    if ((fecha.getUTCDay() || 7) === 1 && dia + 6 <= diasMes) semanas.push(semanaIso(anio, mes + 1, dia));
  }
  return semanas;
}

function compararSemanasConTendencias(ss, datos) {
  const avisos = [];
  semanasCompletasDelMes(datos.anio, datos.mes).forEach((semana) => {
    Object.keys(CONFIG_MENSUAL).forEach((tipo) => {
      const bloque = BLOQUES_SEMANALES.filter((b) => b.hoja === CONFIG_MENSUAL[tipo].hoja)[0];
      const hoja = ss.getSheetByName(bloque.hoja);
      const valores = hoja.getRange(bloque.filas[0], semana + bloque.desplazamiento, bloque.filas[1] - bloque.filas[0] + 1, 1).getValues();
      const tendencias = valores.reduce((suma, fila) => suma + (Number(fila[0]) || 0), 0);
      const mensual = datos.porSemana[tipo][semana] || 0;
      if (tendencias === 0 && mensual > 0) avisos.push(`  S${semana} ${bloque.hoja}: vacía en Tendencias, el mensual tiene ${mensual}.`);
      else if (tendencias !== mensual) avisos.push(`  S${semana} ${bloque.hoja}: Tendencias ${tendencias}, mensual ${mensual}.`);
    });
  });
  return avisos;
}

function procesarMes() {
  const ui = SpreadsheetApp.getUi();
  try {
    const archivos = buscarTemplatesMensuales();
    if (archivos.length === 0) {
      ui.alert('Sin template', 'No hay un template mensual en formato Google Sheets en la carpeta de templates.', ui.ButtonSet.OK);
      return;
    }

    const anioInforme = anioInformeActual();
    const porMes = {};
    archivos.forEach((archivo) => {
      const datos = contarTemplateMensual(SpreadsheetApp.openById(archivo.getId()));
      datos.archivo = archivo;
      if (datos.anio !== anioInforme) {
        throw new Error(`"${archivo.getName()}" es de ${datos.anio} y Tendencias es de ${anioInforme}.`);
      }
      const previo = porMes[datos.mes];
      if (!previo || archivo.getLastUpdated() > previo.archivo.getLastUpdated()) porMes[datos.mes] = datos;
    });
    const meses = Object.keys(porMes).map(Number).sort((a, b) => a - b);

    const ss = obtenerLibroTendencias();
    const bloques = [];
    meses.forEach((mes) => {
      const datos = porMes[mes];
      const nombreMes = MESES_TENDENCIA[mes];
      const diasMes = new Date(datos.anio, mes + 1, 0).getDate();
      const lineas = [];
      const cambios = [];
      Object.keys(CONFIG_MENSUAL).forEach((tipo) => {
        const conf = CONFIG_MENSUAL[tipo];
        const hoja = ss.getSheetByName(conf.hoja);
        if (!hoja) throw new Error(`No se encuentra la pestaña ${conf.hoja}.`);
        const fila = conf.rangoFilas[0] + mes;
        const actual = hoja.getRange(`${conf.colActual}${fila}`).getValue();
        const nuevo = datos.conteo[tipo];
        lineas.push(`  ${conf.hoja} (${conf.colActual}${fila}): ${nuevo}`);
        if (actual !== '' && actual !== null && Number(actual) !== nuevo) {
          cambios.push(`  ${conf.hoja}: ${actual} -> ${nuevo}`);
        }
      });
      let bloque = `${nombreMes} ${datos.anio} - "${datos.archivo.getName()}"\n` +
        `Cierres del ${datos.primerDia} al ${datos.ultimoDia} de ${diasMes} días.\n` + lineas.join('\n');
      if (datos.primerDia > 3 || datos.ultimoDia < diasMes - 3) bloque += '\nEl fichero no parece cubrir el mes entero.';
      if (datos.fuera > 0) bloque += `\n${datos.fuera} tickets de otros meses no se cuentan.`;
      if (cambios.length > 0) bloque += '\nYa había otros valores:\n' + cambios.join('\n');
      const diferencias = compararSemanasConTendencias(ss, datos);
      if (diferencias.length > 0) bloque += '\nSemanas que no cuadran con Tendencias:\n' + diferencias.join('\n');
      bloques.push(bloque);
    });

    const respuesta = ui.alert('Procesar mes', bloques.join('\n\n') + '\n\n¿Escribir estos valores?', ui.ButtonSet.YES_NO);
    if (respuesta !== ui.Button.YES) return;

    meses.forEach((mes) => {
      Object.keys(CONFIG_MENSUAL).forEach((tipo) => {
        const conf = CONFIG_MENSUAL[tipo];
        const hoja = ss.getSheetByName(conf.hoja);
        const fila = conf.rangoFilas[0] + mes;
        hoja.getRange(`A${fila}`).setValue(MESES_TENDENCIA[mes]);
        hoja.getRange(`${conf.colActual}${fila}`).setValue(porMes[mes].conteo[tipo]);
        if (conf.colHistorico && conf.rangoHistorico) {
          const filaHist = conf.rangoHistorico[0] + mes;
          hoja.getRange(`${conf.colHistorico}${filaHist}`).setValue(porMes[mes].conteo[tipo]);
        }
      });
    });

    sincronizarHistoricoMensual2026Silencioso(ss);

    try {
      const ultimoMes = (meses && meses.length > 0) ? (meses[meses.length - 1] + 1) : null;
      sincronizarEventosExtrSilencioso(ss, ultimoMes);
    } catch (eEv) {
      Logger.log('Aviso al sincronizar eventos en procesarMes: ' + eEv.message);
    }

    SpreadsheetApp.flush();

    const archivoTxt = escribirPlanoTxt();
    const nombres = meses.map((mes) => MESES_TENDENCIA[mes]).join(' y ');
    ui.alert('Procesar mes', `${nombres} escrito en Tendencias y en el resumen multianual 2026.\nGuardado "${archivoTxt.getName()}" en la carpeta.`, ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('Procesar mes', e.message, ui.ButtonSet.OK);
  }
}

function sincronizarHistoricoMensual2026Silencioso(ss) {
  Object.keys(CONFIG_MENSUAL).forEach((tipo) => {
    const conf = CONFIG_MENSUAL[tipo];
    const hoja = ss.getSheetByName(conf.hoja);
    if (!hoja || !conf.colHistorico || !conf.rangoHistorico) return;
    for (let mes = 0; mes < 12; mes++) {
      const filaMensual = conf.rangoFilas[0] + mes;
      const filaHist = conf.rangoHistorico[0] + mes;
      const valMensual = hoja.getRange(`${conf.colActual}${filaMensual}`).getValue();
      const celdaHist = hoja.getRange(`${conf.colHistorico}${filaHist}`);
      const valHist = celdaHist.getValue();
      if (valMensual !== '' && valMensual !== null && !isNaN(Number(valMensual))) {
        if (valHist === '' || valHist === null) {
          celdaHist.setValue(Number(valMensual));
        }
      }
    }
  });
}

function sincronizarHistoricoMensual2026() {
  const ss = obtenerLibroTendencias();
  let sincronizados = 0;
  Object.keys(CONFIG_MENSUAL).forEach((tipo) => {
    const conf = CONFIG_MENSUAL[tipo];
    const hoja = ss.getSheetByName(conf.hoja);
    if (!hoja || !conf.colHistorico || !conf.rangoHistorico) return;
    for (let mes = 0; mes < 12; mes++) {
      const filaMensual = conf.rangoFilas[0] + mes;
      const filaHist = conf.rangoHistorico[0] + mes;
      const valMensual = hoja.getRange(`${conf.colActual}${filaMensual}`).getValue();
      const celdaHist = hoja.getRange(`${conf.colHistorico}${filaHist}`);
      const valHist = celdaHist.getValue();
      if (valMensual !== '' && valMensual !== null && !isNaN(Number(valMensual))) {
        if (valHist === '' || valHist === null || Number(valHist) !== Number(valMensual)) {
          celdaHist.setValue(Number(valMensual));
          sincronizados++;
        }
      }
    }
  });
  SpreadsheetApp.flush();
  SpreadsheetApp.getUi().alert(
    'AV Weekly',
    `Sincronización completada.\nSe han sincronizado ${sincronizados} celdas en el resumen multianual 2026.`,
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}
