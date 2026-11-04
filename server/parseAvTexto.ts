import { unwrapDriveCopiedTexto } from "./driveTexto.ts";
import { densifyWeeklyMatrix } from "./parseInformeWeekly.ts";
import type { WeeklyMatrix, WeeklyRow } from "../shared/deck/core.ts";
import type { InformeWeeklyDataset, SupportType } from "../shared/informe.ts";
import { INFORME_SUPPORT_TYPES, emptyWeeklyDataset, type TerritorialEventsData, type TerritorialEventMonth } from "../shared/informe.ts";
import {
  AV_TEXTO_HEADER,
  AV_TEXTO_META,
  AV_TEXTO_SECTIONS,
  AV_TEXTO_TYPE_BY_LABEL,
  comparisonsFromTexto,
  monthlyFromTexto,
  resolutionsFromTexto,
  type AvTextoComparativaRow,
  type AvTextoDocument,
  type AvTextoMensualRow,
  type AvTextoMeta,
  type AvTextoResolucionRow,
  type AvTextoUbicacionRow,
} from "../shared/modules/av/texto.ts";

export interface AvTextoParseResult {
  document: AvTextoDocument;
  weekly: InformeWeeklyDataset;
  monthly: ReturnType<typeof monthlyFromTexto>;
  comparisons: ReturnType<typeof comparisonsFromTexto>;
  resolutions: ReturnType<typeof resolutionsFromTexto>;
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function fail(at: number, message: string): never {
  throw new Error(`Texto AV, línea ${at}: ${message}`);
}

function readType(value: string | undefined, at: number): SupportType {
  const type = AV_TEXTO_TYPE_BY_LABEL[normalize(value ?? "")];
  if (!type) {
    fail(at, `tipo de soporte no reconocido: "${value ?? ""}".`);
  }
  return type;
}

function readInt(value: string | undefined, at: number, label: string): number {
  const parsed = Number(String(value ?? "").trim());
  if (!Number.isInteger(parsed)) {
    fail(at, `${label} no es un entero: "${value ?? ""}".`);
  }
  return parsed;
}

function readWeek(value: string | undefined, at: number): number {
  const week = readInt(value, at, "semana");
  if (week < 1 || week > 53) {
    fail(at, `semana fuera de rango: ${week}.`);
  }
  return week;
}

function cells(line: string): string[] {
  return line.split("\t");
}

function buildMatrix(
  entries: Array<{ week: number; label: string; tickets: number }>
): WeeklyMatrix | null {
  if (entries.length === 0) {
    return null;
  }

  const weeks = Array.from(new Set(entries.map((entry) => entry.week))).sort(
    (left, right) => left - right
  );
  const labels: string[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    if (!seen.has(entry.label)) {
      seen.add(entry.label);
      labels.push(entry.label);
    }
  }

  const totalsByLabelWeek = new Map<string, number>();
  for (const entry of entries) {
    const key = `${entry.label}\t${entry.week}`;
    totalsByLabelWeek.set(key, (totalsByLabelWeek.get(key) ?? 0) + entry.tickets);
  }

  const rows: WeeklyRow[] = labels.map((label) => {
    const values = weeks.map(
      (week) => totalsByLabelWeek.get(`${label}\t${week}`) ?? 0
    );
    return {
      label,
      values,
      total: values.reduce((sum, value) => sum + value, 0),
    };
  });
  const totals = weeks.map((_, index) =>
    rows.reduce((sum, row) => sum + (row.values[index] ?? 0), 0)
  );

  return densifyWeeklyMatrix({ weeks, rows, totals });
}

export function weeklyFromAvTexto(
  document: AvTextoDocument,
  stamp: { sourceFile: string | null; uploadedAt: string | null }
): InformeWeeklyDataset {
  const weekly = emptyWeeklyDataset();
  weekly.sourceFile = stamp.sourceFile;
  weekly.uploadedAt = stamp.uploadedAt;

  const locationsByType = Object.fromEntries(
    INFORME_SUPPORT_TYPES.map((type) => [type, [] as Array<{ week: number; label: string; tickets: number }>])
  ) as Record<SupportType, Array<{ week: number; label: string; tickets: number }>>;

  for (const row of document.ubicacion) {
    locationsByType[row.type].push({
      week: row.week,
      label: row.building,
      tickets: row.tickets,
    });
  }

  const remotos = document.resolucion
    .filter((row) => row.type === "Remotos")
    .map((row) => ({
      week: row.week,
      label: row.action || row.category,
      tickets: row.tickets,
    }));

  weekly.byType.Remotos.categories = buildMatrix(remotos);
  weekly.byType.Programados.locations = buildMatrix(locationsByType.Programados);
  weekly.byType.Presenciales.locations = buildMatrix(locationsByType.Presenciales);
  weekly.byType.Incidencias.locations = buildMatrix(locationsByType.Incidencias);
  weekly.byType.Correctivos.locations = buildMatrix(locationsByType.Correctivos);

  const metaWeek = Number(document.meta.week);
  const matrixWeeks = INFORME_SUPPORT_TYPES.flatMap((type) => {
    const matrix = weekly.byType[type].categories ?? weekly.byType[type].locations;
    return matrix?.weeks ?? [];
  });
  weekly.maxWeek =
    Number.isInteger(metaWeek) && metaWeek >= 1 && metaWeek <= 53
      ? metaWeek
      : matrixWeeks.length > 0
        ? Math.max(...matrixWeeks)
        : 0;

  return weekly;
}


function parseEventosExtrLines(lines: string[][]): TerritorialEventsData | null {
  if (lines.length === 0) return null;
  let resumen = "";
  const meses: TerritorialEventMonth[] = [];
  const totales: Record<string, number> = {};

  for (const parts of lines) {
    const first = parts[0]?.trim() ?? "";
    if (normalize(first) === "RESUMEN") {
      resumen = parts.slice(1).join("\t").trim();
      continue;
    }
    if (normalize(first) === "TOTAL") {
      totales.Galicia = Number(parts[1]) || 0;
      totales.Norte = Number(parts[2]) || 0;
      totales.Cataluña = Number(parts[3]) || 0;
      totales.Este = Number(parts[4]) || 0;
      totales.Sur = Number(parts[5]) || 0;
      totales.GC = Number(parts[6]) || 0;
      totales.Centro = Number(parts[7]) || 0;
      totales.Total = Number(parts[8]) || (
        (Number(parts[1]) || 0) +
        (Number(parts[2]) || 0) +
        (Number(parts[3]) || 0) +
        (Number(parts[4]) || 0) +
        (Number(parts[5]) || 0) +
        (Number(parts[6]) || 0) +
        (Number(parts[7]) || 0)
      );
      continue;
    }
    if (parts.length >= 8) {
      const g = Number(parts[1]) || 0;
      const n = Number(parts[2]) || 0;
      const c = Number(parts[3]) || 0;
      const e = Number(parts[4]) || 0;
      const s = Number(parts[5]) || 0;
      const gc = Number(parts[6]) || 0;
      const ce = Number(parts[7]) || 0;
      const tot = Number(parts[8]) || (g + n + c + e + s + gc + ce);
      meses.push({
        mes: first,
        galicia: g,
        norte: n,
        cataluna: c,
        este: e,
        sur: s,
        gc: gc,
        centro: ce,
        total: tot,
      });
    }
  }

  const withData = meses.filter(m => m.total > 0);
  const mesActual = withData.length > 0 ? withData[withData.length - 1].mes : (meses[meses.length - 1]?.mes ?? "Octubre");

  return {
    meses,
    totales,
    resumen,
    mesActual,
  };
}

export function parseAvTexto(input: string): AvTextoParseResult {
  const lines = unwrapDriveCopiedTexto(input).split("\n");

  if (normalize(lines[0] ?? "") !== normalize(AV_TEXTO_HEADER)) {
    throw new Error(
      `El texto no es un plano de AV: se esperaba "${AV_TEXTO_HEADER}" en la primera línea.`
    );
  }

  const document: AvTextoDocument = {
    meta: {},
    ubicacion: [],
    resolucion: [],
    mensual: [],
    comparativa: [],
    eventosExtr: null,
  };
  const rawEventosExtr: string[][] = [];

  let section: string | null = null;

  for (let index = 1; index < lines.length; index += 1) {
    const at = index + 1;
    const raw = lines[index] ?? "";
    const trimmed = raw.trim();

    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }

    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      section = trimmed.slice(1, -1).trim().toUpperCase();
      continue;
    }

