import { describe, expect, it } from "vitest";
import {
  formatChartMetric,
  metricAxisWidth,
  weekCoverLabel,
} from "../shared/deck/core.ts";

describe("metric chart axes", () => {
  it("formats thousands fully and reserves their required gutter", () => {
    expect(formatChartMetric(1600)).toBe("1.600");
    expect(metricAxisWidth([0, 1200, 1600])).toBeGreaterThanOrEqual(67);
  });

  it("keeps a compact but legible minimum for small values", () => {
    expect(metricAxisWidth([0, 8, 36])).toBe(44);
  });
});

describe("cover period label", () => {
  it("names an ISO week the way AGA prints it", () => {
    expect(weekCoverLabel(33, 2026)).toBe("Semana 33 de 2026 · 10-16 agosto");
  });

  it("splits the range when the week crosses a month", () => {
    expect(weekCoverLabel(5, 2026)).toBe(
      "Semana 5 de 2026 · 26 enero-1 febrero"
    );
  });
});
