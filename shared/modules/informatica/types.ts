import type {
  CoreDeckPageKind,
  DatasetSource,
  DeckPage,
  DeckState,
} from "../../deck/core.ts";

/**
 * Contract for the "Informatica" deck.
 *
 * Unlike the AV module, the source is a single flat workbook: eleven sheets in
 * long format, one row per combination of dimensions. Repeated rows are not an
 * error, they accumulate: the parser sums the measure column of every row that
 * shares the same dimensions.
 *
 * Types only. No default deck and no parser live here yet; `INFORMATICA_SHEETS`
 * is the contract the future parser must honour.
 */

/* -------------------------------------------------------------------------- */
/* Sheet contract                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Exact sheet names and column headers of the source workbook. The parser
 * matches against these strings, so a change here is a change of the file the
 * user uploads.
 *
 * This is the same contract that `scripts/generar-plantilla-informatica.mjs`
 * writes: that script generates the blank template the data provider fills in.
 * Sheet names, column headers and cell formats must be changed in both places
 * at once, or the template stops matching the parser.
 */
export const INFORMATICA_SHEETS = {
  edificios: {
    sheet: "Edificios",
    columns: [
      "Edificio",
      "DT",
      "Alias SmartTech",
      "Alias WorkOrder",
      "Alias IMACS",
      "Alias Peticiones",
      "Visible",
      "Orden",
    ],
  },
  incidencias: {
    sheet: "Incidencias",
    columns: [
      "Fecha",
      "Semana",
      "Mes",
      "Categoria",
      "Subcategoria",
      "Metrica",
      "Edificio",
      "Tickets",
    ],
  },
  encuestas: {
    sheet: "Encuestas",
    columns: ["Fecha", "Mes", "Valoracion", "Respuestas"],
  },
  workOrders: {
    sheet: "WorkOrders",
    columns: ["Fecha", "Semana", "Mes", "Edificio", "Tipo", "Ordenes"],
  },
  peticiones: {
    sheet: "Peticiones",
    columns: ["Fecha", "Semana", "Mes", "Origen", "Estado", "Entidad", "Total"],
  },
  peticionesProducto: {
    sheet: "PeticionesProducto",
    columns: ["Fecha", "Semana", "Mes", "Producto", "Estado", "Total"],
  },
  peticionesAnual: {
    sheet: "PeticionesAnual",
    columns: ["Anio", "Mes", "Peticiones"],
  },
  citas: {
    sheet: "Citas",
    columns: ["Fecha", "Semana", "Mes", "Edificio", "Tipo", "Citas"],
  },
  citasAnual: {
    sheet: "CitasAnual",
    columns: ["Anio", "Mes", "Citas"],
  },
  imacs: {
    sheet: "Imacs",
    columns: ["Fecha", "Mes", "Ciudad", "Metrica", "Total"],
  },
  wasp: {
    sheet: "Wasp",
    columns: ["Fecha", "Semana", "Mes", "Proveedor", "Estado", "Equipos"],
  },
  renove: {
    sheet: "Renove",
    columns: ["Fecha", "Semana", "Mes", "Ambito", "Estado", "Equipos"],
  },
  /**
   * Monthly incident volumetry ("HIC") behind pages 2.1.1.
   *
   * Long format on purpose, like every other sheet: one row per scope, month,
   * category and metric. It absorbs both shapes the weekly template carries —
   * the two total series (`Resueltas`/`Asignadas`/`Asignaciones`, no category)
   * and the pivot by `Categorization Tier 1` (metric `Incidencias`) — without
   * either of them needing a sheet of its own.
   */
  hic: {
    sheet: "Hic",
    columns: ["Ambito", "Mes", "Categoria", "Metrica", "Total"],
  },
  /**
   * Three-month comparison of incident components, feeding the top-ten page.
   *
   * The source is a set of pivots with the columns "Mes Actual", "Mes Anterior"
   * and "Hace dos meses": relative labels with no month inside. They are
   * resolved to real `YYYY/MM` months at conversion time and stored despivoted,
   * so the sheet never carries a period that depends on when it was read.
   */
  comparativas: {
    sheet: "Comparativas",
    columns: ["Vista", "Elemento", "Mes", "Total"],
  },
  /** Monthly SLA compliance, one row per service level. */
  slas: {
    sheet: "Slas",
    columns: ["Mes", "SVT", "Cumplido", "Incumplido", "Total"],
  },
} as const;