    const parts = cells(raw);

    if (!section) {
      const key = normalize(parts[0] ?? "");
      const value = (parts[1] ?? "").trim();

      if (key === normalize(AV_TEXTO_META.week)) document.meta.week = value;
      else if (key === normalize(AV_TEXTO_META.year)) document.meta.year = value;
      else if (key === normalize(AV_TEXTO_META.generated)) document.meta.generated = value;
      else if (key === normalize(AV_TEXTO_META.source)) document.meta.source = value;
      else fail(at, `metadato desconocido: "${parts[0] ?? ""}".`);
      continue;
    }

    if (section === AV_TEXTO_SECTIONS.ubicacion) {
      if (parts.length < 4) fail(at, "se esperaban semana, tipo, edificio y tickets.");
      document.ubicacion.push({
        week: readWeek(parts[0], at),
        type: readType(parts[1], at),
        building: (parts[2] ?? "").trim(),
        tickets: readInt(parts[3], at, "tickets"),
      } satisfies AvTextoUbicacionRow);
      continue;
    }

    if (section === AV_TEXTO_SECTIONS.resolucion) {
      if (parts.length < 5) fail(at, "se esperaban semana, tipo, categoria, accion y tickets.");
      document.resolucion.push({
        week: readWeek(parts[0], at),
        type: readType(parts[1], at),
        category: (parts[2] ?? "").trim(),
        action: (parts[3] ?? "").trim(),
        tickets: readInt(parts[4], at, "tickets"),
      } satisfies AvTextoResolucionRow);
      continue;
    }

