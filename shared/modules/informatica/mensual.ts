import type { InformaticaDataset } from "./types.ts";

/**
 * Monthly Informática close, the one-slide summary Diego described.
 *
 * The weekly snapshot and this close are different extracts. Request origins
 * here are the four columns of the monthly matrix. Incident stock comes from
 * tab 7-7. Everything else is the month already stored in the plain text.
 */

export const PETICIONES_ORIGENES = [
  "On Site",
  "Technology",
  "Renove Windows",
  "Renove Apple",
] as const;

export const TOP_TEN_MENSUAL = [
  "EQUIPO",
  "APLICACIONES",
  "IMPRESORA",
  "HARDWARE",
  "TELEFONO",
  "CONECTABBVA",
  "PERIFERICOS",
  "COMUNICACIONES",
  "GOOGLE APPS",
  "WEBEX",
] as const;

const SLA_SLOTS = [
  { id: "reaccion.p1", label: "Reacción 1" },
  { id: "resolucion.p1", label: "Resolución 1" },
  { id: "reaccion.p2", label: "Reacción 2" },
  { id: "resolucion.p2", label: "Resolución 2" },
  { id: "reaccion.p3", label: "Reacción 3" },
  { id: "resolucion.p3", label: "Resolución 3" },
  { id: "reaccion.p4", label: "Reacción 4" },
  { id: "resolucion.p4", label: "Resolución 4" },
  { id: "reaccion.up", label: "Reacción Preferentes" },
  { id: "resolucion.up", label: "Resolución Preferentes" },
] as const;

const MONTH_NAMES = [
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
];

export interface MensualSite {
  site: string;
  total: number;
}

export interface MensualCita {
  site: string;
  conCita: number;
  sinCita: number;
}

export interface MensualTop {
  categoria: string;
  total: number;
  anterior: number | null;
}

export interface MensualSla {
  id: string;
  label: string;
  share: number | null;
  anterior: number | null;
}

/** A site well above its own recent months, for the spoken close. */
export interface MensualDestacado {
  bloque: "workOrders" | "smartTech";
  site: string;
  total: number;
  media: number;
}

export interface InformeMensual {
  month: string | null;
  previousMonth: string | null;
  incidencias: {
    resueltas: number | null;
    abiertas: number | null;
    backlog: number | null;
  };
  encuestas: { numero: number | null; promedio: number | null };
  workOrders: MensualSite[];
  workOrdersTotal: number;
  peticionesDisponibles: boolean;
  peticiones: {
    origen: string;
    backlog: number | null;
    liberadas: number | null;
    gestionadas: number | null;
  }[];
  imacs: { solicitudes: number; trabajos: number };
  smartTech: MensualCita[];
  smartTechConCita: number;
  smartTechSinCita: number;
  topTen: MensualTop[];
  slas: MensualSla[];
  renove: { espana: number; holding: number };
  wasp: number | null;
  /** Opened incidents of the six months before, averaged; null without history. */
  incidenciasMedia: number | null;
  destacados: MensualDestacado[];
}

export interface MensualLabels {
  workOrder: (raw: string) => string;
  smartTech: (raw: string) => string;
  workOrderSites: string[];
  smartTechSites: string[];
}

/** `YYYY-MM-DD` cut as `YYYY/MM`, or null when the cut is not a date. */
export function reportedMonth(asOf: string | null | undefined): string | null {
  if (typeof asOf !== "string") {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-\d{2}/.exec(asOf.trim());

  if (!match) {
    return null;
  }

  const month = Number(match[2]);

  if (month < 1 || month > 12) {
    return null;
  }

  return `${match[1]}/${match[2]}`;
}

/**
 * Month the close reports by default: the one before the extraction.
 *
 * The close is written once a month is over, from an extract taken in the
 * next one, which is also how the template reads it: tab 13-12 is "SLAs
 * finalizados mes anterior". The editor can pick another month.
 */
export function closedMonth(asOf: string | null | undefined): string | null {
  const month = reportedMonth(asOf);

  return month === null ? null : previousMonth(month);
}

export function previousMonth(month: string): string {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7));

  if (index <= 1) {
    return `${year - 1}/12`;
  }

  return `${year}/${String(index - 1).padStart(2, "0")}`;
}

