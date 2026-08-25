import type { CellOverrides } from "../../deck/core.ts";
import type {
  AvDeckState,
  InformeWeeklyDataset,
  ResolutionRow,
  SupportType,
} from "./types.ts";

const SEPARATOR = "----------------------------------------------------";

const LOCATION_ORDER: Partial<Record<SupportType, string[]>> = {
  Programados: [
    "CIUDAD",
    "CAMPUS",
    "VELA",
    "TERRITORIOS",
    "RECOLETOS",
    "TABLAS",
  ],
  Presenciales: [
    "TERRITORIOS",
    "CIUDAD",
    "CAMPUS",
    "RECOLETOS",
    "TABLAS",
    "VELA",
  ],
  Incidencias: [
    "CIUDAD",
    "TERRITORIOS",
    "CAMPUS",
    "RECOLETOS",
    "VELA",
    "TABLAS",
  ],
  Correctivos: [
    "CIUDAD",
    "TERRITORIOS",
    "CAMPUS",
    "RECOLETOS",
    "VELA",
    "TABLAS",
  ],
};

export interface ResolutionTableRow {
  tier2: string;
  tier3: string;
}

export interface ResolutionTableTotals {
  rowTotals: Record<string, number>;
  weekTotals: Record<string, number>;
  grandTotal: number;
}

export const resolutionCellKey = (row: ResolutionTableRow, week: number) =>
  `${row.tier2}|${row.tier3}:${week}`;

export function resolutionValueAt(
  byWeek: Record<string, ResolutionRow[]>,
  overrides: CellOverrides,
  row: ResolutionTableRow,
  week: number
): number {
  const key = resolutionCellKey(row, week);

  if (Object.prototype.hasOwnProperty.call(overrides, key)) {
    return overrides[key] ?? 0;
  }

  const match = byWeek[String(week)]?.find(
    entry => entry.tier2 === row.tier2 && entry.tier3 === row.tier3
  );

  return match?.total ?? 0;
}

/** Totals always cover the whole imported history, never only the visible range. */
export function calculateResolutionTableTotals(
  availableWeeks: number[],
  rows: ResolutionTableRow[],
  byWeek: Record<string, ResolutionRow[]>,
  overrides: CellOverrides
): ResolutionTableTotals {
  const rowTotals: Record<string, number> = {};
  const weekTotals = Object.fromEntries(
    availableWeeks.map(week => [String(week), 0])
  );

  for (const row of rows) {
    const rowKey = `${row.tier2}|${row.tier3}`;
    let total = 0;

    for (const week of availableWeeks) {
      const value = resolutionValueAt(byWeek, overrides, row, week) ?? 0;
      total += value;
      weekTotals[String(week)] = (weekTotals[String(week)] ?? 0) + value;
    }

    rowTotals[rowKey] = total;
  }

  return {
    rowTotals,
    weekTotals,
    grandTotal: Object.values(weekTotals).reduce(
      (sum, value) => sum + value,
      0
    ),
  };
}

function normalized(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\\/g, "/")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function pageOverrides(
  deck: AvDeckState | null | undefined,
  kind: "weeklySupport" | "resolutionDetail",
  type: SupportType
): CellOverrides {
  return (
    deck?.pages.find(page => page.kind === kind && page.supportType === type)
      ?.overrides ?? {}
  );
}

function matrixValue(
  weekly: InformeWeeklyDataset,
  deck: AvDeckState | null | undefined,
  type: SupportType,
  label: string,
  week: number
): number {
  const typeData = weekly.byType[type];
  const matrix = typeData.categories ?? typeData.locations;
  const row = matrix?.rows.find(
    entry => normalized(entry.label) === normalized(label)
  );

  if (!matrix || !row) {
    return 0;
  }

  const override = pageOverrides(deck, "weeklySupport", type);
  const key = `${row.label}:${week}`;

  if (Object.prototype.hasOwnProperty.call(override, key)) {
    return override[key] ?? 0;
  }

  const index = matrix.weeks.indexOf(week);
  return index === -1 ? 0 : (row.values[index] ?? 0);
}

