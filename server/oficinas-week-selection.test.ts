import { describe, expect, it } from "vitest";
import {
  reportedWeekAvailability,
  resolveWeekSelection,
  type WeekSelection,
} from "../shared/deck/core.ts";

const CALENDAR_WEEKS = Array.from({ length: 52 }, (_, index) => index + 1);

describe("Oficinas weekly window", () => {
  it("anchors the last 20 weeks to the active report week, not week 52", () => {
    const selection: WeekSelection = {
      mode: "window",
      from: 1,
      to: 52,
      weeks: [],
      size: 20,
    };
    const reportWeeks = Array.from({ length: 34 }, (_, index) => index + 1);

    expect(
      resolveWeekSelection(
        selection,
        reportedWeekAvailability(CALENDAR_WEEKS, reportWeeks)
      )
    ).toEqual(Array.from({ length: 20 }, (_, index) => index + 15));
  });
});
