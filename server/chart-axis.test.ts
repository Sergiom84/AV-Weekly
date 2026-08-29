import { describe, expect, it } from "vitest";
import { formatChartMetric, metricAxisWidth } from "../shared/deck/core.ts";

describe("metric chart axes", () => {
  it("formats thousands fully and reserves their required gutter", () => {
    expect(formatChartMetric(1600)).toBe("1.600");
    expect(metricAxisWidth([0, 1200, 1600])).toBeGreaterThanOrEqual(67);
  });

  it("keeps a compact but legible minimum for small values", () => {
    expect(metricAxisWidth([0, 8, 36])).toBe(44);
  });
});
