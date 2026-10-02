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
}

export interface MensualSla {
  id: string;
  label: string;
  share: number | null;
}

export interface InformeMensual {
  month: string | null;
  workOrders: MensualSite[];
  peticiones: {
    origen: string;
    backlog: number | null;
    liberadas: number | null;
    gestionadas: number | null;
  }[];
  imacs: { solicitudes: number; trabajos: number };
  smartTech: MensualCita[];
  topTen: MensualTop[];
  slas: MensualSla[];
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
    workOrders: workSites.map((row) => ({ site: row.site, total: row.total })),
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
    topTen: TOP_TEN_MENSUAL.map((categoria) => ({
      categoria,
      total: currentTop.get(categoria) ?? 0,
    })),
    slas: SLA_SLOTS.map((slot) => ({
      id: slot.id,
      label: slot.label,
      share: slaShare(currentSla, slot.id),
    })),
  };
}

function fmt(value: number | null): string {
  if (value === null) {
    return "0";
  }

  // Spoken figures group thousands even with four digits: 1.303, not 1303.
  return value.toLocaleString("es-ES", { useGrouping: "always" });
}

function pct(share: number): string {
  return `${Math.round(share * 100)} %`;
}

function joinList(items: string[]): string {
  if (items.length <= 1) {
    return items.join("");
  }

  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/** Share at or above which a level counts as met in the spoken close. */
const SLA_TARGET = 0.95;

/** Judged on the published whole percent, so 94.8 % printed as 95 % is met. */
function slaSentence(slas: MensualSla[]): string | null {
  const measured = slas.filter((row) => row.share !== null);

  if (measured.length === 0) {
    return null;
  }

  const missed = measured.filter(
    (row) => Math.round(row.share! * 100) < Math.round(SLA_TARGET * 100)
  );

  if (missed.length === 0) {
    return "Se han cumplido los SLA's.";
  }

  return `En SLA's, quedan por debajo del ${pct(SLA_TARGET)} ${joinList(
    missed.map((row) => `${row.label} (${pct(row.share!)})`)
  )}.`;
}

/** The two monthly slides, as they are drawn and as the speech reads them. */
export interface MensualSlides {
  month: string | null;
  incidencias: MesCerrado["incidencias"];
  encuestas: MesCerrado["encuestas"];
  peticiones: InformeMensual["peticiones"];
  /** Null when the IMAC file has no row in the month. */
  imacs: InformeMensual["imacs"] | null;
  /** By SmartTech site, alphabetical, the unmapped Sede bucket last. */
  workOrders: MensualSite[];
  smartTech: MensualCita[];
  /** Largest first; null when the HIC pivot has no column for the month. */
  topTen: MensualTop[] | null;
  slas: MensualSla[];
}

/** One site against its own previous month and recent average. */
export interface MensualEvolucion {
  site: string;
  total: number;
  anterior: number;
  /** Average of the six months before; null without history. */
  media: number | null;
  /** What the site's figure is made of: work-order types, or con / sin cita. */
  desglose: { nombre: string; total: number; anterior: number }[];
}

/** What the speech compares the month against. The slides do not draw it. */
export interface MensualComparativa {
  previousMonth: string | null;
  incidencias: { anterior: number | null; media: number | null };
  /** The top ten of the previous month; null without that HIC column. */
  topTenAnterior: MensualTop[] | null;
  workOrders: MensualEvolucion[];
  /** Null when the previous month has no work order at all. */
  workOrdersAnterior: number | null;
  smartTech: MensualEvolucion[];
  smartTechAnterior: number | null;
}

/** A move worth saying in a meeting: at least ten, and a sixth of the base. */
function relevante(delta: number, base: number): boolean {
  return Math.abs(delta) >= 10 && (base === 0 || Math.abs(delta) >= base * 0.15);
}

function signedPct(delta: number, base: number): string {
  const value = Math.round((delta / base) * 100);

  return `${value > 0 ? "+" : ""}${value} %`;
}

/** Month name as it reads mid-sentence in Spanish: `agosto`. */
function monthWord(month: string | null): string {
  return month ? (MONTH_NAMES[Number(month.slice(5, 7)) - 1] ?? "") : "";
}

/** `416, 342 menos que en Julio (−45 %)`, or nothing without a base. */
function versus(total: number, anterior: number | null, previous: string | null): string {
  if (anterior === null || anterior === 0 || previous === null) {
    return "";
  }

  const delta = total - anterior;

  if (delta === 0) {
    return `, igual que en ${monthWord(previous)}`;
  }

  return `, ${fmt(Math.abs(delta))} ${delta > 0 ? "más" : "menos"} que en ${monthWord(previous)} (${fmt(anterior)}, ${signedPct(delta, anterior)})`;
}

function trendAgainst(total: number, media: number | null): string | null {
  if (media === null || media === 0) {
    return null;
  }

  const ratio = total / media;
  const where =
    ratio >= 1.1 ? "por encima de" : ratio <= 0.9 ? "por debajo de" : "en línea con";

  return `${where} la media de los seis meses anteriores (${fmt(media)})`;
}

/** The part that moved most in the same direction as the whole. */
function mainDriver(
  desglose: MensualEvolucion["desglose"],
  direction: number
): { nombre: string; delta: number } | null {
  const moved = desglose
    .map((part) => ({ nombre: part.nombre, delta: part.total - part.anterior }))
    .filter((part) => Math.sign(part.delta) === Math.sign(direction) && part.delta !== 0)
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta));

  return moved[0] ?? null;
}

