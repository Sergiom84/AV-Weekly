import { describe, expect, it } from "vitest";
import { isoWeek, isoWeekThursday, isoWeekYear } from "./isoWeek.ts";

describe("ISO week arithmetic", () => {
  it("puts 1 January 2026 (Thursday) in week 1 of 2026", () => {
    const date = new Date(Date.UTC(2026, 0, 1));

    expect(isoWeek(date)).toBe(1);
    expect(isoWeekYear(date)).toBe(2026);
  });

  it("puts Monday 5 January 2026 in week 2, not week 1", () => {
    const date = new Date(Date.UTC(2026, 0, 5));

    expect(isoWeek(date)).toBe(2);
    expect(isoWeekYear(date)).toBe(2026);
  });

  it("keeps 29 December 2025 in week 1 of 2026", () => {
    const date = new Date(Date.UTC(2025, 11, 29));

    expect(isoWeek(date)).toBe(1);
    expect(isoWeekYear(date)).toBe(2026);
  });

  it("maps report week 35 of 2026 onto August", () => {
    const thursday = isoWeekThursday(2026, 35);

    expect(thursday.toISOString().slice(0, 10)).toBe("2026-08-27");
  });
});
