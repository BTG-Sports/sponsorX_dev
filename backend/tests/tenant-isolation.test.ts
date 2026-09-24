import { createHash } from "node:crypto";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   P8-SEC-02 — no query can reach another tenant's data, proven by test.

   Not a review of the queries: a real API over a real database, attacked.
   Tenant A is seeded with one of everything along the §39 loop — sponsor,
   brief, campaign, athlete, NIL job, rate, invitation, order, deliverable,
   metric, tracking link, reward, token, earning, invoice, guardian,
   agreement. Tenant B gets its own staff, sponsor and athlete. Then EVERY
   route the API mounts is called as each of tenant B's users, with tenant
   A's ids in the path and, for writes, a body that is valid — so the call
   reaches the scope check instead of stopping at validation.

   Three things must hold, for every route and every tenant-B actor:
     1. the answer is not a success (403 / 404 / 409 / 422 — never 2xx);
     2. nothing tenant A owns appears in the response;
     3. nothing tenant A owns changed — a fingerprint of every tenant-A row
        in every table is identical before and after the whole sweep.

   A positive control runs the same GETs as tenant A's own admin and expects
   them to succeed, so a sweep that "passes" because the ids are wrong
   cannot pass.

   The public routes (/public/*, the Zoho webhooks, /openapi.json) are
   excluded by design: they carry no tenant-bound actor, and their access is
   a bearer token or a signature — tested in their own suites.

   Skipped without a database, with a reason. CI has one.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({
  limit: async () => {},
  rateLimit: async () => ({ allowed: true, retryAfter: 0 }),
  RateLimitedError: class extends Error {},
}));
/* Authentication is Clerk's job and is not under test: the caller's Clerk id
   comes from a header. Everything after that — resolving the actor from
   Postgres, roles, tenant, scope — is the production code path. */
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@tenant-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

const A = {
  tenant: "ti_tenant_a", sponsor: "ti_sponsor_a", contact: "ti_contact_a", brief: "ti_brief_a",
  campaign: "ti_campaign_a", athlete: "ti_athlete_a", job: "ti_job_a", rate: "ti_rate_a",
  invite: "ti_invite_a", order: "ti_order_a", deliverable: "ti_deliv_a", asset: "ti_asset_a",
  link: "ti_link_a", reward: "ti_reward_a", token: "ti_token_a", earning: "ti_earning_a",
  invoice: "ti_invoice_a", guardian: "ti_guardian_a", agreement: "ti_agreement_a", admin: "ti_admin_a",
} as const;
const B = { tenant: "ti_tenant_b", sponsor: "ti_sponsor_b", athlete: "ti_athlete_b" } as const;

/** Tenant B's users: every kind of actor who could try to reach across. */
const B_ACTORS = [
  { id: "ti_b_admin", roles: ["BTG_ADMIN"] },
  { id: "ti_b_super_like", roles: ["CAMPAIGN_MGR", "NETWORK_MGR", "FINANCE", "SALES"] },
  { id: "ti_b_sponsor", roles: ["SPONSOR_ADMIN"], sponsorId: B.sponsor },
  { id: "ti_b_athlete", roles: ["ATHLETE"], athleteId: B.athlete },
] as const;

/** Which tenant-A id a path parameter takes, by the noun in front of it. */
const PARAM_FOR: Record<string, string> = {
  applications: A.athlete, athletes: A.athlete, campaigns: A.campaign, orders: A.order,
  briefs: A.brief, invitations: A.invite, deliverables: A.deliverable, earnings: A.earning,
  guardians: A.guardian, rewards: A.reward, "tracking-links": A.link,
};

/**
 * A VALID body for every write, so the call reaches the scope check. A route
 * that answered 400 would prove only that validation runs first — so a 400
 * fails this suite, and the fix is a body here, not a looser assertion.
 */
const BODY: Record<string, unknown> = {
  "PUT /athletes/{id}/tier": { tier: "CREATOR" },
  "POST /athletes/{id}/rates": { jobId: A.job, amount: 20000 },
  "POST /campaigns/{id}/orders": {
    athleteId: A.athlete, jobId: A.job, compensation: 20000, sellPrice: 40000,
    usageRights: "Organic social, 90 days", dueDate: "2026-12-01",
  },
  "PATCH /orders/{id}": { compensation: 21000 },
  "POST /orders/{id}/transition": { to: "CANCELLED" },
  "POST /orders/{id}/accept": { agreementId: A.agreement, bodyHashShown: "x".repeat(64) },
  "POST /briefs": {
    sponsorId: A.sponsor, objective: "Cross-tenant brief", budget: 100000,
    startDate: "2026-10-01", endDate: "2026-11-01", sports: [], stateCodes: [], categories: [],
  },
  "POST /briefs/{id}/transition": { to: "CLOSED" },
  "POST /briefs/{id}/campaign": { name: "Stolen campaign" },
  "POST /campaigns/{id}/transition": { to: "CANCELLED" },
  "POST /campaigns/{id}/invitations": { athleteId: A.athlete, jobId: A.job, offered: 20000 },
  "POST /invitations/{id}/respond": { to: "DECLINED" },
  "POST /applications/{id}/approve": {},
  "POST /applications/{id}/request-changes": { reviewerNotes: "Please add a photo." },
  "POST /applications/{id}/reject": { reviewerNotes: "Not eligible." },
  "POST /deliverables/{id}/submit": {},
  "POST /deliverables/{id}/btg-review": { decision: "APPROVE" },
  "POST /deliverables/{id}/sponsor-review": { decision: "APPROVE" },
  "POST /deliverables/{id}/revision": { reason: "Again, please." },
  "POST /deliverables/{id}/approve": {},
  "POST /deliverables/{id}/published": { publishedUrl: "https://example.com/p" },
  "POST /deliverables/{id}/verify": {},
  "POST /deliverables/{id}/uploads": { filename: "a.jpg", contentType: "image/jpeg", bytes: 1000 },
  "POST /deliverables/{id}/assets": { r2Key: `deliverables/${A.deliverable}/a.jpg` },
  "POST /deliverables/{id}/metrics": { day: "2026-10-02", source: "SELF_REPORTED", views: 10, engagements: 1 },
  "POST /deliverables/{id}/tracking-link": { destinationUrl: "https://example.com" },
  "POST /earnings/{id}/transition": { to: "ELIGIBLE" },
  "POST /earnings/{id}/adjustment": { adjustment: -100, reason: "cross-tenant" },
  "POST /athletes/{id}/guardian": { legalName: "X", email: "x@x.invalid", relationship: "PARENT" },
  "PUT /athletes/{id}/socials": { socials: [{ platform: "INSTAGRAM", handle: "stolen" }] },
  "POST /guardians/{id}/verify": { method: "DOCUMENT" },
  "POST /agreements/accept": { agreementId: A.agreement, bodyHashShown: "x".repeat(64) },
  "POST /campaigns/{id}/rewards": { offerText: "Free taco", terms: "One per fan", expiresAt: "2026-12-01T00:00:00.000Z" },
  "POST /rewards/{id}/transition": { to: "PAUSED" },
  "POST /rewards/{id}/tokens": { athleteId: A.athlete },
  "POST /campaigns/{id}/launch": {},
};

describe.skipIf(!hasDatabase)("P8-SEC-02 · tenant B cannot reach tenant A through any route", async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { DOCUMENTED_PATHS } = await import("../src/contracts/registry");

  let base = "";
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  const results: { route: string; actor: string; status: number }[] = [];
  let before = "";

  /** Every row tenant A owns, in every table that has a tenant. */
  async function fingerprint(): Promise<string> {
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.columns
        WHERE column_name = 'tenantId' AND table_schema = 'public' ORDER BY table_name`,
    );
    const h = createHash("sha256");
    for (const { table_name } of tables) {
      const rows = await prisma.$queryRawUnsafe<unknown[]>(
        `SELECT * FROM "${table_name}" WHERE "tenantId" = $1 ORDER BY 1`, A.tenant,
      );
      h.update(table_name).update(JSON.stringify(rows, (_k, v) => (typeof v === "bigint" ? String(v) : v)));
    }
    return h.digest("hex");
  }

  async function wipe() {
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    /* Children before parents; a failure just means another pass. */
    for (let pass = 0; pass < 6; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(
          `DELETE FROM "${table_name}" WHERE "tenantId" IN ($1, $2)`, A.tenant, B.tenant,
        ).catch(() => {});
      }
    }
    await prisma.tenant.deleteMany({ where: { id: { in: [A.tenant, B.tenant] } } });
  }

  async function seed() {
    await wipe();
    const t = A.tenant;
    await prisma.tenant.createMany({ data: [{ id: A.tenant, name: "TI Tenant A" }, { id: B.tenant, name: "TI Tenant B" }] });
    await prisma.sponsor.createMany({ data: [
      { id: A.sponsor, tenantId: t, name: "TI Secret Sponsor A" },
      { id: B.sponsor, tenantId: B.tenant, name: "TI Sponsor B" },
    ] });
    await prisma.sponsorContact.create({ data: { id: A.contact, tenantId: t, sponsorId: A.sponsor, name: "TI Secret Contact", email: "secret@a.invalid", isPrimary: true } });
    await prisma.guardian.create({ data: { id: A.guardian, tenantId: t, legalName: "TI Secret Guardian", email: "g@a.invalid", relationship: "PARENT" } });
    await prisma.athlete.createMany({ data: [
      { id: A.athlete, tenantId: t, slug: "ti-athlete-a", legalName: "TI Secret Athlete", displayName: "TISA", email: "ath@a.invalid", sport: "Soccer", stateCode: "MD", ageBand: "18_PLUS", state: "ACTIVE" },
      { id: B.athlete, tenantId: B.tenant, slug: "ti-athlete-b", legalName: "TI Athlete B", displayName: "TIB", email: "ath@b.invalid", sport: "Soccer", stateCode: "VA", ageBand: "18_PLUS", state: "ACTIVE" },
    ] });
    await prisma.nilJob.create({ data: { id: A.job, tenantId: t, name: "TI Job", baseLow: 10000, baseHigh: 20000, sellLow: 20000, sellHigh: 40000, sellFloorEmerging: 15000, sellFloorCreator: 20000, sellFloorPremium: 30000 } });
    await prisma.athleteRate.create({ data: { id: A.rate, tenantId: t, athleteId: A.athlete, jobId: A.job, amount: 20000 } });
    await prisma.campaignBrief.create({ data: { id: A.brief, tenantId: t, sponsorId: A.sponsor, objective: "TI secret objective", budget: 500000, startDate: new Date("2026-10-01"), endDate: new Date("2026-11-30"), sports: [], stateCodes: [], categories: [], state: "APPROVED" } });
    await prisma.campaign.create({ data: { id: A.campaign, tenantId: t, sponsorId: A.sponsor, name: "TI Secret Campaign", budget: 500000, startDate: new Date("2026-10-01"), endDate: new Date("2026-11-30"), state: "STAFFING" } });
    await prisma.campaignInvite.create({ data: { id: A.invite, tenantId: t, campaignId: A.campaign, athleteId: A.athlete, jobId: A.job, offered: 20000, expiresAt: new Date(Date.now() + 7 * 864e5) } });
    await prisma.campaignOrder.create({ data: { id: A.order, tenantId: t, campaignId: A.campaign, athleteId: A.athlete, jobId: A.job, compensation: 20000, sellPrice: 40000, usageRights: "90 days", dueDate: new Date("2026-11-15") } });
    await prisma.deliverable.create({ data: { id: A.deliverable, tenantId: t, orderId: A.order, title: "TI secret post", dueDate: new Date("2026-11-15") } });
    await prisma.trackingLink.create({ data: { id: A.link, tenantId: t, code: "tiseca", deliverableId: A.deliverable, destinationUrl: "https://a.invalid" } });
    await prisma.reward.create({ data: { id: A.reward, tenantId: t, campaignId: A.campaign, offerText: "TI secret offer", terms: "t", expiresAt: new Date("2026-12-31") } });
    await prisma.rewardToken.create({ data: { id: A.token, tenantId: t, rewardId: A.reward, token: "ti-secret-token-a", athleteId: A.athlete } });
    await prisma.earning.create({ data: { id: A.earning, tenantId: t, athleteId: A.athlete, orderId: A.order, gross: 20000, taxYear: 2026 } });
    await prisma.campaignInvoice.create({ data: { id: A.invoice, tenantId: t, campaignId: A.campaign, zohoInvoiceId: "ti_zinv_a", status: "sent", amount: 500000 } });
    await prisma.agreement.create({ data: { id: A.agreement, tenantId: t, kind: "ATHLETE_TERMS", version: 1, bodyHash: "x".repeat(64), effectiveAt: new Date("2026-01-01") } });
    await prisma.user.create({ data: { id: A.admin, tenantId: t, clerkId: A.admin, email: "admin@a.invalid", roles: ["BTG_ADMIN"] } });
    for (const u of B_ACTORS) {
      await prisma.user.create({ data: {
        id: u.id, tenantId: B.tenant, clerkId: u.id, email: `${u.id}@b.invalid`, roles: [...u.roles],
        sponsorId: "sponsorId" in u ? u.sponsorId : null, athleteId: "athleteId" in u ? u.athleteId : null,
      } });
    }
  }

  /** The routes a tenant-bound actor can call: documented, not public. */
  const routes = () =>
    DOCUMENTED_PATHS.map((r) => ({ method: r.split(" ")[0]!, path: r.split(" ")[1]! }))
      .filter(({ path }) => !/^\/(public|webhooks|openapi\.json)/.test(path) && path !== "/" && path !== "/me");

  const concrete = (path: string) =>
    path.replace(/\/([a-z-]+)\/\{(\w+)\}/g, (_m, noun: string) => `/${noun}/${PARAM_FOR[noun] ?? "unknown"}`);

  async function hit(method: string, path: string, clerk: string) {
    const key = `${method} ${path}`;
    const res = await fetch(`${base}/api/v1${concrete(path)}`, {
      method,
      headers: { "x-test-clerk": clerk, "content-type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(BODY[key] ?? {}),
    });
    return { status: res.status, text: await res.text() };
  }

  beforeAll(async () => {
    await seed();
    before = await fingerprint();
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await wipe();
  });

  it("covers the whole tenant-bound API", () => {
    expect(routes().length).toBeGreaterThanOrEqual(55);
    for (const r of routes()) {
      if (r.path.includes("{")) {
        expect(concrete(r.path), `no tenant-A id for ${r.path}`).not.toContain("unknown");
      }
    }
  });

  it("positive control: tenant A's own admin reaches tenant A's records", async () => {
    const reads = routes().filter((r) => r.method === "GET" && r.path.includes("{"));
    const ok = [];
    for (const r of reads) if ((await hit("GET", r.path, A.admin)).status === 200) ok.push(r.path);
    /* Nearly all of them; a few need data the seed deliberately omits. */
    expect(ok.length).toBeGreaterThanOrEqual(Math.floor(reads.length * 0.7));
  });

  it("every route, as every tenant-B actor: never a success, never a tenant-A value", async () => {
    const secrets = [
      ...Object.values(A).filter((v) => v !== A.tenant),
      "TI Secret", "secret@a.invalid", "ti-secret-token-a", "TI secret",
    ];
    const failures: string[] = [];
    for (const actor of B_ACTORS) {
      for (const r of routes()) {
        const key = `${r.method} ${r.path}`;
        const { status, text } = await hit(r.method, r.path, actor.id);
        results.push({ route: key, actor: actor.id, status });
        /* A route that names a tenant-A record — in its path or its body —
           must refuse. A bare list route answers tenant B with tenant B's
           own rows, which is correct; for those only the leak check applies. */
        const aimsAtA = r.path.includes("{") || JSON.stringify(BODY[key] ?? {}).includes("ti_");
        if (aimsAtA && status < 400) failures.push(`${actor.id} ${key} → ${status}: ${text.slice(0, 160)}`);
        if (aimsAtA && status === 400) failures.push(`${actor.id} ${key} → 400 (stopped at validation; needs a valid BODY): ${text.slice(0, 200)}`);
        /* A 500 is not a refusal: the call crashed before or instead of the
           scope check, so it proves nothing about isolation. */
        if (status >= 500) failures.push(`${actor.id} ${key} → ${status} (crashed, not refused): ${text.slice(0, 200)}`);
        const leaked = secrets.filter((s) => text.includes(s));
        if (leaked.length) failures.push(`${actor.id} ${key} → leaked ${leaked.join(", ")}`);
      }
    }
    expect(failures).toEqual([]);
  }, 120_000);

  it("list endpoints answer tenant B with tenant B's rows only", async () => {
    for (const path of ["/applications", "/operations/delivery-health", "/operations/network-metrics", "/operations/job-economics"]) {
      const { status, text } = await hit("GET", path, "ti_b_admin");
      expect(status).toBe(200);
      expect(text).not.toContain("ti_athlete_a");
      expect(text).not.toContain("TI Secret");
    }
  });

  it("and nothing tenant A owns changed, in any table", async () => {
    expect(await fingerprint()).toBe(before);
  });
});
