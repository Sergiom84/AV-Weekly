// ==========================================
// 04. EVENTOS EXTRAORDINARIOS E INSTALACIONES
// ==========================================

function buscarTemplateEventos() {
  return buscarTemplate('EVENTOS');
}

function normalizarTerritorialEvento(dtRaw) {
  const dtUpper = normalizarTextoAV(dtRaw);
  if (dtUpper.includes('SUR')) return 'Sur';
  if (dtUpper.includes('NOROESTE') || dtUpper.includes('GALICIA')) return 'Galicia';
  if (dtUpper.includes('NORTE')) return 'Norte';
  if (dtUpper.includes('CATALU') || dtUpper.includes('CATALON')) return 'Cataluña';
  if (dtUpper.includes('CANARIA') || dtUpper === 'GC') return 'GC';
  if (dtUpper.includes('ESTE')) return 'Este';
  if (dtUpper.includes('CENTRO') || dtUpper.includes('HOLDING') || dtUpper.includes('SEDE')) return 'Centro';
  return 'Centro';
}

function parsearFechaEvento(fechaRaw, mesActualHint) {
  if (!fechaRaw) return null;
  if (fechaRaw instanceof Date) {
    return { mes: fechaRaw.getMonth() + 1, anio: fechaRaw.getFullYear() };
  }
  const s = String(fechaRaw).trim();
  const rangeMatch = s.match(/^\d+-\d+\/(\d+)\/(\d+)$/);
  if (rangeMatch) {
    return { mes: parseInt(rangeMatch[1], 10), anio: parseInt(rangeMatch[2], 10) };
  }
  const parts = s.split('/');
  if (parts.length === 3) {
    const p0 = parseInt(parts[0], 10);
    const p1 = parseInt(parts[1], 10);
    const p2 = parseInt(parts[2], 10);
    if (p0 > 12) return { mes: p1, anio: p2 };
    if (p1 > 12) return { mes: p0, anio: p2 };
    if (mesActualHint) {
      if (p1 < mesActualHint && p0 >= mesActualHint) return { mes: p0, anio: p2 };
      if (p0 < mesActualHint && p1 >= mesActualHint) return { mes: p1, anio: p2 };
      if (p1 === mesActualHint) return { mes: p1, anio: p2 };
      if (p0 === mesActualHint) return { mes: p0, anio: p2 };
    }
    return { mes: p1, anio: p2 };
  }
  return null;
}

function extraerTituloEvento(desc) {
  if (!desc) return '';
  const limpia = String(desc).replace(/^[\s"“”]+/, '').split('\n')[0].replace(/["“”].*$/, '').trim();
  return limpia.length > 5 ? limpia : String(desc).split('\n')[0].trim().slice(0, 45);
}

function generarDestacadosMes(items, instalaciones) {
  if (!items || items.length === 0) return 'Sin eventos destacados registrados este mes.';

  const porTitulo = {};
  items.forEach((it) => {
    const titLimpio = String(it.tit || '').replace(/^[\s"“”]+/, '').replace(/["“”].*$/, '').trim();
    if (!titLimpio) return;
    const key = titLimpio.toLowerCase().replace(/^(evento|streaming|plenaria|plenarias)\s+/, '');
    if (!porTitulo[key]) {
      porTitulo[key] = { tituloOriginal: titLimpio, dts: {}, items: [] };
    }
    porTitulo[key].dts[it.dt] = true;
    porTitulo[key].items.push(it);
  });

  const destacados = [];

  Object.values(porTitulo).forEach((group) => {
    const numDts = Object.keys(group.dts).length;
    if (numDts >= 3) {
      destacados.push(`Despliegue global ${group.tituloOriginal} en ${numDts} territoriales`);
    }
  });

  const prioritarios = [
    /biodiversidad/i, /fronteras/i, /town hall/i, /alfatech/i, /cib/i, /premios/i,
    /junta/i, /accionistas/i, /plenaria/i, /ia /i, /inteligencia artificial/i
  ];

  Object.values(porTitulo).forEach((group) => {
    const numDts = Object.keys(group.dts).length;
    if (numDts >= 3) return;
    const tit = group.tituloOriginal;
    const desc = group.items[0]?.desc || '';
    const esPrioritario = prioritarios.some((p) => p.test(tit) || p.test(desc));
    if (esPrioritario && destacados.length < 3) {
      let detalle = tit;
      const edif = group.items[0]?.edif;
      const esp = group.items[0]?.esp || '';
      if (esp.includes('Sala 13') || esp.includes('Fronteras') || edif === 'Recoletos') {
        detalle = tit.replace(/Premios Fronteras.*$/, '').trim() + ' (Recoletos)';
      } else if (edif && !detalle.toLowerCase().includes(edif.toLowerCase())) {
        detalle += ` (${edif})`;
      } else if (esp && !detalle.toLowerCase().includes(esp.toLowerCase())) {
        detalle += ` (${esp.split('.')[0]})`;
      }
      if (!destacados.some((d) => d.toLowerCase().includes(tit.toLowerCase().slice(0, 15)))) {
        destacados.push(detalle);
      }
    }
  });

  if (destacados.length < 2) {
    Object.values(porTitulo).forEach((group) => {
      const tit = group.tituloOriginal;
      if (tit && tit.length > 5 && !destacados.some((d) => d.toLowerCase().includes(tit.toLowerCase().slice(0, 15)))) {
        let detalle = tit;
        const edif = group.items[0]?.edif;
        if (edif && !detalle.toLowerCase().includes(edif.toLowerCase())) {
          detalle += ` (${edif})`;
        }
        destacados.push(detalle);
      }
    });
  }

  let texto = 'Destacan: ' + destacados.slice(0, 3).join('; ') + '.';
  if (instalaciones && instalaciones.length > 0) {
    texto += ' Instalaciones: ' + instalaciones.join('; ') + '.';
  }
  return texto;
}

