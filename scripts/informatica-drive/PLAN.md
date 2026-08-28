# Plan de implementación: Informática SSCC desde Drive

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que los cinco ficheros que Informática sube cada semana a Drive rellenen solos el libro `SSCC- Informe Semanal limpio` y produzcan una pestaña `PLANO` que AV Weekly importa, con el histórico mensual completo persistido en Turso.

**Architecture:** Un Apps Script vinculado a la hoja de Google lee la carpeta de Drive, escribe las pestañas de datos y los marcadores de periodo, y serializa los agregados a texto plano. En el repositorio, un contrato de texto compartido y un parser de servidor convierten ese texto en el `InformaticaDataset` que el deck ya sabe pintar. Las fórmulas del libro no se sustituyen: siguen calculando.

**Tech Stack:** Google Apps Script (ES5, sin módulos), TypeScript, Node 22, vitest, `xlsx`, Express, libSQL/Turso.

Especificación: [`SPEC.md`](./SPEC.md). Léela entera antes de la tarea 1.

## Global Constraints

- Gestor de paquetes: `pnpm`. No cambiar dependencias sin ampliar el alcance.
- `AGENTS.md` es el contrato del repositorio. Código y comentarios en inglés; texto de producto en español.
- Sin emojis ni microcopy explicativo en UI. Tipografía limitada a Cormorant Garamond y JetBrains Mono.
- Separación `client/` · `server/` · `shared/`. El contrato canónico vive en `shared/`.
- `Codigo.gs` corre en Apps Script: **ES5**, sin `const`, `let`, arrow functions, template literals, `Map`, `Set` ni módulos. Usa `var` y `function`, como el `scripts/aga-drive/Codigo.gs` existente.
- **`node --check` no acepta la extensión `.gs`** en Node 24: falla con `ERR_UNKNOWN_FILE_EXTENSION` igual sobre el script de AGA que sobre este, así que no dice nada del código. Se comprueba copiando a `.js` primero, que es lo que hacen los pasos de verificación de las tareas 5 a 12.
- El grep de sintaxis moderna **no puede incluir el backtick suelto**: los comentarios de `scripts/aga-drive/Codigo.gs` usan backticks para citar identificadores, y prohibirlos separaría el estilo de documentación de los dos scripts hermanos. Busca `\$\{` para detectar template literals de verdad.
- Ningún dato personal sale hacia la pestaña `PLANO`: solo recuentos.
- Los maestros del libro (`Hoja 17!X:Z`, `2.1.6 Datos!Y:Z`, `2.1.6 Datos!AB`, `Hoja 18!BC:BE`) no se escriben nunca.
- Verificación al cerrar cada tarea: `pnpm run check` y `pnpm test`.
- Commits: uno por tarea, en `master`, sin `git push`.

## File Structure

| Fichero | Responsabilidad |
|---|---|
| `shared/modules/informatica/texto.ts` | Contrato del formato de texto: cabecera, nombres de sección, orden de columnas y serializador. |
| `server/parseInformaticaTexto.ts` | Lee el texto y devuelve `InformaticaDataset`. |
| `server/informatica-texto.test.ts` | Tests del contrato y del parser. |
| `server/parseInformaticaPlano.ts:1190-1206` | Modificar: clave de posesión semanal en el merge. |
| `server/routes.ts` | Añadir: `POST /api/informatica/upload/texto`. |
| `shared/deck/registry.ts:130-139` | Añadir: slot de subida "Texto plano (Drive)". |
| `scripts/informatica-drive/Codigo.gs` | El Apps Script completo. |
| `scripts/informatica-drive/verificar-local.mjs` | Ejecuta la agregación de `Codigo.gs` fuera de Google. |
| `scripts/informatica-drive/README.md` | Instalación y rutina semanal, para los compañeros. |

Las tareas 1 a 4 tocan solo el repositorio y son verificables con `vitest`. Las tareas 5 a 10 construyen `Codigo.gs`, que solo se verifica con la tarea 11. Por eso la 11 no se deja para el final del todo: se levanta en cuanto `Codigo.gs` tiene agregación.

---

## Task 1: Contrato del formato de texto plano

**Files:**
- Create: `shared/modules/informatica/texto.ts`
- Test: `server/informatica-texto.test.ts`

**Interfaces:**
- Consumes: `InformaticaDataset` y los tipos de fila de `shared/modules/informatica/types.ts`.
- Produces:
  - `INFORMATICA_TEXTO_HEADER: "INFORMATICA TEXTO PLANO v1"`
  - `INFORMATICA_TEXTO_SECTIONS: Record<string, string>`
  - `INFORMATICA_TEXTO_META: { week: "semana"; generated: "generado"; source: "origen" }`
  - `serializeInformaticaTexto(dataset: InformaticaDataset, meta: InformaticaTextoMeta): string`
  - `interface InformaticaTextoMeta { week?: string; generated?: string; source?: string }`

- [ ] **Step 1: Escribe el test que falla**

Crea `server/informatica-texto.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  INFORMATICA_TEXTO_HEADER,
  serializeInformaticaTexto,
} from "../shared/modules/informatica/texto.ts";
import type { InformaticaDataset } from "../shared/modules/informatica/types.ts";

const source = { sourceFile: "Backlog.xlsx", uploadedAt: "2026-08-24T09:00:00.000Z" };

describe("serializeInformaticaTexto", () => {
  it("escribe cabecera, metadatos y una seccion por concepto", () => {
    const dataset: InformaticaDataset = {
      source,
      peticiones: [
        {
          fecha: null,
          semana: 34,
          mes: "2026/08",
          origen: "On Site",
          estado: "En vuelo",
          entidad: "Peticiones",
          total: 306,
        },
      ],
      encuestas: [{ fecha: null, mes: "2026/08", valoracion: "5", respuestas: 412 }],
    };

    const texto = serializeInformaticaTexto(dataset, {
      week: "2026-08-24",
      generated: "2026-08-24T09:00:00.000Z",
      source: "Backlog.xlsx",
    });

    expect(texto.split("\n")).toEqual([
      INFORMATICA_TEXTO_HEADER,
      "semana\t2026-08-24",
      "generado\t2026-08-24T09:00:00.000Z",
      "origen\tBacklog.xlsx",
      "",
      "[ENCUESTAS]",
      "2026/08\t5\t412",
      "",
      "[PETICIONES]",
      "2026/08\t34\tOn Site\tEn vuelo\tPeticiones\t306",
    ]);
  });

  it("omite las secciones sin filas", () => {
    const texto = serializeInformaticaTexto({ source }, {});

    expect(texto).toBe(INFORMATICA_TEXTO_HEADER);
  });
});
```

- [ ] **Step 2: Ejecuta el test y comprueba que falla**

Run: `pnpm exec vitest run server/informatica-texto.test.ts`
Expected: FAIL, `Cannot find module '../shared/modules/informatica/texto.ts'`.

- [ ] **Step 3: Escribe el contrato**

Crea `shared/modules/informatica/texto.ts`. El orden de las secciones es el del objeto; el orden de las columnas de cada fila es el que documenta su comentario.

```ts
import type { InformaticaDataset } from "./types.ts";

/**
 * Plain-text exchange format of the Informatica module.
 *
 * Same reasoning as `shared/modules/aga/texto.ts`: the weekly aggregation runs
 * in a Drive spreadsheet, the aggregates have to be auditable before they reach
 * the deck, and the raw exports name individuals while this format carries
 * counts only.
 *
 * Sections have no column-header line. The order of the cells is fixed and
 * documented on each entry below, and the reader depends on that order.
 */
export const INFORMATICA_TEXTO_HEADER = "INFORMATICA TEXTO PLANO v1";

export const INFORMATICA_TEXTO_SECTIONS = {
  /** `edificio` `dt` `aliasSmartTech` `aliasWorkOrder` `aliasImacs` `aliasPeticiones` `visible` `orden` */
  edificios: "EDIFICIOS",
  /** `mes` `semana` `categoria` `subcategoria` `metrica` `edificio` `tickets` */
  incidencias: "INCIDENCIAS",
  /** `mes` `valoracion` `respuestas` */
  encuestas: "ENCUESTAS",
  /** `mes` `semana` `edificio` `tipo` `ordenes` */
  workOrders: "WORKORDERS",
  /** `mes` `semana` `origen` `estado` `entidad` `total` */
  peticiones: "PETICIONES",
  /** `mes` `semana` `producto` `estado` `total` */
  peticionesProducto: "PETICIONESPRODUCTO",
  /** `mes` `semana` `edificio` `tipo` `citas` */
  citas: "CITAS",
  /** `mes` `ciudad` `metrica` `total` */
  imacs: "IMACS",
} as const;

/** Metadata keys of the preamble, written as `clave<TAB>valor`. */
export const INFORMATICA_TEXTO_META = {
  /** Reported extraction date, `YYYY-MM-DD`. Informative: every row carries its own period. */
  week: "semana",
  /** ISO timestamp of the Drive run. */
  generated: "generado",
  /** Source files the run read, separated by `;`. */
  source: "origen",
} as const;

export interface InformaticaTextoMeta {
  week?: string;
  generated?: string;
  source?: string;
}

const TAB = "\t";

function line(...cells: (string | number)[]): string {
  return cells.join(TAB);
}

function section(name: string, rows: string[]): string[] {
  return rows.length === 0 ? [] : ["", "[" + name + "]", ...rows];
}

/** `Si`/`No` of `Visible` as the sheet writes it, so a round trip is stable. */
function flag(value: boolean): string {
  return value ? "Si" : "No";
}

export function serializeInformaticaTexto(
  dataset: InformaticaDataset,
  meta: InformaticaTextoMeta
): string {
  const preamble: string[] = [];

  if (meta.week) preamble.push(line(INFORMATICA_TEXTO_META.week, meta.week));
  if (meta.generated) preamble.push(line(INFORMATICA_TEXTO_META.generated, meta.generated));
  if (meta.source) preamble.push(line(INFORMATICA_TEXTO_META.source, meta.source));

  const body = [
    ...section(
      INFORMATICA_TEXTO_SECTIONS.edificios,
      (dataset.edificios ?? []).map((row) =>
        line(
          row.edificio,
          row.dt,
          row.aliasSmartTech,
          row.aliasWorkOrder,
          row.aliasImacs,
          row.aliasPeticiones,
          flag(row.visible),
          row.orden
        )
      )
    ),
    ...section(
      INFORMATICA_TEXTO_SECTIONS.incidencias,
      (dataset.incidencias ?? []).map((row) =>
        line(
          row.mes,
          row.semana,
          row.categoria,
          row.subcategoria,
          row.metrica,
          row.edificio,
          row.tickets
        )
      )
    ),
    ...section(
      INFORMATICA_TEXTO_SECTIONS.encuestas,
      (dataset.encuestas ?? []).map((row) => line(row.mes, row.valoracion, row.respuestas))
    ),
    ...section(
      INFORMATICA_TEXTO_SECTIONS.workOrders,
      (dataset.workOrders ?? []).map((row) =>
        line(row.mes, row.semana, row.edificio, row.tipo, row.ordenes)
      )
    ),
    ...section(
      INFORMATICA_TEXTO_SECTIONS.peticiones,
      (dataset.peticiones ?? []).map((row) =>
        line(row.mes, row.semana, row.origen, row.estado, row.entidad, row.total)
      )
    ),
    ...section(
      INFORMATICA_TEXTO_SECTIONS.peticionesProducto,
      (dataset.peticionesProducto ?? []).map((row) =>
        line(row.mes, row.semana, row.producto, row.estado, row.total)
      )
    ),
    ...section(
      INFORMATICA_TEXTO_SECTIONS.citas,
      (dataset.citas ?? []).map((row) =>
        line(row.mes, row.semana, row.edificio, row.tipo, row.citas)
      )
    ),
    ...section(
      INFORMATICA_TEXTO_SECTIONS.imacs,
      (dataset.imacs ?? []).map((row) => line(row.mes, row.ciudad, row.metrica, row.total))
    ),
  ];

  return [INFORMATICA_TEXTO_HEADER, ...preamble, ...body].join("\n");
}
```

