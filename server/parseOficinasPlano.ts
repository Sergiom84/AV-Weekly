import * as XLSX from "xlsx";
import { parseExcelDate, parseExcelMonth } from "./excelDate.ts";
import { isoWeek, isoWeekYear } from "./isoWeek.ts";
import {
  normalizeDT,
  pickSpelling,
  spellingKey,
  OFICINAS_DT_OTHERS,
  OFICINAS_IMAC_COLUMNS,
  OFICINAS_NAMED_SHEET_ROLES,
  OFICINAS_SHEET_ROLES,
  type OficinasNamedSheet,
  type SpellingVariant,
  type OficinasDataset,
  type OficinasDistribucion,
  type OficinasElementRow,
  type OficinasEncuestaMes,
  type OficinasEncuestas,
  type OficinasImac,
  type OficinasIncidencias,
  type OficinasIncidenciasMensual,
  type OficinasMensual,
  type OficinasMonthRow,
  type OficinasMonthValue,
  type OficinasPeticiones,
  type OficinasPeticionesMensual,
  type OficinasRecicladores,
  type OficinasRecicladoresMensual,
  type OficinasRow,
  type OficinasValidadoras,
  type OficinasWeekValue,
} from "../shared/modules/oficinas/types.ts";

/**
 * Parser of the weekly "Template oficinas" workbook.
 *
 * Three things shape it:
 *
 * - Pivots are found by the numeric prefix of their name, never by the full
 *   name. Excel truncates tab names at 31 characters and the team rewords the
 *   tails, so "2-Listado asignadas (criterio M" is all the workbook carries.
 *   The raw IMAC listing is the exception: its prefix is a duplicate of another
 *   sheet's, so it is found by its columns instead. See `isImacListing`.
 * - The matrices grow one column per week, so the week header is read from row
 *   0 instead of assuming a width. A workbook with 34 weeks and one with 52 go
 *   through the same code.
 * - Nothing is inferred that the source does not say. The template does not
 *   stamp a year anywhere, so the caller supplies it; the previous-year sheets
 *   are stored as `year - 1`; and the weeks of the recycler comparison sheet,
 *   whose header jumps from 1 to 21, are stored exactly as written.
 */

/* -------------------------------------------------------------------------- */
/* Import report                                                               */
/* -------------------------------------------------------------------------- */

export interface OficinasSheetReport {
  /** Sheet name as written in the workbook. */
  sheet: string;
  /**
   * Numeric prefix as written, or null when the name does not start with one.
   *
   * It is the prefix of the name and not the slot the sheet was read into: the
   * IMAC listing repeats another sheet's prefix, and reporting it as `null`
   * would hide from the import log the very duplicate that made the sheet
   * unreachable in the first place. `named` says how it was actually resolved.
   */
  prefix: number | null;
  /** Contract key when the sheet was resolved by its columns instead. */
  named: OficinasNamedSheet | null;
  /** What that prefix or key is expected to carry. */
  role: string | null;
  /** Data rows read, excluding the header and the "Total" row. */
  rows: number;
  /** Weeks the sheet reports on, ascending. */
  weeks: number[];
}

export interface OficinasImportReport {
  sheets: OficinasSheetReport[];
  /** Names of the recognised sheets, in workbook order. */
  sheetsFound: string[];
  /** Prefixes the contract declares that the workbook did not carry. */
  missingSheets: number[];
  /** Named sheets the contract declares that the workbook did not carry. */
  missingNamedSheets: OficinasNamedSheet[];
  /** Weeks of the current year read from this upload, ascending. */
  weeks: number[];
  /** Year applied to the current-year sheets. */
  year: number;
  /** Original name of the uploaded file. The route fills it in. */
  file?: string;
}

export interface OficinasParseResult {
  dataset: OficinasDataset;
  report: OficinasImportReport;
}

/* -------------------------------------------------------------------------- */
/* Cell readers                                                                */
/* -------------------------------------------------------------------------- */

type Cell = string | number | boolean | Date | null | undefined;
type Grid = Cell[][];

function text(value: Cell): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * A numeric cell of the pivots.
 *
 * The export ships numbers as text with a thousands separator ("4,805") on the
 * matrices and as real numbers on the small sheets, so both are accepted. A
 * cell that is not a number at all yields 0, which is what an empty pivot cell
 * means here.
 */
function num(value: Cell): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const raw = text(value);

  // The pivot writes thousands the English way ("4,805") and the odd average the
  // Spanish way ("2,87"), so the separator is decided by the shape of the
  // groups, not by a fixed locale.
  const cleaned = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw)
    ? raw.replace(/,/g, "")
    : raw.replace(/\.(?=\d{3}\b)/g, "").replace(/,/g, ".");
  const parsed = Number(cleaned);

  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * The count inside a cell like `"49 (39%)"`.
 *
 * Only the leading count is kept: the percentage is a share of the week total
 * and is recomputed in `derived.ts`, so storing it would create a second,
 * drifting copy of a figure the chart already knows.
 */
function countFromShareCell(value: Cell): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const match = text(value).match(/^-?[\d.,]+/);

  return match ? num(match[0]) : 0;
}