function comparisonAt(
  weekly: InformeWeeklyDataset,
  type: SupportType,
  week: number
): number {
  const comparisons = weekly.byType[type].comparisons;
  const latest = comparisons.reduce(
    (selected, candidate) =>
      !selected || candidate.year > selected.year ? candidate : selected,
    comparisons[0]
  );
  return latest?.totalsByWeek[String(week)] ?? 0;
}

function joinWithY(parts: string[]): string {
  if (parts.length <= 1) {
    return parts.join("");
  }
  if (parts.length === 2) {
    return `${parts[0]} y ${parts[1]}`;
  }
  return `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`;
}

function differenceText(value: number): string {
  return `${Math.abs(value)} ${value < 0 ? "menos" : "más"}`;
}

function locationsText(
  weekly: InformeWeeklyDataset,
  deck: AvDeckState | null | undefined,
  type: SupportType,
  week: number
): { text: string; total: number } {
  const values = (LOCATION_ORDER[type] ?? []).map(label => ({
    label,
    value: matrixValue(weekly, deck, type, label, week),
  }));
  return {
    text: joinWithY(
      values
        .filter(entry => entry.value > 0)
        .map(entry => `${entry.value} en ${entry.label}`)
    ),
    total: values.reduce((sum, entry) => sum + entry.value, 0),
  };
}

function currentResolutionRows(
  weekly: InformeWeeklyDataset,
  deck: AvDeckState | null | undefined,
  type: SupportType,
  week: number
): Array<ResolutionTableRow & { value: number }> {
  const byWeek = weekly.byType[type].resolutionsByWeek;
  const overrides = pageOverrides(deck, "resolutionDetail", type);
  const seen = new Map<string, ResolutionTableRow>();

  for (const row of byWeek[String(week)] ?? []) {
    seen.set(`${row.tier2}|${row.tier3}`, {
      tier2: row.tier2,
      tier3: row.tier3,
    });
  }

  for (const key of Object.keys(overrides)) {
    const suffix = `:${week}`;
    if (!key.endsWith(suffix)) {
      continue;
    }
    const rowPart = key.slice(0, -suffix.length);
    const separator = rowPart.indexOf("|");
    if (separator > -1) {
      seen.set(rowPart, {
        tier2: rowPart.slice(0, separator),
        tier3: rowPart.slice(separator + 1),
      });
    }
  }

  return Array.from(seen.values()).map(row => ({
    ...row,
    value: resolutionValueAt(byWeek, overrides, row, week) ?? 0,
  }));
}

function actionLabel(tier2: string, tier3: string): string {
  const action = normalized(tier3);
  if (action === "PREPARACION SALA") {
    return "preparación sala";
  }
  if (action === "CONEXION" && tier2.trim()) {
    return `conexión de ${tier2.toLowerCase()}`;
  }
  return tier3.toLowerCase();
}

function categoryLabel(tier2: string): string {
  const key = normalized(tier2).replace(/\./g, "");
  if (key === "VC CISCO") return "vc. cisco";
  if (key === "ALMACEN") return "almacén";
  if (key === "DOMOTICA") return "demótica";
  if (key === "PC/PORTATIL") return "pc\\portátil";
  return tier2.toLowerCase();
}

function actionResolutionText(
  weekly: InformeWeeklyDataset,
  deck: AvDeckState | null | undefined,
  type: "Programados" | "Presenciales",
  week: number
): string {
  const grouped = new Map<
    string,
    { tier2: string; tier3: string; value: number }
  >();
  for (const row of currentResolutionRows(weekly, deck, type, week)) {
    const key = `${normalized(row.tier2)}|${normalized(row.tier3)}`;
    const current = grouped.get(key);
    if (current) current.value += row.value;
    else grouped.set(key, { ...row });
  }
  const top = Array.from(grouped.values())
    .filter(row => row.value > 0)
    .sort((a, b) => b.value - a.value || a.tier3.localeCompare(b.tier3, "es"))
    .slice(0, 2)
    .map(row => `${row.value} ${actionLabel(row.tier2, row.tier3)}`);
  return joinWithY(top);
}

