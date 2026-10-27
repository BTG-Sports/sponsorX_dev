import { describe, expect, it } from "vitest";

import {
  LISTING_STATE_OPTIONS, descriptionCheck, itemLine, itemsToList, listChecks, listingBadge, listingScope, listingTiles, listingTrack, listingsView, ownerControls,
  readyRows, rosterFrom, statusText, teamFromListings,
  type ApiAthleteListing, type ListableItem,
} from "@/lib/athlete-listings-live";

/* 2S3-FE-02 — "List my item": what it derives from 2S3-BE-05's API.
   P1-ART-22 — and the server-paged page's helpers: which tab opens, the
   KPI plates from the counts, rostered or not, and the legacy fallback. */

const item: ListableItem = { id: "i1", title: "Basketball clinic", kind: "CAMP", priceCents: 50_000, quantity: 4, availableUntil: null, active: true };

const listing = (over: Partial<ApiAthleteListing> = {}): ApiAthleteListing => ({
  id: "l1", propertyId: null, sellerAthleteId: "a1", inventoryItemId: "i1", title: "Basketball clinic",
  description: "A 90-minute youth basketball clinic.", visibility: "PUBLIC", state: "PENDING_APPROVAL", publishAt: null,
  submittedAt: "2026-10-01T11:02:00.000Z", reviewNotes: null, decidedAt: null, publishedAt: null,
  createdAt: "2026-10-01T11:00:00.000Z", updatedAt: "2026-10-01T11:02:00.000Z",
  item: { ...item, athleteId: "a1", propertyId: null }, propertyName: null,
  seller: { type: "ATHLETE", id: "a1", name: "Riley Carter" }, blockers: [], ...over,
});
const teamListing = (over: Partial<ApiAthleteListing> = {}) =>
  listing({ id: "l2", inventoryItemId: "i2", propertyId: "p1", sellerAthleteId: null, state: "PUBLISHED", seller: { type: "PROPERTY", id: "p1", name: "Westfield Hawks" }, ...over });

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
    /* The "goes live" line is the checklist's, under Submit — said once (P8-FE-09). */
    expect(statusText(listing({ state: "DRAFT" }))).toBe("Not submitted yet — only you can see it.");
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

describe("the paged page (P1-ART-22)", () => {
  it("opens on Your listings — unless the athlete has none and their team has some", () => {
    expect(listingScope("", { own: 2, team: 1 })).toBe("own");
    expect(listingScope("", { own: 0, team: 0 })).toBe("own");
    expect(listingScope("", { own: 0, team: 3 })).toBe("team");
    expect(listingScope("team", { own: 2, team: 1 })).toBe("team");
    expect(listingScope("own", { own: 0, team: 3 })).toBe("own");
  });
  it("with the API's counts the rows are shown as sent", () => {
    const page = { page: 2, size: 12, total: 20, pages: 2 };
    const v = listingsView({ listings: [listing()], page, counts: { own: 20, team: 0, byState: { PENDING_APPROVAL: 20 } } }, "own", "");
    expect(v.paged).toBe(true);
    expect(v.page).toBe(page);
    expect(v.rows.map((l) => l.id)).toEqual(["l1"]);
    expect(v.counts.byState.PENDING_APPROVAL).toBe(20);
  });
  it("the legacy shape is derived as before: own with ended last, the team's live ones, by state", () => {
    const all = [listing({ id: "a", state: "ARCHIVED" }), listing({ id: "b", state: "PUBLISHED" }), teamListing(), teamListing({ id: "l3", state: "ARCHIVED" })];
    const own = listingsView({ listings: all }, "own", "");
    expect(own.paged).toBe(false);
    expect(own.rows.map((l) => l.id)).toEqual(["b", "a"]);
    expect(own.counts).toEqual({ own: 2, team: 1, byState: { ARCHIVED: 1, PUBLISHED: 2 } });
    expect(own.page).toEqual({ page: 1, size: 2, total: 2, pages: 1 });
    expect(listingsView({ listings: all }, "team", "").rows.map((l) => l.id)).toEqual(["l2"]);
    expect(listingsView({ listings: all }, "own", "ARCHIVED").rows.map((l) => l.id)).toEqual(["a"]);
  });
  it("rostered from the counts, or from what the rows say", () => {
    expect(rosterFrom({ own: 0, team: 2 }, [])).toEqual({ onTeam: true, teamName: null });
    expect(rosterFrom({ own: 0, team: 2 }, [teamListing()])).toEqual({ onTeam: true, teamName: "Westfield Hawks" });
    expect(rosterFrom({ own: 1, team: 0 }, [listing({ blockers: ["athlete: on a team — their team lists their items"] })])).toEqual({ onTeam: true, teamName: null });
    expect(rosterFrom({ own: 1, team: 0 }, [listing()])).toEqual({ onTeam: false, teamName: null });
    expect(rosterFrom({ own: 0, team: 0 }, [])).toEqual({ onTeam: false, teamName: null });
  });
  it("the KPI plates come from the counts; no plate for an unlisted figure the API didn't send", () => {
    const tiles = listingTiles({ PUBLISHED: 3, PENDING_APPROVAL: 1, DRAFT: 2, PAUSED: 1 }, 4);
    expect(tiles.map((t) => [t.key, t.value])).toEqual([["live", 3], ["held", 1], ["idle", 3], ["ready", 4]]);
    expect(tiles.map((t) => t.tone)).toEqual(["win", "warn", "blue", "flare"]);
    expect(listingTiles({}, null).map((t) => [t.key, t.value, t.tone])).toEqual([["live", 0, "ink"], ["held", 0, "ink"], ["idle", 0, "ink"]]);
  });
  it("ready to list: the API's unlisted page as sent, else every item minus the listed ones", () => {
    const other = { ...item, id: "i2" };
    expect(readyRows([item, other], [listing()], true).map((i) => i.id)).toEqual(["i1", "i2"]);
    expect(readyRows([item, other], [listing()], false).map((i) => i.id)).toEqual(["i2"]);
  });
  it("the status filter speaks the badges' words", () => {
    expect(LISTING_STATE_OPTIONS.map((o) => o.label)).toEqual(["Live", "BTG is taking a look", "Not listed yet", "Paused", "Ended"]);
  });
});
