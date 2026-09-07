import type { Request, Response } from "express";
import {
  madridDateParts,
  reportFileBaseName,
} from "../shared/deck/pdf-download.ts";

export type DeckPdfRenderer = (
  origin: string,
  path: string,
  signal: AbortSignal
) => Promise<Buffer>;

export interface DeckPdfRequest {
  origin: string;
  path: string;
  department: string;
  /**
   * Date the download is named after. Defaults to today, which is only right
   * while the report is exported the same day it is imported; a module that
   * knows the period it is showing passes that instead.
   */
  date?: Date;
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

/**
 * The date a download is named after, taken from the periods the deck carries.
 *
 * Midday UTC, so rendering it in Madrid cannot land on the day before or after
 * across a daylight-saving boundary. Anything that is not an ISO date is
 * ignored rather than parsed loosely: a bad key would name the file after
 * 1970.
 */
export function latestReportDate(
  weeks: readonly string[]
): Date | undefined {
  const latest = weeks
    .filter(week => /^\d{4}-\d{2}-\d{2}$/.test(week))
    .sort()
    .at(-1);

  return latest ? new Date(`${latest}T12:00:00Z`) : undefined;
}

/**
 * Download name shared by every department, dated in the user's business
 * timezone: `AGA_07-09-26_Informe.pdf`.
 *
 * Department first, because that is how the files are filed and sorted. The
 * date is written with hyphens: the day-month-year separator the reports use
 * on paper is a slash, and a slash is a path separator in every filesystem.
 */
export function reportPdfFilename(
  department: string,
  date: Date = new Date()
): string {
  const { day, month, year } = madridDateParts(date);

  return `${reportFileBaseName(department, day, month, year)}.pdf`;
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
        `attachment; filename="${reportPdfFilename(options.department, options.date)}"`
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
