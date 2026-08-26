/**
 * Reordena y retitula el deck de Oficinas guardado para que siga el orden del
 * informe publicado en PDF ("Informe semanal | Oficinas").
 *
 * Por qué hace falta un script y no basta con la plantilla: el deck se guarda
 * entero y `mergeOficinasDeckTemplate` solo AÑADE las páginas que faltan; nunca
 * mueve las que ya están, porque el orden de un deck guardado es una decisión
 * del usuario y no de la plantilla. Cambiar esa regla haría que cualquier
 * reordenación manual se deshiciera al recargar. Así que el reorden se hace una
 * vez, a mano, con esto.
 *
 * Qué respeta:
 *
 * - Las páginas que el usuario añadió (ids que la plantilla no declara) no se
 *   tiran: se recolocan detrás de la página que hoy las precede.
 * - Los textos escritos a mano no se pisan. Un título solo se reescribe si
 *   coincide letra a letra con el valor por defecto anterior, es decir, si nadie
 *   lo había tocado.
 * - `overrides`, `images`, `visible` y `supportType` no se tocan.
 * - Las páginas nuevas de la plantilla NO se crean aquí. Al abrir la app,
 *   `mergeOficinasDeckTemplate` las inserta detrás de su página de referencia,
 *   que después de este reorden ya es la correcta.
 *
 *   node scripts/reordenar-deck-oficinas.mjs [--dry-run]
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("dotenv/config");
const { createClient } = require("@libsql/client");

/**
 * Orden de la plantilla, el mismo que `shared/modules/oficinas/deck.ts`.
 * Duplicado por la misma razón que en los otros scripts: son .mjs sin
 * transpilador y no pueden importar el contrato en TypeScript.
 */
const TEMPLATE_ORDER = [
  "cover",
  "index",
  "oficinas-seccion-servicio",
  "oficinas-seccion-asignadas",
  "oficinas-asignadas-dt",
  "oficinas-resueltas-dt",
  "oficinas-seccion-resueltas",
  "oficinas-asignadas-semanal",
  "oficinas-asignadas-elemento",
  "oficinas-resueltas-semanal",
  "oficinas-resueltas-elemento",
  "oficinas-seccion-peticiones",
  "oficinas-peticiones-dt-semanal",
  "oficinas-peticiones-dt",
  "oficinas-peticiones-tipo-semanal",
  "oficinas-peticiones-tipo",
  "oficinas-seccion-encuestas",
  "oficinas-encuestas",
  "oficinas-seccion-recicladores",
  "oficinas-recicladores-dt-semanal",
  "oficinas-recicladores-dt",
  "oficinas-recicladores-elemento-semanal",
  "oficinas-recicladores-elemento",
  "oficinas-seccion-kanban",
  "oficinas-kanban",
  "closing",
];

/** Retítulos, aplicados solo si el texto guardado sigue siendo el anterior por defecto. */
const RETITLES = [
  {
    id: "cover",
    key: "title",
    from: "Informe semanal del servicio",
    to: "Informe de seguimiento de Oficinas",
  },
  {
    id: "index",
    key: "item1",
    from: "1. Servicio Soporte Oficinas",
    to: "1. Revisión de métricas",
  },
  {
    id: "index",
    key: "item2",
    from: "2. Kanban",
    to: "1.1 Incidencias asignadas y resueltas por territorial",
  },
  {
    id: "index",
    key: "item3",
    from: "3 . Otros",
    to: "1.2 Incidencias asignadas y resueltas por componente",
  },
  { id: "index", key: "item4", from: undefined, to: "1.3 Peticiones" },
  {
    id: "index",
    key: "item5",
    from: undefined,
    to: "1.4 Volumetría Encuestas Peticiones",
  },
  { id: "index", key: "item6", from: undefined, to: "1.5 Recicladores" },
  { id: "index", key: "item7", from: undefined, to: "2. Kanban" },
  {
    id: "oficinas-seccion-servicio",
    key: "title",
    from: "1. Servicio Soporte Oficinas",
    to: "1. Revisión de métricas",
  },
  {
    id: "oficinas-seccion-asignadas",
    key: "title",
    from: "1.1 Incidencias asignadas",
    to: "1.1 Incidencias asignadas y resueltas por territorial",
  },
  {
    id: "oficinas-asignadas-dt",
    key: "title",
    from: "1.1 Incidencias asignadas por DT",
    to: "1.1 Volumetría de incidencias asignadas",
  },
  {
    id: "oficinas-resueltas-dt",
    key: "title",
    from: "1.2 Incidencias resueltas por DT",
    to: "1.2 Volumetría de incidencias resueltas",
  },
  {
    id: "oficinas-seccion-resueltas",
    key: "title",
    from: "1.2 Incidencias resueltas",
    to: "1.2 Incidencias asignadas y resueltas por componente",
  },
  {
    id: "oficinas-seccion-peticiones",
    key: "title",
    from: "1.3 Peticiones",
    to: "1.3 Peticiones resueltas",
  },
  {
    id: "oficinas-seccion-encuestas",
    key: "title",
    from: "1.4 Encuestas",
    to: "1.4 Volumetría Encuestas Peticiones",
  },
  {
    id: "oficinas-encuestas",
    key: "title",
    from: "1.4 Valoración de las encuestas",
    to: "1.4 Volumetría de encuestas realizadas (Peticiones)",
  },
  { id: "closing", key: "title", from: "Gracias", to: "¡Gracias!" },
];

