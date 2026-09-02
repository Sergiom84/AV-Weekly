import { describe, expect, it, vi } from "vitest";
import {
  formatPdfPrintTitle,
  printDeckAsPdf,
  type PdfPrintEnvironment,
} from "./printDeck";

function createEnvironment() {
  let title = "Weekly";
  let afterPrint: (() => void) | null = null;
  let fallback: (() => void) | null = null;

  const environment: PdfPrintEnvironment = {
    getTitle: () => title,
    setTitle: value => {
      title = value;
    },
    print: vi.fn(),
    addAfterPrintListener: listener => {
      afterPrint = listener;
    },
    removeAfterPrintListener: vi.fn(),
    setFallback: listener => {
      fallback = listener;
      return 1;
    },
    clearFallback: vi.fn(),
  };

  return {
    environment,
    getTitle: () => title,
    fireAfterPrint: () => afterPrint?.(),
    fireFallback: () => fallback?.(),
  };
}

describe("PDF print title", () => {
  it("formats the module and Madrid calendar date", () => {
    const utcBeforeMadridMidnight = new Date("2026-09-02T22:30:00.000Z");

    expect(formatPdfPrintTitle("AGA", utcBeforeMadridMidnight)).toBe(
      "AGA_informe_03_09_26",
    );
  });

  it("uses the temporary title while printing and restores it afterprint", () => {
    const context = createEnvironment();
    const date = new Date("2026-09-02T10:00:00.000Z");
    context.environment.print = vi.fn(() => {
      expect(context.getTitle()).toBe("Oficinas_informe_02_09_26");
    });

    printDeckAsPdf("Oficinas", date, context.environment);
    context.fireAfterPrint();

    expect(context.getTitle()).toBe("Weekly");
  });

  it("restores the title through the fallback when afterprint is absent", () => {
    const context = createEnvironment();

    printDeckAsPdf(
      "AV",
      new Date("2026-09-02T10:00:00.000Z"),
      context.environment,
    );
    context.fireFallback();

    expect(context.getTitle()).toBe("Weekly");
  });

  it("restores the title if printing throws", () => {
    const context = createEnvironment();
    context.environment.print = () => {
      throw new Error("print unavailable");
    };

    expect(() =>
      printDeckAsPdf(
        "Informática",
        new Date("2026-09-02T10:00:00.000Z"),
        context.environment,
      ),
    ).toThrow("print unavailable");
    expect(context.getTitle()).toBe("Weekly");
  });
});
