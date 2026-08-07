import { useCallback, useEffect, useRef, useState } from "react";
import type { DeckPage } from "@shared/deck/core";

/**
 * Deck state and persistence for any report module.
 *
 * Every module talks to the same three endpoints under its own base:
 * `GET base` returns the payload, `PUT base/deck` stores the deck and
 * `POST base/reset-deck` drops the manual edits. Uploads post a workbook to a
 * module endpoint and answer with the whole payload again, so the client
 * rehydrates from the response instead of refetching.
 *
 * The deck is saved with an 800 ms debounce: typing in a slide must not fire a
 * request per keystroke.
 */

const SAVE_DEBOUNCE_MS = 800;

export interface DeckActionResult {
  success: boolean;
  error?: string;
}

/** Minimal deck shape the hook stores, whatever the module page type is. */
export interface DeckStateOf<TPage> {
  pages: TPage[];
  updatedAt: string | null;
}

export interface DeckDataOptions<TPage, TData> {
  /** API base of the module, e.g. `/api/informe`. */
  apiBase: string;
  emptyData: () => TData;
  /** Merges the server payload into the data currently held. */
  readData: (payload: unknown, current: TData) => TData;
  /**
   * Deck used when the API answers with an error, so a module whose server
   * side is not up yet still renders its default pages.
   */
  fallbackDeck?: () => DeckStateOf<TPage>;
  messages: {
    load: string;
    save: string;
    reset: string;
  };
}

async function readErrorMessage(response: Response, fallback: string) {
  const contentType = response.headers.get("Content-Type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      const body = await response.json();

      if (body && typeof body.error === "string" && body.error.trim()) {
        return body.error.trim();
      }
    } catch {
      // Ignore malformed/empty JSON bodies and fall back to text/default.
    }
  }

  try {
    const text = await response.text();

    if (text.trim()) {
      return text.trim().slice(0, 200);
    }
  } catch {
    // Ignore read errors and fall back to the provided message.
  }

  return fallback;
}

function readDeck<TPage>(payload: unknown): DeckStateOf<TPage> | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const deck = (payload as { deck?: unknown }).deck;

  if (deck && typeof deck === "object" && Array.isArray((deck as DeckStateOf<TPage>).pages)) {
    return deck as DeckStateOf<TPage>;
  }

  return null;
}