- [ ] **Step 4: Ejecuta el test y comprueba que pasa**

Run: `pnpm exec vitest run server/informatica-texto.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add shared/modules/informatica/texto.ts server/informatica-texto.test.ts
git commit -m "feat(informatica): contrato del formato de texto plano"
```

---

## Task 2: Parser del texto plano

**Files:**
- Create: `server/parseInformaticaTexto.ts`
- Modify: `server/informatica-texto.test.ts`

**Interfaces:**
- Consumes: `INFORMATICA_TEXTO_HEADER`, `INFORMATICA_TEXTO_SECTIONS`, `INFORMATICA_TEXTO_META`, `serializeInformaticaTexto` de la tarea 1.
- Produces:
  - `parseInformaticaTexto(texto: string): { dataset: InformaticaDataset; meta: InformaticaTextoMeta }`
  - Lanza `Error` con mensaje en español cuando la cabecera no coincide.

**Corrección sobre la primera versión de este plan.** Decía que `fecha` se rellenaba siempre con `null` porque el formato ya lleva `mes` y `semana`. Es falso, y el defecto se detectó revisando la Tarea 3: tres puntos del cliente resuelven la ventana temporal por `fecha`, no por `mes`/`semana`.

- `client/src/modules/informatica/aggregate.ts:111-113` — `coverageEnd(dataset)` deriva el corte de cobertura de `incidencias`, `workOrders` y `peticiones`.
- `client/src/modules/informatica/pages/PeticionesPage.tsx:43` y `:63`
- `client/src/modules/informatica/pages/CitasSemanalPage.tsx:38-39`

Los tres llaman a `lastClosedWeek(rows, (row) => row.fecha, cutoff)` y filtran con `inWeek(row.fecha, window)`. `lastClosedWeek` resuelve con `isoDay(row.fecha)`: con `fecha: null` en todas las filas devuelve `null` y el filtro no deja pasar nada, así que las páginas de Peticiones y de Citas Semanal saldrían vacías. El comentario de `PeticionesPage` explica por qué se resuelve por fecha y no por el mayor `Semana`: sobre una hoja de más de un año, el mayor `Semana` cae en el diciembre anterior.

Por tanto **`fecha` es la primera celda de toda sección con periodo**, en ISO `YYYY-MM-DD`, y una celda vacía se lee como `null`. `EDIFICIOS` no la lleva: es tabla de dimensiones. El orden de celdas de cada sección queda:

| Sección | Celdas |
|---|---|
| `EDIFICIOS` | `edificio` `dt` `aliasSmartTech` `aliasWorkOrder` `aliasImacs` `aliasPeticiones` `visible` `orden` |
| `INCIDENCIAS` | `fecha` `mes` `semana` `categoria` `subcategoria` `metrica` `edificio` `tickets` |
| `ENCUESTAS` | `fecha` `mes` `valoracion` `respuestas` |
| `WORKORDERS` | `fecha` `mes` `semana` `edificio` `tipo` `ordenes` |
| `PETICIONES` | `fecha` `mes` `semana` `origen` `estado` `entidad` `total` |
| `PETICIONESPRODUCTO` | `fecha` `mes` `semana` `producto` `estado` `total` |
| `CITAS` | `fecha` `mes` `semana` `edificio` `tipo` `citas` |
| `IMACS` | `fecha` `mes` `ciudad` `metrica` `total` |

El código del parser que viene abajo lleva ya esta corrección: cada `build` toma `fecha` de `c[0]` y desplaza el resto una posición. La Tarea 9 tiene que emitir esa fecha, no dejarla vacía: el lunes de la semana en las secciones semanales y el día 1 en las mensuales.

Además, `semana` debe derivarse de esa misma `fecha`. Si el `Codigo.gs` escribiera una `semana` que no case con la `fecha` de su fila —en el cambio de año ISO, por ejemplo— la página mostraría una semana y el merge poseería otra. Es un requisito de las tareas 6, 7 y 9.

Y una segunda condición sobre la Tarea 9, por la misma razón: **las filas de la semana en curso de `incidencias`, `workOrders` y `peticiones` tienen que llevar fecha real, nunca vacía**. `coverageEnd` toma el máximo de esas tres secciones. Las filas del histórico mensual pueden ir con fecha en blanco sin consecuencia, porque el máximo lo fijan las semanales; pero si las semanales llegaran sin fecha, el corte de cobertura sería `null` y las páginas semanales volverían a salir vacías por otro camino.

`PeticionesPage` resuelve **dos** ventanas, no una: la de `peticiones` en la línea 43 y otra distinta para `peticionesProducto` en la 63. Las dos secciones necesitan `fecha`.

- [ ] **Step 1: Escribe los tests que fallan**

Añade a `server/informatica-texto.test.ts`:

```ts
import { parseInformaticaTexto } from "./parseInformaticaTexto.ts";

describe("parseInformaticaTexto", () => {
  it("rechaza un texto sin la cabecera del formato", () => {
    expect(() => parseInformaticaTexto("PEGADO CUALQUIERA\n")).toThrow(
      /INFORMATICA TEXTO PLANO v1/
    );
  });

  it("lee metadatos y filas, e ignora comentarios y lineas vacias", () => {
    const texto = [
      INFORMATICA_TEXTO_HEADER,
      "semana\t2026-08-24",
      "# esto es un comentario",
      "",
      "[PETICIONES]",
      "2026-08-17\t2026/08\t34\tOn Site\tEn vuelo\tPeticiones\t306",
      "",
      "[IMACS]",
      "2026-08-01\t2026/08\tMadrid SEDE\tSolicitudes\t218",
    ].join("\n");

    const { dataset, meta } = parseInformaticaTexto(texto);

    expect(meta.week).toBe("2026-08-24");
    expect(dataset.peticiones).toEqual([
      {
        fecha: "2026-08-17",
        semana: 34,
        mes: "2026/08",
        origen: "On Site",
        estado: "En vuelo",
        entidad: "Peticiones",
        total: 306,
      },
    ]);
    expect(dataset.imacs).toEqual([
      {
        fecha: "2026-08-01",
        mes: "2026/08",
        ciudad: "Madrid SEDE",
        metrica: "Solicitudes",
        total: 218,
      },
    ]);
    expect(dataset.sheetsFound).toEqual(["peticiones", "imacs"]);
  });

  it("descarta una fila con menos celdas de las que declara la seccion", () => {
    const texto = [
      INFORMATICA_TEXTO_HEADER,
      "[ENCUESTAS]",
      "2026-08-01\t2026/08\t5\t412",
      "2026-08-01\t2026/08\t4",
    ].join("\n");

    expect(parseInformaticaTexto(texto).dataset.encuestas).toHaveLength(1);
  });

  it("da la vuelta completa: serializar y volver a leer conserva las filas", () => {
    const dataset: InformaticaDataset = {
      source,
      citas: [
        {
          fecha: "2026-08-17",
          semana: 34,
          mes: "2026/08",
          edificio: "Sede - Principal",
          tipo: "Con Cita",
          citas: 96,
        },
      ],
      edificios: [
        {
          edificio: "Sede - Principal",
          dt: "DT Centro",
          aliasSmartTech: "Smart Tech Principal AN",
          aliasWorkOrder: "ED-M-SEDE - SEDE CENTRAL",
          aliasImacs: "Madrid SEDE",
          aliasPeticiones: "-CALLE DE EJEMPLO, 1,",
          visible: true,
          orden: 1,
        },
      ],
    };

    const round = parseInformaticaTexto(serializeInformaticaTexto(dataset, {})).dataset;

    expect(round.citas).toEqual(dataset.citas);
    expect(round.edificios).toEqual(dataset.edificios);
  });
});
```

