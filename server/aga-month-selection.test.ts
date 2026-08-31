import { describe, expect, it } from "vitest";
import {
  CALENDAR_MONTH_KEYS,
  calendarMonthLabel,
  defaultCalendarMonthRange,
  defaultMonthWindow,
  resolveMonthSelection,
} from "../shared/deck/core.ts";

describe("AGA monthly window (2.8 Office)", () => {
  const history = [
    "2024-09",
    "2024-10",
    "2024-11",
    "2024-12",
    "2025-01",
    "2025-02",
    "2025-03",
    "2025-04",
    "2025-05",
    "2025-06",
    "2025-07",
    "2025-08",
    "2025-09",
    "2025-10",
    "2025-11",
    "2025-12",
    "2026-01",
    "2026-02",
    "2026-03",
    "2026-04",
    "2026-05",
    "2026-06",
    "2026-07",
    "2026-08",
  ];

  it("defaults a long Office series to the trailing 12 months", () => {
    expect(resolveMonthSelection(defaultMonthWindow(12), history)).toEqual(
      history.slice(-12)
    );
  });

  it("keeps a short Office series intact when the window is wider than the data", () => {
    expect(
      resolveMonthSelection(defaultMonthWindow(12), ["2026-07", "2026-08"])
    ).toEqual(["2026-07", "2026-08"]);
  });
});

describe("AGA year-on-year month index (3.1 / 3.2)", () => {
  it("exposes twelve calendar-month keys, January to December", () => {
    expect(CALENDAR_MONTH_KEYS).toEqual([
      "01",
      "02",
      "03",
      "04",
      "05",
      "06",
      "07",
      "08",
      "09",
      "10",
      "11",
      "12",
    ]);
    expect(CALENDAR_MONTH_KEYS.map(calendarMonthLabel)).toEqual([
      "Ene",
      "Feb",
      "Mar",
      "Abr",
      "May",
      "Jun",
      "Jul",
      "Ago",
      "Sep",
      "Oct",
      "Nov",
      "Dic",
    ]);
  });

  it("defaults to the full year so a locked deck still shows January–December", () => {
    expect(
      resolveMonthSelection(defaultCalendarMonthRange(), CALENDAR_MONTH_KEYS)
    ).toEqual(CALENDAR_MONTH_KEYS);
  });

  it("slices every year by calendar month index, not by dropping YYYY-MM rows", () => {
    const ytd = resolveMonthSelection(
      { mode: "range", from: "01", to: "08", months: [] },
      CALENDAR_MONTH_KEYS
    );

    expect(ytd).toEqual(["01", "02", "03", "04", "05", "06", "07", "08"]);
    expect(ytd.map((key) => Number(key) - 1)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});
