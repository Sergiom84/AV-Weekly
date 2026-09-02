/**
 * Siembra `oficinas_dataset` con los años que el template semanal no trae:
 * 2023, 2024 y 2025 de las series semanales, y el desglose por DT de
 * recicladores que rellena el hueco de las semanas 2-20 de 2025.
 *
 * El histórico "DATOS Weekly  historico_oficinas_Recicladores.xlsx"
 * es el fichero que el equipo mantiene a mano; no llega por la web como el
 * template semanal, así que se siembra igual que el maestro de oficinas
 * (`importar-maestro-oficinas.mjs`): a mano, en local, una vez corregido.
 *
 * ALCANCE de las series semanales de ASIGNADAS y RESUELTAS: el fichero no
 * declara variante, pero es SIN VALIDADORAS. Comprobado columna a columna
 * contra el template de la semana 34 de 2026: de las 34 semanas que su
 * columna "Año 2026" trae, 20 coinciden al dígito con la matriz "sin
 * validadoras" de asignadas y ninguna con el total "con validadoras" (las
 * demás difieren en 1-2 incidencias porque esa columna es una foto
 * congelada, ver más abajo). En resueltas, 16 coincidencias con "sin" y una
 * sola con "con". Por eso los años del histórico se guardan en
 * `asignadas.history` / `resueltas.history` etiquetados con la variante, y
 * NO en `totalsByWeek`, que es el total del template y sí cuenta las
 * validadoras. Mezclarlos hacía que la gráfica comparase 2026 con
 * validadoras contra 2025 sin ellas.
 *
 * Reglas de precedencia, verificadas antes de escribir este script:
 *
 * - El template semanal manda siempre para cualquier (año, semana) que ya
 *   tenga. Este import es puramente aditivo: solo añade celdas que el
 *   dataset guardado no tiene todavía. Las semanas donde ambas fuentes
 *   coinciden en fecha pero no en valor (el sistema de tickets realimenta
 *   semanas pasadas) nunca se pisan.
 * - La columna "Año 2026" del histórico NO se importa: es una foto
 *   congelada en la fecha en que se refrescó el fichero a mano, más vieja
 *   que la última subida del template, y divergía de ella semana a semana
 *   en la comprobación previa a esta importación.
 * - El bloque DT de ASIGNADAS/RESUELTAS SEMANAL (año 2024, corregido: antes
 *   decía 2025) no se importa: no declara variante (con/sin/solo
 *   validadoras) y ninguna página del deck necesita el desglose por DT del
 *   año anterior para asignadas o resueltas, solo el total semanal.
 * - El bloque DT de Peticiones IMAC no se importa: la hoja 13 del template ya
 *   trae esa comparación completa. El bloque por tipología de 2025 sí se
 *   conserva, porque es la única fuente de comparación por tipo. Solo contiene
 *   seis categorías; las dos categorías nuevas de 2026 quedan ausentes, no a 0.
 * - La hoja "Comparativa 2024-2025" es mensual, no semanal; ningún campo del
 *   dataset ni página del deck consume esa granularidad hoy. Se deja fuera.
 *
 *   node scripts/importar-historico-oficinas.mjs [ruta.xlsx] [--dry-run]
 */

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
require("dotenv/config");
const XLSX = require("xlsx");
const { createClient } = require("@libsql/client");

const DEFAULT_SOURCE =
  "C:/Users/sergi/Desktop/MIX/AV weekly/Oficinas/DATOS Weekly  historico_oficinas_Recicladores.xlsx";

/** Variante que miden las series semanales del histórico. Ver la cabecera. */
const HISTORY_VARIANT = "sin";

/** Mismo contrato que `shared/modules/oficinas/types.ts`, duplicado por la misma razón que el importador del maestro: script .mjs sin transpilador. */
const DT_LABELS = [
  "D.T. CANARIAS",
  "D.T. CATALUÑA",
  "D.T. CENTRO",
  "D.T. ESTE",
  "D.T. NOROESTE",
  "D.T. NORTE",
  "D.T. SUR",
];
const OTHERS = "OTROS";

function dtKey(raw) {
  return String(raw ?? "")
    .normalize("NFD")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .replace(/^DT/, "")
    .replace(/^CATALUNYA$/, "CATALUNA");
}

function normalizeDT(raw) {
  const text = String(raw ?? "").replace(/\(en blanco\)/i, "").trim();

  if (text === "") return OTHERS;

  const key = dtKey(text);

  if (key === "") return OTHERS;

  return DT_LABELS.find((label) => dtKey(label) === key) ?? text.replace(/\s+/g, " ");
}

function grid(workbook, name) {
  return XLSX.utils.sheet_to_json(workbook.Sheets[name], {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false,
  });
}

/** Los totales semanales de las cuatro columnas de la izquierda, por año, excluyendo 2026. */
function readLeftTotals(rows, yearCols) {
  const byYear = {};

  for (const [year, col] of Object.entries(yearCols)) {
    const values = [];

    for (let w = 1; w <= 52; w += 1) {
      const value = rows[w]?.[col];

      if (typeof value === "number") {
        values.push({ year: Number(year), week: w, value });
      }
    }

    byYear[year] = values;
  }

  return byYear;
}

