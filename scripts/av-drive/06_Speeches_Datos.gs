// ==========================================
// 06. SPEECHES: OBTENCION DE DATOS Y HELPERS DE FORMATO
// ==========================================

function obtenerDatosMensuales(tipo) {
  const config = CONFIG_MENSUAL[tipo];
  if (!config) return { error: `No existe configuración para ${tipo}` };
  const hoja = obtenerLibroTendencias().getSheetByName(config.hoja);
  if (!hoja) return { error: `No se encuentra la pestaña ${config.hoja}` };
  const filaInicio = config.rangoFilas[0];
  const filaFin = config.rangoFilas[1];
  const rangoActual = hoja.getRange(`${config.colActual}${filaInicio}:${config.colActual}${filaFin}`).getValues();
  const rangoPasado = hoja.getRange(`${config.colPasado}${filaInicio}:${config.colPasado}${filaFin}`).getValues();
  let mesIndex = -1;
  for (let i = rangoActual.length - 1; i >= 0; i--) {
    const valor = rangoActual[i][0];
    if (typeof valor === 'number' && valor > 0) { mesIndex = i; break; }
  }
  if (mesIndex === -1) return { hayDatos: false };
  return {
    hayDatos: true,
    mes: MESES_TENDENCIA[mesIndex],
    actual: Number(rangoActual[mesIndex][0]),
    pasado: Number(rangoPasado[mesIndex][0])
  };
}

function obtenerDatosMensualesObligatorios(tipo) {
  const datos = obtenerDatosMensuales(tipo);
  if (datos.error) throw new Error(datos.error);
  if (!datos.hayDatos) throw new Error(`No hay datos mensuales en ${tipo}.`);
  return datos;
}

function completarDatosMensuales(datos) {
  const difMes = datos.actual - datos.pasado;
  return Object.assign(datos, {
    difMes,
    porcMes: calcularPorcentaje(difMes, datos.pasado)
  });
}

function construirListaUbicaciones(hoja, filasRango, colIdx) {
  const partes = [];
  for (let f = filasRango[0]; f <= filasRango[1]; f++) {
    const nombre = hoja.getRange(f, 3).getValue();
    const valor = hoja.getRange(f, colIdx + 1).getValue();
    if (valor !== '' && valor !== null && !isNaN(valor) && valor > 0) {
      partes.push(`${valor} en ${nombre}`);
    }
  }
  return partes;
}

function construirListaUbicacionesConY(hoja, filasRango, colIdx) {
  return unirConY(construirListaUbicaciones(hoja, filasRango, colIdx));
}

function obtenerUltimoIndiceConDato(fila, indiceInicio) {
  for (let i = fila.length - 1; i >= indiceInicio; i--) {
    const valor = fila[i];
    if (valor !== '' && valor !== null && !isNaN(valor) && Number(valor) > 0) return i;
  }
  throw new Error('No se ha encontrado la última semana con datos.');
}

function obtenerTotalSemanalPasado(datosEdificios, colIdx) {
  const semanaNombre = datosEdificios[0][colIdx];
  const filaSemanasPasadas = datosEdificios[3];
  const filaValoresPasados = datosEdificios[4];
  for (let i = 1; i < filaSemanasPasadas.length; i++) {
    if (filaSemanasPasadas[i] == semanaNombre) return Number(filaValoresPasados[i] || 0);
  }
  return 0;
}

function obtenerTiposPorAccion(hoja, rangoA1, colIdx) {
  const datos = hoja.getRange(rangoA1).getValues();
  const tipos = [];
  datos.forEach((row) => {
    const valor = Number(row[colIdx] || 0);
    if (valor > 0) {
      tipos.push({ categoria: row[1], nombre: row[2], valor });
    }
  });
  tipos.sort((a, b) => b.valor - a.valor);
  return tipos;
}

function obtenerCategoriasTotales(hoja, filaInicio, numFilas, colIdx) {
  const datos = hoja.getRange(filaInicio, 1, numFilas, colIdx + 1).getValues();
  const tipos = [];
  datos.forEach((row) => {
    const categoria = row[1];
    const accion = row[2];
    const valor = Number(row[colIdx] || 0);
    if (categoria && valor > 0 && normalizarClaveSpeech(accion) === 'TOTAL' && normalizarClaveSpeech(categoria) !== 'TOTAL') {
      tipos.push({ nombre: categoria, valor });
    }
  });
  tipos.sort((a, b) => b.valor - a.valor);
  return tipos;
}

// --- DATOS PARA SPEECH SERGIO ---
function obtenerDatosSpeechRemotoSemanal() {
  const hoja = obtenerLibroTendencias().getSheetByName('Remotos');
  if (!hoja) throw new Error('No se encuentra la pestaña Remotos');
  const datosTotales = hoja.getRange('A5:BB9').getValues();
  const datosDesglose = hoja.getRange('A13:BB17').getValues();
  const colIdx = obtenerUltimoIndiceConDato(datosTotales[1], 1);
  const totalSemanal = Number(datosTotales[1][colIdx] || 0);
  const totalSemanalPasado = Number(datosTotales[4][colIdx] || 0);
  const getVal = (cat) => {
    const row = datosDesglose.find((r) => normalizarClaveSpeech(r[0]) === cat);
    return row ? Number(row[colIdx] || 0) : 0;
  };
  return {
    totalSemanal,
    totalSemanalPasado,
    difSemanal: totalSemanal - totalSemanalPasado,
    errores: getVal('ERRORES'),
    conexiones: getVal('CONEXION'),
    operativa: getVal('OPERATIVA')
  };
}

