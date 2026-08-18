/**
 * Seeds sections 2 and 3 of the AGA dataset from the presented PPTX.
 *
 * Sections 2 (peticiones gestionadas) and 3 (evolución anual) do not come from
 * the GPS export the module reads: they come from the ZPT025 and Office raw
 * exports, which are not automated yet. Until they are, the figures the
 * responsible already presented are the only trustworthy source, and they live
 * inside the charts of the pptx — not as pictures, as embedded series with
 * their categories and their series names.
 *
 * So this reads the charts, not the shapes: the deck is a container here, and
 * what is stored is the aggregate per period the chart draws. The day the raw
 * export arrives, the parser writes the same sections and this script retires
 * without the dataset shape changing.
 *
 * Deliberate decisions:
 *
 * - Weeks are stored as the `YYYY-MM-DD` Monday of the GPS convention, so a row
 *   of section 2 joins section 1 without a translation table. "Semana 33" is
 *   2026-08-17, the anchor `importar-historico-aga.mjs` already verified.
 * - The charts that compare two weeks are read by series NAME ("Semana actual"
 *   / "Semana anterior"), never by series order: the two charts that carry both
 *   disagree on which one comes first.
 * - The KPI sentences of the slides ("-30,6%", "58,5%") are NOT stored. They are
 *   derived from these series by `shared/modules/aga/managed.ts`; see the report
 *   this script prints for where the derived figure and the presented one part
 *   ways.
 * - Idempotent: the three sections are rebuilt whole from the pptx and written
 *   over, and nothing else of the dataset is touched. `weeks` survives.
 *
 *   node scripts/importar-gestionadas-aga.mjs [ruta.pptx]
 */

import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createClient } = require("@libsql/client");

const DEFAULT_SOURCE = "C:/Users/sergi/Desktop/AGA/33 semana 2026.pptx";

/** Same anchor as the weekly history: the responsible's "Semana 33" is 2026-08-17. */
const ANCHOR_WEEK = 33;
const ANCHOR_DATE = "2026-08-17";

/** Department each per-product slide reports on, by slide code. */
const DEPARTMENT_SLIDES = {
  "2.5": "GAM",
  "2.6": "Plataforma Portátiles",
  "2.7": "Almacén",
};

/* -------------------------------------------------------------------------- */
/* Zip                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Minimal reader of the OOXML container.
 *
 * A pptx is a zip and the project ships no zip dependency at the top level, so
 * the central directory is walked by hand: forty lines here beat adding a
 * dependency for a script that runs once.
 */
function readZip(path) {
  const buffer = readFileSync(path);
  let eocd = -1;

  for (let i = buffer.length - 22; i >= 0; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }

  if (eocd === -1) {
    throw new Error(`"${path}" no es un contenedor OOXML (no se encuentra el fin del zip).`);
  }

  const entries = new Map();
  let at = buffer.readUInt32LE(eocd + 16);
  const count = buffer.readUInt16LE(eocd + 10);

  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(at) !== 0x02014b50) {
      break;
    }

    const method = buffer.readUInt16LE(at + 10);
    const compressed = buffer.readUInt32LE(at + 20);
    const nameLength = buffer.readUInt16LE(at + 28);
    const extraLength = buffer.readUInt16LE(at + 30);
    const commentLength = buffer.readUInt16LE(at + 32);
    const localAt = buffer.readUInt32LE(at + 42);
    const name = buffer.toString("utf8", at + 46, at + 46 + nameLength);

    const dataAt =
      localAt + 30 + buffer.readUInt16LE(localAt + 26) + buffer.readUInt16LE(localAt + 28);
    const raw = buffer.subarray(dataAt, dataAt + compressed);

    entries.set(name, method === 0 ? raw : inflateRawSync(raw));
    at += 46 + nameLength + extraLength + commentLength;
  }

  return {
    /** Text of an entry, or null when the container does not carry it. */
    text(name) {
      const entry = entries.get(name);

      return entry ? entry.toString("utf8") : null;
    },
    names: [...entries.keys()],
  };
}

/* -------------------------------------------------------------------------- */
/* PPTX                                                                        */
/* -------------------------------------------------------------------------- */

/** Relationship id to target, from a `_rels` part, resolved against its owner. */
function readRels(zip, ownerPath) {
  const at = ownerPath.lastIndexOf("/");
  const dir = ownerPath.slice(0, at);
  const rels = zip.text(`${dir}/_rels/${ownerPath.slice(at + 1)}.rels`);
  const targets = new Map();

  if (!rels) {
    return targets;
  }

  for (const match of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /Id="([^"]+)"/.exec(match[0])?.[1];
    const target = /Target="([^"]+)"/.exec(match[0])?.[1];

    if (!id || !target) {
      continue;
    }

    targets.set(id, resolvePath(dir, target));
  }

  return targets;
}

