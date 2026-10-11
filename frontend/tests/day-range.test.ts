import { describe, expect, it } from "vitest";

import {
  addDays,
  addMonths,
  clampDay,
  compareMonths,
  dayOf,
  dayRangeLabel,
  fmtDay,
  inBounds,
  monthGrid,
  monthOf,
  parseDay,
  pickDay,
  shiftMonths,
  todayDay,
} from "../src/lib/day-range";

/* --------------------------------------------------------------------------
   The house date-range picker's pure half (components/date-range-picker.tsx,
   P1-ART-23 review 2026-10-12): calendar days in UTC, the month grid, month
   and year navigation, the click-to-range rule and the trigger's words.
   -------------------------------------------------------------------------- */

describe("parseDay", () => {
  it("accepts real calendar days only", () => {
    expect(parseDay("2026-10-14")).toBe("2026-10-14");
    expect(parseDay("2028-02-29")).toBe("2028-02-29");
    expect(parseDay("2026-02-29")).toBeNull();
    expect(parseDay("2026-13-01")).toBeNull();
    expect(parseDay("2026-10-14T00:00:00.000Z")).toBeNull();
    expect(parseDay("")).toBeNull();
    expect(parseDay(null)).toBeNull();
  });
});

describe("months", () => {
  it("moves across years both ways", () => {
    expect(addMonths({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(addMonths({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
    expect(addMonths({ year: 2026, month: 5 }, 12)).toEqual({ year: 2027, month: 5 });
    expect(addMonths({ year: 2026, month: 5 }, -18)).toEqual({ year: 2024, month: 11 });
  });

  it("compares and reads months", () => {
    expect(compareMonths({ year: 2026, month: 0 }, { year: 2025, month: 11 })).toBeGreaterThan(0);
    expect(compareMonths(monthOf("2026-10-14"), { year: 2026, month: 9 })).toBe(0);
  });

  it("lays out a month grid in UTC", () => {
    expect(monthGrid({ year: 2026, month: 9 })).toEqual({ startDow: 4, daysInMonth: 31 }); // Oct 1 2026 is a Thursday
    expect(monthGrid({ year: 2028, month: 1 }).daysInMonth).toBe(29);
    expect(monthGrid({ year: 2026, month: 1 }).daysInMonth).toBe(28);
  });
});

describe("days", () => {
  it("builds, moves and clamps days", () => {
    expect(dayOf(2026, 0, 5)).toBe("2026-01-05");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(shiftMonths("2026-10-14", -12)).toBe("2025-10-14");
    expect(clampDay("2025-12-31", "2026-01-01", "2026-12-31")).toBe("2026-01-01");
    expect(clampDay("2027-01-01", "2026-01-01", "2026-12-31")).toBe("2026-12-31");
    expect(clampDay("2026-06-01")).toBe("2026-06-01");
    expect(inBounds("2026-06-01", "2026-01-01", "2026-12-31")).toBe(true);
    expect(inBounds("2027-06-01", undefined, "2026-12-31")).toBe(false);
  });

  it("takes today as the UTC calendar day", () => {
    expect(todayDay(new Date("2026-10-12T23:30:00.000-05:00"))).toBe("2026-10-13");
  });
});

describe("pickDay", () => {
  it("starts a single day, then completes a range in either order", () => {
    expect(pickDay(null, null, "2026-10-14")).toEqual({ from: "2026-10-14", to: null });
    expect(pickDay("2026-10-14", null, "2026-10-20")).toEqual({ from: "2026-10-14", to: "2026-10-20" });
    expect(pickDay("2026-10-14", null, "2026-10-02")).toEqual({ from: "2026-10-02", to: "2026-10-14" });
  });

  it("treats to === from as single, and starts over after a full range", () => {
    expect(pickDay("2026-10-14", "2026-10-14", "2026-10-16")).toEqual({ from: "2026-10-14", to: "2026-10-16" });
    expect(pickDay("2026-10-14", "2026-10-20", "2026-10-25")).toEqual({ from: "2026-10-25", to: null });
    expect(pickDay("2026-10-14", null, "2026-10-14")).toEqual({ from: "2026-10-14", to: null });
  });
});

describe("labels", () => {
  it("reads as plain words, with the year once", () => {
    expect(fmtDay("2026-10-14")).toBe("Oct 14, 2026");
    expect(fmtDay("2026-10-14", false)).toBe("Oct 14");
    expect(dayRangeLabel(null, null)).toBe("Any dates");
    expect(dayRangeLabel(null, null, "All dates")).toBe("All dates");
    expect(dayRangeLabel("2026-10-14", null)).toBe("Oct 14, 2026");
    expect(dayRangeLabel("2026-10-14", "2026-10-14")).toBe("Oct 14, 2026");
    expect(dayRangeLabel("2026-10-14", "2026-11-02")).toBe("Oct 14 – Nov 2, 2026");
    expect(dayRangeLabel("2026-12-20", "2027-01-05")).toBe("Dec 20, 2026 – Jan 5, 2027");
  });
});