/**
 * Sentences on the sites of one block: who carries the volume, where it grew
 * most and why, where it fell most, and a site far above its own average.
 */
function siteAnalysis(
  rows: MensualEvolucion[],
  unit: string,
  hasPrevious: boolean
): string[] {
  const sentences: string[] = [];
  const leader = [...rows].sort((left, right) => right.total - left.total)[0];

  if (leader && leader.total > 0) {
    sentences.push(`${leader.site} concentra el mayor volumen, con ${fmt(leader.total)} ${unit}.`);
  }

  if (!hasPrevious) {
    return sentences;
  }

  const moves = rows
    .map((row) => ({ row, delta: row.total - row.anterior }))
    .filter(({ row, delta }) => relevante(delta, row.anterior));
  const rise = moves.filter((move) => move.delta > 0).sort((l, r) => r.delta - l.delta)[0];
  const fall = moves.filter((move) => move.delta < 0).sort((l, r) => l.delta - r.delta)[0];
  const because = (row: MensualEvolucion, delta: number) => {
    const driver = mainDriver(row.desglose, delta);

    return driver && relevante(driver.delta, 0)
      ? `, sobre todo por ${driver.nombre} (${driver.delta > 0 ? "+" : ""}${fmt(driver.delta)})`
      : "";
  };

  if (rise) {
    sentences.push(
      `${rise.row.site === leader?.site ? "Es también donde más crecen" : `Donde más crecen es en ${rise.row.site}`}, de ${fmt(rise.row.anterior)} a ${fmt(rise.row.total)}${because(rise.row, rise.delta)}.`
    );
  }

  if (fall) {
    const where =
      fall.row.site === leader?.site
        ? "Es también donde más baja"
        : `La mayor bajada es en ${fall.row.site}`;

    sentences.push(
      `${where}, de ${fmt(fall.row.anterior)} a ${fmt(fall.row.total)}${because(fall.row, fall.delta)}.`
    );
  }

  const named = new Set([rise?.row.site, fall?.row.site, leader?.site]);
  const standout = rows
    .filter(
      (row) =>
        !named.has(row.site) &&
        row.media !== null &&
        row.total >= row.media * 1.3 &&
        row.total - row.media >= 10
    )
    .sort((left, right) => right.total - right.media! - (left.total - left.media!))[0];

  if (standout) {
    sentences.push(
      `${standout.site} queda muy por encima de su media de seis meses, ${fmt(standout.total)} frente a ${fmt(standout.media)}.`
    );
  }

  return sentences;
}

