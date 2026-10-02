import { describe, expect, it } from "vitest";

import {
  descriptionCheck, itemLine, itemsToList, listChecks, listingBadge, listingTrack, ownerControls, statusText, teamFromListings,
  type ApiAthleteListing, type ListableItem,
} from "@/lib/athlete-listings-live";

/* 2S3-FE-02 — "List my item": what it derives from 2S3-BE-05's API. */

const item: ListableItem = { id: "i1", title: "Basketball clinic", kind: "CAMP", priceCents: 50_000, quantity: 4, availableUntil: null, active: true };

const listing = (over: Partial<ApiAthleteListing> = {}): ApiAthleteListing => ({
  id: "l1", propertyId: null, sellerAthleteId: "a1", inventoryItemId: "i1", title: "Basketball clinic",
  description: "A 90-minute youth basketball clinic.", visibility: "PUBLIC", state: "PENDING_APPROVAL", publishAt: null,
  submittedAt: "2026-10-01T11:02:00.000Z", reviewNotes: null, decidedAt: null, publishedAt: null,
  createdAt: "2026-10-01T11:00:00.000Z", updatedAt: "2026-10-01T11:02:00.000Z",
  item: { ...item, athleteId: "a1", propertyId: null }, propertyName: null,
  seller: { type: "ATHLETE", id: "a1", name: "Riley Carter" }, blockers: [], ...over,
});

describe("who sells it", () => {
  it("a team's listing of the athlete's item names the team", () => {
    const team = listing({ id: "l2", propertyId: "p1", sellerAthleteId: null, seller: { type: "PROPERTY", id: "p1", name: "Westfield Hawks" } });
    expect(teamFromListings([team])).toEqual({ onTeam: true, teamName: "Westfield Hawks" });
  });
  it("an own listing's blocker says so too, without a name", () => {
    expect(teamFromListings([listing({ blockers: ["athlete: on a team — their team lists their items"] })])).toEqual({ onTeam: true, teamName: null });
    expect(teamFromListings([listing()])).toEqual({ onTeam: false, teamName: null });
  });
  it("only items with no live listing can be listed", () => {
    const other = { ...item, id: "i2" };
    expect(itemsToList([item, other], [listing()]).map((i) => i.id)).toEqual(["i2"]);
    expect(itemsToList([item], [listing({ state: "ARCHIVED" })]).map((i) => i.id)).toEqual(["i1"]);
  });
});

describe("states, in the design's words", () => {
  it("badges", () => {
    expect(listingBadge(null).label).toBe("Not listed yet");
    expect(listingBadge(listing()).label).toBe("BTG is taking a look");
    expect(listingBadge(listing({ state: "PUBLISHED" })).label).toBe("Live");
    expect(listingBadge(listing({ state: "ARCHIVED" })).label).toBe("Ended");
    expect(listingBadge(listing({ state: "DRAFT", reviewNotes: "Say where." })).label).toBe("Changes asked");
  });
  it("the track and the sentence: held for BTG, which emails (2S3-FE-04)", () => {
    expect(listingTrack(listing()).map((s) => s.state)).toEqual(["current", "todo", "todo", "todo"]);
    expect(listingTrack(listing())[2]!.note).toBe("Only if you choose");
    expect(statusText(listing())).toMatch(/BTG is taking a look — we’ll email you/);
    expect(statusText(listing({ state: "DRAFT" }))).toMatch(/goes live as soon as the checks pass/);
    expect(statusText(listing())).not.toMatch(/once BTG approves/);
  });
  it("the owner's moves", () => {
    expect(ownerControls("PUBLISHED")).toMatchObject({ pause: true, resume: false, editable: false });
    expect(ownerControls("PAUSED")).toMatchObject({ resume: true, editable: true, end: true });
    /* 2S3-BE-06 — held for BTG: editable (back to a draft) and submittable again. */
    expect(ownerControls("PENDING_APPROVAL")).toMatchObject({ pause: false, resume: false, end: true, canSubmit: true, editable: true });
    expect(ownerControls("ARCHIVED")).toMatchObject({ end: false, editable: false, canSubmit: false });
  });
});

describe("What BTG checks", () => {
  it("reads the item and the description", () => {
    expect(itemLine(item)).toBe("Camp or clinic · $500 each · 4 to sell");
    expect(descriptionCheck("short").status).toBe("fix");
    expect(descriptionCheck("A 90-minute youth basketball clinic.").status).toBe("ready");
  });
  it("brands and payouts are shown but never stop a listing; Stripe has a button", () => {
    const rows = listChecks({ item, description: "x".repeat(30), blockers: [], athleteState: "APPROVED", wontPromote: [], payout: "NOT_SET_UP" });
    expect(rows.find((r) => r.key === "brands")!.status).toBe("optional");
    const payout = rows.find((r) => r.key === "payout")!;
    expect(payout.status).toBe("optional");
    expect(payout.cta?.label).toMatch(/Stripe/);
    expect(rows.filter((r) => r.status === "fix")).toEqual([]);
  });
  it("API blockers become rows; an unknown one is never swallowed", () => {
    const rows = listChecks({ item, description: "x".repeat(30), blockers: ["athlete: not approved by BTG", "item: none left to sell", "something new"], athleteState: null, wontPromote: null, payout: null });
    expect(rows.find((r) => r.key === "seller")!.status).toBe("fix");
    expect(rows.find((r) => r.key === "price")!.status).toBe("fix");
    expect(rows.some((r) => r.label === "something new" && r.status === "fix")).toBe(true);
    expect(rows.some((r) => r.key === "payout" || r.key === "brands")).toBe(false);
  });
});