- [ ] **Step 2: Ejecuta los tests y comprueba que fallan**

Run: `pnpm exec vitest run server/informatica-texto.test.ts`
Expected: FAIL, `Cannot find module './parseInformaticaTexto.ts'`.

- [ ] **Step 3: Escribe el parser**

Crea `server/parseInformaticaTexto.ts`:

```ts
import {
  INFORMATICA_TEXTO_HEADER,
  INFORMATICA_TEXTO_META,
  INFORMATICA_TEXTO_SECTIONS,
  type InformaticaTextoMeta,
} from "../shared/modules/informatica/texto.ts";
import type {
  InformaticaDataset,
  InformaticaSectionKey,
} from "../shared/modules/informatica/types.ts";

/**
 * Reads the text the Drive spreadsheet writes into its `PLANO` tab.
 *
 * The format is deliberately dumb, so the reader is too: it fails only on a
 * wrong header, and skips anything it cannot make sense of. A malformed row is
 * dropped rather than aborting the import, because the alternative is a week
 * with no report at all over one bad line.
 */

/** Cell count and builder of each section, keyed by its header text. */
const SECTIONS: Record<
  string,
  { key: InformaticaSectionKey; cells: number; build: (c: string[]) => unknown }
> = {
  [INFORMATICA_TEXTO_SECTIONS.edificios]: {
    key: "edificios",
    cells: 8,
    build: (c) => ({
      edificio: c[0],
      dt: c[1],
      aliasSmartTech: c[2],
      aliasWorkOrder: c[3],
      aliasImacs: c[4],
      aliasPeticiones: c[5],
      visible: !/^no$/i.test(c[6].trim()),
      orden: num(c[7]),
    }),
  },
  [INFORMATICA_TEXTO_SECTIONS.incidencias]: {
    key: "incidencias",
    cells: 8,
    build: (c) => ({
      fecha: day(c[0]),
      mes: c[1],
      semana: num(c[2]),
      categoria: c[3],
      subcategoria: c[4],
      metrica: c[5],
      edificio: c[6],
      tickets: num(c[7]),
    }),
  },
  [INFORMATICA_TEXTO_SECTIONS.encuestas]: {
    key: "encuestas",
    cells: 4,
    build: (c) => ({ fecha: day(c[0]), mes: c[1], valoracion: c[2], respuestas: num(c[3]) }),
  },
  [INFORMATICA_TEXTO_SECTIONS.workOrders]: {
    key: "workOrders",
    cells: 6,
    build: (c) => ({
      fecha: day(c[0]),
      mes: c[1],
      semana: num(c[2]),
      edificio: c[3],
      tipo: c[4],
      ordenes: num(c[5]),
    }),
  },
  [INFORMATICA_TEXTO_SECTIONS.peticiones]: {
    key: "peticiones",
    cells: 7,
    build: (c) => ({
      fecha: day(c[0]),
      mes: c[1],
      semana: num(c[2]),
      origen: c[3],
      estado: c[4],
      entidad: c[5],
      total: num(c[6]),
    }),
  },
  [INFORMATICA_TEXTO_SECTIONS.peticionesProducto]: {
    key: "peticionesProducto",
    cells: 6,
    build: (c) => ({
      fecha: day(c[0]),
      mes: c[1],
      semana: num(c[2]),
      producto: c[3],
      estado: c[4],
      total: num(c[5]),
    }),
  },
  [INFORMATICA_TEXTO_SECTIONS.citas]: {
    key: "citas",
    cells: 6,
    build: (c) => ({
      fecha: day(c[0]),
      mes: c[1],
      semana: num(c[2]),
      edificio: c[3],
      tipo: c[4],
      citas: num(c[5]),
    }),
  },
  [INFORMATICA_TEXTO_SECTIONS.imacs]: {
    key: "imacs",
    cells: 5,
    build: (c) => ({
      fecha: day(c[0]),
      mes: c[1],
      ciudad: c[2],
      metrica: c[3],
      total: num(c[4]),
    }),
  },
};

/**
 * The `fecha` cell, or `null` when the section left it empty.
 *
 * Not for the client's sake: `isoDay` in
 * `client/src/modules/informatica/aggregate.ts` already reads `""` and `null`
 * the same way, since neither matches its date pattern. The reason is the
 * contract. `InformaticaDateCell` is `number | string | null`, and `""` is a
 * string that means "no date" — a second spelling of absence that every
 * consumer would have to know about. It also breaks the round trip: the
 * serialiser writes `null` as an empty cell, so reading that cell back as `""`
 * would make serialise-then-parse stop being the identity.
 */
function day(value: string): string | null {
  const trimmed = String(value ?? "").trim();

  return trimmed === "" ? null : trimmed;
}

const META_BY_LABEL: Record<string, keyof InformaticaTextoMeta> = {
  [INFORMATICA_TEXTO_META.week]: "week",
  [INFORMATICA_TEXTO_META.generated]: "generated",
  [INFORMATICA_TEXTO_META.source]: "source",
};

/** `1.480` and `1,480` are the same number: the sheet writes group separators. */
function num(value: string): number {
  const parsed = Number(String(value).replace(/[.\s]/g, "").replace(",", "."));

  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseInformaticaTexto(texto: string): {
  dataset: InformaticaDataset;
  meta: InformaticaTextoMeta;
} {
  const lines = texto.replace(/\r\n?/g, "\n").split("\n");

  if (lines.length === 0 || lines[0].trim() !== INFORMATICA_TEXTO_HEADER) {
    throw new Error(
      'El texto no empieza por "' + INFORMATICA_TEXTO_HEADER + '". Copia la pestaña PLANO entera.'
    );
  }

  const meta: InformaticaTextoMeta = {};
  const rows: Partial<Record<InformaticaSectionKey, unknown[]>> = {};
  let current: (typeof SECTIONS)[string] | null = null;

  for (const raw of lines.slice(1)) {
    const trimmed = raw.trim();

    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }

    const header = /^\[(.+)\]$/.exec(trimmed);

    if (header) {
      current = SECTIONS[header[1].trim().toUpperCase()] ?? null;
      continue;
    }

    const cells = raw.split("\t");

    if (current === null) {
      const key = META_BY_LABEL[cells[0]?.trim()];

      if (key && cells.length >= 2) {
        meta[key] = cells[1].trim();
      }

      continue;
    }

    if (cells.length < current.cells) {
      continue;
    }

    (rows[current.key] ??= []).push(current.build(cells.slice(0, current.cells)));
  }

  const dataset = { ...rows } as InformaticaDataset;

  dataset.sheetsFound = (Object.keys(rows) as InformaticaSectionKey[]).filter(
    (key) => (rows[key] ?? []).length > 0
  );

  return { dataset, meta };
}
```

- [ ] **Step 4: Ejecuta los tests y comprueba que pasan**

Run: `pnpm exec vitest run server/informatica-texto.test.ts`
Expected: PASS, 9 tests — los 3 de la Tarea 1 más los 6 de esta, contando los dos que fijan la celda vacía y el desplazamiento de columnas.

- [ ] **Step 5: Commit**

```bash
git add server/parseInformaticaTexto.ts server/informatica-texto.test.ts
git commit -m "feat(informatica): parser del texto plano de Drive"
```

---

## Task 3: Posesión semanal en el merge del dataset

Es la tarea que hace posible el histórico. Hoy `mergeInformaticaDataset` decide qué sustituye una subida usando el **mes** de cada fila. `peticiones` y `peticionesProducto` son de grano semanal y llegan de una semana en una, así que subir la semana 35 borra las semanas 32, 33 y 34 del mismo mes. Las demás secciones sí llegan completas y se quedan como están.

**Files:**
- Modify: `server/parseInformaticaPlano.ts:1190-1206` (constante `SECTION_MONTH`) y `:1237` (la ordenación)
- Test: `server/informatica-import-dedup.test.ts`

**Interfaces:**
- Consumes: `mergeInformaticaDataset(existing, incoming, source)` ya exportada.
- Produces: mismo contrato. Solo cambia la clave de posesión.

- [ ] **Step 1: Escribe el test que falla**

Añade al final de `server/informatica-import-dedup.test.ts`:

```ts
import { mergeInformaticaDataset } from "./parseInformaticaPlano.ts";
import type { InformaticaDataset } from "../shared/modules/informatica/types.ts";

function peticion(semana: number, total: number) {
  return {
    fecha: null,
    semana,
    mes: "2026/08",
    origen: "On Site",
    estado: "En vuelo",
    entidad: "Peticiones",
    total,
  };
}

describe("mergeInformaticaDataset con secciones semanales", () => {
  const source = { sourceFile: "PLANO", uploadedAt: "2026-08-24T09:00:00.000Z" };

  it("una subida solo posee su propia semana en peticiones", () => {
    const stored: InformaticaDataset = { source, peticiones: [peticion(33, 700)] };
    const incoming: InformaticaDataset = { source, peticiones: [peticion(34, 714)] };

    const merged = mergeInformaticaDataset(stored, incoming, source);

    expect(merged.peticiones).toEqual([peticion(33, 700), peticion(34, 714)]);
  });

  it("reenviar la misma semana la reescribe en vez de duplicarla", () => {
    const stored: InformaticaDataset = { source, peticiones: [peticion(34, 700)] };
    const incoming: InformaticaDataset = { source, peticiones: [peticion(34, 714)] };

    expect(mergeInformaticaDataset(stored, incoming, source).peticiones).toEqual([
      peticion(34, 714),
    ]);
  });

  it("ordena las semanas por numero, no por texto", () => {
    const stored: InformaticaDataset = { source, peticiones: [peticion(9, 1), peticion(10, 2)] };
    const incoming: InformaticaDataset = { source, peticiones: [peticion(11, 3)] };

    expect(
      mergeInformaticaDataset(stored, incoming, source).peticiones?.map((row) => row.semana)
    ).toEqual([9, 10, 11]);
  });
});
```

