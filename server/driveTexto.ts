/**
 * Google Sheets copies a cell that contains tabs as a quoted line. The PLANO
 * tab stores one TSV row per cell, so a paste of that column arrives as
 * `"semana<TAB>2026-09-15"` instead of the canonical TSV line.
 * Unwrapping here is what lets the colleague paste instead of uploading a file
 * that the corporate proxy rewrites.
 */
export function unwrapDriveCopiedLine(line: string): string {
  if (line.length >= 2 && line.startsWith('"') && line.endsWith('"')) {
    return line.slice(1, -1).replace(/""/g, '"');
  }

  return line;
}

export function unwrapDriveCopiedTexto(texto: string): string {
  return String(texto ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(unwrapDriveCopiedLine)
    .join("\n");
}
