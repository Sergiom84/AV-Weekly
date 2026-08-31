import type {
  InformeMonthlyDataset,
  ResolutionRow,
  SupportType,
  WeeklyComparison,
} from "./types.ts";
import { INFORME_SUPPORT_TYPES, emptyMonthlyDataset, emptyWeeklyDataset } from "./types.ts";

/**
 * Plain-text exchange format of the AV module.
 *
 * Drive hydrates Tendencias and writes this file. AV Weekly imports it as the
 * single weekly input. Same shape as AGA/Informatica: header, tab-separated
 * preamble, `[SECCION]` blocks, no column-header line.
 */
export const AV_TEXTO_HEADER = "AV TEXTO PLANO v1";

export const AV_TEXTO_SECTIONS = {
  /** `semana` `tipo` `edificio` `tickets` */
  ubicacion: "UBICACION",
  /** `semana` `tipo` `categoria` `accion` `tickets` */
  resolucion: "RESOLUCION",
  /** `anio` `mes` `tipo` `tickets` — `mes` is 1 to 12. */
  mensual: "MENSUAL",
  /** `anio` `semana` `tipo` `tickets` — previous-year weekly totals. */
  comparativa: "COMPARATIVA",
} as const;

export const AV_TEXTO_META = {
  week: "semana",
  year: "anio",
  generated: "generado",
  source: "origen",
} as const;

export interface AvTextoMeta {
  week?: string;
  year?: string;
  generated?: string;
  source?: string;
}

export const AV_TEXTO_TYPE_LABEL: Record<SupportType, string> = {
  Remotos: "REMOTO",
  Programados: "PROGRAMADO",
  Presenciales: "PRESENCIAL",
  Incidencias: "INCIDENCIA",
  Correctivos: "CORRECTIVO",
};

export const AV_TEXTO_TYPE_BY_LABEL: Record<string, SupportType> = {
  REMOTO: "Remotos",
  REMOTOS: "Remotos",
  PROGRAMADO: "Programados",
  PROGRAMADOS: "Programados",
  PRESENCIAL: "Presenciales",
  PRESENCIALES: "Presenciales",
  INCIDENCIA: "Incidencias",
  INCIDENCIAS: "Incidencias",
  CORRECTIVO: "Correctivos",
  CORRECTIVOS: "Correctivos",
};

export interface AvTextoUbicacionRow {
  week: number;
  type: SupportType;
  building: string;
  tickets: number;
}

export interface AvTextoResolucionRow {
  week: number;
  type: SupportType;
  category: string;
  action: string;
  tickets: number;
}

export interface AvTextoMensualRow {
  year: number;
  month: number;
  type: SupportType;
  tickets: number;
}

export interface AvTextoComparativaRow {
  year: number;
  week: number;
  type: SupportType;
  tickets: number;
}

export interface AvTextoDocument {
  meta: AvTextoMeta;
  ubicacion: AvTextoUbicacionRow[];
  resolucion: AvTextoResolucionRow[];
  mensual: AvTextoMensualRow[];
  comparativa: AvTextoComparativaRow[];
}

const TAB = "\t";

function line(...cells: (string | number)[]): string {
  return cells.join(TAB);
}

function section(name: string, rows: string[]): string[] {
  return rows.length === 0 ? [] : ["", `[${name}]`, ...rows];
}