/** `2026/09` as `septiembre 2026`. */
export function monthName(month: string): string {
  const index = Number(month.slice(5, 7)) - 1;
  const name = MONTH_NAMES[index] ?? month;

  return `${name} ${month.slice(0, 4)}`;
}

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function slaSlot(svt: string): string | null {
  const key = fold(svt).toLowerCase();
  const kind = key.includes("resolucion")
    ? "resolucion"
    : key.includes("reaccion")
      ? "reaccion"
      : null;

  if (kind === null) {
    return null;
  }

  if (key.includes(".up.") || key.includes("preferente")) {
    return `${kind}.up`;
  }

  const level = /\.p([1-4])\./.exec(key);

  return level ? `${kind}.p${level[1]}` : null;
}

function shareOf(cumplido: number, incumplido: number): number | null {
  const measured = cumplido + incumplido;

  return measured > 0 ? cumplido / measured : null;
}

function metricOf(
  rows: { mes: string; metrica: string; total: number }[] | undefined,
  month: string,
  metrica: string
): number | null {
  const matches = (rows ?? []).filter(
    (row) => row.mes === month && fold(row.metrica) === fold(metrica)
  );

  if (matches.length === 0) {
    return null;
  }

  return matches.reduce((sum, row) => sum + row.total, 0);
}

interface SiteBucket {
  site: string;
  conCita: number;
  sinCita: number;
  total: number;
}

function siteBuckets(
  present: { raw: string; conCita: number; sinCita: number; total: number }[],
  labelOf: (raw: string) => string,
  sites: string[]
): SiteBucket[] {
  const bySite = new Map<string, SiteBucket>();

  const ensure = (site: string) => {
    const current = bySite.get(site);

    if (current) {
      return current;
    }

    const created = { site, conCita: 0, sinCita: 0, total: 0 };
    bySite.set(site, created);
    return created;
  };

  for (const site of sites) {
    ensure(site);
  }

  const unmapped: string[] = [];

  for (const row of present) {
    const site = labelOf(row.raw);

    if (site === "") {
      continue;
    }

    if (!bySite.has(site)) {
      unmapped.push(site);
    }

    const bucket = ensure(site);
    bucket.conCita += row.conCita;
    bucket.sinCita += row.sinCita;
    bucket.total += row.total;
  }

  const ordered = sites.filter((site) => bySite.has(site));

  for (const site of unmapped) {
    if (!ordered.includes(site)) {
      ordered.push(site);
    }
  }

  return ordered.map((site) => bySite.get(site)!);
}

