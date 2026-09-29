import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer, type Server } from "node:http";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { edificioCode } from "../shared/modules/informatica/buildingCodes.ts";

/**
 * The weekly text upload against the building catalogue.
 *
 * Covers the failure that reached the printed report: a coded text imported
 * with an empty catalogue stored `E3361717668` as the name of an office and the
 * deck published the hash. The route now refuses that upload, and accepts the
 * same text once the catalogue can name the codes back.
 */

const CATALOG = [
  ["A. Maura", "DT Cataluña", "Smart Tech Antoni Maura", "Barcelona Antoni Maura", "", "", "Si", "1"],
];

function codedTexto(): string {
  return [
    "INFORMATICA TEXTO PLANO v1",
    "semana\t2026-09-15",
    "asOfDate\t2026-09-15",
    "alcance\tcompleto",
    "",
    "[CITAS]",
    `2026-09-11\t2026/09\t37\t${edificioCode("Smart Tech Antoni Maura")}\tCon Cita\t2`,
    "",
    "[WORKORDERS]",
    `2026-09-11\t2026/09\t37\t${edificioCode("Barcelona Antoni Maura")}\tTRASLADO\t1`,
  ].join("\n");
}

describe("carga del texto plano con edificios codificados", () => {
  let dataDir = "";
  let server: Server;
  let origin = "";
  let client: (typeof import("./db.js"))["client"];

  beforeAll(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "av-weekly-edificios-"));
    process.env.APP_DATA_DIR = dataDir;

    const db = await import("./db.js");
    client = db.client;
    await db.initDb();

    const { default: router } = await import("./routes.js");
    const app = express();
    app.use(express.json({ limit: "20mb" }));
    app.use(router);

    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, resolve));

    const address = server.address();
    origin = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  });

  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await client.close();
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch (error) {
      // libSQL can briefly retain a Windows file handle after close().
      if ((error as NodeJS.ErrnoException).code !== "EPERM") throw error;
    }
  });

  async function upload(texto: string): Promise<{ status: number; body: any }> {
    const response = await fetch(`${origin}/api/informatica/upload/texto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto }),
    });

    return { status: response.status, body: await response.json() };
  }

  it("refuses a coded text while the catalogue cannot name it", async () => {
    const { status, body } = await upload(codedTexto());

    expect(status).toBe(400);
    expect(body.error).toContain("catálogo de edificios está vacío");
    expect(body.error).toContain(edificioCode("Smart Tech Antoni Maura"));

    // Nothing was stored: a refused upload leaves last week's report standing.
    const stored = await client.execute("SELECT data FROM informatica_dataset WHERE id = 1");
    expect(stored.rows).toHaveLength(0);
  });

  it("accepts it and restores the names once the catalogue is loaded", async () => {
    const { mergeEdificioCatalog, parseEdificioCatalogTsv } = await import(
      "./informaticaEdificios.js"
    );
    const rows = parseEdificioCatalogTsv(CATALOG.map(cells => cells.join("\t")).join("\n"));

    await client.execute({
      sql: `INSERT INTO informatica_edificios (id, data, source_file, updated_at)
            VALUES (1, ?, ?, datetime('now'))`,
      args: [JSON.stringify(mergeEdificioCatalog([], rows)), "test"],
    });

    const { status, body } = await upload(codedTexto());

    expect(status).toBe(200);
    expect(body.data.citas[0].edificio).toBe("Smart Tech Antoni Maura");
    expect(body.data.workOrders[0].edificio).toBe("Barcelona Antoni Maura");
    // The deck renames aliases through this table, so the payload has to carry
    // it even though the text no longer does.
    expect(body.data.edificios).toHaveLength(1);
    expect(body.data.edificios[0].edificio).toBe("A. Maura");
    // The cut declared in the text survives the round trip through the table.
    expect(body.data.source.asOfDate).toBe("2026-09-15");
  });

  it("keeps the catalogue when a complete text replaces the dataset", async () => {
    await upload(codedTexto());

    const stored = await client.execute("SELECT data FROM informatica_edificios WHERE id = 1");
    expect(JSON.parse(stored.rows[0].data as string)).toHaveLength(1);
  });
});
