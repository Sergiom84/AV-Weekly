import type { InformaticaRenoveRow } from "@shared/modules/informatica/types";
import { isoDay, lastClosedWeek, monthLabel, type WeekWindow } from "./aggregate";

/**
 * Aggregations behind the two Renove pages, `2.7` and `2.7.1`.
 *
 * They live apart from `aggregate.ts` because Renove is the one section whose
 * measure is not already a count of the thing being reported: a row is a bag of
 * equipment in a given state, and the report only counts the states that have
 * been decided. That rule is the whole page, so it is stated once here and
 * tested directly, rather than repeated inside two components.
 */

/** Scopes of the report, in the order the columns stack. */
export const RENOVE_AMBITOS = ["Holding", "España"] as const;

export type RenoveAmbito = (typeof RENOVE_AMBITOS)[number];

/**
 * What the report does with a status.
 *
 * `decidido` is the union the printed slides call "Renovados": the renewals
 * carried out plus the ones dismissed. Both have left the queue, which is why
 * `2.7.1` reads `800 renovados` and `36 desestimados` over the same 800 rows —
 * the dismissed ones are a subset, not an addition. Their own summary box adds
 * the two into `836`, which double counts the 36.
 */
export type RenoveGrupo = "renovado" | "desestimado" | "pendiente";

/**
 * Combining marks `NFD` splits an accent into.
 *
 * Built from its escape rather than written as a literal class: the characters
 * are invisible in an editor, so a literal one is impossible to review and easy
 * to mangle in a later edit.
 */
const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

/** Status as the source spells it, minus accents, case and repeated spaces. */
function normalizeEstado(estado: string): string {
  return estado
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/**
 * Status grouping, ported from the Renove dashboard that publishes the source
 * workbook so both read the same spreadsheet the same way.
 *
 * The tail rules matter more than the table: the colleagues type the status by
 * hand, and an unlisted wording must not silently become a renewal. Anything
 * unrecognised is pending, the state that keeps a row out of the totals.
 */
export function renoveGrupo(estado: string): RenoveGrupo {
  const normalized = normalizeEstado(estado);

  if (normalized === "NO RENOVAR" || normalized.startsWith("RECHAZ")) {
    return "desestimado";
  }

  if (normalized.startsWith("RENOVAD")) {
    return "renovado";
  }

  return "pendiente";
}

/** True when the equipment has left the queue, renewed or dismissed. */
export function renoveDecidido(row: InformaticaRenoveRow): boolean {
  return renoveGrupo(row.estado) !== "pendiente";
}

/** True when the row is one of the units still waiting on the user. */
export function renovePendienteUsuario(row: InformaticaRenoveRow): boolean {
  return normalizeEstado(row.estado) === "PENDIENTE USUARIO";
}

/** Scope label of a row, folded onto the two the report publishes. */
export function renoveAmbito(row: InformaticaRenoveRow): RenoveAmbito {
  return row.ambito.trim().toLowerCase().startsWith("hold")
    ? "Holding"
    : "España";
}

export interface RenoveTotals {
  /** Renewed plus dismissed: the figure the slide calls "Renovado Acumulado". */
  total: number;
  renovados: number;
  desestimados: number;
  /** Decided units per scope. The two add up to `total`. */
  porAmbito: Record<RenoveAmbito, number>;
}

/** Headline figures of `2.7.1`, over whatever set of rows is passed in. */
export function renoveTotals(rows: InformaticaRenoveRow[]): RenoveTotals {
  const totals: RenoveTotals = {
    total: 0,
    renovados: 0,
    desestimados: 0,
    porAmbito: { Holding: 0, España: 0 },
  };

  for (const row of rows) {
    const grupo = renoveGrupo(row.estado);

    if (grupo === "pendiente") {
      continue;
    }

    totals.total += row.equipos;
    totals.porAmbito[renoveAmbito(row)] += row.equipos;

    if (grupo === "renovado") totals.renovados += row.equipos;
    else totals.desestimados += row.equipos;
  }

  return totals;
}

/** Units still pending on the user, the second KPI of `2.7`. */
export function renovePendientesUsuario(rows: InformaticaRenoveRow[]): number {
  return rows
    .filter(renovePendienteUsuario)
    .reduce((sum, row) => sum + row.equipos, 0);
}

/** Monday of the ISO week a day belongs to, as `YYYY-MM-DD`. */
function mondayOf(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;

  date.setUTCDate(date.getUTCDate() - offset);

  return date.toISOString().slice(0, 10);
}

/**
 * ISO week number of a day.
 *
 * Derived from the Thursday of its week rather than trusting the `Semana`
 * column: the section spans two calendar years, and a week that straddles
 * January is numbered by the year its Thursday falls in.
 */
function isoWeek(day: string): number {
  const thursday = new Date(`${mondayOf(day)}T00:00:00Z`);

  thursday.setUTCDate(thursday.getUTCDate() + 3);

  const firstDay = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const days = (thursday.getTime() - firstDay.getTime()) / 86400000;

  return Math.floor(days / 7) + 1;
}

/** `S07`, the axis label of the weekly chart. */
export function renoveWeekLabel(day: string): string {
  return `S${String(isoWeek(day)).padStart(2, "0")}`;
}

export interface RenoveSeriesPoint extends Record<string, string | number> {
  Holding: number;
  España: number;
}

function emptyPoint<K extends string>(
  categoryKey: K,
  category: string
): RenoveSeriesPoint {
  return { [categoryKey]: category, Holding: 0, España: 0 } as RenoveSeriesPoint;
}

/**
 * Decided units per ISO week and scope, up to and including `window`.
 *
 * Undated rows are dropped rather than bucketed: the source leaves the renewal
 * date empty on part of its rows, and a "Sin fecha" column next to the weeks
 * would read as a week of its own. They stay in the totals of `2.7.1`, which
 * is where the report accounts for them.
 */
export function renoveWeekSeries(
  rows: InformaticaRenoveRow[],
  window: WeekWindow | null
): RenoveSeriesPoint[] {
  const grouped = new Map<string, RenoveSeriesPoint>();

  for (const row of rows) {
    if (!renoveDecidido(row)) continue;

    const day = isoDay(row.fecha);
    if (day === null) continue;

    const monday = mondayOf(day);
    if (window !== null && monday > window.start) continue;

    const point =
      grouped.get(monday) ?? emptyPoint("semana", renoveWeekLabel(monday));

    point[renoveAmbito(row)] += row.equipos;
    grouped.set(monday, point);
  }

  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, point]) => point);
}