export function useDeckData<TPage extends DeckPage<string, string>, TData>(
  options: DeckDataOptions<TPage, TData>
) {
  const { apiBase, emptyData, readData, fallbackDeck, messages } = options;

  const [deck, setDeck] = useState<DeckStateOf<TPage> | null>(null);
  const [data, setData] = useState<TData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pendingDeckRef = useRef<DeckStateOf<TPage> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;

      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const applyPayload = useCallback(
    (payload: unknown) => {
      const nextDeck = readDeck<TPage>(payload);

      if (nextDeck) {
        setDeck(nextDeck);
      }

      setData((current) => readData(payload, current));
    },
    [readData]
  );

  // The initial load must run once per module, not on every render: the caller
  // builds `readData` and `messages` inline, so their identity is not stable.
  const loadRef = useRef({ applyPayload, fallbackDeck, message: messages.load });
  loadRef.current = { applyPayload, fallbackDeck, message: messages.load };

  useEffect(() => {
    const load = async () => {
      const { applyPayload: apply, fallbackDeck: fallback, message } = loadRef.current;

      try {
        const res = await fetch(apiBase);

        if (!res.ok) {
          setError(await readErrorMessage(res, message));

          if (fallback) {
            setDeck(fallback());
          }

          return;
        }

        const body = await res.json();

        if (body) {
          apply(body);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : message);

        if (fallback) {
          setDeck(fallback());
        }
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [apiBase]);

  const persistDeck = useCallback(
    async (next: DeckStateOf<TPage>): Promise<DeckActionResult> => {
      setSaving(true);

      try {
        const res = await fetch(`${apiBase}/deck`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deck: next }),
        });

        if (!res.ok) {
          throw new Error(await readErrorMessage(res, messages.save));
        }

        const contentType = res.headers.get("Content-Type") ?? "";

        if (contentType.includes("application/json")) {
          const body = await res.json();

          if (body && typeof body === "object" && "updatedAt" in body && mountedRef.current) {
            setDeck((current) =>
              current
                ? { ...current, updatedAt: (body as DeckStateOf<TPage>).updatedAt }
                : current
            );
          }
        }

        if (mountedRef.current) {
          setError(null);
        }

        return { success: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : messages.save;

        if (mountedRef.current) {
          setError(message);
        }

        return { success: false, error: message };
      } finally {
        if (mountedRef.current) {
          setSaving(false);
        }
      }
    },
    [apiBase, messages.save]
  );

  const scheduleSave = useCallback(
    (next: DeckStateOf<TPage>) => {
      pendingDeckRef.current = next;

      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const pending = pendingDeckRef.current;
        pendingDeckRef.current = null;

        if (pending) {
          void persistDeck(pending);
        }
      }, SAVE_DEBOUNCE_MS);
    },
    [persistDeck]
  );

  const saveNow = useCallback(async (): Promise<DeckActionResult> => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const pending = pendingDeckRef.current;
    pendingDeckRef.current = null;

    if (!pending) {
      return { success: true };
    }

    return persistDeck(pending);
  }, [persistDeck]);

  const updatePage = useCallback(
    (pageId: string, patch: Partial<TPage>) => {
      setDeck((current) => {
        if (!current) {
          return current;
        }

        const next: DeckStateOf<TPage> = {
          ...current,
          pages: current.pages.map((page) =>
            page.id === pageId ? { ...page, ...patch } : page
          ),
        };

        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  const reorderPages = useCallback(
    (ids: string[]) => {
      setDeck((current) => {
        if (!current) {
          return current;
        }

        const byId = new Map(current.pages.map((page) => [page.id, page]));
        const ordered: TPage[] = [];

        for (const id of ids) {
          const page = byId.get(id);

          if (page) {
            ordered.push(page);
            byId.delete(id);
          }
        }

        for (const page of current.pages) {
          if (byId.has(page.id)) {
            ordered.push(page);
          }
        }

        const next: DeckStateOf<TPage> = { ...current, pages: ordered };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  const upload = useCallback(
    async (endpoint: string, file: File, fallback: string): Promise<DeckActionResult> => {
      setLoading(true);
      setError(null);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch(endpoint, { method: "POST", body: formData });

        if (!res.ok) {
          throw new Error(await readErrorMessage(res, fallback));
        }

        const contentType = res.headers.get("Content-Type") ?? "";

        if (!contentType.includes("application/json")) {
          throw new Error("El servidor devolvió una respuesta inesperada (no JSON).");
        }

        const body = await res.json();

        if (mountedRef.current) {
          applyPayload(body);
        }

        return { success: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : fallback;

        if (mountedRef.current) {
          setError(message);
        }

        return { success: false, error: message };
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    },
    [applyPayload]
  );

  const resetDeck = useCallback(async (): Promise<DeckActionResult> => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingDeckRef.current = null;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`${apiBase}/reset-deck`, { method: "POST" });

      if (!res.ok) {
        throw new Error(await readErrorMessage(res, messages.reset));
      }

      const body = await res.json();

      if (mountedRef.current && body && typeof body === "object") {
        if ("deck" in body) {
          applyPayload(body);
        } else if ("pages" in body) {
          setDeck(body as DeckStateOf<TPage>);
        }
      }

      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : messages.reset;

      if (mountedRef.current) {
        setError(message);
      }

      return { success: false, error: message };
    } finally {
      if (mountedRef.current) {
        setSaving(false);
      }
    }
  }, [apiBase, applyPayload, messages.reset]);

  return {
    deck,
    data,
    loading,
    saving,
    error,
    upload,
    updatePage,
    reorderPages,
    resetDeck,
    saveNow,
  };
}