function sheetGrid(workbook: XLSX.WorkBook, name: string): Grid {
  return XLSX.utils.sheet_to_json<Cell[]>(workbook.Sheets[name], {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false,
  });
}

/** Numeric prefix `N-` of a sheet name, or null. */
function sheetPrefix(name: string): number | null {
  const match = name.trim().match(/^(\d+)\s*-/);

  return match ? Number(match[1]) : null;
}

/**
 * True when the sheet is the raw IMAC request listing.
 *
 * Read off row 0 rather than off the tab name: the listing ships as
 * "1-Peticiones IMAC Año En Curso ", a prefix "1-Asignadas por semanas (año en"
 * already owns, so under the prefix rule the workbook silently lost whichever
 * of the two the export happened to put second.
 *
 * The columns are matched as a set and not by position, because the column
 * order is not part of anything the team promised: a positional check would
 * turn an inserted column into a silently unread sheet, which is the failure
 * this function exists to remove. See `OFICINAS_IMAC_COLUMNS`.
 */
function isImacListing(grid: Grid): boolean {
  const header = new Set((grid[0] ?? []).map((cell) => text(cell).toLowerCase()));

  return OFICINAS_IMAC_COLUMNS.every((column) => header.has(column.toLowerCase()));
}

/* -------------------------------------------------------------------------- */
/* Matrix layout                                                               */
/* -------------------------------------------------------------------------- */

interface MatrixLayout {
  /** Number of label columns, i.e. whatever precedes the "Semana" marker. */
  labelCols: number;
  /** Week numbers, in column order. */
  weeks: number[];
  /** Index of the first value column. */
  firstValueCol: number;
  /** Index of the first data row. */
  firstDataRow: number;
}

/**
 * Reads the header of a pivot matrix.
 *
 * The "Semana" marker of row 0 is the anchor: everything to its left is a label
 * column and everything to its right is a week, until the "Total" column. Both
 * the one-label matrices (DT) and the two-label ones (Componente / Elemento)
 * fall out of the same rule, so neither needs a special case.
 */
function readMatrixLayout(grid: Grid): MatrixLayout | null {
  const header = grid[0];

  if (!header) {
    return null;
  }

  const marker = header.findIndex((cell) => text(cell).toLowerCase() === "semana");

  if (marker === -1) {
    return null;
  }

  const weeks: number[] = [];
  let col = marker + 1;

  for (; col < header.length; col += 1) {
    const label = text(header[col]);

    if (label === "" || label.toLowerCase() === "total") {
      break;
    }

    const week = Number(label);

    if (!Number.isInteger(week) || week < 1 || week > 53) {
      break;
    }

    weeks.push(week);
  }

  return {
    labelCols: marker,
    weeks,
    firstValueCol: marker + 1,
    // Row 0 carries the week header, row 1 repeats it under the dimension name.
    firstDataRow: 2,
  };
}

/** True when the row is the pivot's grand-total row rather than a data row. */
function isTotalRow(grid: Grid, rowIndex: number): boolean {
  return text(grid[rowIndex]?.[0]).toLowerCase() === "total";
}

interface MatrixOptions {
  year: number;
  /** Cells carry `"49 (39%)"` instead of a plain number. */
  shareCells?: boolean;
  /** Applied to the label of every row. Defaults to a plain trim. */
  label?: (raw: string) => string;
}

/* -------------------------------------------------------------------------- */
/* Spelling folding                                                            */
/* -------------------------------------------------------------------------- */

/**
 * One row under construction: the weekly values accumulated so far and every
 * spelling the file used for it.
 *
 * Needed because the merge happens while reading: the pivots write the same
 * element as "Escaner" and "ESCANER" on two different rows, so the values have
 * to be summed as they arrive and the published spelling decided at the end,
 * once the frequency of each variant is known.
 */
interface LabelBucket {
  labels: Map<string, SpellingVariant>;
  values: OficinasWeekValue[];
  add: (label: string, values: OficinasWeekValue[]) => void;
}

function createBucket(order: number): LabelBucket {
  const bucket: LabelBucket = {
    labels: new Map(),
    values: [],
    add(label, values) {
      const variant = bucket.labels.get(label);

      if (variant) {
        variant.count += 1;
      } else {
        bucket.labels.set(label, { label, count: 1, order: order + bucket.labels.size });
      }

      for (const value of values) {
        const target = bucket.values.find(
          (entry) => entry.year === value.year && entry.week === value.week
        );

        if (target) {
          target.value += value.value;
        } else {
          bucket.values.push({ ...value });
        }
      }
    },
  };

  return bucket;
}

function bucketOf(
  buckets: Map<string, LabelBucket>,
  key: string,
  order: number
): LabelBucket {
  const existing = buckets.get(key);

  if (existing) {
    return existing;
  }

  const created = createBucket(order);
  buckets.set(key, created);

  return created;
}

/**
 * A one-label matrix as rows of weekly values.
 *
 * Rows whose weeks are all zero survive on purpose: a directorate with no
 * incidents this week is still a directorate, and dropping it would make the
 * chart's rows change from week to week.
 */
