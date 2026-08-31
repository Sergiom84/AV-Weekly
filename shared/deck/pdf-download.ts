/** Reads the attachment name out of a `Content-Disposition` header. */
export function filenameFromDisposition(
  header: string | null,
  fallback: string
): string {
  if (!header) {
    return fallback;
  }

  const encoded = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1].replace(/["']/g, "").trim());
    } catch {
      // Fall through to the plain `filename=` form.
    }
  }

  const quoted = /filename="([^"]+)"/i.exec(header);
  if (quoted) {
    return quoted[1];
  }

  const plain = /filename=([^;]+)/i.exec(header);
  if (plain) {
    return plain[1].trim().replace(/^["']|["']$/g, "");
  }

  return fallback;
}
