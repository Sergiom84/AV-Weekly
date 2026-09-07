/**
 * Name a report file carries: department, date and the word `Informe`, as in
 * `AGA_07-09-26_Informe`. The extension belongs to the caller.
 *
 * The separator between the day, the month and the year is a hyphen and not
 * the slash the reports use on paper: a slash is a path separator on every
 * filesystem, so a name that carried one would be rejected or silently split.
 *
 * Shared between the two export paths on purpose. The server names the real
 * download through `Content-Disposition`, the browser print dialog is only
 * offered `document.title`, and the two must not disagree about what the file
 * is called.
 */
export function reportFileBaseName(
  department: string,
  day: string,
  month: string,
  year: string
): string {
  const safeDepartment = department
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return `${safeDepartment}_${day}-${month}-${year}_Informe`;
}

/**
 * The day, month and year of a date in the business timezone, two digits each.
 *
 * Madrid rather than UTC: an export at half past eleven at night is filed
 * under the day the person doing it is living, not the day in Greenwich.
 */
export function madridDateParts(date: Date): {
  day: string;
  month: string;
  year: string;
} {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value ?? "";

  return { day: value("day"), month: value("month"), year: value("year") };
}

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
