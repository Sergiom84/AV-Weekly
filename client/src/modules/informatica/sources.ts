import type {
  InformaticaComparativaRow,
  InformaticaHicRow,
} from "@shared/modules/informatica/types";

/**
 * Legible labels for the two dimensions that arrive as raw sheet names.
 *
 * `InformaticaHicRow.ambito` and `InformaticaComparativaRow.vista` carry the
 * title of the sheet they were read from, truncated to the thirty-one
 * characters Excel allows — `"11-10 - Comparativa Comonente_"`, typo and cut
 * included. The parser is right not to invent a nicer value there: the file
 * says what it says.
 *
 * Naming them is a presentation decision, so it lives here, on the client.
 * Every rule below matches on *content* — which metrics a scope reports, which
 * components a view lists — never on the sheet number, because that number is
 * a position in someone's workbook and moves when a tab is inserted. When no
 * rule matches, the raw name is cleaned up and shown as it came: an unlabelled
 * view is a smaller error than a mislabelled one.
 */

/* -------------------------------------------------------------------------- */
/* Shared                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Sheet name without its `"11-10 - "` position prefix and trailing separators,
 * used as the label of a scope or view no rule recognises.
 */
export function cleanSheetName(name: string): string {
  return name
    .replace(/^\s*\d+\s*-\s*\d+\s*-\s*/, "")
    .replace(/[\s_:-]+$/, "")
    .trim();
}

/* -------------------------------------------------------------------------- */
/* Hic scopes                                                                  */
/* -------------------------------------------------------------------------- */

/** Metric names of the two total series, as the template writes them. */
export const HIC_RESOLVED = "Resueltas";
export const HIC_ASSIGNED = "Asignadas";

export interface HicScopes {
  /**
   * Scope of the monthly totals the rest of the report reconciles against: the
   * one the `Categorization Tier 1` pivot adds up to. Null when the workbook
   * carries no total series at all.
   */
  main: string | null;
  /** The other total series, when the workbook ships one. */
  secondary: string | null;
  /** Scope holding the pivot by category, i.e. the rows with a `categoria`. */
  pivot: string | null;
}

/**
 * Splits the `Hic` scopes into the pivot and the total series, and decides
 * which total series is the main one.
 *
 * Both total sheets are titled `"HIC (SSCC) - Incidencias"` once truncated, so
 * the name cannot tell them apart. What can is arithmetic: the category pivot
 * is the breakdown of one of them, and in the current book its months add up to
 * the main scope's `Resueltas` exactly (722 for 2026/07, against 44 on the
 * other). Reconciling is the reason the pivot exists, so it is a fact about the
 * data rather than a guess about the file.
 *
 * If no scope reconciles — a workbook with no pivot, or one where the pivot
 * measures something else — the larger series is taken as the main one, which
 * is the same answer by a weaker argument.
 */
export function hicScopes(rows: InformaticaHicRow[]): HicScopes {
  const pivotScopes = new Set<string>();
  const totalScopes: string[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (row.categoria !== "") {
      pivotScopes.add(row.ambito);
      continue;
    }

    if (!seen.has(row.ambito)) {
      seen.add(row.ambito);
      totalScopes.push(row.ambito);
    }
  }

  const pivot = pivotScopes.values().next().value ?? null;

  if (totalScopes.length === 0) {
    return { main: null, secondary: null, pivot };
  }

  const pivotByMonth = new Map<string, number>();

  if (pivot !== null) {
    for (const row of rows) {
      if (row.ambito !== pivot || row.categoria === "") {
        continue;
      }

      pivotByMonth.set(row.mes, (pivotByMonth.get(row.mes) ?? 0) + row.total);
    }
  }

  const scored = totalScopes.map((scope) => {
    let volume = 0;
    let matches = 0;
    const resolvedByMonth = new Map<string, number>();

    for (const row of rows) {
      if (row.ambito !== scope || row.categoria !== "") {
        continue;
      }

      volume += row.total;

      if (row.metrica === HIC_RESOLVED) {
        resolvedByMonth.set(
          row.mes,
          (resolvedByMonth.get(row.mes) ?? 0) + row.total
        );
      }
    }

    for (const [month, total] of Array.from(pivotByMonth.entries())) {
      if (resolvedByMonth.get(month) === total) {
        matches += 1;
      }
    }

    return { scope, matches, volume };
  });

  scored.sort((a, b) => b.matches - a.matches || b.volume - a.volume);

  return {
    main: scored[0]?.scope ?? null,
    secondary: scored[1]?.scope ?? null,
    pivot,
  };
}