function resolvePath(dir, target) {
  if (target.startsWith("/")) {
    return target.slice(1);
  }

  const parts = dir.split("/");

  for (const piece of target.split("/")) {
    if (piece === "..") {
      parts.pop();
    } else if (piece !== ".") {
      parts.push(piece);
    }
  }

  return parts.join("/");
}

/** Slide parts in presentation order. */
function slidePaths(zip) {
  const presentation = zip.text("ppt/presentation.xml");

  if (!presentation) {
    throw new Error("El pptx no trae ppt/presentation.xml.");
  }

  const rels = readRels(zip, "ppt/presentation.xml");
  const paths = [];

  for (const match of presentation.matchAll(/<p:sldId\b[^>]*r:id="([^"]+)"/g)) {
    const path = rels.get(match[1]);

    if (path) {
      paths.push(path);
    }
  }

  return paths;
}

function decodeXml(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&");
}

/** Every text run of a part, in document order. */
function textRuns(xml) {
  return [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((match) => decodeXml(match[1]));
}

/**
 * Cached points of a `<c:cat>`, `<c:val>` or `<c:tx>` block.
 *
 * The cache is indexed and sparse: a category with no value writes no `<c:pt>`
 * at all, which is exactly the "not measured" gap the annual chart carries for
 * the months of 2026 that have not happened. Missing indices come back as
 * `null` rather than zero, because zero is a number the report would draw.
 */
function cachedPoints(block) {
  const count = Number(/<c:ptCount\b[^>]*val="(\d+)"/.exec(block ?? "")?.[1] ?? 0);
  const values = new Array(count).fill(null);

  for (const match of (block ?? "").matchAll(
    /<c:pt\b[^>]*idx="(\d+)"[^>]*>([\s\S]*?)<\/c:pt>/g
  )) {
    const index = Number(match[1]);
    const raw = /<c:v>([\s\S]*?)<\/c:v>/.exec(match[2])?.[1];

    if (index < count && raw !== undefined) {
      values[index] = decodeXml(raw);
    }
  }

  return values;
}

function section(xml, tag) {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml);

  return match ? match[1] : null;
}

/** Series and categories of a chart part. */
function readChart(xml) {
  const blocks = xml.split(/<c:ser>/).slice(1);
  let categories = null;
  const series = [];

  for (const block of blocks) {
    const body = block.split("</c:ser>")[0];
    const cats = cachedPoints(section(body, "c:cat"));

    if (cats.length > 0 && (categories === null || categories.length === 0)) {
      categories = cats;
    }

    series.push({
      name: (cachedPoints(section(body, "c:tx"))[0] ?? "").trim(),
      values: cachedPoints(section(body, "c:val")).map((value) =>
        value === null || value === "" ? null : Number(value)
      ),
    });
  }

  return { categories: categories ?? [], series };
}

/**
 * Charts of the pptx keyed by the slide's numbering ("2.1", "3.2").
 *
 * Keyed by what the slide says rather than by its position: the responsible
 * reorders and hides slides between weeks, and a fixed slide index would seed
 * the location chart with the product one without failing.
 */
function readCharts(zip) {
  const charts = new Map();

  for (const path of slidePaths(zip)) {
    const xml = zip.text(path);

    if (!xml) {
      continue;
    }

    const rels = readRels(zip, path);
    const chartPaths = [];

    for (const [, target] of rels) {
      if (/\/charts\/chart\d+\.xml$/.test(target)) {
        chartPaths.push(target);
      }
    }

    if (chartPaths.length === 0) {
      continue;
    }

    const code = /(?:^|\s)([23])\.(\d)\s/.exec(` ${textRuns(xml).join(" ")} `)?.slice(1);

    if (!code) {
      continue;
    }

    const key = code.join(".");
    const chartXml = zip.text(chartPaths[0]);

    if (chartXml && !charts.has(key)) {
      charts.set(key, { slide: path, ...readChart(chartXml) });
    }
  }

  return charts;
}

/* -------------------------------------------------------------------------- */
/* Periods                                                                     */
/* -------------------------------------------------------------------------- */

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** `YYYY-MM-DD` of the Monday the given week number falls on. */
function weekDate(week) {
  const [year, month, day] = ANCHOR_DATE.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  date.setUTCDate(date.getUTCDate() - (ANCHOR_WEEK - week) * 7);

  return date.toISOString().slice(0, 10);
}

