// ==========================================
// 00. ENTORNO, CARPETAS E IDs — PERSONAL (NO TOCAR AL ACTUALIZAR LOGICA)
// ==========================================
// Este archivo es el unico que cambia entre entornos (Personal vs Trabajo).
// El resto de archivos .gs leen siempre a traves de estas funciones auxiliares.

var ENTORNO_INFORMATICA = {
  NOMBRE: 'PERSONAL',
  ID_CARPETA_BRUTO: '17O7dORS6oIDN0hyLP1AXQEN7tR6k3ZbH',
  ID_CARPETA_SALIDA_PLANO: '1b1yyWSoWIj3cNwuCn-1Co1jtqgdGK2_A',
  ID_HOJA_INFORME: '1dpjt6zqPHNbNvLzUWwvIv0sDZNaljXxh9IUx_WiI7Y8',
  NOMBRE_CARPETA_HISTORICO_TXT: 'histórico Informática - txt'
};

/**
 * Semillas compatibles con las versiones previas del script.
 * En ejecución normal manda lo escrito en la pestaña "Configuración" y el libro activo;
 * estos valores se usan al inicializar o si una celda quedase vacía.
 */
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
