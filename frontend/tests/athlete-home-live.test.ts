import { describe, expect, it } from "vitest";

import { athleteHome, type AthleteHomeInput } from "../src/lib/athlete-home-live";
import type { ApiDeliverable } from "../src/lib/deliverables-live";
import type { ApiEarningsSummary } from "../src/lib/earnings-live";
import type { ApiInvitation } from "../src/lib/invitations-live";
import type { ApiMyProfile } from "../src/lib/profile-live";

/* --------------------------------------------------------------------------
   P2-FE-01 — the athlete dashboard's live derivations, SERVER-PAGED
   (2026-09-29). What must hold: counts and money are the API's aggregates,
   never the length of the rows shown; a lapsed invite is not "open"; a
   minor without a verified guardian gets no live upload link; when more
   exist than the dashboard shows, it says so.
   -------------------------------------------------------------------------- */

const NOW = new Date("2026-10-15T12:00:00Z");

const profile = (over: Partial<ApiMyProfile> = {}): ApiMyProfile => ({
  id: "ath_1", slug: "jordan-lee", displayName: "Jordan Lee", legalName: "Jordan Lee",
  city: "Bowie", stateCode: "MD", sport: "Football", position: "WR", school: "Bowie High",
  level: null, gradYear: 2027, achievements: null, state: "ACTIVE", tier: "CREATOR",
  contentCapabilities: ["SX-03"], brandInterests: ["AUTO"], restrictedCategories: [],
  restrictionNotes: "none", socials: [{ platform: "INSTAGRAM", handle: "jl", followers: 1200, avgViews: null, source: "SELF_REPORTED" }],
  ratesConfirmed: 1, agreementsSigned: 1,
  ...over,
});

const invite = (id: string, over: Partial<ApiInvitation> = {}): ApiInvitation => ({
  id, state: "INVITED", offered: 10_000, jobId: "SX-03", jobName: "Story", campaignName: "Fall Push",
  sponsorName: "Bowie Auto", sentAt: "2026-10-14T00:00:00Z", viewedAt: null, respondedAt: null,
  expiresAt: "2026-10-17T00:00:00Z",
  ...over,
});

const deliverable = (id: string, over: Partial<ApiDeliverable> = {}): ApiDeliverable => ({
  id, title: `Post ${id}`, dueDate: "2026-10-20T00:00:00Z", state: "NOT_STARTED", publishedUrl: null,
  publishedAt: null, orderId: "ord_1", jobId: "SX-03", jobName: "Story", appearance: false,
  athlete: { id: "ath_1", displayName: "Jordan Lee" },
  campaign: { id: "cmp_1", name: "Fall Push", sponsorName: "Bowie Auto" },
  latestAsset: null, assetCount: 0, revision: null,
  ...over,
});

const summary = (over: Partial<ApiEarningsSummary> = {}): ApiEarningsSummary => ({
  count: 4,
  byState: {
    PENDING: { count: 1, amount: 3_000 },
    ELIGIBLE: { count: 0, amount: 0 },
    APPROVED_FOR_PAYOUT: { count: 1, amount: 2_000 },
    PAID: { count: 1, amount: 5_000 },
    HELD: { count: 0, amount: 0 },
    DISPUTED: { count: 1, amount: 9_000 },
  },
  deliverables: { verified: 0, total: 1 },
  jobNames: ["Story"],
  career: { raised: 10_000, paid: 5_000, onTheWay: 2_000 },
  paidByMonth: { year: 2026, months: [0, 0, 0, 0, 0, 0, 0, 0, 5_000, 0, 0, 0] },
  ...over,
});

const input = (over: Partial<AthleteHomeInput> = {}): AthleteHomeInput => ({
  profile: profile(),
  invitesTop: [],
  openInvites: 0,
  dueTop: [],
  dueTotal: 0,
  reviewTop: [],
  reviewTotal: 0,
  activeCampaigns: 0,
  earnings: summary(),
  guardian: "not-required",
  ...over,
});

describe("the live athlete dashboard (server-paged)", () => {
  it("counts come from the aggregates, not from the rows shown", () => {
    const h = athleteHome(input({ invitesTop: [invite("a")], openInvites: 37, dueTop: [deliverable("d")], dueTotal: 12 }), NOW);
    expect(h.openInvites).toBe(37);
    expect(h.due).toBe(12);
    expect(h.attentionTotal).toBe(37 + 12);
    expect(h.moreInvites).toBe(true);
    expect(h.moreDue).toBe(true);
  });

  it("a lapsed invite in the page is still not shown as open", () => {
    const h = athleteHome(input({ invitesTop: [invite("ok"), invite("lapsed", { expiresAt: "2026-10-14T00:00:00Z" })], openInvites: 1 }), NOW);
    expect(h.queueRows.filter((r) => r.kind === "invite").map((r) => r.id)).toEqual(["ok"]);
    expect(h.moreInvites).toBe(false);
  });

  it("gives a minor with no verified guardian no upload link", () => {
    const h = athleteHome(input({ guardian: "unverified", dueTop: [deliverable("todo")], dueTotal: 1 }), NOW);
    const row = h.queueRows.find((r) => r.id === "todo")!;
    expect(h.guardianPending).toBe(true);
    expect(row.action.disabled).toBe(true);
    expect(row.action.href).toBeUndefined();
  });

  it("money is the earnings summary's — disputed is not earned", () => {
    const h = athleteHome(input(), NOW);
    expect(h.earned).toBe(10_000);
    expect(h.paid).toBe(5_000);
    expect(h.paidPct).toBe(50);
    expect(h.pending).toEqual({ amount: 3_000, count: 1 });
    expect(h.approved).toEqual({ amount: 2_000, count: 1 });
    expect(h.paidThisYearTotal).toBe(5_000);
  });

  it("nothing earned yet is null, not 0%; profile gaps are a queue row counted once", () => {
    const h = athleteHome(input({ earnings: summary({ career: { raised: 0, paid: 0, onTheWay: 0 } }), profile: profile({ socials: [], brandInterests: [] }) }), NOW);
    expect(h.paidPct).toBeNull();
    const gaps = h.queueRows.find((r) => r.kind === "profile")!;
    expect(gaps.title).toContain("2 items");
    expect(h.attentionTotal).toBe(1);
  });

  it("review rows are the server's review page", () => {
    const h = athleteHome(input({ reviewTop: [deliverable("r", { state: "BTG_REVIEW" })], reviewTotal: 5 }), NOW);
    expect(h.reviewRows.map((r) => r.id)).toEqual(["r"]);
  });
});
