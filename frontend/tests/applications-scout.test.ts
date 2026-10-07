import { describe, expect, it } from "vitest";

import { waitMeter } from "../src/lib/applications-ui";

/* --------------------------------------------------------------------------
   P1-ART-16 — the Scouting Board's pure piece: each card's 48-hour bar,
   read only from what the desk already had (the row's wait).
   -------------------------------------------------------------------------- */

describe("a card's 48-hour bar", () => {
  it("fills toward 48 hours and says how long", () => {
    expect(waitMeter(0)).toEqual({ pct: 0, overdue: false, label: "Just in" });
    expect(waitMeter(6)).toEqual({ pct: 13, overdue: false, label: "Waiting 6h" });
    expect(waitMeter(47)).toMatchObject({ pct: 98, overdue: false, label: "Waiting 47h" });
  });

  it("turns overdue past 48 hours and counts in days", () => {
    expect(waitMeter(49)).toEqual({ pct: 100, overdue: true, label: "Waiting 2d — past 48h" });
    expect(waitMeter(72)).toEqual({ pct: 100, overdue: true, label: "Waiting 3d — past 48h" });
  });
});

