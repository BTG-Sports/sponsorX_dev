import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { mergeNewest, type StreamKey } from "../src/domain/signups-stream-rules";

/* --------------------------------------------------------------------------
   P1-ART-15 — New sign-ups as one server-paged stream (GET /signups/stream,
   /signups/stream/summary). Done when: every kind on the desk is in one
   list newest first; a page is exact across the four tables (no row twice,
   none missing, in order); kind, Needs review and search filter in the
   database; the summary's figures are counts, not a page; another tenant's
   sign-ups never appear; a role outside /signups is refused.

   The one intake page (2026-11-21): the Onboarding and Sponsor requests
   desks are gone, so the stream lists every organisation and sponsor state
   — a sponsor still finishing (WAITING), declined (DECLINED) or rejected; an
   organisation asked for changes or never submitted (WAITING) — while
   Needs review stays BTG's move only. Sales, which reads sponsor requests
   but no athlete or guardian, gets a sponsors-only stream instead of a 403.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@ss-test.invalid` } : null;
  },
}));

describe("mergeNewest (pure)", () => {
  const k = (kind: StreamKey["kind"], id: string, day: number): StreamKey => ({
    source: "athlete", kind, id, at: new Date(Date.UTC(2026, 9, day)),
  });

  it("merges sources newest first and slices the page", () => {
    const a = [k("ATHLETE", "a3", 9), k("ATHLETE", "a2", 5), k("ATHLETE", "a1", 1)];
    const s = [k("SPONSOR", "s2", 8), k("SPONSOR", "s1", 2)];
    expect(mergeNewest([a, s], 0, 3).map((x) => x.id)).toEqual(["a3", "s2", "a2"]);
    expect(mergeNewest([a, s], 3, 3).map((x) => x.id)).toEqual(["s1", "a1"]);
  });

  it("breaks a tie on the date by kind, then id descending — stable across pages", () => {
    const same = [k("SPONSOR", "s1", 4), k("ORGANIZATION", "o1", 4), k("ATHLETE", "a2", 4), k("ATHLETE", "a1", 4)];
    expect(mergeNewest([same], 0, 10).map((x) => x.id)).toEqual(["o1", "a2", "a1", "s1"]);
  });
});

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("P1-ART-15 · the New sign-ups stream", { timeout: 120_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");

  const T = "sstream_btg";
  const OTHER = "sstream_other";
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- response bodies are asserted field by field
  type Res = { status: number; text: string; json: any };
  const call = async (path: string, clerk = "sst_admin"): Promise<Res> => {
    const res = await fetch(`${base}/api/v1${path}`, { headers: { "x-test-clerk": clerk } });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };
  const day = (d: number) => new Date(Date.UTC(2026, 8, d, 12));

  async function clean() {
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 5; pass++) {
      for (const { table_name } of tables) {
        for (const t of [T, OTHER]) await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = $1`, t).catch(() => {});
      }
    }
    await prisma.tenant.deleteMany({ where: { id: { in: [T, OTHER] } } });
  }

  /* The desk, newest first — what every page must add up to. */
  const EXPECTED = [
    "sst_spo_waiting", // 23 — still with them
    "sst_ath_held", // 20
    "sst_spo_held", // 19
    "sst_org_pending", // 18
    "sst_gua_verified", // 17
    "sst_ath_flagged", // 16
    "sst_spo_approved", // 15
    "sst_org_approved", // 14
    "sst_gua_rejected", // 13
    "sst_ath_auto_b", // 12
    "sst_ath_auto_a", // 11
    "sst_org_draft", // 9 — never submitted, dated by when it was started
    "sst_spo_declined", // 8
    "sst_spo_rejected", // 7
    "sst_org_changes", // 6 — sent back for changes
  ];

  beforeAll(async () => {
    await clean();
    await prisma.tenant.createMany({ data: [{ id: T, name: "SS BTG" }, { id: OTHER, name: "SS Other" }] });
    await prisma.user.createMany({ data: [
      { id: "sst_admin", tenantId: T, clerkId: "sst_admin", email: "sst_admin@ss-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "sst_finance", tenantId: T, clerkId: "sst_finance", email: "sst_finance@ss-test.invalid", roles: ["FINANCE"] },
      { id: "sst_sales", tenantId: T, clerkId: "sst_sales", email: "sst_sales@ss-test.invalid", roles: ["SALES"] },
    ] });

    const athlete = (id: string, d: number, extra: Record<string, unknown>, tenantId = T) => ({
      id, tenantId, slug: `ss-${id}`, legalName: `Athlete ${id}`, displayName: id, sport: "Basketball", countryCode: "US", stateCode: "MD",
      createdAt: day(d), ...extra,
    });
    await prisma.athlete.createMany({ data: [
      athlete("sst_ath_auto_a", 11, { autoApproved: true, state: "ACTIVE", emailConfirmedAt: day(11) }),
      athlete("sst_ath_auto_b", 12, { autoApproved: true, state: "ACTIVE", emailConfirmedAt: day(12), school: "Northside Prep" }),
      athlete("sst_ath_flagged", 16, { autoApproved: true, state: "ACTIVE", emailConfirmedAt: day(16), majorityKnown: false }),
      athlete("sst_ath_held", 20, { state: "SUBMITTED", reviewReasons: ["Likely duplicate athlete: same email as Riley"] }),
      /* not on the desk: a draft nobody approved or held */
      athlete("sst_ath_draft", 21, { state: "DRAFT" }),
      /* another tenant's — never in this tenant's stream */
      athlete("sst_ath_other", 22, { autoApproved: true, state: "ACTIVE", emailConfirmedAt: day(22) }, OTHER),
    ] });
    await prisma.guardian.createMany({ data: [
      { id: "sst_gua_verified", tenantId: T, legalName: "Dana Verified", email: "dana@ss-test.invalid", relationship: "PARENT", verifiedAt: day(17), autoVerified: true },
      { id: "sst_gua_rejected", tenantId: T, legalName: "Rory Rejected", email: "rory@ss-test.invalid", relationship: "PARENT", rejectedAt: day(13) },
      { id: "sst_gua_pending", tenantId: T, legalName: "Not Yet", email: "nyet@ss-test.invalid", relationship: "PARENT" },
    ] });
    await prisma.inquiry.createMany({ data: [
      { id: "sst_spo_approved", tenantId: T, companyName: "Harbor Coffee", lastName: "Chen", email: "chen@ss-test.invalid", source: "WEB", state: "APPROVED", autoApproved: true, createdAt: day(10), decidedAt: day(15) },
      { id: "sst_spo_held", tenantId: T, companyName: "Volt Gym", lastName: "Park", email: "park@ss-test.invalid", source: "WEB", state: "NEW", reviewReasons: ["Their email already has a SponsorX login"], createdAt: day(19) },
      /* NEW without reasons is still with the applicant: listed as WAITING, never under Needs review */
      { id: "sst_spo_waiting", tenantId: T, companyName: "Quiet Co", lastName: "Lee", email: "lee@ss-test.invalid", source: "WEB", state: "NEW", createdAt: day(23) },
      { id: "sst_spo_declined", tenantId: T, companyName: "Neon Vapes", lastName: "Ruiz", email: "ruiz@ss-test.invalid", source: "WEB", state: "DECLINED", decisionNote: "Not a fit for athletes", createdAt: day(5), decidedAt: day(8) },
      { id: "sst_spo_rejected", tenantId: T, companyName: "Gone Bikes", lastName: "Fox", email: "fox@ss-test.invalid", source: "WEB", state: "REJECTED", createdAt: day(4), decidedAt: day(7) },
    ] });
    await prisma.propertyOnboarding.createMany({ data: [
      { id: "sst_org_approved", tenantId: T, orgType: "TEAM", orgName: "Laurel Lions FC", state: "APPROVED", autoApproved: true, submittedAt: day(14), decidedAt: day(14) },
      { id: "sst_org_pending", tenantId: T, orgType: "SCHOOL", orgName: "Bay Academy", state: "PENDING_REVIEW", reviewReasons: ["Document unreadable"], submittedAt: day(18) },
      /* with the applicant: never submitted, and sent back for changes */
      { id: "sst_org_draft", tenantId: T, orgType: "TEAM", orgName: "Draft United", state: "DRAFT", createdAt: day(9) },
      { id: "sst_org_changes", tenantId: T, orgType: "TEAM", orgName: "Change City", state: "CHANGES_REQUESTED", reviewNotes: "Add your league", submittedAt: day(6) },
    ] });

    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server?.close();
    await clean();
  });

  it("pages every kind as one list, newest first — exact across the four tables", async () => {
    const seen: string[] = [];
    for (let p = 1; p <= 5; p++) {
      const r = await call(`/signups/stream?page=${p}&size=3`);
      expect(r.status, r.text).toBe(200);
      expect(r.json.page).toMatchObject({ page: p, size: 3, total: 15, pages: 5 });
      seen.push(...r.json.rows.map((x: { id: string }) => x.id));
    }
    expect(seen).toEqual(EXPECTED);
  });

  it("gives each row the desk's words", async () => {
    const r = await call("/signups/stream?page=1&size=24");
    const by = (id: string) => r.json.rows.find((x: { id: string }) => x.id === id);
    /* every state the removed desks showed */
    expect(by("sst_spo_waiting")).toMatchObject({
      kind: "SPONSOR", state: "WAITING", problems: [],
      reasons: ["Hasn’t confirmed their email yet", "Hasn’t told us their business type yet"],
    });
    expect(by("sst_spo_declined")).toMatchObject({ kind: "SPONSOR", state: "DECLINED", reasons: ["Not a fit for athletes"] });
    expect(by("sst_spo_rejected")).toMatchObject({ kind: "SPONSOR", state: "REJECTED", reasons: ["Rejected by BTG — logins off"] });
    expect(by("sst_org_draft")).toMatchObject({ kind: "ORGANIZATION", state: "WAITING", reasons: ["Not submitted yet"] });
    expect(by("sst_org_changes")).toMatchObject({ kind: "ORGANIZATION", state: "WAITING", reasons: ["Asked for changes: Add your league"] });
    expect(by("sst_ath_held")).toMatchObject({ kind: "ATHLETE", state: "NEEDS_REVIEW", reasons: [expect.stringMatching(/duplicate/)] });
    expect(by("sst_ath_flagged").flags[0]).toMatch(/Place not in the age table/);
    expect(by("sst_spo_held")).toMatchObject({ kind: "SPONSOR", name: "Volt Gym", state: "NEEDS_REVIEW" });
    expect(by("sst_spo_approved")).toMatchObject({ kind: "SPONSOR", state: "AUTO_APPROVED" });
    expect(by("sst_org_pending")).toMatchObject({ kind: "ORGANIZATION", state: "NEEDS_REVIEW", reasons: ["Document unreadable"] });
    expect(by("sst_gua_rejected")).toMatchObject({ kind: "GUARDIAN", state: "REJECTED" });
  });

  it("filters by kind, Needs review and search in the database", async () => {
    const ids = async (q: string) => (await call(`/signups/stream?page=1&size=12&${q}`)).json.rows.map((x: { id: string }) => x.id);
    expect(await ids("kind=GUARDIAN")).toEqual(["sst_gua_verified", "sst_gua_rejected"]);
    expect(await ids("review=1")).toEqual(["sst_ath_held", "sst_spo_held", "sst_org_pending", "sst_ath_flagged"]);
    expect(await ids("kind=ATHLETE&review=1")).toEqual(["sst_ath_held", "sst_ath_flagged"]);
    expect(await ids("q=northside")).toEqual(["sst_ath_auto_b"]);
    expect(await ids("q=harbor")).toEqual(["sst_spo_approved"]);
    const counted = await call("/signups/stream?page=1&size=12&review=1");
    expect(counted.json.page.total).toBe(4);
  });

  it("answers a page past the end as the last page", async () => {
    const r = await call("/signups/stream?page=99&size=3");
    expect(r.json.page).toMatchObject({ page: 5, total: 15 });
    expect(r.json.rows.map((x: { id: string }) => x.id)).toEqual(["sst_spo_declined", "sst_spo_rejected", "sst_org_changes"]);
  });

  it("the summary counts the desk, per kind — every state in the totals, only BTG's move as held", async () => {
    const r = await call("/signups/stream/summary");
    expect(r.status, r.text).toBe(200);
    expect(r.json.kinds).toEqual({
      ORGANIZATION: { total: 4, held: 1, auto: 1 },
      ATHLETE: { total: 4, held: 2, auto: 2 },
      GUARDIAN: { total: 2, held: 0, auto: 1 },
      SPONSOR: { total: 5, held: 1, auto: 1 },
    });
    expect(r.json.all).toEqual({ total: 15, held: 4, auto: 5 });
  });

  it("gives Sales a sponsors-only stream — no athlete, guardian or organisation, and no 403", async () => {
    const r = await call("/signups/stream?page=1&size=24", "sst_sales");
    expect(r.status, r.text).toBe(200);
    expect(r.json.rows.map((x: { id: string }) => x.id)).toEqual(["sst_spo_waiting", "sst_spo_held", "sst_spo_approved", "sst_spo_declined", "sst_spo_rejected"]);
    expect((await call("/signups/stream?page=1&size=24&review=1", "sst_sales")).json.rows.map((x: { id: string }) => x.id)).toEqual(["sst_spo_held"]);
    /* asking for a kind it can't read is an empty list, not someone else's rows */
    expect((await call("/signups/stream?page=1&size=24&kind=ATHLETE", "sst_sales")).json.rows).toEqual([]);
    const s = await call("/signups/stream/summary", "sst_sales");
    expect(s.status, s.text).toBe(200);
    expect(s.json.kinds).toEqual({ SPONSOR: { total: 5, held: 1, auto: 1 } });
  });

  it("is refused to a role outside the desk", async () => {
    expect((await call("/signups/stream?page=1", "sst_finance")).status).toBe(403);
    expect((await call("/signups/stream/summary", "sst_finance")).status).toBe(403);
  });
});
