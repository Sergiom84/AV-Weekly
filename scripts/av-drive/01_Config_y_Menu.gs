// ==========================================
// 01. CONFIGURACION DE HOJAS, MENUS Y HELPERS BASE
// ==========================================

const CONFIG_MENSUAL = {
  REMOTOS: {
    hoja: 'Remotos',
    rangoFilas: [21, 32],
    colActual: 'B',
    colPasado: 'X',
    rangoHistorico: [39, 50],
    colHistorico: 'E' // A37:E52 (2026 en col E, Ene fila 39 .. Dic fila 50)
  },
  PROGRAMADOS: {
    hoja: 'Programados',
    rangoFilas: [36, 47],
    colActual: 'B',
    colPasado: 'Q',
    rangoHistorico: [54, 65],
    colHistorico: 'G' // C52:G67 (2026 en col G, Ene fila 54 .. Dic fila 65)
  },
  PRESENCIALES: {
    hoja: 'Presenciales',
    rangoFilas: [37, 48],
    colActual: 'B',
    colPasado: 'P',
    rangoHistorico: [55, 66],
    colHistorico: 'G' // C53:G68 (2026 en col G, Ene fila 55 .. Dic fila 66)
  },
  INCIDENCIAS: {
    hoja: 'Incidencias',
    rangoFilas: [58, 69],
    colActual: 'B',
    colPasado: 'P',
    rangoHistorico: [76, 87],
    colHistorico: 'G' // C74:G89 (2026 en col G, Ene fila 76 .. Dic fila 87)
  },
  CORRECTIVOS: {
    hoja: 'Correctivos',
    rangoFilas: [54, 65],
    colActual: 'B',
    colPasado: 'P',
    rangoHistorico: [72, 83],
    colHistorico: 'G' // C70:G85 (2026 en col G, Ene fila 72 .. Dic fila 83)
  }
};

const MESES_TENDENCIA = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

// Rows that hold the weekly totals of each trend tab, and the column offset
// between a week number and its column.
const BLOQUES_SEMANALES = [
  { hoja: 'Remotos', filas: [13, 17], desplazamiento: 1 },
  { hoja: 'Programados', filas: [27, 32], desplazamiento: 3 },
  { hoja: 'Presenciales', filas: [29, 34], desplazamiento: 3 },
  { hoja: 'Incidencias', filas: [49, 54], desplazamiento: 3 },
  { hoja: 'Correctivos', filas: [45, 50], desplazamiento: 3 }
];

const CONF_UBICACION_AV = [
  { hoja: 'Programados', fSem: 19, tipo: 'PROGRAMADO', filas: { 27: 'CIUDAD', 28: 'CAMPUS', 29: 'VELA', 30: 'TERRITORIOS', 31: 'RECOLETOS', 32: 'TABLAS' } },
  { hoja: 'Presenciales', fSem: 28, tipo: 'PRESENCIAL', filas: { 29: 'TERRITORIOS', 30: 'CIUDAD', 31: 'CAMPUS', 32: 'RECOLETOS', 33: 'TABLAS', 34: 'VELA' } },
  { hoja: 'Incidencias', fSem: 41, tipo: 'INCIDENCIA', filas: { 49: 'CIUDAD', 50: 'TERRITORIOS', 51: 'CAMPUS', 52: 'RECOLETOS', 53: 'VELA', 54: 'TABLAS' } },
  { hoja: 'Correctivos', fSem: 37, tipo: 'CORRECTIVO', filas: { 45: 'CIUDAD', 46: 'TERRITORIOS', 47: 'CAMPUS', 48: 'RECOLETOS', 49: 'VELA', 50: 'TABLAS' } }
];

