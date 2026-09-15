export const MAX_WORKBOOK_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_INFORMATICA_FILE_SIZE_BYTES = 25 * 1024 * 1024;
export const MAX_INFORMATICA_UPLOAD_SIZE_BYTES = 40 * 1024 * 1024;
/** JSON body of a pasted PLANO tab. Matches the Informática file cap. */
export const MAX_TEXTO_PASTE_BYTES = MAX_INFORMATICA_FILE_SIZE_BYTES;

export function exceedsInformaticaUploadLimit(
  files: ReadonlyArray<Pick<Express.Multer.File, "size">>
): boolean {
  return files.reduce((total, file) => total + file.size, 0) > MAX_INFORMATICA_UPLOAD_SIZE_BYTES;
}
