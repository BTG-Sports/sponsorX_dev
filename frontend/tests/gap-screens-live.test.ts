import { describe, expect, it } from "vitest";

import {
  duration,
  filterBriefs,
  nextMoves,
  sportOptions,
  tabCounts,
  toBriefRow,
  waitingSummary,
  type ApiBrief,
} from "../src/lib/briefs-live";
import { actionTotal, campaignLines, healthRows, queueCards, type ApiIntegrationHealth } from "../src/lib/ops-board-live";
import { buildHome, statusOf } from "../src/lib/athlete-home-live";
import { buildPropertyHome, shareLabel } from "../src/lib/property-home-live";
import type { ApiMyProfile } from "../src/lib/profile-live";

/* --------------------------------------------------------------------------
   The four screens the staging walkthrough found missing: P4-FE-07 (Briefs
   queue), P7-FE-06 (Operations Board), P3-FE-06 (athlete home), P3-FE-07
   (property home). These are their pure pieces — every figure a screen shows
   comes through one of them, from an API row.
   -------------------------------------------------------------------------- */

const brief = (over: Partial<ApiBrief> = {}): ApiBrief => ({
  id: "b1",
  objective: "Two clinics.\n\nNote: We'd love Riley.",
  state: "DRAFT",
  budget: 100000,
  startDate: "2026-10-19T00:00:00.000Z",
  endDate: "2026-11-16T00:00:00.000Z",
  sports: ["Basketball"],
  stateCodes: ["MD"],
  categories: ["RESTAURANT"],
  createdAt: "2026-09-29T08:00:00.000Z",
  sponsorName: "Harbor Coffee",
  closeReason: null,
  package: { code: "TEST_DRIVE", name: "SponsorX Test Drive", athleteCountMin: 3, athleteCountMax: 3, priceLow: 750, priceHigh: 750 },
  campaign: null,
  ...over,
});

describe("P4-FE-07 · the Briefs queue", () => {
  it("a brief becomes a row of real fields only", () => {
    const r = toBriefRow(brief());
    expect(r).toMatchObject({
      sponsor: "Harbor Coffee", mono: "HC", stateLabel: "Draft", tone: "warn",
      packageName: "SponsorX Test Drive", packagePrice: "$750", budget: "$1,000",
      start: "Oct 19, 2026", duration: "4 weeks", sports: "Basketball", geography: "MD",
      category: "Restaurant", submitted: "Sep 29, 2026",
    });
    expect(r.objective).toContain("We'd love Riley");
  });

  it("an open brief says so instead of inventing targeting", () => {
    const r = toBriefRow(brief({ sports: [], stateCodes: [], categories: [], package: null }));
    expect(r).toMatchObject({ sports: "Any sport", geography: "Any geography", category: "Not given", packageName: "Custom brief", packagePrice: null });
  });

  it("offers exactly the moves the §21 machine allows", () => {
    expect(nextMoves("DRAFT")).toEqual({ qualify: true, approve: false, close: true, match: false });
    expect(nextMoves("QUALIFIED")).toEqual({ qualify: false, approve: true, close: true, match: true });
    expect(nextMoves("APPROVED")).toEqual({ qualify: false, approve: false, close: true, match: true });
    expect(nextMoves("CAMPAIGN_CREATED")).toEqual({ qualify: false, approve: false, close: false, match: false });
    expect(nextMoves("CLOSED")).toEqual({ qualify: false, approve: false, close: false, match: false });
  });

  it("tabs count every state, and filters combine tab, sport and search", () => {
    const rows = [
      brief({ id: "a" }),
      brief({ id: "b", state: "QUALIFIED", sports: ["Soccer"], sponsorName: "Bowie Auto Care" }),
      brief({ id: "c", state: "CLOSED" }),
    ].map(toBriefRow);
    expect(tabCounts(rows)).toMatchObject({ all: 3, DRAFT: 1, QUALIFIED: 1, CLOSED: 1, APPROVED: 0 });
    expect(sportOptions(rows)).toEqual(["Basketball", "Soccer"]);
    expect(filterBriefs(rows, { tab: "all", sport: "Soccer", q: "" }).map((r) => r.id)).toEqual(["b"]);
    expect(filterBriefs(rows, { tab: "DRAFT", sport: "", q: "" }).map((r) => r.id)).toEqual(["a"]);
    expect(filterBriefs(rows, { tab: "all", sport: "", q: "bowie" }).map((r) => r.id)).toEqual(["b"]);
  });

  it("the Campaigns link appears only when something waits", () => {
    expect(waitingSummary([{ state: "CLOSED" }, { state: "CAMPAIGN_CREATED" }])).toBeNull();
    expect(waitingSummary([{ state: "DRAFT" }, { state: "QUALIFIED" }, { state: "APPROVED" }, { state: "DRAFT" }]))
      .toEqual({ toMatch: 2, qualified: 1, approved: 1, drafts: 2 });
  });

  it("durations read as people say them", () => {
    expect(duration("2026-10-01T00:00:00Z", "2026-10-08T00:00:00Z")).toBe("1 week");
    expect(duration("2026-10-01T00:00:00Z", "2026-10-11T00:00:00Z")).toBe("10 days");
  });
});