/** Key of a section inside the workbook, e.g. "peticionesProducto". */
export type InformaticaSectionKey = keyof typeof INFORMATICA_SHEETS;

/* -------------------------------------------------------------------------- */
/* Shared column shapes                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Month as the `YYYY/MM` string the template writes, e.g. `"2026/07"`.
 *
 * It carries the year inside on purpose: the historical sheets mix financial
 * years in the same column, so a bare 1-12 index would be ambiguous, and this
 * is also how the month reads in the original report.
 */
export type InformaticaMonth = string;

/**
 * Raw `Fecha` cell. The template writes an Excel serial number (for example
 * `46230.082824074074`), but a workbook edited by hand can carry ISO text
 * instead, so the parser must accept both and normalise.
 *
 * When deriving the ISO week or week-year from a serial, follow
 * `server/parseInformePlano.ts`, which resolves it through the Thursday of the
 * week. A serial is a valid input format, not a defect to reject.
 */
export type InformaticaDateCell = number | string | null;

/** Dimensions present on almost every sheet. */
export interface InformaticaPeriod {
  /** Excel serial or ISO text. Null when the row only reports a period. */
  fecha: InformaticaDateCell;
  /** ISO week number. Always numeric in the template, e.g. 31. */
  semana: number;
  mes: InformaticaMonth;
}

/** Period of the sheets that report by month only, with no week column. */
export type InformaticaMonthlyPeriod = Omit<InformaticaPeriod, "semana">;

/* -------------------------------------------------------------------------- */
/* One row type per sheet                                                      */
/* -------------------------------------------------------------------------- */

/** `Edificios`: dimension table, not a measure. One row per building. */
export interface InformaticaEdificioRow {
  edificio: string;
  dt: string;
  aliasSmartTech: string;
  aliasWorkOrder: string;
  aliasImacs: string;
  aliasPeticiones: string;
  visible: boolean;
  orden: number;
}

/** `Incidencias`: tickets by category tree, metric and building. */
export interface InformaticaIncidenciaRow extends InformaticaPeriod {
  categoria: string;
  subcategoria: string;
  metrica: string;
  edificio: string;
  tickets: number;
}

/** `Encuestas`: survey answers by score. */
export interface InformaticaEncuestaRow extends InformaticaMonthlyPeriod {
  valoracion: string;
  respuestas: number;
}

/** `WorkOrders`: work orders by building and type. */
export interface InformaticaWorkOrderRow extends InformaticaPeriod {
  edificio: string;
  tipo: string;
  ordenes: number;
}

/** `Peticiones`: requests by origin, status and entity. */
export interface InformaticaPeticionRow extends InformaticaPeriod {
  origen: string;
  estado: string;
  entidad: string;
  total: number;
}

/** `PeticionesProducto`: requests by product and status. */
export interface InformaticaPeticionProductoRow extends InformaticaPeriod {
  producto: string;
  estado: string;
  total: number;
}

/**
 * `PeticionesAnual`: yearly comparison series, one value per year and month.
 * `Anio` is numeric, `Mes` stays `YYYY/MM` like everywhere else: the template
 * writes `{ Anio: 2022, Mes: "2022/01" }`, so the year is redundant but the
 * column format is consistent across every sheet.
 */
export interface InformaticaPeticionAnualRow {
  anio: number;
  mes: InformaticaMonth;
  peticiones: number;
}

/** `Citas`: appointments by building and type. */
export interface InformaticaCitaRow extends InformaticaPeriod {
  edificio: string;
  tipo: string;
  citas: number;
}

/**
 * `CitasAnual`: yearly comparison series of appointments. Same shape as
 * `PeticionesAnual`: numeric `Anio` and `YYYY/MM` `Mes`.
 */
