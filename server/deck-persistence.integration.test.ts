import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("deck persistence history", () => {
  let dataDir = "";
  let client: (typeof import("./db.js"))["client"];
  let persist: (typeof import("./deck-persistence.js"))["persistDeckWithHistory"];

  beforeAll(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "av-weekly-history-"));
    process.env.APP_DATA_DIR = dataDir;
    const db = await import("./db.js");
    const persistence = await import("./deck-persistence.js");
    client = db.client;
    persist = persistence.persistDeckWithHistory;
    await db.initDb();
  });

  afterAll(async () => {
    await client.close();
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch (error) {
      // libSQL can briefly retain a Windows file handle after close(). The
      // temporary directory is harmless and the assertions have already run.
      if ((error as NodeJS.ErrnoException).code !== "EPERM") throw error;
    }
  });

  it("stores the deck and its field history atomically", async () => {
    const base = {
      id: "page-1",
      kind: "chart",
      supportType: null,
      text: { title: "Incidencias" },
      visible: true,
      weekSelection: null,
      years: null,
      overrides: {},
    };
    await persist("oficinas", { pages: [base], updatedAt: null });
    const result = await persist("oficinas", {
      pages: [{ ...base, overrides: { "total:S35": 99 } }],
      updatedAt: null,
    });

    expect(result.changes).toHaveLength(1);
    const rows = await client.execute(
      "SELECT department, page_id, field_key, new_value FROM deck_change_history"
    );
    expect(rows.rows).toEqual([
      expect.objectContaining({
        department: "oficinas",
        page_id: "page-1",
        field_key: "overrides.total:S35",
        new_value: "99",
      }),
    ]);
  });
});
