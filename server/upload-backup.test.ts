import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { NextFunction, Request, Response } from "express";
import {
  BACKUP_PART_BYTES,
  backupBeforeImport,
  createBackup,
  ensureBackupTables,
  readItem,
  restoreBackup,
} from "./uploadBackup.ts";

let dir: string;
let db: Client;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "upload-backup-"));
  db = createClient({ url: `file:${path.join(dir, "test.db")}` });
  await db.execute(
    "CREATE TABLE informe_weekly (id INTEGER PRIMARY KEY, data TEXT NOT NULL, source_file TEXT)"
  );
  await db.execute("INSERT INTO informe_weekly VALUES (1, '{\"weeks\":[36,37,38]}', 'S38.txt')");
  await ensureBackupTables(db);
});

afterEach(() => {
  db.close();
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (error) {
    // libSQL can keep its Windows file handle after close(). The temporary
    // directory is harmless and the assertions have already run.
    if ((error as NodeJS.ErrnoException).code !== "EPERM") throw error;
  }
});

function fakeResponse() {
  const listeners: Array<() => void> = [];
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      listeners.forEach((listener) => listener());
      return this;
    },
    on(_event: string, listener: () => void) {
      listeners.push(listener);
      return this;
    },
  };
  return res;
}

describe("upload backup", () => {
  it("keeps a large upload byte for byte across several parts", async () => {
    // Random bytes do not compress, so this really spans several parts.
    const content = randomBytes(Math.round(BACKUP_PART_BYTES * 2.5));
    const id = await createBackup(db, "informatica", "plano", [
      { name: "Peticiones.xlsx", mimeType: "application/octet-stream", content },
    ], []);

    const parts = await db.execute({
      sql: "SELECT COUNT(*) AS n FROM upload_backup_part WHERE backup_id = ? AND item = 'file:0'",
      args: [id],
    });
    expect(Number(parts.rows[0].n)).toBe(3);
    expect((await readItem(db, id, "file:0"))?.equals(content)).toBe(true);
  });

  it("restores the tables as they were before a damaged import", async () => {
    const id = await createBackup(db, "av", "texto", [], ["informe_weekly"]);
    // A damaged upload wipes the stored weeks.
    await db.execute("UPDATE informe_weekly SET data = '{\"weeks\":[]}', source_file = 'roto.txt'");

    expect(await restoreBackup(db, id)).toEqual(["informe_weekly"]);
    const row = (await db.execute("SELECT data, source_file FROM informe_weekly")).rows[0];
    expect(row.data).toBe('{"weeks":[36,37,38]}');
    expect(row.source_file).toBe("S38.txt");
  });

  it("backs up pasted text and records the final status", async () => {
    const middleware = backupBeforeImport(db, "aga", "texto", ["informe_weekly"]);
    const res = fakeResponse();
    let called = false;
    await middleware(
      { body: { texto: "AGA TEXTO PLANO v1" } } as Request,
      res as unknown as Response,
      (() => {
        called = true;
      }) as NextFunction
    );
    expect(called).toBe(true);

    res.status(400).json({ error: "dañado" });
    await new Promise((resolve) => setTimeout(resolve, 20));

    const row = (await db.execute("SELECT id, department, status, http_status, files FROM upload_backup")).rows[0];
    expect(row.department).toBe("aga");
    expect(row.status).toBe("rechazada");
    expect(Number(row.http_status)).toBe(400);
    expect(JSON.parse(row.files as string)[0].name).toBe("texto-pegado.txt");
    expect((await readItem(db, Number(row.id), "file:0"))?.toString("utf8")).toBe("AGA TEXTO PLANO v1");
  });

  it("refuses the import when the backup cannot be written", async () => {
    const middleware = backupBeforeImport(db, "oficinas", "plano", ["tabla_inexistente"]);
    const res = fakeResponse();
    let called = false;
    await middleware({ body: {} } as Request, res as unknown as Response, (() => {
      called = true;
    }) as NextFunction);

    expect(called).toBe(false);
    expect(res.statusCode).toBe(500);
    expect(String((res.body as { error: string }).error)).toContain("no se ha importado nada");
  });
});