/**
 * Spoken close of the month, as someone presenting the two monthly slides in a
 * meeting: the figures they show, what moved against the previous month and
 * the six before, where it moved and why, as far as the data tells.
 *
 * The casuística that is not in the files (a migration, a bad software push)
 * is the optional `narracion` the editor writes; it is copied in as typed and
 * never invented here.
 */
export function informeMensualSpeech(
  slides: MensualSlides,
  comparativa: MensualComparativa,
  narracion: string
): string {
  const parts: string[] = [];
  const name = monthWord(slides.month);
  const previous = comparativa.previousMonth;

  parts.push(`Buenas tardes, os comparto el informe mensual${name ? ` de ${name}` : ""}.`);

  const note = narracion.trim();

  if (note) {
    parts.push(note);
  }

  const { incidencias, encuestas } = slides;
  const service: string[] = [];

  if (incidencias.abiertas !== null) {
    let sentence = `En incidencias On Site se han abierto ${fmt(incidencias.abiertas)}`;

    if (incidencias.resueltas !== null) {
      sentence += ` y resuelto ${fmt(incidencias.resueltas)}`;
    }

    if (incidencias.backlog !== null) {
      sentence += `, con un backlog de ${fmt(incidencias.backlog)}`;
    }

    service.push(`${sentence}.`);

    const change = versus(
      incidencias.abiertas,
      comparativa.incidencias.anterior,
      previous
    ).replace(/^, /, "");
    const trend = trendAgainst(incidencias.abiertas, comparativa.incidencias.media);

    if (change && trend) {
      service.push(`Son ${change} y quedan ${trend}.`);
    } else if (change) {
      service.push(`Son ${change}.`);
    } else if (trend) {
      service.push(`Quedan ${trend}.`);
    }

    const direction =
      comparativa.incidencias.anterior === null
        ? 0
        : incidencias.abiertas - comparativa.incidencias.anterior;

    if (slides.topTen !== null && comparativa.topTenAnterior !== null && direction !== 0) {
      const before = new Map(comparativa.topTenAnterior.map((row) => [row.categoria, row.total]));
      const driver = mainDriver(
        slides.topTen.map((row) => ({
          nombre: row.categoria,
          total: row.total,
          anterior: before.get(row.categoria) ?? 0,
        })),
        direction
      );

      if (driver && relevante(driver.delta, 0)) {
        const from = before.get(driver.nombre) ?? 0;
        service.push(
          `${direction > 0 ? "El aumento" : "El descenso"} viene sobre todo de ${driver.nombre}, que pasa de ${fmt(from)} a ${fmt(from + driver.delta)}.`
        );
      }
    }
  }

  if (slides.topTen !== null) {
    const top = slides.topTen
      .filter((row) => row.total > 0)
      .slice(0, 3)
      .map((row) => `${row.categoria} (${fmt(row.total)})`);

    if (top.length > 0) {
      service.push(`Por categorías, lideran ${joinList(top)}.`);
    }
  }

  if (encuestas.numero !== null && encuestas.promedio !== null) {
    service.push(
      `Las encuestas del mes son ${fmt(encuestas.numero)}, con un promedio de ${encuestas.promedio.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`
    );
  }

  if (service.length > 0) {
    parts.push(service.join(" "));
  }

  const workTotal = slides.workOrders.reduce((sum, row) => sum + row.total, 0);

  if (workTotal > 0) {
    parts.push(
      [
        `Los work orders suman ${fmt(workTotal)}${versus(workTotal, comparativa.workOrdersAnterior, previous)}.`,
        ...siteAnalysis(comparativa.workOrders, "work orders", comparativa.workOrdersAnterior !== null),
      ].join(" ")
    );
  }

  const conCita = slides.smartTech.reduce((sum, row) => sum + row.conCita, 0);
  const sinCita = slides.smartTech.reduce((sum, row) => sum + row.sinCita, 0);

  if (conCita + sinCita > 0) {
    parts.push(
      [
        `Smart Tech suma ${fmt(conCita + sinCita)} citas, ${fmt(conCita)} con cita y ${fmt(sinCita)} sin cita${versus(conCita + sinCita, comparativa.smartTechAnterior, previous)}.`,
        ...siteAnalysis(comparativa.smartTech, "citas", comparativa.smartTechAnterior !== null),
      ].join(" ")
    );
  }

  const requests: string[] = [];
  const peticionTotal = (key: "backlog" | "liberadas" | "gestionadas") => {
    const cells = slides.peticiones.map((row) => row[key]);

    return cells.every((cell) => cell === null)
      ? null
      : cells.reduce<number>((sum, cell) => sum + (cell ?? 0), 0);
  };
  const peticionBits = (
    [
      ["backlog", (value: number) => `un backlog de ${fmt(value)}`],
      ["liberadas", (value: number) => `${fmt(value)} liberadas`],
      ["gestionadas", (value: number) => `${fmt(value)} gestionadas`],
    ] as const
  ).flatMap(([key, say]) => {
    const value = peticionTotal(key);

    return value === null ? [] : [say(value)];
  });

  if (peticionBits.length > 0) {
    requests.push(`En peticiones hay ${joinList(peticionBits)}.`);
  }

  if (slides.imacs !== null) {
    requests.push(
      `En IMACS se han gestionado ${fmt(slides.imacs.solicitudes)} solicitudes con ${fmt(slides.imacs.trabajos)} trabajos.`
    );
  }

  if (requests.length > 0) {
    parts.push(requests.join(" "));
  }

  const sla = slaSentence(slides.slas);

  if (sla) {
    parts.push(sla);
  }

  parts.push("Un saludo.");

  return parts.join("\n\n");
}