    if (section === AV_TEXTO_SECTIONS.mensual) {
      if (parts.length < 4) fail(at, "se esperaban anio, mes, tipo y tickets.");
      const month = readInt(parts[1], at, "mes");
      if (month < 1 || month > 12) fail(at, `mes fuera de rango: ${month}.`);
      document.mensual.push({
        year: readInt(parts[0], at, "anio"),
        month,
        type: readType(parts[2], at),
        tickets: readInt(parts[3], at, "tickets"),
      } satisfies AvTextoMensualRow);
      continue;
    }

    if (section === AV_TEXTO_SECTIONS.eventosExtr) {
      rawEventosExtr.push(parts);
      continue;
    }

    if (section === AV_TEXTO_SECTIONS.comparativa) {
      if (parts.length < 4) fail(at, "se esperaban anio, semana, tipo y tickets.");
      document.comparativa.push({
        year: readInt(parts[0], at, "anio"),
        week: readWeek(parts[1], at),
        type: readType(parts[2], at),
        tickets: readInt(parts[3], at, "tickets"),
      } satisfies AvTextoComparativaRow);
      continue;
    }

    fail(at, `sección desconocida: "${section}".`);
  }

  if (rawEventosExtr.length > 0) {
    document.eventosExtr = parseEventosExtrLines(rawEventosExtr);
  }

  const stamp = { sourceFile: null, uploadedAt: null };

  return {
    document,
    weekly: weeklyFromAvTexto(document, stamp),
    monthly: monthlyFromTexto(document.mensual, stamp, document.eventosExtr),
    comparisons: comparisonsFromTexto(document.comparativa),
    resolutions: resolutionsFromTexto(document.resolucion),
  };
}

export type { AvTextoMeta };
