import { createClient } from '@libsql/client';
import fs from "node:fs";
import path from "node:path";

// Keep all local state next to the application. APP_DATA_DIR is useful when
// the app is launched from a shortcut or a shared installation folder.
const localDataDir = path.resolve(process.env.APP_DATA_DIR ?? path.join(process.cwd(), "data"));
fs.mkdirSync(localDataDir, { recursive: true });

const url = process.env.URL_TURSO ?? `file:${path.join(localDataDir, "av-weekly.db")}`;

export const client = createClient(
  url.startsWith('file:') ? { url } : { url, authToken: process.env.TOKEN_TURSO }
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
  `);
}
