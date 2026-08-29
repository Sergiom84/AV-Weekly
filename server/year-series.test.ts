import { describe, expect, it } from "vitest";
import { yearSeriesColor } from "../client/src/lib/yearSeries";

describe("yearSeriesColor", () => {
  it("keeps the agreed colour for each report year", () => {
    expect(yearSeriesColor(2024)).toBe("var(--informe-serie-1)");
    expect(yearSeriesColor(2025)).toBe("var(--informe-serie-3)");
    expect(yearSeriesColor(2026)).toBe("var(--informe-serie-4)");
  });
});
