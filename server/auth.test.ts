import { afterEach, describe, expect, it, vi } from "vitest";
import { configuredCredentials, createAccessMiddleware } from "./auth.js";

describe("access configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fails closed when authentication is required without credentials", () => {
    vi.stubEnv("APP_REQUIRE_AUTH", "true");
    vi.stubEnv("APP_ACCESS_USER", "");
    vi.stubEnv("APP_ACCESS_PASSWORD", "");

    expect(() => createAccessMiddleware()).toThrow(/requires APP_ACCESS_USER/);
  });

  it("rejects partial credentials", () => {
    vi.stubEnv("APP_REQUIRE_AUTH", "false");
    vi.stubEnv("APP_ACCESS_USER", "presentacion");
    vi.stubEnv("APP_ACCESS_PASSWORD", "");

    expect(() => configuredCredentials()).toThrow(/requires APP_ACCESS_USER/);
  });
});
