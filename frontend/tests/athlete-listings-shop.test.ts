import { describe, expect, it } from "vitest";

import type { ApiAthleteListing, ListCheck } from "@/lib/athlete-listings-live";
import { listingCard, listingTab, listingTabPatch, listingTabs, readyItem, tabState } from "@/lib/athlete-listings-shop";

/* POL-FE-84 — the words on the athlete's listings and their tabs. */

const NOW = Date.parse("2026-11-16T15:00:00.000Z");

const listing = (over: Partial<ApiAthleteListing> = {}): ApiAthleteListing => ({
  id: "pol84_l1",
  propertyId: null,
  sellerAthleteId: "pol84_a1",
  inventoryItemId: "pol84_i1",
  title: "Basketball clinic",
  description: "A 90-minute clinic with your name on it.",
  visibility: "PUBLIC",
  state: "PUBLISHED",
  publishAt: null,
  submittedAt: "2026-11-10T00:00:00.000Z",
  reviewNotes: null,
  decidedAt: null,
  publishedAt: "2026-11-10T00:00:00.000Z",
  createdAt: "2026-11-10T00:00:00.000Z",
  updatedAt: "2026-11-12T00:00:00.000Z",
  item: { id: "pol84_i1", title: "Basketball clinic", kind: "CAMP", priceCents: 25_000, quantity: 5, availableUntil: null, active: true, athleteId: "pol84_a1", propertyId: null },
  propertyName: null,
  seller: { type: "ATHLETE", id: "pol84_a1", name: "Jordan" },
  blockers: [],
  ...over,
});

describe("listingCard", () => {
  it("a live listing says so, has the switch on, and opens", () => {
    const c = listingCard(listing(), NOW);
    expect(c.status).toEqual({ label: "Live on the marketplace", tone: "live" });
    expect(c.note).toBe("Sponsors can buy it now.");
    expect(c.live).toBe(true);
    expect(c.cta).toBe("Open");
    expect(c.price).toBe("$250.00");
    expect(c.stock.label).toBe("5 in stock");
  });

  it("a draft reads Draft, not 'Not listed yet', and asks to be finished", () => {
    const c = listingCard(listing({ state: "DRAFT", publishedAt: null }), NOW);
    expect(c.status).toEqual({ label: "Draft", tone: "none" });
    expect(c.cta).toBe("Finish & submit");
    expect(c.live).toBeNull();
  });

  it("a draft BTG sent back says changes were asked", () => {
    const c = listingCard(listing({ state: "DRAFT", reviewNotes: "Name the venue." }), NOW);
    expect(c.status).toEqual({ label: "Changes asked", tone: "fix" });
    expect(c.cta).toBe("Make the changes");
  });

  it("held for BTG names the restricted words to edit out", () => {
    const c = listingCard(listing({ state: "PENDING_APPROVAL", hold: { restrictedWords: ["poker", "poker"], accountCheck: false, pausedByBtg: false, message: "" } }), NOW);
    expect(c.status.label).toBe("In review by BTG");
    expect(c.note).toBe("Restricted words: “poker”. Edit them out, or wait for BTG.");
    expect(c.live).toBeNull();
  });

  it("published with a later day goes live then; published with the item paused is hidden", () => {
    expect(listingCard(listing({ publishAt: "2026-12-03T00:00:00.000Z" }), NOW).status).toEqual({ label: "Goes live Dec 3, 2026", tone: "soon" });
    const hidden = listingCard(listing({ item: { ...listing().item, active: false } }), NOW);
    expect(hidden.status).toEqual({ label: "Hidden while the item is paused", tone: "off" });
    expect(hidden.note).toMatch(/Switch the item to Available in Inventory/);
  });

  it("paused has the switch off; a BTG pause says BTG puts it back", () => {
    expect(listingCard(listing({ state: "PAUSED" }), NOW).live).toBe(false);
    const btg = listingCard(listing({ state: "PAUSED", btgAction: "PAUSED", btgReason: "Check" }), NOW);
    expect(btg.status.label).toBe("Paused by BTG");
    expect(btg.note).toMatch(/BTG puts it back live/);
  });

  it("ended has no switch", () => {
    const c = listingCard(listing({ state: "ARCHIVED" }), NOW);
    expect(c.status).toEqual({ label: "Ended", tone: "ended" });
    expect(c.live).toBeNull();
  });

  it("a team's listing is read-only and names the team", () => {
    const c = listingCard(listing({ propertyId: "pol84_p1", sellerAthleteId: null, seller: { type: "PROPERTY", id: "pol84_p1", name: "Tigers" } }), NOW);
    expect(c.own).toBe(false);
    expect(c.live).toBeNull();
    expect(c.note).toBe("Listed by Tigers. Every sale shows on your Orders page.");
  });
});

describe("the tabs", () => {
  it("read the old ?state filter, and write it back", () => {
    expect(listingTab({ state: "PUBLISHED" })).toBe("live");
    expect(listingTab({ state: "PENDING_APPROVAL" })).toBe("review");
    expect(listingTab({ state: "nonsense" })).toBe("all");
    expect(listingTab({})).toBe("all");
    expect(tabState("draft")).toBe("DRAFT");
    expect(tabState("all")).toBe("");
    expect(listingTabPatch("ended")).toEqual({ state: "ARCHIVED" });
    expect(listingTabPatch("all")).toEqual({ state: null });
  });

  it("count from byState: All, Live always, then the states that have any", () => {
    const tabs = listingTabs({ PUBLISHED: 2, DRAFT: 1, ARCHIVED: 0 }, "all");
    expect(tabs).toEqual([
      { key: "all", label: "All", count: 3 },
      { key: "live", label: "Live", count: 2 },
      { key: "draft", label: "Drafts", count: 1 },
    ]);
    expect(listingTabs({}, "paused").map((t) => t.key)).toEqual(["all", "live", "paused"]);
  });
});

describe("readyItem", () => {
  it("carries the item's words, its checks, and whether it's paused", () => {
    const checks: ListCheck[] = [{ key: "description", label: "x", status: "fix" }];
    const r = readyItem({ id: "pol84_i2", title: "Signed jersey", kind: "AUTOGRAPH", priceCents: 9_900, quantity: 2, availableUntil: null, active: false, description: "  One signed jersey.  " }, checks);
    expect(r).toMatchObject({ kindLabel: "Autograph session", price: "$99.00", paused: true, initial: "One signed jersey.", checks });
    expect(r.stock).toEqual({ label: "Only 2 left", tone: "low" });
  });
});
