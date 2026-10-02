import { describe, expect, it } from "vitest";

import {
  apiErrorMessage,
  athleteState,
  buildAnalytics,
  buildEarnings,
  contrastChecks,
  contrastRatio,
  governanceChecklist,
  inventoryOption,
  listingControls,
  listingPatch,
  listingRow,
  liveListingByItem,
  monthLabel,
  packageContents,
  parseSharePercent,
  pct,
  publishDateInput,
  publishDateIso,
  rosterRow,
  shareInput,
  shareText,
  usdCents,
  validateBranding,
  validateListingDraft,
  validateLogoFile,
  validateRosterDraft,
  EMPTY_ROSTER_DRAFT,
  PAYOUTS_NOTE,
  type ApiAnalytics,
  type ApiLedger,
  type ApiListing,
} from "../src/lib/property-p2-live";

/* --------------------------------------------------------------------------
   The property manager's Phase 2 screens — 2S2-FE-04 (roster), 2S3-FE-01
   (listings), 2S5-FE-02 (earnings), 2S7-FE-01 (analytics), 2S7-FE-03
   (branding). Every figure comes through one of these from an API field.
   -------------------------------------------------------------------------- */

describe("shared formatting", () => {
  it("formats integer cents as USD", () => {
    expect(usdCents(123456)).toBe("$1,234.56");
    expect(usdCents(0)).toBe("$0.00");
    expect(usdCents(-2500)).toBe("−$25.00");
  });
  it("labels months and rates", () => {
    expect(monthLabel("2026-09")).toBe("Sep 2026");
    expect(monthLabel("bad")).toBe("bad");
    expect(pct(0.425)).toBe("42.5%");
    expect(pct(null)).toBe("—");
  });
  it("reads the API's refusal in its own words", () => {
    expect(apiErrorMessage({ error: { code: "conflict", message: "a@b.co already has a SponsorX account." } }, 409, "x").message).toBe("a@b.co already has a SponsorX account.");
    expect(apiErrorMessage({ error: { message: "Invalid", issues: [{ path: ["email"], message: "Invalid email" }] } }, 400, "x").message).toBe("email: Invalid email");
    expect(apiErrorMessage({ error: { message: "m", reasons: [{ code: "SOLD_OUT", message: "Sold out" }] } }, 409, "x").message).toBe("Sold out");
    const g = apiErrorMessage({ error: { message: "Not publishable yet: item: inactive.", problems: ["item: inactive"] } }, 422, "x");
    expect(g.problems).toEqual(["item: inactive"]);
    expect(apiErrorMessage(null, 500, "Nothing saved").message).toBe("Nothing saved (HTTP 500).");
  });
});

describe("2S2-FE-04 · roster", () => {
  it("shows the share as a percentage, stored in basis points", () => {
    expect(shareInput(1250)).toBe("12.5");
    expect(shareText(1000)).toBe("10%");
    expect(shareText(null)).toBe("Not set");
    expect(parseSharePercent("12.5")).toEqual({ ok: true, bps: 1250 });
    expect(parseSharePercent("12.5%")).toEqual({ ok: true, bps: 1250 });
    expect(parseSharePercent("  ")).toEqual({ ok: true, bps: null });
    expect(parseSharePercent("100")).toEqual({ ok: true, bps: 10000 });
    expect(parseSharePercent("100.01").ok).toBe(false);
    expect(parseSharePercent("-1").ok).toBe(false);
    expect(parseSharePercent("1.234").ok).toBe(false);
    expect(parseSharePercent("abc").ok).toBe(false);
  });

  it("a row carries the athlete's state and no invented earnings", () => {
    const r = rosterRow({ id: "a1", displayName: "Jordan R.", legalName: "Jordan Reyes", sport: "Basketball", position: "Guard", gradYear: 2027, state: "UNDER_REVIEW", teamShareBps: null });
    expect(r).toMatchObject({ name: "Jordan R.", legalName: "Jordan Reyes", detail: "Guard · Class of 2027", stateLabel: "Under review", stateTone: "warn", share: "Not set", shareSet: false });
    expect(r).not.toHaveProperty("earned");
    expect(athleteState("SOMETHING_NEW").label).toBe("Something new");
  });

  it("validates the add-athlete form like RosterAthleteInput", () => {
    const bad = validateRosterDraft(EMPTY_ROSTER_DRAFT);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(["displayName", "email", "legalName", "sport"]);
    const ok = validateRosterDraft({ ...EMPTY_ROSTER_DRAFT, legalName: " Jordan Reyes ", displayName: "Jordan R.", email: "j@x.org", sport: "Basketball", gradYear: "2027", teamShare: "10", ageBand: "16_17" });
    expect(ok).toEqual({
      ok: true,
      input: { legalName: "Jordan Reyes", displayName: "Jordan R.", email: "j@x.org", sport: "Basketball", position: null, gradYear: 2027, birthDate: null, ageBand: "16_17", teamShareBps: 1000 },
    });
    const yr = validateRosterDraft({ ...EMPTY_ROSTER_DRAFT, legalName: "a", displayName: "a", email: "a@b.co", sport: "s", gradYear: "27", teamShare: "150" });
    expect(yr.ok).toBe(false);
    if (!yr.ok) expect(Object.keys(yr.errors).sort()).toEqual(["gradYear", "teamShare"]);
  });
});

