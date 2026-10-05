/**
 * Backup of every import, for every department.
 *
 * Before an upload touches the database this keeps two things: the uploaded
 * bytes as they arrived (file or pasted text) and a snapshot of every table the
 * import is about to write. A damaged document can then be undone by restoring
 * the snapshot, and any import can be replayed from its original file.
 *
 * Payloads are gzipped and split into parts below the size that made the remote
 * libSQL transport reset the socket (see db-fetch.ts), so a 25 MB Informática
 * workbook backs up the same way as a weekly TXT. If the backup cannot be
 * written the import is refused: an import without its backup is exactly what
 * this module exists to prevent.
 */
import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import type { Client, InValue } from "@libsql/client";
import type { NextFunction, Request, Response } from "express";

export const BACKUP_PART_BYTES = 1024 * 1024;

export type BackupDepartment = "av" | "informatica" | "aga" | "oficinas";

export async function ensureBackupTables(db: Client): Promise<void> {
  await db.executeMultiple(`
    -- One row per import attempt. status is set once the response is sent.
    CREATE TABLE IF NOT EXISTS upload_backup (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      department TEXT NOT NULL,
      action TEXT NOT NULL,
      files TEXT NOT NULL,
      tables TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pendiente',
      http_status INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS upload_backup_department_date
      ON upload_backup (department, created_at DESC);

    -- Gzipped payload parts: "file:<index>" for the uploaded bytes and
    -- "table:<name>" for the JSON snapshot of a table before the import.
    CREATE TABLE IF NOT EXISTS upload_backup_part (
      backup_id INTEGER NOT NULL,
      item TEXT NOT NULL,
      part INTEGER NOT NULL,
      data BLOB NOT NULL,
      PRIMARY KEY (backup_id, item, part)
    );
  `);
}

export interface BackupFile {
  name: string;
  mimeType: string;
  content: Buffer;
}

export interface BackupFileMeta {
  item: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}

async function writeItem(db: Client, backupId: number, item: string, raw: Buffer): Promise<void> {
  const packed = gzipSync(raw);
  const parts = Math.max(1, Math.ceil(packed.length / BACKUP_PART_BYTES));
  for (let part = 0; part < parts; part++) {
    await db.execute({
      sql: "INSERT INTO upload_backup_part (backup_id, item, part, data) VALUES (?, ?, ?, ?)",
      args: [
        backupId,
        item,
        part,
        packed.subarray(part * BACKUP_PART_BYTES, (part + 1) * BACKUP_PART_BYTES),
      ],
    });
  }
}

export async function readItem(db: Client, backupId: number, item: string): Promise<Buffer | null> {
  const result = await db.execute({
    sql: "SELECT data FROM upload_backup_part WHERE backup_id = ? AND item = ? ORDER BY part",
    args: [backupId, item],
  });
  if (result.rows.length === 0) return null;
  const chunks = result.rows.map((row) => {
    const data = row.data as ArrayBuffer | Uint8Array;
    return Buffer.from(data instanceof ArrayBuffer ? new Uint8Array(data) : data);
  });
  return gunzipSync(Buffer.concat(chunks));
}

/** Stores the uploaded bytes and the current rows of `tables`. Returns the backup id. */
export async function createBackup(
  db: Client,
  department: BackupDepartment,
  action: string,
  files: BackupFile[],
  tables: string[]
): Promise<number> {
  const metas: BackupFileMeta[] = files.map((file, index) => ({
    item: `file:${index}`,
    name: file.name,
    mimeType: file.mimeType,
    sizeBytes: file.content.length,
    sha256: createHash("sha256").update(file.content).digest("hex"),
  }));

  const inserted = await db.execute({
    sql: `INSERT INTO upload_backup (department, action, files, tables)
          VALUES (?, ?, ?, ?) RETURNING id`,
    args: [department, action, JSON.stringify(metas), JSON.stringify(tables)],
  });
  const backupId = Number(inserted.rows[0].id);

  for (let index = 0; index < files.length; index++) {
    await writeItem(db, backupId, metas[index].item, files[index].content);
  }

  for (const table of tables) {
    const rows = await db.execute(`SELECT * FROM ${table}`);
    const plain = rows.rows.map((row) =>
      Object.fromEntries(rows.columns.map((column) => [column, row[column]]))
    );
    await writeItem(db, backupId, `table:${table}`, Buffer.from(JSON.stringify(plain), "utf8"));
  }

  return backupId;
}

export async function setBackupStatus(db: Client, backupId: number, httpStatus: number): Promise<void> {
  await db.execute({
    sql: "UPDATE upload_backup SET status = ?, http_status = ? WHERE id = ?",
    args: [httpStatus >= 200 && httpStatus < 300 ? "aplicada" : "rechazada", httpStatus, backupId],
  });
}

/** Puts every table of a backup back as it was before that import. */
export async function restoreBackup(db: Client, backupId: number): Promise<string[]> {
  const header = await db.execute({
    sql: "SELECT tables FROM upload_backup WHERE id = ?",
    args: [backupId],
  });
  if (header.rows.length === 0) throw new Error(`No existe la copia ${backupId}.`);
  const tables = JSON.parse(header.rows[0].tables as string) as string[];

  const statements: Array<{ sql: string; args: InValue[] }> = [];
  for (const table of tables) {
    const raw = await readItem(db, backupId, `table:${table}`);
    if (!raw) throw new Error(`La copia ${backupId} no tiene la tabla ${table}.`);
    const rows = JSON.parse(raw.toString("utf8")) as Array<Record<string, InValue>>;
    statements.push({ sql: `DELETE FROM ${table}`, args: [] });
    for (const row of rows) {
      const columns = Object.keys(row);
      statements.push({
        sql: `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
        args: columns.map((column) => row[column]),
      });
    }
  }
  await db.batch(statements, "write");
  return tables;
}

function filesFromRequest(req: Request): BackupFile[] {
  const files: BackupFile[] = [];
  const add = (file: Express.Multer.File) =>
    files.push({ name: file.originalname, mimeType: file.mimetype, content: file.buffer });

  if (req.file) add(req.file);
  if (req.files) {
    const all = Array.isArray(req.files) ? req.files : Object.values(req.files).flat();
    all.forEach(add);
  }

  const body = req.body as { texto?: unknown } | undefined;
  if (typeof body?.texto === "string" && body.texto.trim() !== "") {
    files.push({ name: "texto-pegado.txt", mimeType: "text/plain", content: Buffer.from(body.texto, "utf8") });
  }
  return files;
}

/**
 * Express middleware placed after multer and before the import handler.
 * The backup row is closed with the final HTTP status once the response ends.
 */
export function backupBeforeImport(
  db: Client,
  department: BackupDepartment,
  action: string,
  tables: string[]
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    let backupId: number;
    try {
      backupId = await createBackup(db, department, action, filesFromRequest(req), tables);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      res.status(500).json({
        error: `No se pudo guardar la copia de seguridad, así que no se ha importado nada. ${detail}`,
      });
      return;
    }

    res.on("finish", () => {
      setBackupStatus(db, backupId, res.statusCode).catch(() => {
        // The backup itself is stored; only its final status is missing.
      });
    });
    next();
  };
}
