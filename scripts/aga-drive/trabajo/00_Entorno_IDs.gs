// ==========================================
// 00. ENTORNO, CARPETAS E IDs — COPIA TRABAJO (NO TOCAR AL ACTUALIZAR LOGICA)
// ==========================================
// Copia este archivo como 00_Entorno_IDs.gs en el Apps Script del entorno de trabajo.
// Al actualizar la lógica en el trabajo, deja intacto este archivo y sustituye solo
// los bloques 01_ a 05_.

var ENTORNO_AGA = {
  NOMBRE: 'TRABAJO',
  ID_CARPETA_BRUTO: '1gqUPPVsPOE1xy3aJB2dSwNWD3WnDxK8a',
  ID_CARPETA_SALIDA_PLANO: '',
  ID_HOJA_INFORME: '',
  NOMBRE_CARPETA_HISTORICO_TXT: 'histórico AGA - txt'
};

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