export function buildInformeMensual(
  dataset: InformaticaDataset,
  month: string | null,
  labels: MensualLabels
): InformeMensual {
  const previous = month ? previousMonth(month) : null;
  const onsite = dataset.incidenciasOnsite ?? [];
  const hasOnsite = month !== null && onsite.some((row) => row.mes === month);
  // Backlog is the Pendiente stock of the extract, whatever month it opened
  // in, so it lives on the extraction month. The close of August read from a
  // September extract takes that stock; an older month's close never does.
  const backlogRow =
    month === null
      ? undefined
      : onsite
          .filter((row) => fold(row.metrica) === "BACKLOG" && row.mes >= month)
          .sort((left, right) => left.mes.localeCompare(right.mes))[0];

  const surveys = (dataset.encuestas ?? []).filter((row) => row.mes === month);
  let surveyCount = 0;
  let surveyWeight = 0;

  for (const row of surveys) {
    const score = Number(String(row.valoracion).replace(",", "."));

    surveyCount += row.respuestas;

    if (Number.isFinite(score)) {
      surveyWeight += score * row.respuestas;
    }
  }

  const workMap = new Map<string, { raw: string; total: number }>();

  for (const row of dataset.workOrders ?? []) {
    if (row.mes !== month) {
      continue;
    }

    const current = workMap.get(row.edificio) ?? { raw: row.edificio, total: 0 };
    current.total += row.ordenes;
    workMap.set(row.edificio, current);
  }

  const workSites = siteBuckets(
    Array.from(workMap.values()).map((row) => ({
      raw: row.raw,
      conCita: 0,
      sinCita: 0,
      total: row.total,
    })),
    labels.workOrder,
    labels.workOrderSites
  );

  const citaMap = new Map<string, { raw: string; conCita: number; sinCita: number }>();

  for (const row of dataset.citas ?? []) {
    if (row.mes !== month) {
      continue;
    }

    const current = citaMap.get(row.edificio) ?? {
      raw: row.edificio,
      conCita: 0,
      sinCita: 0,
    };
    const tipo = fold(row.tipo);

    if (tipo === "CON CITA") {
      current.conCita += row.citas;
    } else if (tipo === "SIN CITA") {
      current.sinCita += row.citas;
    }

    citaMap.set(row.edificio, current);
  }

  const smartSites = siteBuckets(
    Array.from(citaMap.values()).map((row) => ({
      raw: row.raw,
      conCita: row.conCita,
      sinCita: row.sinCita,
      total: row.conCita + row.sinCita,
    })),
    labels.smartTech,
    labels.smartTechSites
  );

  const peticionRows = (dataset.peticionesMes ?? []).filter((row) => row.mes === month);
  const peticionesDisponibles = peticionRows.length > 0;

  // A state with no row at all is a file that was not uploaded, not a zero.
  const cell = (origen: string, estado: string): number | null => {
    if (!peticionRows.some((row) => fold(row.estado) === fold(estado))) {
      return null;
    }

    return peticionRows
      .filter((row) => fold(row.origen) === fold(origen) && fold(row.estado) === fold(estado))
      .reduce((sum, row) => sum + row.total, 0);
  };

  const topOf = (target: string | null) => {
    const totals = new Map<string, number>();

    for (const row of dataset.hic ?? []) {
      if (row.mes !== target || fold(row.metrica) !== "INCIDENCIAS") {
        continue;
      }

      if (!fold(row.ambito).startsWith("2-2")) {
        continue;
      }

      const categoria = fold(row.categoria);
      totals.set(categoria, (totals.get(categoria) ?? 0) + row.total);
    }

    return totals;
  };

  const currentTop = topOf(month);
  const previousTop = topOf(previous);

  const slaOf = (target: string | null) => {
    const totals = new Map<string, { cumplido: number; incumplido: number }>();

    for (const row of dataset.slas ?? []) {
      if (row.mes !== target) {
        continue;
      }

      const slot = slaSlot(row.svt);

      if (slot === null) {
        continue;
      }

      const current = totals.get(slot) ?? { cumplido: 0, incumplido: 0 };
      current.cumplido += row.cumplido;
      current.incumplido += row.incumplido;
      totals.set(slot, current);
    }

    return totals;
  };

  const currentSla = slaOf(month);
  const previousSla = slaOf(previous);
  // A level with no ticket in a month that has results had nothing to
  // breach: the service publishes it as 100 %, as it did for P1 in August.
  const slaShare = (
    totals: Map<string, { cumplido: number; incumplido: number }>,
    id: string
  ): number | null => {
    if (totals.size === 0) {
      return null;
    }

    const found = totals.get(id);

    return found ? (shareOf(found.cumplido, found.incumplido) ?? 1) : 1;
  };

  let espana = 0;
  let holding = 0;
  let wasp = 0;
  let waspRows = 0;

  for (const row of dataset.renove ?? []) {
    if (row.mes !== month || fold(row.estado) !== "RENOVADO") {
      continue;
    }

    if (fold(row.ambito) === "ESPANA") {
      espana += row.equipos;
    } else if (fold(row.ambito) === "HOLDING") {
      holding += row.equipos;
    }
  }

  for (const row of dataset.wasp ?? []) {
    if (row.mes !== month) {
      continue;
    }

    wasp += row.equipos;
    waspRows += 1;
  }

  let solicitudes = 0;
  let trabajos = 0;

  for (const row of dataset.imacs ?? []) {
    if (row.mes !== month) {
      continue;
    }

    const metrica = fold(row.metrica);

    if (metrica === "SOLICITUDES") {
      solicitudes += row.total;
    } else if (metrica === "INTERVENCIONES" || metrica === "TRABAJOS") {
      trabajos += row.total;
    }
  }

  return {
    month,
    previousMonth: previous,
    incidencias: {
      resueltas: hasOnsite ? metricOf(onsite, month!, "Resueltas") ?? 0 : null,
      abiertas: hasOnsite ? metricOf(onsite, month!, "Abiertas") ?? 0 : null,
      backlog: backlogRow ? backlogRow.total : null,
    },
    encuestas: {
      numero: month === null || surveys.length === 0 ? null : surveyCount,
      promedio:
        surveyCount > 0 ? Math.round((surveyWeight / surveyCount) * 100) / 100 : null,
    },
    workOrders: workSites.map((row) => ({ site: row.site, total: row.total })),
    workOrdersTotal: workSites.reduce((sum, row) => sum + row.total, 0),
    peticionesDisponibles,
    peticiones: PETICIONES_ORIGENES.map((origen) => ({
      origen,
      backlog: cell(origen, "Backlog"),
      liberadas: cell(origen, "Liberadas"),
      gestionadas: cell(origen, "Gestionadas"),
    })),
    imacs: { solicitudes, trabajos },
    smartTech: smartSites.map((row) => ({
      site: row.site,
      conCita: row.conCita,
      sinCita: row.sinCita,
    })),
    smartTechConCita: smartSites.reduce((sum, row) => sum + row.conCita, 0),
    smartTechSinCita: smartSites.reduce((sum, row) => sum + row.sinCita, 0),
    topTen: TOP_TEN_MENSUAL.map((categoria) => ({
      categoria,
      total: currentTop.get(categoria) ?? 0,
      anterior: previous === null ? null : previousTop.get(categoria) ?? 0,
    })),
    slas: SLA_SLOTS.map((slot) => ({
      id: slot.id,
      label: slot.label,
      share: slaShare(currentSla, slot.id),
      // Only a measured level is compared: a filled 100 % would read as a drop.
      anterior: previousSla.has(slot.id)
        ? shareOf(previousSla.get(slot.id)!.cumplido, previousSla.get(slot.id)!.incumplido)
        : null,
    })),
    renove: { espana, holding },
    wasp: waspRows > 0 ? wasp : null,
    incidenciasMedia: month === null ? null : incidentAverage(onsite, month),
    destacados:
      month === null
        ? []
        : [
            ...standouts(
              "workOrders",
              month,
              (dataset.workOrders ?? []).map((row) => ({
                mes: row.mes,
                site: labels.workOrder(row.edificio),
                total: row.ordenes,
              }))
            ),
            ...standouts(
              "smartTech",
              month,
              (dataset.citas ?? []).map((row) => ({
                mes: row.mes,
                site: labels.smartTech(row.edificio),
                total: row.citas,
              }))
            ),
          ],
  };
}

