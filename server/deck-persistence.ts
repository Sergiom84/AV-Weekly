import type { DeckPage } from "../shared/deck/core.ts";
import { client } from "./db.js";
import {
  deckChanges,
  type DeckChange,
  type DeckDepartment,
} from "./deck-change-history.js";

interface GenericDeck<TPage extends DeckPage<string, string>> {
  pages: TPage[];
  updatedAt: string | null;
}

const DECK_TABLE: Record<DeckDepartment, string> = {
  av: "informe_deck",
  informatica: "informatica_deck",
  aga: "aga_deck",
  oficinas: "oficinas_deck",
};

function serialized(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

export interface PersistedDeckResult<TPage extends DeckPage<string, string>> {
  deck: GenericDeck<TPage>;
  changes: DeckChange[];
}

/** Atomically stores the deck and one immutable row per changed field. */
export async function persistDeckWithHistory<
  TPage extends DeckPage<string, string>,
>(
  department: DeckDepartment,
  incoming: GenericDeck<TPage>
): Promise<PersistedDeckResult<TPage>> {
  const table = DECK_TABLE[department];
  const previousResult = await client.execute(
    `SELECT data FROM ${table} WHERE id = 1`
  );
  let previousPages: TPage[] = [];

  if (previousResult.rows.length > 0) {
    try {
      const previous = JSON.parse(
        String(previousResult.rows[0].data)
      ) as GenericDeck<TPage>;
      previousPages = Array.isArray(previous.pages) ? previous.pages : [];
    } catch {
      previousPages = [];
    }
  }

  const updatedAt = new Date().toISOString();
  const deck: GenericDeck<TPage> = { pages: incoming.pages, updatedAt };
  const changes = deckChanges(
    department,
    previousPages as Array<TPage & Record<string, unknown>>,
    deck.pages as Array<TPage & Record<string, unknown>>
  );
  const statements = [
    {
      sql: `INSERT INTO ${table} (id, data, updated_at) VALUES (1, ?, datetime('now'))
            ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      args: [JSON.stringify(deck)],
    },
    ...changes.map(change => ({
      sql: `INSERT INTO deck_change_history
              (department, page_id, slide_number, page_title, field_key, field_label, previous_value, new_value)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        change.department,
        change.pageId,
        change.slideNumber,
        change.pageTitle,
        change.fieldKey,
        change.fieldLabel,
        serialized(change.previousValue),
        serialized(change.newValue),
      ],
    })),
  ];

  await client.batch(statements, "write");
  return { deck, changes };
}
