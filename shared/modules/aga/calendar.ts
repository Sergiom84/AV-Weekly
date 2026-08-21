/**
 * Calendar conventions of the AGA report.
 *
 * GPS stamps each snapshot with the Monday on which it is extracted. AGA names
 * that snapshot after the completed Monday-to-Sunday period immediately before
 * the extraction. Therefore the 2026-08-17 snapshot is "Semana 33", not ISO
 * week 34. Keeping that rule here prevents each page and importer from growing
 * its own one-off subtraction.
 */

export interface AgaReportingPeriod {
  week: number;
  year: number;
  start: string;
  end: string;
}

const DAY_MS = 86_400_000;
const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

function dateOnly(value: string): Date | null {
  const match = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
    ? parsed
    : null;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isoWeek(date: Date): { week: number; year: number } {
  const thursday = new Date(date);
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));

  const year = thursday.getUTCFullYear();
  const firstDay = Date.UTC(year, 0, 1);
  const week = Math.ceil(((thursday.getTime() - firstDay) / DAY_MS + 1) / 7);

  return { week, year };
}

/** Reporting period represented by one GPS extraction date. */
export function agaReportingPeriod(
  extractionDate: string,
  explicitWeek?: number | null
): AgaReportingPeriod | null {
  const extraction = dateOnly(extractionDate);

  if (!extraction) return null;

  const end = new Date(extraction.getTime() - DAY_MS);
  const start = new Date(end.getTime() - 6 * DAY_MS);
  const calendar = isoWeek(end);
  const week =
    Number.isInteger(explicitWeek) && Number(explicitWeek) >= 1 && Number(explicitWeek) <= 53
      ? Number(explicitWeek)
      : calendar.week;

  return { week, year: calendar.year, start: isoDate(start), end: isoDate(end) };
}

/** Short chart/KPI label, with a fallback for legacy or malformed data. */
export function agaWeekLabel(extractionDate: string, explicitWeek?: number | null): string {
  const period = agaReportingPeriod(extractionDate, explicitWeek);

  return period ? `S${period.week}` : extractionDate;
}

function day(value: string): number {
  return Number(value.slice(8, 10));
}

/** Human-readable period for the cover, derived from the latest dataset week. */
export function agaPeriodLabel(
  extractionDate: string,
  explicitWeek?: number | null
): string {
  const period = agaReportingPeriod(extractionDate, explicitWeek);

  if (!period) return "";

  const startMonth = Number(period.start.slice(5, 7)) - 1;
  const endMonth = Number(period.end.slice(5, 7)) - 1;
  const range =
    startMonth === endMonth
      ? `${day(period.start)}-${day(period.end)} ${MONTHS[endMonth]}`
      : `${day(period.start)} ${MONTHS[startMonth]}-${day(period.end)} ${MONTHS[endMonth]}`;

  return `Semana ${period.week} de ${period.year} · ${range}`;
}