function sincronizarEventosExtr(mostrarAviso = true, mesObjetivo) {
  const ui = SpreadsheetApp.getUi();
  try {
    const archivo = buscarTemplateEventos();
    if (!archivo) {
      if (mostrarAviso) {
        ui.alert('Sin hoja de eventos', 'No se ha encontrado el archivo de Eventos AV en la carpeta de entrada (Google Sheets).', ui.ButtonSet.OK);
      }
      return null;
    }

    const ssActiva = obtenerLibroTendencias();
    const resultado = ejecutarSincronizacionEventosExtr(ssActiva, archivo, mesObjetivo);

    if (mostrarAviso) {
      ui.alert(
        'Sincronizar eventos e instalaciones',
        `Sincronización completada desde "${archivo.getName()}":\n` +
        `• Meses actualizados: ${resultado.mesesActualizados.join(', ')}\n` +
        `• Total eventos registrados: ${resultado.totalEventos}\n\n` +
        `Resumen del mes en curso (${resultado.mesNombre}):\n${resultado.resumenMes}`,
        ui.ButtonSet.OK
      );
    }
    return resultado;
  } catch (e) {
    if (mostrarAviso) {
      ui.alert('Error al sincronizar eventos', e.message, ui.ButtonSet.OK);
    }
    throw e;
  }
}

function sincronizarEventosExtrSilencioso(ss, mesObjetivo) {
  try {
    const archivo = buscarTemplateEventos();
    if (!archivo) return null;
    return ejecutarSincronizacionEventosExtr(ss, archivo, mesObjetivo);
  } catch (e) {
    Logger.log('Error silencioso al sincronizar eventos: ' + e.message);
    return null;
  }
}

function filaDiciembreEventosExtr(hojaExtr) {
  const maxFila = Math.min(hojaExtr.getLastRow(), 20);
  if (maxFila < 3) return null;
  const etiquetas = hojaExtr.getRange(1, 1, maxFila, 1).getValues();
  for (let i = 0; i < etiquetas.length; i++) {
    if (normalizarTextoAV(etiquetas[i][0]) === 'DICIEMBRE') {
      return i + 1;
    }
  }
  return null;
}

