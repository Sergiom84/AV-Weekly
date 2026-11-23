// ==========================================
// 00. ENTORNO, CARPETAS E IDs — COPIA TRABAJO (NO TOCAR AL ACTUALIZAR LOGICA)
// ==========================================
// Copia este archivo como 00_Entorno_IDs.gs en el Apps Script de trabajo.
// El resto de archivos (.gs) leen todo a traves de estas funciones auxiliares.

const ENTORNO_AV = {
  NOMBRE: 'TRABAJO',
  ID_CARPETA_CONTENEDORA: '1dre4ydY0a9jnJ9Mufpj2EJFe5Cvd-o8h',
  ID_HOJA_TENDENCIAS: '1i1JHgo-5-CFo9W2T9aVcM_RMrqh1_PKcgPymlC0Ue0E',
  // Opcionales: si se dejan vacios (''), busca "Bruto" e "histórico AV - txt"
  // dentro de la carpeta contenedora (o crea la de historico si faltase).
  // Si en el trabajo tienen otro nombre o ubicacion, pega aqui su ID exacto.
  ID_CARPETA_TEMPLATES: '',
  ID_CARPETA_TXT: '1dre4ydY0a9jnJ9Mufpj2EJFe5Cvd-o8h',
  ID_CARPETA_HISTORICO_TXT: '',
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