function readMatrix(
  grid: Grid,
  layout: MatrixLayout,
  options: MatrixOptions
): OficinasRow[] {
  const buckets = new Map<string, LabelBucket>();
  const read = options.shareCells ? countFromShareCell : num;

  for (let r = layout.firstDataRow; r < grid.length; r += 1) {
    if (isTotalRow(grid, r)) {
      continue;
    }

    const raw = text(grid[r]?.[0]);
    const label = options.label ? options.label(raw) : raw;

    if (label === "") {
      continue;
    }

    const values: OficinasWeekValue[] = layout.weeks.map((week, index) => ({
      year: options.year,
      week,
      value: read(grid[r]?.[layout.firstValueCol + index]),
    }));

    // Two source rows that are the same label written differently are one row,
    // added together rather than the second silently overwriting the first.
    bucketOf(buckets, spellingKey(label), r).add(label, values);
  }

  return Array.from(buckets.values()).map((bucket) => ({
    label: pickSpelling(Array.from(bucket.labels.values())),
    values: bucket.values,
  }));
}

/**
 * A Componente / Elemento matrix.
 *
 * The component only appears on the first row of its group, so it is filled
 * downwards. Without that, 80 of the 88 rows would belong to a component named
 * "".
 *
 * Both dimensions are folded by spelling, and the row identity is the pair: the
 * pivot ships "PERIFERICOS", "Periférico" and "Periféricos" as three component
 * groups, so an element that appears under two of them is one row of one
 * component once the spellings join.
 */
function readElementMatrix(
  grid: Grid,
  layout: MatrixLayout,
  year: number
): OficinasElementRow[] {
  const buckets = new Map<string, LabelBucket>();
  const components = new Map<string, Map<string, SpellingVariant>>();
  const componentOfRow = new Map<string, string>();
  let componente = "";

  for (let r = layout.firstDataRow; r < grid.length; r += 1) {
    if (isTotalRow(grid, r)) {
      continue;
    }

    const groupCell = text(grid[r]?.[0]);

    if (groupCell !== "") {
      componente = groupCell;
    }

    const elemento = text(grid[r]?.[1]);

    if (elemento === "") {
      continue;
    }

    const componentKey = spellingKey(componente);
    const rowKey = `${componentKey} ${spellingKey(elemento)}`;

    if (!components.has(componentKey)) {
      components.set(componentKey, new Map());
    }

    const variants = components.get(componentKey)!;
    const seen = variants.get(componente);

    if (seen) {
      seen.count += 1;
    } else {
      variants.set(componente, { label: componente, count: 1, order: r });
    }

    componentOfRow.set(rowKey, componentKey);

    bucketOf(buckets, rowKey, r).add(
      elemento,
      layout.weeks.map((week, index) => ({
        year,
        week,
        value: num(grid[r]?.[layout.firstValueCol + index]),
      }))
    );
  }

  return Array.from(buckets.entries()).map(([rowKey, bucket]) => {
    const elemento = pickSpelling(Array.from(bucket.labels.values()));
    const componentKey = componentOfRow.get(rowKey) ?? "";
    const componentVariants = components.get(componentKey);

    return {
      label: elemento,
      elemento,
      componente: componentVariants
        ? pickSpelling(Array.from(componentVariants.values()))
        : "",
      values: bucket.values,
    };
  });
}

/** A two-column `Semana | valor` sheet. */
function readWeeklySeries(grid: Grid, year: number): OficinasWeekValue[] {
  const values: OficinasWeekValue[] = [];

  for (let r = 1; r < grid.length; r += 1) {
    const week = Number(text(grid[r]?.[0]));

    if (!Number.isInteger(week) || week < 1 || week > 53) {
      continue;
    }

    values.push({ year, week, value: num(grid[r]?.[1]) });
  }

  return values;
}

/** A `1 | 2 | 3 | 4 | 5` distribution sheet. Always five entries. */
function readDistribution(grid: Grid): number[] {
  const row = grid[1] ?? [];

  return [0, 1, 2, 3, 4].map((index) => num(row[index]));
}

/* -------------------------------------------------------------------------- */
/* IMAC listing                                                                */
/* -------------------------------------------------------------------------- */

/** Column index of each header name, matched case-insensitively. */
function columnsOf(grid: Grid): Map<string, number> {
  const columns = new Map<string, number>();

  (grid[0] ?? []).forEach((cell, index) => {
    const name = text(cell).toLowerCase();

    if (name !== "" && !columns.has(name)) {
      columns.set(name, index);
    }
  });

  return columns;
}

/**
 * Folds the IMAC listing into weekly figures.
 *
 * Columns are found by name, not by position: this is the one sheet of the
 * workbook that is a raw export, and its columns have no reason to stay put.
 *
 * A row with no readable closing date is skipped, which is also the whole
 * status filter — rejected and cancelled requests carry `//` there. Counting
 * them would publish work that was never done.
 */
