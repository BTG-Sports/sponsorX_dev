import { describe, expect, it } from "vitest";

import { btgNote, GOES_LIVE_COPY, restrictedWordsLine, submitOutcome } from "../src/lib/listing-outcome";

/* --------------------------------------------------------------------------
   2S3-FE-04 — what a seller is told about going live (2S3-BE-06): "Live ✓",
   or "BTG is taking a look — we'll email you" with the restricted words to
   fix and, for the account, only that BTG is checking it.
   -------------------------------------------------------------------------- */

const now = new Date("2026-10-02T12:00:00Z");
const hold = (over: Partial<{ restrictedWords: string[]; accountCheck: boolean; pausedByBtg: boolean }> = {}) => ({
  restrictedWords: [], accountCheck: false, pausedByBtg: false, message: "", ...over,
});

describe("before submitting", () => {
  it("says it goes live as soon as the checks pass", () => {
    expect(GOES_LIVE_COPY).toBe("This goes live as soon as the checks pass.");
  });
});

describe("after submitting", () => {
  it("live at once: Live ✓", () => {
    expect(submitOutcome({ state: "PUBLISHED", publishAt: null }, now)).toEqual({ tone: "accent", headline: "Live ✓", lines: ["Sponsors can find it on the marketplace now."] });
  });

  it("a future publish day: the checks passed, and the day it goes live", () => {
    expect(submitOutcome({ state: "PUBLISHED", publishAt: "2026-10-20T00:00:00.000Z" }, now)!.headline).toBe("Checks passed ✓ Goes live on Oct 20, 2026");
  });

  it("held for restricted words: the words, so the seller can edit them out", () => {
    const o = submitOutcome({ state: "PENDING_APPROVAL", publishAt: null, hold: hold({ restrictedWords: ["poker", "poker", "casino"] }) }, now)!;
    expect(o.tone).toBe("warn");
    expect(o.headline).toBe("BTG is taking a look — we'll email you");
    expect(o.lines).toEqual(["Restricted words: “poker”, “casino”. Edit them out and submit again, or wait for BTG."]);
  });

  it("held for the account: only that BTG is checking it — never the internal reason", () => {
    const o = submitOutcome({ state: "PENDING_APPROVAL", publishAt: null, hold: hold({ accountCheck: true }) }, now)!;
    expect(o.lines).toEqual(["BTG is checking your account. Nothing for you to do."]);
  });

  it("held after a BTG pause: BTG puts it back live", () => {
    expect(submitOutcome({ state: "PENDING_APPROVAL", publishAt: null, hold: hold({ pausedByBtg: true }) }, now)!.lines).toEqual(["BTG paused this listing earlier, so BTG puts it back live."]);
  });

  it("nothing to say for a draft, a pause or an end", () => {
    for (const state of ["DRAFT", "PAUSED", "ARCHIVED"] as const) expect(submitOutcome({ state, publishAt: null }, now)).toBeNull();
    expect(restrictedWordsLine([])).toBeNull();
  });
});

describe("BTG's pause or end", () => {
  it("names BTG's reason; a paused one says BTG puts it back live", () => {
    expect(btgNote({ state: "PAUSED", publishAt: null, btgAction: "PAUSED", btgReason: "Another team's logo" }))
      .toBe("BTG paused this listing: Another team's logo. You can edit it; when you resume it, it goes to BTG, and BTG puts it back live.");
    expect(btgNote({ state: "ARCHIVED", publishAt: null, btgAction: "ENDED", btgReason: "Not allowed." })).toBe("BTG ended this listing: Not allowed.");
    expect(btgNote({ state: "PUBLISHED", publishAt: null, btgAction: null, btgReason: null })).toBeNull();
  });
});
