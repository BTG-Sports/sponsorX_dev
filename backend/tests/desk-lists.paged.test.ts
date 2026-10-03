/* eslint-disable @typescript-eslint/no-explicit-any -- mock Prisma args are inspected structurally */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   Server-paged desk lists (2026-09-29): GET /briefs, GET /campaigns'
   delivery-health filter, GET /invitations (+ /summary), the eligible
   shortlist and GET /operations/delivery-health — each opt-in by `?page=`.

   Pinned for every one: the caller's scope is the first AND term (a filter
   can only narrow it), filters and sorts reach the database, hostile
   page / size degrade to a real page, and without `?page=` the old read is
   unchanged. Plus the list-specific rules: §26's conflict exclusion and
   §7's score gating on the shortlist, and "attention" being delivery
   health's own rule.
   -------------------------------------------------------------------------- */

vi.mock("../src/config/env", () => ({ env: { APP_URL: "https://sponsorx.example" } }));

type Args = Record<string, any>;
type Call = { model: string; op: string; args: Args };
let calls: Call[] = [];
let impl: Record<string, (a: Args) => unknown> = {};

const DEFAULTS: Record<string, unknown> = { findMany: [], findFirst: null, count: 0, groupBy: [], aggregate: { _sum: {} } };
const model = (name: string) =>
  Object.fromEntries(
    Object.keys(DEFAULTS).map((op) => [
      op,
      (a: Args) => {
        calls.push({ model: name, op, args: a });
        const f = impl[`${name}.${op}`];
        return Promise.resolve(f ? f(a) : DEFAULTS[op]);
      },
    ]),
  );

vi.mock("../src/db/client", () => ({
  prisma: {
    campaignBrief: model("campaignBrief"),
    campaign: model("campaign"),
    campaignInvite: model("campaignInvite"),
    campaignOrder: model("campaignOrder"),
    athlete: model("athlete"),
  },
}));

const { listBriefs, listCampaigns, listInvitations, invitationSummary, shortlist } = await import("../src/routes/v1/campaigns");
const { delivery } = await import("../src/routes/v1/metrics");
const { whereFor } = await import("../src/auth/scope");

const base = { userId: "u_1", tenantId: "t_1", athleteId: null, guardianId: null, propertyId: null, sponsorId: null };
const admin = { ...base, roles: ["BTG_ADMIN"] } as unknown as Actor;
const finance = { ...base, roles: ["FINANCE"] } as unknown as Actor;
const sponsor = { ...base, roles: ["SPONSOR_ADMIN"], sponsorId: "spn_1" } as unknown as Actor;
const athlete = { ...base, roles: ["ATHLETE"], athleteId: "ath_1" } as unknown as Actor;

async function run(handler: unknown, actor: Actor, query: Record<string, string> = {}, params: Record<string, string> = {}) {
  let body: any;
  await (handler as (...a: unknown[]) => Promise<void>)(
    { actor, query, params } as never,
    { json: (b: unknown) => void (body = b) } as never,
    (() => {}) as never,
  );
  return body;
}
const of = (m: string, op: string) => calls.filter((c) => c.model === m && c.op === op);

beforeEach(() => {
  calls = [];
  impl = {};
});

/* ---------------------------------------------------------------- briefs */

const BRIEF = {
  id: "brf_1", objective: "Fall foot traffic", state: "APPROVED", budget: 500_000,
  startDate: new Date("2026-10-01T00:00:00Z"), endDate: new Date("2026-11-30T00:00:00Z"),
  sports: [], stateCodes: [], categories: [], createdAt: new Date("2026-09-01T00:00:00Z"),
  sponsor: { name: "Bowie Auto" }, package: null, campaign: null,
};

