import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const PNG_BYTES = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
]);

describe("access control and database-backed images", () => {
  let origin = "";
  let server: Server;
  let dataDir = "";
  let closeClient: (() => Promise<void>) | undefined;
  const authorization = `Basic ${Buffer.from("presentacion:correcta").toString("base64")}`;

  beforeAll(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "av-weekly-test-"));
    process.env.APP_DATA_DIR = dataDir;
    process.env.APP_REQUIRE_AUTH = "true";
    process.env.APP_ACCESS_USER = "presentacion";
    process.env.APP_ACCESS_PASSWORD = "correcta";

    const [
      { createAccessMiddleware },
      { initDb, client },
      { default: routes },
    ] = await Promise.all([
      import("./auth.js"),
      import("./db.js"),
      import("./routes.js"),
    ]);

    await initDb();
    closeClient = async () => client.close();

    const app = express();
    app.use(createAccessMiddleware());
    app.use(routes);

    await new Promise<void>(resolve => {
      server = app.listen(0, "127.0.0.1", () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Test server did not expose a TCP port");
    }
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close(error => (error ? reject(error) : resolve()));
    });
    await closeClient?.();
    try {
      fs.rmSync(dataDir, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
    } catch (error) {
      // The native libSQL binding can keep its Windows directory handle until
      // process exit even after close(). The OS temp directory will clean it.
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "EPERM"
      ) {
        throw error;
      }
    }
  });

  it("rejects unauthenticated requests", async () => {
    const response = await fetch(`${origin}/api/informe`);

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("AV Weekly");
  });

  it("stores and returns the exact image bytes", async () => {
    const form = new FormData();
    form.append(
      "file",
      new Blob([PNG_BYTES], { type: "image/png" }),
      "prueba.png"
    );

    const upload = await fetch(`${origin}/api/uploads/image`, {
      method: "POST",
      headers: { authorization },
      body: form,
    });
    const body = (await upload.json()) as { url: string };

    expect(upload.status).toBe(201);
    expect(body.url).toMatch(/^\/api\/uploads\/[0-9a-f-]{36}$/);

    const unauthenticated = await fetch(`${origin}${body.url}`);
    expect(unauthenticated.status).toBe(401);

    const image = await fetch(`${origin}${body.url}`, {
      headers: { authorization },
    });
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toContain("image/png");
    expect(image.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(PNG_BYTES);
  });

  it("rejects a forged image MIME type", async () => {
    const form = new FormData();
    form.append(
      "file",
      new Blob(["not an image"], { type: "image/png" }),
      "falsa.png"
    );

    const response = await fetch(`${origin}/api/uploads/image`, {
      method: "POST",
      headers: { authorization },
      body: form,
    });

    expect(response.status).toBe(400);
  });
});
