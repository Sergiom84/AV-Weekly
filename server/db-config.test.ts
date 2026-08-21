import { describe, expect, it } from "vitest";
import { resolveDatabaseUrl } from "./db-config.js";

describe("database URL configuration", () => {
  it("prefers the canonical URL_TURSO variable", () => {
    expect(
      resolveDatabaseUrl(
        { URL_TURSO: "libsql://canonical", SQL_TURSO: "libsql://legacy" },
        "C:/data"
      )
    ).toBe("libsql://canonical");
  });

  it("accepts SQL_TURSO as a local compatibility alias", () => {
    expect(resolveDatabaseUrl({ SQL_TURSO: "libsql://legacy" }, "C:/data")).toBe(
      "libsql://legacy"
    );
  });

  it("falls back to the local database without a remote URL", () => {
    expect(resolveDatabaseUrl({}, "C:/data").replaceAll("\\", "/")).toBe(
      "file:C:/data/av-weekly.db"
    );
  });
});
