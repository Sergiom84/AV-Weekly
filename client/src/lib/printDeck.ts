import {
  madridDateParts,
  reportFileBaseName,
} from "@shared/deck/pdf-download";

/**
 * Safety net for a browser that never fires `afterprint`, not a timer the
 * normal path relies on.
 *
 * It used to be one second, which restored the tab title while the print
 * preview was still open: the dialog then spooled the job under the restored
 * title instead of the report's. Five minutes is longer than anyone leaves the
 * preview open and still bounds how long a stale title can linger.
 */
const PRINT_TITLE_FALLBACK_MS = 300_000;

interface PdfPrintEnvironment {
  getTitle: () => string;
  setTitle: (title: string) => void;
  print: () => void;
  addAfterPrintListener: (listener: () => void) => void;
  removeAfterPrintListener: (listener: () => void) => void;
  setFallback: (listener: () => void, delayMs: number) => number;
  clearFallback: (timerId: number) => void;
}

function browserPrintEnvironment(): PdfPrintEnvironment {
  return {
    getTitle: () => document.title,
    setTitle: title => {
      document.title = title;
    },
    print: () => window.print(),
    addAfterPrintListener: listener =>
      window.addEventListener("afterprint", listener),
    removeAfterPrintListener: listener =>
      window.removeEventListener("afterprint", listener),
    setFallback: (listener, delayMs) => window.setTimeout(listener, delayMs),
    clearFallback: timerId => window.clearTimeout(timerId),
  };
}

/**
 * Filename suggested by the browser print dialog through document.title.
 *
 * Same shape as the download the server names, so the two export buttons do
 * not produce differently named files. It is only a suggestion: the print
 * driver has the last word, and "Microsoft Print to PDF" ignores it.
 */
export function formatPdfPrintTitle(moduleName: string, date = new Date()): string {
  const { day, month, year } = madridDateParts(date);

  return reportFileBaseName(moduleName, day, month, year);
}

export function printDeckAsPdf(
  moduleName: string,
  date = new Date(),
  environment = browserPrintEnvironment(),
): void {
  const originalTitle = environment.getTitle();
  const printTitle = formatPdfPrintTitle(moduleName, date);
  let restored = false;
  let fallbackTimer: number | null = null;

  const restoreTitle = () => {
    if (restored) {
      return;
    }

    restored = true;
    environment.removeAfterPrintListener(restoreTitle);
    if (fallbackTimer !== null) {
      environment.clearFallback(fallbackTimer);
    }

    // Do not overwrite a title changed by other navigation while printing.
    if (environment.getTitle() === printTitle) {
      environment.setTitle(originalTitle);
    }
  };

  environment.addAfterPrintListener(restoreTitle);
  environment.setTitle(printTitle);

  try {
    environment.print();
    if (!restored) {
      fallbackTimer = environment.setFallback(
        restoreTitle,
        PRINT_TITLE_FALLBACK_MS,
      );
    }
  } catch (error) {
    restoreTitle();
    throw error;
  }
}

export type { PdfPrintEnvironment };