- [ ] **Step 2: Ejecuta los tests y comprueba que fallan**

Run: `pnpm exec vitest run server/informatica-import-dedup.test.ts -t "secciones semanales"`
Expected: FAIL. El primero devuelve una sola fila (la 33 se pierde); el tercero devuelve `[10, 11, 9]` porque `"2026/08#10"` ordena antes que `"2026/08#9"`.

- [ ] **Step 3: Cambia la clave de posesión**

En `server/parseInformaticaPlano.ts`, sustituye el bloque de comentario y las dos entradas de `SECTION_MONTH`:

```ts
/**
 * How the ownership key of a section is read, or `null` when it has none.
 *
 * Most sections arrive complete every week — the template ships the whole
 * history of work orders and appointments — so the month is the right grain:
 * re-sending them rewrites the months they carry.
 *
 * `peticiones` and `peticionesProducto` are the exception. They come from the
 * backlog, released and managed exports, which are a snapshot of **one** week.
 * Keying them by month made an upload own weeks it never mentioned, so week 35
 * erased weeks 32 to 34. They are keyed by week instead, zero-padded so the
 * final sort orders week 9 before week 10.
 *
 * `edificios` is a dimension table, not a series: it has no period, so an
 * upload that carries it replaces it whole.
 */
const SECTION_MONTH: Record<InformaticaSectionKey, ((row: never) => string) | null> = {
  edificios: null,
  incidencias: (row: InformaticaIncidenciaRow) => row.mes,
  encuestas: (row: InformaticaEncuestaRow) => row.mes,
  workOrders: (row: InformaticaWorkOrderRow) => row.mes,
  peticiones: (row: InformaticaPeticionRow) => weekKey(row.mes, row.semana),
  peticionesProducto: (row: InformaticaPeticionProductoRow) => weekKey(row.mes, row.semana),
  peticionesAnual: (row: InformaticaPeticionAnualRow) => row.mes,
  citas: (row: InformaticaCitaRow) => row.mes,
  citasAnual: (row: InformaticaCitaAnualRow) => row.mes,
  imacs: (row: InformaticaImacRow) => row.mes,
  wasp: (row: InformaticaWaspRow) => row.mes,
  renove: (row: InformaticaRenoveRow) => row.mes,
  hic: (row: InformaticaHicRow) => row.mes,
  comparativas: (row: InformaticaComparativaRow) => row.mes,
  slas: (row: InformaticaSlaRow) => row.mes,
} as Record<InformaticaSectionKey, ((row: never) => string) | null>;
```

Y justo encima de esa constante añade el ayudante:

```ts
/** `2026/08#09`: the sort at the end of `mergeSectionRows` compares text. */
function weekKey(mes: string, semana: number): string {
  return mes + "#" + String(semana).padStart(2, "0");
}
```

- [ ] **Step 4: Ejecuta los tests y comprueba que pasan**

Run: `pnpm exec vitest run server/informatica-import-dedup.test.ts`
Expected: PASS, incluidos los tests que ya existían.

- [ ] **Step 5: Comprueba que no rompes el resto**

Run: `pnpm test`
Expected: PASS, toda la suite.

- [ ] **Step 6: Commit**

```bash
git add server/parseInformaticaPlano.ts server/informatica-import-dedup.test.ts
git commit -m "fix(informatica): posesion semanal en peticiones al fusionar el dataset"
```

---

## Task 4: Ruta de subida y punto de entrada en el deck

**Files:**
- Modify: `server/routes.ts` (añadir la ruta después de `/api/informatica/upload/plano`, que termina hacia la línea 915)
- Modify: `shared/deck/registry.ts:130-139`
- Test: `server/informatica-texto.test.ts`

**Interfaces:**
- Consumes: `parseInformaticaTexto` (tarea 2), `mergeInformaticaDataset` y `readStoredInformaticaDataset` ya existentes en `routes.ts`.
- Produces: `POST /api/informatica/upload/texto`, que acepta un `.txt` en el campo `file` o el cuerpo `{ texto: string }`, exactamente como `/api/aga/upload/texto`.

- [ ] **Step 1: Escribe el test que falla**

Añade a `server/informatica-texto.test.ts`:

```ts
import { INFORMATICA_TEXTO_SECTIONS } from "../shared/modules/informatica/texto.ts";
import { getDeckModule } from "../shared/deck/registry.ts";

describe("punto de entrada del deck", () => {
  it("ofrece la subida de texto plano de Drive", () => {
    const slot = getDeckModule("informatica")?.deck?.uploads.find((u) => u.id === "texto");

    expect(slot).toMatchObject({
      label: "Texto plano (Drive)",
      path: "/api/informatica/upload/texto",
      multiple: false,
      accept: ".txt,.tsv,.csv",
    });
  });

  it("declara las ocho secciones que el script de Drive escribe", () => {
    expect(Object.values(INFORMATICA_TEXTO_SECTIONS)).toHaveLength(8);
  });
});
```

- [ ] **Step 2: Ejecuta el test y comprueba que falla**

Run: `pnpm exec vitest run server/informatica-texto.test.ts -t "punto de entrada"`
Expected: FAIL, `expected undefined to match object`.

- [ ] **Step 3: Añade el slot al registro**

En `shared/deck/registry.ts`, dentro de `uploads` del módulo `informatica`, añade como **primera** entrada:

```ts
        {
          id: "texto",
          label: "Texto plano (Drive)",
          path: "/api/informatica/upload/texto",
          error: "No se pudo cargar el texto plano de Informática",
          multiple: false,
          accept: ".txt,.tsv,.csv",
        },
```

El slot `plano` se queda: los ficheros crudos se siguen pudiendo subir directamente mientras el flujo de Drive no esté rodado.

- [ ] **Step 4: Añade la ruta**

En `server/routes.ts`, después del cierre de `/api/informatica/upload/plano`:

```ts
/**
 * Text produced by the Drive spreadsheet (see `scripts/informatica-drive/`).
 *
 * Accepts a `.txt` upload (`file`) or a pasted body (`{ texto }`), because the
 * colleague either copies the `PLANO` tab or saves it as a file. The payload is
 * folded into what is stored, exactly like the flat workbook upload: the text
 * carries the whole monthly history, so re-sending it is idempotent.
 */
router.post("/api/informatica/upload/texto", upload.single("file"), async (req, res) => {
  try {
    const body = req.body as { texto?: unknown } | undefined;
    const pasted = typeof body?.texto === "string" ? body.texto : "";
    const uploaded = req.file ? req.file.buffer.toString("utf8") : "";
    const texto = uploaded || pasted;

    if (texto.trim() === "") {
      return res
        .status(400)
        .json({ error: "Debes adjuntar o pegar el texto plano de la hoja de Drive." });
    }

    const { dataset, meta } = parseInformaticaTexto(texto);
    const buildings = await readBuildingLocationMaster();
    const normalized = normalizeInformaticaBuildingLocations(dataset, buildings).dataset;

    const existing = await readStoredInformaticaDataset();
    const normalizedExisting = existing
      ? normalizeInformaticaBuildingLocations(existing, buildings).dataset
      : null;

    const stored = mergeInformaticaDataset(normalizedExisting, normalized, {
      sourceFile: req.file?.originalname ?? meta.source ?? "PLANO (Drive)",
      uploadedAt: new Date().toISOString(),
    });

    await client.execute({
      sql: `INSERT INTO informatica_dataset (id, data, source_file, uploaded_at)
            VALUES (1, ?, ?, datetime('now'))
            ON CONFLICT(id) DO UPDATE
            SET data = excluded.data,
                source_file = excluded.source_file,
                uploaded_at = excluded.uploaded_at`,
      args: [JSON.stringify(stored), stored.source.sourceFile],
    });

    return res.json({ dataset: stored, sheetsFound: stored.sheetsFound });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error al procesar el texto plano de Informática";

    return res.status(400).json({ error: message });
  }
});
```

Añade el import al principio del fichero, junto a los demás de `server/`:

```ts
import { parseInformaticaTexto } from "./parseInformaticaTexto.ts";
```

- [ ] **Step 5: Ejecuta los tests y el typecheck**

Run: `pnpm exec vitest run server/informatica-texto.test.ts && pnpm run check`
Expected: PASS y typecheck limpio.

- [ ] **Step 6: Commit**

```bash
git add server/routes.ts shared/deck/registry.ts server/informatica-texto.test.ts
git commit -m "feat(informatica): subida del texto plano de Drive"
```

---

## Task 5: Esqueleto del Apps Script

**Files:**
- Create: `scripts/informatica-drive/Codigo.gs`

**Interfaces:**
- Produces, todas globales de `Codigo.gs` y todas ES5:
  - `onOpen()` — menú de la hoja.
  - `TAB` — nombres de pestaña del libro.
  - `CONFIG_KEYS`, `DEFAULT_FOLDER_ID`
  - `readConfig(): { folderId: string; extraction: Date; windowMonths: number }`
  - `classifyFolder(folderId)` — clasifica por cabecera y devuelve, además de una rejilla por formato encontrado, `nombres: string[]` con los ficheros leídos y `modificados: string[]` con sus fechas, que la tarea 10 escribe en `Comprobación`.
  - `headerIndex(row)`, `hasColumns(columns, required)` — copiados del patrón de `scripts/aga-drive/Codigo.gs`.

Copia el estilo de `scripts/aga-drive/Codigo.gs`: mismos nombres de ayudante (`normalize`, `text`, `pad2`, `isoDate`, `book`, `sheetByName`, `openAsSpreadsheet`, `readGrids`, `findDataSheets`) donde hagan lo mismo. No inventes un vocabulario nuevo para el segundo script del mismo tipo.

- [ ] **Step 1: Escribe la cabecera, el menú y la configuración**

Crea `scripts/informatica-drive/Codigo.gs` con este arranque:

```javascript
/**
 * Weekly Informatica report, assembled from the raw exports in a Drive folder.
 *
 * Paste this file into the Apps Script editor of the "SSCC- Informe Semanal
 * limpio" spreadsheet. It reads the five exports the team uploads, refreshes
 * the data tabs, moves the period markers, closes the month when asked, and
 * writes the `PLANO` tab that AV Weekly imports.
 *
 * It does not replace the formulas of the `(Informe)` tabs: those keep
 * calculating, because they are the part the team audits.
 *
 * See SPEC.md next to this file for the sheet-by-sheet mapping.
 */

