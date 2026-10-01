import { describe, expect, it } from "vitest";

import {
  SAMPLE_SIGNUPS, SIGNUP_TABS, firstName, inTab, sampleSignup, signupBadge, signupTab, sponsorRows, tabCount, type ApiSponsorSignup,
} from "../src/lib/new-signups-live";

/* --------------------------------------------------------------------------
   2S1-FE-07 — the New sign-ups desk's tabs, words and live sponsor rows.
   -------------------------------------------------------------------------- */

const sponsor = (over: Partial<ApiSponsorSignup>): ApiSponsorSignup => ({
  id: "inq_1", state: "APPROVED", businessName: "Harbor Coffee", contactName: "Dana Brooks", email: "dana@harbor.example",
  categoryText: null, budget: null, zoho: "LEAD", createdAt: "2026-09-29T10:00:00.000Z", decidedAt: "2026-09-30T10:00:00.000Z",
  sponsorId: "sp_1", autoApproved: true, reviewReasons: [], ...over,
});

describe("tabs", () => {
  it("falls back to All and counts the sample rows per tab", () => {
    expect(signupTab("nope").key).toBe("all");
    expect(signupTab(["review"]).key).toBe("review");
    const review = SIGNUP_TABS.find((t) => t.key === "review")!;
    expect(tabCount(review, SAMPLE_SIGNUPS)).toBe(SAMPLE_SIGNUPS.filter((s) => s.reasons.length).length);
    expect(SAMPLE_SIGNUPS.filter((s) => inTab(SIGNUP_TABS.find((t) => t.key === "gua")!, s)).map((s) => s.id)).toEqual(["carmen-reyes"]);
  });
  it("has no sample sponsors — sponsors are live", () => {
    expect(SAMPLE_SIGNUPS.every((s) => s.kind !== ("SPONSOR" as never))).toBe(true);
  });
});

describe("words", () => {
  it("badges and first names", () => {
    expect(signupBadge({ state: "AUTO_APPROVED" }, "2026-09-23T10:02:00Z").label).toBe("Approved automatically · Sep 23");
    expect(signupBadge({ state: "NEEDS_REVIEW" }).tone).toBe("warn");
    expect(firstName("Carmen Reyes")).toBe("Carmen");
    expect(firstName("[Athlete name]")).toBe("[Athlete name]");
    expect(sampleSignup("carmen-reyes")?.guardianOf).toHaveLength(2);
    expect(sampleSignup("missing")).toBeNull();
  });
});

describe("sponsorRows", () => {
  it("puts held sponsors first with their reasons, skips NEW ones not held, and tells automatic from BTG approval", () => {
    const rows = sponsorRows(
      [sponsor({}), sponsor({ id: "inq_2", businessName: "Bay Gym", autoApproved: false })],
      [sponsor({ id: "inq_3", state: "NEW", businessName: "Vape Hut", reviewReasons: ["Restricted business type: Vaping"] }), sponsor({ id: "inq_4", state: "NEW" })],
    );
    expect(rows.map((r) => r.id)).toEqual(["inq_3", "inq_1", "inq_2"]);
    expect(rows[0]).toMatchObject({ reason: "Restricted business type: Vaping", badge: { label: "Needs review" } });
    expect(rows[1]).toMatchObject({ when: "Sep 30", badge: { label: "Approved automatically" }, reason: "All checks passed" });
    expect(rows[2]!.badge.label).toBe("Approved by BTG");
  });
});