const listing = (over: Partial<ApiListing> = {}): ApiListing => ({
  id: "l1",
  propertyId: "p1",
  inventoryItemId: "i1",
  title: "Game Day package",
  description: "Two banners at the home opener, plus a PA read.",
  visibility: "PUBLIC",
  state: "DRAFT",
  publishAt: null,
  submittedAt: null,
  reviewNotes: null,
  decidedAt: null,
  publishedAt: null,
  createdAt: "2026-09-20T00:00:00.000Z",
  updatedAt: "2026-09-28T00:00:00.000Z",
  item: { id: "i1", title: "Banner", kind: "SIGNAGE", priceCents: 150000, quantity: 4, availableUntil: "2026-12-31T00:00:00.000Z", active: true, athleteId: null, propertyId: "p1" },
  propertyName: "Westfield Hawks",
  blockers: [],
  ...over,
});

describe("2S3-FE-01 · listings", () => {
  it("offers only the owner's moves from each state", () => {
    expect(listingControls("DRAFT")).toEqual({ editable: true, canSubmit: true, moves: [{ to: "ARCHIVED", label: "Archive" }] });
    /* 2S3-BE-06 — held for BTG: editable (the edit takes it back to a draft) and submittable again. */
    expect(listingControls("PENDING_APPROVAL")).toEqual({ editable: true, canSubmit: true, moves: [{ to: "ARCHIVED", label: "Archive" }] });
    expect(listingControls("PUBLISHED").editable).toBe(false);
    expect(listingControls("PUBLISHED").moves.map((m) => m.to)).toEqual(["PAUSED", "ARCHIVED"]);
    expect(listingControls("PAUSED")).toMatchObject({ editable: true, canSubmit: false });
    expect(listingControls("PAUSED").moves.map((m) => m.to)).toEqual(["PUBLISHED", "ARCHIVED"]);
    expect(listingControls("ARCHIVED").moves).toEqual([]);
  });

  it("a row shows its state, price, blockers and a BTG change request", () => {
    const r = listingRow(listing({ reviewNotes: "Say which game.", blockers: ["item: inactive"] }));
    expect(r).toMatchObject({ stateLabel: "Draft", price: "$1,500.00", item: "Banner · Signage", blockers: 1, changesRequested: true });
    expect(listingRow(listing({ state: "ARCHIVED", blockers: ["item: inactive"] })).blockers).toBe(0);
  });

  it("knows which items already have a live listing", () => {
    const m = liveListingByItem([listing(), listing({ id: "l2", inventoryItemId: "i2", state: "ARCHIVED" })]);
    expect(m.get("i1")).toBe("l1");
    expect(m.has("i2")).toBe(false);
  });

  it("the checklist marks the API's blockers and re-checks the wording live", () => {
    const draft = { title: "", description: "short", visibility: "PUBLIC" as const, publishAt: "2027-01-05T00:00:00.000Z" };
    const rows = governanceChecklist(["property: not approved to list (onboarding not approved, or suspended)", "item: inactive", "something new"], draft, { availableUntil: "2026-12-31T00:00:00.000Z" });
    const failing = rows.filter((r) => !r.ok).map((r) => r.key);
    expect(failing).toEqual(["property", "active", "title", "description", "timing", "x:something new"]);
    expect(rows.find((r) => r.key === "description")?.note).toContain("5 of 20");
    const clear = governanceChecklist(["listing: no title"], { ...draft, title: "Game Day", description: "Two banners at the home opener.", publishAt: null }, { availableUntil: null });
    expect(clear.every((r) => r.ok)).toBe(true);
  });

  it("validates the draft like ListingInput and diffs it", () => {
    expect(validateListingDraft({ title: " ", description: "", visibility: "PUBLIC", publishAt: null }).ok).toBe(false);
    expect(validateListingDraft({ title: "T", description: "  ", visibility: "PRIVATE", publishAt: "2026-10-01T00:00:00.000Z" })).toEqual({
      ok: true,
      body: { title: "T", description: null, visibility: "PRIVATE", publishAt: "2026-10-01T00:00:00.000Z" },
    });
    const saved = { title: "T", description: "d", visibility: "PUBLIC" as const, publishAt: null };
    expect(listingPatch(saved, saved)).toEqual({});
    expect(Object.keys(listingPatch(saved, { ...saved, visibility: "PRIVATE", publishAt: "2026-10-01T00:00:00.000Z" }))).toEqual(["visibility", "publishAt"]);
  });

  it("keeps the publish day in UTC both ways", () => {
    expect(publishDateInput("2026-10-01T00:00:00.000Z")).toBe("2026-10-01");
    expect(publishDateInput(null)).toBe("");
    expect(publishDateIso("2026-10-01")).toBe("2026-10-01T00:00:00.000Z");
    expect(publishDateIso("")).toBeNull();
  });

  it("an inventory choice names its owner", () => {
    const base = { id: "i1", title: "Autograph session", kind: "AUTOGRAPH", priceCents: 20000, quantity: null, availableFrom: null, availableUntil: null, active: true, version: 1 };
    expect(inventoryOption({ ...base, owner: "Jordan R." })).toMatchObject({ owner: "Jordan R.", kind: "Autograph", price: "$200.00", qty: "Open quantity" });
    expect(inventoryOption({ ...base, owner: null }).owner).toBe("Team");
  });

  it("a package lists its components and what they'd cost separately", () => {
    const p = packageContents({
      priceCents: 120000,
      packageRules: { bundleOnly: true, requiresApproval: true },
      components: [
        { quantity: 2, component: { id: "c1", title: "Banner", kind: "SIGNAGE", priceCents: 50000 } },
        { quantity: 1, component: { id: "c2", title: "Tickets", kind: "TICKETS", priceCents: 30000 } },
      ],
    });
    expect(p.rows.map((r) => r.line)).toEqual(["$1,000.00", "$300.00"]);
    expect(p.separately).toBe("$1,300.00");
    expect(p.price).toBe("$1,200.00");
    expect(p.rules).toEqual(["Sold only as this bundle", "You approve each order (48 hours to answer)"]);
    expect(packageContents({ priceCents: 1, packageRules: null, components: [] }).separately).toBeNull();
  });
});