var TAB = {
  peticionesDatos: '2.2.1 Volum de peticiones (Dato',
  liberadas: 'Hoja 16',
  gestionadas: 'Hoja 17',
  encuestasDatos: '2.1.5 Encuestas (datos)',
  encuestasInforme: '2.1.5. Encuestas (Informe)',
  topCincoDatos: '2.1.2 Top 5 incidencias (Datos)',
  volumetria: '2.1.1 Volumetria de Incidencias',
  volumetriaHistorico: 'Hoja 13',
  workOrdersDatos: '2.1.6 Work Orders (Datos)',
  workOrdersInforme: '2.1.6 Work Orders (Informe)',
  workOrdersMensual: 'Hoja 14',
  totalMensual: 'Hoja 15',
  peticionesInforme: '2.2.1 Volum de peticiones (Info',
  citasDatos: '2.3.1 Volum de Citas SmartTech ',
  citasInforme: 'Hoja 18',
  imacsDatos: '2.4.1 Vol Imacs resuelos OnSite',
  imacsInforme: 'Hoja 19',
  config: 'Configuración',
  check: 'Comprobación',
  plano: 'PLANO'
};

var CONFIG_KEYS = {
  folder: 'Carpeta Drive',
  extraction: 'Fecha de extracción',
  windowMonths: 'Meses en la ventana de encuestas'
};

var DEFAULT_FOLDER_ID = '17O7dORS6oIDN0hyLP1AXQEN7tR6k3ZbH';
var DEFAULT_WINDOW_MONTHS = 19;
var TEXTO_HEADER = 'INFORMATICA TEXTO PLANO v1';

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('⭐ Informática Weekly')
    .addItem('Inicializar hoja', 'inicializarHoja')
    .addItem('Procesar semana', 'procesarSemana')
    .addItem('Cerrar mes', 'cerrarMes')
    .addItem('Guardar PLANO como .txt en la carpeta', 'guardarPlanoTxt')
    .addToUi();
}
```

Los nombres de pestaña llevan los espacios y los recortes a 31 caracteres tal cual están en el libro: `'2.2.1 Volum de peticiones (Info'` sin cerrar el paréntesis y `'2.3.1 Volum de Citas SmartTech '` con espacio final. No los "arregles": son los nombres reales y el script no encontraría la hoja.

- [ ] **Step 2: Escribe la clasificación de la carpeta**

Añade a `Codigo.gs`:

```javascript
var REQUIRED = {
  peticiones: ['Denominación Producto', 'Estatus de la Posición'],
  imac: ['Fecha limite', 'nº trabajos'],
  encuestas: ['Incident Number', 'Fecha'],
  workOrders: ['DWP_SRID', 'Ubicacion_asociada'],
  citas: ['Incidencia', 'Cita_Previa', 'Smart_Tech']
};

/** Fragment match of the satisfaction question, which is worded differently over time. */
var ENCUESTAS_FRAGMENT = 'NIVEL DE SATIS';
```

Las cinco cabeceras salen de `server/convertInformaticaRaw.ts`, que ya detecta estos mismos formatos: `RAW_PETICIONES_REQUIRED` (línea 56), `RAW_IMACS_COLUMNS`, `RAW_WORKORDERS_COLUMNS`, `RAW_CITAS_COLUMNS` y `TEMPLATE_ENCUESTAS_COLUMNS` (línea 888). No las reconstruyas leyendo la descripción de columnas del SPEC: la pregunta de satisfacción de las encuestas cambia de redacción, y por eso el fichero de referencia la casa **por subcadena** en la línea 1006 (`normalize(cell).includes("NIVEL DE SATIS")`) en vez de por nombre completo. `hasColumns` compara el nombre entero, así que un signo de interrogación de más clasificaría mal en silencio. Necesitas un ayudante aparte de coincidencia por fragmento para esa única columna.

`classifyFolder` **no puede cortar en el primer acierto**, a diferencia de la de AGA. El libro de Templates lleva encuestas (`1-1`), work orders (`5-5`) y citas (`6-6`) en pestañas distintas del mismo fichero: con un `break` se perderían dos de los tres. Además, cada coincidencia del template conserva las rejillas completas del libro; la tarea 6 necesita así recuperar `2-2`, `3-3` y `4-4`, que no tienen una entrada propia en `REQUIRED`.

/** Which of the three request exports a file is, by name. They share a header. */
function requestKind(fileName) {
  var lower = String(fileName).toLowerCase();

  if (lower.indexOf('backlog') >= 0) return 'backlog';
  if (lower.indexOf('liberadas') >= 0) return 'liberadas';
  if (lower.indexOf('gestionadas') >= 0) return 'gestionadas';

  return null;
}
```

`classifyFolder` recorre la carpeta, abre cada fichero con `openAsSpreadsheet`, lee las cabeceras con `findDataSheets` y devuelve un objeto con las rejillas encontradas y, por cada una, el nombre del fichero y su fecha de modificación. Copia esas tres funciones de `scripts/aga-drive/Codigo.gs` (líneas 317 a 500) sin cambiarlas: hacen exactamente lo mismo.

- [ ] **Step 3: Verifica que el fichero es ES5 válido**

Run: `cp scripts/informatica-drive/Codigo.gs tmp/ck.js && node --check tmp/ck.js && rm tmp/ck.js`
Expected: sin salida. Si falla, hay sintaxis que Apps Script tampoco aceptaría.

- [ ] **Step 4: Verifica que no se ha colado sintaxis moderna**

Run: `grep -nE "=>|\bconst \b|\blet \b|\`" scripts/informatica-drive/Codigo.gs`
Expected: sin coincidencias.

- [ ] **Step 5: Commit**

```bash
git add scripts/informatica-drive/Codigo.gs
git commit -m "feat(informatica): esqueleto del Apps Script de Drive"
```

---

## Task 6: Conversión de fechas y escritura de las pestañas de datos

**Files:**
- Modify: `scripts/informatica-drive/Codigo.gs`

**Interfaces:**
- Produces:
  - `toDate(value): Date|null` — acepta serial de Excel, `MM/DD/YYYY, hh:mm:ss AM/PM` y `YYYY/MM`.
  - `toNumber(value): number` — quita separadores de millar.
  - `writeGrid(tabName, rows, firstRow, firstColumn, columnCount): number` — escribe, **borra el sobrante** de filas anteriores y devuelve las filas escritas.
  - `escribirDatos(clasificacion, informe)` — orquesta las diez escrituras y anota en `informe.escritas[tab]` lo que devuelve cada `writeGrid`.

`writeGrid` tiene que limpiar por debajo de lo escrito. Si una semana trae 500 filas y la anterior trajo 700, dejar las 200 viejas las cuenta como si fueran de esta semana.

- [ ] **Step 1: Escribe las conversiones**

```javascript
var EXCEL_EPOCH = Date.UTC(1899, 11, 30);
var US_DATETIME = /^(\d{2})\/(\d{2})\/(\d{4}),\s*(\d{2}):(\d{2}):(\d{2})\s*(AM|PM)$/i;
var MONTH_TEXT = /^(\d{4})\/(\d{2})$/;

/**
 * Any of the three date shapes the exports use, as a UTC midnight date.
 *
 * The American form is the one the annotation in '2.1.6 Work Orders (Informe)'
 * K3 complains about. The time of day is dropped on purpose: a timestamp at
 * 00:40 shifts the day when the sheet renders it in another timezone, and with
 * the day goes the week the row is counted in.
 */
function toDate(value) {
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  }

  if (typeof value === 'number' && isFinite(value)) {
    return new Date(EXCEL_EPOCH + Math.floor(value) * 86400000);
  }

  var raw = String(value == null ? '' : value).trim();
  var us = US_DATETIME.exec(raw);

  if (us) {
    return new Date(Date.UTC(Number(us[3]), Number(us[1]) - 1, Number(us[2])));
  }

  var month = MONTH_TEXT.exec(raw);

  if (month) {
    return new Date(Date.UTC(Number(month[1]), Number(month[2]) - 1, 1));
  }

  return null;
}

/** '6,380' and '6.380' are the same number: the template writes separators. */
function toNumber(value) {
  if (typeof value === 'number') return value;

  var parsed = Number(String(value == null ? '' : value).replace(/[.,\s]/g, ''));

  return isFinite(parsed) ? parsed : 0;
}
```

- [ ] **Step 2: Escribe `writeGrid`**

```javascript
/**
 * Writes a block and clears whatever the previous run left below it.
 *
 * Not clearing is the failure that does not announce itself: a week with fewer
 * rows than the last one leaves the old tail in place, and every COUNTIFS over
 * the tab counts it as if it were this week.
 */
function writeGrid(tabName, rows, firstRow, firstColumn, columnCount) {
  var sheet = sheetByName(tabName, false);
  var width = columnCount || (rows.length > 0 ? rows[0].length : 0);

  if (width === 0) return 0;

  var lastRow = sheet.getMaxRows();

  if (lastRow >= firstRow) {
    sheet.getRange(firstRow, firstColumn, lastRow - firstRow + 1, width).clearContent();
  }

  if (rows.length > 0) {
    sheet.getRange(firstRow, firstColumn, rows.length, width).setValues(rows);
  }

  return rows.length;
}
```