/** Months compared against: the six before the reported one. */
const HISTORY_MONTHS = 6;

function monthsBefore(month: string, count: number): string[] {
  const months: string[] = [];
  let cursor = month;

  for (let index = 0; index < count; index += 1) {
    cursor = previousMonth(cursor);
    months.push(cursor);
  }

  return months;
}

function incidentAverage(
  rows: { mes: string; metrica: string; total: number }[],
  month: string
): number | null {
  const values = monthsBefore(month, HISTORY_MONTHS)
    .map((target) => metricOf(rows, target, "Abiertas"))
    .filter((value): value is number => value !== null);

  if (values.length === 0) {
    return null;
  }

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/**
 * Sites of the month at least a fifth above their own average of the six
 * months before, and by at least ten, largest excess first, two at most.
 * Only months the site had activity in count toward its average.
 */
function standouts(
  bloque: MensualDestacado["bloque"],
  month: string,
  rows: { mes: string; site: string; total: number }[]
): MensualDestacado[] {
  const history = new Set(monthsBefore(month, HISTORY_MONTHS));
  const current = new Map<string, number>();
  const past = new Map<string, Map<string, number>>();

  for (const row of rows) {
    if (row.site === "") {
      continue;
    }

    if (row.mes === month) {
      current.set(row.site, (current.get(row.site) ?? 0) + row.total);
    } else if (history.has(row.mes)) {
      const byMonth = past.get(row.site) ?? new Map<string, number>();
      byMonth.set(row.mes, (byMonth.get(row.mes) ?? 0) + row.total);
      past.set(row.site, byMonth);
    }
  }

  const found: MensualDestacado[] = [];

  for (const [site, total] of Array.from(current.entries())) {
    const months = Array.from(past.get(site)?.values() ?? []);

    if (months.length === 0) {
      continue;
    }

    const media = Math.round(months.reduce((sum, value) => sum + value, 0) / months.length);

    if (total >= media * 1.2 && total - media >= 10) {
      found.push({ bloque, site, total, media });
    }
  }

  return found
    .sort((left, right) => right.total - right.media - (left.total - left.media))
    .slice(0, 2);
}

function fmt(value: number | null): string {
  if (value === null) {
    return "0";
  }

  return value.toLocaleString("es-ES");
}

function pct(share: number): string {
  return `${Math.round(share * 100)} %`;
}

function capitalise(value: string): string {
  return value.length === 0 ? value : value.charAt(0).toUpperCase() + value.slice(1);
}

function joinList(items: string[]): string {
  if (items.length <= 1) {
    return items.join("");
  }

  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/** Share at or above which a level counts as met in the spoken close. */
const SLA_TARGET = 0.95;

/** Levels the close comments on: the ones that move month to month. */
const SLA_SPOKEN = ["reaccion.p3", "resolucion.p3", "reaccion.p4", "resolucion.p4"];

function slaSentence(slas: MensualSla[]): string | null {
  const spoken = SLA_SPOKEN.map((id) => slas.find((row) => row.id === id)).filter(
    (row): row is MensualSla => row !== undefined && row.share !== null
  );

  if (spoken.length === 0) {
    return null;
  }

  const moved = (row: MensualSla) =>
    row.anterior !== null && Math.round(row.anterior * 100) !== Math.round(row.share! * 100);
  const down = spoken.filter((row) => moved(row) && row.share! < row.anterior!);
  const up = spoken.filter((row) => moved(row) && row.share! > row.anterior!);
  const clauses: string[] = [];

  if (down.length > 0) {
    clauses.push(`bajando ${joinList(down.map((row) => `${row.label} al ${pct(row.share!)}`))}`);
  }

  if (up.length > 0) {
    clauses.push(`mejorando ${joinList(up.map((row) => `${row.label} al ${pct(row.share!)}`))}`);
  }

  // Judged on the published whole percent, so 94.8 % printed as 95 % is met.
  const missed = slas.filter(
    (row) => row.share !== null && Math.round(row.share * 100) < Math.round(SLA_TARGET * 100)
  );
  const detail = clauses.length > 0 ? ` ${clauses.join(" y ")}` : "";

  if (missed.length === 0) {
    return `Se han cumplido los SLA's${detail}.`;
  }

  return `En SLA's, quedan por debajo del ${pct(SLA_TARGET)} ${joinList(
    missed.map((row) => `${row.label} (${pct(row.share!)})`)
  )}${clauses.length > 0 ? `,${detail}` : ""}.`;
}

/**
 * Spoken close of the month, in the order of the service's own mail.
 *
 * The numbers come from the extract. The casuística that is not in the files
 * (a migration, a bad software push, WASP) is the optional `narracion` the
 * editor writes; it is copied in as typed and never invented here.
 */
export function informeMensualSpeech(informe: InformeMensual, narracion: string): string {
  const parts: string[] = [];
  const name = informe.month ? capitalise(MONTH_NAMES[Number(informe.month.slice(5, 7)) - 1] ?? "") : "";

  parts.push(`Buenas tardes, os comparto el informe mensual${name ? ` de ${name}` : ""}.`);

  const note = narracion.trim();

  if (note) {
    parts.push(note);
  }

  const { incidencias } = informe;

  if (incidencias.abiertas !== null && incidencias.resueltas !== null) {
    let sentence = `En incidencias se han abierto ${fmt(incidencias.abiertas)} y resuelto ${fmt(incidencias.resueltas)}`;

    if (incidencias.backlog !== null) {
      sentence += `, con un backlog de ${fmt(incidencias.backlog)}`;
    }

    if (informe.incidenciasMedia !== null && informe.incidenciasMedia > 0) {
      const ratio = incidencias.abiertas / informe.incidenciasMedia;
      const trend =
        ratio >= 1.1 ? "por encima de" : ratio <= 0.9 ? "por debajo de" : "en línea con";
      sentence += `; ${trend} la media de los seis meses anteriores (${fmt(informe.incidenciasMedia)})`;
    }

    parts.push(`${sentence}.`);
  }

  const volume: string[] = [];

  if (informe.encuestas.numero !== null && informe.encuestas.promedio !== null) {
    volume.push(
      `Las encuestas del mes son ${fmt(informe.encuestas.numero)}, con un promedio de ${informe.encuestas.promedio.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`
    );
  }

  const citas = informe.smartTechConCita + informe.smartTechSinCita;

  if (informe.workOrdersTotal > 0) {
    volume.push(`Los work orders suman ${fmt(informe.workOrdersTotal)}.`);
  }

  if (citas > 0) {
    volume.push(
      `Smart Tech suma ${fmt(citas)} citas, ${fmt(informe.smartTechConCita)} con cita y ${fmt(informe.smartTechSinCita)} sin cita.`
    );
  }

  if (volume.length > 0) {
    parts.push(volume.join(" "));
  }

  const standout = (bloque: MensualDestacado["bloque"], lead: string) => {
    const rows = informe.destacados.filter((row) => row.bloque === bloque);

    if (rows.length === 0) {
      return;
    }

    parts.push(
      `${lead} ${joinList(
        rows.map((row) => `${row.site} con ${fmt(row.total)} (media ${fmt(row.media)})`)
      )}, por encima de su media de los seis meses anteriores.`
    );
  };

  standout("smartTech", "En Smart Tech destaca");
  standout("workOrders", "En work orders destaca");

  const rises = informe.topTen
    .filter((row) => row.anterior !== null && row.total > row.anterior)
    .sort((left, right) => right.total - (right.anterior ?? 0) - (left.total - (left.anterior ?? 0)))
    .slice(0, 2);

  if (rises.length > 0) {
    const bits = rises.map(
      (row) => `${row.categoria} pasa de ${fmt(row.anterior)} a ${fmt(row.total)}`
    );
    parts.push(`En el top de incidencias, ${joinList(bits)}.`);
  } else {
    const leader = [...informe.topTen].sort((left, right) => right.total - left.total)[0];

    if (leader && leader.total > 0) {
      parts.push(
        `En el top de incidencias, ${leader.categoria} concentra ${fmt(leader.total)}.`
      );
    }
  }

  const renovados = informe.renove.espana + informe.renove.holding;

  if (renovados > 0) {
    parts.push(
      `Se han renovado ${fmt(renovados)} equipos, ${fmt(informe.renove.espana)} de España y ${fmt(informe.renove.holding)} de Holding.`
    );
  }

  if (informe.wasp !== null && informe.wasp > 0) {
    parts.push(`En WASP se han instalado ${fmt(informe.wasp)} equipos en el mes.`);
  }

  const sla = slaSentence(informe.slas);

  if (sla) {
    parts.push(sla);
  }

  parts.push("Un saludo.");

  return parts.join("\n\n");
}
