import { createHash, randomUUID } from "node:crypto";
import type { Client, Transaction } from "@libsql/client";
import {
  AV_ARCHIVE_LIMIT,
  type AvArchivedReport,
} from "../shared/modules/av/reportArchive.ts";

const PART_BYTES = 1024 * 1024;
type Db = Client | Transaction;

export async function ensureAvArchiveTables(db: Client) {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS av_report_archive (
      id TEXT PRIMARY KEY, year INTEGER NOT NULL, week INTEGER NOT NULL,
      filename TEXT NOT NULL, size_bytes INTEGER NOT NULL, sha256 TEXT NOT NULL,
      saved_at TEXT NOT NULL, UNIQUE(year, week)
    );
    CREATE TABLE IF NOT EXISTS av_report_archive_part (
      report_id TEXT NOT NULL, part INTEGER NOT NULL, data BLOB NOT NULL,
      PRIMARY KEY(report_id, part)
    );
  `);
}

export async function listAvReports(db: Db): Promise<AvArchivedReport[]> {
  const result = await db.execute(
    "SELECT id, year, week, filename, size_bytes, saved_at FROM av_report_archive ORDER BY year DESC, week DESC"
  );
  return result.rows.map(row => ({
    id: String(row.id),
    year: Number(row.year),
    week: Number(row.week),
    filename: String(row.filename),
    sizeBytes: Number(row.size_bytes),
    savedAt: String(row.saved_at),
  }));
}

/** Replacement and retention commit together; a failed save keeps all old PDFs. */
export async function saveAvReport(
  db: Client,
  year: number,
  week: number,
  filename: string,
  pdf: Buffer
) {
  if (
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 9999 ||
    !Number.isInteger(week) ||
    week < 1 ||
    week > 53 ||
    !pdf.subarray(0, 5).equals(Buffer.from("%PDF-"))
  ) {
    throw new Error("El informe generado no es válido.");
  }
  const tx = await db.transaction("write");
  try {
    const old = await tx.execute({
      sql: "SELECT id FROM av_report_archive WHERE year = ? AND week = ?",
      args: [year, week],
    });
    const id = old.rows[0] ? String(old.rows[0].id) : randomUUID();
    await tx.execute({
      sql: `INSERT INTO av_report_archive (id, year, week, filename, size_bytes, sha256, saved_at) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(year, week) DO UPDATE SET filename=excluded.filename, size_bytes=excluded.size_bytes, sha256=excluded.sha256, saved_at=excluded.saved_at`,
      args: [
        id,
        year,
        week,
        filename,
        pdf.length,
        createHash("sha256").update(pdf).digest("hex"),
        new Date().toISOString(),
      ],
    });
    await tx.execute({
      sql: "DELETE FROM av_report_archive_part WHERE report_id = ?",
      args: [id],
    });
    for (
      let offset = 0, part = 0;
      offset < pdf.length;
      offset += PART_BYTES, part++
    ) {
      await tx.execute({
        sql: "INSERT INTO av_report_archive_part (report_id, part, data) VALUES (?, ?, ?)",
        args: [id, part, pdf.subarray(offset, offset + PART_BYTES)],
      });
    }
    const reports = await listAvReports(tx);
    for (const removed of reports.slice(AV_ARCHIVE_LIMIT)) {
      await tx.execute({
        sql: "DELETE FROM av_report_archive_part WHERE report_id = ?",
        args: [removed.id],
      });
      await tx.execute({
        sql: "DELETE FROM av_report_archive WHERE id = ?",
        args: [removed.id],
      });
    }
    await tx.commit();
    return reports.slice(0, AV_ARCHIVE_LIMIT);
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.close();
  }
}

export async function readAvReport(db: Client, id: string) {
  // A replacement may happen during a download. One read transaction keeps
  // its metadata and all chunks on the same version, with small wire responses.
  const tx = await db.transaction("read");
  try {
    const meta = await tx.execute({
      sql: "SELECT filename, size_bytes, sha256 FROM av_report_archive WHERE id = ?",
      args: [id],
    });
    if (!meta.rows[0]) return null;
    const parts = await tx.execute({
      sql: "SELECT part FROM av_report_archive_part WHERE report_id = ? ORDER BY part",
      args: [id],
    });
    const chunks: Buffer[] = [];
    for (const row of parts.rows) {
      const part = await tx.execute({
        sql: "SELECT data FROM av_report_archive_part WHERE report_id=? AND part=?",
        args: [id, row.part],
      });
      const data = part.rows[0].data as ArrayBuffer | Uint8Array;
      chunks.push(
        Buffer.from(data instanceof ArrayBuffer ? new Uint8Array(data) : data)
      );
    }
    const pdf = Buffer.concat(chunks);
    if (
      pdf.length !== Number(meta.rows[0].size_bytes) ||
      createHash("sha256").update(pdf).digest("hex") !== meta.rows[0].sha256
    ) {
      throw new Error("No se pudo leer el informe guardado completo.");
    }
    return { filename: String(meta.rows[0].filename), pdf };
  } finally {
    try {
      await tx.rollback();
    } finally {
      tx.close();
    }
  }
}