const ledger: ApiLedger = {
  currency: "USD",
  bookedRevenueCents: 500000,
  reversedCents: 50000,
  paidEarningsCents: 0,
  ledgerBalanceCents: 450000,
  pendingEarnings: { awaitingSponsorPaymentCents: 200000, availableCents: 150000, reservedCents: 100000, totalCents: 450000 },
  reconciles: true,
};

const analytics: ApiAnalytics = {
  currency: "USD",
  revenue: {
    bookedCents: 500000,
    reversedCents: 50000,
    netCents: 450000,
    byMonth: [
      { month: "2026-08", bookedCents: 200000, reversedCents: 0, paidCents: 0 },
      { month: "2026-09", bookedCents: 300000, reversedCents: 50000, paidCents: 0 },
    ],
  },
  campaignCompletion: { contractedOrders: 0, completedOrders: 0, cancelledOrders: 0, rate: null },
  sellThrough: [
    { itemId: "i1", title: "Banner", kind: "SIGNAGE", stock: 4, soldUnits: 1, rate: 0.25 },
    { itemId: "i2", title: "Open item", kind: "OTHER", stock: null, soldUnits: 3, rate: null },
  ],
  sponsorMix: [
    { category: "RESTAURANT", bookedCents: 300000 },
    { category: "UNCATEGORISED", bookedCents: 200000 },
  ],
  payoutTrends: [],
  averageCpm: null,
  averageCpmBasis: "Not shown: marketplace inventory carries no impression data yet, so a CPM would have no source.",
  reconciles: true,
};

