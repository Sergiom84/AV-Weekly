// ==========================================
// ⚙️ CONFIGURACIÓN DE RANGOS MENSUALES
// ==========================================
const CONFIG_MENSUAL = {
  REMOTOS: {
    hoja: 'Remotos',
    rangoFilas: [21, 32],
    colActual: 'B',
    colPasado: 'X'
  },
  PROGRAMADOS: {
    hoja: 'Programados',
    rangoFilas: [36, 47],
    colActual: 'B',
    colPasado: 'Q'
  },
  PRESENCIALES: {
    hoja: 'Presenciales',
    rangoFilas: [37, 48],
    colActual: 'B',
    colPasado: 'P'
  },
  INCIDENCIAS: {
    hoja: 'Incidencias',
    rangoFilas: [58, 69],
    colActual: 'B',
    colPasado: 'P'
  },
  CORRECTIVOS: {
    hoja: 'Correctivos',
    rangoFilas: [54, 65],
    colActual: 'B',
    colPasado: 'P'
  }
};

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  const menu = ui.createMenu('⭐ AV Weekly');

  menu.addItem('Procesar semana', 'importarDatosSemanales');
  menu.addItem('Procesar mes', 'procesarMes');
  menu.addItem('Guardar PLANO como .txt en la carpeta', 'guardarPlanoTxt');
  menu.addItem('Actualizar Looker Studio', 'volcarDatosLookerStudio');
  menu.addSeparator();
  menu.addItem('Speech Sergio - Semanal', 'speechSergioSemanal');
  menu.addItem('Speech Sergio - Mensual', 'speechSergioMensual');
  menu.addSeparator();
  menu.addItem('Speech Carlos - Semanal', 'speechCarlosSemanal');
  menu.addItem('Speech Carlos - Mensual', 'speechCarlosMensual');

  menu.addToUi();
}

// --- ENLACES DEL MENÚ ---
function speechSergioSemanal() { mostrarSpeechUnificado('SEMANAL', 'Sergio'); }
function speechSergioMensual() { mostrarSpeechUnificado('MENSUAL', 'Sergio'); }
function speechCarlosSemanal() { mostrarSpeechUnificado('SEMANAL', 'Carlos'); }
function speechCarlosMensual() { mostrarSpeechUnificado('MENSUAL', 'Carlos'); }