export interface MesCerrado {
  month: string | null;
  incidencias: {
    /**
     * Rows opened in the month now in Resuelto or Cerrado. It need not match
     * Abiertas: the service closes tickets of other months too.
     */
    resueltas: number | null;
    /** Rows opened in the month, any state. */
    abiertas: number | null;
    /**
     * Pendiente rows of any month, the stock of the extract. It is filed on the
     * extraction month, so the closed month takes the first stock after it.
     */
    backlog: number | null;
  };
  encuestas: {
    /** Every survey of the month (tab 1-1, column Fecha). */
    numero: number | null;
    /** Mean score weighted by responses, as the weekly survey slide reads it. */
    promedio: number | null;
  };
}

function backlogFrom(
  rows: { mes: string; metrica: string; total: number }[],
  month: string
): number | null {
  const stock = rows
    .filter((row) => fold(row.metrica) === "BACKLOG" && row.mes >= month)
    .sort((left, right) => left.mes.localeCompare(right.mes))[0];

  return stock ? stock.total : null;
}

/**
 * Tabs 7-7 and 1-1 for the month the monthly slides report: the month before
 * the extraction, since they are built from the extract of the 1st, or the
 * latest month of either section when the extract carries no date.
 */
export function mesCerrado(dataset: InformaticaDataset): MesCerrado {
  const onsite = dataset.incidenciasOnsite ?? [];
  const surveys = dataset.encuestas ?? [];
  const latest = [...onsite, ...surveys].reduce<string | null>(
    (last, row) => (last === null || row.mes > last ? row.mes : last),
    null
  );
  const month = closedMonth(dataset.source?.asOfDate) ?? latest;
  const hasOnsite = month !== null && onsite.some((row) => row.mes === month);
  let numero = 0;
  let weight = 0;

  for (const row of surveys) {
    if (row.mes !== month) {
      continue;
    }

    const score = Number(String(row.valoracion).replace(",", "."));

    numero += row.respuestas;

    if (Number.isFinite(score)) {
      weight += score * row.respuestas;
    }
  }

  return {
    month,
    incidencias: {
      resueltas: hasOnsite ? metricOf(onsite, month!, "Resueltas") ?? 0 : null,
      abiertas: hasOnsite ? metricOf(onsite, month!, "Abiertas") ?? 0 : null,
      backlog: hasOnsite ? backlogFrom(onsite, month!) : null,
    },
    encuestas: {
      numero: numero > 0 ? numero : null,
      promedio: numero > 0 ? weight / numero : null,
    },
  };
}
