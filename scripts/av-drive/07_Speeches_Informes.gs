// ==========================================
// 07. SPEECHES: ORQUESTADOR Y PLANTILLAS DE INFORME
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
      <textarea style="width: 100%; height: 95%; font-family: monospace; font-size: 13px; padding: 10px; box-sizing: border-box;" readonly>${e(informeCompleto)}</textarea>
    `;
    const htmlOutput = HtmlService.createHtmlOutput(htmlTemplate)
      .setWidth(700)
      .setHeight(500);
    SpreadsheetApp.getUi().showModalDialog(htmlOutput, `Speech ${destinatario} - ${periodo}`);
  } catch (err) {
    SpreadsheetApp.getUi().alert('Error al generar el Speech', err.message, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

// --- SPEECH SERGIO HTML ---
function generarSpeechSergioMensualHtml() {
  const remoto = obtenerDatosSpeechRemotoMensual();
  const programado = obtenerDatosSpeechProgramadoMensual();
  const presencial = obtenerDatosSpeechPresencialMensual();
  const incidencias = obtenerDatosSpeechIncidenciasMensual();
  const correctivos = obtenerDatosSpeechCorrectivosMensual();
  const anioPasado = anioInformeActual() - 1;

  const notaEtiquetadoMensual = presencial.difMes < 0
    ? ' Esto viene dado por la carga que tuvimos el año pasado con el etiquetado.'
    : '';

  const contenido = [
    pHtml('Buenos días a todos,'),
    tituloHtml('Soporte remoto:'),
    pHtml(
      `El número de soportes realizados en ${e(remoto.mes)} ha sido de ${remoto.actual}, ` +
      `${textoDiferencia(remoto.difMes)} que el año anterior (${remoto.pasado} en ${anioPasado}). ` +
      `Siendo un ${remoto.difMes < 0 ? 'descenso' : 'aumento'} del ${remoto.porcMes}%.`
    ),
    pHtml(
      `Dentro de la ${uHtml('volumetría semanal')}, se han resuelto ${remoto.errores} incidencias en remoto, ` +
      `gestionado ${remoto.conexiones} conexiones y se ha guiado al usuario en ${remoto.operativa} ocasiones. ` +
      `Dando un total de ${remoto.totalSemanal} soportes remotos, ${textoDiferencia(remoto.difSemanal)} que el año pasado.`
    ),
    separadorHtml(),
    tituloHtml('Soporte programado:'),
    pHtml(
      `Se han realizado ${programado.actual} intervenciones. ${textoDiferencia(programado.difMes)} que en el año anterior ` +
      `(${programado.pasado} en ${anioPasado}). Lo que supone ${programado.difMes < 0 ? 'una reducción' : 'un aumento'} de un ${programado.porcMes} %.`
    ),
    pHtml(
      `En la ${uHtml('volumetría semanal por ubicación')}: ${e(programado.ubicaciones)}, sumando ${programado.totalSemanal}. ` +
      `Son ${textoDiferencia(programado.difSemanal)} que el año pasado (${programado.totalSemanalPasado}).`
    ),
    programado.resoluciones ? pHtml(`${uHtml('Dentro del tipo de resolución:')} ${e(programado.resoluciones)}.`) : '',
    separadorHtml(),
    tituloHtml('Soportes presenciales:'),
    pHtml(
      `El mes pasado se han realizado ${presencial.actual} soportes, ${textoDiferencia(presencial.difMes)} que en el año anterior ` +
      `(${presencial.pasado} en ${anioPasado}). Representa un ${presencial.difMes < 0 ? 'descenso' : 'aumento'} del ${presencial.porcMes}%.${notaEtiquetadoMensual}`
    ),
    pHtml(
      `En la ${uHtml('volumetría semanal')}, el equipo ha realizado los siguientes presenciales: ${e(presencial.ubicaciones)}. ` +
      `Total, semanal: ${presencial.totalSemanal}. Son ${textoDiferencia(presencial.difSemanal)} que el año pasado.`
    ),
    presencial.resoluciones ? pHtml(`${uHtml('Dentro del tipo de resolución:')} Ha habido ${e(presencial.resoluciones)}.`) : '',
    separadorHtml(),
    tituloHtml('Incidencias:'),
    pHtml(
      `En ${e(incidencias.mes)} se han registrado ${incidencias.actual} incidencias, ${textoDiferencia(incidencias.difMes)} que el año anterior ` +
      `(${incidencias.pasado} en ${anioPasado}). Representa un ${incidencias.difMes < 0 ? 'descenso' : 'aumento'} del ${incidencias.porcMes}%.`
    ),
    pHtml(
      `En la ${uHtml('volumetría semanal')}: ${e(incidencias.ubicaciones)}, sumando ${incidencias.totalSemanal}. ` +
      `${textoComparacionIncidencias(incidencias)}`
    ),
    incidencias.resoluciones ? pHtml(`${uHtml('Dentro del tipo de resolución:')} Ha habido ${e(incidencias.resoluciones)}.`) : '',
    separadorHtml(),
    tituloHtml('Y finalizamos con Correctivos:'),
    pHtml(
      `En ${e(correctivos.mes)} se han realizado ${correctivos.actual} correctivos, ${textoDiferencia(correctivos.difMes)} que el año anterior ` +
      `(${correctivos.pasado} en ${anioPasado}). Representa un ${correctivos.difMes < 0 ? 'descenso' : 'aumento'} del ${correctivos.porcMes}%.`
    ),
    pHtml(
      `En la ${uHtml('volumetría semanal:')} ${e(correctivos.ubicaciones)}, sumando ${correctivos.totalSemanal}. ` +
      `Son ${textoDiferencia(correctivos.difSemanal)} que el año pasado (${correctivos.totalSemanalPasado}).`
    ),
    correctivos.resoluciones ? pHtml(`${uHtml('Dentro del tipo de resolución,')} destacan: ${e(correctivos.resoluciones)}.`) : ''
  ].join('');

  return envolverSpeechSergioHtml(contenido);
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
    programado.resoluciones ? pHtml(`${uHtml('Dentro del tipo de resolución:')} ${e(programado.resoluciones)}.`) : '',
    separadorHtml(),
    tituloHtml('Soportes presenciales:'),
    pHtml(
      `En la ${uHtml('volumetría semanal')}, el equipo ha realizado los siguientes presenciales: ${e(presencial.ubicaciones)}. ` +
      `Total semanal: ${presencial.totalSemanal}. Son ${textoDiferencia(presencial.difSemanal)} que el año pasado.`
    ),
    presencial.difSemanal < 0 ? pHtml('El motivo de esta diferencia es debido a los etiquetados.') : '',
    presencial.resoluciones ? pHtml(`${uHtml('Dentro del tipo de resolución:')} Ha habido ${e(presencial.resoluciones)}.`) : '',
    separadorHtml(),
    tituloHtml('Incidencias:'),
    pHtml(
      `${e(incidencias.ubicaciones)}, sumando ${incidencias.totalSemanal}. ` +
      `Son ${textoDiferencia(incidencias.difSemanal)} que el año pasado (${incidencias.totalSemanalPasado}).`
    ),
    resolucionesIncidencias ? pHtml(`${uHtml('Dentro del tipo de resolución, destacamos:')} ${resolucionesIncidencias}.`) : '',
    separadorHtml(),
    tituloHtml('Y finalizamos con Correctivos:'),
    pHtml(
      `${e(correctivos.ubicaciones)}, sumando ${correctivos.totalSemanal}. ` +
      `Son ${textoDiferencia(correctivos.difSemanal)} que el año pasado (${correctivos.totalSemanalPasado}).`
    ),
    correctivos.resoluciones ? pHtml(`${uHtml('Dentro del tipo de resolución,')} destacan: ${e(correctivos.resoluciones)}.`) : ''
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
          body { margin: 0; padding: 14px; font-family: Arial, sans-serif; background: #f5f5f5; color: #111; }
          .toolbar { display: flex; justify-content: flex-end; margin-bottom: 10px; }
          button { border: 1px solid #bbb; background: #fff; border-radius: 4px; padding: 7px 12px; font-size: 13px; cursor: pointer; }
          button:hover { background: #efefef; }
          #speech { min-height: 520px; padding: 18px; border: 1px solid #d0d0d0; background: #fff; font-family: Calibri, Arial, sans-serif; font-size: 14px; line-height: 1.35; outline: none; }
          p { margin: 0 0 14px 0; }
          .titulo { font-weight: 700; margin-top: 8px; }
          .vacio { min-height: 12px; }
          .separador { margin: 30px 0; }
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

// --- SPEECH TEXTO PLANO (CARLOS Y RESUMENES) ---
function generarInformeRemoto(periodo, destinatario) {
  try {
    const hojaSemanal = obtenerLibroTendencias().getSheetByName('Remotos');
    const datosTotales = hojaSemanal.getRange('A5:BB9').getValues();
    const datosDesglose = hojaSemanal.getRange('A13:BB17').getValues();
    const colIdx = obtenerUltimoIndiceConDato(datosTotales[1], 2);
    const totalSemanal = Number(datosTotales[1][colIdx] || 0);
    const totalSemanalPasado = Number(datosTotales[4][colIdx] || 0);
    const difSemanal = totalSemanal - totalSemanalPasado;

    const getVal = (cat) => {
      const row = datosDesglose.find((r) => String(r[0]).toUpperCase().trim() === cat);
      return row ? Number(row[colIdx]) : 0;
    };
    const err = getVal('ERRORES');
    const con = getVal('CONEXION');
    const op = getVal('OPERATIVA');

    if (periodo === 'SEMANAL') {
      const textoDif = `Son ${Math.abs(difSemanal)} ${difSemanal < 0 ? 'menos' : 'más'} que la misma semana del año pasado.`;
      if (destinatario === 'Sergio') {
        return 'Buenos días (Sergio),\n' +
          `Comenzamos con soporte remoto. Se han resuelto ${err} incidencias en remoto, gestionado ${con} conexiones y se ha guiado al usuario en ${op} ocasiones. ` +
          `Dando un total de ${totalSemanal} soportes remotos. ${textoDif}`;
      }
      return 'Remoto - semana Carlos :\n\n' +
        'Comenzamos con el soporte remoto que realizan los dispatchers.\n' +
        `En la semana pasada se han realizado ${totalSemanal} soportes en total\n` +
        `de los cuales se han resuelto ${err} incidencias en remoto, \n` +
        `gestionado ${con} conexiones de salas y ${op} asistencias guiando al usuario.\n` +
        textoDif;
    }

    const anioPasado = anioInformeActual() - 1;
    const datosMes = obtenerDatosMensualesObligatorios('REMOTOS');
    const difMes = datosMes.actual - datosMes.pasado;
    const porcMes = datosMes.pasado > 0 ? (difMes / datosMes.pasado) * 100 : 0;
    const introMes = `El número de soportes realizados en ${datosMes.mes.toLowerCase()} ha sido de ${datosMes.actual}, ` +
      `${Math.abs(difMes)} ${difMes < 0 ? 'menos' : 'más'} que el año anterior (${datosMes.pasado} en ${anioPasado}). ` +
      `Siendo un ${difMes < 0 ? 'descenso' : 'aumento'} del ${Math.abs(porcMes).toFixed(0)}%.`;
    const detalleSemanal = `Dentro de la volumetría semanal, se han resuelto ${err} incidencias en remoto, gestionado ${con} conexiones y se ha guiado al usuario en ${op} ocasiones. ` +
      `Dando un total de ${totalSemanal} soportes remotos, ${Math.abs(difSemanal)} ${difSemanal < 0 ? 'menos' : 'más'} que el año pasado.`;

    if (destinatario === 'Sergio') {
      return `Buenos días a todos (Mensual Sergio),\nSoporte remoto:\n${introMes}\n\nDetalle semanal:\n${detalleSemanal}`;
    }
    return `Buenos días a todos (Mensual Carlos),\nComenzamos con:\nSoporte remoto\n${introMes}\n${detalleSemanal}`;
  } catch (err) {
    return `[Error en Remoto: ${err.message}]`;
  }
}

function generarInformeProgramado(periodo, destinatario) {
  try {
    const hojaSemanal = obtenerLibroTendencias().getSheetByName('Programados');
    const datosEdificios = hojaSemanal.getRange('A19:BD32').getValues();
    const colIdx = obtenerUltimoIndiceConDato(datosEdificios[1], 3);
    const totalSemanal = Number(datosEdificios[1][colIdx] || 0);
    const totalSemanalPasado = obtenerTotalSemanalPasado(datosEdificios, colIdx);
    const difSemanal = totalSemanal - totalSemanalPasado;
    const porcSemanal = totalSemanalPasado > 0 ? (difSemanal / totalSemanalPasado) * 100 : 0;

    const listaUbicaciones = construirListaUbicaciones(hojaSemanal, [27, 32], colIdx);
    const textoUbicacionesSergio = listaUbicaciones.join(', ');

    const datosTipo = hojaSemanal.getRange('A5:BD12').getValues();
    const tipos = [];
    for (let i = 0; i < datosTipo.length; i++) {
      const val = Number(datosTipo[i][colIdx] || 0);
      if (val > 0) tipos.push({ nombre: String(datosTipo[i][2] || ''), valor: val });
    }
    tipos.sort((a, b) => b.valor - a.valor);

    const textoTiposSergio = `Dentro del tipo de resolución: ${tipos[0]?.valor || 0} en ${(tipos[0]?.nombre || '').toLowerCase()} y ${tipos[1]?.valor || 0} en ${(tipos[1]?.nombre || '').toLowerCase()}.`;
    const textoTiposCarlos = tipos.slice(0, 3).map((t) => `\n${t.valor} ${t.nombre.toUpperCase()}`).join('');

    if (periodo === 'SEMANAL') {
      if (destinatario === 'Sergio') {
        const detalleSemanalTexto = `En Soporte programados, ${textoUbicacionesSergio}, sumando ${totalSemanal}. ` +
          `Son ${Math.abs(difSemanal)} ${difSemanal < 0 ? 'menos' : 'más'} que el año pasado (${totalSemanalPasado}), lo que supone un ${Math.abs(porcSemanal).toFixed(1)}% ${difSemanal < 0 ? 'menos' : 'más'}.`;
        return `${detalleSemanalTexto}\n\n${textoTiposSergio}`;
      }
      return 'Programados - semanal (Carlos)\n\n' +
        `Pasamos a los soportes programados, se han dado ${totalSemanal} soportes en salas VIP y a usuarios críticos ` +
        `lo que significa ${Math.abs(difSemanal)} ${difSemanal < 0 ? 'menos' : 'más'} que la misma semana del año anterior, ` +
        `de los cuales por ubicación observamos que ${textoUbicacionesSergio}...\n\n` +
        `De estos soportes programados, destacan las siguientes categorías:${textoTiposCarlos}`;
    }

    const anioPasado = anioInformeActual() - 1;
    const datosMes = obtenerDatosMensualesObligatorios('PROGRAMADOS');
    const difMes = datosMes.actual - datosMes.pasado;
    const porcMes = datosMes.pasado > 0 ? (difMes / datosMes.pasado) * 100 : 0;
    const introMes = `Se han realizado ${datosMes.actual} intervenciones. ${Math.abs(difMes)} ${difMes < 0 ? 'menos' : 'más'} que en el año anterior (${datosMes.pasado} en ${anioPasado}). ` +
      `Lo que supone ${difMes < 0 ? 'una reducción' : 'un aumento'} de un ${Math.abs(porcMes).toFixed(0)} %.`;

    return `Soporte programado (Mensual ${destinatario})\n${introMes}\nPor ubicación (semanal): ${textoUbicacionesSergio}, sumando ${totalSemanal}. ` +
      `Son ${Math.abs(difSemanal)} ${difSemanal < 0 ? 'menos' : 'más'} que el año pasado (${totalSemanalPasado}).\n\n${textoTiposSergio}`;
  } catch (err) {
    return `[Error en Programado: ${err.message}]`;
  }
}

function generarInformePresencial(periodo, destinatario) {
  try {
    const hojaSemanal = obtenerLibroTendencias().getSheetByName('Presenciales');
    const checkRow = hojaSemanal.getRange('A22:BD22').getValues()[0];
    const colIdx = obtenerUltimoIndiceConDato(checkRow, 3);
    const datosEdificios = hojaSemanal.getRange('A21:BD34').getValues();
    const totalSemanal = Number(datosEdificios[1][colIdx] || 0);
    const totalSemanalPasado = obtenerTotalSemanalPasado(datosEdificios, colIdx);
    const difSemanal = totalSemanal - totalSemanalPasado;
    const porcSemanal = totalSemanalPasado > 0 ? (difSemanal / totalSemanalPasado) * 100 : 0;

    const listaUbicaciones = construirListaUbicaciones(hojaSemanal, [29, 34], colIdx);
    const textoUbicacionesSergio = listaUbicaciones.join(', ');
    const textoUbicacionesCarlos = listaUbicaciones.map((u) => `\n${u}`).join('');

    const datosTipo = hojaSemanal.getRange('A5:BD14').getValues();
    const tipos = [];
    for (let i = 0; i < datosTipo.length; i++) {
      const val = Number(datosTipo[i][colIdx] || 0);
      if (val > 0) tipos.push({ nombre: String(datosTipo[i][2] || ''), valor: val });
    }
    tipos.sort((a, b) => b.valor - a.valor);

    const textoTiposSergio = tipos.length >= 2
      ? `Dentro del tipo de resolución: Ha habido ${tipos[0].valor} ${tipos[0].nombre.toLowerCase()} y ${tipos[1].valor} ${tipos[1].nombre.toLowerCase()}.`
      : tipos.length === 1
        ? `Dentro del tipo de resolución: Ha habido ${tipos[0].valor} ${tipos[0].nombre.toLowerCase()}.`
        : '';
    const textoTiposCarlos = tipos.slice(0, 3).map((t) => `\n${t.valor} ${t.nombre.toUpperCase()}`).join('');

    const compSergio = `Son ${Math.abs(difSemanal)} ${difSemanal < 0 ? 'menos' : 'más'} que el año pasado, lo que supone un ${Math.abs(porcSemanal).toFixed(2)}% ${difSemanal < 0 ? 'menos' : 'más'}.`;
    const compCarlos = `Son ${Math.abs(difSemanal)} ${difSemanal < 0 ? 'menos' : 'más'} que la misma semana del año anterior`;

    if (periodo === 'SEMANAL') {
      if (destinatario === 'Sergio') {
        return `Para los soportes presenciales de la semana, el equipo ha intervenido en: ${textoUbicacionesSergio}. ` +
          `Esto hace un total de ${totalSemanal} intervenciones. ${compSergio}\n\n${textoTiposSergio}`;
      }
      return 'Presenciales - semanal (Carlos)\n\n' +
        `En cuanto a los trabajos y soportes presenciales, en la semana pasada se han realizado ${totalSemanal}. ` +
        `${compCarlos}\nDonde destacamos por ubicación:${textoUbicacionesCarlos}\n\n` +
        `De estos soportes presenciales los más relevantes por categoría son:${textoTiposCarlos}`;
    }

    const anioPasado = anioInformeActual() - 1;
    const datosMes = obtenerDatosMensualesObligatorios('PRESENCIALES');
    const difMes = datosMes.actual - datosMes.pasado;
    const porcMes = datosMes.pasado > 0 ? (difMes / datosMes.pasado) * 100 : 0;
    const introMes = `El mes pasado se han realizado ${datosMes.actual} soportes, ${Math.abs(difMes)} ${difMes < 0 ? 'menos' : 'más'} que en el año anterior (${datosMes.pasado} en ${anioPasado}). ` +
      `Representa un ${difMes < 0 ? 'descenso' : 'aumento'} del ${Math.abs(porcMes).toFixed(0)}%.`;
    const volumetria = `En la volumetría semanal, el equipo ha intervenido en: ${textoUbicacionesSergio}. ` +
      `Total semanal: ${totalSemanal}. Son ${Math.abs(difSemanal)} ${difSemanal < 0 ? 'menos' : 'más'} que el año pasado.`;

    return `Soportes presenciales (Mensual ${destinatario})\n${introMes}\n${volumetria}\n${textoTiposSergio}`;
  } catch (err) {
    return `[Error en Presencial: ${err.message}]`;
  }
}

function generarInformeIncidencias(periodo, destinatario) {
  try {
    const hojaSemanal = obtenerLibroTendencias().getSheetByName('Incidencias');
    const checkRow = hojaSemanal.getRange('A42:BD42').getValues()[0];
    const colIdx = obtenerUltimoIndiceConDato(checkRow, 3);
    const datosPrinc = hojaSemanal.getRange('A41:BD54').getValues();
    const totalSemanal = Number(datosPrinc[1][colIdx] || 0);
    const totalSemanalPasado = Number(datosPrinc[4][colIdx] || 0);
    const difSemanal = totalSemanal - totalSemanalPasado;
    const porcSemanal = totalSemanalPasado > 0 ? (difSemanal / totalSemanalPasado) * 100 : 0;

    const listaUbicaciones = construirListaUbicaciones(hojaSemanal, [49, 54], colIdx);
    const textoUbicacionesSergio = listaUbicaciones.join(', ');
    const textoUbicacionesCarlos = listaUbicaciones.map((u) => '\n' + u).join('');

    const datosTiposFull = hojaSemanal.getRange(5, 1, 35, colIdx + 1).getValues();
    const tipos = [];
    datosTiposFull.forEach((row) => {
      const n = String(row[1] || '');
      const v = row[colIdx];
      if (n && typeof v === 'number' && v > 0 && n !== 'TOTAL' && n !== 'RESOLUCIÓN') {
        tipos.push({ nombre: n, valor: v });
      }
    });
    tipos.sort((a, b) => b.valor - a.valor);

    const textoTiposSergio = tipos.length >= 2
      ? `Dentro del tipo de resolución: Ha habido ${tipos[0].valor} ${tipos[0].nombre.toLowerCase()} y ${tipos[1].valor} ${tipos[1].nombre.toLowerCase()}.`
      : tipos.length === 1
        ? `Dentro del tipo de resolución: Ha habido ${tipos[0].valor} ${tipos[0].nombre.toLowerCase()}.`
        : '';
    const textoTiposCarlos = tipos.slice(0, 3).map((t) => '\n' + t.valor + ' ' + t.nombre.toUpperCase()).join('');

    const compTexto = difSemanal < 0
      ? `${Math.abs(difSemanal)} menos que el año pasado (${totalSemanalPasado}), lo que ha supuesto una reducción de incidencias en un ${Math.abs(porcSemanal).toFixed(0)}%.`
      : `${Math.abs(difSemanal)} más que el año pasado (${totalSemanalPasado}), lo que supone un aumento del ${Math.abs(porcSemanal).toFixed(0)}%.`;

    if (periodo === 'SEMANAL') {
      if (destinatario === 'Sergio') {
        return `Incidencias, ${textoUbicacionesSergio}, ${totalSemanal} en total. Son ${compTexto}\n\n${textoTiposSergio}`;
      }
      return 'Incidencias - semanal (Carlos)\n\n' +
        `En cuanto a las incidencias, se han registrado ${totalSemanal} en total. ` +
        `Son ${compTexto}\nPor ubicación:${textoUbicacionesCarlos}\n\n` +
        `Las categorías más relevantes son:${textoTiposCarlos}`;
    }

    const anioPasado = anioInformeActual() - 1;
    const datosMes = obtenerDatosMensualesObligatorios('INCIDENCIAS');
    const difMes = datosMes.actual - datosMes.pasado;
    const porcMes = datosMes.pasado > 0 ? (difMes / datosMes.pasado) * 100 : 0;
    const introMes = `En ${datosMes.mes.toLowerCase()} se han registrado ${datosMes.actual} incidencias, ` +
      `${Math.abs(difMes)} ${difMes < 0 ? 'menos' : 'más'} que el año anterior (${datosMes.pasado} en ${anioPasado}). ` +
      `Representa un ${difMes < 0 ? 'descenso' : 'aumento'} del ${Math.abs(porcMes).toFixed(0)}%.`;
    const volumetria = `En la volumetría semanal: ${textoUbicacionesSergio}, sumando ${totalSemanal}. Son ${compTexto}`;

    return `Incidencias (Mensual ${destinatario})\n${introMes}\n${volumetria}\n${textoTiposSergio}`;
  } catch (err) {
    return `[Error en Incidencias: ${err.message}]`;
  }
}

function generarInformeCorrectivos(periodo, destinatario) {
  try {
    const hojaSemanal = obtenerLibroTendencias().getSheetByName('Correctivos');
    const checkRow = hojaSemanal.getRange('A38:BD38').getValues()[0];
    const colIdx = obtenerUltimoIndiceConDato(checkRow, 3);
    const datosPrinc = hojaSemanal.getRange('A37:BD50').getValues();
    const totalSemanal = Number(datosPrinc[1][colIdx] || 0);
    const totalSemanalPasado = Number(datosPrinc[4][colIdx] || 0);
    const difSemanal = totalSemanal - totalSemanalPasado;
    const porcSemanal = totalSemanalPasado > 0 ? (difSemanal / totalSemanalPasado) * 100 : 0;

    const listaUbicaciones = construirListaUbicaciones(hojaSemanal, [45, 50], colIdx);
    const textoUbicacionesSergio = listaUbicaciones.join(', ');
    const textoUbicacionesCarlos = listaUbicaciones.map((u) => '\n' + u).join('');

    const datosTiposFull = hojaSemanal.getRange(5, 1, 27, colIdx + 1).getValues();
    const tipos = [];
    datosTiposFull.forEach((row) => {
      const n = String(row[1] || '');
      const v = row[colIdx];
      if (n && typeof v === 'number' && v > 0 && n !== 'TOTAL' && n !== 'RESOLUCIÓN') {
        tipos.push({ nombre: n, valor: v });
      }
    });
    tipos.sort((a, b) => b.valor - a.valor);

    const textoTiposSergio = tipos.length >= 2
      ? `Dentro del tipo de resolución, destacan: ${tipos[0].valor} ${tipos[0].nombre.toLowerCase()} y ${tipos[1].valor} ${tipos[1].nombre.toLowerCase()}.`
      : tipos.length === 1
        ? `Dentro del tipo de resolución, destacan: ${tipos[0].valor} ${tipos[0].nombre.toLowerCase()}.`
        : '';
    const textoTiposCarlos = tipos.slice(0, 3).map((t) => '\n' + t.valor + ' ' + t.nombre.toUpperCase()).join('');

    const compTexto = difSemanal < 0
      ? `${Math.abs(difSemanal)} menos que el año pasado (${totalSemanalPasado}). Siendo un descenso del ${Math.abs(porcSemanal).toFixed(0)}%.`
      : `${Math.abs(difSemanal)} más que el año pasado (${totalSemanalPasado}). Siendo un aumento del ${Math.abs(porcSemanal).toFixed(0)}%.`;

    if (periodo === 'SEMANAL') {
      if (destinatario === 'Sergio') {
        return `Y finalizamos con los soportes correctivos. ${textoUbicacionesSergio}, sumando ${totalSemanal} soportes. ${compTexto}\n\n${textoTiposSergio}`;
      }
      return 'Correctivos - semanal (Carlos)\n\n' +
        `Finalizamos con los mantenimientos correctivos, se han realizado ${totalSemanal} soportes en total. ` +
        `Son ${compTexto}\nPor ubicación:${textoUbicacionesCarlos}\n\n` +
        `Las categorías más relevantes son:${textoTiposCarlos}`;
    }

    const anioPasado = anioInformeActual() - 1;
    const datosMes = obtenerDatosMensualesObligatorios('CORRECTIVOS');
    const difMes = datosMes.actual - datosMes.pasado;
    const porcMes = datosMes.pasado > 0 ? (difMes / datosMes.pasado) * 100 : 0;
    const introMes = `En ${datosMes.mes.toLowerCase()} se han realizado ${datosMes.actual} correctivos, ` +
      `${Math.abs(difMes)} ${difMes < 0 ? 'menos' : 'más'} que el año anterior (${datosMes.pasado} en ${anioPasado}). ` +
      `Representa un ${difMes < 0 ? 'descenso' : 'aumento'} del ${Math.abs(porcMes).toFixed(0)}%.`;
    const volumetria = `En la volumetría semanal: ${textoUbicacionesSergio}, sumando ${totalSemanal}. Son ${compTexto}`;

    return `Correctivos (Mensual ${destinatario})\n${introMes}\n${volumetria}\n${textoTiposSergio}`;
  } catch (err) {
    return `[Error en Correctivos: ${err.message}]`;
  }
}
