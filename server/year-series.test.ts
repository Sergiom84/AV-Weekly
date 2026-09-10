import { describe, expect, it } from "vitest";
import {
  componentSeriesColor,
  yearSeriesColor,
} from "../client/src/lib/yearSeries";

describe("yearSeriesColor", () => {
  it("keeps the agreed colour for each report year", () => {
    expect(yearSeriesColor(2023)).toBe("var(--chart-5)");
    expect(yearSeriesColor(2024)).toBe("var(--informe-serie-4)");
    expect(yearSeriesColor(2025)).toBe("var(--informe-serie-3)");
    expect(yearSeriesColor(2026)).toBe("var(--informe-serie-1)");
  });
});

describe("componentSeriesColor", () => {
  it("paints two series as 2025 on the left and 2026 on the right", () => {
    expect(componentSeriesColor(0, 2)).toBe(yearSeriesColor(2025));
    expect(componentSeriesColor(1, 2)).toBe(yearSeriesColor(2026));
  });

  it("assigns further series from the right: navy, 2025, orange, gray", () => {
    expect(componentSeriesColor(4, 5)).toBe(yearSeriesColor(2026));
    expect(componentSeriesColor(3, 5)).toBe(yearSeriesColor(2025));
    expect(componentSeriesColor(2, 5)).toBe(yearSeriesColor(2024));
    expect(componentSeriesColor(1, 5)).toBe(yearSeriesColor(2023));
    expect(componentSeriesColor(0, 5)).toBe("var(--informe-serie-2)");
  });
});