- [ ] **Step 3: Escribe `escribirDatos`**

Una llamada a `writeGrid` por destino, con estas coordenadas exactas. `Fila 1` es la primera fila de datos, no la de cabecera.

| Destino | Fila 1 | Col 1 | Ancho | Origen |
|---|---|---|---|---|
| `TAB.peticionesDatos` | 2 | 1 (`A`) | 19 | Backlog |
| `TAB.liberadas` | 2 | 1 (`A`) | 19 | Liberadas |
| `TAB.gestionadas` | 2 | 1 (`A`) | 19 | Gestionadas |
| `TAB.encuestasDatos` | 4 | 1 (`A`) | 13 | Templates `1-1` |
| `TAB.topCincoDatos` | 3 | 1 (`A`) | 19 | Templates `2-2` |
| `TAB.volumetria` bloque BBVA | 4 | 1 (`A`) | 4 | Templates `3-3` |
| `TAB.volumetria` bloque BBVA TECH | 4 | 6 (`F`) | 4 | Templates `4-4` |
| `TAB.workOrdersDatos` | 2 | 1 (`A`) | 15 | Templates `5-5` |
| `TAB.citasDatos` | 2 | 1 (`A`) | 8 | Templates `6-6` |
| `TAB.imacsDatos` | 2 | 1 (`A`) | 7 | IMAC, pestaña del año |

`TAB.volumetria` no reemplaza: añade la fila del mes nuevo si no está ya (respuesta P1). Las demás reemplazan.

Tres detalles que no se pueden saltar:

1. `2.1.5 Encuestas (datos)` empieza en la fila 4 (cabecera en la 3) y solo se rellenan las columnas `C`, `H`, `I` y `K`. Las demás se escriben como cadena vacía, no se omiten, para conservar el ancho de 13 columnas.
2. `2.1.6 Work Orders (Datos)` escribe `A:O` con `writeGrid` y después la columna `P` con el territorial ya resuelto contra `Y:Z`, no con la fórmula. `Hoja 17` hace lo mismo con `T` y `U` contra `X:Z`.
3. `2.3.1` escribe `A:H`, la fecha resuelta en `J` y `N`, y **vacía `K:Q`**, que son las 651.729 fórmulas `MID`/`DATE`.

```javascript
/** Resolves a lookup table into a plain object, so the sheet keeps no VLOOKUP. */
function readLookup(tabName, keyColumn, valueColumn, firstRow) {
  var sheet = sheetByName(tabName, false);
  var last = sheet.getLastRow();
  var map = {};

  if (last < firstRow) return map;

  var width = valueColumn - keyColumn + 1;
  var values = sheet.getRange(firstRow, keyColumn, last - firstRow + 1, width).getValues();

  for (var i = 0; i < values.length; i++) {
    var key = normalize(values[i][0]);

    if (key !== '') map[key] = values[i].slice(1);
  }

  return map;
}

/** '#N/A' literal, like the VLOOKUP wrote, plus the unknown value for the report. */
function lookup(map, key, index, unknown) {
  var found = map[normalize(key)];

  if (!found) {
    unknown.push(String(key));
    return '#N/A';
  }

  return found[index];
}
```

- [ ] **Step 4: Verifica la sintaxis**

Run: `cp scripts/informatica-drive/Codigo.gs tmp/ck.js && node --check tmp/ck.js && rm tmp/ck.js && grep -nE "=>|\bconst \b|\blet \b" scripts/informatica-drive/Codigo.gs`
Expected: sin salida en ninguno de los dos.

- [ ] **Step 5: Commit**

```bash
git add scripts/informatica-drive/Codigo.gs
git commit -m "feat(informatica): conversion de fechas y escritura de las pestanas de datos"
```

---

## Task 7: Marcadores de periodo semanales

**Files:**
- Modify: `scripts/informatica-drive/Codigo.gs`

**Interfaces:**
- Produces:
  - `weekBounds(extraction): { monday: Date; sunday: Date }`
  - `monthBounds(extraction): { first: Date; last: Date }`
  - `rodarSemanaAnterior()` — copia `2.2.1 (Informe)!H4:H6` a `I4:I6`.
  - `escribirMarcadores(extraction)`

El orden importa y es el único sitio del script donde importa: `rodarSemanaAnterior` se llama **antes** de `escribirDatos`. Si se llama después, `H4:H6` ya se ha recalculado con los datos nuevos y el valor de la semana anterior se ha perdido para siempre.

- [ ] **Step 1: Escribe los límites de periodo**

```javascript
/** Monday and Sunday of the ISO week the extraction date falls in. */
function weekBounds(extraction) {
  var day = (extraction.getUTCDay() + 6) % 7;
  var monday = new Date(extraction.getTime() - day * 86400000);

  return { monday: monday, sunday: new Date(monday.getTime() + 6 * 86400000) };
}

/** First and last day of the month the extraction date falls in. */
function monthBounds(extraction) {
  var year = extraction.getUTCFullYear();
  var month = extraction.getUTCMonth();

  return {
    first: new Date(Date.UTC(year, month, 1)),
    last: new Date(Date.UTC(year, month + 1, 0))
  };
}
```

- [ ] **Step 2: Escribe el rodaje de la semana anterior**

```javascript
/**
 * This week's totals become next week's "Semana anterior".
 *
 * Must run BEFORE the data tabs are rewritten: H4:H6 are COUNTIF formulas, so
 * the moment the new rows land they recalculate and the old figure is gone.
 * The percentage in column J divides by these three cells.
 */
function rodarSemanaAnterior() {
  var sheet = sheetByName(TAB.peticionesInforme, false);
  var actual = sheet.getRange('H4:H6').getValues();

  sheet.getRange('I4:I6').setValues(actual);
}
```

- [ ] **Step 3: Escribe los marcadores**

```javascript
function escribirMarcadores(extraction) {
  var week = weekBounds(extraction);
  var month = monthBounds(extraction);

  sheetByName(TAB.workOrdersInforme, false)
    .getRange('H1:I1')
    .setValues([[month.first, month.last]]);

  sheetByName(TAB.citasInforme, false)
    .getRange('J2:K2')
    .setValues([[week.monday, week.sunday]]);

  sheetByName(TAB.encuestasInforme, false).getRange('L24').setValue(month.first);
}
```

`Hoja 19` filas 5 y 30 llevan un par de celdas por mes de la serie IMACS; se escriben en la tarea 8 junto al resto del cierre de mes, porque solo cambian al pasar de mes.

- [ ] **Step 4: Verifica la sintaxis**

Run: `cp scripts/informatica-drive/Codigo.gs tmp/ck.js && node --check tmp/ck.js && rm tmp/ck.js`
Expected: sin salida.

- [ ] **Step 5: Commit**

```bash
git add scripts/informatica-drive/Codigo.gs
git commit -m "feat(informatica): marcadores de periodo y rodaje de la semana anterior"
```

---

## Task 8: Cierre de mes

**Files:**
- Modify: `scripts/informatica-drive/Codigo.gs`

**Interfaces:**
- Produces: `cerrarMes()`, y las cinco funciones que llama:
  - `cerrarVolumetria(month)` — añade fila en `2.1.1` bloques `A:D` y `F:I`.
  - `cerrarHistoricoIncidencias(month)` — congela la columna viva de `Hoja 13` y abre la siguiente.
  - `cerrarSeriesMensuales(month)` — `Hoja 14` fila nueva y `Hoja 15` fila nueva.
  - `cerrarEncuestas(month, windowMonths)` — apartado 7 de la spec, los cuatro pasos en orden.
  - `cerrarBloqueTeclado(month)` — literales de fecha de `2.1.6 (Informe)` filas 45-49.

`cerrarMes` tiene que ser **idempotente**: ejecutarlo dos veces en el mismo mes no puede duplicar la fila ni desplazar la ventana dos posiciones. La comprobación es leer la última fecha ya escrita y salir sin hacer nada si coincide con el mes que se va a cerrar.

Las funciones reciben el **mes nuevo que se abre**, no el que se congela: al cerrar agosto de 2026 reciben `2026-09-01`. Así la última fila viva de agosto no hace saltar la guarda antes de tiempo.

- [ ] **Step 1: Escribe la guarda de idempotencia**

```javascript
/**
 * Whether the month has already been closed, by looking at what is written.
 *
 * The guard reads state instead of keeping a flag: a flag drifts the first time
 * someone edits the sheet by hand, and the sheet itself cannot.
 */
function mesYaCerrado(month) {
  var sheet = sheetByName(TAB.encuestasInforme, false);
  var viva = ultimaFilaFecha(sheet, 2, 4);

  if (viva === 0) return false;

  var fecha = toDate(sheet.getRange(viva, 2).getValue());

  return fecha ? fecha.getTime() >= month.getTime() : false;
}
```

`getLastRow()` no sirve para localizar la fila viva: el libro limpio declara 1.001 filas usadas por fórmulas o formato, aunque el histórico real termina hoy en la 22. `ultimaFilaFecha(sheet, column, firstRow)` recorre la columna indicada y devuelve la última fila que contiene una fecha válida; todas las funciones de cierre usan este criterio o una cabecera de mes explícita, nunca el final físico de la hoja.

- [ ] **Step 2: Escribe el cierre de encuestas**

Los cuatro pasos del apartado 7 de la spec, en este orden exacto:

```javascript
/**
 * Freezes the live row, opens the next one and slides the window.
 *
 * `windowMonths` is read from the config tab and defaults to 19, which is what
 * the sheet holds today. The 'F1' label says '14 meses' and is stale; it is
 * rewritten here so the sheet stops lying about its own width.
 */
function cerrarEncuestas(month, windowMonths) {
  var sheet = sheetByName(TAB.encuestasInforme, false);
  var viva = ultimaFilaFecha(sheet, 2, 4);

  if (viva === 0) throw new Error('El histórico de encuestas no trae ninguna fecha válida.');

  // 1. Freeze: replace the two formulas by the values they currently show.
  var congelado = sheet.getRange(viva, 3, 1, 2).getValues();
  sheet.getRange(viva, 3, 1, 2).setValues(congelado);
  sheet.getRange(viva, 5).setValue('Histórico');

  // 2. Open the new month.
  var nueva = viva + 1;
  sheet.getRange(nueva, 2).setValue(month);
  sheet.getRange(nueva, 3).setFormula('=C31');
  sheet.getRange(nueva, 4).setFormula('=J33');
  sheet.getRange(nueva, 5).setValue('Vivo (C31 y J33)');

  // 3. The current month drives the COUNTIFS of C26:C30.
  sheet.getRange('L24').setValue(month);

  // 4. Slide the window: it always ends on the new row.
  var primera = nueva - windowMonths + 1;
  var fechas = [];
  var medias = [];

  for (var i = 0; i < windowMonths; i++) {
    fechas.push('=B' + (primera + i));
    medias.push('=D' + (primera + i));
  }

  sheet.getRange(2, 7, 1, windowMonths).setFormulas([fechas]);
  sheet.getRange(3, 7, 1, windowMonths).setFormulas([medias]);
  sheet.getRange('F1').setValue(windowMonths + ' meses');
}
```

- [ ] **Step 3: Escribe el resto del cierre**

`cerrarSeriesMensuales` sigue el mismo patrón en `Hoja 14` y `Hoja 15`: lee el valor que muestra la celda viva, lo escribe como valor, y pone la fórmula una fila más abajo.

- `Hoja 14`: la celda viva es la del mes en curso en la columna del año (hoy `D11`, agosto de 2026). La fórmula que se traslada es `='2.1.6 Work Orders (Informe)'!N43`.
- `Hoja 15`: la fila viva es la última (hoy la 19). Se congelan `B` y `C`, y en la fila siguiente se escriben `A` con la fecha del mes nuevo, `B` con `='2.1.2 Top 5 incidencias (Datos)'!R27` y `C` con `='2.1.6 Work Orders (Informe)'!N43`. La columna `D` ya lleva su `SUM` arrastrado.
- `Hoja 13`: se congela la última columna con fórmulas y se abre la siguiente repitiendo el patrón `=SUM(Xn+Xm)` de las filas 3 a 5 y los `VLOOKUP` contra `2.1.1` de las filas 6 a 11.
- `Hoja 19`: se localiza el último par completo por las fechas de las filas 5 y 30, se insertan dos columnas antes del gutter y de la tabla lateral, se copia el patrón de fórmulas de filas 6:25 y 31:50 y se escriben también las cabeceras de año/mes de filas 3:4. En la muestra, agosto ocupa `AQ:AR`, `AS` es el gutter y la tabla comienza en `AT`; septiembre se abre en el nuevo `AS:AT` sin sobrescribir esa tabla.

- [ ] **Step 4: Verifica la sintaxis**

Run: `cp scripts/informatica-drive/Codigo.gs tmp/ck.js && node --check tmp/ck.js && rm tmp/ck.js`
Expected: sin salida.

- [ ] **Step 5: Commit**

```bash
git add scripts/informatica-drive/Codigo.gs
git commit -m "feat(informatica): cierre de mes con ventana movil de encuestas"
```

---

## Task 9: Agregación y pestaña PLANO

**Files:**
- Modify: `scripts/informatica-drive/Codigo.gs`

**Interfaces:**
- Produces:
  - `agregar(clasificacion, extraction): { edificios: [], incidencias: [], encuestas: [], workOrders: [], peticiones: [], peticionesProducto: [], citas: [], imacs: [] }`
  - `serializarPlano(agregado, meta): string`
  - `escribirPlano(texto)`

`serializarPlano` produce exactamente el formato de `shared/modules/informatica/texto.ts`: misma cabecera, mismos nombres de sección y mismo orden de columnas. Es el punto donde los dos lados se pueden desincronizar, así que la tarea 11 lo comprueba contra el parser real.

Todos los recuentos salen agregados. Ninguna función de `agregar` puede devolver un nombre, una matrícula ni una descripción libre.

- [ ] **Step 1: Escribe el acumulador**

```javascript
/** Adds `amount` to the bucket of a dimension tuple. Keys join with '\u0000'. */
function bump(buckets, keys, amount) {
  var key = keys.join('\u0000');

  buckets[key] = (buckets[key] || 0) + amount;
}

/** Turns the buckets back into rows, sorted, ready to serialise. */
function rows(buckets) {
  var out = [];

  for (var key in buckets) {
    if (Object.prototype.hasOwnProperty.call(buckets, key)) {
      out.push(key.split('\u0000').concat([buckets[key]]));
    }
  }

  return out.sort(function (a, b) {
    return a.join('\t') < b.join('\t') ? -1 : 1;
  });
}
```

- [ ] **Step 2: Escribe el serializador**

```javascript
var SECTION = {
  edificios: 'EDIFICIOS',
  incidencias: 'INCIDENCIAS',
  encuestas: 'ENCUESTAS',
  workOrders: 'WORKORDERS',
  peticiones: 'PETICIONES',
  peticionesProducto: 'PETICIONESPRODUCTO',
  citas: 'CITAS',
  imacs: 'IMACS'
};

var SECTION_ORDER = [
  'edificios',
  'incidencias',
  'encuestas',
  'workOrders',
  'peticiones',
  'peticionesProducto',
  'citas',
  'imacs'
];

function serializarPlano(agregado, meta) {
  var out = [TEXTO_HEADER];

  if (meta.week) out.push('semana\t' + meta.week);
  if (meta.generated) out.push('generado\t' + meta.generated);
  if (meta.source) out.push('origen\t' + meta.source);

  for (var i = 0; i < SECTION_ORDER.length; i++) {
    var key = SECTION_ORDER[i];
    var filas = agregado[key] || [];

    if (filas.length === 0) continue;

    out.push('');
    out.push('[' + SECTION[key] + ']');

    for (var j = 0; j < filas.length; j++) {
      out.push(filas[j].join('\t'));
    }
  }

  return out.join('\n');
}
```

- [ ] **Step 3: Escribe la agregación del histórico**

El `PLANO` emite la serie mensual entera, no solo la semana. Las fuentes de cada sección histórica son las de la spec, apartado 8:

- `incidencias`: los meses de `2.1.1` (bloques BBVA y BBVA TECH como métrica) y el desglose por categoría de `2.1.2 (Datos)`.
- `encuestas`: la distribución real mes × valoración de `2.1.5 Encuestas (datos)!C:H`, donde la tarea 6 ya dejó solo las columnas de cálculo y eliminó PII. `2.1.5 (Informe)!B4:D22` sirve para contrastar total y media, pero no para reconstruir puntuaciones históricas.
- `workOrders`: la serie mensual de `Hoja 14` más el detalle edificio × tipo del mes en curso de `2.1.6 (Informe)`.
- `imacs`: los meses de `Hoja 19`.
- `peticiones` y `peticionesProducto`: solo la semana en curso. Es todo lo que el libro tiene, y por eso la tarea 3 existe.

En `peticiones`, los orígenes salen de las fórmulas `D:G` del informe: BBVA Technology, los tres productos RENOVE, los productos que contienen `APPLE DAAS` y On Site como resto. Se emiten las entidades `Peticiones` (una por fila) y `Posiciones` (suma de `Cantidad`). No se replica el defecto del libro que usa `Días Reales` como posiciones para dos orígenes.

- [ ] **Step 4: Escribe la pestaña**

```javascript
function escribirPlano(texto) {
  var sheet = sheetByName(TAB.plano, true);
  var lineas = texto.split('\n');
  var valores = [];

  for (var i = 0; i < lineas.length; i++) {
    valores.push([lineas[i]]);
  }

  sheet.clear();
  sheet.getRange(1, 1, valores.length, 1).setValues(valores);
}
```

- [ ] **Step 5: Verifica la sintaxis**

Run: `cp scripts/informatica-drive/Codigo.gs tmp/ck.js && node --check tmp/ck.js && rm tmp/ck.js`
Expected: sin salida.

- [ ] **Step 6: Commit**

```bash
git add scripts/informatica-drive/Codigo.gs
git commit -m "feat(informatica): agregacion y pestana PLANO"
```

---

## Task 10: Pestaña Comprobación y orquestación

**Files:**
- Modify: `scripts/informatica-drive/Codigo.gs`

**Interfaces:**
- Produces:
  - `procesarSemana()` — el paso semanal completo.
  - `inicializarHoja()`, `guardarPlanoTxt()`
  - `escribirComprobacion(informe)`

`procesarSemana` llama en este orden, que es el único correcto:

1. `readConfig()`
2. `classifyFolder()` — si falta un fichero, aborta y lo dice, sin escribir nada.
3. `rodarSemanaAnterior()` — antes de tocar los datos.
4. `escribirDatos()`
5. `escribirMarcadores()`
6. `agregar()` y `escribirPlano()`
7. `escribirComprobacion()`

- [ ] **Step 1: Escribe la orquestación**