function obtenerDatosSpeechProgramadoSemanal() {
  const hoja = obtenerLibroTendencias().getSheetByName('Programados');
  if (!hoja) throw new Error('No se encuentra la pestaña Programados');
  const datosEdificios = hoja.getRange('A19:BD32').getValues();
  const colIdx = obtenerUltimoIndiceConDato(datosEdificios[1], 3);
  const totalSemanal = Number(datosEdificios[1][colIdx] || 0);
  const totalSemanalPasado = obtenerTotalSemanalPasado(datosEdificios, colIdx);
  const tipos = obtenerTiposPorAccion(hoja, 'A5:BD12', colIdx);
  return {
    totalSemanal,
    totalSemanalPasado,
    difSemanal: totalSemanal - totalSemanalPasado,
    ubicaciones: construirListaUbicacionesConY(hoja, [27, 32], colIdx),
    resoluciones: construirTextoResolucionesAccion(tipos)
  };
}

function obtenerDatosSpeechPresencialSemanal() {
  const hoja = obtenerLibroTendencias().getSheetByName('Presenciales');
  if (!hoja) throw new Error('No se encuentra la pestaña Presenciales');
  const checkRow = hoja.getRange('A22:BD22').getValues()[0];
  const colIdx = obtenerUltimoIndiceConDato(checkRow, 3);
  const datosEdificios = hoja.getRange('A21:BD34').getValues();
  const totalSemanal = Number(datosEdificios[1][colIdx] || 0);
  const totalSemanalPasado = obtenerTotalSemanalPasado(datosEdificios, colIdx);
  const tipos = obtenerTiposPorAccion(hoja, 'A5:BD14', colIdx);
  return {
    totalSemanal,
    totalSemanalPasado,
    difSemanal: totalSemanal - totalSemanalPasado,
    ubicaciones: construirListaUbicacionesConY(hoja, [29, 34], colIdx),
    resoluciones: construirTextoResolucionesAccion(tipos)
  };
}

function obtenerDatosSpeechIncidenciasSemanal() {
  const hoja = obtenerLibroTendencias().getSheetByName('Incidencias');
  if (!hoja) throw new Error('No se encuentra la pestaña Incidencias');
  const checkRow = hoja.getRange('A42:BD42').getValues()[0];
  const colIdx = obtenerUltimoIndiceConDato(checkRow, 3);
  const datosPrinc = hoja.getRange('A41:BD54').getValues();
  const totalSemanal = Number(datosPrinc[1][colIdx] || 0);
  const totalSemanalPasado = Number(datosPrinc[4][colIdx] || 0);
  const tipos = obtenerCategoriasTotales(hoja, 5, 35, colIdx);
  return {
    totalSemanal,
    totalSemanalPasado,
    difSemanal: totalSemanal - totalSemanalPasado,
    porcSemanal: calcularPorcentaje(totalSemanal - totalSemanalPasado, totalSemanalPasado),
    ubicaciones: construirListaUbicacionesConY(hoja, [49, 54], colIdx),
    resoluciones: construirTextoResolucionesCategoria(tipos)
  };
}

function obtenerDatosSpeechCorrectivosSemanal() {
  const hoja = obtenerLibroTendencias().getSheetByName('Correctivos');
  if (!hoja) throw new Error('No se encuentra la pestaña Correctivos');
  const checkRow = hoja.getRange('A38:BD38').getValues()[0];
  const colIdx = obtenerUltimoIndiceConDato(checkRow, 3);
  const datosPrinc = hoja.getRange('A37:BD50').getValues();
  const totalSemanal = Number(datosPrinc[1][colIdx] || 0);
  const totalSemanalPasado = Number(datosPrinc[4][colIdx] || 0);
  const tipos = obtenerCategoriasTotales(hoja, 5, 27, colIdx);
  return {
    totalSemanal,
    totalSemanalPasado,
    difSemanal: totalSemanal - totalSemanalPasado,
    ubicaciones: construirListaUbicacionesConY(hoja, [45, 50], colIdx),
    resoluciones: construirTextoResolucionesCategoria(tipos)
  };
}

function obtenerDatosSpeechRemotoMensual() {
  const sem = obtenerDatosSpeechRemotoSemanal();
  const mes = obtenerDatosMensualesObligatorios('REMOTOS');
  return completarDatosMensuales(Object.assign(sem, {
    mes: mes.mes.toLowerCase(),
    actual: mes.actual,
    pasado: mes.pasado
  }));
}

