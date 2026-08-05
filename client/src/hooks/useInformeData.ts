import { useCallback, useEffect, useRef, useState } from "react";
import {
  emptyMonthlyDataset,
  emptyWeeklyDataset,
} from "@shared/informe";
import type {
  DeckPage,
  DeckState,
  InformeMonthlyDataset,
  InformePayload,
  InformeWeeklyDataset,
} from "@shared/informe";

export type {
  AutoVisibility,
  CellOverrides,
  DeckPage,
  DeckPageKind,
  DeckState,
  InformeMonthlyDataset,
  InformePayload,
  InformeWeeklyDataset,
  SupportType,
  WeekSelection,
} from "@shared/informe";

const SAVE_DEBOUNCE_MS = 800;

export interface InformeActionResult {
  success: boolean;
  error?: string;
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

export function useInformeData() {
  const [deck, setDeck] = useState<DeckState | null>(null);
  const [weekly, setWeekly] = useState<InformeWeeklyDataset>(emptyWeeklyDataset);
  const [monthly, setMonthly] = useState<InformeMonthlyDataset>(emptyMonthlyDataset);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pendingDeckRef = useRef<DeckState | null>(null);
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

  const applyPayload = useCallback((payload: InformePayload) => {
    if (payload.deck) {
      setDeck(payload.deck);
    }
    if (payload.weekly) {
      setWeekly(payload.weekly);
    }
    if (payload.monthly) {
      setMonthly(payload.monthly);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/informe");

        if (!res.ok) {
          setError(await readErrorMessage(res, "No se pudo cargar el informe"));
          return;
        }

        const body = (await res.json()) as InformePayload;

        if (body) {
          applyPayload(body);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cargar el informe");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [applyPayload]);

  const persistDeck = useCallback(async (next: DeckState): Promise<InformeActionResult> => {
    setSaving(true);

    try {
      const res = await fetch("/api/informe/deck", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deck: next }),
      });

      if (!res.ok) {
        throw new Error(await readErrorMessage(res, "No se pudo guardar el informe"));
      }

      const contentType = res.headers.get("Content-Type") ?? "";

      if (contentType.includes("application/json")) {
        const body = await res.json();

        if (body && typeof body === "object" && "updatedAt" in body && mountedRef.current) {
          setDeck((current) =>
            current ? { ...current, updatedAt: (body as DeckState).updatedAt } : current
          );
        }
      }

      if (mountedRef.current) {
        setError(null);
      }

      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo guardar el informe";

      if (mountedRef.current) {
        setError(message);
      }

      return { success: false, error: message };
    } finally {
      if (mountedRef.current) {
        setSaving(false);
      }
    }
  }, []);

  const scheduleSave = useCallback(
    (next: DeckState) => {
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

  const saveNow = useCallback(async (): Promise<InformeActionResult> => {
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
    (pageId: string, patch: Partial<DeckPage>) => {
      setDeck((current) => {
        if (!current) {
          return current;
        }

        const next: DeckState = {
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
        const ordered: DeckPage[] = [];

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

        const next: DeckState = { ...current, pages: ordered };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  const upload = useCallback(
    async (endpoint: string, file: File, fallback: string): Promise<InformeActionResult> => {
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

        const body = (await res.json()) as InformePayload;

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

  const uploadWeekly = useCallback(
    (file: File) =>
      upload("/api/informe/upload/semanal", file, "No se pudo cargar la plantilla semanal"),
    [upload]
  );

  const uploadMonthly = useCallback(
    (file: File) =>
      upload("/api/informe/upload/mensual", file, "No se pudo cargar las resueltas del mes"),
    [upload]
  );

  const resetDeck = useCallback(async (): Promise<InformeActionResult> => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingDeckRef.current = null;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/informe/reset-deck", { method: "POST" });

      if (!res.ok) {
        throw new Error(await readErrorMessage(res, "No se pudo restablecer el informe"));
      }

      const body = await res.json();

      if (mountedRef.current && body && typeof body === "object") {
        if ("deck" in body) {
          applyPayload(body as InformePayload);
        } else if ("pages" in body) {
          setDeck(body as DeckState);
        }
      }

      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo restablecer el informe";

      if (mountedRef.current) {
        setError(message);
      }

      return { success: false, error: message };
    } finally {
      if (mountedRef.current) {
        setSaving(false);
      }
    }
  }, [applyPayload]);

  return {
    deck,
    weekly,
    monthly,
    loading,
    saving,
    error,
    uploadWeekly,
    uploadMonthly,
    updatePage,
    reorderPages,
    resetDeck,
    saveNow,
  };
}