export function serializeAvTexto(document: AvTextoDocument): string {
  const preamble = [
    AV_TEXTO_HEADER,
    ...(document.meta.week ? [line(AV_TEXTO_META.week, document.meta.week)] : []),
    ...(document.meta.year ? [line(AV_TEXTO_META.year, document.meta.year)] : []),
    ...(document.meta.generated ? [line(AV_TEXTO_META.generated, document.meta.generated)] : []),
    ...(document.meta.source ? [line(AV_TEXTO_META.source, document.meta.source)] : []),
  ];

  const body = [
    ...section(
      AV_TEXTO_SECTIONS.ubicacion,
      document.ubicacion.map((row) =>
        line(row.week, AV_TEXTO_TYPE_LABEL[row.type], row.building, row.tickets)
      )
    ),
    ...section(
      AV_TEXTO_SECTIONS.resolucion,
      document.resolucion.map((row) =>
        line(
          row.week,
          AV_TEXTO_TYPE_LABEL[row.type],
          row.category,
          row.action,
          row.tickets
        )
      )
    ),
    ...section(
      AV_TEXTO_SECTIONS.mensual,
      document.mensual.map((row) =>
        line(row.year, row.month, AV_TEXTO_TYPE_LABEL[row.type], row.tickets)
      )
    ),
    ...section(
      AV_TEXTO_SECTIONS.comparativa,
      document.comparativa.map((row) =>
        line(row.year, row.week, AV_TEXTO_TYPE_LABEL[row.type], row.tickets)
      )
    ),
  ];

  return [...preamble, ...body, ""].join("\n");
}

export function emptyMonths(): (number | null)[] {
  return Array.from({ length: 12 }, () => null);
}

export function monthlyFromTexto(
  rows: AvTextoMensualRow[],
  stamp: { sourceFile: string | null; uploadedAt: string | null }
): InformeMonthlyDataset {
  if (rows.length === 0) {
    return emptyMonthlyDataset();
  }

  const byType = emptyMonthlyDataset().byType;

  for (const row of rows) {
    const year = String(row.year);
    const series = byType[row.type][year] ?? emptyMonths();
    series[row.month - 1] = row.tickets;
    byType[row.type][year] = series;
  }

  const years = Array.from(
    new Set(rows.map((row) => row.year))
  ).sort((a, b) => a - b);

  return { byType, years, sourceFile: stamp.sourceFile, uploadedAt: stamp.uploadedAt };
}

export function comparisonsFromTexto(
  rows: AvTextoComparativaRow[]
): Record<SupportType, WeeklyComparison[]> {
  const maps = Object.fromEntries(
    INFORME_SUPPORT_TYPES.map((type) => [type, new Map<number, Record<string, number>>()])
  ) as Record<SupportType, Map<number, Record<string, number>>>;

  for (const row of rows) {
    const byYear = maps[row.type];
    const totals = byYear.get(row.year) ?? {};
    totals[String(row.week)] = row.tickets;
    byYear.set(row.year, totals);
  }

  return Object.fromEntries(
    INFORME_SUPPORT_TYPES.map((type) => [
      type,
      Array.from(maps[type].entries())
        .sort((left, right) => left[0] - right[0])
        .map(([year, totalsByWeek]) => ({ year, totalsByWeek })),
    ])
  ) as Record<SupportType, WeeklyComparison[]>;
}

export function resolutionsFromTexto(
  rows: AvTextoResolucionRow[]
): Record<SupportType, Record<string, ResolutionRow[]>> {
  const result = Object.fromEntries(
    INFORME_SUPPORT_TYPES.map((type) => [type, {} as Record<string, ResolutionRow[]>])
  ) as Record<SupportType, Record<string, ResolutionRow[]>>;

  const buckets = new Map<
    string,
    { type: SupportType; week: string; row: ResolutionRow }
  >();

  for (const row of rows) {
    if (row.type === "Remotos" || row.tickets <= 0) {
      continue;
    }

    const key = `${row.type}\t${row.week}\t${row.category}\t${row.action}`;
    const existing = buckets.get(key);

    if (existing) {
      existing.row.total += row.tickets;
      continue;
    }

    buckets.set(key, {
      type: row.type,
      week: String(row.week),
      row: {
        category: row.type,
        tier2: row.category || row.action,
        tier3: row.action || row.category,
        total: row.tickets,
      },
    });
  }

  for (const bucket of Array.from(buckets.values())) {
    result[bucket.type][bucket.week] = [
      ...(result[bucket.type][bucket.week] ?? []),
      bucket.row,
    ];
  }

  for (const type of INFORME_SUPPORT_TYPES) {
    for (const week of Object.keys(result[type])) {
      result[type][week].sort(
        (a, b) =>
          a.tier2.localeCompare(b.tier2, "es") || a.tier3.localeCompare(b.tier3, "es")
      );
    }
  }

  return result;
}