function categoryResolutionText(
  weekly: InformeWeeklyDataset,
  deck: AvDeckState | null | undefined,
  type: "Incidencias" | "Correctivos",
  week: number
): string {
  const grouped = new Map<string, { label: string; value: number }>();
  for (const row of currentResolutionRows(weekly, deck, type, week)) {
    const key = normalized(row.tier2).replace(/\./g, "");
    const current = grouped.get(key);
    if (current) current.value += row.value;
    else grouped.set(key, { label: row.tier2, value: row.value });
  }
  const top = Array.from(grouped.values())
    .filter(row => row.value > 0)
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "es"))
    .slice(0, 2)
    .map(row => `${row.value} ${categoryLabel(row.label)}`);
  return joinWithY(top);
}

/** Sergio's weekly AV speech. Page filters and hidden rows intentionally do not participate. */
export function generateWeeklySpeech(
  weekly: InformeWeeklyDataset,
  deck?: AvDeckState | null
): string {
  const week = weekly.maxWeek;

  const errores = matrixValue(weekly, deck, "Remotos", "ERRORES", week);
  const conexiones = matrixValue(weekly, deck, "Remotos", "CONEXION", week);
  const operativa = matrixValue(weekly, deck, "Remotos", "OPERATIVA", week);
  const totalRemotos = errores + conexiones + operativa;
  const previoRemotos = comparisonAt(weekly, "Remotos", week);

  const programados = locationsText(weekly, deck, "Programados", week);
  const previoProgramados = comparisonAt(weekly, "Programados", week);
  const presenciales = locationsText(weekly, deck, "Presenciales", week);
  const previoPresenciales = comparisonAt(weekly, "Presenciales", week);
  const incidencias = locationsText(weekly, deck, "Incidencias", week);
  const previoIncidencias = comparisonAt(weekly, "Incidencias", week);
  const correctivos = locationsText(weekly, deck, "Correctivos", week);
  const previoCorrectivos = comparisonAt(weekly, "Correctivos", week);

  return [
    "Buenos días a todos,",
    "Soporte remoto:",
    `Se han resuelto ${errores} incidencias en remoto, gestionado ${conexiones} conexiones y se ha guiado al usuario en ${operativa} ocasiones. Dando un total de ${totalRemotos} soportes remotos, ${differenceText(totalRemotos - previoRemotos)} que el año pasado.`,
    SEPARATOR,
    "En Soporte programado:",
    `Se han realizado ${programados.text}, sumando ${programados.total}. Son ${differenceText(programados.total - previoProgramados)} que el año pasado (${previoProgramados}).`,
    `Dentro del tipo de resolución: ${actionResolutionText(weekly, deck, "Programados", week)}.`,
    SEPARATOR,
    "Soportes presenciales:",
    `En la volumetría semanal, el equipo ha realizado los siguientes presenciales: ${presenciales.text}. Total semanal: ${presenciales.total}. Son ${differenceText(presenciales.total - previoPresenciales)} que el año pasado.`,
    "El motivo de ésta diferencia es debido a los etiquetados.",
    `Dentro del tipo de resolución: Ha habido ${actionResolutionText(weekly, deck, "Presenciales", week)}.`,
    SEPARATOR,
    "Incidencias:",
    `${incidencias.text}, sumando ${incidencias.total}. Son ${differenceText(incidencias.total - previoIncidencias)} que el año pasado (${previoIncidencias})`,
    `Dentro del tipo de resolución, destacamos: ${categoryResolutionText(weekly, deck, "Incidencias", week).replace(/^(\d+) /, "$1 en ")}.`,
    SEPARATOR,
    "Y finalizamos con Correctivos:",
    `${correctivos.text}, sumando ${correctivos.total}. Son ${differenceText(correctivos.total - previoCorrectivos)} que en el año pasado (${previoCorrectivos}).`,
    `Dentro del tipo de resolución, destacan: ${categoryResolutionText(weekly, deck, "Correctivos", week)}.`,
  ].join("\n");
}
