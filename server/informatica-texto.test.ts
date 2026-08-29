import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type { Server } from "node:http";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  INFORMATICA_TEXTO_HEADER,
  INFORMATICA_TEXTO_SECTIONS,
  serializeInformaticaTexto,
} from "../shared/modules/informatica/texto.ts";
import type { InformaticaDataset } from "../shared/modules/informatica/types.ts";
import { getDeckModule } from "../shared/deck/registry.ts";
import { parseInformaticaTexto } from "./parseInformaticaTexto.ts";

const source = { sourceFile: "Backlog.xlsx", uploadedAt: "2026-08-24T09:00:00.000Z" };

describe("serializeInformaticaTexto", () => {
  it("escribe cabecera, metadatos y una seccion por concepto", () => {
    const dataset: InformaticaDataset = {
      source,
      peticiones: [
        {
          fecha: "2026-08-17",
          semana: 34,
          mes: "2026/08",
          origen: "On Site",
          estado: "En vuelo",
          entidad: "Peticiones",
          total: 306,
        },
      ],
      encuestas: [{ fecha: "2026-08-01", mes: "2026/08", valoracion: "5", respuestas: 412 }],
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
      "2026-08-01\t2026/08\t5\t412",
      "",
      "[PETICIONES]",
      "2026-08-17\t2026/08\t34\tOn Site\tEn vuelo\tPeticiones\t306",
    ]);
  });

  it("omite las secciones sin filas", () => {
    const texto = serializeInformaticaTexto({ source }, {});

    expect(texto).toBe(INFORMATICA_TEXTO_HEADER);
  });

  it("escribe la fecha en ISO desde texto, desde serial de Excel y vacia si no hay", () => {
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
        {
          fecha: 46251,
          semana: 34,
          mes: "2026/08",
          edificio: "Sede - Principal",
          tipo: "Sin Cita",
          citas: 12,
        },
        {
          fecha: null,
          semana: 34,
          mes: "2026/08",
          edificio: "Sede - Norte",
          tipo: "Con Cita",
          citas: 7,
        },
      ],
    };

    const filas = serializeInformaticaTexto(dataset, {}).split("\n").slice(3);

    expect(filas).toEqual([
      "2026-08-17\t2026/08\t34\tSede - Principal\tCon Cita\t96",
      "2026-08-17\t2026/08\t34\tSede - Principal\tSin Cita\t12",
      "\t2026/08\t34\tSede - Norte\tCon Cita\t7",
    ]);
  });
});

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

  // `fecha` leads every section with a period, so reading `mes` out of the
  // first cell would shift every following field by one. The row below fails
  // that way and only that way: the cell count is right, the contents are not.
  it("coloca cada celda en su campo: la fecha no invade el mes", () => {
    const texto = [
      INFORMATICA_TEXTO_HEADER,
      "[PETICIONES]",
      "2026-08-17\t2026/08\t34\tOn Site\tEn vuelo\tPeticiones\t306",
    ].join("\n");

    const [fila] = parseInformaticaTexto(texto).dataset.peticiones ?? [];

    expect(fila?.fecha).toBe("2026-08-17");
    expect(fila?.mes).toBe("2026/08");
    expect(fila?.semana).toBe(34);
    expect(fila?.origen).toBe("On Site");
    expect(fila?.total).toBe(306);
  });

  // An empty date must come back as `null`, never as `""`: the round trip has
  // to be stable, and `InformaticaDateCell` declares the absence as `null`.
  it("lee como null la celda de fecha vacia, no como cadena vacia", () => {
    const texto = [
      INFORMATICA_TEXTO_HEADER,
      "[CITAS]",
      "\t2026/08\t34\tSede - Principal\tCon Cita\t96",
    ].join("\n");

    const [fila] = parseInformaticaTexto(texto).dataset.citas ?? [];

    expect(fila?.fecha).toBeNull();
    expect(fila).toEqual({
      fecha: null,
      semana: 34,
      mes: "2026/08",
      edificio: "Sede - Principal",
      tipo: "Con Cita",
      citas: 96,
    });
  });

  it("da la vuelta completa: serializar y volver a leer conserva las filas", () => {
    const dataset: InformaticaDataset = {
      source,
      citas: [
        {
          fecha: null,
          semana: 34,
          mes: "2026/08",
          edificio: "Sede - Principal",
          tipo: "Con Cita",
          citas: 96,
        },
        {
          fecha: "2026-08-17",
          semana: 34,
          mes: "2026/08",
          edificio: "Sede - Norte",
          tipo: "Sin Cita",
          citas: 12,
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

describe("texto generado por el script de Drive", () => {
  const sampleFolder = "C:/Users/sergi/Desktop/MIX/AV weekly/Informática SSCC";
  const verifier = path.resolve("scripts/informatica-drive/verificar-local.mjs");
  const requiredFiles = [
    "Backlog20260824.xlsx",
    "Gestionadas20260824.xlsx",
    "Liberadas20260824.xlsx",
    "Peticiones IMAC Onsite SSCC.xlsx",
    "SSCC- Informe Semanal limpio.xlsx",
    "Templates SSCC para presentación - Email semanal.xlsx",
  ];
  const run = requiredFiles.every((file) => fs.existsSync(path.join(sampleFolder, file)))
    ? it
    : it.skip;

  run("genera todas las secciones verificables y el parser no descarta ninguna fila", () => {
    const texto = execFileSync(
      process.execPath,
      [verifier, sampleFolder, "2026-08-24"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
    const { dataset, meta } = parseInformaticaTexto(texto);
    const sectionRows = new Map<string, number>();
    let section = "";

    for (const line of texto.split(/\r?\n/)) {
      const match = /^\[([^\]]+)\]$/.exec(line);

      if (match) {
        section = match[1];
        sectionRows.set(section, 0);
      } else if (section && line !== "") {
        sectionRows.set(section, (sectionRows.get(section) ?? 0) + 1);
      }
    }

    expect(meta).toMatchObject({
      week: "2026-08-24",
      asOfDate: "2026-08-24",
      generated: "2026-08-24T00:00:00.000Z",
    });
    expect(dataset.sheetsFound).toEqual([
      "edificios",
      "incidencias",
      "encuestas",
      "workOrders",
      "peticiones",
      "peticionesProducto",
      "peticionesAnual",
      "citas",
      "citasAnual",
      "hic",
      "comparativas",
      "slas",
      "imacs",
    ]);

    const generated = [
      "edificios", "incidencias", "encuestas", "workOrders", "peticiones",
      "peticionesProducto", "peticionesAnual", "citas", "citasAnual", "hic",
      "comparativas", "slas", "imacs",
    ] as const;

    for (const key of generated) {
      const sectionName = INFORMATICA_TEXTO_SECTIONS[key];
      const parsed = dataset[key as keyof InformaticaDataset];

      expect(Array.isArray(parsed), key).toBe(true);
      expect((parsed as unknown[]).length, key).toBe(sectionRows.get(sectionName));
      expect((parsed as unknown[]).length, key).toBeGreaterThan(0);
    }
    expect(dataset.wasp).toBeUndefined();
    expect(dataset.renove).toBeUndefined();
  }, 30_000);
});

describe("punto de entrada del deck", () => {
  it("ofrece la subida de texto plano de Drive", () => {
    const uploads = getDeckModule("informatica").deck?.uploads ?? [];

    expect(uploads[0]).toMatchObject({
      id: "texto",
      label: "Texto plano (Drive)",
      path: "/api/informatica/upload/texto",
      multiple: false,
      accept: ".txt,.tsv,.csv",
    });
    // The raw workbooks keep their own slot while the Drive flow beds in.
    expect(uploads.map((slot) => slot.id)).toContain("plano");
  });

  it("declara todas las secciones del contrato, incluso las opcionales", () => {
    expect(Object.values(INFORMATICA_TEXTO_SECTIONS)).toHaveLength(15);
  });
});

/** One `PETICIONES` row of the given week, as the `PLANO` tab writes it. */
function textoDeSemana(fecha: string, semana: number, total: number): string {
  return [
    INFORMATICA_TEXTO_HEADER,
    `semana\t${fecha}`,
    "",
    "[PETICIONES]",
    [fecha, "2026/08", semana, "On Site", "En vuelo", "Peticiones", total].join("\t"),
  ].join("\n");
}

function textoCompleto(sections: string[]): string {
  return [
    INFORMATICA_TEXTO_HEADER,
    "semana\t2026-08-24",
    "alcance\tcompleto",
    ...sections,
  ].join("\n");
}

/**
 * The route over a real database, because merging is what it is for.
 *
 * `mergeInformaticaDataset` is unit-tested on its own in
 * `informatica-import-dedup.test.ts`, but that proves the function merges, not
 * that the route calls it. The failure this guards against is the route
 * replacing the stored dataset — which no assertion over the parser can see.
 */
describe("POST /api/informatica/upload/texto", () => {
  let origin = "";
  let server: Server;
  let dataDir = "";
  let closeClient: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "av-weekly-informatica-texto-"));
    process.env.APP_DATA_DIR = dataDir;

    const [{ initDb, client }, { default: routes }] = await Promise.all([
      import("./db.js"),
      import("./routes.js"),
    ]);

    await initDb();
    closeClient = async () => client.close();

    const app = express();
    app.use(express.json());
    app.use(routes);

    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => resolve());
    });

    const address = server.address();

    if (!address || typeof address === "string") {
      throw new Error("El servidor de prueba no expuso un puerto TCP");
    }

    origin = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await closeClient?.();

    try {
      fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch (error) {
      // The native libSQL binding keeps its Windows directory handle until the
      // process exits, so the temp directory is left to the OS.
      if (!(error instanceof Error) || !("code" in error) || error.code !== "EPERM") {
        throw error;
      }
    }
  });

  it("rechaza un cuerpo vacio", async () => {
    const response = await fetch(`${origin}/api/informatica/upload/texto`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ texto: "   " }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("texto plano"),
    });
  });

  it("rechaza un texto sin la cabecera del formato", async () => {
    const response = await fetch(`${origin}/api/informatica/upload/texto`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ texto: "PEGADO CUALQUIERA\n" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining(INFORMATICA_TEXTO_HEADER),
    });
  });

  it("funde la semana nueva con la almacenada en vez de reemplazarla", async () => {
    const form = new FormData();

    form.append(
      "file",
      new Blob([textoDeSemana("2026-08-10", 33, 700)], { type: "text/plain" }),
      "PLANO-33.txt"
    );

    const primera = await fetch(`${origin}/api/informatica/upload/texto`, {
      method: "POST",
      body: form,
    });

    expect(primera.status).toBe(200);

    const segunda = await fetch(`${origin}/api/informatica/upload/texto`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ texto: textoDeSemana("2026-08-17", 34, 714) }),
    });

    expect(segunda.status).toBe(200);

    // The answer carries the payload the deck rehydrates from, so the sidebar
    // does not need a second fetch after an upload.
    const body = (await segunda.json()) as { data: InformaticaDataset };

    expect(body.data.peticiones?.map((row) => [row.semana, row.total])).toEqual([
      [33, 700],
      [34, 714],
    ]);

    const almacenado = (await (await fetch(`${origin}/api/informatica`)).json()) as {
      data: InformaticaDataset;
    };

    expect(almacenado.data.peticiones?.map((row) => [row.semana, row.total])).toEqual([
      [33, 700],
      [34, 714],
    ]);
    expect(almacenado.data.sheetsFound).toContain("peticiones");
  });

  it("un TXT completo no conserva WASP ni Renove de una importacion anterior", async () => {
    const primero = await fetch(`${origin}/api/informatica/upload/texto`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        texto: textoCompleto([
          "",
          "[WASP]",
          "2026-08-24\t2026/08\t35\tProveedor\tFinalizado\t10",
          "",
          "[RENOVE]",
          "2026-08-24\t2026/08\t35\tEspaña\tFinalizado\t20",
        ]),
      }),
    });

    expect(primero.status).toBe(200);

    const segunda = await fetch(`${origin}/api/informatica/upload/texto`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        texto: textoCompleto([
          "",
          "[HIC]",
          "SSCC\t2026/08\t\tResueltas\t722",
        ]),
      }),
    });

    expect(segunda.status).toBe(200);
    const body = (await segunda.json()) as { data: InformaticaDataset };

    expect(body.data.wasp).toBeUndefined();
    expect(body.data.renove).toBeUndefined();
    expect(body.data.hic).toEqual([
      { ambito: "SSCC", mes: "2026/08", categoria: "", metrica: "Resueltas", total: 722 },
    ]);
    expect(body.data.sheetsFound).toEqual(["hic"]);
  });
});
