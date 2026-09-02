import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createDepartmentAccessRouter,
  createDepartmentApiMiddleware,
  createDepartmentToken,
  verifyDepartmentToken,
} from "./department-access.js";

describe("department access", () => {
  let server: Server;
  let origin = "";

  beforeAll(async () => {
    vi.stubEnv("APP_PIN_AV", "101");
    vi.stubEnv("APP_PIN_INFORMATICA", "202");
    vi.stubEnv("APP_PIN_AGA", "303");
    vi.stubEnv("APP_PIN_OFICINAS", "404");
    vi.stubEnv(
      "APP_PIN_SESSION_SECRET",
      "test-secret-with-at-least-32-characters"
    );

    const app = express();
    app.use(express.json());
    app.use(createDepartmentAccessRouter());
    app.use(createDepartmentApiMiddleware());
    app.get("/api/oficinas", (_req, res) => res.json({ ok: true }));

    await new Promise<void>(resolve => {
      server = app.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Missing test port");
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve()))
    );
    vi.unstubAllEnvs();
  });

  it("signs expiring department sessions", () => {
    const token = createDepartmentToken("oficinas", 1_000);
    expect(verifyDepartmentToken("oficinas", token, 2_000)).toBe(true);
    expect(verifyDepartmentToken("aga", token, 2_000)).toBe(false);
    expect(
      verifyDepartmentToken("oficinas", token, 1_000 + 8 * 60 * 60 * 1_000)
    ).toBe(false);
  });

  it("protects direct APIs and authorizes only the correct PIN", async () => {
    expect((await fetch(`${origin}/api/oficinas`)).status).toBe(401);

    const wrong = await fetch(`${origin}/api/access/oficinas/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: "111" }),
    });
    expect(wrong.status).toBe(401);

    const verified = await fetch(`${origin}/api/access/oficinas/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: "404" }),
    });
    expect(verified.status).toBe(200);
    const cookie = verified.headers.get("set-cookie")?.split(";", 1)[0];
    expect(cookie).toContain("avw_access_oficinas=");

    const protectedResponse = await fetch(`${origin}/api/oficinas`, {
      headers: { cookie: cookie ?? "" },
    });
    expect(protectedResponse.status).toBe(200);
  });
});
