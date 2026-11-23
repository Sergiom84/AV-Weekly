// ==========================================
// 00. ENTORNO, CARPETAS E IDs (NO TOCAR AL ACTUALIZAR LOGICA)
// ==========================================
// Este archivo es el unico que cambia entre entornos (Personal vs Trabajo).
// El resto de archivos .gs leen siempre a traves de estas funciones auxiliares.

const ENTORNO_AV = {
  NOMBRE: 'PERSONAL',
  ID_CARPETA_CONTENEDORA: '1KdBpANFQ2O2_PBhlTtV8LpC2-xfyhNiR',
  ID_HOJA_TENDENCIAS: '1ztjxaikuMmae6yVur_8glXWZGTREtJGuHkSf9V2DCZk',
  // Opcionales: si se dejan vacios (''), se resuelven por nombre dentro de ID_CARPETA_CONTENEDORA.
  ID_CARPETA_TEMPLATES: '1Uz7rU5hm8jUvp1nLLQyALgaiYjhCR8LW',
  ID_CARPETA_TXT: '1KdBpANFQ2O2_PBhlTtV8LpC2-xfyhNiR',
  ID_CARPETA_HISTORICO_TXT: '10beuK3so7X4lHMVuWKQ4azWJDq7My99E',
  NOMBRE_CARPETA_TEMPLATES: 'Bruto',
  NOMBRE_CARPETA_HISTORICO_TXT: 'histórico AV - txt'
};

var _cacheEntornoAv = {};

function normalizarNombreCarpetaAv(nombre) {
  return String(nombre || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

function buscarSubcarpetaPorNombreAv(idPadre, nombreObjetivo) {
  const padre = DriveApp.getFolderById(idPadre);
  const objetivo = normalizarNombreCarpetaAv(nombreObjetivo);
  const subcarpetas = padre.getFolders();
  while (subcarpetas.hasNext()) {
    const sub = subcarpetas.next();
    if (normalizarNombreCarpetaAv(sub.getName()) === objetivo) {
      return sub;
    }
  }
  return null;
}

function obtenerIdCarpetaTxt() {
  if (ENTORNO_AV.ID_CARPETA_TXT) return ENTORNO_AV.ID_CARPETA_TXT;
  if (ENTORNO_AV.ID_CARPETA_CONTENEDORA) return ENTORNO_AV.ID_CARPETA_CONTENEDORA;
  throw new Error('Falta configurar ID_CARPETA_TXT o ID_CARPETA_CONTENEDORA en 00_Entorno_IDs.gs.');
}

function obtenerIdCarpetaTemplates() {
  if (ENTORNO_AV.ID_CARPETA_TEMPLATES) return ENTORNO_AV.ID_CARPETA_TEMPLATES;
  if (_cacheEntornoAv.templates) return _cacheEntornoAv.templates;
  const contenedora = ENTORNO_AV.ID_CARPETA_CONTENEDORA;
  if (!contenedora) {
    throw new Error('Falta ID_CARPETA_TEMPLATES o ID_CARPETA_CONTENEDORA en 00_Entorno_IDs.gs.');
  }
  const encontrada = buscarSubcarpetaPorNombreAv(contenedora, ENTORNO_AV.NOMBRE_CARPETA_TEMPLATES || 'Bruto');
  if (!encontrada) {
    throw new Error(
      `No se encontro la subcarpeta "${ENTORNO_AV.NOMBRE_CARPETA_TEMPLATES}" dentro de la carpeta contenedora (${contenedora}).`
    );
  }
  _cacheEntornoAv.templates = encontrada.getId();
  return _cacheEntornoAv.templates;
}

function obtenerIdCarpetaHistorico() {
  if (ENTORNO_AV.ID_CARPETA_HISTORICO_TXT) return ENTORNO_AV.ID_CARPETA_HISTORICO_TXT;
  if (_cacheEntornoAv.historico) return _cacheEntornoAv.historico;
  const idBase = obtenerIdCarpetaTxt();
  let encontrada = buscarSubcarpetaPorNombreAv(idBase, ENTORNO_AV.NOMBRE_CARPETA_HISTORICO_TXT || 'histórico AV - txt');
  if (!encontrada) {
    encontrada = DriveApp.getFolderById(idBase).createFolder(ENTORNO_AV.NOMBRE_CARPETA_HISTORICO_TXT || 'histórico AV - txt');
  }
  _cacheEntornoAv.historico = encontrada.getId();
  return _cacheEntornoAv.historico;
}

function obtenerCarpetaTemplates() {
  return DriveApp.getFolderById(obtenerIdCarpetaTemplates());
}

function obtenerCarpetaTxt() {
  return DriveApp.getFolderById(obtenerIdCarpetaTxt());
}

function obtenerCarpetaHistorico() {
  return DriveApp.getFolderById(obtenerIdCarpetaHistorico());
}

function obtenerLibroTendencias() {
  const activa = SpreadsheetApp.getActiveSpreadsheet();
  if (activa) return activa;
  if (ENTORNO_AV.ID_HOJA_TENDENCIAS) {
    return SpreadsheetApp.openById(ENTORNO_AV.ID_HOJA_TENDENCIAS);
  }
  throw new Error('No hay libro activo ni ID_HOJA_TENDENCIAS configurado en 00_Entorno_IDs.gs.');
}
