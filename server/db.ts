import { createClient } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";
import { resolveDatabaseUrl } from "./db-config.js";

// Keep all local state next to the application. APP_DATA_DIR is useful when
// the app is launched from a shortcut or a shared installation folder.
const localDataDir = path.resolve(
  process.env.APP_DATA_DIR ?? path.join(process.cwd(), "data")
);
fs.mkdirSync(localDataDir, { recursive: true });

const url = resolveDatabaseUrl(process.env, localDataDir);

export const client = createClient(
  url.startsWith("file:")
    ? { url }
    : { url, authToken: process.env.TOKEN_TURSO }
);

export async function initDb() {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS informe_deck (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS informe_weekly (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL,
      source_file TEXT,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS informe_monthly (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL,
      source_file TEXT,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Resolution detail accumulated week by week, from each weekly upload.
    CREATE TABLE IF NOT EXISTS informe_resolution_history (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Previous-year weekly totals per support type, for the comparison series.
    CREATE TABLE IF NOT EXISTS informe_weekly_history (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL,
      source_file TEXT,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Informatica module. Separate singletons from the informe_* tables above:
    -- the two decks are independent reports and never share a row.
    CREATE TABLE IF NOT EXISTS informatica_deck (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Whole flat workbook as imported, one JSON payload per upload.
    CREATE TABLE IF NOT EXISTS informatica_dataset (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL,
      source_file TEXT,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Published monthly figures the weekly extracts cannot reproduce, kept in
    -- their own table for the same reason as the building master: an import
    -- with complete scope replaces informatica_dataset wholesale, so anything
    -- stored inside it would be wiped by the next upload. Seeded once from
    -- server/assets/informatica-historico.tsv.
    CREATE TABLE IF NOT EXISTS informatica_historico (
      serie TEXT NOT NULL,
      mes TEXT NOT NULL,
      total INTEGER NOT NULL,
      source_file TEXT,
      imported_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (serie, mes)
    );

    -- Authoritative Edificio -> Ubicacion master shared by importers. Conflicts
    -- are preserved as separate rows so the resolver can refuse ambiguity.
    CREATE TABLE IF NOT EXISTS building_location_master (
      normalized_building TEXT NOT NULL,
      source_building TEXT NOT NULL,
      location TEXT NOT NULL,
      source_file TEXT,
      imported_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (normalized_building, location)
    );

    -- Aliases are learned only from rows whose address matched the master.
    -- Multiple locations are preserved and therefore become non-matches.
    CREATE TABLE IF NOT EXISTS building_location_alias (
      normalized_alias TEXT NOT NULL,
      source_alias TEXT NOT NULL,
      location TEXT NOT NULL,
      observed_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (normalized_alias, location)
    );

    -- AGA module (weekly PetMicro report). Same singleton pattern as the
    -- informatica_* tables: the decks are independent reports.
    CREATE TABLE IF NOT EXISTS aga_deck (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Weekly aggregates accumulated across uploads: the GPS export only ever
    -- carries two weeks and the charts need the whole history.
    CREATE TABLE IF NOT EXISTS aga_dataset (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL,
      source_file TEXT,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Oficinas module (weekly Soporte Oficinas report). Same singleton pattern
    -- as the other modules: the decks are independent reports.
    CREATE TABLE IF NOT EXISTS oficinas_deck (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Weekly figures accumulated across uploads, plus the office master seeded
    -- by scripts/importar-maestro-oficinas.mjs. Each upload folds in the weeks
    -- it carries; the charts need the whole year.
    CREATE TABLE IF NOT EXISTS oficinas_dataset (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL,
      source_file TEXT,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Images attached to notes pages. Keeping the bytes in libSQL makes them
    -- survive Render restarts and avoids a second storage provider.
    CREATE TABLE IF NOT EXISTS uploaded_asset (
      id TEXT PRIMARY KEY,
      mime_type TEXT NOT NULL,
      data BLOB NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Immutable audit trail of every persisted manual deck edit.
    CREATE TABLE IF NOT EXISTS deck_change_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      department TEXT NOT NULL,
      page_id TEXT NOT NULL,
      slide_number INTEGER,
      page_title TEXT NOT NULL,
      field_key TEXT NOT NULL,
      field_label TEXT NOT NULL,
      previous_value TEXT,
      new_value TEXT,
      changed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS deck_change_history_department_date
      ON deck_change_history (department, changed_at DESC);
  `);
}