/** Decided units per month and scope, the series behind `2.7.1`. */
export function renoveMonthSeries(
  rows: InformaticaRenoveRow[]
): RenoveSeriesPoint[] {
  const grouped = new Map<string, RenoveSeriesPoint>();

  for (const row of rows) {
    if (!renoveDecidido(row) || row.mes === "") continue;

    const point =
      grouped.get(row.mes) ?? emptyPoint("mes", monthLabel(row.mes));

    point[renoveAmbito(row)] += row.equipos;
    grouped.set(row.mes, point);
  }

  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, point]) => point);
}

/**
 * Week the Renove pages report on.
 *
 * Taken from the extraction cut, not from the last renewal. Renewals are
 * sparse — plenty of weeks close on a Wednesday — and the "data through
 * Friday" rule the busier sections use would then step back a week and drop
 * the units of the week being reported. The cut is a property of the extract,
 * so it says which week is closed regardless of how quiet Renove was.
 *
 * Falls back to the rows when Renove is the only section imported and there is
 * no extraction cut to read.
 */
export function renoveWindow(
  rows: InformaticaRenoveRow[],
  cutoff: string | null
): WeekWindow | null {
  return cutoff === null
    ? lastClosedWeek(rows, row => row.fecha, null)
    : lastClosedWeek([cutoff], day => day, cutoff);
}

/** Rows dated inside a Monday-to-Sunday window. */
export function renoveInWeek(
  rows: InformaticaRenoveRow[],
  window: WeekWindow | null
): InformaticaRenoveRow[] {
  if (window === null) {
    return [];
  }

  return rows.filter(row => {
    const day = isoDay(row.fecha);
    return day !== null && day >= window.start && day <= window.end;
  });
}

/** Rows of one month, by its `YYYY/MM` key. */
export function renoveInMonth(
  rows: InformaticaRenoveRow[],
  month: string | null
): InformaticaRenoveRow[] {
  return month === null ? [] : rows.filter(row => row.mes === month);
}