describe("2S5-FE-02 · earnings", () => {
  it("tiles are the ledger's pending buckets", () => {
    const e = buildEarnings(ledger, analytics.revenue.byMonth);
    expect(e.tiles.map((t) => t.value)).toEqual(["$4,500.00", "$1,500.00", "$1,000.00", "$2,000.00"]);
    expect(e.reconciles).toBe(true);
    expect(e.empty).toBe(false);
  });
  it("paid is labelled as not started, never a payout history", () => {
    const e = buildEarnings(ledger, []);
    expect(e.breakdown.find((b) => b.key === "paid")).toMatchObject({ value: "$0.00", note: PAYOUTS_NOTE });
    expect(e.breakdown.find((b) => b.key === "balance")).toMatchObject({ value: "$4,500.00", total: true });
    expect(e).not.toHaveProperty("payouts");
  });
  it("months are newest first with net = booked − reversed", () => {
    const e = buildEarnings(ledger, analytics.revenue.byMonth);
    expect(e.months).toEqual([
      { month: "2026-09", label: "Sep 2026", booked: "$3,000.00", reversed: "−$500.00", net: "$2,500.00" },
      { month: "2026-08", label: "Aug 2026", booked: "$2,000.00", reversed: "—", net: "$2,000.00" },
    ]);
  });
});

describe("2S7-FE-01 · analytics", () => {
  it("a null rate is a dash, and CPM is the API's reason, not a number", () => {
    const a = buildAnalytics(analytics);
    expect(a.kpis.find((k) => k.key === "completion")).toMatchObject({ value: "—", sub: "No contracted orders yet" });
    expect(a.cpm).toEqual({ value: null, basis: analytics.averageCpmBasis });
    expect(a.sellThrough.map((s) => [s.stock, s.rate])).toEqual([["4", "25%"], ["Open", "—"]]);
  });
  it("revenue by month is chronological; sponsor mix by category label", () => {
    const a = buildAnalytics(analytics);
    expect(a.months.map((m) => [m.label, m.display])).toEqual([["Aug 2026", "$2,000.00"], ["Sep 2026", "$2,500.00"]]);
    expect(a.mix.map((m) => m.label)).toEqual(["Restaurant", "Uncategorised"]);
    expect(buildAnalytics({ ...analytics, campaignCompletion: { contractedOrders: 4, completedOrders: 3, cancelledOrders: 1, rate: 0.75 } }).kpis[2]).toMatchObject({ value: "75%", sub: "3 of 4 completed" });
  });
});

describe("2S7-FE-03 · branding", () => {
  const blank = { displayName: "", primaryColor: "", accentColor: "", reportFooter: "", customDomain: "" };
  it("an emptied field clears it, colours are #RRGGBB", () => {
    expect(validateBranding(blank)).toEqual({ ok: true, input: { displayName: null, primaryColor: null, accentColor: null, reportFooter: null, customDomain: null } });
    expect(validateBranding({ ...blank, displayName: " Hawks ", primaryColor: "#1a5cff", customDomain: "Partners.Example.com" })).toEqual({
      ok: true,
      input: { displayName: "Hawks", primaryColor: "#1A5CFF", accentColor: null, reportFooter: null, customDomain: "partners.example.com" },
    });
    const bad = validateBranding({ ...blank, primaryColor: "blue", accentColor: "#FFF", customDomain: "hawks.sponsorx.net" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(["accentColor", "customDomain", "primaryColor"]);
  });
  it("a logo is a PNG or JPEG up to 1 MB", () => {
    expect(validateLogoFile({ type: "image/png", size: 2048 })).toEqual({ ok: true, contentType: "image/png", bytes: 2048 });
    expect(validateLogoFile({ type: "image/svg+xml", size: 10 }).ok).toBe(false);
    expect(validateLogoFile({ type: "image/jpeg", size: 1024 * 1024 + 1 }).ok).toBe(false);
  });
  it("contrast is computed from the colour itself", () => {
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 5);
    const c = contrastChecks("#1A5CFF");
    expect(c?.find((x) => x.key === "white")?.passes).toBe(true);
    expect(contrastChecks("#FFFF00")?.find((x) => x.key === "white")?.passes).toBe(false);
    expect(contrastChecks("nope")).toBeNull();
  });
});