/** Bloque DT de la derecha (Semana | OF/Media | 1..52), agrupado por DT normalizada. */
export function readDTBlock(rows, year, totalRowLabel, labelCol) {
  const totalRow = rows.find(
    (r) => String(r[labelCol] ?? "").toUpperCase() === totalRowLabel
  );
  const hdrRow = rows.find((r) =>
    String(r[labelCol] ?? "").toLowerCase().startsWith("semana")
  );

  if (!totalRow || !hdrRow) {
    return [];
  }

  const weekCols = [];

  for (let c = labelCol + 1; c < hdrRow.length; c += 1) {
    const v = hdrRow[c];

    if (typeof v === "number" && v >= 1 && v <= 52) weekCols.push(c);
  }

  const hdrIdx = rows.indexOf(hdrRow);
  const totalIdx = rows.indexOf(totalRow);
  const out = new Map();

  for (let r = hdrIdx + 1; r < totalIdx; r += 1) {
    const rawLabel = rows[r]?.[labelCol];

    if (rawLabel === null || rawLabel === undefined || String(rawLabel).trim() === "") {
      continue;
    }

    const label = normalizeDT(rawLabel);
    const values = weekCols
      .map((c, i) => ({ year, week: i + 1, value: rows[r][c] }))
      .filter((entry) => typeof entry.value === "number");

    const existing = out.get(label);

    if (existing) {
      existing.push(...values);
    } else {
      out.set(label, values);
    }
  }

  return Array.from(out.entries()).map(([label, values]) => ({ label, values }));
}

const PETICION_TYPES = new Map([
  ["AMPLIACION", "AMPLIACIÓN"],
  ["DESINSTALACION", "DESINSTALACIÓN"],
  ["SINIESTRO", "SINIESTRO"],
  ["REUBICACION INTERNA", "REUBICACIÓN INTERNA"],
  ["REINSTALACION", "REINSTALACIÓN"],
  ["SUSTITUCION", "SUSTITUCIÓN DE TERMINAL YA GENERADO"],
]);