/** Week number of a category such as `"Semana 24\n(2026)"`. */
function categoryWeek(value) {
  const match = normalize(value).match(/^SEMANA\s+(\d{1,2})\b/);

  return match ? Number(match[1]) : null;
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/** `YYYY-MM` of an Excel serial category. The Office chart writes its months as serials. */
function serialMonth(value) {
  const serial = Number(value);

  if (!Number.isFinite(serial) || serial <= 0) {
    return null;
  }

  const date = new Date(EXCEL_EPOCH + Math.round(serial) * 86400000);

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

const MONTHS = [
  "ENERO",
  "FEBRERO",
  "MARZO",
  "ABRIL",
  "MAYO",
  "JUNIO",
  "JULIO",
  "AGOSTO",
  "SEPTIEMBRE",
  "OCTUBRE",
  "NOVIEMBRE",
  "DICIEMBRE",
];

/* -------------------------------------------------------------------------- */
/* Sections                                                                    */
/* -------------------------------------------------------------------------- */

function requireChart(charts, code) {
  const chart = charts.get(code);

  if (!chart) {
    throw new Error(
      `El pptx no trae el gráfico ${code}. Gráficos leídos: ${[...charts.keys()].join(", ") || "ninguno"}.`
    );
  }

  return chart;
}

/**
 * Weeks the two-series charts report on.
 *
 * The series are named, not ordered, and only two weeks are ever drawn: the
 * last two of the weekly total. A chart with a single unnamed series is the
 * current week alone.
 */
function seriesWeek(name, previousWeek, currentWeek) {
  const key = normalize(name);

  if (key.includes("ANTERIOR")) {
    return previousWeek;
  }

  return currentWeek;
}

function toBreakdown(chart, previousWeek, currentWeek) {
  return chart.categories.map((label, index) => ({
    label: String(label).replace(/\s+/g, " ").trim(),
    counts: chart.series
      .map((serie) => ({
        week: seriesWeek(serie.name, previousWeek, currentWeek),
        count: serie.values[index],
      }))
      .filter((entry) => typeof entry.count === "number" && Number.isFinite(entry.count))
      .map((entry) => ({ week: entry.week, count: entry.count })),
  }));
}

function buildManaged(charts) {
  const total = requireChart(charts, "2.1");
  const weeklyTotals = [];

  total.categories.forEach((category, index) => {
    const week = categoryWeek(category);
    const value = total.series[0]?.values[index];

    if (week !== null && typeof value === "number") {
      weeklyTotals.push({ week: weekDate(week), total: value });
    }
  });

  weeklyTotals.sort((a, b) => a.week.localeCompare(b.week));

  if (weeklyTotals.length < 2) {
    throw new Error("El gráfico 2.1 no trae dos semanas con las que anclar las comparativas.");
  }

  const currentWeek = weeklyTotals[weeklyTotals.length - 1].week;
  const previousWeek = weeklyTotals[weeklyTotals.length - 2].week;

  const byDepartmentProduct = Object.entries(DEPARTMENT_SLIDES).map(([code, department]) => ({
    department,
    rows: toBreakdown(requireChart(charts, code), previousWeek, currentWeek),
  }));

  return {
    section: {
      weeklyTotals,
      byDepartment: toBreakdown(requireChart(charts, "2.2"), previousWeek, currentWeek),
      byProduct: toBreakdown(requireChart(charts, "2.3"), previousWeek, currentWeek),
      byLocation: toBreakdown(requireChart(charts, "2.4"), previousWeek, currentWeek),
      byDepartmentProduct,
    },
    previousWeek,
    currentWeek,
  };
}

function buildOffice(charts) {
  const chart = requireChart(charts, "2.8");
  const months = chart.categories.map(serialMonth);

  if (months.some((month) => month === null)) {
    throw new Error(
      `El gráfico 2.8 trae categorías que no son meses: ${chart.categories.join(", ")}.`
    );
  }

  return {
    months,
    families: chart.series.map((serie) => ({
      label: serie.name,
      values: months.map((_, index) => {
        const value = serie.values[index];

        return typeof value === "number" && Number.isFinite(value) ? value : null;
      }),
    })),
  };
}

/** Twelve months per year, `null` where the chart has no point. */
function buildYearSeries(chart, code) {
  const order = chart.categories.map((category) => MONTHS.indexOf(normalize(category)));

  if (order.some((month) => month === -1)) {
    throw new Error(
      `El gráfico ${code} trae categorías que no son meses: ${chart.categories.join(", ")}.`
    );
  }

  return chart.series.map((serie) => {
    const values = new Array(12).fill(null);

    order.forEach((month, index) => {
      const value = serie.values[index];

      if (typeof value === "number" && Number.isFinite(value)) {
        values[month] = value;
      }
    });

    return { year: Number(serie.name), values };
  });
}

function buildAnnual(charts) {
  const peticiones = buildYearSeries(requireChart(charts, "3.1"), "3.1");
  const posiciones = buildYearSeries(requireChart(charts, "3.2"), "3.2");
  const years = [...peticiones, ...posiciones].map((serie) => serie.year);

  if (years.some((year) => !Number.isInteger(year))) {
    throw new Error("Los gráficos 3.1 y 3.2 traen series cuyo nombre no es un año.");
  }

  return { peticiones, posiciones };
}

/* -------------------------------------------------------------------------- */
/* Report                                                                      */
/* -------------------------------------------------------------------------- */

function percent(value) {
  return `${(value * 100).toFixed(1).replace(".", ",")}%`;
}

function countAt(row, week) {
  return row.counts.find((entry) => entry.week === week)?.count ?? 0;
}

function describe(name, rows, week) {
  const total = rows.reduce((sum, row) => sum + countAt(row, week), 0);

  console.log(`${name.padEnd(24)} ${String(rows.length).padStart(3)} filas   suma ${total}`);
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

async function main() {
  const path = process.argv[2] ?? DEFAULT_SOURCE;
  const zip = readZip(path);
  const charts = readCharts(zip);
  const { section: managed, previousWeek, currentWeek } = buildManaged(charts);
  const office = buildOffice(charts);
  const annual = buildAnnual(charts);

  const url = process.env.URL_TURSO ?? "file:./data/av-weekly.db";
  const client = createClient(
    url.startsWith("file:") ? { url } : { url, authToken: process.env.TOKEN_TURSO }
  );

  const result = await client.execute("SELECT data, source_file FROM aga_dataset WHERE id = 1");
  const existing = result.rows.length > 0 ? JSON.parse(result.rows[0].data) : null;

  if (!existing) {
    throw new Error(
      "No hay dataset de AGA en la base. Sube antes el GPS semanal: las secciones 2 y 3 se " +
        "añaden a la historia de semanas, no la sustituyen."
    );
  }

  const stamp = { sourceFile: path.split(/[\\/]/).pop(), uploadedAt: new Date().toISOString() };

  // Only the three seeded sections are written. `weeks` and `source` are the
  // GPS upload's and are carried over untouched.
  const dataset = {
    ...existing,
    managed: { ...managed, source: stamp },
    office: { ...office, source: stamp },
    annual: { ...annual, source: stamp },
  };

  await client.execute({
    sql: `UPDATE aga_dataset SET data = ? WHERE id = 1`,
    args: [JSON.stringify(dataset)],
  });

  /* Report ---------------------------------------------------------------- */

  console.log(`Fuente: ${path}`);
  console.log(`Gráficos leídos: ${[...charts.keys()].join(", ")}\n`);

  console.log("2.1 Total gestionadas por semana");
  console.log(
    managed.weeklyTotals.map((entry) => `  ${entry.week}  ${entry.total}`).join("\n")
  );

  console.log(`\nSemana actual ${currentWeek} · semana anterior ${previousWeek}\n`);
  describe("2.2 Departamento", managed.byDepartment, currentWeek);
  describe("2.3 Producto", managed.byProduct, currentWeek);
  describe("2.4 Ubicación", managed.byLocation, currentWeek);

  for (const entry of managed.byDepartmentProduct) {
    describe(`2.x ${entry.department}`, entry.rows, currentWeek);
  }

  console.log(
    `\n2.8 Office: ${office.months.length} meses (${office.months[0]} … ` +
      `${office.months[office.months.length - 1]}), ${office.families.length} familias`
  );
  console.log(
    `3.1 Peticiones: años ${annual.peticiones.map((serie) => serie.year).join(", ")}`
  );
  console.log(
    `3.2 Posiciones: años ${annual.posiciones.map((serie) => serie.year).join(", ")}`
  );

  /* KPIs ------------------------------------------------------------------ */

  const totals = managed.weeklyTotals;
  const current = totals[totals.length - 1].total;
  const previous = totals[totals.length - 2].total;
  const locationTotal = managed.byLocation.reduce(
    (sum, row) => sum + countAt(row, currentWeek),
    0
  );
  const top = managed.byLocation
    .map((row) => ({ label: row.label, count: countAt(row, currentWeek) }))
    .sort((a, b) => b.count - a.count)[0];

  console.log("\nKPI 2.1 (la diapositiva presentada dice -30,6%)");
  console.log(`  (actual - anterior) / anterior = ${percent((current - previous) / previous)}`);
  console.log(`  (anterior - actual) / actual   = ${percent((previous - current) / current)}`);
  console.log("KPI 2.4 (la diapositiva presentada dice 58,5%)");
  console.log(
    `  ${top.label} ${top.count} / ${locationTotal} ubicaciones = ${percent(top.count / locationTotal)}`
  );

  console.log(
    `\nSemanas en aga_dataset: ${dataset.weeks.length} (intactas). ` +
      "Secciones escritas: managed, office, annual."
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