describe("P7-FE-06 · the Operations Board", () => {
  it("a role gets a card only for the queues it reads", () => {
    const finance = queueCards({ applications: null, approvals: null, briefs: null, finance: { held: 1, disputed: 1 } });
    expect(finance.map((c) => c.key)).toEqual(["finance"]);
    expect(finance[0]).toMatchObject({ count: 2, href: "/admin/finance" });
    expect(finance[0]?.chips.map((c) => c.text)).toEqual(["1 held", "1 disputed"]);
  });

  it("an admin's four cards link to the pages they count, and total them", () => {
    const cards = queueCards({
      applications: { waiting: 7, over48h: 2 }, approvals: { waiting: 4 },
      briefs: { toQualify: 2, toMatch: 2 }, finance: { held: 0, disputed: 0 },
    });
    expect(cards.map((c) => [c.key, c.count, c.href])).toEqual([
      ["applications", 7, "/admin/applications"], ["approvals", 4, "/admin/approvals"],
      ["briefs", 4, "/admin/briefs"], ["finance", 0, "/admin/finance"],
    ]);
    expect(cards[0]?.chips).toEqual([{ text: "2 over 48 hours", tone: "warn" }]);
    expect(cards[3]?.chips).toEqual([]);
    expect(actionTotal(cards)).toBe(15);
  });

  it("campaigns show done of due, overdue first", () => {
    const lines = campaignLines([
      { campaignId: "a", campaignName: "Fall Test Drive", endDate: "2026-11-30T00:00:00Z", deliverablesTotal: 10, deliverablesVerified: 4, deliverablesOverdue: 0 },
      { campaignId: "b", campaignName: "Local Blitz", endDate: "2026-11-15T00:00:00Z", deliverablesTotal: 5, deliverablesVerified: 1, deliverablesOverdue: 2 },
    ]);
    expect(lines.map((l) => l.id)).toEqual(["b", "a"]);
    expect(lines[1]).toMatchObject({ done: 4, due: 10, ends: "Ends Nov 30", mono: "FT" });
  });

  it("integration health shows only dependencies the API reports, with the Integrations page's rules", () => {
    const h: ApiIntegrationHealth = {
      checkedAt: "2026-09-29T10:00:00Z",
      dependencies: { db: true, redis: false, storage: true },
      sync: [{ entity: "Briefs (Deals)", linked: 1, total: 2, lastSyncAt: "2026-09-29T09:56:00Z" }],
      webhooks: { bySource: [] },
      queue: { outboxPending: [{ name: "zoho.pushDeal", count: 2, oldest: "2026-09-29T09:58:00Z" }], jobs: [] },
    };
    const rows = healthRows(h);
    expect(rows.map((r) => r.name)).toEqual(["Postgres", "Worker queue", "Zoho CRM + Books", "Cloudflare R2", "Redis"]);
    expect(rows.find((r) => r.name === "Redis")?.status).toBe("Down");
    expect(rows.find((r) => r.name === "Zoho CRM + Books")).toMatchObject({ status: "Syncing", detail: "Last sync 4 min ago · 2 queued" });
    expect(rows.find((r) => r.name === "Worker queue")?.status).toBe("Operational");
    const stale = healthRows({ ...h, queue: { ...h.queue, outboxPending: [{ name: "notify.email", count: 1, oldest: "2026-09-29T09:00:00Z" }] } });
    expect(stale.find((r) => r.name === "Worker queue")?.status).toBe("Degraded");
  });
});

const profile = (over: Partial<ApiMyProfile> = {}): ApiMyProfile => ({
  id: "ath", slug: "riley-carter", displayName: "RILEY.CARTER", legalName: "Riley Carter",
  city: "Laurel", stateCode: "MD", sport: "Basketball", position: "Guard", school: null, level: null, gradYear: null,
  achievements: null, state: "APPROVED", tier: null, contentCapabilities: [], brandInterests: [],
  restrictedCategories: [], restrictionNotes: null, socials: [], ratesConfirmed: 0, agreementsSigned: 0, ...over,
});

