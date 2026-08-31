import { describe, expect, it } from "vitest";
import {
  ALL_REPORTED_WEEKS_WINDOW,
  followLatestWeekSelection,
  resolveWeekSelection,
  TRAILING_WEEK_WINDOW,
} from "../shared/deck/core.ts";
import { createDefaultDeck } from "../shared/modules/av/types.ts";
import { migrateAvDeckWeekSelections } from "../shared/modules/av/weekSelection.ts";
import { fillResolutionHistoryGaps } from "./parseInformePlano.ts";

describe("followLatestWeekSelection", () => {
  it("keeps the trailing window attached to newly reported weeks", () => {
    const selection = followLatestWeekSelection();
    const through34 = Array.from({ length: 34 }, (_, index) => index + 1);
    const through35 = [...through34, 35];

    expect(selection).toEqual({
      mode: "window",
      from: 1,
      to: 1,
      weeks: [],
      size: TRAILING_WEEK_WINDOW,
    });
    expect(resolveWeekSelection(selection, through34)).toEqual(
      through34.slice(-TRAILING_WEEK_WINDOW)
    );
    expect(resolveWeekSelection(selection, through35)).toEqual(
      through35.slice(-TRAILING_WEEK_WINDOW)
    );
  });

  it("lets Todas follow every reported week without pinning the end", () => {
    const selection = followLatestWeekSelection(ALL_REPORTED_WEEKS_WINDOW);
    const through34 = Array.from({ length: 34 }, (_, index) => index + 1);
    const through35 = [...through34, 35];

    expect(resolveWeekSelection(selection, through34)).toEqual(through34);
    expect(resolveWeekSelection(selection, through35)).toEqual(through35);
  });
});

describe("migrateAvDeckWeekSelections", () => {
  it("unsticks the two ranges that were saved as an absolute end", () => {
    const deck = createDefaultDeck();
    for (const page of deck.pages) {
      if (page.id === "weekly-incidencias") {
        page.weekSelection = { mode: "range", from: 2, to: 34, weeks: [] };
      }
      if (page.id === "resolution-programados") {
        page.weekSelection = { mode: "range", from: 1, to: 34, weeks: [] };
      }
      if (page.id === "weekly-presenciales") {
        page.weekSelection = { mode: "range", from: 10, to: 20, weeks: [] };
      }
    }

    const migrated = migrateAvDeckWeekSelections(deck, 35);
    const incidencias = migrated.pages.find((page) => page.id === "weekly-incidencias");
    const programados = migrated.pages.find((page) => page.id === "resolution-programados");
    const presenciales = migrated.pages.find((page) => page.id === "weekly-presenciales");

    expect(incidencias?.weekSelection).toEqual(followLatestWeekSelection());
    expect(programados?.weekSelection).toEqual(followLatestWeekSelection());
    expect(presenciales?.weekSelection).toEqual({
      mode: "range",
      from: 10,
      to: 20,
      weeks: [],
    });
  });

  it("leaves a still-current range alone", () => {
    const deck = createDefaultDeck();
    const page = deck.pages.find((entry) => entry.id === "weekly-incidencias");
    if (page) {
      page.weekSelection = { mode: "range", from: 2, to: 35, weeks: [] };
    }

    const migrated = migrateAvDeckWeekSelections(deck, 35);
    expect(
      migrated.pages.find((entry) => entry.id === "weekly-incidencias")?.weekSelection
    ).toEqual({ mode: "range", from: 2, to: 35, weeks: [] });
  });
});

describe("fillResolutionHistoryGaps", () => {
  it("fills missing weeks and keeps a week that already has rows", () => {
    const stored = {
      "31": [{ category: "Programados", tier2: "SALA", tier3: "PRESTAMO", total: 2 }],
    };
    const incoming = {
      "31": [{ category: "Programados", tier2: "SALA", tier3: "PRESTAMO", total: 9 }],
      "32": [{ category: "Programados", tier2: "SALA", tier3: "PRESTAMO", total: 1 }],
    };

    expect(fillResolutionHistoryGaps(stored, incoming)).toEqual({
      "31": stored["31"],
      "32": incoming["32"],
    });
  });
});

describe("createDefaultDeck week axis", () => {
  it("seeds weekly and resolution pages on a trailing window", () => {
    const deck = createDefaultDeck();
    const weekly = deck.pages.filter((page) => page.kind === "weeklySupport");
    const resolution = deck.pages.filter((page) => page.kind === "resolutionDetail");

    expect(weekly.length).toBeGreaterThan(0);
    expect(resolution.length).toBeGreaterThan(0);
    expect(weekly.every((page) => page.weekSelection?.mode === "window")).toBe(true);
    expect(resolution.every((page) => page.weekSelection?.mode === "window")).toBe(true);
  });
});
