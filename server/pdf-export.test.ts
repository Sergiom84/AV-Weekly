import type { Server } from "node:http";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { filenameFromDisposition } from "../shared/deck/pdf-download.ts";
import {
  createDeckPdfSender,
  latestReportDate,
  reportPdfFilename,
  resolveClientOrigin,
  type DeckPdfRenderer,
} from "./pdf-export.js";

/** A request carrying only the headers the origin resolution reads. */
function headers(values: Record<string, string>) {
  return {
    protocol: "http",
    get: (name: string) => values[name.toLowerCase()],
  };
}

describe("origen que abre el renderizador", () => {
  const dev = { PORT: "3501", CLIENT_PORT: "3500" };

  it("usa su propio puerto en producción, donde sirve el cliente compilado", () => {
    expect(
      resolveClientOrigin(headers({}), { NODE_ENV: "production", PORT: "3000" })
    ).toBe("http://127.0.0.1:3000");
  });

  it("sigue el Referer del navegador cuando lo hay", () => {
    expect(
      resolveClientOrigin(
        headers({ referer: "http://localhost:3500/oficinas" }),
        dev
      )
    ).toBe("http://localhost:3500");
  });

  it("cae al puerto del cliente cuando la petición no trae cabeceras", () => {
    // Un curl o un script: antes devolvía el host de la API, que en desarrollo
    // no sirve el deck, y la exportación moría esperando las diapositivas.
    expect(resolveClientOrigin(headers({}), dev)).toBe("http://127.0.0.1:3500");
  });

  it("ignora una cabecera que apunta a la propia API", () => {
    // El endpoint abierto en una pestaña, que es lo primero que uno prueba.
    expect(
      resolveClientOrigin(
        headers({
          referer: "http://localhost:3501/api/oficinas/pdf",
          host: "localhost:3501",
        }),
        dev
      )
    ).toBe("http://127.0.0.1:3500");
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function listenWith(renderer: DeckPdfRenderer) {
  const app = express();
  const send = createDeckPdfSender(renderer);
  app.get("/pdf", (req, res) => {
    void send(req, res, {
      origin: "http://127.0.0.1",
      path: "/av",
      department: "AV",
    });
  });

  const server = await new Promise<Server>(resolve => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not expose a TCP port");
  }

  return { server, url: `http://127.0.0.1:${address.port}/pdf` };
}

describe("PDF export coordination", () => {
  const servers: Server[] = [];

  afterEach(async () => {
    await Promise.all(
      servers
        .splice(0)
        .map(
          server =>
            new Promise<void>((resolve, reject) =>
              server.close(error => (error ? reject(error) : resolve()))
            )
        )
    );
  });

  it("allows only one PDF render at a time and releases the slot", async () => {
    const firstRender = deferred<Buffer>();
    const firstRenderStarted = deferred<void>();
    let calls = 0;
    const { server, url } = await listenWith(async () => {
      calls += 1;
      firstRenderStarted.resolve();
      return calls === 1 ? firstRender.promise : Buffer.from("%PDF-next");
    });
    servers.push(server);

    const first = fetch(url);
    await firstRenderStarted.promise;
    const concurrent = await fetch(url);

    expect(concurrent.status).toBe(429);
    expect(concurrent.headers.get("retry-after")).toBe("120");
    expect(await concurrent.json()).toMatchObject({
      code: "PDF_GENERATION_IN_PROGRESS",
    });
    expect(calls).toBe(1);

    firstRender.resolve(Buffer.from("%PDF-first"));
    const firstResponse = await first;
    expect(firstResponse.status).toBe(200);
    expect(firstResponse.headers.get("content-disposition")).toMatch(
      /^attachment; filename="AV_\d{2}-\d{2}-\d{2}_Informe\.pdf"$/
    );

    const next = await fetch(url);
    expect(next.status).toBe(200);
    expect(calls).toBe(2);
  });

  it("releases the slot after a rendering error", async () => {
    let calls = 0;
    const { server, url } = await listenWith(async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error("render failed");
      }
      return Buffer.from("%PDF-recovered");
    });
    servers.push(server);

    expect((await fetch(url)).status).toBe(500);
    expect((await fetch(url)).status).toBe(200);
    expect(calls).toBe(2);
  });
});

describe("PDF download filename", () => {
  it("names the file department, date and Informe, with no path separator", () => {
    expect(
      reportPdfFilename("Oficinas", new Date("2026-08-21T10:00:00Z"))
    ).toBe("Oficinas_21-08-26_Informe.pdf");
    expect(
      reportPdfFilename("Informática", new Date("2026-08-21T10:00:00Z"))
    ).toBe("Informatica_21-08-26_Informe.pdf");
    expect(reportPdfFilename("AV", new Date("2026-08-21T10:00:00Z"))).toBe(
      "AV_21-08-26_Informe.pdf"
    );
    expect(
      reportPdfFilename("AGA", new Date("2026-09-07T12:00:00Z"))
    ).not.toContain("/");
  });

  it("takes the date from the period the deck carries, not from today", () => {
    // El informe se regenera a menudo el martes; el nombre tiene que seguir
    // diciendo la semana que hay dentro del fichero.
    const weeks = ["2026-08-24", "2026-09-07", "2026-08-31"];

    expect(reportPdfFilename("AGA", latestReportDate(weeks))).toBe(
      "AGA_07-09-26_Informe.pdf"
    );
    expect(latestReportDate([])).toBeUndefined();
    expect(latestReportDate(["fecha-antigua"])).toBeUndefined();
  });

  it("uses Madrid's next day instead of the UTC date near midnight", () => {
    expect(reportPdfFilename("AGA", new Date("2026-08-21T22:30:00Z"))).toBe(
      "AGA_22-08-26_Informe.pdf"
    );
  });

  it("reads the attachment name from Content-Disposition", () => {
    expect(
      filenameFromDisposition(
        'attachment; filename="Oficinas_21-08-26_Informe.pdf"',
        "informe.pdf"
      )
    ).toBe("Oficinas_21-08-26_Informe.pdf");
    expect(filenameFromDisposition(null, "informe.pdf")).toBe("informe.pdf");
  });
});
