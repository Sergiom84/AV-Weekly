// ==========================================
// 00. ENTORNO, CARPETAS E IDs — COPIA TRABAJO (NO TOCAR AL ACTUALIZAR LOGICA)
// ==========================================
// Copia este archivo como 00_Entorno_IDs.gs en el Apps Script del entorno de trabajo
// y rellena los IDs de la carpeta Bruto, la carpeta de salida PLANO y el libro limpio.
// Al actualizar la lógica en el trabajo, deja intacto este archivo y sustituye solo
// los bloques 01_ a 06_.

var ENTORNO_INFORMATICA = {
  NOMBRE: 'TRABAJO',
  ID_CARPETA_BRUTO: '',
  ID_CARPETA_SALIDA_PLANO: '',
  ID_HOJA_INFORME: '',
  NOMBRE_CARPETA_HISTORICO_TXT: 'histórico Informática - txt'
};

var DEFAULT_FOLDER_ID = ENTORNO_INFORMATICA.ID_CARPETA_BRUTO;
var DEFAULT_OUTPUT_FOLDER_ID = ENTORNO_INFORMATICA.ID_CARPETA_SALIDA_PLANO;

function obtenerIdCarpetaBrutoInformatica() {
  return ENTORNO_INFORMATICA.ID_CARPETA_BRUTO || '';
}

function obtenerIdCarpetaSalidaInformatica() {
  return ENTORNO_INFORMATICA.ID_CARPETA_SALIDA_PLANO || '';
}

function obtenerNombreCarpetaHistoricoInformatica() {
  return ENTORNO_INFORMATICA.NOMBRE_CARPETA_HISTORICO_TXT || 'histórico Informática - txt';
}

function obtenerLibroInformatica() {
  var activa = SpreadsheetApp.getActiveSpreadsheet();

  if (activa) return activa;
  if (ENTORNO_INFORMATICA.ID_HOJA_INFORME) {
    return SpreadsheetApp.openById(ENTORNO_INFORMATICA.ID_HOJA_INFORME);
  }

  throw new Error('No hay libro activo ni ID_HOJA_INFORME configurado en 00_Entorno_IDs.gs.');
}
