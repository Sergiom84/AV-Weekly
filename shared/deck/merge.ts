import type { DeckState } from "./core.ts";

/**
 * Brings a stored deck up to date with the pages a default deck declares.
 *
 * The deck is persisted whole, so a copy saved before a page existed would
 * never show it again. This adds only what is missing, matched by id, and
 * never rewrites a page that is already stored: titles, bodies, images,
 * visibility, overrides and the order the user chose survive, and pages the
 * user added by hand stay where they are.
 *
 * A missing page is inserted right after the nearest preceding reference page
 * the stored deck still has, so it lands in its intended slot without assuming
 * the rest of the deck kept the default order. When none of its predecessors
 * survive it goes to the front. It is never placed after the closing slide; a
 * missing closing page is appended after the last surviving predecessor.
 *
 * `migratePage` runs first so a module can keep a one-off field migration
 * (for example an old seeded title) without forking the insert algorithm.
 * After that, only the `kind` is realigned from the reference: a stored id
 * whose spec was promoted from a placeholder still has to render as the new
 * page, but the rest of the stored page remains the user's.
 */
export function mergeDeckTemplate<TDeck extends DeckState>(
  deck: TDeck,
  reference: readonly TDeck["pages"][number][],
  migratePage?: (page: TDeck["pages"][number]) => TDeck["pages"][number]
): TDeck {
  type Page = TDeck["pages"][number];

  const kinds = new Map(reference.map((page) => [page.id, page.kind]));
  const pages: Page[] = deck.pages.map((page) => {
    const migrated = migratePage ? migratePage(page) : page;
    const kind = kinds.get(migrated.id);

    return kind && kind !== migrated.kind ? { ...migrated, kind } : migrated;
  });

  const present = new Set(pages.map((page) => page.id));

  reference.forEach((refPage, refIndex) => {
    if (present.has(refPage.id)) {
      return;
    }

    let insertAt = 0;

    for (let i = refIndex - 1; i >= 0; i -= 1) {
      const anchor = pages.findIndex((page) => page.id === reference[i].id);

      if (anchor !== -1) {
        insertAt = anchor + 1;
        break;
      }
    }

    if (refPage.kind !== "closing") {
      const closingIndex = pages.findIndex((page) => page.kind === "closing");

      if (closingIndex !== -1 && insertAt > closingIndex) {
        insertAt = closingIndex;
      }
    }

    pages.splice(insertAt, 0, refPage);
    present.add(refPage.id);
  });

  return { ...deck, pages };
}
