// ==========================================
// 00. ENTORNO, CARPETAS E IDs — PERSONAL (NO TOCAR AL ACTUALIZAR LOGICA)
// ==========================================
// Este archivo es el unico que cambia entre entornos (Personal vs Trabajo).
// El resto de archivos .gs leen siempre a traves de estas funciones auxiliares.

var ENTORNO_AGA = {
  NOMBRE: 'PERSONAL',
  ID_CARPETA_BRUTO: '1D4AmMBILXmjuYaD2ngDg413pJfYoHgEP',
  ID_CARPETA_SALIDA_PLANO: '1D4AmMBILXmjuYaD2ngDg413pJfYoHgEP',
  ID_HOJA_INFORME: '1VOT_AVu301TL48X523P0xjiFM9ADXXhCoEUisqC92P0',
  NOMBRE_CARPETA_HISTORICO_TXT: 'histórico AGA - txt'
};

/**
 * Semilla compatible con las versiones previas del script.
 * En ejecución normal manda lo escrito en la pestaña "Configuración" y el libro activo;
 * estos valores se usan al inicializar o si la celda quedase vacía.
 */
var DEFAULT_FOLDER_ID = ENTORNO_AGA.ID_CARPETA_BRUTO;

function obtenerIdCarpetaBrutoAga() {
  return ENTORNO_AGA.ID_CARPETA_BRUTO || '';
}

function obtenerIdCarpetaSalidaAga(fallbackFolderId) {
  return ENTORNO_AGA.ID_CARPETA_SALIDA_PLANO || fallbackFolderId || obtenerIdCarpetaBrutoAga();
}

function obtenerNombreCarpetaHistoricoAga() {
  return ENTORNO_AGA.NOMBRE_CARPETA_HISTORICO_TXT || 'histórico AGA - txt';
}

function obtenerLibroAga() {
  var activa = SpreadsheetApp.getActiveSpreadsheet();

  if (activa) return activa;
  if (ENTORNO_AGA.ID_HOJA_INFORME) {
    return SpreadsheetApp.openById(ENTORNO_AGA.ID_HOJA_INFORME);
  }

  throw new Error('No hay libro activo ni ID_HOJA_INFORME configurado en 00_Entorno_IDs.gs.');
}
