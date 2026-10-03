import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { once } from "node:events";
import { describe, expect, it } from "vitest";
import { isTransientDbError, tursoFetch } from "./db-fetch.js";

describe("Turso fetch", () => {
  it("reconoce el corte de conexión que devuelve Turso", () => {
    const error = new Error(
      "request to https://av-weekly.turso.io/v2/pipeline failed, reason: socket hang up"
    );

    expect(isTransientDbError(error)).toBe(true);
    expect(isTransientDbError(new Error("UNIQUE constraint failed"))).toBe(false);
  });

  it("envía un cuerpo grande con el fetch de Node", async () => {
    const received: Buffer[] = [];
    const server = createServer((req, res) => {
      req.on("data", (chunk) => received.push(chunk));
      req.on("end", () => res.end("ok"));
    });

    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    try {
      const body = "x".repeat(256 * 1024);
      const port = (server.address() as AddressInfo).port;
      const response = await tursoFetch({
        url: `http://127.0.0.1:${port}/v2/pipeline`,
        method: "POST",
        headers: new Headers({ "content-type": "application/json" }),
        arrayBuffer: async () => new TextEncoder().encode(body).buffer,
      } as Request);

      expect(response.status).toBe(200);
      expect(Buffer.concat(received).length).toBe(body.length);
    } finally {
      server.close();
    }
  });

  it("reintenta una vez cuando el primer envío corta el socket", async () => {
    let calls = 0;
    const server = createServer((req, res) => {
      calls += 1;
      if (calls === 1) {
        req.socket.destroy();
        return;
      }
      res.end("ok");
    });

    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    try {
      const port = (server.address() as AddressInfo).port;
      const response = await tursoFetch(
        new Request(`http://127.0.0.1:${port}/v2/pipeline`, {
          method: "POST",
          body: "retry",
        })
      );

      expect(response.status).toBe(200);
      expect(calls).toBe(2);
    } finally {
      server.close();
    }
  });
});