function readImacListing(grid: Grid): OficinasImac {
  const columns = columnsOf(grid);
  const closed = columns.get("fecha_cierre");
  const tipo = columns.get("tipo_peticion");
  const quantities = [1, 2, 3, 4, 5]
    .map((index) => columns.get(`cantidad_${index}`))
    .filter((index): index is number => index !== undefined);

  if (closed === undefined) {
    return { peticionesByWeek: [], intervencionesByWeek: [], byTipo: [] };
  }

  const requests = new Map<string, OficinasWeekValue>();
  const units = new Map<string, OficinasWeekValue>();
  const byTipo = new Map<
    string,
    { labels: Map<string, SpellingVariant>; weeks: Map<string, OficinasWeekValue> }
  >();

  const add = (
    target: Map<string, OficinasWeekValue>,
    year: number,
    week: number,
    value: number
  ) => {
    const key = `${year}:${week}`;
    const current = target.get(key);

    if (current) {
      current.value += value;
    } else {
      target.set(key, { year, week, value });
    }
  };

  for (let r = 1; r < grid.length; r += 1) {
    const date = parseExcelDate(grid[r]?.[closed]);

    if (!date) {
      continue;
    }

    const year = isoWeekYear(date);
    const week = isoWeek(date);

    add(requests, year, week, 1);
    add(
      units,
      year,
      week,
      quantities.reduce((sum, index) => sum + num(grid[r]?.[index]), 0)
    );

    const label = text(grid[r]?.[tipo ?? -1]);

    if (label === "") {
      continue;
    }

    // Folded by spelling like every other label of the module, so "AMPLIACION"
    // and "AMPLIACIÓN" are one row and not two half-sized ones.
    const key = spellingKey(label);
    const bucket = byTipo.get(key) ?? { labels: new Map(), weeks: new Map() };
    const variant = bucket.labels.get(label);

    if (variant) {
      variant.count += 1;
    } else {
      bucket.labels.set(label, { label, count: 1, order: bucket.labels.size });
    }

    add(bucket.weeks, year, week, 1);
    byTipo.set(key, bucket);
  }

  const sorted = (values: Iterable<OficinasWeekValue>) =>
    Array.from(values).sort((a, b) => a.year - b.year || a.week - b.week);

  return {
    peticionesByWeek: sorted(requests.values()),
    intervencionesByWeek: sorted(units.values()),
    byTipo: Array.from(byTipo.values()).map((bucket) => ({
      label: pickSpelling(Array.from(bucket.labels.values())),
      values: sorted(bucket.weeks.values()),
    })),
  };
}

/** `YYYY/MM`, serial or Date as `YYYY-MM`. Anything else is dropped. */
function readMonth(value: Cell): string | null {
  return parseExcelMonth(value);
}

/** Column index of a header name, matched case-insensitively. */
function headerIndex(grid: Grid, name: string): number | undefined {
  const needle = name.toLowerCase();
  const index = (grid[0] ?? []).findIndex((cell) => text(cell).toLowerCase() === needle);

  return index >= 0 ? index : undefined;
}

/**
 * A long monthly sheet (`Fecha` plus named value columns), sorted by month.
 *
 * The 2025/05 row of sheet 23 sits at the bottom of the export; sorting puts
 * it in calendar order instead of leaving a hole at the start of the axis.
 */