/**
 * Label of a `Hic` scope.
 *
 * The main series is the SSCC incident volumetry the report is about; the other
 * one is a second, much smaller HIC scope the source does not name. It keeps
 * the generic `HIC` label rather than a made-up one.
 */
export function hicScopeLabel(scope: string, scopes: HicScopes): string {
  if (scope === scopes.main) {
    return "Incidencias";
  }

  if (scope === scopes.secondary) {
    return "HIC";
  }

  return cleanSheetName(scope);
}

/* -------------------------------------------------------------------------- */
/* SmartTech points                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Name of a SmartTech point without the prefix every one of them carries.
 *
 * The extract labels each point `Smart Tech <sede>`, so a table of nothing but
 * SmartTech points repeats those two words on every row and pushes the part
 * that identifies it out of the column. The reference prints the site alone,
 * under a `SmartTech` header that already says what the column is.
 *
 * Only a leading prefix is removed, and only when something is left after it: a
 * point named just `Smart Tech` keeps its name rather than becoming blank.
 */
export function smartTechSite(building: string): string {
  const site = building.replace(/^\s*smart\s*tech\s+/i, "").trim();

  return site === "" ? building : site;
}

/* -------------------------------------------------------------------------- */
/* Work order scope                                                            */
/* -------------------------------------------------------------------------- */

/**
 * `Categorization Tier 2` values the published report counts as work orders.
 *
 * The extract carries every ON SITE SSCC ticket, but the report has never
 * counted all of them: the matrix behind `2.1.6 Work Orders (Informe)!N43` — the
 * cell the original 2.1.1 chart reads — spans exactly these eleven categories
 * and the eighteen mapped buildings. Everything else in the extract (IMAC
 * requests, software, peripherals, GSAM and WPM queries, devices) is reported on
 * other slides and would be double counted here.
 *
 * Reconciled against the workbook for 2026/08: 585 rows in the extract, 576
 * inside the matrix, which is the value the cell holds.
 */
const WORK_ORDER_CATEGORIES = new Set([
  "ACOMPAÑAMIENTO",
  "ASISTENCIA AUDIOVISUALES",
  "CONSULTA USUARIOS",
  "OTROS",
  "PRÉSTAMO MATERIAL",
  "RECEPCIÓN MATERIAL",
  "REINSTALACIÓN",
  "REPONER TÓNER",
  "RETIRADA DE DISPOSITIVOS",
  "REVISIÓN EQUIPAMIENTO",
  "TRASLADO",
]);

/**
 * Building of a row whose address matched no entry of the master.
 *
 * It is the literal `#N/A` the workbook lookup leaves behind, carried through
 * the flat text on purpose so the gap stays visible instead of being silently
 * folded into a real building.
 */
export const UNMAPPED_BUILDING = "#N/A";

/** True when a work order belongs to the volume the report publishes. */
export function isReportedWorkOrder(row: {
  edificio: string;
  tipo: string;
}): boolean {
  return (
    row.edificio !== UNMAPPED_BUILDING &&
    row.edificio !== "" &&
    WORK_ORDER_CATEGORIES.has(row.tipo)
  );
}

/* -------------------------------------------------------------------------- */
/* Comparativa views                                                           */
/* -------------------------------------------------------------------------- */

/**
 * A view is named after what it lists, in order: the first rule whose marker
 * elements are all present wins. The markers are the components that appear in
 * one view and no other, so the rules do not overlap.
 */
const VIEW_RULES: { label: string; markers: string[] }[] = [
  // The top-level view is the only one that lists the components themselves.
  { label: "Componentes", markers: ["PORTATIL", "SISTEMA OPERATIVO", "SOFTWARE"] },
  { label: "Portátil", markers: ["AVERIA"] },
  { label: "Sistema Operativo", markers: ["REINSTALACION"] },
  { label: "Software", markers: ["MIGRACION WINDOWS 11"] },
];

function normalise(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

/** Views in workbook order, each with the label its contents earn it. */
export function comparativaViews(
  rows: InformaticaComparativaRow[]
): { view: string; label: string }[] {
  const order: string[] = [];
  const elements = new Map<string, Set<string>>();

  for (const row of rows) {
    if (!elements.has(row.vista)) {
      elements.set(row.vista, new Set());
      order.push(row.vista);
    }

    elements.get(row.vista)?.add(normalise(row.elemento));
  }

  const taken = new Set<string>();

  return order.map((view) => {
    const found = elements.get(view) ?? new Set<string>();
    const rule = VIEW_RULES.find(
      (candidate) =>
        !taken.has(candidate.label) &&
        candidate.markers.every((marker) => found.has(marker))
    );

    if (rule) {
      taken.add(rule.label);

      return { view, label: rule.label };
    }

    return { view, label: cleanSheetName(view) };
  });
}
