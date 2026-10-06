import { describe, expect, it } from "vitest";
import {
  canPageBack,
  canPageForward,
  dateBounds,
  formatPicked,
  initialYear,
  monthDisabled,
  selectedLabel,
  withYear,
  yearDisabled,
  yearPageStart,
  yearsOnPage,
} from "./date-picker";
import { parseCvDate } from "./dates";

const TODAY = new Date(2026, 9, 6); // 6 Oct 2026

describe("dateBounds", () => {
  it("stops a past date at the current month", () => {
    const bounds = dateBounds({ future: false, today: TODAY });
    expect(bounds.max).toEqual({ year: 2026, month: 10 });
    expect(monthDisabled(2026, 10, bounds)).toBe(false);
    expect(monthDisabled(2026, 11, bounds)).toBe(true);
    expect(monthDisabled(2025, 12, bounds)).toBe(false);
    expect(yearDisabled(2027, bounds)).toBe(true);
  });

  it("lets education end up to ten years ahead, any month", () => {
    const bounds = dateBounds({ future: true, today: TODAY });
    expect(bounds.max).toEqual({ year: 2036, month: null });
    expect(monthDisabled(2036, 12, bounds)).toBe(false);
    expect(yearDisabled(2037, bounds)).toBe(true);
  });

  it("never offers an end before its start", () => {
    const bounds = dateBounds({ future: false, after: { year: 2024, month: 6 }, today: TODAY });
    expect(monthDisabled(2024, 5, bounds)).toBe(true);
    expect(monthDisabled(2024, 6, bounds)).toBe(false);
    expect(yearDisabled(2023, bounds)).toBe(true);
  });

  it("leaves every month open in the start year when the start has only a year", () => {
    const bounds = dateBounds({ future: false, after: { year: 2024, month: null }, today: TODAY });
    expect(monthDisabled(2024, 1, bounds)).toBe(false);
  });

  it("never goes below the first supported year", () => {
    const bounds = dateBounds({ future: false, after: { year: 1800, month: null }, today: TODAY });
    expect(bounds.min).toEqual({ year: 1900, month: null });
  });
});

describe("formatting", () => {
  it("writes the text the draft already uses", () => {
    expect(formatPicked({ year: 2025, month: 6 })).toBe("Jun 2025");
    expect(formatPicked({ year: 2025, month: null })).toBe("2025");
    expect(parseCvDate(formatPicked({ year: 2025, month: 6 }))).toEqual({ year: 2025, month: 6 });
  });

  it("shows the long form in the summary", () => {
    expect(selectedLabel({ year: 2025, month: 6 })).toBe("June 2025");
    expect(selectedLabel({ year: 2025, month: null })).toBe("2025");
  });
});

describe("year pages", () => {
  const bounds = dateBounds({ future: false, today: TODAY });

  it("ends the newest page on the latest allowed year", () => {
    expect(yearPageStart(2026, bounds)).toBe(2015);
    expect(yearsOnPage(2015).at(-1)).toBe(2026);
  });

  it("finds the page holding an older year", () => {
    expect(yearPageStart(2014, bounds)).toBe(2003);
    expect(yearPageStart(2003, bounds)).toBe(2003);
    expect(yearPageStart(2002, bounds)).toBe(1991);
  });

  it("pages only inside the bounds", () => {
    expect(canPageForward(2015, bounds)).toBe(false);
    expect(canPageForward(2003, bounds)).toBe(true);
    expect(canPageBack(1900, bounds)).toBe(false);
    expect(canPageBack(1991, bounds)).toBe(true);
  });
});

describe("initialYear / withYear", () => {
  const bounds = dateBounds({ future: false, today: TODAY });

  it("opens on the value's year, or this year, kept inside the bounds", () => {
    expect(initialYear({ year: 2019, month: 3 }, bounds, TODAY)).toBe(2019);
    expect(initialYear(null, bounds, TODAY)).toBe(2026);
    expect(initialYear({ year: 2040, month: null }, bounds, TODAY)).toBe(2026);
  });

  it("keeps the month in a new year only when it is allowed there", () => {
    expect(withYear({ year: 2025, month: 11 }, 2024, bounds)).toEqual({ year: 2024, month: 11 });
    expect(withYear({ year: 2025, month: 11 }, 2026, bounds)).toEqual({ year: 2026, month: null });
    expect(withYear(null, 2020, bounds)).toEqual({ year: 2020, month: null });
  });
});