function obtenerDatosSpeechProgramadoMensual() {
  const sem = obtenerDatosSpeechProgramadoSemanal();
  const mes = obtenerDatosMensualesObligatorios('PROGRAMADOS');
  return completarDatosMensuales(Object.assign(sem, {
    mes: mes.mes.toLowerCase(),
    actual: mes.actual,
    pasado: mes.pasado
  }));
}

function obtenerDatosSpeechPresencialMensual() {
  const sem = obtenerDatosSpeechPresencialSemanal();
  const mes = obtenerDatosMensualesObligatorios('PRESENCIALES');
  return completarDatosMensuales(Object.assign(sem, {
    mes: mes.mes.toLowerCase(),
    actual: mes.actual,
    pasado: mes.pasado
  }));
}

function obtenerDatosSpeechIncidenciasMensual() {
  const sem = obtenerDatosSpeechIncidenciasSemanal();
  const mes = obtenerDatosMensualesObligatorios('INCIDENCIAS');
  return completarDatosMensuales(Object.assign(sem, {
    mes: mes.mes.toLowerCase(),
    actual: mes.actual,
    pasado: mes.pasado
  }));
}

function obtenerDatosSpeechCorrectivosMensual() {
  const sem = obtenerDatosSpeechCorrectivosSemanal();
  const mes = obtenerDatosMensualesObligatorios('CORRECTIVOS');
  return completarDatosMensuales(Object.assign(sem, {
    mes: mes.mes.toLowerCase(),
    actual: mes.actual,
    pasado: mes.pasado
  }));
}

// --- FORMATO TEXTO Y HTML ---
function construirTextoResolucionesAccion(tipos) {
  return unirConY(tipos.slice(0, 2).map((t) => `${t.valor} ${textoAccionResolucion(t)}`));
}

function construirTextoResolucionesCategoria(tipos) {
  return unirConY(tipos.slice(0, 2).map((t) => `${t.valor} ${textoCategoriaResolucion(t.nombre)}`));
}

function textoAccionResolucion(tipo) {
  const accion = String(tipo.nombre || '').toLowerCase();
  const categoria = String(tipo.categoria || '').toLowerCase();
  const claveAccion = normalizarClaveSpeech(tipo.nombre);
  const claveCategoria = normalizarClaveSpeech(tipo.categoria);
  if (claveAccion === 'PREPARACION SALA') return 'preparación sala';
  if (claveAccion === 'DES/INSTALACION') return 'des/instalación';
  if (claveAccion === 'TRADUCCION') return 'traducción';
  if (claveAccion === 'PRESTAMO') return 'préstamo';
  if (claveAccion === 'CONFIGURACION') return 'configuración';
  if (claveAccion === 'FORMACION') return 'formación';
  if (claveAccion === 'GESTION') return 'gestión';
  if (claveAccion === 'SUSTITUCION') return 'sustitución';
  if (claveAccion === 'CONEXION' && claveCategoria) return `conexión de ${categoria}`;
  return accion;
}

function textoCategoriaResolucion(nombre) {
  const clave = normalizarClaveSpeech(nombre);
  if (clave === 'ALMACEN') return 'almacén';
  if (clave === 'DOMOTICA') return 'domótica';
  if (clave === 'TRADUCCION') return 'traducción';
  if (clave === 'PERIFERICO PC') return 'periférico pc';
  if (clave === 'PC\\PORTATIL' || clave === 'PC/PORTATIL') return 'pc\\portátil';
  return String(nombre || '').toLowerCase();
}

function textoComparacionIncidencias(datos) {
  if (datos.difSemanal < 0) {
    return `Son ${textoDiferencia(datos.difSemanal)} que el año pasado (${datos.totalSemanalPasado}), ` +
      `lo que ha supuesto una reducción de incidencias en un ${datos.porcSemanal}%.`;
  }
  return `Son ${textoDiferencia(datos.difSemanal)} que el año pasado (${datos.totalSemanalPasado}), ` +
    `lo que supone un aumento del ${datos.porcSemanal}%.`;
}

function textoDiferencia(dif) {
  return `${Math.abs(dif)} ${dif < 0 ? 'menos' : 'más'}`;
}

function calcularPorcentaje(dif, base) {
  return base > 0 ? Math.abs((dif / base) * 100).toFixed(0) : '0';
}

function unirConY(partes) {
  const limpias = partes.filter((p) => p !== '' && p !== null && p !== undefined);
  if (limpias.length <= 1) return limpias.join('');
  if (limpias.length === 2) return `${limpias[0]} y ${limpias[1]}`;
  return `${limpias.slice(0, -1).join(', ')} y ${limpias[limpias.length - 1]}`;
}

function normalizarClaveSpeech(texto) {
  return normalizarTextoAV(texto);
}

function e(texto) {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pHtml(contenido) { return `<p>${contenido}</p>`; }
function pVacio() { return '<p class="vacio"></p>'; }
function tituloHtml(texto) { return `<p class="titulo"><strong>${e(texto)}</strong></p>`; }
function uHtml(texto) { return `<u>${e(texto)}</u>`; }
function separadorHtml() { return '<p class="separador">----------------------------------------------------</p>'; }
