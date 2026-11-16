import { describe, expect, it } from "vitest";

import { checkSummary, deskControls, itemChecks, journey, wizardStart, writingMeter } from "@/lib/athlete-listing-desk";
import type { ApiAthleteListing, ListCheck } from "@/lib/athlete-listings-live";

/* POL-FE-85 — one listing's page: where the wizard opens, its checks, and the journey once submitted. */

const NOW = Date.parse("2026-11-16T15:00:00.000Z");

const listing = (over: Partial<ApiAthleteListing> = {}): ApiAthleteListing => ({
  id: "pol85_l1",
  propertyId: null,
  sellerAthleteId: "pol85_a1",
  inventoryItemId: "pol85_i1",
  title: "Game-day reel",
  description: null,
  visibility: "PUBLIC",
  state: "DRAFT",
  publishAt: null,
  submittedAt: null,
  reviewNotes: null,
  decidedAt: null,
  publishedAt: null,
  createdAt: "2026-11-10T00:00:00.000Z",
  updatedAt: "2026-11-12T00:00:00.000Z",
  item: { id: "pol85_i1", title: "Game-day reel", kind: "VIDEO", priceCents: 45_000, quantity: 2, availableUntil: null, active: true, athleteId: "pol85_a1", propertyId: null },
  propertyName: null,
  seller: { type: "ATHLETE", id: "pol85_a1", name: "Jordan" },
  blockers: [],
  ...over,
});

const row = (key: string, status: ListCheck["status"]): ListCheck => ({ key, label: key, status });

describe("the wizard", () => {
  it("opens on the item when the item needs a fix, on the words when they're short, else on go live", () => {
    const ok = [row("title", "ready"), row("price", "ready"), row("available", "ready"), row("description", "ready")];
    expect(wizardStart([...ok.slice(0, 2), row("available", "fix"), ok[3]], "x".repeat(30))).toBe(1);
    expect(wizardStart(ok, "too short")).toBe(2);
    expect(wizardStart(ok, "A post and a story, the week of the launch.")).toBe(3);
  });

  it("step 1 shows only the item's own checks", () => {
    expect(itemChecks([row("title", "ready"), row("description", "fix"), row("seller", "ready"), row("price", "fix")]).map((c) => c.key)).toEqual(["title", "price"]);
  });

  it("go live counts the required rows and keeps the optional ones apart", () => {
    const s = checkSummary([row("title", "ready"), row("description", "fix"), row("seller", "ready"), row("brands", "optional"), row("payout", "optional")]);
    expect(s).toMatchObject({ ready: 2, total: 3 });
    expect(s.fix.map((c) => c.key)).toEqual(["description"]);
    expect(s.optional.map((c) => c.key)).toEqual(["brands", "payout"]);
  });

  it("the writing meter counts toward 20 and says how many are left", () => {
    expect(writingMeter("testttiiing  ")).toMatchObject({ n: 11, ok: false, label: "9 more characters to go" });
    expect(writingMeter("x".repeat(19)).label).toBe("1 more character to go");
    expect(writingMeter("x".repeat(25))).toMatchObject({ ok: true, share: 1 });
  });
});

describe("once submitted", () => {
  it("held for BTG: written, checked now, live to come", () => {
    const j = journey(listing({ state: "PENDING_APPROVAL", submittedAt: "2026-11-15T10:00:00.000Z" }), NOW);
    expect(j.map((s) => [s.label, s.state])).toEqual([["Written", "done"], ["Checked", "now"], ["Live", "todo"]]);
    expect(j[0].note).toBe("Submitted Nov 15, 2026");
  });

  it("live, going live later, paused and ended end on their own stop", () => {
    expect(journey(listing({ state: "PUBLISHED", publishedAt: "2026-11-15T10:00:00.000Z" }), NOW)[2]).toMatchObject({ label: "Live", state: "now", note: "Since Nov 15, 2026" });
    expect(journey(listing({ state: "PUBLISHED", publishAt: "2026-12-03T00:00:00.000Z" }), NOW)[2]).toMatchObject({ label: "Goes live", note: "Dec 3, 2026" });
    expect(journey(listing({ state: "PAUSED" }), NOW)[2]).toMatchObject({ label: "Paused", state: "paused" });
    expect(journey(listing({ state: "ARCHIVED" }), NOW)[2]).toMatchObject({ label: "Ended", state: "ended" });
  });

  it("one control per state; a team's listing has none", () => {
    expect(deskControls(listing({ state: "PUBLISHED" }))).toEqual({ liveSwitch: true, edit: null, end: true });
    expect(deskControls(listing({ state: "PAUSED" }))).toEqual({ liveSwitch: true, edit: "resume", end: true });
    expect(deskControls(listing({ state: "PENDING_APPROVAL" }))).toEqual({ liveSwitch: false, edit: "resubmit", end: true });
    expect(deskControls(listing({ state: "ARCHIVED" }))).toEqual({ liveSwitch: false, edit: null, end: false });
    expect(deskControls(listing({ state: "PUBLISHED", seller: { type: "PROPERTY", id: "p", name: "Tigers" } }))).toEqual({ liveSwitch: false, edit: null, end: false });
  });
});