function typeKey(raw) {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/** Six categories the 2025 source reports, aligned to current labels. */
export function readPreviousTypeRows(rows, year = 2025) {
  return readDTBlock(rows, year, "TOTAL", 6)
    .map(row => ({ ...row, label: PETICION_TYPES.get(typeKey(row.label)) ?? null }))
    .filter(row => row.label !== null);
}

/** Añade solo las celdas `(year, week)` que `existing` no tiene ya. Nunca pisa una existente. */
function addMissingValues(existing, incoming) {
  const have = new Set((existing ?? []).map((e) => `${e.year}:${e.week}`));
  const additions = (incoming ?? []).filter((e) => !have.has(`${e.year}:${e.week}`));

  return {
    values: [...(existing ?? []), ...additions].sort(
      (a, b) => a.year - b.year || a.week - b.week
    ),
    added: additions.length,
  };
}

/** Igual que `addMissingValues`, pero por fila de DT, uniendo por `normalizeDT`. */
export function addMissingRows(existingRows, incomingRows) {
  const rows = (existingRows ?? []).map((row) => ({ ...row, values: [...row.values] }));
  const byLabel = new Map(rows.map((row) => [normalizeDT(row.label), row]));
  let added = 0;

  for (const incoming of incomingRows) {
    const key = normalizeDT(incoming.label);
    const target = byLabel.get(key);

    if (target) {
      const { values, added: rowAdded } = addMissingValues(target.values, incoming.values);

      target.values = values;
      added += rowAdded;
    } else {
      rows.push({ label: incoming.label, values: incoming.values });
      byLabel.set(key, rows[rows.length - 1]);
      added += incoming.values.length;
    }
  }

  return { rows, added };
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--dry-run");
  const dryRun = process.argv.includes("--dry-run");
  const path = args[0] ?? DEFAULT_SOURCE;

  const workbook = XLSX.readFile(path);
  const yearCols = { 2023: 1, 2024: 2, 2025: 3 };

  const asignadasTotals = readLeftTotals(grid(workbook, "ASIGNADAS SEMANAL"), yearCols);
  const resueltasTotals = readLeftTotals(grid(workbook, "RESUELTAS SEMANAL"), yearCols);
  const peticionesTotals = readLeftTotals(grid(workbook, "Peticiones IMAC"), yearCols);
  const peticionesTipo2025 = readPreviousTypeRows(
    grid(workbook, "Peticiones IMAC"),
    2025
  );

  const recRows = grid(workbook, "RECICLADORES RESUELTAS");
  const recicladores2025 = readDTBlock(recRows, 2025, "TOTAL GENERAL", 6);
  const recicladores2024 = readDTBlock(recRows, 2024, "TOTAL GENERAL", 6);

  // Same resolution order as `server/db-config.ts`: URL_TURSO first, then the
  // legacy SQL_TURSO name the project's .env actually carries, then the local
  // file. Diverging from that order is how a seeding script silently writes to
  // an unused local sqlite file while the running app reads Turso.
  const url =
    process.env.URL_TURSO?.trim() ||
    process.env.SQL_TURSO?.trim() ||
    "file:./data/av-weekly.db";
  const client = createClient(
    url.startsWith("file:") ? { url } : { url, authToken: process.env.TOKEN_TURSO }
  );
  console.log(`BD: ${url.startsWith("file:") ? url : url.replace(/\/\/.*@/, "//<host>")}`);

  const result = await client.execute("SELECT data, source_file FROM oficinas_dataset WHERE id = 1");

  if (result.rows.length === 0) {
    throw new Error(
      "oficinas_dataset no existe todavía: sube primero el template semanal desde la web."
    );
  }

  const existing = JSON.parse(result.rows[0].data);
  const report = [];

  function flatten(incomingByYear) {
    return Object.values(incomingByYear).flat();
  }

  /**
   * Siembra los años del histórico en `<seccion>.history`, etiquetados con la
   * variante que miden, y limpia de `totalsByWeek` lo que una ejecución
   * anterior de este script metió ahí antes de que existiera `history`.
   *
   * La limpieza no borra "todo año anterior al actual": cuando pase 2026 a
   * 2027, `totalsByWeek` tendrá 2026 legítimo del template y hay que
   * conservarlo. El criterio es que un año presente en `totalsByWeek` y
   * ausente de las tres matrices `byDT` no puede venir del template, porque el
   * template siempre trae ambas cosas a la vez; solo puede venir de aquí.
   */
  function seedHistory(sectionKey, incomingByYear) {
    const section = existing[sectionKey] ?? {};
    const history = section.history ?? [];
    const entry = history.find((item) => item.variant === HISTORY_VARIANT);
    const { values, added } = addMissingValues(entry?.values, flatten(incomingByYear));

    const templateYears = new Set(
      (section.byDT ?? []).flatMap((matrix) =>
        matrix.rows.flatMap((row) => row.values.map((cell) => cell.year))
      )
    );
    const totals = section.totalsByWeek ?? [];
    // Sin matrices no hay con qué distinguir el origen de un año: se deja la
    // serie intacta antes que vaciarla entera.
    const cleaned =
      templateYears.size === 0
        ? totals
        : totals.filter((cell) => templateYears.has(cell.year));

    existing[sectionKey] = {
      ...section,
      totalsByWeek: cleaned,
      history: [
        ...history.filter((item) => item.variant !== HISTORY_VARIANT),
        { variant: HISTORY_VARIANT, values },
      ],
    };

    report.push(
      `${sectionKey}.history[${HISTORY_VARIANT}]: +${added} semanas` +
        (totals.length === cleaned.length
          ? ""
          : `; totalsByWeek: -${totals.length - cleaned.length} celdas sembradas por una ejecución anterior`)
    );
  }

  /** Peticiones no tiene variantes: su serie semanal es una sola y va donde estaba. */
  function seedTotals(sectionKey, incomingByYear) {
    const section = existing[sectionKey] ?? {};
    const { values, added } = addMissingValues(
      section.totalsByWeek,
      flatten(incomingByYear)
    );

    existing[sectionKey] = { ...section, totalsByWeek: values };
    report.push(`${sectionKey}.totalsByWeek: +${added} semanas`);
  }

  seedHistory("asignadas", asignadasTotals);
  seedHistory("resueltas", resueltasTotals);
  seedTotals("peticiones", peticionesTotals);

  const peticiones = existing.peticiones ?? {};
  const byTipoPrevious = addMissingRows(
    peticiones.byTipoPrevious,
    peticionesTipo2025
  );
  existing.peticiones = {
    ...peticiones,
    byTipoPrevious: byTipoPrevious.rows,
  };
  report.push(
    `peticiones.byTipoPrevious (2025, ${peticionesTipo2025.length} categorías reportadas, S35=${peticionesTipo2025.reduce(
      (sum, row) =>
        sum + (row.values.find(cell => cell.year === 2025 && cell.week === 35)?.value ?? 0),
      0
    )}): +${byTipoPrevious.added} celdas`
  );

  const recicladores = existing.recicladores ?? {};
  const byDT = addMissingRows(recicladores.byDT, recicladores2024);
  const byDTPrevious = addMissingRows(recicladores.byDTPrevious, recicladores2025);

  existing.recicladores = {
    ...recicladores,
    byDT: byDT.rows,
    byDTPrevious: byDTPrevious.rows,
  };
  report.push(`recicladores.byDT (2024): +${byDT.added} celdas`);
  report.push(`recicladores.byDTPrevious (2025, huecos semana 2-20): +${byDTPrevious.added} celdas`);

  console.log(`Fuente: ${path}`);
  console.log("");
  report.forEach((line) => console.log(line));
  console.log("");

  if (dryRun) {
    console.log("Dry-run: no se ha escrito nada en la base de datos.");
    return;
  }

  await client.execute({
    sql: `UPDATE oficinas_dataset SET data = ? WHERE id = 1`,
    args: [JSON.stringify(existing)],
  });

  console.log("oficinas_dataset actualizado. source_file y uploaded_at sin tocar.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
