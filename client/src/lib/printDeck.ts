const PRINT_TITLE_FALLBACK_MS = 1_000;

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

/** Filename suggested by the browser print dialog through document.title. */
export function formatPdfPrintTitle(moduleName: string, date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).formatToParts(date);
  const readPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value ?? "";

  return `${moduleName}_informe_${readPart("day")}_${readPart("month")}_${readPart("year")}`;
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
