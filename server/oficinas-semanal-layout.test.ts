import { describe, expect, it } from "vitest";
import { SEMANAL_LAYOUTS } from "../client/src/modules/oficinas/semanalLayout.ts";

/**
 * Each family of SemanalPage owns a closed set of visual rules. A change to
 * one must not silently rewrite another: these snapshots are the fence.
 */
describe("SemanalPage layout families", () => {
  it("keeps the default family without comparison chrome", () => {
    expect(SEMANAL_LAYOUTS["standard-semanal"]).toEqual({
      comparisonLabels: false,
      peticionesTerritorial: false,
      highlightTotal: false,
      centerRowHeader: false,
      wideAverage: false,
    });
  });

  it("keeps element comparisons labelled without an orange total", () => {
    expect(SEMANAL_LAYOUTS["comparativas-semanales"]).toEqual({
      comparisonLabels: true,
      peticionesTerritorial: false,
      highlightTotal: false,
      centerRowHeader: false,
      wideAverage: false,
    });
  });

  it("keeps territorial requests with OTROS last and a highlighted total", () => {
    expect(SEMANAL_LAYOUTS["peticiones-territorial-semanal"]).toEqual({
      comparisonLabels: true,
      peticionesTerritorial: true,
      highlightTotal: true,
      centerRowHeader: false,
      wideAverage: false,
    });
  });

  it("keeps volumetry slides wide and highlighted, without OTROS sorting", () => {
    expect(SEMANAL_LAYOUTS["volumetrias-semanales"]).toEqual({
      comparisonLabels: true,
      peticionesTerritorial: false,
      highlightTotal: true,
      centerRowHeader: false,
      wideAverage: true,
    });
  });
});
