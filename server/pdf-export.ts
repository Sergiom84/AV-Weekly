import type { Request, Response } from "express";

export type DeckPdfRenderer = (
  origin: string,
  path: string,
  signal: AbortSignal
) => Promise<Buffer>;

export interface DeckPdfRequest {
  origin: string;
  path: string;
  department: string;
}

/** Just enough of an Express request to resolve the origin, so this stays testable. */
export interface OriginHeaders {
  get: (name: string) => string | undefined;
  protocol: string;
}

/**
 * Origin the headless browser must open to find the deck.
 *
 * In production one process serves both the API and the built client, so its
 * own port is the right answer. In development they are two: Vite serves the
 * deck on `CLIENT_PORT` and this API answers on `PORT`. Pointing the renderer
 * at the API port there loads a page with no slides on it, and the export dies
 * on `Waiting for selector 'main section[id^="slide-"]'` — which is what
 * happened to every request that carried no `Referer`: a curl, a script, or the
 * endpoint opened straight in a tab.
 *
 * So the request's own headers are trusted, since a browser knows where the
 * user is, but never when they point back at this API: that answer is known to
 * be wrong in development, and the client port is the only origin that serves
 * the deck.
 */
export function resolveClientOrigin(
  req: OriginHeaders,
  env: Readonly<Record<string, string | undefined>> = process.env
): string {
  if (env.NODE_ENV === "production") {
    return `http://127.0.0.1:${env.PORT ?? 3000}`;
  }

  const apiPort = String(env.PORT ?? 3501);

  for (const header of [req.get("referer"), req.get("origin"), req.get("host")]) {
    if (!header) {
      continue;
    }

    try {
      const url = new URL(
        header.includes("://") ? header : `${req.protocol}://${header}`
      );

      if (url.port !== apiPort) {
        return url.origin;
      }
    } catch {
      // Malformed header: fall through to the next candidate.
    }
  }

  return `http://127.0.0.1:${env.CLIENT_PORT ?? 3500}`;
}

/** Download name shared by every department, dated in the user's business timezone. */
export function reportPdfFilename(
  department: string,
  date: Date = new Date()
): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value ?? "";
  const safeDepartment = department
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return `Informe_${safeDepartment}_${value("day")}_${value("month")}_${value("year")}.pdf`;
}

/**
 * Creates one shared PDF sender. Every report must use the same instance so a
 * 512 MB Render service never launches two Chromium processes at once.
 */
export function createDeckPdfSender(renderer: DeckPdfRenderer) {
  let inProgress = false;

  return async function sendDeckPdf(
    req: Request,
    res: Response,
    options: DeckPdfRequest
  ): Promise<void> {
    if (inProgress) {
      res.setHeader("Retry-After", "120");
      res.status(429).json({
        code: "PDF_GENERATION_IN_PROGRESS",
        error:
          "Ya se está generando un PDF. Inténtalo de nuevo cuando termine.",
      });
      return;
    }

    inProgress = true;
    const controller = new AbortController();
    const abortOnDisconnect = () => {
      if (!res.writableEnded) {
        controller.abort();
      }
    };
    res.once("close", abortOnDisconnect);

    try {
      const pdf = await renderer(
        options.origin,
        options.path,
        controller.signal
      );

      if (controller.signal.aborted || res.destroyed) {
        return;
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${reportPdfFilename(options.department)}"`
      );
      res.send(pdf);
    } catch (err) {
      if (controller.signal.aborted || res.destroyed) {
        return;
      }

      const message =
        err instanceof Error ? err.message : "No se pudo generar el PDF";
      res.status(500).json({ error: message });
    } finally {
      res.off("close", abortOnDisconnect);
      inProgress = false;
    }
  };
}