function ejecutarSincronizacionEventosExtr(ssDestino, archivoEventos, mesObjetivo) {
  const ssEventos = SpreadsheetApp.openById(archivoEventos.getId());
  const hoja2026 = ssEventos.getSheetByName('2026') || ssEventos.getSheets()[0];
  const hojaInst = ssEventos.getSheetByName('Instalaciones');

  const valores2026 = hoja2026.getDataRange().getValues();
  if (valores2026.length < 2) throw new Error('La pestaña 2026 no contiene datos.');

  const filaCabecera = valores2026[1].length > 1 && valores2026[1][0] ? valores2026[1] : valores2026[0];
  const cabeceras = filaCabecera.map(normalizarTextoAV);
  const colFecha = cabeceras.indexOf('FECHA') >= 0 ? cabeceras.indexOf('FECHA') : 0;
  const colDT = cabeceras.indexOf('DT') >= 0 ? cabeceras.indexOf('DT') : 1;
  const colEdificio = cabeceras.indexOf('EDIFICIO') >= 0 ? cabeceras.indexOf('EDIFICIO') : 2;
  const colEspacio = cabeceras.indexOf('ESPACIO') >= 0 ? cabeceras.indexOf('ESPACIO') : 3;
  const colDesc = cabeceras.indexOf('DESCRIPCION') >= 0 ? cabeceras.indexOf('DESCRIPCION') : 9;

  const datosFilas = valores2026.slice(valores2026[1][0] === 'Fecha' ? 2 : 1).filter((r) => r[colFecha]);

  const eventosPorMes = {};
  let currentMonth = 1;
  let totalEventos = 0;

  datosFilas.forEach((r) => {
    const rawFecha = String(r[colFecha] || '').trim();
    const mesSeparador = MESES_TENDENCIA.findIndex(
      (nombre) => normalizarTextoAV(nombre) === normalizarTextoAV(rawFecha)
    );
    if (mesSeparador >= 0) {
      currentMonth = mesSeparador + 1;
    }

    const dtRaw = String(r[colDT] || '').trim();
    const edif = String(r[colEdificio] || '').trim();
    const esp = String(r[colEspacio] || '').trim();
    const desc = String(r[colDesc] || '').trim();
    if (!dtRaw && !edif && !esp && !desc) return;

    const parsed = parsearFechaEvento(r[colFecha], currentMonth);
    if (parsed && parsed.mes >= currentMonth) {
      currentMonth = parsed.mes;
    }
    const m = currentMonth;
    if (!eventosPorMes[m]) eventosPorMes[m] = { total: 0, dts: {}, titulos: [], items: [] };
    eventosPorMes[m].total++;
    totalEventos++;
    const dt = normalizarTerritorialEvento(dtRaw);
    eventosPorMes[m].dts[dt] = (eventosPorMes[m].dts[dt] || 0) + 1;
    const tit = extraerTituloEvento(r[colDesc]);
    eventosPorMes[m].items.push({ dt, edif, esp, desc, tit });
    if (tit && !eventosPorMes[m].titulos.includes(tit)) {
      eventosPorMes[m].titulos.push(tit);
    }
  });

  const instPorMes = {};
  if (hojaInst) {
    const valoresInst = hojaInst.getDataRange().getValues();
    const filasInst = valoresInst.slice(2).filter((r) => r.length > 1 && r[0]);
    filasInst.forEach((r) => {
      const fechaStr = String(r[0] || '').trim();
      const esp = String(r[3] || '').trim();
      const desc = String(r[9] || '').split('\n')[0].replace(/^[\s"“”]+/, '').replace(/["“”].*$/, '').trim();
      const resumen = desc || esp;
      for (let m = 1; m <= 12; m++) {
        if (fechaStr.toLowerCase().includes(MESES_TENDENCIA[m - 1].toLowerCase())) {
          if (!instPorMes[m]) instPorMes[m] = [];
          instPorMes[m].push(resumen);
        }
      }
    });
  }

  const hojaExtr = ssDestino.getSheetByName(CONFIG_EVENTOS_EXTR.hoja);
  if (!hojaExtr) throw new Error(`No se encontró la pestaña "${CONFIG_EVENTOS_EXTR.hoja}" en el archivo de destino.`);

  const mesesActualizados = [];
  const filasPorMes = Object.assign({}, CONFIG_EVENTOS_EXTR.mesesFilas);
  const filaDic = filaDiciembreEventosExtr(hojaExtr);
  if (filaDic) filasPorMes[12] = filaDic;

  Object.keys(filasPorMes).map(Number).sort((a, b) => a - b).forEach((m) => {
    const fila = filasPorMes[m];
    if (!fila) return;
    const ev = eventosPorMes[m] || { dts: {} };
    const valoresFila = CONFIG_EVENTOS_EXTR.columnasDT.map((dt) => {
      const count = ev.dts[dt];
      return count && count > 0 ? count : '';
    });
    hojaExtr.getRange(fila, 2, 1, CONFIG_EVENTOS_EXTR.columnasDT.length).setValues([valoresFila]);
    mesesActualizados.push(MESES_TENDENCIA[m - 1]);
  });

  const mesEnCurso = mesObjetivo || obtenerMesEnCursoInforme();
  const evMes = eventosPorMes[mesEnCurso] || { items: [] };
  const instMes = instPorMes[mesEnCurso] || [];
  const resumenMes = generarDestacadosMes(evMes.items, instMes);

  hojaExtr.getRange('A15').setValue('Resumen de actuaciones destacadas (Eventos e Instalaciones)').setFontWeight('bold');
  hojaExtr.getRange('A16:I25').clearContent();
  hojaExtr.getRange('A16').setValue(resumenMes);

  SpreadsheetApp.flush();

  return {
    mesesActualizados,
    totalEventos,
    mesEnCurso,
    mesNombre: MESES_TENDENCIA[mesEnCurso - 1],
    resumenMes
  };
}