export interface InformaticaCitaAnualRow {
  anio: number;
  mes: InformaticaMonth;
  citas: number;
}

/** `Imacs`: IMACS volumes by city and metric. */
export interface InformaticaImacRow extends InformaticaMonthlyPeriod {
  ciudad: string;
  metrica: string;
  total: number;
}

/** `Wasp`: equipment by supplier and status. */
export interface InformaticaWaspRow extends InformaticaPeriod {
  proveedor: string;
  estado: string;
  equipos: number;
}

/** `Renove`: renewal equipment by scope and status. */
export interface InformaticaRenoveRow extends InformaticaPeriod {
  ambito: string;
  estado: string;
  equipos: number;
}

/**
 * `Hic`: monthly incident volumetry, one metric per row.
 *
 * `ambito` is the scope the figure was reported under. It is the source sheet
 * name verbatim: the weekly template ships two series sheets whose titles are
 * truncated to the 31 characters Excel allows, so the distinction between them
 * cannot be recovered from the file and inventing a nicer label here would be a
 * guess. `categoria` is empty on the total series and carries the
 * `Categorization Tier 1` value on the pivot.
 */
export interface InformaticaHicRow {
  ambito: string;
  mes: InformaticaMonth;
  categoria: string;
  metrica: string;
  total: number;
}

/**
 * `Comparativas`: incidents by component and month, already despivoted.
 *
 * `vista` is the source sheet name, for the same truncation reason as
 * `InformaticaHicRow.ambito`. `mes` is a real `YYYY/MM`: the relative column
 * labels of the source are resolved before the row is written.
 */
export interface InformaticaComparativaRow {
  vista: string;
  elemento: string;
  mes: InformaticaMonth;
  total: number;
}

/** `Slas`: compliance of one service level in one month. */
export interface InformaticaSlaRow {
  mes: InformaticaMonth;
  svt: string;
  cumplido: number;
  incumplido: number;
  total: number;
}

/* -------------------------------------------------------------------------- */
/* Dataset                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Imported workbook. Every section is optional on purpose: a missing sheet
 * hides its page instead of breaking the deck.
 */
export interface InformaticaDataset {
  edificios?: InformaticaEdificioRow[];
  incidencias?: InformaticaIncidenciaRow[];
  encuestas?: InformaticaEncuestaRow[];
  workOrders?: InformaticaWorkOrderRow[];
  peticiones?: InformaticaPeticionRow[];
  peticionesProducto?: InformaticaPeticionProductoRow[];
  peticionesAnual?: InformaticaPeticionAnualRow[];
  citas?: InformaticaCitaRow[];
  citasAnual?: InformaticaCitaAnualRow[];
  imacs?: InformaticaImacRow[];
  wasp?: InformaticaWaspRow[];
  renove?: InformaticaRenoveRow[];
  hic?: InformaticaHicRow[];
  comparativas?: InformaticaComparativaRow[];
  slas?: InformaticaSlaRow[];
  source: DatasetSource;
  /** Sheets found in the uploaded workbook, in workbook order. */
  sheetsFound?: InformaticaSectionKey[];
}

/* -------------------------------------------------------------------------- */
/* Deck                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Page kinds of the Informatica deck. Prefixed with `it` so they never collide
 * with the AV kinds if both decks are ever handled by the same code.
 */
export type InformaticaPageKind =
  | CoreDeckPageKind
  | "itIncidencias"
  | "itEncuestas"
  | "itWorkOrders"
  | "itPeticiones"
  | "itPeticionesProducto"
  | "itPeticionesAnual"
  | "itCitas"
  | "itCitasAnual"
  | "itImacs"
  | "itWasp"
  | "itRenove"
  | "itHic"
  | "itComparativas"
  | "itSlas";

/** Series a page can report on. Informatica pages are not typed by series. */
export type InformaticaSeries = string;

export type InformaticaDeckPage = DeckPage<InformaticaPageKind, InformaticaSeries>;
export type InformaticaDeckState = DeckState<InformaticaPageKind, InformaticaSeries>;

export interface InformaticaPayload {
  deck: InformaticaDeckState;
  data: InformaticaDataset;
}