describe("P3-FE-06 · the athlete home", () => {
  const now = new Date("2026-09-29T12:00:00Z");

  it("a newly approved athlete sees their own name, status, completion and honest empty blocks", () => {
    const h = buildHome({ profile: profile(), invitations: [], deliverables: [], earnings: [], now });
    expect(h.firstName).toBe("Riley");
    expect(h.status?.label).toBe("Approved");
    expect(h.profile).toMatchObject({ done: 2, total: 8 });
    expect(h.profile?.missing).toContain("Rate card");
    expect(h.inviteCount).toBe(0);
    expect(h.dueCount).toBe(0);
    expect(h.hasEarnings).toBe(false);
    expect(h.earnings.map((e) => e.amount)).toEqual(["$0", "$0", "$0", "$0"]);
  });

  it("only open invitations count, soonest expiry first", () => {
    const inv = (id: string, state: string, expiresAt: string) => ({
      id, state, offered: 25000, jobId: "j", jobName: "Clinic", campaignName: "Fall Test Drive", sponsorName: "Harbor Coffee",
      sentAt: "2026-09-28T00:00:00Z", viewedAt: null, respondedAt: null, expiresAt,
    }) as never;
    const h = buildHome({
      profile: profile({ state: "ACTIVE" }), deliverables: [], earnings: [], now,
      invitations: [inv("late", "INVITED", "2026-10-05T12:00:00Z"), inv("soon", "VIEWED", "2026-09-30T12:00:00Z"), inv("done", "ACCEPTED", "2026-10-01T00:00:00Z")],
    });
    expect(h.inviteCount).toBe(2);
    expect(h.invites.map((i) => i.id)).toEqual(["soon", "late"]);
    expect(h.invites[0]).toMatchObject({ sponsor: "Harbor Coffee", mono: "HC", offer: "$250", urgent: true });
    expect(h.status?.label).toBe("Active");
  });

  it("earnings are the athlete's real amounts by status", () => {
    const earning = (state: string, amount: number) => ({ id: state, state, amount }) as never;
    const h = buildHome({ profile: profile(), invitations: [], deliverables: [], now, earnings: [earning("PENDING", 54258), earning("PAID", 6166)] });
    expect(h.earnings.map((e) => [e.label, e.amount])).toEqual([["Pending", "$542.58"], ["Eligible", "$0"], ["Approved", "$0"], ["Paid", "$61.66"]]);
  });

  it("a guardian has no profile block and no invented name", () => {
    const h = buildHome({ profile: null, invitations: [], deliverables: [], earnings: [], now });
    expect(h).toMatchObject({ firstName: null, profile: null, status: null });
  });

  it("status copy covers the states an athlete can be in", () => {
    expect(statusOf("UNDER_REVIEW").label).toBe("In review");
    expect(statusOf("CHANGES_REQUESTED").label).toBe("Changes requested");
  });
});

describe("P3-FE-07 · the property home", () => {
  it("shows the manager's own property, roster shares and inventory", () => {
    const p = buildPropertyHome(
      { property: { id: "p", slug: "westfield-hawks", name: "Westfield Hawks", kind: "TEAM", city: "Laurel", stateCode: "MD" } },
      {
        property: { id: "p", name: "Westfield Hawks", kind: "TEAM" },
        athletes: [{ id: "r", displayName: "RILEY.CARTER", legalName: "Riley Carter", sport: "Basketball", state: "ACTIVE", teamShareBps: 2000, inventory: [] }],
        inventory: [{ id: "i", title: "Courtside signage", kind: "SIGNAGE", priceCents: 120000, quantity: 8, active: true }],
      },
    );
    expect(p).toMatchObject({ name: "Westfield Hawks", kind: "Team", place: "Laurel, MD" });
    expect(p.athletes).toEqual([{ id: "r", name: "Riley Carter", mono: "RC", sport: "Basketball", share: "20%", shareSet: true }]);
    expect(p.inventory).toEqual([{ id: "i", title: "Courtside signage", kind: "Signage", qty: "8 available", price: "$1,200", status: "Active" }]);
  });

  it("a school with nothing yet is empty, not sample data", () => {
    const p = buildPropertyHome({ property: { id: "s", slug: "northside-high", name: "Northside High School", kind: "SCHOOL", city: "Bowie", stateCode: "MD" } }, null);
    expect(p).toMatchObject({ kind: "School", athletes: [], inventory: [] });
    expect(shareLabel(null)).toBe("Not set");
  });
});
