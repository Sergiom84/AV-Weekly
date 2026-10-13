import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { createClient, type Client } from "@libsql/client";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import {
  ensureAvArchiveTables,
  listAvReports,
  readAvReport,
  saveAvReport,
} from "./av-report-archive.ts";

let db: Client;
let directory: string;
const pdf = (label: string) => Buffer.from(`%PDF-${label}`);
beforeEach(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "av-archive-"));
  db = createClient({ url: `file:${path.join(directory, "test.db")}` });
  await ensureAvArchiveTables(db);
});
afterEach(() => {
  db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

describe("finished AV reports", () => {
  it("stores a multipart PDF with its embedded images byte for byte", async () => {
    const original = Buffer.concat([
      pdf("images"),
      randomBytes(2 * 1024 * 1024),
    ]);
    const [report] = await saveAvReport(db, 2026, 40, "AV_S40.pdf", original);
    expect((await readAvReport(db, report.id))?.pdf).toEqual(original);
    expect(report.sizeBytes).toBe(original.length);
    expect(
      Number(
        (await db.execute("SELECT count(*) AS n FROM av_report_archive_part"))
          .rows[0].n
      )
    ).toBe(3);
  });
  it("updates the same week without consuming another archive slot", async () => {
    const [old] = await saveAvReport(db, 2026, 40, "old.pdf", pdf("old"));
    const [updated] = await saveAvReport(
      db,
      2026,
      40,
      "updated.pdf",
      pdf("updated")
    );
    expect(updated.id).toBe(old.id);
    expect(await listAvReports(db)).toHaveLength(1);
    expect(await readAvReport(db, old.id)).toEqual({
      filename: "updated.pdf",
      pdf: pdf("updated"),
    });
  });
  it("keeps the latest five weeks and deletes only the sixth report's parts", async () => {
    let first = "";
    for (const week of [40, 41, 42, 43, 44, 45]) {
      const reports = await saveAvReport(
        db,
        2026,
        week,
        `${week}.pdf`,
        pdf(String(week))
      );
      if (week === 40) first = reports[0].id;
    }
    expect((await listAvReports(db)).map(r => r.week)).toEqual([
      45, 44, 43, 42, 41,
    ]);
    expect(await readAvReport(db, first)).toBeNull();
    expect(
      Number(
        (
          await db.execute({
            sql: "SELECT count(*) AS n FROM av_report_archive_part WHERE report_id=?",
            args: [first],
          })
        ).rows[0].n
      )
    ).toBe(0);
  });
  it("distinguishes identical week numbers in different years", async () => {
    await saveAvReport(db, 2025, 40, "2025.pdf", pdf("2025"));
    await saveAvReport(db, 2026, 40, "2026.pdf", pdf("2026"));
    expect((await listAvReports(db)).map(r => r.year)).toEqual([2026, 2025]);
  });
  it("rolls back failed replacement and retains the previous PDF", async () => {
    const [old] = await saveAvReport(db, 2026, 40, "old.pdf", pdf("old"));
    await db.execute(
      `CREATE TRIGGER fail_archive BEFORE INSERT ON av_report_archive_part BEGIN SELECT RAISE(ABORT, 'disk failure'); END`
    );
    await expect(
      saveAvReport(db, 2026, 40, "new.pdf", pdf("new"))
    ).rejects.toThrow();
    expect(await readAvReport(db, old.id)).toEqual({
      filename: "old.pdf",
      pdf: pdf("old"),
    });
  });
  it("rejects invalid PDF or period before changing the archive", async () => {
    await expect(
      saveAvReport(db, 2026, 40, "bad.pdf", Buffer.from("not PDF"))
    ).rejects.toThrow();
    await expect(
      saveAvReport(db, 2026, 54, "bad.pdf", pdf("bad"))
    ).rejects.toThrow();
    expect(await listAvReports(db)).toEqual([]);
  });
  it("detects missing PDF parts instead of returning a broken file", async () => {
    const [report] = await saveAvReport(
      db,
      2026,
      40,
      "40.pdf",
      pdf("complete")
    );
    await db.execute({
      sql: "DELETE FROM av_report_archive_part WHERE report_id=?",
      args: [report.id],
    });
    await expect(readAvReport(db, report.id)).rejects.toThrow("completo");
  });
});
