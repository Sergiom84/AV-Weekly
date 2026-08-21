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