```javascript
function procesarSemana() {
  var config = readConfig();
  var clasificacion = classifyFolder(config.folderId);
  var informe = { faltan: [], leidas: {}, escritas: {}, desconocidos: [] };
  var requiredKinds = ['backlog', 'liberadas', 'gestionadas', 'encuestas', 'workOrders', 'citas', 'imac'];

  try {
    for (var index = 0; index < requiredKinds.length; index += 1) {
      if (!clasificacion.found[requiredKinds[index]]) informe.faltan.push(requiredKinds[index]);
    }

    if (informe.faltan.length > 0) {
      escribirComprobacion(informe);
      throw new Error('Faltan ficheros en la carpeta: ' + informe.faltan.join(', '));
    }

    rodarSemanaAnterior();
    escribirDatos(clasificacion, informe);
    escribirMarcadores(config.extraction);

    var agregado = agregar(clasificacion, config.extraction);

    escribirPlano(
      serializarPlano(agregado, {
        week: isoDate(config.extraction),
        generated: new Date().toISOString(),
        source: clasificacion.nombres.join('; ')
      })
    );

    escribirComprobacion(informe);
  } finally {
    for (var handle = 0; handle < clasificacion.handles.length; handle += 1) {
      discardTemporary(clasificacion.handles[handle]);
    }
  }
}
```

Abortar antes de escribir nada cuando falta un fichero es deliberado: una escritura a medias deja el libro con la mitad de las pestañas de esta semana y la otra mitad de la anterior, y ninguna cifra del informe avisa de eso.

- [ ] **Step 2: Escribe la pestaña de comprobación**

Las siete filas que enumera el apartado 9 de la spec, cada una como fila de la hoja `Comprobación`, con la fecha de ejecución en la primera.

- [ ] **Step 3: Verifica la sintaxis**

Run: `cp scripts/informatica-drive/Codigo.gs tmp/ck.js && node --check tmp/ck.js && rm tmp/ck.js && grep -nE "=>|\bconst \b|\blet \b" scripts/informatica-drive/Codigo.gs`
Expected: sin salida en ninguno de los dos.

- [ ] **Step 4: Commit**

```bash
git add scripts/informatica-drive/Codigo.gs
git commit -m "feat(informatica): orquestacion semanal y pestana de comprobacion"
```

---

## Task 11: Verificación local contra los ficheros reales

Esta es la tarea que demuestra que las tareas 5 a 10 funcionan. Hasta aquí, `Codigo.gs` solo se ha comprobado sintácticamente.

**Files:**
- Create: `scripts/informatica-drive/verificar-local.mjs`
- Test: `server/informatica-texto.test.ts`

**Interfaces:**
- Consumes: `Codigo.gs` cargado en una VM de Node con los globales de Google simulados, igual que `scripts/aga-drive/verificar-local.mjs`.
- Produces: imprime por stdout el texto que el script escribiría en `PLANO`.

- [ ] **Step 1: Escribe el arnés**

Copia `scripts/aga-drive/verificar-local.mjs` y adapta la carga: los mismos globales simulados, `agregar` y `serializarPlano` en vez de las funciones de AGA. Se ejercita la agregación, que es donde están las reglas; las partes que hablan con Drive y con la hoja no se ejecutan, porque un stub solo podría fingir que las verifica.

Uso:

```bash
node scripts/informatica-drive/verificar-local.mjs "C:/Users/sergi/Desktop/MIX/AV weekly/Informática SSCC" 2026-08-24
```

- [ ] **Step 2: Ejecútalo contra los ficheros del 2026-08-24**

Run: el comando anterior, redirigiendo a `tmp/plano-20260824.txt`
Expected: un texto que empieza por `INFORMATICA TEXTO PLANO v1` y trae las ocho secciones.

- [ ] **Step 3: Escribe el test que cierra el círculo**

Añade a `server/informatica-texto.test.ts` un test que lea ese fichero si existe y lo pase por el parser real, comprobando que las ocho secciones se leen y que ninguna fila cae por malformada. Si el fichero no está, el test se salta con `it.skip`: la suite no puede depender de una ruta de la máquina de Sergio.

```ts
import { existsSync, readFileSync } from "node:fs";

const muestra = "tmp/plano-20260824.txt";

describe("texto generado por el script de Drive", () => {
  const run = existsSync(muestra) ? it : it.skip;

  run("se lee entero con el parser del servidor", () => {
    const { dataset } = parseInformaticaTexto(readFileSync(muestra, "utf8"));

    expect(dataset.sheetsFound?.length).toBeGreaterThanOrEqual(6);
    expect(dataset.peticiones?.length).toBeGreaterThan(0);
    expect(dataset.encuestas?.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 4: Contrasta los totales con el libro**

Compara a mano tres cifras del `PLANO` con las que muestra hoy el libro limpio: peticiones en vuelo de la semana, work orders del mes y encuestas del mes. Tienen que coincidir. Si no coinciden, decide primero si el fallo es del script o un defecto del libro, y anótalo antes de tocar nada.

- [ ] **Step 5: Escribe el README**

`scripts/informatica-drive/README.md`, con la misma estructura que `scripts/aga-drive/README.md`: qué es cada fichero, instalación una sola vez, rutina de cada semana, qué hacer al cerrar mes y qué mirar en `Comprobación`. En español, sin emojis fuera del nombre del menú, que sí los lleva por consistencia con el menú de AGA.

- [ ] **Step 6: Commit**

```bash
git add scripts/informatica-drive/verificar-local.mjs scripts/informatica-drive/README.md server/informatica-texto.test.ts
git commit -m "feat(informatica): verificacion local del script de Drive y README"
```

---

## Task 12: Correcciones de fórmula del libro

Van al final a propósito: hasta que la tarea 11 no confirma que el script reproduce las cifras actuales, no hay forma de distinguir una corrección de una regresión.

**Files:**
- Modify: `scripts/informatica-drive/Codigo.gs` (función nueva `repararFormulas()`)

**Interfaces:**
- Produces: `repararFormulas()`, invocada desde `inicializarHoja()` y también después de `escribirDatos()` en `procesarSemana()`. La reparación de `#REF!` es una migración idempotente; la fórmula Total de `2.1.2` sí debe reponerse semanalmente porque la tarea 6 reemplaza esa fila con el valor del template.

- [ ] **Step 1: Repara el `#REF!` y la resta de peticiones en vuelo**

Además de sustituir los cinco `#REF!` de `G6` por `$G$1`, corrige `D4`: la fórmula
probada en el libro resta por error `E5:G5`; debe restar `E4:G4`, los orígenes de su
propia fila.

```javascript
/**
 * One-off repairs of formulas that are wrong in the book as it stands.
 *
 * '2.2.1 (Informe)' G6 lost its reference: it reads ">="&#REF! where its three
 * sibling cells read ">="&G1. The DAAS APPLE figure of the managed row has been
 * counting wrong ever since.
 */
function repararFormulas() {
  var sheet = sheetByName(TAB.peticionesInforme, false);
  var actual = sheet.getRange('G6').getFormula();

  if (actual.indexOf('#REF!') >= 0) {
    sheet.getRange('G6').setFormula(actual.replace(/#REF!/g, '$G$1'));
  }
}
```

- [ ] **Step 2: Convierte la fila Total de `2.1.2` en `SUM`**

La fila 27 de `2.1.2 (Datos)` es hoy un número pegado. Escribe `=SUM(C3:C26)` y equivalentes en cada columna, de forma que un desajuste entre el template y las filas cargadas se vea en vez de quedar tapado.

Localiza esa fila por la etiqueta `Total`, no solo por el número 27, y alinea el bloque
semántico `Posiciones` para que todos sus orígenes sumen `Cantidad` (`S`) en lugar de
`Días Reales` (`P`).

- [ ] **Step 3: Acota las fórmulas de agregación**

En `2.1.6 (Informe)` y `Hoja 18`, acota las `COUNTIFS`; en `Hoja 19`, que realmente usa
`SUMIFS`, aplica la misma regla. Sustituye solo referencias a la pestaña de datos de ese
informe por rangos hasta el número de filas escrito que deja `informe.escritas`; no toques
maestros ni tablas auxiliares de la propia pestaña de informe.

- [ ] **Step 4: Verifica**

Run: `cp scripts/informatica-drive/Codigo.gs tmp/ck.js && node --check tmp/ck.js && rm tmp/ck.js && pnpm run check && pnpm test`
Expected: todo limpio.

Después, vuelve a ejecutar `verificar-local.mjs` y comprueba que las cifras siguen coincidiendo salvo la de DAAS APPLE en gestionadas, que ahora debe ser la correcta.

- [ ] **Step 5: Commit**

```bash
git add scripts/informatica-drive/Codigo.gs
git commit -m "fix(informatica): repara el #REF! de peticiones y acota las COUNTIFS"
```

---

## Cobertura de la spec

| Apartado de la spec | Tarea |
|---|---|
| 2 Arquitectura, menú, configuración | 5, 10 |
| 2 Identificación por cabecera | 5 |
| 3 Destinos y política de escritura | 6 |
| 3 Zonas intocables | 6 (por omisión, `writeGrid` nunca alcanza `X:Z`, `Y:Z`, `AB`, `BC:BE`) |
| 3 Columnas calculadas resueltas a valor | 6 |
| 4 Conversión de fechas | 6 |
| 5 Datos personales en encuestas | 6 |
| 6 Marcadores semanales y rodaje | 7 |
| 6 Cierre de mes | 8 |
| 7 Histórico y ventana de encuestas | 8 |
| 8 Pestaña PLANO | 1, 2, 9 |
| 8 Histórico en la base de datos | 3, 4 |
| 9 Pestaña Comprobación | 10 |
| 10 Correcciones de fórmula | 12 |
| 11 Verificación | 11 |

Los pendientes del apartado 13 de la spec (`Hoja 19` y su referencia a `'2025'`, el año nuevo del fichero IMAC, y a qué página sale el bloque de `2.1.6` filas 45-49) no tienen tarea: Sergio los resuelve aparte. Ninguno bloquea las doce tareas.
