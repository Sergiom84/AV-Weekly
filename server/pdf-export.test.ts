import type { Server } from "node:http";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { createDeckPdfSender, type DeckPdfRenderer } from "./pdf-export.js";

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
      filenamePrefix: "informe-av",
    });
  });

  const server = await new Promise<Server>((resolve) => {
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
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve()))
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
    expect((await first).status).toBe(200);

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