// ==========================================
// 🚀 ORQUESTADOR PRINCIPAL
// ==========================================
function mostrarSpeechUnificado(periodo, destinatario) {
  try {
    if (periodo === 'MENSUAL' && destinatario === 'Sergio') {
      const htmlOutput = HtmlService.createHtmlOutput(generarSpeechSergioMensualHtml())
          .setWidth(760)
          .setHeight(650);

      SpreadsheetApp.getUi().showModalDialog(htmlOutput, `Speech ${destinatario} - ${periodo}`);
      return;
    }

    if (periodo === 'SEMANAL' && destinatario === 'Sergio') {
      const htmlOutput = HtmlService.createHtmlOutput(generarSpeechSergioSemanalHtml())
          .setWidth(760)
          .setHeight(650);

      SpreadsheetApp.getUi().showModalDialog(htmlOutput, `Speech ${destinatario} - ${periodo}`);
      return;
    }

    const txtRemoto = generarInformeRemoto(periodo, destinatario);
    const txtProgramado = generarInformeProgramado(periodo, destinatario);
    const txtPresencial = generarInformePresencial(periodo, destinatario);
    const txtIncidencias = generarInformeIncidencias(periodo, destinatario);
    const txtCorrectivos = generarInformeCorrectivos(periodo, destinatario);

    const separador = '\n\n----------------------------------------------------\n\n';
    const informeCompleto = [txtRemoto, txtProgramado, txtPresencial, txtIncidencias, txtCorrectivos].join(separador);

    const htmlTemplate = `
      <textarea style="width: 100%; height: 95%; font-family: monospace; font-size: 13px; padding: 10px; box-sizing: border-box;" readonly>${informeCompleto}</textarea>
    `;
    const htmlOutput = HtmlService.createHtmlOutput(htmlTemplate)
        .setWidth(700)
        .setHeight(500);

    SpreadsheetApp.getUi().showModalDialog(htmlOutput, `Speech ${destinatario} - ${periodo}`);

  } catch (e) {
    SpreadsheetApp.getUi().alert('Error al generar el Speech', e.message, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

// ==========================================
// 🛠️ HERRAMIENTAS
// ==========================================
function obtenerDatosMensuales(tipo) {
  const config = CONFIG_MENSUAL[tipo];
  if (!config) return { error: `No existe configuración para ${tipo}` };
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(config.hoja);
  if (!hoja) return { error: `No se encuentra la pestaña ${config.hoja}` };
  const filaInicio = config.rangoFilas[0];
  const filaFin = config.rangoFilas[1];
  const rangoActual = hoja.getRange(`${config.colActual}${filaInicio}:${config.colActual}${filaFin}`).getValues();
  const rangoPasado = hoja.getRange(`${config.colPasado}${filaInicio}:${config.colPasado}${filaFin}`).getValues();
  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  let mesIndex = -1;
  for (let i = rangoActual.length - 1; i >= 0; i--) {
    const valor = rangoActual[i][0];
    if (typeof valor === 'number' && valor > 0) { mesIndex = i; break; }
  }
  if (mesIndex === -1) return { hayDatos: false };
  return { hayDatos: true, mes: meses[mesIndex], actual: Number(rangoActual[mesIndex][0]), pasado: Number(rangoPasado[mesIndex][0]) };
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

// ==========================================
// 1. LÓGICA REMOTO
// ==========================================
// ==========================================
// SPEECH SERGIO MENSUAL CON FORMATO
// ==========================================
function generarSpeechSergioMensualHtml() {
  const remoto = obtenerDatosSpeechRemotoMensual();
  const programado = obtenerDatosSpeechProgramadoMensual();
  const presencial = obtenerDatosSpeechPresencialMensual();
  const incidencias = obtenerDatosSpeechIncidenciasMensual();
  const correctivos = obtenerDatosSpeechCorrectivosMensual();

  const contenido = [
    pHtml('Buenos días a todos,'),
    pVacio(),
    tituloHtml('Soporte remoto:'),
    pHtml(
      `El número de soportes realizados en ${e(remoto.mes)} ha sido de ${remoto.actual}, ` +
      `${textoDiferencia(remoto.difMes)} que el año anterior (${remoto.pasado} en 2025). ` +
      `Siendo un ${remoto.difMes < 0 ? 'descenso' : 'aumento'} del ${remoto.porcMes}%.`
    ),
    pVacio(),
    pHtml(
      `Dentro de la ${uHtml('volumetría semanal')}, se han resuelto ${remoto.errores} incidencias en remoto, ` +
      `gestionado ${remoto.conexiones} conexiones y se ha guiado al usuario en ${remoto.operativa} ocasiones. ` +
      `Dando un total de ${remoto.totalSemanal} soportes remotos, ${textoDiferencia(remoto.difSemanal)} que el año pasado.`
    ),
    separadorHtml(),

    tituloHtml('Soporte programado:'),
    pHtml(
      `Se han realizado ${programado.actual} intervenciones. ${textoDiferencia(programado.difMes)} que en el año anterior ` +
      `(${programado.pasado} en 2025). Lo que supone ${programado.difMes < 0 ? 'una reducción' : 'un aumento'} de un ${programado.porcMes} %.`
    ),
    pVacio(),
    pHtml(
      `En la ${uHtml('volumetría semanal por ubicación')}: ${e(programado.ubicaciones)}, sumando ${programado.totalSemanal}. ` +
      `Son ${textoDiferencia(programado.difSemanal)} que el año pasado (${programado.totalSemanalPasado}).`
    ),
    pVacio(),
    pHtml(
      `${uHtml('Dentro del tipo de resolución:')} ${e(programado.resoluciones)}.`
    ),
    separadorHtml(),

    tituloHtml('Soportes presenciales:'),
    pHtml(
      `El mes pasado se han realizado ${presencial.actual} soportes, ${textoDiferencia(presencial.difMes)} que en el año anterior ` +
      `(${presencial.pasado} en 2025). Representa un ${presencial.difMes < 0 ? 'descenso' : 'aumento'} del ${presencial.porcMes}%. ` +
      `Esto viene dado por la carga que tuvimos el año pasado con el etiquetado.`
    ),
    pHtml(
      `En la ${uHtml('volumetría semanal')}, el equipo ha realizado los siguientes presenciales: ${e(presencial.ubicaciones)}. ` +
      `Total, semanal: ${presencial.totalSemanal}. Son ${textoDiferencia(presencial.difSemanal)} que el año pasado.`
    ),
    pHtml(
      `${uHtml('Dentro del tipo de resolución:')} Ha habido ${e(presencial.resoluciones)}.`
    ),
    separadorHtml(),

    tituloHtml('Incidencias:'),
    pHtml(
      `En ${e(incidencias.mes)} se han registrado ${incidencias.actual} incidencias, ${textoDiferencia(incidencias.difMes)} que el año anterior ` +
      `(${incidencias.pasado} en 2025). Representa un ${incidencias.difMes < 0 ? 'descenso' : 'aumento'} del ${incidencias.porcMes}%.`
    ),
    pHtml(
      `En la ${uHtml('volumetría semanal')}: ${e(incidencias.ubicaciones)}, sumando ${incidencias.totalSemanal}. ` +
      `${textoComparacionIncidencias(incidencias)}`
    ),
    pHtml(
      `${uHtml('Dentro del tipo de resolución:')} Ha habido ${e(incidencias.resoluciones)}.`
    ),
    separadorHtml(),

    tituloHtml('Y finalizamos con Correctivos:'),
    pHtml(
      `En ${e(correctivos.mes)} se han realizado ${correctivos.actual} correctivos, ${textoDiferencia(correctivos.difMes)} que el año anterior ` +
      `(${correctivos.pasado} en 2025). Representa un ${correctivos.difMes < 0 ? 'descenso' : 'aumento'} del ${correctivos.porcMes}%.`
    ),
    pHtml(
      `En la ${uHtml('volumetría semanal:')} ${e(correctivos.ubicaciones)}, sumando ${correctivos.totalSemanal}. ` +
      `Son ${textoDiferencia(correctivos.difSemanal)} que en el año pasado (${correctivos.totalSemanalPasado}).`
    ),
    pHtml(
      `${uHtml('Dentro del tipo de resolución,')} destacan: ${e(correctivos.resoluciones)}.`
    )
  ].join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <base target="_top">
        <style>
          body {
            margin: 0;
            padding: 14px;
            font-family: Arial, sans-serif;
            background: #f5f5f5;
            color: #111;
          }
          .toolbar {
            display: flex;
            justify-content: flex-end;
            margin-bottom: 10px;
          }
          button {
            border: 1px solid #bbb;
            background: #fff;
            border-radius: 4px;
            padding: 7px 12px;
            font-size: 13px;
            cursor: pointer;
          }
          button:hover {
            background: #efefef;
          }
          #speech {
            min-height: 520px;
            padding: 18px;
            border: 1px solid #d0d0d0;
            background: #fff;
            font-family: Calibri, Arial, sans-serif;
            font-size: 14px;
            line-height: 1.35;
            outline: none;
          }
          p {
            margin: 0 0 14px 0;
          }
          .titulo {
            font-weight: 700;
            margin-top: 8px;
          }
          .vacio {
            min-height: 12px;
          }
          .separador {
            margin: 30px 0;
          }
        </style>
      </head>
      <body>
        <div class="toolbar">
          <button onclick="copiarSpeech()">Copiar con formato</button>
        </div>
        <div id="speech" contenteditable="true">${contenido}</div>
        <script>
          function copiarSpeech() {
            var node = document.getElementById('speech');
            var range = document.createRange();
            range.selectNodeContents(node);
            var selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            document.execCommand('copy');
            selection.removeAllRanges();
          }
        </script>
      </body>
    </html>
  `;
}

function generarSpeechSergioSemanalHtml() {
  const remoto = obtenerDatosSpeechRemotoSemanal();
  const programado = obtenerDatosSpeechProgramadoSemanal();
  const presencial = obtenerDatosSpeechPresencialSemanal();
  const incidencias = obtenerDatosSpeechIncidenciasSemanal();
  const correctivos = obtenerDatosSpeechCorrectivosSemanal();
  const resolucionesIncidencias = e(incidencias.resoluciones).replace(/^(\d+) /, '$1 en ');

  const contenido = [
    pHtml('Buenos días a todos,'),
    tituloHtml('Soporte remoto:'),
    pHtml(
      `Se han resuelto ${remoto.errores} incidencias en remoto, ` +
      `gestionado ${remoto.conexiones} conexiones y se ha guiado al usuario en ${remoto.operativa} ocasiones. ` +
      `Dando un total de ${remoto.totalSemanal} soportes remotos, ${textoDiferencia(remoto.difSemanal)} que el año pasado.`
    ),
    separadorHtml(),

    tituloHtml('En Soporte programado:'),
    pHtml(
      `Se han realizado ${e(programado.ubicaciones)}, sumando ${programado.totalSemanal}. ` +
      `Son ${textoDiferencia(programado.difSemanal)} que el año pasado (${programado.totalSemanalPasado}).`
    ),
    pHtml(
      `${uHtml('Dentro del tipo de resolución:')} ${e(programado.resoluciones)}.`
    ),
    separadorHtml(),

    tituloHtml('Soportes presenciales:'),
    pHtml(
      `En la ${uHtml('volumetría semanal')}, el equipo ha realizado los siguientes presenciales: ${e(presencial.ubicaciones)}. ` +
      `Total semanal: ${presencial.totalSemanal}. Son ${textoDiferencia(presencial.difSemanal)} que el año pasado.`
    ),
    pHtml(
      'El motivo de ésta diferencia es debido a los etiquetados.'
    ),
    pHtml(
      `${uHtml('Dentro del tipo de resolución:')} Ha habido ${e(presencial.resoluciones)}.`
    ),
    separadorHtml(),

    tituloHtml('Incidencias:'),
    pHtml(
      `${e(incidencias.ubicaciones)}, sumando ${incidencias.totalSemanal}. ` +
      `Son ${textoDiferencia(incidencias.difSemanal)} que el año pasado (${incidencias.totalSemanalPasado})`
    ),
    pHtml(
      `${uHtml('Dentro del tipo de resolución, destacamos:')} ${resolucionesIncidencias}.`
    ),
    separadorHtml(),

    tituloHtml('Y finalizamos con Correctivos:'),
    pHtml(
      `${e(correctivos.ubicaciones)}, sumando ${correctivos.totalSemanal}. ` +
      `Son ${textoDiferencia(correctivos.difSemanal)} que en el año pasado (${correctivos.totalSemanalPasado}).`
    ),
    pHtml(
      `${uHtml('Dentro del tipo de resolución,')} destacan: ${e(correctivos.resoluciones)}.`
    )
  ].join('');

  return envolverSpeechSergioHtml(contenido);
}

function envolverSpeechSergioHtml(contenido) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <base target="_top">
        <style>
          body {
            margin: 0;
            padding: 14px;
            font-family: Arial, sans-serif;
            background: #f5f5f5;
            color: #111;
          }
          .toolbar {
            display: flex;
            justify-content: flex-end;
            margin-bottom: 10px;
          }
          button {
            border: 1px solid #bbb;
            background: #fff;
            border-radius: 4px;
            padding: 7px 12px;
            font-size: 13px;
            cursor: pointer;
          }
          button:hover {
            background: #efefef;
          }
          #speech {
            min-height: 520px;
            padding: 18px;
            border: 1px solid #d0d0d0;
            background: #fff;
            font-family: Calibri, Arial, sans-serif;
            font-size: 14px;
            line-height: 1.35;
            outline: none;
          }
          p {
            margin: 0 0 14px 0;
          }
          .titulo {
            font-weight: 700;
            margin-top: 8px;
          }
          .vacio {
            min-height: 12px;
          }
          .separador {
            margin: 30px 0;
          }
        </style>
      </head>
      <body>
        <div class="toolbar">
          <button onclick="copiarSpeech()">Copiar con formato</button>
        </div>
        <div id="speech" contenteditable="true">${contenido}</div>
        <script>
          function copiarSpeech() {
            var node = document.getElementById('speech');
            var range = document.createRange();
            range.selectNodeContents(node);
            var selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            document.execCommand('copy');
            selection.removeAllRanges();
          }
        </script>
      </body>
    </html>
  `;
}

function obtenerDatosSpeechRemotoSemanal() {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Remotos');
  if (!hoja) throw new Error('No se encuentra la pestaña Remotos');

  const datosTotales = hoja.getRange('A5:BB9').getValues();
  const datosDesglose = hoja.getRange('A13:BB17').getValues();
  const colIdx = obtenerUltimoIndiceConDato(datosTotales[1], 2);
  const totalSemanal = Number(datosTotales[1][colIdx] || 0);
  const totalSemanalPasado = Number(datosTotales[4][colIdx] || 0);

  const getVal = (cat) => {
    const row = datosDesglose.find(r => normalizarClaveSpeech(r[0]) === cat);
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
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Programados');
  if (!hoja) throw new Error('No se encuentra la pestaña Programados');

  const checkRow = hoja.getRange('A19:BB19').getValues()[0];
  const colIdx = obtenerUltimoIndiceConDato(checkRow, 1);
  const datosEdificios = hoja.getRange('A19:BB32').getValues();
  const totalSemanal = Number(datosEdificios[1][colIdx] || 0);
  const totalSemanalPasado = obtenerTotalSemanalPasado(datosEdificios, colIdx);
  const tipos = obtenerTiposPorAccion(hoja, 'A5:BB12', colIdx);

  return {
    totalSemanal,
    totalSemanalPasado,
    difSemanal: totalSemanal - totalSemanalPasado,
    ubicaciones: construirListaUbicacionesConY(hoja, [27, 32], colIdx),
    resoluciones: construirTextoResolucionesAccion(tipos)
  };
}

function obtenerDatosSpeechPresencialSemanal() {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Presenciales');
  if (!hoja) throw new Error('No se encuentra la pestaña Presenciales');

  const checkRow = hoja.getRange('A22:BB22').getValues()[0];
  const colIdx = obtenerUltimoIndiceConDato(checkRow, 1);
  const datosEdificios = hoja.getRange('A21:BB34').getValues();
  const totalSemanal = Number(datosEdificios[1][colIdx] || 0);
  const totalSemanalPasado = obtenerTotalSemanalPasado(datosEdificios, colIdx);
  const tipos = obtenerTiposPorAccion(hoja, 'A5:BB14', colIdx);

  return {
    totalSemanal,
    totalSemanalPasado,
    difSemanal: totalSemanal - totalSemanalPasado,
    ubicaciones: construirListaUbicacionesConY(hoja, [29, 34], colIdx),
    resoluciones: construirTextoResolucionesAccion(tipos)
  };
}

function obtenerDatosSpeechIncidenciasSemanal() {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Incidencias');
  if (!hoja) throw new Error('No se encuentra la pestaña Incidencias');

  const checkRow = hoja.getRange('A42:BB42').getValues()[0];
  const colIdx = obtenerUltimoIndiceConDato(checkRow, 1);
  const datosPrinc = hoja.getRange('A41:BB54').getValues();
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
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Correctivos');
  if (!hoja) throw new Error('No se encuentra la pestaña Correctivos');

  const checkRow = hoja.getRange('A38:BB38').getValues()[0];
  const colIdx = obtenerUltimoIndiceConDato(checkRow, 1);
  const datosPrinc = hoja.getRange('A37:BB50').getValues();
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
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Remotos');
  if (!hoja) throw new Error('No se encuentra la pestaña Remotos');

  const datosTotales = hoja.getRange('A5:BB9').getValues();
  const datosDesglose = hoja.getRange('A13:BB17').getValues();
  const colIdx = obtenerUltimoIndiceConDato(datosTotales[1], 2);
  const mes = obtenerDatosMensualesObligatorios('REMOTOS');
  const totalSemanal = Number(datosTotales[1][colIdx] || 0);
  const totalSemanalPasado = Number(datosTotales[4][colIdx] || 0);

  const getVal = (cat) => {
    const row = datosDesglose.find(r => normalizarClaveSpeech(r[0]) === cat);
    return row ? Number(row[colIdx] || 0) : 0;
  };

  return completarDatosMensuales({
    mes: mes.mes.toLowerCase(),
    actual: mes.actual,
    pasado: mes.pasado,
    totalSemanal,
    totalSemanalPasado,
    difSemanal: totalSemanal - totalSemanalPasado,
    errores: getVal('ERRORES'),
    conexiones: getVal('CONEXION'),
    operativa: getVal('OPERATIVA')
  });
}

function obtenerDatosSpeechProgramadoMensual() {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Programados');
  if (!hoja) throw new Error('No se encuentra la pestaña Programados');

  const checkRow = hoja.getRange('A19:BB19').getValues()[0];
  const colIdx = obtenerUltimoIndiceConDato(checkRow, 1);
  const datosEdificios = hoja.getRange('A19:BB32').getValues();
  const totalSemanal = Number(datosEdificios[1][colIdx] || 0);
  const totalSemanalPasado = obtenerTotalSemanalPasado(datosEdificios, colIdx);
  const mes = obtenerDatosMensualesObligatorios('PROGRAMADOS');
  const tipos = obtenerTiposPorAccion(hoja, 'A5:BB12', colIdx);

  return completarDatosMensuales({
    mes: mes.mes.toLowerCase(),
    actual: mes.actual,
    pasado: mes.pasado,
    totalSemanal,
    totalSemanalPasado,
    difSemanal: totalSemanal - totalSemanalPasado,
    ubicaciones: construirListaUbicacionesConY(hoja, [27, 32], colIdx),
    resoluciones: construirTextoResolucionesAccion(tipos)
  });
}

function obtenerDatosSpeechPresencialMensual() {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Presenciales');
  if (!hoja) throw new Error('No se encuentra la pestaña Presenciales');

  const checkRow = hoja.getRange('A22:BB22').getValues()[0];
  const colIdx = obtenerUltimoIndiceConDato(checkRow, 1);
  const datosEdificios = hoja.getRange('A21:BB34').getValues();
  const totalSemanal = Number(datosEdificios[1][colIdx] || 0);
  const totalSemanalPasado = obtenerTotalSemanalPasado(datosEdificios, colIdx);
  const mes = obtenerDatosMensualesObligatorios('PRESENCIALES');
  const tipos = obtenerTiposPorAccion(hoja, 'A5:BB14', colIdx);

  return completarDatosMensuales({
    mes: mes.mes.toLowerCase(),
    actual: mes.actual,
    pasado: mes.pasado,
    totalSemanal,
    totalSemanalPasado,
    difSemanal: totalSemanal - totalSemanalPasado,
    ubicaciones: construirListaUbicacionesConY(hoja, [29, 34], colIdx),
    resoluciones: construirTextoResolucionesAccion(tipos)
  });
}

function obtenerDatosSpeechIncidenciasMensual() {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Incidencias');
  if (!hoja) throw new Error('No se encuentra la pestaña Incidencias');

  const checkRow = hoja.getRange('A42:BB42').getValues()[0];
  const colIdx = obtenerUltimoIndiceConDato(checkRow, 1);
  const datosPrinc = hoja.getRange('A41:BB54').getValues();
  const totalSemanal = Number(datosPrinc[1][colIdx] || 0);
  const totalSemanalPasado = Number(datosPrinc[4][colIdx] || 0);
  const mes = obtenerDatosMensualesObligatorios('INCIDENCIAS');
  const tipos = obtenerCategoriasTotales(hoja, 5, 35, colIdx);

  return completarDatosMensuales({
    mes: mes.mes.toLowerCase(),
    actual: mes.actual,
    pasado: mes.pasado,
    totalSemanal,
    totalSemanalPasado,
    difSemanal: totalSemanal - totalSemanalPasado,
    porcSemanal: calcularPorcentaje(totalSemanal - totalSemanalPasado, totalSemanalPasado),
    ubicaciones: construirListaUbicacionesConY(hoja, [49, 54], colIdx),
    resoluciones: construirTextoResolucionesCategoria(tipos)
  });
}

function obtenerDatosSpeechCorrectivosMensual() {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Correctivos');
  if (!hoja) throw new Error('No se encuentra la pestaña Correctivos');

  const checkRow = hoja.getRange('A38:BB38').getValues()[0];
  const colIdx = obtenerUltimoIndiceConDato(checkRow, 1);
  const datosPrinc = hoja.getRange('A37:BB50').getValues();
  const totalSemanal = Number(datosPrinc[1][colIdx] || 0);
  const totalSemanalPasado = Number(datosPrinc[4][colIdx] || 0);
  const mes = obtenerDatosMensualesObligatorios('CORRECTIVOS');
  const tipos = obtenerCategoriasTotales(hoja, 5, 27, colIdx);

  return completarDatosMensuales({
    mes: mes.mes.toLowerCase(),
    actual: mes.actual,
    pasado: mes.pasado,
    totalSemanal,
    totalSemanalPasado,
    difSemanal: totalSemanal - totalSemanalPasado,
    ubicaciones: construirListaUbicacionesConY(hoja, [45, 50], colIdx),
    resoluciones: construirTextoResolucionesCategoria(tipos)
  });
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

function construirListaUbicacionesConY(hoja, filasRango, colIdx) {
  return unirConY(construirListaUbicaciones(hoja, filasRango, colIdx));
}

function obtenerTiposPorAccion(hoja, rangoA1, colIdx) {
  const datos = hoja.getRange(rangoA1).getValues();
  const tipos = [];
  datos.forEach(row => {
    const valor = Number(row[colIdx] || 0);
    if (valor > 0) {
      tipos.push({
        categoria: row[1],
        nombre: row[2],
        valor
      });
    }
  });
  tipos.sort((a, b) => b.valor - a.valor);
  return tipos;
}

function obtenerCategoriasTotales(hoja, filaInicio, numFilas, colIdx) {
  const datos = hoja.getRange(filaInicio, 1, numFilas, colIdx + 1).getValues();
  const tipos = [];
  datos.forEach(row => {
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

function construirTextoResolucionesAccion(tipos) {
  return unirConY(tipos.slice(0, 2).map(t => `${t.valor} ${textoAccionResolucion(t)}`));
}

function construirTextoResolucionesCategoria(tipos) {
  return unirConY(tipos.slice(0, 2).map(t => `${t.valor} ${textoCategoriaResolucion(t.nombre)}`));
}

function textoAccionResolucion(tipo) {
  const accion = String(tipo.nombre || '').toLowerCase();
  const categoria = String(tipo.categoria || '').toLowerCase();
  const claveAccion = normalizarClaveSpeech(tipo.nombre);
  const claveCategoria = normalizarClaveSpeech(tipo.categoria);

  if (claveAccion === 'PREPARACION SALA') return 'preparación sala';
  if (claveAccion === 'CONEXION' && claveCategoria) return `conexión de ${categoria}`;
  return accion;
}

function textoCategoriaResolucion(nombre) {
  const clave = normalizarClaveSpeech(nombre);
  if (clave === 'ALMACEN') return 'almacén';
  if (clave === 'DOMOTICA') return 'demótica';
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
  const limpias = partes.filter(p => p !== '' && p !== null && p !== undefined);
  if (limpias.length <= 1) return limpias.join('');
  if (limpias.length === 2) return `${limpias[0]} y ${limpias[1]}`;
  return `${limpias.slice(0, -1).join(', ')} y ${limpias[limpias.length - 1]}`;
}

function normalizarClaveSpeech(texto) {
  return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
}

function e(texto) {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pHtml(contenido) {
  return `<p>${contenido}</p>`;
}

function pVacio() {
  return '<p class="vacio"></p>';
}

function tituloHtml(texto) {
  return `<p class="titulo"><strong>${e(texto)}</strong></p>`;
}

function uHtml(texto) {
  return `<u>${e(texto)}</u>`;
}

function separadorHtml() {
  return '<p class="separador">----------------------------------------------------</p>';
}

function generarInformeRemoto(periodo, destinatario) {
  try {
    const hojaSemanal = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Remotos');
    const datosTotales = hojaSemanal.getRange('A5:BB9').getValues();
    const datosDesglose = hojaSemanal.getRange('A13:BB17').getValues();
    const filaAñoActual = datosTotales[1];
    let colIdx = -1;
    for (let i = filaAñoActual.length - 1; i >= 2; i--) {
      if (filaAñoActual[i] !== '' && filaAñoActual[i] !== 0 && filaAñoActual[i] != null) { colIdx = i; break; }
    }
    const totalSemanal = datosTotales[1][colIdx];
    const totalSemanalPasado = datosTotales[4][colIdx];
    const difSemanal = totalSemanal - totalSemanalPasado;

    const getVal = (cat) => {
      const row = datosDesglose.find(r => r[0].toString().toUpperCase().trim() === cat);
      return row ? Number(row[colIdx]) : 0;
    };
    const err = getVal('ERRORES');
    const con = getVal('CONEXION');
    const op = getVal('OPERATIVA');

    let informe = '';

    if (periodo === 'SEMANAL') {
      const textoDif = `Son ${Math.abs(difSemanal)} ${difSemanal < 0 ? 'menos' : 'más'} que la misma semana del año pasado.`;
      if (destinatario === 'Sergio') {
        informe = `Buenos días (Sergio),\n` +
          `Comenzamos con soporte remoto. Se han resuelto ${err} incidencias en remoto, gestionado ${con} conexiones y se ha guiado al usuario en ${op} ocasiones. ` +
          `Dando un total de ${totalSemanal} soportes remotos. ${textoDif}`;
      } else {
        informe = `Remoto - semana Carlos :\n\n` +
          `Comenzamos con el soporte remoto que realizan los dispatchers.\n` +
          `En la semana pasada se han realizado ${totalSemanal} soportes en total\n` +
          `de los cuales se han resuelto ${err} incidencias en remoto, \n` +
          `gestionado ${con} conexiones de salas y ${op} asistencias guiando al usuario.\n` +
          `${textoDif}`;
      }
    } else {
      const datosMes = obtenerDatosMensuales('REMOTOS');
      if (datosMes.error) throw new Error(datosMes.error);
      if (!datosMes.hayDatos) throw new Error("No hay datos mensuales en Remotos.");

      const difMes = datosMes.actual - datosMes.pasado;
      const porcMes = datosMes.pasado > 0 ? (difMes / datosMes.pasado) * 100 : 0;

      const introMes = `El número de soportes realizados en ${datosMes.mes.toLowerCase()} ha sido de ${datosMes.actual}, ` +
        `${Math.abs(difMes)} ${difMes < 0 ? 'menos' : 'más'} que el año anterior (${datosMes.pasado} en 2025). ` +
        `Siendo una ${difMes < 0 ? 'disminución' : 'aumento'} del ${Math.abs(porcMes).toFixed(0)}%.`;

      const detalleSemanal = `Dentro de la volumetría semanal, se han resuelto ${err} incidencias en remoto, gestionado ${con} conexiones y se ha guiado al usuario en ${op} ocasiones. ` +
        `Dando un total de ${totalSemanal} soportes remotos, ${Math.abs(difSemanal)} ${difSemanal < 0 ? 'menos' : 'más'} que el año pasado.`;

      if (destinatario === 'Sergio') {
        informe = `Buenos días a todos (Mensual Sergio),\nSoporte remoto:\n${introMes}\n\nDetalle semanal:\n${detalleSemanal}`;
      } else {
        informe = `Buenos días a todos (Mensual Carlos),\nComenzamos con:\nSoporte remoto\n${introMes}\n${detalleSemanal}`;
      }
    }
    return informe;
  } catch (e) { return `[Error en Remoto: ${e.message}]`; }
}

// ==========================================
// 2. LÓGICA PROGRAMADO
// ==========================================
function generarInformeProgramado(periodo, destinatario) {
  try {
    const hojaSemanal = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Programados');
    const checkRow = hojaSemanal.getRange('A19:BB19').getValues()[0];
    let colIdx = -1;
    for(let i = checkRow.length - 1; i >= 1; i--) { if(checkRow[i] > 0) { colIdx = i; break; } }

    const datosEdificios = hojaSemanal.getRange('A19:BB32').getValues();
    const totalSemanal = datosEdificios[1][colIdx]; 
    const semanaNombre = datosEdificios[0][colIdx]; 
    const filaSemanasPasadas = datosEdificios[3];
    const filaValoresPasados = datosEdificios[4];
    let totalSemanalPasado = 0;
    for(let i=1; i < filaSemanasPasadas.length; i++){
      if(filaSemanasPasadas[i] == semanaNombre){ totalSemanalPasado = Number(filaValoresPasados[i]); break; }
    }
    const difSemanal = totalSemanal - totalSemanalPasado;
    const porcSemanal = totalSemanalPasado > 0 ? (difSemanal / totalSemanalPasado) * 100 : 0;

    const listaUbicaciones = construirListaUbicaciones(hojaSemanal, [27, 32], colIdx);
    const textoUbicacionesSergio = listaUbicaciones.join(', ');

    const datosTipo = hojaSemanal.getRange('A5:BB12').getValues();
    const tipos = [];
    for(let i=0; i<datosTipo.length; i++){
      let val = Number(datosTipo[i][colIdx] || 0);
      if(val > 0) tipos.push({nombre: datosTipo[i][2], valor: val});
    }
    tipos.sort((a,b)=>b.valor - a.valor);

    const textoTiposSergio = `Dentro del tipo de resolución: ${tipos[0]?.valor || 0} en ${tipos[0]?.nombre.toLowerCase() || ''} y ${tipos[1]?.valor || 0} en ${tipos[1]?.nombre.toLowerCase() || ''}.`;

    let textoTiposCarlos = '';
    tipos.slice(0, 3).forEach(t => {
      textoTiposCarlos += `\n${t.valor} ${t.nombre.toUpperCase()}`;
    });

    let informe = '';

    if (periodo === 'SEMANAL') {
      if (destinatario === 'Sergio') {
        const detalleSemanalTexto = `En Soporte programados, ${textoUbicacionesSergio}, sumando ${totalSemanal}. ` +
          `Son ${Math.abs(difSemanal)} ${difSemanal < 0 ? 'menos' : 'más'} que el año pasado (${totalSemanalPasado}), lo que supone un ${Math.abs(porcSemanal).toFixed(1)}% ${difSemanal < 0 ? 'menos' : 'más'}.`;
        informe = `${detalleSemanalTexto}\n\n${textoTiposSergio}`;
      } else {
        informe = `Programados - semanal (Carlos)\n\n` +
          `Pasamos a los soportes programados, se han dado ${totalSemanal} soportes en salas VIP y a usuarios críticos ` +
          `lo que significa ${Math.abs(difSemanal)} ${difSemanal < 0 ? 'menos' : 'más'} que la misma semana del año anterior, ` +
          `de los cuales por ubicación observamos que ${listaUbicaciones.join(', ')}...\n\n` +
          `De estos soportes programados, destacan las siguientes categorías:${textoTiposCarlos}`;
      }
    } else {
      const datosMes = obtenerDatosMensuales('PROGRAMADOS');
      if (datosMes.error) throw new Error(datosMes.error);
      if (!datosMes.hayDatos) throw new Error("No hay datos mensuales en Programados.");

      const difMes = datosMes.actual - datosMes.pasado;
      const porcMes = datosMes.pasado > 0 ? (difMes / datosMes.pasado) * 100 : 0;

      const introMes = `Se han realizado ${datosMes.actual} intervenciones. ${Math.abs(difMes)} ${difMes < 0 ? 'menos' : 'más'} que en el año anterior (${datosMes.pasado} en 2025). ` +
        `Lo que supone una ${difMes < 0 ? 'reducción' : 'aumento'} de un ${Math.abs(porcMes).toFixed(0)} %.`;

      informe = `Soporte programado (Mensual ${destinatario})\n${introMes}\nPor ubicación (semanal): ${textoUbicacionesSergio}, sumando ${totalSemanal}. ` +
        `Son ${Math.abs(difSemanal)} ${difSemanal < 0 ? 'menos' : 'más'} que el año pasado (${totalSemanalPasado}).\n\n${textoTiposSergio}`;
    }
    return informe;
  } catch (e) { return `[Error en Programado: ${e.message}]`; }
}

// ==========================================
// 3. LÓGICA PRESENCIAL
// ==========================================
function generarInformePresencial(periodo, destinatario) {
  try {
    const hojaSemanal = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Presenciales');
    const checkRow = hojaSemanal.getRange('A22:BB22').getValues()[0];
    let colIdx = -1;
    for(let i = checkRow.length - 1; i >= 1; i--) { if(checkRow[i] > 0) { colIdx = i; break; } }

    const datosEdificios = hojaSemanal.getRange('A21:BB34').getValues();
    const totalSemanal = datosEdificios[1][colIdx];
    const semanaNombre = datosEdificios[0][colIdx];
    const filaSemanasPasadas = datosEdificios[3];
    const filaValoresPasados = datosEdificios[4];
    let totalSemanalPasado = 0;
    for(let i=1; i < filaSemanasPasadas.length; i++){
      if(filaSemanasPasadas[i] == semanaNombre){ totalSemanalPasado = Number(filaValoresPasados[i]); break; }
    }
    const difSemanal = totalSemanal - totalSemanalPasado;
    const porcSemanal = totalSemanalPasado > 0 ? (difSemanal / totalSemanalPasado) * 100 : 0;

    const listaUbicaciones = construirListaUbicaciones(hojaSemanal, [29, 34], colIdx);
    const textoUbicacionesSergio = listaUbicaciones.join(', ');
    const textoUbicacionesCarlos = listaUbicaciones.map(u => `\n${u}`).join('');

    const datosTipo = hojaSemanal.getRange('A5:BB14').getValues();
    const tipos = [];
    for(let i=0; i<datosTipo.length; i++){
      let val = Number(datosTipo[i][colIdx] || 0);
      if(val > 0) tipos.push({nombre: datosTipo[i][2], valor: val});
    }
    tipos.sort((a,b)=>b.valor - a.valor);

    const textoTiposSergio = `Dentro del tipo de resolución: Ha habido ${tipos[0]?.valor} ${tipos[0]?.nombre.toLowerCase()} y ${tipos[1]?.valor} ${tipos[1]?.nombre.toLowerCase()}.`;

    let textoTiposCarlos = '';
    tipos.slice(0, 3).forEach(t => {
      textoTiposCarlos += `\n${t.valor} ${t.nombre.toUpperCase()}`;
    });

    let informe = '';
    const compSergio = `Son ${Math.abs(difSemanal)} ${difSemanal < 0 ? 'menos' : 'más'} que el año pasado, lo que supone un ${Math.abs(porcSemanal).toFixed(2)}% ${difSemanal < 0 ? 'menos' : 'más'}.`;
    const compCarlos = `Son ${Math.abs(difSemanal)} ${difSemanal < 0 ? 'menos' : 'más'} que la misma semana del año anterior`;

    if (periodo === 'SEMANAL') {
      if (destinatario === 'Sergio') {
        informe = `Para los soportes presenciales de la semana, el equipo ha intervenido en: ${textoUbicacionesSergio}. ` +
          `Esto hace un total de ${totalSemanal} intervenciones. ${compSergio}\n\n${textoTiposSergio}`;
      } else {
        informe = `Presenciales - semanal (Carlos)\n\n` +
          `En cuanto a los trabajos y soportes presenciales, en la semana pasada se han realizado ${totalSemanal}. ` +
          `${compCarlos}\nDonde destacamos por ubicación:${textoUbicacionesCarlos}\n\n` +
          `De estos soportes presenciales los más relevantes por categoría son:${textoTiposCarlos}`;
      }
    } else {
      const datosMes = obtenerDatosMensuales('PRESENCIALES');
      if (datosMes.error) throw new Error(datosMes.error);
      if (!datosMes.hayDatos) throw new Error("No hay datos mensuales en Presenciales.");

      const difMes = datosMes.actual - datosMes.pasado;
      const porcMes = datosMes.pasado > 0 ? (difMes / datosMes.pasado) * 100 : 0;

      const introMes = `El mes pasado se han realizado ${datosMes.actual} soportes, ${Math.abs(difMes)} ${difMes < 0 ? 'menos' : 'más'} que en el año anterior (${datosMes.pasado} en 2025). ` +
        `Representa un ${difMes < 0 ? 'descenso' : 'aumento'} del ${Math.abs(porcMes).toFixed(0)}%.`;

      const volumetria = `En la volumetría semanal, el equipo ha intervenido en: ${textoUbicacionesSergio}. ` +
        `Total semanal: ${totalSemanal}. Son ${Math.abs(difSemanal)} ${difSemanal < 0 ? 'menos' : 'más'} que el año pasado.`;

      informe = `Soportes presenciales (Mensual ${destinatario})\n${introMes}\n${volumetria}\n${textoTiposSergio}`;
    }
    return informe;
  } catch (e) { return `[Error en Presencial: ${e.message}]`; }
}

// ==========================================
// 4. LÓGICA INCIDENCIAS
// ==========================================
function generarInformeIncidencias(periodo, destinatario) {
  try {
    const hojaSemanal = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Incidencias');
    const checkRow = hojaSemanal.getRange('A42:BB42').getValues()[0];
    let colIdx = -1;
    for(let i = checkRow.length - 1; i >= 1; i--) { if(checkRow[i] > 0) { colIdx = i; break; } }

    const datosPrinc = hojaSemanal.getRange('A41:BB54').getValues();
    const totalSemanal = datosPrinc[1][colIdx];
    const totalSemanalPasado = datosPrinc[4][colIdx];
    const difSemanal = totalSemanal - totalSemanalPasado;
    const porcSemanal = totalSemanalPasado > 0 ? (difSemanal / totalSemanalPasado) * 100 : 0;

    const listaUbicaciones = construirListaUbicaciones(hojaSemanal, [49, 54], colIdx);
    const textoUbicacionesSergio = listaUbicaciones.join(', ');
    const textoUbicacionesCarlos = listaUbicaciones.map(u => '\n' + u).join('');

    const datosTiposFull = hojaSemanal.getRange(5, 1, 35, colIdx + 1).getValues();
    const tipos = [];
    datosTiposFull.forEach(row => {
      let n = row[1]; let v = row[colIdx];
      if(n && typeof v === 'number' && v > 0 && n !== 'TOTAL' && n !== 'RESOLUCIÓN') tipos.push({nombre:n, valor:v});
    });
    tipos.sort((a,b)=>b.valor - a.valor);

    const textoTiposSergio = tipos.length >= 2
      ? `Dentro del tipo de resolución: Ha habido ${tipos[0].valor} ${tipos[0].nombre.toLowerCase()} y ${tipos[1].valor} ${tipos[1].nombre.toLowerCase()}.`
      : tipos.length === 1
      ? `Dentro del tipo de resolución: Ha habido ${tipos[0].valor} ${tipos[0].nombre.toLowerCase()}.`
      : '';

    let textoTiposCarlos = '';
    tipos.slice(0, 3).forEach(t => {
      textoTiposCarlos += '\n' + t.valor + ' ' + t.nombre.toUpperCase();
    });

    let informe = '';
    const compTexto = difSemanal < 0
      ? `${Math.abs(difSemanal)} menos que el año pasado (${totalSemanalPasado}), lo que ha supuesto una reducción de incidencias en un ${Math.abs(porcSemanal).toFixed(0)}%.`
      : `${Math.abs(difSemanal)} más que el año pasado (${totalSemanalPasado}), lo que supone un aumento del ${Math.abs(porcSemanal).toFixed(0)}%.`;

    if (periodo === 'SEMANAL') {
      if (destinatario === 'Sergio') {
        informe = `Incidencias, ${textoUbicacionesSergio}, ${totalSemanal} en total. Son ${compTexto}\n\n${textoTiposSergio}`;
      } else {
        informe = `Incidencias - semanal (Carlos)\n\n` +
          `En cuanto a las incidencias, se han registrado ${totalSemanal} en total. ` +
          `Son ${compTexto}\nPor ubicación:${textoUbicacionesCarlos}\n\n` +
          `Las categorías más relevantes son:${textoTiposCarlos}`;
      }
    } else {
      const datosMes = obtenerDatosMensuales('INCIDENCIAS');
      if (datosMes.error) throw new Error(datosMes.error);
      if (!datosMes.hayDatos) throw new Error("No hay datos mensuales en Incidencias.");

      const difMes = datosMes.actual - datosMes.pasado;
      const porcMes = datosMes.pasado > 0 ? (difMes / datosMes.pasado) * 100 : 0;

      const introMes = `En ${datosMes.mes.toLowerCase()} se han registrado ${datosMes.actual} incidencias, ` +
        `${Math.abs(difMes)} ${difMes < 0 ? 'menos' : 'más'} que el año anterior (${datosMes.pasado} en 2025). ` +
        `Representa un ${difMes < 0 ? 'descenso' : 'aumento'} del ${Math.abs(porcMes).toFixed(0)}%.`;

      const volumetria = `En la volumetría semanal: ${textoUbicacionesSergio}, sumando ${totalSemanal}. Son ${compTexto}`;

      informe = `Incidencias (Mensual ${destinatario})\n${introMes}\n${volumetria}\n${textoTiposSergio}`;
    }
    return informe;
  } catch (e) { return `[Error en Incidencias: ${e.message}]`; }
}

// ==========================================
// 5. LÓGICA CORRECTIVOS
// ==========================================
function generarInformeCorrectivos(periodo, destinatario) {
  try {
    const hojaSemanal = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Correctivos');
    const checkRow = hojaSemanal.getRange('A38:BB38').getValues()[0];
    let colIdx = -1;
    for(let i = checkRow.length - 1; i >= 1; i--) { if(checkRow[i] > 0) { colIdx = i; break; } }

    const datosPrinc = hojaSemanal.getRange('A37:BB50').getValues();
    const totalSemanal = datosPrinc[1][colIdx];
    const totalSemanalPasado = datosPrinc[4][colIdx];
    const difSemanal = totalSemanal - totalSemanalPasado;
    const porcSemanal = totalSemanalPasado > 0 ? (difSemanal / totalSemanalPasado) * 100 : 0;

    const listaUbicaciones = construirListaUbicaciones(hojaSemanal, [45, 50], colIdx);
    const textoUbicacionesSergio = listaUbicaciones.join(', ');
    const textoUbicacionesCarlos = listaUbicaciones.map(u => '\n' + u).join('');

    const datosTiposFull = hojaSemanal.getRange(5, 1, 27, colIdx + 1).getValues();
    const tipos = [];
    datosTiposFull.forEach(row => {
      let n = row[1]; let v = row[colIdx];
      if(n && typeof v === 'number' && v > 0 && n !== 'TOTAL' && n !== 'RESOLUCIÓN') tipos.push({nombre:n, valor:v});
    });
    tipos.sort((a,b)=>b.valor - a.valor);

    const textoTiposSergio = tipos.length >= 2
      ? `Dentro del tipo de resolución, destacan: ${tipos[0].valor} ${tipos[0].nombre.toLowerCase()} y ${tipos[1].valor} ${tipos[1].nombre.toLowerCase()}.`
      : tipos.length === 1
      ? `Dentro del tipo de resolución, destacan: ${tipos[0].valor} ${tipos[0].nombre.toLowerCase()}.`
      : '';

    let textoTiposCarlos = '';
    tipos.slice(0, 3).forEach(t => {
      textoTiposCarlos += '\n' + t.valor + ' ' + t.nombre.toUpperCase();
    });

    let informe = '';
    const compTexto = difSemanal < 0
      ? `${Math.abs(difSemanal)} menos que en el año pasado (${totalSemanalPasado}). Siendo un descenso del ${Math.abs(porcSemanal).toFixed(0)}%.`
      : `${Math.abs(difSemanal)} más que en el año pasado (${totalSemanalPasado}). Siendo un aumento del ${Math.abs(porcSemanal).toFixed(0)}%.`;

    if (periodo === 'SEMANAL') {
      if (destinatario === 'Sergio') {
        informe = `Y finalizamos con los soportes correctivos. ${textoUbicacionesSergio}, sumando ${totalSemanal} soportes. ${compTexto}\n\n${textoTiposSergio}`;
      } else {
        informe = `Correctivos - semanal (Carlos)\n\n` +
          `Finalizamos con los mantenimientos correctivos, se han realizado ${totalSemanal} soportes en total. ` +
          `Son ${compTexto}\nPor ubicación:${textoUbicacionesCarlos}\n\n` +
          `Las categorías más relevantes son:${textoTiposCarlos}`;
      }
    } else {
      const datosMes = obtenerDatosMensuales('CORRECTIVOS');
      if (datosMes.error) throw new Error(datosMes.error);
      if (!datosMes.hayDatos) throw new Error("No hay datos mensuales en Correctivos.");

      const difMes = datosMes.actual - datosMes.pasado;
      const porcMes = datosMes.pasado > 0 ? (difMes / datosMes.pasado) * 100 : 0;

      const introMes = `En ${datosMes.mes.toLowerCase()} se han realizado ${datosMes.actual} correctivos, ` +
        `${Math.abs(difMes)} ${difMes < 0 ? 'menos' : 'más'} que el año anterior (${datosMes.pasado} en 2025). ` +
        `Representa un ${difMes < 0 ? 'descenso' : 'aumento'} del ${Math.abs(porcMes).toFixed(0)}%.`;

      const volumetria = `En la volumetría semanal: ${textoUbicacionesSergio}, sumando ${totalSemanal}. Son ${compTexto}`;

      informe = `Correctivos (Mensual ${destinatario})\n${introMes}\n${volumetria}\n${textoTiposSergio}`;
    }
    return informe;
  } catch (e) { return `[Error en Correctivos: ${e.message}]`; }
}

// ==========================================
// 📥 AUTOMATIZACIÓN DE ENTRADA DE DATOS
// ==========================================
// Input: the weekly and monthly templates. Output: the TXT for AV Weekly.
const ID_CARPETA_TEMPLATES = '1Uz7rU5hm8jUvp1nLLQyALgaiYjhCR8LW';
const ID_CARPETA_TXT = '1KdBpANFQ2O2_PBhlTtV8LpC2-xfyhNiR';
// Earlier TXTs are moved here, never trashed: each one carries the resolution
// detail of every week up to its own, so they are the backup of that detail.
const ID_CARPETA_HISTORICO_TXT = '10beuK3so7X4lHMVuWKQ4azWJDq7My99E';

// The templates folder holds the weekly and the monthly export, as .xlsx and as
// Google Sheets. Only a Google Sheet can be opened here. The name decides the
// kind: "Templates semanales..." or any name with "semanal" is weekly;
// "Audiovisuales - Resueltas mes..." or any name with the word "mes" is
// monthly. When several files match, the newest one wins.
function clasificarTemplate(nombre) {
  const texto = String(nombre || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (texto.startsWith('templates semanales') || /semanal/.test(texto)) return 'SEMANAL';
  if (/^audiovisuales\s*-\s*resuelta/.test(texto) || /\bmes\b/.test(texto)) return 'MENSUAL';
  return null;
}

function buscarTemplate(tipo) {
  const archivos = DriveApp.getFolderById(ID_CARPETA_TEMPLATES).getFilesByType(MimeType.GOOGLE_SHEETS);
  let elegido = null;
  while (archivos.hasNext()) {
    const archivo = archivos.next();
    if (clasificarTemplate(archivo.getName()) !== tipo) continue;
    if (!elegido || archivo.getLastUpdated() > elegido.getLastUpdated()) elegido = archivo;
  }
  return elegido;
}

function buscarTemplatesMensuales() {
  const archivos = DriveApp.getFolderById(ID_CARPETA_TEMPLATES).getFilesByType(MimeType.GOOGLE_SHEETS);
  const mensuales = [];
  while (archivos.hasNext()) {
    const archivo = archivos.next();
    if (clasificarTemplate(archivo.getName()) === 'MENSUAL') mensuales.push(archivo);
  }
  return mensuales;
}

function buscarTemplateSemanal() {
  return buscarTemplate('SEMANAL');
}

// ==========================================
// 📅 PROCESAR MES
// ==========================================
// Counts the monthly export ("Resueltas mes anterior") into the month rows of
// the five trend tabs. The mapping was checked against the weekly template:
// weeks 37-39 of September 2026 match type by type.
//   Grupo SOPORTE WEBEX                        -> Remotos
//   Modulo SOPORTE PROGRAMADO                  -> Programados
//   Modulo SOPORTE PRESENCIAL                  -> Presenciales
//   Modulo MANTENIMIENTO CORRECTIVO            -> Correctivos
//   Modulo MANTENIMIENTO (preventive)          -> not counted
//   any other Modulo of AUDIOVISUALES          -> Incidencias
// A month that already has a different value is only overwritten after
// confirming it, so an incomplete export never replaces good data silently.
const MESES_TENDENCIA = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function tipoMensualDeTicket(grupo, modulo) {
  const normalizar = (texto) => String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
  const g = normalizar(grupo);
  const m = normalizar(modulo);
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

  // The month is the one most tickets were closed in.
  // Dates are read in the export's own time zone. The script project may use
  // another one, which moved the evening closures of 30 September to October.
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
  let dias = {};
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

// Processes every monthly export in the folder, one month each, so August and
// September can be loaded together. Two exports of the same month: the newest wins.
function semanaIso(anio, mes, dia) {
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  const diaSemana = fecha.getUTCDay() || 7;
  fecha.setUTCDate(fecha.getUTCDate() + 4 - diaSemana);
  const inicio = new Date(Date.UTC(fecha.getUTCFullYear(), 0, 1));
  return Math.ceil(((fecha - inicio) / 86400000 + 1) / 7);
}

// ISO weeks whose seven days fall inside the month: only those can be compared
// one to one with the weekly totals of Tendencias.
function semanasCompletasDelMes(anio, mes) {
  const semanas = [];
  const diasMes = new Date(anio, mes + 1, 0).getDate();
  for (let dia = 1; dia <= diasMes; dia++) {
    const fecha = new Date(Date.UTC(anio, mes, dia));
    if ((fecha.getUTCDay() || 7) === 1 && dia + 6 <= diasMes) semanas.push(semanaIso(anio, mes + 1, dia));
  }
  return semanas;
}

// Compares the monthly export week by week with Tendencias. The export counts
// every remote category, Tendencias only five, so small Remotos gaps are normal.
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

    const ss = SpreadsheetApp.getActiveSpreadsheet();
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
      });
    });
    SpreadsheetApp.flush();

    const archivoTxt = escribirPlanoTxt();
    const nombres = meses.map((mes) => MESES_TENDENCIA[mes]).join(' y ');
    ui.alert('Procesar mes', `${nombres} escrito en Tendencias.\nGuardado "${archivoTxt.getName()}" en la carpeta.`, ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('Procesar mes', e.message, ui.ButtonSet.OK);
  }
}

// Writes one week of the template into Tendencias. The detail tabs (7 to 10)
// only carry the template's last week, so the resolution rows are written only
// when conDetalle is true; earlier weeks get locations and Remotos categories.
function importarSemana(origenSs, destinoSs, semana, conDetalle) {
    let resumenImportacion = '';
    const numSemanaGlobal = semana;

    const obtenerHojaPorNombre = (ss, fragmento) => {
      const hojas = ss.getSheets();
      for (let i = 0; i < hojas.length; i++) {
        if (hojas[i].getName().includes(fragmento)) return hojas[i];
      }
      return null;
    };

    const normalizarTexto = (texto) => {
      return String(texto).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
    };

    const valorOBlanco = (val) => (val > 0 ? val : "");

    const obtenerNumeroSemana = (valor) => {
      const num = Number(valor);
      return (!isNaN(num) && num > 0 && num <= 53) ? num : null;
    };

    const obtenerColumnaSemanaObjetivo = (hoja, filaCabecera, colTotal, numSemanaObjetivo, nombreHoja) => {
      const objetivo = Number(numSemanaObjetivo);
      // Read the second header row once: a getValue per column took minutes.
      const fila2 = colTotal > 1 ? hoja.getRange(2, 1, 1, colTotal - 1).getValues()[0] : [];

      for (let col = 1; col < colTotal; col++) {
        const semanaFila1 = obtenerNumeroSemana(filaCabecera[col - 1]);
        if (semanaFila1 === objetivo) return col;

        const semanaFila2 = obtenerNumeroSemana(fila2[col - 1]);
        if (semanaFila2 === objetivo) return col;
      }

      return -1;
    };

    // 1. REMOTOS
    const hojaOrigenRemotos = obtenerHojaPorNombre(origenSs, '1-Soporte Remoto');
    if (!hojaOrigenRemotos) throw new Error('No se encontró la pestaña de "1-Soporte Remoto".');

    const fila1Rem = hojaOrigenRemotos.getRange("A1:ZZ1").getValues()[0];
    let colTotalRem = -1;
    for (let i = 0; i < fila1Rem.length; i++) {
      if (String(fila1Rem[i]).toUpperCase().trim() === 'TOTAL') { colTotalRem = i + 1; break; }
    }
    if (colTotalRem === -1) throw new Error('No se encontró "Total" en la primera fila de Remotos.');

    const colDatosRem = obtenerColumnaSemanaObjetivo(hojaOrigenRemotos, fila1Rem, colTotalRem, semana, 'Remotos');
    const numSemana = semana;

    // The template sorts categories by yearly volume, so their rows move: read them by label.
    const datosRemOrigen = hojaOrigenRemotos.getDataRange().getValues();
    const valorRemoto = (etiqueta) => {
      if (colDatosRem < 0) return 0;
      for (let f = 0; f < datosRemOrigen.length; f++) {
        if (normalizarTexto(datosRemOrigen[f][0]) === etiqueta) return Number(datosRemOrigen[f][colDatosRem - 1]) || 0;
      }
      return 0;
    };
    const valErrores = valorRemoto('ERRORES');
    const valOperativa = valorRemoto('OPERATIVA');
    const valConexion = valorRemoto('CONEXION');
    const valVideo = valorRemoto('VIDEO');
    const valBlueBranch = valorRemoto('BLUE BRANCH');

    const hojaDestinoRem = destinoSs.getSheetByName('Remotos');
    const colDestinoRem = Number(numSemana) + 1;

    hojaDestinoRem.getRange(5, colDestinoRem).setValue(numSemana);
    hojaDestinoRem.getRange(12, colDestinoRem).setValue(numSemana);
    hojaDestinoRem.getRange(13, colDestinoRem).setValue(valorOBlanco(valErrores));
    hojaDestinoRem.getRange(14, colDestinoRem).setValue(valorOBlanco(valConexion));
    hojaDestinoRem.getRange(15, colDestinoRem).setValue(valorOBlanco(valOperativa));
    hojaDestinoRem.getRange(16, colDestinoRem).setValue(valorOBlanco(valBlueBranch));
    hojaDestinoRem.getRange(17, colDestinoRem).setValue(valorOBlanco(valVideo));

    resumenImportacion += `✅ REMOTOS: Completado.\n`;

    // 2. PROGRAMADOS UBICACIONES
    const hojaOrigenProg = obtenerHojaPorNombre(origenSs, '2-Soporte Programado');
    if (!hojaOrigenProg) throw new Error('No se encontró "2-Soporte Programado".');

    const fila1Prog = hojaOrigenProg.getRange("A1:ZZ1").getValues()[0];
    let colTotalProg = -1;
    for (let i = 0; i < fila1Prog.length; i++) {
      if (String(fila1Prog[i]).toUpperCase().trim() === 'TOTAL') { colTotalProg = i + 1; break; }
    }
    if (colTotalProg === -1) throw new Error('No se encontró "Total" en la primera fila de Programados.');

    const colDatosProg = obtenerColumnaSemanaObjetivo(hojaOrigenProg, fila1Prog, colTotalProg, numSemanaGlobal, 'Programados');
    const datosProgOrigen = hojaOrigenProg.getDataRange().getValues();

    let valoresProg = { 'CIUDAD': "", 'CAMPUS': "", 'VELA': "", 'TERRITORIOS': "", 'RECOLETOS': "", 'TABLAS': "" };

    for (let f = 0; colDatosProg > 0 && f < datosProgOrigen.length; f++) {
      const textoColA = normalizarTexto(datosProgOrigen[f][0]);
      const textoColB = normalizarTexto(datosProgOrigen[f][1]);
      for (let ubicacion in valoresProg) {
        if (textoColA === ubicacion || textoColB === ubicacion) {
          valoresProg[ubicacion] = valorOBlanco(Number(datosProgOrigen[f][colDatosProg - 1]));
        }
      }
    }

    const hojaDestinoProg = destinoSs.getSheetByName('Programados');
    const colDestinoProg = Number(numSemanaGlobal) + 3;

    hojaDestinoProg.getRange(19, colDestinoProg).setValue(numSemanaGlobal);
    hojaDestinoProg.getRange(26, colDestinoProg).setValue(numSemanaGlobal);

    const filasDestinoProg = { 'CIUDAD': 27, 'CAMPUS': 28, 'VELA': 29, 'TERRITORIOS': 30, 'RECOLETOS': 31, 'TABLAS': 32 };
    for (let ubicacion in filasDestinoProg) {
      hojaDestinoProg.getRange(filasDestinoProg[ubicacion], colDestinoProg).setValue(valoresProg[ubicacion]);
    }

    if (conDetalle) {
      // 3. PROGRAMADOS RESOLUCIONES
      const hojaOrigenProgRes = obtenerHojaPorNombre(origenSs, '7-Soporte Programado');
      if (!hojaOrigenProgRes) throw new Error('No se encontró "7-Soporte Programado - Detalle".');

      const datosProgRes = hojaOrigenProgRes.getDataRange().getValues();

      const filasProgRes = {
        'SALA|PREPARACION SALA': 5, 'SALA|PRESTAMO': 6, 'WEBEX|CONEXION': 7,
        'WEBEX|SEMINARIO WEB': 8, 'WEBEX|TRADUCCION': 9, 'MEET|CONEXION': 10,
        'MEET|TRADUCCION': 11, 'OTRAS VC|CONEXION': 12
      };

      let valoresProgRes = {};
      for (let key in filasProgRes) valoresProgRes[key] = "";
      let lastTier2Prog = "";

      for (let f = 1; f < datosProgRes.length; f++) {
        let valA = normalizarTexto(datosProgRes[f][0]);
        if (valA === 'TOTAL') break;
        let valB = normalizarTexto(datosProgRes[f][1]);
        let valC = normalizarTexto(datosProgRes[f][2]);
        let valD = Number(datosProgRes[f][3]);
        if (valB !== "") lastTier2Prog = valB;
        let llave = lastTier2Prog + "|" + valC;
        if (filasProgRes[llave] !== undefined) valoresProgRes[llave] = valorOBlanco(valD);
      }

      for (let key in filasProgRes) {
        hojaDestinoProg.getRange(filasProgRes[key], colDestinoProg).setValue(valoresProgRes[key]);
      }

      // CÁLCULO DEL PARCHE EN MEMORIA (Evita leer fórmulas de la hoja para que nunca falle)
      let totalUbicProg = Object.values(valoresProg).reduce((acc, val) => acc + (Number(val) || 0), 0);
      let totalResProg = Object.values(valoresProgRes).reduce((acc, val) => acc + (Number(val) || 0), 0);
      let difProg = totalUbicProg - totalResProg;

      if (difProg !== 0) {
        let valActualProg = Number(valoresProgRes['SALA|PREPARACION SALA']) || 0;
        hojaDestinoProg.getRange(5, colDestinoProg).setValue(valorOBlanco(valActualProg + difProg));
        resumenImportacion += `✅ PROGRAMADOS: Completado (Ajuste: ${difProg > 0 ? '+' : ''}${difProg} en SALA|PREPARACION SALA).\n`;
      } else {
        resumenImportacion += `✅ PROGRAMADOS: Completado.\n`;
      }
    } else {
      resumenImportacion += `✅ PROGRAMADOS: ubicaciones (sin detalle de resolución).\n`;
    }

    // 4. PRESENCIALES UBICACIONES
    const hojaOrigenPres = obtenerHojaPorNombre(origenSs, '3-Soporte Presencial');
    if (!hojaOrigenPres) throw new Error('No se encontró "3-Soporte Presencial".');

    const fila1Pres = hojaOrigenPres.getRange("A1:ZZ1").getValues()[0];
    let colTotalPres = -1;
    for (let i = 0; i < fila1Pres.length; i++) {
      if (String(fila1Pres[i]).toUpperCase().trim() === 'TOTAL') { colTotalPres = i + 1; break; }
    }
    if (colTotalPres === -1) throw new Error('No se encontró "Total" en la primera fila de Presenciales.');

    const colDatosPres = obtenerColumnaSemanaObjetivo(hojaOrigenPres, fila1Pres, colTotalPres, numSemanaGlobal, 'Presenciales');
    const datosPresOrigen = hojaOrigenPres.getDataRange().getValues();
    let valoresPres = { 'TERRITORIOS': "", 'CIUDAD': "", 'CAMPUS': "", 'RECOLETOS': "", 'TABLAS': "", 'VELA': "" };

    for (let f = 0; colDatosPres > 0 && f < datosPresOrigen.length; f++) {
      const textoColA = normalizarTexto(datosPresOrigen[f][0]);
      const textoColB = normalizarTexto(datosPresOrigen[f][1]);
      for (let ubicacion in valoresPres) {
        if (textoColA === ubicacion || textoColB === ubicacion) {
          valoresPres[ubicacion] = valorOBlanco(Number(datosPresOrigen[f][colDatosPres - 1]));
        }
      }
    }

    const hojaDestinoPres = destinoSs.getSheetByName('Presenciales');
    const colDestinoPres = Number(numSemanaGlobal) + 3;

    hojaDestinoPres.getRange(21, colDestinoPres).setValue(numSemanaGlobal);
    hojaDestinoPres.getRange(28, colDestinoPres).setValue(numSemanaGlobal);

    const filasDestinoPres = { 'TERRITORIOS': 29, 'CIUDAD': 30, 'CAMPUS': 31, 'RECOLETOS': 32, 'TABLAS': 33, 'VELA': 34 };
    for (let ubicacion in filasDestinoPres) {
      hojaDestinoPres.getRange(filasDestinoPres[ubicacion], colDestinoPres).setValue(valoresPres[ubicacion]);
    }

    if (conDetalle) {
      // 5. PRESENCIALES RESOLUCIONES
      const hojaOrigenPresRes = obtenerHojaPorNombre(origenSs, '8-Soporte Presencial');
      if (!hojaOrigenPresRes) throw new Error('No se encontró la pestaña "8-Soporte Presencial".');

      const datosPresRes = hojaOrigenPresRes.getDataRange().getValues();

      const filasPresRes = {
        'SALA|PREPARACION SALA': 5, 'SALA|DES/INSTALACION': 6, 'SALA|DES/MONTAJE': 7,
        'SALA|ENCENDIDO/APAGADO': 8, 'SALA|EVENTO': 9, 'SALA|ETIQUETADO': 10,
        'WEBEX|CONEXION': 11, 'WEBEX|TRADUCCION': 12, 'OTRAS VC|CONEXION': 13, 'MEET|CONEXION': 14
      };

      let valoresPresRes = {};
      for (let key in filasPresRes) valoresPresRes[key] = 0;
      let lastTier2Pres = "";

      for (let f = 1; f < datosPresRes.length; f++) {
        let valA = normalizarTexto(datosPresRes[f][0]);
        if (valA === 'TOTAL') break;
        let valB = normalizarTexto(datosPresRes[f][1]);
        let valC = normalizarTexto(datosPresRes[f][2]);
        let valD = Number(datosPresRes[f][3]) || 0;
        if (valB !== "") {
          if (valB === "SALAS") valB = "SALA";
          lastTier2Pres = valB;
        }
        if (lastTier2Pres === "SALA" && valC === "") valC = "DES/INSTALACION";
        let llave = lastTier2Pres + "|" + valC;
        if (filasPresRes[llave] !== undefined) valoresPresRes[llave] += valD;
      }

      for (let key in filasPresRes) {
        hojaDestinoPres.getRange(filasPresRes[key], colDestinoPres).setValue(valorOBlanco(valoresPresRes[key]));
      }

      // CÁLCULO DEL PARCHE EN MEMORIA PRESENCIALES
      let totalUbicPres = Object.values(valoresPres).reduce((acc, val) => acc + (Number(val) || 0), 0);
      let totalResPres = Object.values(valoresPresRes).reduce((acc, val) => acc + (Number(val) || 0), 0);
      let difPres = totalUbicPres - totalResPres;

      if (difPres !== 0) {
        let valActualPres = Number(valoresPresRes['SALA|DES/MONTAJE']) || 0;
        hojaDestinoPres.getRange(7, colDestinoPres).setValue(valorOBlanco(valActualPres + difPres));
        resumenImportacion += `✅ PRESENCIALES: Completado (Ajuste: ${difPres > 0 ? '+' : ''}${difPres} en SALA|DES/MONTAJE).\n`;
      } else {
        resumenImportacion += `✅ PRESENCIALES: Completado.\n`;
      }
    } else {
      resumenImportacion += `✅ PRESENCIALES: ubicaciones (sin detalle de resolución).\n`;
    }

    // 6. INCIDENCIAS UBICACIONES
    const hojaOrigenInc = obtenerHojaPorNombre(origenSs, '4-Incidencias por semanas');
    if (!hojaOrigenInc) throw new Error('No se encontró "4-Incidencias por semanas".');

    const fila1Inc = hojaOrigenInc.getRange("A1:ZZ1").getValues()[0];
    let colTotalInc = -1;
    for (let i = 0; i < fila1Inc.length; i++) {
      if (String(fila1Inc[i]).toUpperCase().trim() === 'TOTAL') { colTotalInc = i + 1; break; }
    }
    if (colTotalInc === -1) throw new Error('No se encontró "Total" en la primera fila de Incidencias.');

    const colDatosInc = obtenerColumnaSemanaObjetivo(hojaOrigenInc, fila1Inc, colTotalInc, numSemanaGlobal, 'Incidencias');
    const datosIncOrigen = hojaOrigenInc.getDataRange().getValues();
    let valoresInc = { 'CIUDAD': "", 'TERRITORIOS': "", 'CAMPUS': "", 'RECOLETOS': "", 'TABLAS': "", 'VELA': "" };

    for (let f = 0; colDatosInc > 0 && f < datosIncOrigen.length; f++) {
      const textoColA = normalizarTexto(datosIncOrigen[f][0]);
      const textoColB = normalizarTexto(datosIncOrigen[f][1]);
      for (let ubicacion in valoresInc) {
        if (textoColA === ubicacion || textoColB === ubicacion) {
          valoresInc[ubicacion] = valorOBlanco(Number(datosIncOrigen[f][colDatosInc - 1]));
        }
      }
    }

    const hojaDestinoInc = destinoSs.getSheetByName('Incidencias');
    const colDestinoInc = Number(numSemanaGlobal) + 3;

    hojaDestinoInc.getRange(41, colDestinoInc).setValue(numSemanaGlobal);
    hojaDestinoInc.getRange(48, colDestinoInc).setValue(numSemanaGlobal);

    const filasDestinoInc = { 'CIUDAD': 49, 'TERRITORIOS': 50, 'CAMPUS': 51, 'RECOLETOS': 52, 'VELA': 53, 'TABLAS': 54 };
    for (let ubicacion in filasDestinoInc) {
      hojaDestinoInc.getRange(filasDestinoInc[ubicacion], colDestinoInc).setValue(valoresInc[ubicacion]);
    }

    if (conDetalle) {
      // 7. INCIDENCIAS RESOLUCIONES
      const hojaOrigenIncRes = obtenerHojaPorNombre(origenSs, '9-Incidencias');
      if (!hojaOrigenIncRes) throw new Error('No se encontró la pestaña "9-Incidencias".');

      const datosIncRes = hojaOrigenIncRes.getDataRange().getValues();
      const filasIncResExactas = {
        'WEBEX|CONEXION': 6, 'WEBEX|FORMACION': 7, 'WEBEX|GESTION': 8,
        'CABLEADO|PRESTAMO': 10, 'CABLEADO|SANEADO': 11, 'CABLEADO|SUSTITUCION': 12,
        'PC\\PORTATIL|CONFIGURACION': 14, 'PC/PORTATIL|CONFIGURACION': 14,
        'PC\\PORTATIL|FORMACION': 15, 'PC/PORTATIL|FORMACION': 15,
        'DOMOTICA|CONFIGURACION': 17, 'DOMOTICA|FORMACION': 18, 'DOMOTICA|REINICIO': 19, 'DOMOTICA|SUSTITUCION': 20,
        'MEET|CONEXION': 22, 'MEET|FORMACION': 23
      };
      const filasIncResSuma = {
        'EQUIPO VIDEO': 24, 'EQUIPO DE VIDEO': 24, 'MONITOR': 25, 'EQUIPO AUDIO': 26,
        'VC. CISCO': 27, 'VC CISCO': 27, 'PERIFERICO PC': 28, 'OTRAS VC': 29,
        'PROYECTOR': 30, 'TRADUCCION': 31, 'ROOMWIZARD\\QR': 32, 'ROOMWIZARD/QR': 32, 'VIDEO WALL': 33, 'VIDEOWALL': 33
      };

      let valoresIncRes = {};
      let lastTier2Inc = "";

      for (let f = 1; f < datosIncRes.length; f++) {
        let valA = normalizarTexto(datosIncRes[f][0]);
        if (valA === 'TOTAL') break;
        let valB = normalizarTexto(datosIncRes[f][1]);
        let valC = normalizarTexto(datosIncRes[f][2]);
        let valD = Number(datosIncRes[f][3]) || 0;
        if (valB !== "") lastTier2Inc = valB;
        let llaveExacta = lastTier2Inc + "|" + valC;
        let filaDestino = filasIncResExactas[llaveExacta] || filasIncResSuma[lastTier2Inc];
        if (filaDestino) valoresIncRes[filaDestino] = (valoresIncRes[filaDestino] || 0) + valD;
      }

      const todasLasFilasIncRes = [6,7,8, 10,11,12, 14,15, 17,18,19,20, 22,23, 24,25,26,27,28,29,30,31,32,33];
      for (let i = 0; i < todasLasFilasIncRes.length; i++) {
        hojaDestinoInc.getRange(todasLasFilasIncRes[i], colDestinoInc).setValue(valorOBlanco(valoresIncRes[todasLasFilasIncRes[i]] || 0));
      }

      // CÁLCULO DEL PARCHE EN MEMORIA INCIDENCIAS
      let totalUbicInc = Object.values(valoresInc).reduce((acc, val) => acc + (Number(val) || 0), 0);
      let totalResInc = Object.values(valoresIncRes).reduce((acc, val) => acc + (Number(val) || 0), 0);
      let difInc = totalUbicInc - totalResInc;

      if (difInc !== 0) {
        let valActualInc = Number(valoresIncRes[11]) || 0;
        hojaDestinoInc.getRange(11, colDestinoInc).setValue(valorOBlanco(valActualInc + difInc));
        resumenImportacion += `✅ INCIDENCIAS: Completado (Ajuste: ${difInc > 0 ? '+' : ''}${difInc} en CABLEADO|SANEADO).\n`;
      } else {
        resumenImportacion += `✅ INCIDENCIAS: Completado.\n`;
      }
    } else {
      resumenImportacion += `✅ INCIDENCIAS: ubicaciones (sin detalle de resolución).\n`;
    }

    // 8. CORRECTIVOS UBICACIONES
    const hojaOrigenCorr = obtenerHojaPorNombre(origenSs, '6-Mantenimientos correctivos po');
    if (!hojaOrigenCorr) throw new Error('No se encontró "6-Mantenimientos correctivos po".');

    const fila1Corr = hojaOrigenCorr.getRange("A1:ZZ1").getValues()[0];
    let colTotalCorr = -1;
    for (let i = 0; i < fila1Corr.length; i++) {
      if (String(fila1Corr[i]).toUpperCase().trim() === 'TOTAL') { colTotalCorr = i + 1; break; }
    }
    if (colTotalCorr === -1) throw new Error('No se encontró "Total" en la primera fila de Correctivos.');

    const colDatosCorr = obtenerColumnaSemanaObjetivo(hojaOrigenCorr, fila1Corr, colTotalCorr, numSemanaGlobal, 'Correctivos');
    const datosCorrOrigen = hojaOrigenCorr.getDataRange().getValues();
    let valoresCorr = { 'CIUDAD': "", 'TERRITORIOS': "", 'CAMPUS': "", 'RECOLETOS': "", 'TABLAS': "", 'VELA': "" };

    for (let f = 0; colDatosCorr > 0 && f < datosCorrOrigen.length; f++) {
      const textoColA = normalizarTexto(datosCorrOrigen[f][0]);
      const textoColB = normalizarTexto(datosCorrOrigen[f][1]);
      for (let ubicacion in valoresCorr) {
        if (textoColA === ubicacion || textoColB === ubicacion) {
          valoresCorr[ubicacion] = valorOBlanco(Number(datosCorrOrigen[f][colDatosCorr - 1]));
        }
      }
    }

    const hojaDestinoCorr = destinoSs.getSheetByName('Correctivos');
    const colDestinoCorr = Number(numSemanaGlobal) + 3;

    hojaDestinoCorr.getRange(37, colDestinoCorr).setValue(numSemanaGlobal);
    hojaDestinoCorr.getRange(44, colDestinoCorr).setValue(numSemanaGlobal);

    const filasDestinoCorr = { 'CIUDAD': 45, 'TERRITORIOS': 46, 'CAMPUS': 47, 'RECOLETOS': 48, 'VELA': 49, 'TABLAS': 50 };
    for (let ubicacion in filasDestinoCorr) {
      hojaDestinoCorr.getRange(filasDestinoCorr[ubicacion], colDestinoCorr).setValue(valoresCorr[ubicacion]);
    }

    if (conDetalle) {
      // 9. CORRECTIVOS RESOLUCIONES
      const hojaOrigenCorrRes = obtenerHojaPorNombre(origenSs, '10-Mantenimientos correctivos');
      if (!hojaOrigenCorrRes) throw new Error('No se encontró "10-Mantenimientos correctivos".');

      const datosCorrRes = hojaOrigenCorrRes.getDataRange().getValues();

      const filasCorrResExactas = {
        'ALMACEN|INVENTARIO': 6, 'ALMACEN|TRASLADO': 7,
        'CABLEADO|SANEADO': 9, 'CABLEADO|SUSTITUCION': 10,
        'PC\\PORTATIL|CONFIGURACION': 12, 'PC/PORTATIL|CONFIGURACION': 12,
        'PC\\PORTATIL|REINICIO': 13, 'PC/PORTATIL|REINICIO': 13,
        'PC\\PORTATIL|SUSTITUCION': 14, 'PC/PORTATIL|SUSTITUCION': 14,
        'EQUIPO AUDIO|CONFIGURACION': 16, 'EQUIPO AUDIO|REINICIO': 17, 'EQUIPO AUDIO|SUSTITUCION': 18,
        'EQUIPO VIDEO|CONFIGURACION': 20, 'EQUIPO VIDEO|REINICIO': 21, 'EQUIPO VIDEO|SUSTITUCION': 22
      };

      const filasCorrResSuma = {
        'PERIFERICO PC': 23, 'MONITOR': 24, 'DOMOTICA': 25,
        'VIDEO WALL': 26, 'VIDEOWALL': 26, 'PROYECTOR': 27,
        'VC. CISCO': 28, 'VC CISCO': 28, 'VC USB': 29, 'VC.USB': 29,
        'ROOMWIZARD\\QR': 30, 'ROOMWIZARD/QR': 30
      };

      let valoresCorrRes = {};
      let lastTier2Corr = "";

      for (let f = 1; f < datosCorrRes.length; f++) {
        let valA = normalizarTexto(datosCorrRes[f][0]);
        if (valA === 'TOTAL') break;
        let valB = normalizarTexto(datosCorrRes[f][1]);
        let valC = normalizarTexto(datosCorrRes[f][2]);
        let valD = Number(datosCorrRes[f][3]) || 0;
        if (valB !== "") lastTier2Corr = valB;
        let llaveExacta = lastTier2Corr + "|" + valC;
        let filaDestino = filasCorrResExactas[llaveExacta] || filasCorrResSuma[lastTier2Corr];
        if (filaDestino) valoresCorrRes[filaDestino] = (valoresCorrRes[filaDestino] || 0) + valD;
      }

      const todasLasFilasCorrRes = [6,7, 9,10, 12,13,14, 16,17,18, 20,21,22, 23,24,25,26,27,28,29,30];
      for (let i = 0; i < todasLasFilasCorrRes.length; i++) {
        hojaDestinoCorr.getRange(todasLasFilasCorrRes[i], colDestinoCorr).setValue(valorOBlanco(valoresCorrRes[todasLasFilasCorrRes[i]] || 0));
      }

      // CÁLCULO DEL PARCHE EN MEMORIA CORRECTIVOS
      let totalUbicCorr = Object.values(valoresCorr).reduce((acc, val) => acc + (Number(val) || 0), 0);
      let totalResCorr = Object.values(valoresCorrRes).reduce((acc, val) => acc + (Number(val) || 0), 0);
      let difCorr = totalUbicCorr - totalResCorr;

      if (difCorr !== 0) {
        let valActualCorr = Number(valoresCorrRes[16]) || 0;
        hojaDestinoCorr.getRange(16, colDestinoCorr).setValue(valorOBlanco(valActualCorr + difCorr));
        resumenImportacion += `✅ CORRECTIVOS: Completado (Ajuste: ${difCorr > 0 ? '+' : ''}${difCorr} en EQUIPO AUDIO|CONFIGURACION).\n`;
      } else {
        resumenImportacion += `✅ CORRECTIVOS: Completado.\n`;
      }
    } else {
      resumenImportacion += `✅ CORRECTIVOS: ubicaciones (sin detalle de resolución).\n`;
    }

    return resumenImportacion;
}

// Rows that hold the weekly totals of each trend tab, and the column offset
// between a week number and its column.
const BLOQUES_SEMANALES = [
  { hoja: 'Remotos', filas: [13, 17], desplazamiento: 1 },
  { hoja: 'Programados', filas: [27, 32], desplazamiento: 3 },
  { hoja: 'Presenciales', filas: [29, 34], desplazamiento: 3 },
  { hoja: 'Incidencias', filas: [49, 54], desplazamiento: 3 },
  { hoja: 'Correctivos', filas: [45, 50], desplazamiento: 3 }
];

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

// Fills every week of the template that is still empty in Tendencias. Weeks
// that already have tickets are left as they are.
function importarDatosSemanales() {
  const ui = SpreadsheetApp.getUi();

  try {
    const archivo = buscarTemplateSemanal();
    if (!archivo) {
      ui.alert('Sin template', 'No hay un template semanal en formato Google Sheets en la carpeta de templates.', ui.ButtonSet.OK);
      return;
    }

    const origenSs = SpreadsheetApp.openById(archivo.getId());
    const destinoSs = SpreadsheetApp.getActiveSpreadsheet();
    const semanas = semanasDelTemplate(origenSs);
    if (semanas.length === 0) throw new Error('El template no tiene semanas.');
    const ultima = semanas[semanas.length - 1];
    const pendientes = semanas.filter((semana) => !semanaConDatos(destinoSs, semana));

    if (pendientes.length === 0) {
      // Nothing new in the template, but a week may still lack its detail.
      const recuperadas = recuperarDetalleDesdeHistorico(destinoSs);
      const avisos = revisarSemanas(destinoSs, ultima);
      let texto = `Tendencias ya tiene todas las semanas del template (hasta la ${ultima}).`;
      if (recuperadas.length > 0) texto += '\n\nRecuperado del histórico:\n' + recuperadas.join('\n');
      if (avisos.length > 0) texto += '\n\nRevisar:\n' + avisos.join('\n');
      if (recuperadas.length > 0) {
        SpreadsheetApp.flush();
        volcarDatosLookerStudio();
        texto += `\n\nTXT: ${escribirPlanoTxt(ultima).getName()}`;
      }
      ui.alert('AV Weekly', texto, ui.ButtonSet.OK);
      return;
    }

    let aviso = `Template "${archivo.getName()}" (semanas hasta la ${ultima}).\n\n` +
      `Semanas vacías en Tendencias que se van a rellenar: ${pendientes.join(', ')}.`;
    if (pendientes.some((semana) => semana !== ultima)) {
      aviso += `\n\nEl detalle de resolución solo existe para la semana ${ultima}; las demás llevan ubicaciones y categorías de Remotos.`;
    }
    if (ui.alert('Procesar semana', aviso + '\n\n¿Continuar?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

    let resumen = '';
    pendientes.forEach((semana) => {
      resumen += `Semana ${semana}\n` + importarSemana(origenSs, destinoSs, semana, semana === ultima) + '\n';
    });
    SpreadsheetApp.flush();

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

// Rows of each resolution block and the category/action they stand for. Shared
// by the TXT dump and by the recovery of missing weeks from archived TXTs.
const CONF_RESOLUCION_AV = [
  {
    hoja: 'Remotos', fSem: 5, tipo: 'REMOTO',
    filas: { 13:['REMOTO','ERRORES'], 14:['REMOTO','CONEXION'], 15:['REMOTO','OPERATIVA'], 16:['REMOTO','BLUE BRANCH'], 17:['REMOTO','VIDEO'] }
  },
  {
    hoja: 'Programados', fSem: 19, tipo: 'PROGRAMADO',
    filas: {
      5:['SALA','PREPARACION SALA'], 6:['SALA','PRESTAMO'], 7:['WEBEX','CONEXION'],
      8:['WEBEX','SEMINARIO WEB'], 9:['WEBEX','TRADUCCION'], 10:['MEET','CONEXION'],
      11:['MEET','TRADUCCION'], 12:['OTRAS VC','CONEXION']
    }
  },
  {
    hoja: 'Presenciales', fSem: 21, tipo: 'PRESENCIAL',
    filas: {
      5:['SALA','PREPARACION SALA'], 6:['SALA','DES/INSTALACION'], 7:['SALA','DES/MONTAJE'],
      8:['SALA','ENCENDIDO/APAGADO'], 9:['SALA','EVENTO'], 10:['SALA','ETIQUETADO'],
      11:['WEBEX','CONEXION'], 12:['WEBEX','TRADUCCION'], 13:['OTRAS VC','CONEXION'], 14:['MEET','CONEXION']
    }
  },
  {
    hoja: 'Incidencias', fSem: 41, tipo: 'INCIDENCIA',
    filas: {
      6:['WEBEX','CONEXION'], 7:['WEBEX','FORMACION'], 8:['WEBEX','GESTION'],
      10:['CABLEADO','PRESTAMO'], 11:['CABLEADO','SANEADO'], 12:['CABLEADO','SUSTITUCION'],
      14:['PC/PORTATIL','CONFIGURACION'], 15:['PC/PORTATIL','FORMACION'],
      17:['DOMOTICA','CONFIGURACION'], 18:['DOMOTICA','FORMACION'], 19:['DOMOTICA','REINICIO'], 20:['DOMOTICA','SUSTITUCION'],
      22:['MEET','CONEXION'], 23:['MEET','FORMACION'],
      24:['EQUIPO VIDEO','EQUIPO VIDEO'], 25:['MONITOR','MONITOR'], 26:['EQUIPO AUDIO','EQUIPO AUDIO'],
      27:['VC CISCO','VC CISCO'], 28:['PERIFERICO PC','PERIFERICO PC'], 29:['OTRAS VC','OTRAS VC'],
      30:['PROYECTOR','PROYECTOR'], 31:['TRADUCCION','TRADUCCION'],
      32:['ROOMWIZARD/QR','ROOMWIZARD/QR'], 33:['VIDEO WALL','VIDEO WALL']
    }
  },
  {
    hoja: 'Correctivos', fSem: 37, tipo: 'CORRECTIVO',
    filas: {
      6:['ALMACEN','INVENTARIO'], 7:['ALMACEN','TRASLADO'],
      9:['CABLEADO','SANEADO'], 10:['CABLEADO','SUSTITUCION'],
      12:['PC/PORTATIL','CONFIGURACION'], 13:['PC/PORTATIL','REINICIO'], 14:['PC/PORTATIL','SUSTITUCION'],
      16:['EQUIPO AUDIO','CONFIGURACION'], 17:['EQUIPO AUDIO','REINICIO'], 18:['EQUIPO AUDIO','SUSTITUCION'],
      20:['EQUIPO VIDEO','CONFIGURACION'], 21:['EQUIPO VIDEO','REINICIO'], 22:['EQUIPO VIDEO','SUSTITUCION'],
      23:['PERIFERICO PC','PERIFERICO PC'], 24:['MONITOR','MONITOR'], 25:['DOMOTICA','DOMOTICA'],
      26:['VIDEO WALL','VIDEO WALL'], 27:['PROYECTOR','PROYECTOR'], 28:['VC CISCO','VC CISCO'],
      29:['VC USB','VC USB'], 30:['ROOMWIZARD/QR','ROOMWIZARD/QR']
    }
  }
];

// ==========================================
// 📊 MOTOR DE EXPORTACIÓN A LOOKER STUDIO
// ==========================================
function volcarDatosLookerStudio() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let hojaUbicacion = ss.getSheetByName('Ubicacion');
  if (!hojaUbicacion) hojaUbicacion = ss.insertSheet('Ubicacion');
  hojaUbicacion.clearContents();

  let hojaResolucion = ss.getSheetByName('Resolucion');
  if (!hojaResolucion) hojaResolucion = ss.insertSheet('Resolucion');
  hojaResolucion.clearContents();

  const cabecerasUbicacion = ['Fecha', 'Semana', 'Tipo Soporte', 'Edificio', 'Tickets'];
  const cabecerasResolucion = ['Fecha', 'Semana', 'Tipo Soporte', 'Categoría', 'Acción', 'Tickets'];

  let datosUbicacion = [cabecerasUbicacion];
  let datosResolucion = [cabecerasResolucion];

  const getFechaLunesSemana = (semana) => {
    let fecha = new Date(2025, 11, 29);
    fecha.setDate(fecha.getDate() + ((semana - 1) * 7));
    let mes = String(fecha.getMonth() + 1).padStart(2, '0');
    let dia = String(fecha.getDate()).padStart(2, '0');
    return `${fecha.getFullYear()}-${mes}-${dia}`;
  };

  const CONF_UBICACION = [
    { hoja: 'Programados', fSem: 19, tipo: 'PROGRAMADO', filas: {27:'CIUDAD', 28:'CAMPUS', 29:'VELA', 30:'TERRITORIOS', 31:'RECOLETOS', 32:'TABLAS'} },
    { hoja: 'Presenciales', fSem: 28, tipo: 'PRESENCIAL', filas: {29:'TERRITORIOS', 30:'CIUDAD', 31:'CAMPUS', 32:'RECOLETOS', 33:'TABLAS', 34:'VELA'} },
    { hoja: 'Incidencias',  fSem: 41, tipo: 'INCIDENCIA', filas: {49:'CIUDAD', 50:'TERRITORIOS', 51:'CAMPUS', 52:'RECOLETOS', 53:'VELA', 54:'TABLAS'} },
    { hoja: 'Correctivos',  fSem: 37, tipo: 'CORRECTIVO', filas: {45:'CIUDAD', 46:'TERRITORIOS', 47:'CAMPUS', 48:'RECOLETOS', 49:'VELA', 50:'TABLAS'} }
  ];

  const CONF_RESOLUCION = CONF_RESOLUCION_AV;

  CONF_UBICACION.forEach(conf => {
    let hoja = ss.getSheetByName(conf.hoja);
    if (!hoja) return;
    let valoresRango = hoja.getRange(1, 1, hoja.getLastRow(), 55).getValues();
    for (let col = 3; col < 55; col++) {
      let numSemana = Number(valoresRango[conf.fSem - 1][col]);
      if (numSemana > 0) {
        let fecha = getFechaLunesSemana(numSemana);
        for (let fila in conf.filas) {
          let val = valoresRango[fila - 1][col];
          let tickets = (val === "") ? 0 : Number(val);
          datosUbicacion.push([fecha, numSemana, conf.tipo, conf.filas[fila], tickets]);
        }
      }
    }
  });

  CONF_RESOLUCION.forEach(conf => {
    let hoja = ss.getSheetByName(conf.hoja);
    if (!hoja) return;
    let valoresRango = hoja.getRange(1, 1, hoja.getLastRow(), 55).getValues();
    let inicioCol = (conf.tipo === 'REMOTO') ? 1 : 3;
    for (let col = inicioCol; col < 55; col++) {
      let numSemana = Number(valoresRango[conf.fSem - 1][col]);
      if (numSemana > 0) {
        let fecha = getFechaLunesSemana(numSemana);
        for (let fila in conf.filas) {
          let val = valoresRango[fila - 1][col];
          let tickets = (val === "") ? 0 : Number(val);
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

function columnaAIndice(letra) {
  var n = 0;
  var texto = String(letra || '').toUpperCase();
  for (var i = 0; i < texto.length; i++) {
    n = n * 26 + (texto.charCodeAt(i) - 64);
  }
  return n;
}

function anioInformeActual() {
  var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Remotos');
  if (!hoja) return new Date().getFullYear();
  var valor = Number(hoja.getRange(5, 1).getValue());
  return valor >= 2000 && valor <= 2100 ? valor : new Date().getFullYear();
}

function maxSemanaConDato() {
  var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Remotos');
  if (!hoja) return 0;
  var fila = hoja.getRange(5, 1, 1, 55).getValues()[0];
  var valores = hoja.getRange(6, 1, 1, 55).getValues()[0];
  var max = 0;
  for (var i = 0; i < fila.length; i++) {
    var semana = Number(fila[i]);
    var tickets = Number(valores[i]);
    if (semana >= 1 && semana <= 53 && tickets > 0) max = Math.max(max, semana);
  }
  return max;
}

function serializarPlanoAv(numSemana) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var anio = anioInformeActual();
  var semana = Number(numSemana) || maxSemanaConDato();
  var lineas = [
    'AV TEXTO PLANO v1',
    'semana\t' + semana,
    'anio\t' + anio,
    'generado\t' + new Date().toISOString(),
    'origen\tTendencias AV'
  ];

  var hojaUbicacion = ss.getSheetByName('Ubicacion');
  if (hojaUbicacion && hojaUbicacion.getLastRow() > 1) {
    lineas.push('', '[UBICACION]');
    var ubic = hojaUbicacion.getRange(2, 1, hojaUbicacion.getLastRow() - 1, 5).getValues();
    for (var i = 0; i < ubic.length; i++) {
      var semanaU = Number(ubic[i][1]);
      var tipoU = String(ubic[i][2] || '').trim();
      var edificio = String(ubic[i][3] || '').trim();
      var ticketsU = Number(ubic[i][4]);
      if (!semanaU || !tipoU || !edificio) continue;
      lineas.push([semanaU, tipoU, edificio, ticketsU].join('\t'));
    }
  }

  var hojaResolucion = ss.getSheetByName('Resolucion');
  if (hojaResolucion && hojaResolucion.getLastRow() > 1) {
    lineas.push('', '[RESOLUCION]');
    var reso = hojaResolucion.getRange(2, 1, hojaResolucion.getLastRow() - 1, 6).getValues();
    for (var r = 0; r < reso.length; r++) {
      var semanaR = Number(reso[r][1]);
      var tipoR = String(reso[r][2] || '').trim();
      var categoria = String(reso[r][3] || '').trim();
      var accion = String(reso[r][4] || '').trim();
      var ticketsR = Number(reso[r][5]);
      if (!semanaR || !tipoR) continue;
      lineas.push([semanaR, tipoR, categoria, accion, ticketsR].join('\t'));
    }
  }

  var tipoPorClave = {
    REMOTOS: 'REMOTO',
    PROGRAMADOS: 'PROGRAMADO',
    PRESENCIALES: 'PRESENCIAL',
    INCIDENCIAS: 'INCIDENCIA',
    CORRECTIVOS: 'CORRECTIVO'
  };
  lineas.push('', '[MENSUAL]');
  Object.keys(CONFIG_MENSUAL).forEach(function (clave) {
    var conf = CONFIG_MENSUAL[clave];
    var hoja = ss.getSheetByName(conf.hoja);
    if (!hoja) return;
    var colActual = columnaAIndice(conf.colActual);
    var colPasado = columnaAIndice(conf.colPasado);
    var tipo = tipoPorClave[clave];
    for (var mes = 0; mes < 12; mes++) {
      var fila = conf.rangoFilas[0] + mes;
      var actual = hoja.getRange(fila, colActual).getValue();
      var pasado = hoja.getRange(fila, colPasado).getValue();
      if (actual !== '' && actual !== null && !isNaN(Number(actual))) {
        lineas.push([anio, mes + 1, tipo, Number(actual)].join('\t'));
      }
      if (pasado !== '' && pasado !== null && !isNaN(Number(pasado))) {
        lineas.push([anio - 1, mes + 1, tipo, Number(pasado)].join('\t'));
      }
    }
  });

  lineas.push('', '[COMPARATIVA]');
  var hojasComp = [
    { hoja: 'Remotos', tipo: 'REMOTO' },
    { hoja: 'Programados', tipo: 'PROGRAMADO' },
    { hoja: 'Presenciales', tipo: 'PRESENCIAL' },
    { hoja: 'Incidencias', tipo: 'INCIDENCIA' },
    { hoja: 'Correctivos', tipo: 'CORRECTIVO' }
  ];
  var anioPasado = anio - 1;
  hojasComp.forEach(function (item) {
    var hoja = ss.getSheetByName(item.hoja);
    if (!hoja) return;
    var valores = hoja.getRange(1, 1, hoja.getLastRow(), 55).getValues();
    for (var fila = 0; fila < valores.length; fila++) {
      var marca = Number(valores[fila][0]);
      if (marca !== anioPasado) continue;
      var siguiente = valores[fila + 1] || [];
      for (var col = 1; col < valores[fila].length; col++) {
        var semanaC = Number(valores[fila][col]);
        if (semanaC < 1 || semanaC > 53) continue;
        var ticketsC = Number(siguiente[col]);
        if (isNaN(ticketsC)) continue;
        lineas.push([anioPasado, semanaC, item.tipo, ticketsC].join('\t'));
      }
      break;
    }
  });

  return lineas.join('\n') + '\n';
}

// Moves every earlier AV TXT of the output folder to the archive. A file with
// the same name as the new one gets the time it was archived in its name.
function archivarTxtAnteriores(folder, nombreNuevo) {
  var historico = DriveApp.getFolderById(ID_CARPETA_HISTORICO_TXT);
  var archivos = folder.getFiles();
  var sello = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH-mm');
  while (archivos.hasNext()) {
    var archivo = archivos.next();
    var nombre = archivo.getName();
    if (!/^AV \d{4}-S\d+.*\.txt$/.test(nombre)) continue;
    if (nombre === nombreNuevo) archivo.setName(nombre.replace(/\.txt$/, ' (archivado ' + sello + ').txt'));
    archivo.moveTo(historico);
  }
}

// [RESOLUCION] rows of a TXT, keyed "TIPO|semana" -> {"CATEGORIA|ACCION": tickets}.
function leerResolucionesTxt(texto) {
  var resultado = {};
  var seccion = '';
  texto.split('\n').forEach(function (linea) {
    var limpia = linea.replace(/\r$/, '');
    if (/^\[.*\]$/.test(limpia)) { seccion = limpia; return; }
    if (seccion !== '[RESOLUCION]') return;
    var partes = limpia.split('\t');
    if (partes.length < 5) return;
    var tickets = Number(partes[4]);
    if (!(tickets > 0)) return;
    var clave = partes[1] + '|' + Number(partes[0]);
    resultado[clave] = resultado[clave] || {};
    var detalle = partes[2] + '|' + partes[3];
    resultado[clave][detalle] = (resultado[clave][detalle] || 0) + tickets;
  });
  return resultado;
}

// Weeks of the four detailed types that have locations but no resolution rows.
function semanasSinDetalle(destinoSs) {
  var faltan = [];
  CONF_RESOLUCION_AV.forEach(function (conf) {
    if (conf.tipo === 'REMOTO') return;
    var bloque = BLOQUES_SEMANALES.filter(function (b) { return b.hoja === conf.hoja; })[0];
    var hoja = destinoSs.getSheetByName(conf.hoja);
    if (!hoja || !bloque) return;
    var valores = hoja.getRange(1, 1, hoja.getLastRow(), 58).getValues();
    for (var semana = 1; semana <= 53; semana++) {
      var col = semana + bloque.desplazamiento - 1;
      if (Number(valores[conf.fSem - 1][col]) !== semana) continue;
      var ubicaciones = 0;
      for (var f = bloque.filas[0]; f <= bloque.filas[1]; f++) ubicaciones += Number(valores[f - 1][col]) || 0;
      if (ubicaciones <= 0) continue;
      var detalle = 0;
      Object.keys(conf.filas).forEach(function (fila) { detalle += Number(valores[fila - 1][col]) || 0; });
      if (detalle === 0) faltan.push({ conf: conf, hoja: hoja, semana: semana, col: col + 1, ubicaciones: ubicaciones });
    }
  });
  return faltan;
}

// Fills missing resolution weeks from the archived TXTs, newest first. Only
// empty cells are written, and only from a TXT of the same report year.
function recuperarDetalleDesdeHistorico(destinoSs) {
  var faltan = semanasSinDetalle(destinoSs);
  if (faltan.length === 0) return [];

  var anio = anioInformeActual();
  var txts = [];
  [ID_CARPETA_HISTORICO_TXT, ID_CARPETA_TXT].forEach(function (id) {
    var archivos = DriveApp.getFolderById(id).getFiles();
    while (archivos.hasNext()) {
      var archivo = archivos.next();
      var m = archivo.getName().match(/^AV (\d{4})-S\d+.*\.txt$/);
      if (m && Number(m[1]) === anio) txts.push(archivo);
    }
  });
  txts.sort(function (a, b) { return b.getLastUpdated() - a.getLastUpdated(); });

  var lineas = [];
  var cache = {};
  faltan.forEach(function (falta) {
    var clave = falta.conf.tipo + '|' + falta.semana;
    for (var i = 0; i < txts.length; i++) {
      var id = txts[i].getId();
      if (!cache[id]) cache[id] = leerResolucionesTxt(txts[i].getBlob().getDataAsString('UTF-8'));
      var detalle = cache[id][clave];
      if (!detalle) continue;
      var suma = 0;
      Object.keys(falta.conf.filas).forEach(function (fila) {
        var par = falta.conf.filas[fila];
        var valor = detalle[par[0] + '|' + par[1]];
        if (!valor) return;
        var celda = falta.hoja.getRange(Number(fila), falta.col);
        if (celda.getValue() === '' || celda.getValue() === null) celda.setValue(valor);
        suma += valor;
      });
      lineas.push(`${falta.conf.hoja} S${falta.semana}: detalle recuperado de "${txts[i].getName()}" (${suma} de ${falta.ubicaciones}).`);
      return;
    }
  });
  return lineas;
}

// Weeks up to the last one that are empty in some tab, or still lack detail.
function revisarSemanas(destinoSs, ultima) {
  var avisos = [];
  for (var semana = 1; semana <= ultima; semana++) {
    var vacias = BLOQUES_SEMANALES.filter(function (bloque) {
      var hoja = destinoSs.getSheetByName(bloque.hoja);
      if (!hoja) return false;
      var valores = hoja.getRange(bloque.filas[0], semana + bloque.desplazamiento, bloque.filas[1] - bloque.filas[0] + 1, 1).getValues();
      return !valores.some(function (fila) { return Number(fila[0]) > 0; });
    }).map(function (bloque) { return bloque.hoja; });
    if (vacias.length === BLOQUES_SEMANALES.length) avisos.push(`S${semana}: vacía en todas las pestañas.`);
    else if (vacias.length > 0) avisos.push(`S${semana}: sin datos en ${vacias.join(', ')}.`);
  }
  semanasSinDetalle(destinoSs).forEach(function (falta) {
    avisos.push(`${falta.conf.hoja} S${falta.semana}: ubicaciones sin detalle de resolución.`);
  });
  return avisos;
}

function escribirPlanoTxt(numSemana) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName('Ubicacion') || !ss.getSheetByName('Resolucion')) {
    volcarDatosLookerStudio();
  }
  var semana = Number(numSemana) || maxSemanaConDato();
  var anio = anioInformeActual();
  var name = 'AV ' + anio + '-S' + semana + '.txt';
  var texto = serializarPlanoAv(semana);
  var folder = DriveApp.getFolderById(ID_CARPETA_TXT);
  archivarTxtAnteriores(folder, name);
  return folder.createFile(name, texto, MimeType.PLAIN_TEXT);
}

function guardarPlanoTxt() {
  var ui = SpreadsheetApp.getUi();
  try {
    volcarDatosLookerStudio();
    var archivo = escribirPlanoTxt();
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