describe("GET /briefs · paged", () => {
  it("without ?page the old read is unchanged — one state, 100 newest, no page", async () => {
    impl["campaignBrief.findMany"] = () => [BRIEF];
    const body = await run(listBriefs, admin, { state: "APPROVED" });
    const [c] = of("campaignBrief", "findMany");
    expect(c!.args.take).toBe(100);
    expect(c!.args.orderBy).toEqual({ createdAt: "desc" });
    expect(c!.args.where.state).toBe("APPROVED");
    expect(body.page).toBeUndefined();
    expect(of("campaignBrief", "count")).toHaveLength(0);
  });

  it("keeps the scope first, then q (objective or sponsor), then the state list", async () => {
    impl["campaignBrief.count"] = () => 30;
    impl["campaignBrief.findMany"] = () => [BRIEF];
    const body = await run(listBriefs, admin, { page: "2", size: "12", q: "fall", state: "APPROVED,BOGUS,QUALIFIED" });
    const [c] = of("campaignBrief", "findMany");
    expect(c!.args.where.AND[0]).toEqual(whereFor(admin, "campaignBrief", "read"));
    expect(c!.args.where.AND[1]).toEqual({
      OR: [
        { objective: { contains: "fall", mode: "insensitive" } },
        { sponsor: { name: { contains: "fall", mode: "insensitive" } } },
      ],
    });
    expect(c!.args.where.AND[2]).toEqual({ state: { in: ["APPROVED", "QUALIFIED"] } });
    expect(c!.args.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect([c!.args.skip, c!.args.take]).toEqual([12, 12]);
    expect(of("campaignBrief", "count")[0]!.args.where).toEqual(c!.args.where);
    expect(body.page).toEqual({ page: 2, size: 12, total: 30, pages: 3 });
    expect(body.briefs[0].sponsorName).toBe("Bowie Auto");
  });

  it("sort=desk reads APPROVED → CAMPAIGN_CREATED → QUALIFIED as ordered segments across a page break", async () => {
    const counts: Record<string, number> = { APPROVED: 2, CAMPAIGN_CREATED: 1, QUALIFIED: 3 };
    const stateOf = (a: Args) => a.where.AND.at(-1).state as string;
    impl["campaignBrief.count"] = (a) => counts[stateOf(a)] ?? 0;
    impl["campaignBrief.findMany"] = (a) => Array.from({ length: a.take }, () => BRIEF);
    const body = await run(listBriefs, admin, { page: "2", size: "2", sort: "desk", state: "APPROVED,CAMPAIGN_CREATED,QUALIFIED" });
    const reads = of("campaignBrief", "findMany").map((c) => [stateOf(c.args), c.args.skip, c.args.take]);
    /* page 2 of size 2 = rows 3–4: the one CREATED brief, then the first QUALIFIED. */
    expect(reads).toEqual([["CAMPAIGN_CREATED", 0, 1], ["QUALIFIED", 0, 1]]);
    expect(body.page).toEqual({ page: 2, size: 2, total: 6, pages: 3 });
  });

  it("hostile page / size degrade: size clamps to 100, an out-of-range page answers the last", async () => {
    impl["campaignBrief.count"] = () => 150;
    const body = await run(listBriefs, admin, { page: "999", size: "5000" });
    const [c] = of("campaignBrief", "findMany");
    expect([c!.args.skip, c!.args.take]).toEqual([100, 100]);
    expect(body.page).toEqual({ page: 2, size: 100, total: 150, pages: 2 });
    const neg = await run(listBriefs, admin, { page: "-3", size: "abc" });
    expect(neg.page.page).toBe(1);
    expect(neg.page.size).toBe(12);
  });
});

/* ----------------------------------------------- campaigns · health filter */

const CAMPAIGN = (id: string, state = "ACTIVE") => ({
  id, name: `Campaign ${id}`, state, budget: 1, briefId: null,
  startDate: new Date("2026-09-01T00:00:00Z"), endDate: new Date("2026-12-01T00:00:00Z"),
  sponsor: { name: "Bowie" }, brief: null, orders: [], invoices: [],
});
/* delivery-health's rows: c_late has an overdue deliverable, c_ok doesn't. */
const HEALTH_ROWS = [
  { id: "c_late", name: "Late", endDate: new Date(), orders: [{ projectedImpressions: null, deliverables: [{ state: "DRAFT_SUBMITTED", dueDate: new Date("2020-01-01"), metrics: [] }] }] },
  { id: "c_ok", name: "Fine", endDate: new Date(), orders: [{ projectedImpressions: null, deliverables: [{ state: "VERIFIED", dueDate: new Date("2020-01-01"), metrics: [] }] }] },
];
const isHealthRead = (a: Args) => Boolean(a.select?.orders?.select?.projectedImpressions);

describe("GET /campaigns · delivery health (admin desk)", () => {
  beforeEach(() => {
    impl["campaign.findMany"] = (a) => (isHealthRead(a) ? HEALTH_ROWS : [CAMPAIGN("c_late"), CAMPAIGN("c_ok")]);
    impl["campaign.count"] = () => 2;
  });

  it("?health=true attaches each row's flags and the flagged count — the delivery-health rule", async () => {
    const body = await run(listCampaigns, admin, { page: "1", health: "true" });
    expect(body.healthVisible).toBe(true);
    expect(body.attention).toBe(1);
    expect(body.campaigns[0].health).toEqual({ deliverablesOverdue: 1, underDeliveringWork: true, underDeliveringReach: false });
    expect(body.campaigns[1].health).toEqual({ deliverablesOverdue: 0, underDeliveringWork: false, underDeliveringReach: false });
  });

  it("?attention=true narrows to the flagged ids, =false to the rest — inside the scoped AND", async () => {
    await run(listCampaigns, admin, { page: "1", attention: "true", state: "ACTIVE,REPORTING" });
    let list = of("campaign", "findMany").find((c) => !isHealthRead(c.args))!;
    expect(list.args.where.AND[0]).toEqual(whereFor(admin, "campaign", "read"));
    expect(list.args.where.AND).toContainEqual({ id: { in: ["c_late"] } });
    expect(list.args.where.AND).toContainEqual({ state: { in: ["ACTIVE", "REPORTING"] } });
    calls = [];
    await run(listCampaigns, admin, { page: "1", attention: "false" });
    list = of("campaign", "findMany").find((c) => !isHealthRead(c.args))!;
    expect(list.args.where.AND).toContainEqual({ id: { notIn: ["c_late"] } });
  });

  it("a role without delivery health gets rows without it — and a 403 if it asks to filter by it", async () => {
    const body = await run(listCampaigns, finance, { page: "1", health: "true" });
    expect(body.healthVisible).toBe(false);
    expect(body.attention).toBeUndefined();
    expect("health" in body.campaigns[0]).toBe(false);
    expect(of("campaign", "findMany").some((c) => isHealthRead(c.args))).toBe(false);
    await expect(run(listCampaigns, finance, { page: "1", attention: "true" })).rejects.toMatchObject({ status: 403 });
  });

  it("paged without health params answers exactly as before — no health keys, no health read", async () => {
    const body = await run(listCampaigns, admin, { page: "1" });
    expect(Object.keys(body).sort()).toEqual(["campaigns", "page"]);
    expect(of("campaign", "findMany").some((c) => isHealthRead(c.args))).toBe(false);
  });
});

/* ------------------------------------------------------------ invitations */

const INVITE = (id: string, state = "INVITED") => ({
  id, state, offered: 10_000, sentAt: new Date("2026-09-20T00:00:00Z"), viewedAt: null, respondedAt: null,
  expiresAt: new Date("2030-01-01T00:00:00Z"), jobId: "SX-03", campaignId: "c1", athleteId: "ath_1",
  job: { name: "Reel" }, campaign: { name: "Fall", sponsor: { name: "Bowie" } },
});
/* Which tab a count/read WHERE is for, from its last AND term. */
function tabOf(a: Args): string {
  const t = a.where.AND?.at(-1) ?? {};
  if (t.OR?.[0]?.state === "EXPIRED") return "expired";
  if (t.state === "ACCEPTED") return "accepted";
  if (t.state === "DECLINED") return "declined";
  if (t.expiresAt?.gt) return "open";
  if (t.OR) return "rest";
  return "all";
}

describe("GET /invitations · paged", () => {
  const counts: Record<string, number> = { open: 2, accepted: 1, declined: 0, expired: 1 };
  beforeEach(() => {
    impl["campaignInvite.count"] = (a) => counts[tabOf(a)] ?? 0;
    impl["campaignInvite.findMany"] = (a) => Array.from({ length: a.take }, (_, i) => INVITE(`i${i}`));
  });

  it("counts every tab under q / job in the database — open means answerable AND not past expiry", async () => {
    const body = await run(listInvitations, athlete, { page: "1", q: "bow", job: "SX-03" });
    const cs = of("campaignInvite", "count");
    expect(cs).toHaveLength(4);
    const open = cs.find((c) => tabOf(c.args) === "open")!;
    expect(open.args.where.AND[0]).toEqual(whereFor(athlete, "invitation", "read"));
    expect(open.args.where.AND[1]).toEqual({ jobId: "SX-03" });
    expect(open.args.where.AND[2].OR).toHaveLength(4);
    expect(open.args.where.AND.at(-1).state).toEqual({ in: ["INVITED", "VIEWED"] });
    /* Lapsed-but-unswept counts as expired, never as open. */
    const expired = cs.find((c) => tabOf(c.args) === "expired")!;
    expect(expired.args.where.AND.at(-1).OR[1]).toMatchObject({ state: { in: ["INVITED", "VIEWED"] }, expiresAt: { lte: expect.any(Date) } });
    expect(body.counts).toEqual({ all: 4, open: 2, accepted: 1, declined: 0, expired: 1 });
    expect(body.page).toEqual({ page: 1, size: 12, total: 4, pages: 1 });
  });

  it("urgency (default) reads open soonest-first, then accepted, declined, expired — skipping empty tabs", async () => {
    await run(listInvitations, athlete, { page: "1" });
    const reads = of("campaignInvite", "findMany").map((c) => [tabOf(c.args), c.args.skip, c.args.take, c.args.orderBy[0]]);
    expect(reads).toEqual([
      ["open", 0, 2, { expiresAt: "asc" }],
      ["accepted", 0, 1, { sentAt: "desc" }],
      ["expired", 0, 1, { sentAt: "desc" }],
    ]);
  });

  it("a tab narrows to its own segment; offer and sponsor sorts are one ORDER BY", async () => {
    let body = await run(listInvitations, athlete, { page: "1", state: "expired" });
    expect(body.page.total).toBe(1);
    expect(of("campaignInvite", "findMany").map((c) => tabOf(c.args))).toEqual(["expired"]);
    calls = [];
    body = await run(listInvitations, athlete, { page: "1", sort: "offerDesc" });
    const [r] = of("campaignInvite", "findMany");
    expect(r!.args.orderBy).toEqual([{ offered: "desc" }, { sentAt: "desc" }, { id: "desc" }]);
    expect(body.page.total).toBe(4);
    calls = [];
    await run(listInvitations, athlete, { page: "1", sort: "sponsor", state: "open" });
    const [s] = of("campaignInvite", "findMany");
    expect(s!.args.orderBy[0]).toEqual({ campaign: { sponsor: { name: "asc" } } });
    expect(tabOf(s!.args)).toBe("open");
  });

  it("expiry: open soonest first, then every resolved invite newest first in one segment", async () => {
    await run(listInvitations, athlete, { page: "1", sort: "expiry" });
    const reads = of("campaignInvite", "findMany").map((c) => [tabOf(c.args), c.args.take]);
    expect(reads).toEqual([["open", 2], ["rest", 2]]);
  });

  it("without ?page the inbox read is unchanged — 100 newest, no page, no counts", async () => {
    const body = await run(listInvitations, athlete);
    const [c] = of("campaignInvite", "findMany");
    expect(c!.args.take).toBe(100);
    expect(c!.args.orderBy).toEqual({ sentAt: "desc" });
    expect(body.page).toBeUndefined();
    expect(body.counts).toBeUndefined();
  });
});

describe("GET /invitations/summary", () => {
  it("answers the headline numbers from the database, over the caller's scope", async () => {
    impl["campaignInvite.count"] = (a) => (a.where.AND?.[1]?.state === "ACCEPTED" ? 3 : a.where.AND?.[1]?.expiresAt ? 2 : 9);
    impl["campaignInvite.aggregate"] = () => ({ _sum: { offered: 45_000 } });
    impl["campaignInvite.findFirst"] = () => ({ expiresAt: new Date("2030-01-02T00:00:00Z"), offered: 20_000, campaign: { sponsor: { name: "Bowie" } } });
    impl["campaignInvite.findMany"] = () => [{ jobId: "SX-03", job: { name: "Reel" } }];
    const { summary } = await run(invitationSummary, athlete);
    expect(summary).toEqual({
      total: 9, open: 2, openValue: 45_000, accepted: 3, resolved: 7,
      nextExpiry: { expiresAt: "2030-01-02T00:00:00.000Z", offered: 20_000, sponsorName: "Bowie" },
      jobs: [{ jobId: "SX-03", jobName: "Reel" }],
    });
    const scope = whereFor(athlete, "invitation", "read");
    for (const c of calls) {
      const w = c.args.where;
      expect(w.AND?.length === 2 ? w.AND[0] : w).toEqual(scope);
    }
    expect(of("campaignInvite", "findFirst")[0]!.args.orderBy).toEqual([{ expiresAt: "asc" }, { id: "asc" }]);
  });
});

/* ------------------------------------------------------ eligible shortlist */

const BRIEF_CRIT = { sports: ["Basketball"], stateCodes: [], categories: ["ALCOHOL"] };
const ATH = (id: string, score: number | null, tier: string | null = "PREMIUM") => ({
  id, displayName: `Athlete ${id}`, sport: "Basketball", stateCode: "MD", tier, city: "Bowie",
  scores: score === null ? [] : [{ score, factors: {}, method: "rules-v1", scoredAt: new Date("2026-09-01T00:00:00Z") }],
  socials: [], rates: [{ jobId: "SX-02", amount: 5_000, version: 1 }],
});

describe("GET /briefs/:id/eligible-athletes · paged", () => {
  beforeEach(() => {
    impl["campaignBrief.findFirst"] = () => BRIEF_CRIT;
    impl["athlete.groupBy"] = (a) =>
      a.by[0] === "tier"
        ? [{ tier: "PREMIUM", _count: { _all: 3 } }, { tier: null, _count: { _all: 1 } }]
        : [{ sport: "Basketball" }];
  });

  it("name order pages in the database and keeps §26's conflict exclusion in the scoped base", async () => {
    impl["athlete.count"] = () => 40;
    impl["athlete.findMany"] = () => [ATH("a1", 80)];
    const body = await run(shortlist, admin, { page: "2", sort: "name", q: "prem", tier: "UNTIERED", sport: "Basketball" }, { id: "brf_1" });
    const [c] = of("athlete", "findMany");
    const baseWhere = c!.args.where.AND[0];
    expect(baseWhere.AND).toEqual(whereFor(admin, "athlete", "read").AND);
    expect(baseWhere.state).toBe("ACTIVE");
    expect(baseWhere.NOT).toEqual({ restrictedCategories: { hasSome: ["ALCOHOL"] } });
    expect(c!.args.where.AND[1].OR).toContainEqual({ tier: { in: ["PREMIUM"] } });
    expect(c!.args.where.AND).toContainEqual({ sport: "Basketball" });
    expect(c!.args.where.AND).toContainEqual({ tier: null });
    expect(c!.args.orderBy).toEqual([{ displayName: "asc" }, { id: "asc" }]);
    expect([c!.args.skip, c!.args.take]).toEqual([12, 12]);
    expect(body.page).toEqual({ page: 2, size: 12, total: 40, pages: 4 });
    expect(body.facets).toEqual({ total: 4, tiers: { PREMIUM: 3, UNTIERED: 1 }, sports: ["Basketball"] });
    /* The facets count the brief's whole eligible roster, before the desk's filters. */
    expect(of("athlete", "groupBy")[0]!.args.where).toEqual(baseWhere);
  });

  it("score order: latest snapshot, high to low, unscored last; a minimum drops the unscored", async () => {
    const thin = [
      { id: "a1", scores: [{ score: 70 }] }, { id: "a2", scores: [] },
      { id: "a3", scores: [{ score: 91 }] }, { id: "a4", scores: [{ score: 85 }] },
    ];
    impl["athlete.findMany"] = (a) =>
      a.select.displayName ? a.where.AND[1].id.in.map((id: string) => ATH(id, 1)) : thin;
    /* P4-BE-08 — best match is the default now; the §14 order is asked for. */
    let body = await run(shortlist, admin, { page: "1", size: "12", sort: "score" }, { id: "brf_1" });
    expect(body.athletes.map((a: { id: string }) => a.id)).toEqual(["a3", "a4", "a1", "a2"]);
    expect(body.page.total).toBe(4);
    calls = [];
    body = await run(shortlist, admin, { page: "1", min: "80", sort: "score" }, { id: "brf_1" });
    expect(body.athletes.map((a: { id: string }) => a.id)).toEqual(["a3", "a4"]);
    expect(body.page.total).toBe(2);
    /* The full read is for this page's ids only. */
    const full = of("athlete", "findMany").find((c) => c.args.select.displayName)!;
    expect(full.args.where.AND[1]).toEqual({ id: { in: ["a3", "a4"] } });
  });

  it("a role denied scores never gets them — and can't sort or filter by them either", async () => {
    impl["campaignBrief.findFirst"] = () => BRIEF_CRIT;
    impl["athlete.count"] = () => 1;
    impl["athlete.findMany"] = () => [ATH("a1", 90)];
    const body = await run(shortlist, sponsor, { page: "1", min: "80", sort: "score" }, { id: "brf_1" });
    expect(of("athlete", "findMany")).toHaveLength(1);
    expect(of("athlete", "findMany")[0]!.args.orderBy).toEqual([{ displayName: "asc" }, { id: "asc" }]);
    expect(of("athlete", "findMany")[0]!.args.select.scores).toBeUndefined();
    expect("score" in body.athletes[0]).toBe(false);
    expect("rates" in body.athletes[0]).toBe(false);
    /* The brief's rank is theirs too — without the signals they may not read. */
    expect(body.athletes[0].reasons.map((r: { key: string }) => r.key)).toEqual(["sport", "state"]);
  });

  it("P4-BE-08 · with no ?sort it ranks best match first, ignoring a minimum the caller may not read", async () => {
    impl["campaignBrief.findFirst"] = () => BRIEF_CRIT;
    impl["athlete.findMany"] = (a) =>
      a.select.city ? a.where.AND[1].id.in.map((id: string) => ATH(id, 1)) : [ATH("a1", 90), ATH("a2", 90)];
    const body = await run(shortlist, sponsor, { page: "1", min: "80" }, { id: "brf_1" });
    expect(body.athletes.map((a: { id: string }) => a.id)).toHaveLength(2);
    expect(body.athletes[0].matchScore).toEqual(expect.any(Number));
    /* No score is selected for the sponsor side, so none can order or filter. */
    expect(of("athlete", "findMany").every((c) => c.args.select.scores === undefined)).toBe(true);
    /* And no other campaign's orders are read to rank them. */
    expect(of("campaignOrder", "findMany")).toEqual([]);
  });
});

/* -------------------------------------------------- delivery health · paged */

describe("GET /operations/delivery-health · paged", () => {
  it("pages in the database, ending soonest first; ?projected keeps campaigns with a projection", async () => {
    impl["campaign.count"] = () => 13;
    impl["campaign.findMany"] = () => [HEALTH_ROWS[1]];
    const body = await run(delivery, admin, { page: "2", projected: "true" });
    const [c] = of("campaign", "findMany");
    expect(c!.args.where.AND[0]).toEqual(whereFor(admin, "campaign", "read"));
    expect(c!.args.where.AND).toContainEqual({ orders: { some: { projectedImpressions: { gt: 0 } } } });
    expect(c!.args.orderBy).toEqual([{ endDate: "asc" }, { id: "asc" }]);
    expect([c!.args.skip, c!.args.take]).toEqual([12, 12]);
    expect(body.page).toEqual({ page: 2, size: 12, total: 13, pages: 2 });
    expect(body.campaigns[0].campaignId).toBe("c_ok");
  });

  it("?under=true pages the flagged set with an exact total", async () => {
    impl["campaign.findMany"] = () => HEALTH_ROWS;
    const body = await run(delivery, admin, { page: "1", under: "true" });
    expect(body.campaigns.map((h: { campaignId: string }) => h.campaignId)).toEqual(["c_late"]);
    expect(body.page.total).toBe(1);
  });

  it("without ?page it is the old unordered, unpaged read", async () => {
    impl["campaign.findMany"] = () => HEALTH_ROWS;
    const body = await run(delivery, admin);
    const [c] = of("campaign", "findMany");
    expect(c!.args.orderBy).toBeUndefined();
    expect(c!.args.skip).toBeUndefined();
    expect(body.page).toBeUndefined();
    expect(body.campaigns).toHaveLength(2);
  });
});