/**
 * Coloca las páginas de plantilla en el orden de `TEMPLATE_ORDER` y devuelve
 * cada página ajena a la plantilla detrás de la que hoy la precede.
 *
 * El ancla es la página anterior en el deck GUARDADO, no en el nuevo orden: es
 * lo único que dice dónde quiso ponerla quien la creó.
 */
function reorder(pages) {
  const rank = new Map(TEMPLATE_ORDER.map((id, index) => [id, index]));
  const extras = new Map();

  for (let i = 0; i < pages.length; i += 1) {
    if (rank.has(pages[i].id)) continue;

    let anchor = null;

    for (let j = i - 1; j >= 0; j -= 1) {
      if (rank.has(pages[j].id)) {
        anchor = pages[j].id;
        break;
      }
    }

    const list = extras.get(anchor) ?? [];

    list.push(pages[i]);
    extras.set(anchor, list);
  }

  const byId = new Map(pages.map(page => [page.id, page]));
  const out = [...(extras.get(null) ?? [])];

  for (const id of TEMPLATE_ORDER) {
    const page = byId.get(id);

    if (!page) continue;

    out.push(page);
    out.push(...(extras.get(id) ?? []));
  }

  return out;
}

function retitle(pages, report) {
  return pages.map(page => {
    const changes = RETITLES.filter(rule => rule.id === page.id);

    if (changes.length === 0) return page;

    const text = { ...(page.text ?? {}) };
    let touched = false;

    for (const rule of changes) {
      const current = text[rule.key];

      // `from: undefined` es una entrada que antes no existía: se rellena, pero
      // nunca se pisa si alguien ya escribió algo ahí.
      const replaceable =
        rule.from === undefined
          ? current === undefined || current === ""
          : current === rule.from;

      if (!replaceable) {
        report.push(`  = ${page.id}.${rule.key}: se conserva "${current}"`);
        continue;
      }

      report.push(
        `  > ${page.id}.${rule.key}: "${current ?? ""}" -> "${rule.to}"`
      );
      text[rule.key] = rule.to;
      touched = true;
    }

    return touched ? { ...page, text } : page;
  });
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const url =
    process.env.URL_TURSO?.trim() ||
    process.env.SQL_TURSO?.trim() ||
    "file:./data/av-weekly.db";
  const client = createClient(
    url.startsWith("file:")
      ? { url }
      : { url, authToken: process.env.TOKEN_TURSO }
  );

  console.log(
    `BD: ${url.startsWith("file:") ? url : url.replace(/\/\/.*@/, "//<host>")}`
  );

  const result = await client.execute(
    "SELECT data FROM oficinas_deck WHERE id = 1"
  );

  if (result.rows.length === 0) {
    throw new Error(
      "oficinas_deck no existe todavía: abre el informe una vez desde la web."
    );
  }

  const deck = JSON.parse(result.rows[0].data);
  const before = deck.pages.map(page => page.id);
  const report = [];
  const pages = retitle(reorder(deck.pages), report);
  const after = pages.map(page => page.id);

  if (pages.length !== deck.pages.length) {
    throw new Error(
      `El reorden ha cambiado el número de páginas (${deck.pages.length} -> ${pages.length}). Abortado.`
    );
  }

  console.log("");
  console.log("Orden nuevo:");
  after.forEach((id, index) => {
    const moved = before[index] !== id;
    console.log(
      `${String(index + 1).padStart(2)}. ${id}${moved ? "   <- movida" : ""}`
    );
  });

  if (report.length > 0) {
    console.log("");
    console.log("Textos (> reescrito, = conservado):");
    report.forEach(line => console.log(line));
  }

  console.log("");

  if (dryRun) {
    console.log("Dry-run: no se ha escrito nada en la base de datos.");
    return;
  }

  await client.execute({
    sql: "UPDATE oficinas_deck SET data = ? WHERE id = 1",
    args: [JSON.stringify({ ...deck, pages })],
  });

  console.log("oficinas_deck reordenado.");
  console.log(
    "Las páginas nuevas de la plantilla aparecerán en su sitio al abrir el informe."
  );
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