// Rows of each resolution block and the category/action they stand for. Shared
// by the TXT dump and by the recovery of missing weeks from archived TXTs.
const CONF_RESOLUCION_AV = [
  {
    hoja: 'Remotos', fSem: 5, tipo: 'REMOTO',
    filas: { 13: ['REMOTO', 'ERRORES'], 14: ['REMOTO', 'CONEXION'], 15: ['REMOTO', 'OPERATIVA'], 16: ['REMOTO', 'BLUE BRANCH'], 17: ['REMOTO', 'VIDEO'] }
  },
  {
    hoja: 'Programados', fSem: 19, tipo: 'PROGRAMADO',
    filas: {
      5: ['SALA', 'PREPARACION SALA'], 6: ['SALA', 'PRESTAMO'], 7: ['WEBEX', 'CONEXION'],
      8: ['WEBEX', 'SEMINARIO WEB'], 9: ['WEBEX', 'TRADUCCION'], 10: ['MEET', 'CONEXION'],
      11: ['MEET', 'TRADUCCION'], 12: ['OTRAS VC', 'CONEXION']
    }
  },
  {
    hoja: 'Presenciales', fSem: 21, tipo: 'PRESENCIAL',
    filas: {
      5: ['SALA', 'PREPARACION SALA'], 6: ['SALA', 'DES/INSTALACION'], 7: ['SALA', 'DES/MONTAJE'],
      8: ['SALA', 'ENCENDIDO/APAGADO'], 9: ['SALA', 'EVENTO'], 10: ['SALA', 'ETIQUETADO'],
      11: ['WEBEX', 'CONEXION'], 12: ['WEBEX', 'TRADUCCION'], 13: ['OTRAS VC', 'CONEXION'], 14: ['MEET', 'CONEXION']
    }
  },
  {
    hoja: 'Incidencias', fSem: 41, tipo: 'INCIDENCIA',
    filas: {
      6: ['WEBEX', 'CONEXION'], 7: ['WEBEX', 'FORMACION'], 8: ['WEBEX', 'GESTION'],
      10: ['CABLEADO', 'PRESTAMO'], 11: ['CABLEADO', 'SANEADO'], 12: ['CABLEADO', 'SUSTITUCION'],
      14: ['PC/PORTATIL', 'CONFIGURACION'], 15: ['PC/PORTATIL', 'FORMACION'],
      17: ['DOMOTICA', 'CONFIGURACION'], 18: ['DOMOTICA', 'FORMACION'], 19: ['DOMOTICA', 'REINICIO'], 20: ['DOMOTICA', 'SUSTITUCION'],
      22: ['MEET', 'CONEXION'], 23: ['MEET', 'FORMACION'],
      24: ['EQUIPO VIDEO', 'EQUIPO VIDEO'], 25: ['MONITOR', 'MONITOR'], 26: ['EQUIPO AUDIO', 'EQUIPO AUDIO'],
      27: ['VC CISCO', 'VC CISCO'], 28: ['PERIFERICO PC', 'PERIFERICO PC'], 29: ['OTRAS VC', 'OTRAS VC'],
      30: ['PROYECTOR', 'PROYECTOR'], 31: ['TRADUCCION', 'TRADUCCION'],
      32: ['ROOMWIZARD/QR', 'ROOMWIZARD/QR'], 33: ['VIDEO WALL', 'VIDEO WALL']
    }
  },
  {
    hoja: 'Correctivos', fSem: 37, tipo: 'CORRECTIVO',
    filas: {
      6: ['ALMACEN', 'INVENTARIO'], 7: ['ALMACEN', 'TRASLADO'],
      9: ['CABLEADO', 'SANEADO'], 10: ['CABLEADO', 'SUSTITUCION'],
      12: ['PC/PORTATIL', 'CONFIGURACION'], 13: ['PC/PORTATIL', 'REINICIO'], 14: ['PC/PORTATIL', 'SUSTITUCION'],
      16: ['EQUIPO AUDIO', 'CONFIGURACION'], 17: ['EQUIPO AUDIO', 'REINICIO'], 18: ['EQUIPO AUDIO', 'SUSTITUCION'],
      20: ['EQUIPO VIDEO', 'CONFIGURACION'], 21: ['EQUIPO VIDEO', 'REINICIO'], 22: ['EQUIPO VIDEO', 'SUSTITUCION'],
      23: ['PERIFERICO PC', 'PERIFERICO PC'], 24: ['MONITOR', 'MONITOR'], 25: ['DOMOTICA', 'DOMOTICA'],
      26: ['VIDEO WALL', 'VIDEO WALL'], 27: ['PROYECTOR', 'PROYECTOR'], 28: ['VC CISCO', 'VC CISCO'],
      29: ['VC USB', 'VC USB'], 30: ['ROOMWIZARD/QR', 'ROOMWIZARD/QR']
    }
  }
];

var CONFIG_EVENTOS_EXTR = {
  hoja: 'Eventos Extr.',
  mesesFilas: {
    6: 8,   // Junio
    7: 9,   // Julio
    9: 10,  // Septiembre (Agosto no esta en la tabla)
    10: 11, // Octubre
    11: 12  // Noviembre
  },
  columnasDT: ['Galicia', 'Norte', 'Cataluña', 'Este', 'Sur', 'GC', 'Centro']
};

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  const menu = ui.createMenu('⭐ AV Weekly');

  menu.addItem('Procesar semana', 'importarDatosSemanales');
  menu.addItem('Procesar mes', 'procesarMes');
  menu.addItem('Cierre media mensual', 'sincronizarHistoricoMensual2026');
  menu.addItem('Añadir eventos extraordinarios', 'menuSincronizarEventosExtr');
  menu.addSeparator();
  menu.addItem('Speech Sergio - Semanal', 'speechSergioSemanal');
  menu.addItem('Speech Sergio - Mensual', 'speechSergioMensual');
  menu.addSeparator();
  menu.addItem('Speech Carlos - Semanal', 'speechCarlosSemanal');
  menu.addItem('Speech Carlos - Mensual', 'speechCarlosMensual');

  menu.addToUi();
}

// --- ENLACES DEL MENU ---
function speechSergioSemanal() { mostrarSpeechUnificado('SEMANAL', 'Sergio'); }
function speechSergioMensual() { mostrarSpeechUnificado('MENSUAL', 'Sergio'); }
function speechCarlosSemanal() { mostrarSpeechUnificado('SEMANAL', 'Carlos'); }
function speechCarlosMensual() { mostrarSpeechUnificado('MENSUAL', 'Carlos'); }
function menuSincronizarEventosExtr() { sincronizarEventosExtr(true); }

// --- HELPERS COMPARTIDOS ---
function normalizarTextoAV(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
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
  var ss = obtenerLibroTendencias();
  var hoja = ss.getSheetByName('Remotos');
  if (!hoja) return new Date().getFullYear();
  var valor = Number(hoja.getRange(5, 1).getValue());
  return valor >= 2000 && valor <= 2100 ? valor : new Date().getFullYear();
}

function obtenerMesEnCursoInforme() {
  try {
    const datos = obtenerDatosMensuales('REMOTOS');
    if (datos && datos.hayDatos && datos.mes) {
      const m = MESES_TENDENCIA.findIndex(
        (nombre) => nombre.toLowerCase() === String(datos.mes).toLowerCase().trim()
      );
      if (m >= 0) return m + 1;
    }
  } catch (e) {
    // fallback silencioso
  }
  return 10;
}