function readMonthlyRecords<T extends { month: string }>(
  grid: Grid | null,
  fields: { key: Exclude<keyof T, "month">; header: string }[]
): T[] {
  if (!grid) {
    return [];
  }

  const fecha = headerIndex(grid, "Fecha");

  if (fecha === undefined) {
    return [];
  }

  const columns = fields
    .map((field) => ({ ...field, index: headerIndex(grid, field.header) }))
    .filter((field): field is typeof field & { index: number } => field.index !== undefined);
  const rows: T[] = [];

  for (let r = 1; r < grid.length; r += 1) {
    const month = readMonth(grid[r]?.[fecha]);

    if (!month) {
      continue;
    }

    const record = { month } as T;

    for (const column of columns) {
      (record as Record<string, string | number>)[column.key as string] = num(
        grid[r]?.[column.index]
      );
    }

    rows.push(record);
  }

  return rows.sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Sheet 25: directorate × month.
 *
 * The empty `DAR` group row is dropped. `--- DESCONOCIDA ---` is the same
 * unnamed bucket the weekly pivots call `OTROS`. The two sources must not
 * become two rows on the slide.
 */
function readMonthlyMatrix(grid: Grid | null): OficinasMonthRow[] {
  if (!grid || grid.length === 0) {
    return [];
  }

  const months: { col: number; month: string }[] = [];

  (grid[0] ?? []).forEach((cell, col) => {
    const month = readMonth(cell);

    if (month) {
      months.push({ col, month });
    }
  });

  if (months.length === 0) {
    return [];
  }

  months.sort((a, b) => a.month.localeCompare(b.month));
  const buckets = new Map<
    string,
    { labels: Map<string, SpellingVariant>; values: Map<string, number> }
  >();

  for (let r = 1; r < grid.length; r += 1) {
    const raw = text(grid[r]?.[0]);

    if (raw === "" || /^dar$/i.test(raw) || /^total/i.test(raw)) {
      continue;
    }

    const label = /desconocida/i.test(raw)
      ? OFICINAS_DT_OTHERS
      : normalizeDT(raw);
    const key = spellingKey(label);
    const bucket = buckets.get(key) ?? {
      labels: new Map(),
      values: new Map(),
    };
    const variant = bucket.labels.get(label);

    if (variant) {
      variant.count += 1;
    } else {
      bucket.labels.set(label, { label, count: 1, order: bucket.labels.size });
    }

    for (const { col, month } of months) {
      bucket.values.set(month, (bucket.values.get(month) ?? 0) + num(grid[r]?.[col]));
    }

    buckets.set(key, bucket);
  }

  return Array.from(buckets.values())
    .map((bucket) => ({
      label: pickSpelling(Array.from(bucket.labels.values())),
      values: months.map(({ month }) => ({
        month,
        value: bucket.values.get(month) ?? 0,
      })),
    }))
    .filter((row) => row.values.some((entry) => entry.value !== 0));
}

function readMensual(byPrefix: Map<number, { name: string; grid: Grid }>): OficinasMensual {
  return {
    incidencias: readMonthlyRecords<OficinasIncidenciasMensual>(gridOf(byPrefix, 23), [
      { key: "resueltas", header: "Resueltas" },
      { key: "asignadas", header: "Asignadas" },
      { key: "asignaciones", header: "Asignaciones" },
    ]),
    recicladores: readMonthlyRecords<OficinasRecicladoresMensual>(gridOf(byPrefix, 24), [
      { key: "abiertas", header: "Abiertas" },
      { key: "resueltas", header: "Resueltas" },
    ]),
    cierresPorDT: readMonthlyMatrix(gridOf(byPrefix, 25)),
    peticiones: readMonthlyRecords<OficinasPeticionesMensual>(gridOf(byPrefix, 26), [
      { key: "peticiones", header: "Peticiones" },
      { key: "realizadas", header: "Realizadas" },
      { key: "pendientes", header: "Pendientes" },
    ]),
  };
}

function gridOf(
  byPrefix: Map<number, { name: string; grid: Grid }>,
  prefix: number
): Grid | null {
  return byPrefix.get(prefix)?.grid ?? null;
}

/* -------------------------------------------------------------------------- */
/* Workbook                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Reads the whole weekly template.
 *
 * `year` is a parameter and not a guess: the template rotates its week columns
 * every January and stamps the year nowhere, so the current-year sheets are
 * dated by the caller (the upload route defaults to the year of the upload) and
 * the two comparison sheets, 13 and 16, by `year - 1`. This is the one
 * assumption of the import and it is reported back in `report.year`.
 */
export function parseOficinasWorkbook(
  workbook: XLSX.WorkBook,
  year: number = new Date().getFullYear()
): OficinasParseResult {
  const previousYear = year - 1;
  const byPrefix = new Map<number, { name: string; grid: Grid }>();
  const byName = new Map<OficinasNamedSheet, { name: string; grid: Grid }>();
  const sheets: OficinasSheetReport[] = [];
  const sheetsFound: string[] = [];

  for (const name of workbook.SheetNames) {
    const prefix = sheetPrefix(name);
    const grid = sheetGrid(workbook, name);
    const layout = readMatrixLayout(grid);
    // Claimed before the prefix rule runs, so the listing never competes for a
    // slot that belongs to a pivot. That order is what makes the import
    // independent of the tab order of the export.
    const named: OficinasNamedSheet | null = isImacListing(grid)
      ? "peticionesImac"
      : null;

    if (named !== null) {
      if (!byName.has(named)) {
        byName.set(named, { name, grid });
        sheetsFound.push(name);
      }
    } else if (prefix !== null && !byPrefix.has(prefix)) {
      byPrefix.set(prefix, { name, grid });
      sheetsFound.push(name);
    }

    sheets.push({
      sheet: name,
      prefix,
      named,
      role:
        named !== null
          ? OFICINAS_NAMED_SHEET_ROLES[named]
          : prefix === null
            ? null
            : (OFICINAS_SHEET_ROLES[prefix] ?? null),
      rows: Math.max(0, grid.length - (layout ? layout.firstDataRow : 1)),
      weeks: layout?.weeks ?? [],
    });
  }

  const grid = (prefix: number): Grid | null => byPrefix.get(prefix)?.grid ?? null;

  function matrix(
    prefix: number,
    options: Omit<MatrixOptions, "year"> & { year: number }
  ): OficinasRow[] {
    const source = grid(prefix);

    if (!source) {
      return [];
    }

    const layout = readMatrixLayout(source);

    return layout ? readMatrix(source, layout, options) : [];
  }

  function elementMatrix(prefix: number): OficinasElementRow[] {
    const source = grid(prefix);

    if (!source) {
      return [];
    }

    const layout = readMatrixLayout(source);

    return layout ? readElementMatrix(source, layout, year) : [];
  }

  function series(prefix: number): OficinasWeekValue[] {
    const source = grid(prefix);

    return source ? readWeeklySeries(source, year) : [];
  }

  const dtVariants: { variant: OficinasValidadoras; prefix: number }[] = [
    { variant: "con", prefix: 2 },
    { variant: "sin", prefix: 3 },
    { variant: "solo", prefix: 4 },
  ];

  const asignadas: OficinasIncidencias = {
    totalsByWeek: series(1),
    byDT: dtVariants.map(({ variant, prefix }) => ({
      variant,
      rows: matrix(prefix, { year, label: (raw) => normalizeDT(raw) }),
    })),
    byElement: elementMatrix(5),
  };

  const resueltas: OficinasIncidencias = {
    totalsByWeek: series(6),
    byDT: [
      { variant: "con" as const, prefix: 7 },
      { variant: "sin" as const, prefix: 8 },
      { variant: "solo" as const, prefix: 9 },
    ].map(({ variant, prefix }) => ({
      variant,
      rows: matrix(prefix, { year, label: (raw) => normalizeDT(raw) }),
    })),
    byElement: elementMatrix(10),
  };

  const peticiones: OficinasPeticiones = {
    totalsByWeek: series(11),
    byDT: matrix(12, { year, label: (raw) => normalizeDT(raw) }),
    byDTPrevious: matrix(13, { year: previousYear, label: (raw) => normalizeDT(raw) }),
    byTipo: matrix(14, { year, shareCells: true }),
  };

  const recicladores: OficinasRecicladores = {
    byDT: matrix(15, { year, label: (raw) => normalizeDT(raw) }),
    byDTPrevious: matrix(16, { year: previousYear, label: (raw) => normalizeDT(raw) }),
    byElemento: matrix(17, { year, shareCells: true }),
  };

  const listing = byName.get("peticionesImac")?.grid;
  const imac = listing ? readImacListing(listing) : undefined;
  const mensual = readMensual(byPrefix);

  const encuestas = readEncuestas(byPrefix);

  const weeks = Array.from(new Set(
      [
        ...asignadas.totalsByWeek,
        ...resueltas.totalsByWeek,
        ...peticiones.totalsByWeek,
        ...peticiones.byDT.flatMap((row) => row.values),
        ...recicladores.byDT.flatMap((row) => row.values),
      ]
        .filter((entry) => entry.year === year)
        .map((entry) => entry.week)
    )
  ).sort((a, b) => a - b);

  const missingSheets = Object.keys(OFICINAS_SHEET_ROLES)
    .map(Number)
    .filter((prefix) => !byPrefix.has(prefix));

  const missingNamedSheets = (
    Object.keys(OFICINAS_NAMED_SHEET_ROLES) as OficinasNamedSheet[]
  ).filter((key) => !byName.has(key));

  const dataset: OficinasDataset = {
    asignadas,
    resueltas,
    peticiones,
    recicladores,
    imac,
    mensual,
    encuestas,
    source: { sourceFile: null, uploadedAt: null },
    sheetsFound,
    year,
  };

  return {
    dataset,
    report: { sheets, sheetsFound, missingSheets, missingNamedSheets, weeks, year },
  };
}

/**
 * The survey section, from sheets 18 to 22.
 *
 * Surveys are the one part of the template that is not weekly: sheets 18 and 19
 * are keyed by month. Sheet 19 carries the three scores and sheet 18 only the
 * overall one, so 19 wins where both report a month and 18 fills the months 19
 * does not have.
 *
 * Sheets 20 to 22 are single rows of five numbers with no label saying which
 * score they belong to. They are read as the counts of scores 1 to 5, which the
 * totals corroborate: each sums to ~1.198, the number of surveys in the series.
 * That is an assumption, and the only one the section makes.
 */
function readEncuestas(
  byPrefix: Map<number, { name: string; grid: Grid }>
): OficinasEncuestas {
  const months = new Map<string, OficinasEncuestaMes>();

  const simple = byPrefix.get(18)?.grid;

  if (simple) {
    for (let r = 1; r < simple.length; r += 1) {
      const month = readMonth(simple[r]?.[0]);

      if (!month) {
        continue;
      }

      months.set(month, {
        month,
        encuestas: num(simple[r]?.[1]),
        global: num(simple[r]?.[2]),
        apertura: null,
        resolucion: null,
      });
    }
  }

  const detailed = byPrefix.get(19)?.grid;

  if (detailed) {
    for (let r = 1; r < detailed.length; r += 1) {
      const month = readMonth(detailed[r]?.[0]);

      if (!month) {
        continue;
      }

      months.set(month, {
        month,
        encuestas: num(detailed[r]?.[2]),
        global: num(detailed[r]?.[3]),
        apertura: num(detailed[r]?.[4]),
        resolucion: num(detailed[r]?.[5]),
      });
    }
  }

  const distribucion: OficinasDistribucion = {
    global: readDistribution(byPrefix.get(20)?.grid ?? []),
    apertura: readDistribution(byPrefix.get(21)?.grid ?? []),
    resolucion: readDistribution(byPrefix.get(22)?.grid ?? []),
  };

  return {
    porMes: Array.from(months.values()).sort((a, b) => a.month.localeCompare(b.month)),
    distribucion,
  };
}

/* -------------------------------------------------------------------------- */
/* Merge                                                                       */
/* -------------------------------------------------------------------------- */

function valueKey(entry: OficinasWeekValue): string {
  return `${entry.year}:${entry.week}`;
}

/**
 * Folds an incoming series into a stored one.
 *
 * Replacement is per `(year, week)`, not per series: an upload that carries
 * weeks 1 to 34 of 2026 must overwrite exactly those and leave 2025 alone. Which
 * also makes the import idempotent — re-uploading the same file is a no-op.
 */
function mergeValues(
  existing: OficinasWeekValue[] | undefined,
  incoming: OficinasWeekValue[] | undefined
): OficinasWeekValue[] {
  const replaced = new Set((incoming ?? []).map(valueKey));
  const kept = (existing ?? []).filter((entry) => !replaced.has(valueKey(entry)));

  return [...kept, ...(incoming ?? [])].sort(
    (a, b) => a.year - b.year || a.week - b.week
  );
}

/**
 * Folds two sets of labelled rows.
 *
 * Rows are joined by label, so a directorate that reported nothing this week
 * keeps its history instead of disappearing, and a label that only the incoming
 * file has is appended. Row order follows the incoming file first, since that is
 * the order the source pivot draws.
 */
function rowKeyOf(row: OficinasRow): string {
  const componente = (row as OficinasElementRow).componente;

  return componente === undefined
    ? spellingKey(row.label)
    : `${spellingKey(componente)} ${spellingKey(row.label)}`;
}

function mergeRows<T extends OficinasRow>(
  existing: T[] | undefined,
  incoming: T[] | undefined
): T[] {
  if (!incoming || incoming.length === 0) {
    return existing ?? [];
  }

  // Joined by the spelling key and not by the literal label, so a dataset stored
  // before the spellings were folded does not keep its old "ESCANER" row beside
  // the new "Escaner" one, which would double the element in the chart. The
  // incoming spelling wins, since it is the one the current file supports.
  const byKey = new Map((existing ?? []).map((row) => [rowKeyOf(row), row]));
  const merged: T[] = incoming.map((row) => ({
    ...(byKey.get(rowKeyOf(row)) ?? {}),
    ...row,
    values: mergeValues(byKey.get(rowKeyOf(row))?.values, row.values),
  }));

  const seen = new Set(incoming.map(rowKeyOf));

  for (const row of existing ?? []) {
    if (!seen.has(rowKeyOf(row))) {
      merged.push(row);
    }
  }

  return merged;
}

function mergeIncidencias(
  existing: OficinasIncidencias | undefined,
  incoming: OficinasIncidencias | undefined
): OficinasIncidencias | undefined {
  if (!incoming) {
    return existing;
  }

  return {
    totalsByWeek: mergeValues(existing?.totalsByWeek, incoming.totalsByWeek),
    byDT: incoming.byDT.map((matrix) => ({
      variant: matrix.variant,
      rows: mergeRows(
        existing?.byDT.find((entry) => entry.variant === matrix.variant)?.rows,
        matrix.rows
      ),
    })),
    byElement: mergeRows(existing?.byElement, incoming.byElement),
    // Carried over untouched, like `masters`: the past years come from the
    // manual historico and the weekly template has no column to fold into them,
    // so rebuilding the section from the upload alone would drop them.
    history: existing?.history,
  };
}

/**
 * Folds the IMAC section.
 *
 * The listing is a full-year extract of the current year. Weeks that year no
 * longer reports (a later export with no S36 closures) must not keep the old
 * count, so every year the incoming file mentions is replaced wholesale.
 * Other years, if a previous listing ever left any, stay.
 */
function mergeYearWeeks(
  existing: OficinasWeekValue[] | undefined,
  incoming: OficinasWeekValue[] | undefined
): OficinasWeekValue[] {
  const years = new Set((incoming ?? []).map((entry) => entry.year));
  const kept = (existing ?? []).filter((entry) => !years.has(entry.year));

  return [...kept, ...(incoming ?? [])].sort(
    (a, b) => a.year - b.year || a.week - b.week
  );
}

function mergeImac(
  existing: OficinasImac | undefined,
  incoming: OficinasImac | undefined
): OficinasImac | undefined {
  if (!incoming) {
    return existing;
  }

  const byKey = new Map((existing?.byTipo ?? []).map((row) => [spellingKey(row.label), row]));
  const byTipo = (incoming.byTipo ?? []).map((row) => ({
    ...row,
    values: mergeYearWeeks(byKey.get(spellingKey(row.label))?.values, row.values),
  }));
  const seen = new Set((incoming.byTipo ?? []).map((row) => spellingKey(row.label)));

  for (const row of existing?.byTipo ?? []) {
    if (!seen.has(spellingKey(row.label))) {
      const years = new Set(incoming.peticionesByWeek.map((entry) => entry.year));
      const values = row.values.filter((entry) => !years.has(entry.year));

      if (values.length > 0) {
        byTipo.push({ ...row, values });
      }
    }
  }

  return {
    peticionesByWeek: mergeYearWeeks(
      existing?.peticionesByWeek,
      incoming.peticionesByWeek
    ),
    intervencionesByWeek: mergeYearWeeks(
      existing?.intervencionesByWeek,
      incoming.intervencionesByWeek
    ),
    byTipo,
  };
}

function mergeMonthValues(
  existing: OficinasMonthValue[] | undefined,
  incoming: OficinasMonthValue[] | undefined
): OficinasMonthValue[] {
  const replaced = new Set((incoming ?? []).map((entry) => entry.month));
  const kept = (existing ?? []).filter((entry) => !replaced.has(entry.month));

  return [...kept, ...(incoming ?? [])].sort((a, b) => a.month.localeCompare(b.month));
}

function mergeMonthRecords<T extends { month: string }>(
  existing: T[] | undefined,
  incoming: T[] | undefined
): T[] {
  if (!incoming || incoming.length === 0) {
    return existing ?? [];
  }

  const replaced = new Set(incoming.map((entry) => entry.month));
  const kept = (existing ?? []).filter((entry) => !replaced.has(entry.month));

  return [...kept, ...incoming].sort((a, b) => a.month.localeCompare(b.month));
}

function mergeMonthRows(
  existing: OficinasMonthRow[] | undefined,
  incoming: OficinasMonthRow[] | undefined
): OficinasMonthRow[] {
  if (!incoming || incoming.length === 0) {
    return existing ?? [];
  }

  const byKey = new Map((existing ?? []).map((row) => [spellingKey(row.label), row]));
  const merged: OficinasMonthRow[] = incoming.map((row) => ({
    ...(byKey.get(spellingKey(row.label)) ?? {}),
    ...row,
    values: mergeMonthValues(byKey.get(spellingKey(row.label))?.values, row.values),
  }));
  const seen = new Set(incoming.map((row) => spellingKey(row.label)));

  for (const row of existing ?? []) {
    if (!seen.has(spellingKey(row.label))) {
      merged.push(row);
    }
  }

  return merged;
}

function mergeMensual(
  existing: OficinasMensual | undefined,
  incoming: OficinasMensual | undefined
): OficinasMensual | undefined {
  if (!incoming) {
    return existing;
  }

  return {
    incidencias: mergeMonthRecords(existing?.incidencias, incoming.incidencias),
    recicladores: mergeMonthRecords(existing?.recicladores, incoming.recicladores),
    cierresPorDT: mergeMonthRows(existing?.cierresPorDT, incoming.cierresPorDT),
    peticiones: mergeMonthRecords(existing?.peticiones, incoming.peticiones),
  };
}

/**
 * Folds the survey section.
 *
 * Months merge by key like weeks do. The score distributions do not: they are a
 * cumulative snapshot of the whole series, not a per-period figure, so the newer
 * one replaces the stored one outright. Adding them would double-count every
 * survey already in the previous export.
 */
function mergeEncuestas(
  existing: OficinasEncuestas | undefined,
  incoming: OficinasEncuestas | undefined
): OficinasEncuestas | undefined {
  if (!incoming) {
    return existing;
  }

  const months = new Map((existing?.porMes ?? []).map((month) => [month.month, month]));

  for (const month of incoming.porMes) {
    months.set(month.month, month);
  }

  return {
    porMes: Array.from(months.values()).sort((a, b) => a.month.localeCompare(b.month)),
    distribucion: incoming.distribucion,
  };
}

/**
 * Folds an upload into the stored dataset.
 *
 * `masters` is never touched: the office count comes from a different source,
 * seeded once, and a weekly upload that dropped it would silently blank every
 * ratio in the deck.
 */
export function mergeOficinasDataset(
  existing: OficinasDataset | null,
  incoming: OficinasDataset,
  source: OficinasDataset["source"]
): OficinasDataset {
  return {
    asignadas: mergeIncidencias(existing?.asignadas, incoming.asignadas),
    resueltas: mergeIncidencias(existing?.resueltas, incoming.resueltas),
    peticiones: incoming.peticiones
      ? {
          totalsByWeek: mergeValues(
            existing?.peticiones?.totalsByWeek,
            incoming.peticiones.totalsByWeek
          ),
          byDT: mergeRows(existing?.peticiones?.byDT, incoming.peticiones.byDT),
          byDTPrevious: mergeRows(
            existing?.peticiones?.byDTPrevious,
            incoming.peticiones.byDTPrevious
          ),
          byTipo: mergeRows(existing?.peticiones?.byTipo, incoming.peticiones.byTipo),
          // The weekly template has no previous-year type matrix. Keep the
          // historic seed intact across every upload.
          byTipoPrevious: existing?.peticiones?.byTipoPrevious,
        }
      : existing?.peticiones,
    recicladores: incoming.recicladores
      ? {
          byDT: mergeRows(existing?.recicladores?.byDT, incoming.recicladores.byDT),
          byDTPrevious: mergeRows(
            existing?.recicladores?.byDTPrevious,
            incoming.recicladores.byDTPrevious
          ),
          byElemento: mergeRows(
            existing?.recicladores?.byElemento,
            incoming.recicladores.byElemento
          ),
        }
      : existing?.recicladores,
    imac: mergeImac(existing?.imac, incoming.imac),
    mensual: mergeMensual(existing?.mensual, incoming.mensual),
    encuestas: mergeEncuestas(existing?.encuestas, incoming.encuestas),
    masters: existing?.masters ?? incoming.masters,
    source,
    sheetsFound: incoming.sheetsFound,
    year: incoming.year,
  };
}
