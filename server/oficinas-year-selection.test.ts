import { describe, expect, it } from "vitest";
import {
  persistOficinasYears,
  resolveOficinasYears,
} from "../shared/modules/oficinas/yearSelection.ts";

describe("Oficinas year chips", () => {
  const series = [2023, 2024, 2025];

  it("offers the current year as a chip next to the imported past years", () => {
    const { available, selected } = resolveOficinasYears(series, 2026, null);

    expect(available).toEqual([2023, 2024, 2025, 2026]);
    expect(selected).toEqual([2024, 2025, 2026]);
  });

  it("still offers the current year when it is already in the series", () => {
    const { available } = resolveOficinasYears(
      [2023, 2024, 2025, 2026],
      2026,
      null
    );

    expect(available).toEqual([2023, 2024, 2025, 2026]);
  });

  it("treats an empty stored list as the default, not as every chip off", () => {
    expect(resolveOficinasYears(series, 2026, []).selected).toEqual([
      2024,
      2025,
      2026,
    ]);
  });

  it("keeps the current year on for a stored extras-only selection", () => {
    expect(resolveOficinasYears(series, 2026, [2023, 2024, 2025]).selected).toEqual(
      [2023, 2024, 2025, 2026]
    );
  });

  it("can hide the current year and remember that across a reload", () => {
    const stored = persistOficinasYears([2023, 2024, 2025], 2026);

    expect(stored).toEqual([2023, 2024, 2025, -2026]);
    expect(resolveOficinasYears(series, 2026, stored).selected).toEqual([
      2023,
      2024,
      2025,
    ]);
  });

  it("does not revive the current year after it was explicitly hidden", () => {
    const stored = persistOficinasYears([], 2026);

    expect(stored).toEqual([-2026]);
    expect(resolveOficinasYears(series, 2026, stored).selected).toEqual([]);
  });
});
