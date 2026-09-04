/**
 * Excel date cells as UTC calendar dates.
 *
 * Templates write serials, hand-edited books write ISO or `d/m/aaaa`, and a
 * sheet opened with `cellDates` yields a `Date`. All four must parse, or a
 * listing whose close date is a serial is silently dropped.
 */

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const DAY = 86_400_000;

function utcDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

function dateFromSerial(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial <= 0) {
    return null;
  }

  return new Date(EXCEL_EPOCH + Math.trunc(serial) * DAY);
}

/** UTC midnight of an Excel date cell, or null. `//` is "not closed". */
export function parseExcelDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }

  if (typeof value === "number") {
    return dateFromSerial(value);
  }

  const text = String(value ?? "").trim();

  if (text === "" || text === "//") {
    return null;
  }

  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);

  if (iso) {
    return utcDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const dmy = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);

  if (dmy) {
    return utcDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  }

  const serial = Number(text);

  return Number.isFinite(serial) && serial > 59 ? dateFromSerial(serial) : null;
}

/** `YYYY-MM` of an Excel month cell, including serials and full dates. */
export function parseExcelMonth(value: unknown): string | null {
  const text = String(value ?? "").trim();
  const monthOnly = text.match(/^(\d{4})[/-](\d{1,2})$/);

  if (monthOnly) {
    return `${monthOnly[1]}-${monthOnly[2].padStart(2, "0")}`;
  }

  const date = parseExcelDate(value);

  if (!date) {
    return null;
  }

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
