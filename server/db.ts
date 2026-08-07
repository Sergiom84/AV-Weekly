import { createClient } from '@libsql/client';

const url = process.env.URL_TURSO ?? 'file:./data/av-weekly.db';

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
  `);
}
