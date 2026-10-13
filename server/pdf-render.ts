import puppeteer from "puppeteer";
import { PDFDocument } from "pdf-lib";
import type { DeckPdfRenderer } from "./pdf-export.js";

/** Append vector pages in source order, without rasterising slides. */
export async function appendPdfPages(target: PDFDocument, bytes: Uint8Array) {
  const source = await PDFDocument.load(bytes);
  const pages = await target.copyPages(source, source.getPageIndices());
  for (const page of pages) target.addPage(page);
}

export function createDeckPdfRenderer(
  credentials: () => { username: string; password: string } | null
): DeckPdfRenderer {
  return async (origin, path, signal, cookie) => {
    const browser = await puppeteer.launch({
      headless: "shell",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });
    let closePromise: Promise<void> | null = null;
    const closeBrowser = () => (closePromise ??= browser.close());
    const abort = () => {
      void closeBrowser().catch(() => undefined);
    };
    signal.addEventListener("abort", abort, { once: true });

    try {
      signal.throwIfAborted();
      if (cookie) {
        await browser.setCookie({
          ...cookie,
          domain: new URL(origin).hostname,
          path: "/",
        });
      }
      const page = await browser.newPage();
      page.setDefaultTimeout(30_000);
      const auth = credentials();
      if (auth) await page.authenticate(auth);
      await page.setViewport({ width: 1600, height: 900 });
      // Apply print layout before mounting charts, so their first measurement
      // is already the final canvas. No editor or other slide is mounted.
      await page.emulateMediaType("print");
      const url = new URL(path, origin);
      url.searchParams.set("pdf", "slides");
      await page.goto(url.href, { waitUntil: "domcontentloaded" });
      await page.waitForSelector('[data-pdf-ready="true"]');
      const { count, error } = await page.$eval("[data-pdf-ready]", node => ({
        count: Number(node.getAttribute("data-pdf-count")),
        error: node.getAttribute("data-pdf-error"),
      }));
      if (error) throw new Error(error);
      if (!Number.isInteger(count) || count < 1)
        throw new Error("El informe no tiene diapositivas visibles.");

      const result = await PDFDocument.create();
      for (let index = 0; index < count; index++) {
        signal.throwIfAborted();
        await page.evaluate(
          index =>
            window.dispatchEvent(
              new CustomEvent("avw:pdf-slide", { detail: index })
            ),
          index
        );
        await page.waitForSelector(
          `[data-pdf-slide="${index}"] section[data-deck-slide]`
        );
        await page.evaluate(async () => {
          await document.fonts.ready;
          await Promise.all(
            Array.from(document.images, image =>
              image.decode().catch(() => undefined)
            )
          );
        });
        // ResizeObserver, chart layout and table fitting settle after mount.
        await new Promise(resolve => setTimeout(resolve, 600));
        const bytes = await page.pdf({
          preferCSSPageSize: true,
          printBackground: true,
          tagged: false,
          timeout: 30_000,
          margin: { top: 0, right: 0, bottom: 0, left: 0 },
        });
        await appendPdfPages(result, bytes);
        // Unmount the slide immediately, including its decoded images.
        await page.evaluate(() =>
          window.dispatchEvent(
            new CustomEvent("avw:pdf-slide", { detail: null })
          )
        );
      }
      return Buffer.from(await result.save());
    } finally {
      signal.removeEventListener("abort", abort);
      await closeBrowser();
    }
  };
}
