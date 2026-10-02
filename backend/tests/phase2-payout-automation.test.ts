import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { transitionBody } from "./support/order-payment";
import { settleDeliveries } from "./support/delivery";

/* --------------------------------------------------------------------------
   Payouts approved and retried automatically, against the real API and
   database — items 14, 15 and 17 of the BTG admin review, with the programme
   owner's decisions of 2026-10-02:

     2S5-BE-06  A payout under $2,000 with every check passed is approved as
                the system — a first payout included. It goes to BTG instead
                when the payout account changed in the last 7 days, or the
                payee's automatic approvals in the last 7 days (Phase 1
                earnings too) reach $5,000 counting this one, or its payouts
                are on hold. Two requests at once can't both pass the cap.
     2S5-BE-07  A provider failure is retried automatically: TEMPORARY at
                about 1, 6 and 24 hours then BTG's; ACCOUNT emails the payee
                and retries once when the account is READY; OTHER is BTG's.
                BTG's retry resets the count. The sweep is idempotent.
     2S5-BE-08  A Phase 1 earning becoming ELIGIBLE moves on to
                APPROVED_FOR_PAYOUT on the same rule; HELD and DISPUTED are
                never touched; PAID stays Finance's.

   The provider is the stand-in; the worker's steps are called directly.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@pa-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const { issueOrderTerms, placeOrderBody } = await import("./support/order-terms");
const hasDatabase = await seededDb.databaseAvailable();

type Env = Record<string, unknown>;

describe.skipIf(!hasDatabase)("payouts approved and retried automatically", { timeout: 120_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { env } = await import("../src/config/env");
  const { decideOnboarding } = await import("../src/domain/onboarding");
  const { completeStandinPayout, sendPayout, sweepPayoutRetries } = await import("../src/domain/payouts");
  const { maybeMakeEligible } = await import("../src/domain/earning");
  const { autoApprovedSince, windowStart, dollars } = await import("../src/domain/payout-auto");

  const T = "pa_btg";
  const OTHER_T = "pa_other_btg";
  const E = { tenant: "", property: "", riley: "", clinic: "", jordan: "", campaign: "" };
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  const was: Env = {};
  const setEnv = (k: string, v: unknown) => { (env as unknown as Env)[k] = v; };

  const call = async (method: string, path: string, clerk?: string, body?: unknown) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method, headers: { "content-type": "application/json", ...(clerk ? { "x-test-clerk": clerk } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };
  const at = (days: number) => new Date(Date.now() + days * 864e5).toISOString();
  const ago = (days: number) => new Date(Date.now() - days * 864e5);
  const tokenOf = (url: string) => new URL(url).searchParams.get("t")!;
  const PAYOUT_FIELDS = {
    id: true, state: true, amountCents: true, decidedBy: true, approvedAutomatically: true, reviewReasons: true, failureKind: true,
    waitingOn: true, retryCount: true, nextRetryAt: true, accountRetryUsed: true,
  } as const;
  const payout = (id: string) => prisma.payout.findUniqueOrThrow({ where: { id }, select: PAYOUT_FIELDS });
  const emails = async () => (await prisma.outboxJob.findMany({ where: { name: "notify.email", tenantId: { in: [T, E.tenant] } }, select: { payload: true } }))
    .map((j) => j.payload as { template: string; to: string; idempotencyKey: string; data: Record<string, string> });
  const sendJobs = async (id: string) => (await prisma.outboxJob.findMany({ where: { name: "payouts.send", tenantId: T }, select: { payload: true } }))
    .filter((j) => (j.payload as { payoutId: string }).payoutId === id).length;
  const rileyPayee = () => ({ payeeType: "ATHLETE", payeeId: E.riley });
  const windowNow = () => autoApprovedSince(prisma, rileyPayee(), windowStart(new Date()));

  async function tenantsInPlay() {
    const outside = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM "Tenant" WHERE "operatorTenantId" = $1
       UNION SELECT "tenantId" FROM "User" WHERE email LIKE 'pa\\_%@pa-test.invalid' AND "tenantId" NOT IN ($1, $2)`, T, OTHER_T,
    );
    return [T, OTHER_T, ...outside.map((r) => r.id)];
  }
  async function clean() {
    const ids = await tenantsInPlay();
    await prisma.$executeRawUnsafe(`DELETE FROM "PayoutLine" WHERE "payoutId" IN (SELECT id FROM "Payout" WHERE "tenantId" = ANY($1::text[]))`, ids);
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 7; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = ANY($1::text[])`, ids).catch(() => {});
      }
    }
    await prisma.tenant.updateMany({ where: { id: { in: ids } }, data: { operatorTenantId: null } });
    await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
  }

  const walk = async (id: string, states: string[]) => {
    for (const to of states) {
      if (to === "FULFILLED") await settleDeliveries(prisma, id);
      const r = await call("POST", `/marketplace-orders/${id}/transition`, "pa_finance", transitionBody(to));
      expect(r.status, r.text).toBe(200);
    }
  };
  let day = 10;
  /** A fresh order of `units` clinics, paid and delivered: Riley's share (about $271 a unit) becomes requestable. Returns all he can request now. */
  async function freshMoney(units = 1): Promise<number> {
    await call("POST", "/cart", "pa_buyer");
    const line = await call("POST", "/cart/lines", "pa_buyer", { listingId: E.clinic, quantity: units, startsOn: at(day), endsOn: at(day + 1) });
    expect(line.status, line.text).toBe(201);
    day += 2;
    const hold = (await call("POST", "/cart/reserve", "pa_buyer")).json;
    const o = await call("POST", "/marketplace-orders", "pa_buyer", placeOrderBody(hold.id, `${T}_order_terms`));
    expect(o.json?.state, o.text).toBe("AWAITING_PAYMENT");
    await walk(o.json.id, ["PAID", "IN_DELIVERY", "FULFILLED"]);
    return (await call("GET", "/payouts/me", "pa_riley")).json.totals.requestableCents as number;
  }
  const request = () => call("POST", "/payouts", "pa_riley");
  /** Take a payout to PAID: BTG approves it if it is waiting, the provider sends and confirms. */
  async function settle(id: string) {
    if ((await payout(id)).state === "REQUESTED") expect((await call("POST", `/payouts/${id}/decision`, "pa_admin", { decision: "APPROVE" })).status).toBe(200);
    expect(await sendPayout(id)).toEqual({ sent: true });
    expect(await completeStandinPayout(id)).toMatchObject({ paid: true });
  }
  const sendBack = async (id: string) =>
    expect((await call("POST", `/payouts/${id}/decision`, "pa_admin", { decision: "REJECT", note: "Test over." })).status).toBe(200);

  /* Phase 1: a campaign order and its earning for an athlete, ready to become ELIGIBLE (no deliverables outstanding). */
  let p1 = 0;
  async function phase1Earning(athleteId: string, netCents: number, state = "PENDING", extra: Record<string, unknown> = {}, tenantId = T) {
    p1 += 1;
    /* One order per athlete and job: a job of its own each time. */
    const jobId = `pa_job_${p1}`;
    await prisma.nilJob.create({ data: { id: jobId, tenantId: T, name: `PA job ${p1}`, baseLow: 100, baseHigh: 200, sellLow: 150, sellHigh: 300, sellFloorEmerging: 150, sellFloorCreator: 150, sellFloorPremium: 150 } });
    const order = await prisma.campaignOrder.create({ data: {
      id: `pa_co_${p1}`, tenantId: T, campaignId: E.campaign, athleteId, jobId,
      compensation: netCents, sellPrice: netCents * 2, usageRights: "90 days", dueDate: new Date("2026-11-15"), state: "ACTIVE",
    } });
    const e = await prisma.earning.create({ data: { tenantId, athleteId, orderId: order.id, gross: netCents, taxYear: 2026, state: state as never, ...extra } });
    return { orderId: order.id, earningId: e.id };
  }
  const becomeEligible = (orderId: string) => prisma.$transaction((tx) => maybeMakeEligible(tx, { tenantId: T, userId: "pa_admin" }, orderId));
  const earning = (id: string) => prisma.earning.findUniqueOrThrow({ where: { id }, select: { state: true, approvedAutomatically: true, reviewReasons: true, reference: true } });

  beforeAll(async () => {
    for (const k of ["PAYOUT_AUTO_APPROVE_LIMIT_CENTS", "MARKETPLACE_SPENDING_LIMIT_START_CENTS", "MARKETPLACE_SPENDING_LIMIT_CAP_CENTS", "STANDIN_PAYOUT_FAILURE", "PAYMENT_PROVIDER"]) {
      was[k] = (env as unknown as Env)[k];
    }
    /* The sponsor buys a lot here; the spending limit is another task's story. */
    setEnv("MARKETPLACE_SPENDING_LIMIT_START_CENTS", 100_000_000);
    setEnv("MARKETPLACE_SPENDING_LIMIT_CAP_CENTS", 100_000_000);
    setEnv("PAYMENT_PROVIDER", "standin");
    setEnv("STANDIN_PAYOUT_FAILURE", undefined);
    await clean();
    await prisma.tenant.createMany({ data: [{ id: T, name: "Payout automation BTG" }, { id: OTHER_T, name: "Payout automation other BTG" }] });
    await issueOrderTerms(prisma, T);
    await prisma.sponsor.create({ data: { id: "pa_harbor", tenantId: T, name: "Harbor Coffee PA", categories: ["RESTAURANT"] } });
    await prisma.user.createMany({ data: [
      { id: "pa_admin", tenantId: T, clerkId: "pa_admin", email: "pa_admin@pa-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "pa_finance", tenantId: T, clerkId: "pa_finance", email: "pa_finance@pa-test.invalid", roles: ["FINANCE"] },
      { id: "pa_buyer", tenantId: T, clerkId: "pa_buyer", email: "pa_buyer@pa-test.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "pa_harbor" },
      { id: "pa_other_admin", tenantId: OTHER_T, clerkId: "pa_other_admin", email: "pa_other_admin@pa-test.invalid", roles: ["BTG_ADMIN"] },
    ] });
    const rule = (kind: string, bps: number, fixedCents = 0) => ({ id: `pa_${kind}`, tenantId: T, ruleKey: `pa_${kind}`, version: 1, kind, scope: "GLOBAL", bps, fixedCents, priority: 0, effectiveFrom: new Date("2026-01-01") });
    await prisma.commissionRule.createMany({ data: [rule("PLATFORM_FEE", 1500), rule("MANAGEMENT_FEE", 500), rule("PROCESSING", 290, 30), rule("REFERRAL", 200), rule("RESERVE", 1000)] });
    await prisma.propertyOnboarding.create({ data: {
      id: "pa_onb", tenantId: T, orgType: "TEAM", orgName: "Westfield Hawks PA", stateCode: "MD", state: "PENDING_REVIEW",
      contacts: [{ name: "Dana Brooks", email: "pa_mgr@pa-test.invalid", phone: "301-555-0100", role: "General manager", primary: true }],
      details: { legalEntityName: "Westfield Hawks PA LLC", league: "MD Amateur", sport: "Basketball" },
      payoutAcknowledgedAt: new Date(), termsAcceptedAt: new Date(), submittedAt: new Date(),
    } });
    const approved = await decideOnboarding({ userId: "pa_admin", tenantId: T, roles: ["BTG_ADMIN"], sponsorId: null, athleteId: null, guardianId: null, propertyId: null }, "pa_onb", "APPROVE");
    const p = await prisma.property.findUniqueOrThrow({ where: { id: approved.propertyId! }, select: { id: true, tenantId: true } });
    Object.assign(E, { tenant: p.tenantId, property: p.id });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    await call("GET", "/me", "pa_mgr");
    const riley = await call("POST", "/team/roster", "pa_mgr", { legalName: "Riley Carter PA", displayName: "RILEY.CARTER.PA", email: "pa_riley@pa-test.invalid", sport: "Basketball", ageBand: "18_PLUS", teamShareBps: 2000 });
    expect(riley.status, riley.text).toBe(201);
    E.riley = riley.json.id;
    const clinic = await call("POST", "/inventory", "pa_riley", { title: "Basketball clinic PA", kind: "CAMP", priceCents: 50_000, quantity: 100 });
    expect(clinic.status, clinic.text).toBe(201);
    E.clinic = (await call("POST", "/listings", "pa_mgr", { inventoryItemId: clinic.json.id, title: "Youth basketball clinic with Riley Carter PA", description: "A 90-minute youth clinic at your venue, for up to 20 kids." })).json.id;
    expect((await call("POST", `/listings/${E.clinic}/submit`, "pa_mgr")).json.state).toBe("PUBLISHED");
    /* Riley's payout account, ready at the provider — set up once. */
    const link = (await call("POST", "/payouts/account/link", "pa_riley", {})).json;
    await call("POST", "/public/test-provider/account", undefined, { token: tokenOf(link.url), outcome: "READY" });

    /* Phase 1: a campaign, and an athlete paid outside SponsorX. */
    E.campaign = (await prisma.campaign.create({ data: { tenantId: T, sponsorId: "pa_harbor", name: "PA campaign", budget: 10_000_000, startDate: new Date("2026-10-01"), endDate: new Date("2026-11-30"), state: "ACTIVE" } as never })).id;
    E.jordan = (await prisma.athlete.create({ data: { tenantId: T, slug: "pa-jordan-p1", legalName: "Jordan Phase One PA", displayName: "JORDAN.PA", email: "pa_jordan@pa-test.invalid", sport: "Soccer", ageBand: "18_PLUS", state: "ACTIVE" } as never })).id;
    await prisma.user.create({ data: { id: "pa_jordan", tenantId: T, clerkId: "pa_jordan", email: "pa_jordan@pa-test.invalid", roles: ["ATHLETE"], athleteId: E.jordan } });
  });

  afterAll(async () => {
    for (const [k, v] of Object.entries(was)) setEnv(k, v);
    server?.close();
    await clean();
  });

  /* ───────────────────────────── 2S5-BE-06 ───────────────────────────── */

  describe("2S5-BE-06 · a payout approved automatically", () => {
    it("Riley's first payout, under $2,000 with every check passed, is approved as the system — and he's told", async () => {
      const amount = await freshMoney(1);
      const made = await request();
      expect(made.status, made.text).toBe(201);
      const [p] = made.json.payouts;
      expect(amount).toBeGreaterThan(20_000);
      expect(p).toMatchObject({ amountCents: amount, state: "APPROVED", approvedAutomatically: true, waitingOn: null });
      /* The payee never reads the rule's reasons, the failure kind or the schedule. */
      for (const k of ["reviewReasons", "retryCount", "nextRetryAt", "failureKind"]) expect(k in p, k).toBe(false);
      expect(await payout(p.id)).toMatchObject({ decidedBy: "system", approvedAutomatically: true, reviewReasons: [] });
      const trail = await prisma.auditLog.findFirstOrThrow({ where: { entityId: p.id, action: "payout.autoApprove" }, select: { actorId: true, after: true } });
      expect(trail.actorId).toBeNull();
      expect(trail.after).toMatchObject({ state: "APPROVED", checks: expect.arrayContaining([expect.objectContaining({ key: "account", ok: true })]) });
      /* Exactly as BTG's approval: handed to the provider, the payee emailed. */
      expect(await sendJobs(p.id)).toBe(1);
      expect(await emails()).toContainEqual(expect.objectContaining({ template: "payout.approved", to: "pa_riley@pa-test.invalid" }));
      /* BTG sees it, with the badge's field and no reasons; nothing for BTG to decide. */
      const list = (await call("GET", "/payouts?state=APPROVED", "pa_admin")).json;
      expect(list.payouts.find((x: { id: string }) => x.id === p.id)).toMatchObject({ approvedAutomatically: true, reviewReasons: [], waitingOn: null });
      expect((await call("POST", `/payouts/${p.id}/decision`, "pa_admin", { decision: "APPROVE" })).status).toBe(409);
      const mine = (await call("GET", `/payouts/${p.id}`, "pa_riley")).json;
      expect(mine).toMatchObject({ approvedAutomatically: true });
      expect("reviewReasons" in mine).toBe(false);
      await sendPayout(p.id);
      expect(await completeStandinPayout(p.id)).toMatchObject({ paid: true });
    });

    it("over $2,000 waits for BTG with the reason in words; the payee sees only that BTG is reviewing it", async () => {
      const amount = await freshMoney(8); // about $2,170
      expect(amount).toBeGreaterThan(200_000);
      const [p] = (await request()).json.payouts;
      expect(p).toMatchObject({ amountCents: amount, state: "REQUESTED", approvedAutomatically: false, waitingOn: "BTG" });
      expect("reviewReasons" in p).toBe(false);
      expect((await call("GET", `/payouts/${p.id}`, "pa_admin")).json).toMatchObject({ reviewReasons: ["Over $2,000"], waitingOn: "BTG" });
      expect(await sendJobs(p.id)).toBe(0);
      /* BTG's own decisions are unchanged. */
      await settle(p.id);
      expect(await payout(p.id)).toMatchObject({ decidedBy: "pa_admin", approvedAutomatically: false });
    });

    it("exactly at the limit waits for BTG; a cent over the amount passes", async () => {
      const amount = await freshMoney(1);
      setEnv("PAYOUT_AUTO_APPROVE_LIMIT_CENTS", amount);
      try {
        const [atLimit] = (await request()).json.payouts;
        expect(atLimit.state).toBe("REQUESTED");
        expect((await payout(atLimit.id)).reviewReasons).toEqual([`At the ${dollars(amount)} limit`]);
        await sendBack(atLimit.id);
        setEnv("PAYOUT_AUTO_APPROVE_LIMIT_CENTS", amount + 1);
        const [under] = (await request()).json.payouts;
        expect(under).toMatchObject({ state: "APPROVED", approvedAutomatically: true });
        await settle(under.id);
      } finally {
        setEnv("PAYOUT_AUTO_APPROVE_LIMIT_CENTS", was.PAYOUT_AUTO_APPROVE_LIMIT_CENTS);
      }
    });

    it("a payout account changed 6 days ago is BTG's to check; changed 8 days ago, it is not", async () => {
      const acct = { payeeType_payeeId: { payeeType: "ATHLETE", payeeId: E.riley } };
      const sixAgo = ago(6);
      await prisma.payoutAccount.update({ where: acct, data: { changedAt: sixAgo } });
      await freshMoney(1);
      const [recent] = (await request()).json.payouts;
      expect(recent.state).toBe("REQUESTED");
      const day6 = sixAgo.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
      expect((await payout(recent.id)).reviewReasons).toEqual([`Payout account changed on ${day6}`]);
      await settle(recent.id);

      await prisma.payoutAccount.update({ where: acct, data: { changedAt: ago(8) } });
      await freshMoney(1);
      const [older] = (await request()).json.payouts;
      expect(older).toMatchObject({ state: "APPROVED", approvedAutomatically: true });
      await settle(older.id);
      await prisma.payoutAccount.update({ where: acct, data: { changedAt: null } });
    });

    it("re-onboarding at the provider (READY → needs info → READY) records the change; a plain READY report does not", async () => {
      const acct = { payeeType_payeeId: { payeeType: "ATHLETE", payeeId: E.riley } };
      const link = (await call("POST", "/payouts/account/link", "pa_riley", {})).json;
      await call("POST", "/public/test-provider/account", undefined, { token: tokenOf(link.url), outcome: "READY" });
      expect((await prisma.payoutAccount.findUniqueOrThrow({ where: acct, select: { changedAt: true } })).changedAt).toBeNull();
      await call("POST", "/public/test-provider/account", undefined, { token: tokenOf(link.url), outcome: "NEEDS_INFO" });
      await call("POST", "/public/test-provider/account", undefined, { token: tokenOf(link.url), outcome: "READY" });
      const changed = (await prisma.payoutAccount.findUniqueOrThrow({ where: acct, select: { changedAt: true } })).changedAt;
      expect(changed!.getTime()).toBeGreaterThan(Date.now() - 60_000);
      await freshMoney(1);
      const [p] = (await request()).json.payouts;
      expect(p.state).toBe("REQUESTED");
      expect((await payout(p.id)).reviewReasons[0]).toMatch(/^Payout account changed on /);
      await settle(p.id);
      await prisma.payoutAccount.update({ where: acct, data: { changedAt: null } });
    });

    it("the 7-day $5,000 cap counts this payout and the athlete's Phase 1 earnings approved automatically", async () => {
      const amount = await freshMoney(1);
      const before = await windowNow();
      /* An automatic Phase 1 approval of Riley's: with this payout, exactly $5,000. */
      const gross = 500_000 - before - amount;
      const seeded = await phase1Earning(E.riley, gross, "APPROVED_FOR_PAYOUT", { approvedAutomatically: true, autoApprovedAt: ago(2) });
      /* One from 8 days ago is outside the window. */
      await phase1Earning(E.riley, 90_000, "PAID", { approvedAutomatically: true, autoApprovedAt: ago(8) });
      expect(await windowNow()).toBe(before + gross);
      const [capped] = (await request()).json.payouts;
      expect(capped.state).toBe("REQUESTED");
      expect((await payout(capped.id)).reviewReasons).toEqual([`${dollars(before + gross)} approved automatically in the last 7 days`]);
      await sendBack(capped.id);
      /* Once that approval is older than the window, the same money passes. */
      await prisma.earning.update({ where: { id: seeded.earningId }, data: { autoApprovedAt: ago(8) } });
      const [p] = (await request()).json.payouts;
      expect(p).toMatchObject({ state: "APPROVED", approvedAutomatically: true });
      await settle(p.id);
    });

    it("approved in two tenants: the cap counts both, but BTG's reason names no figure", async () => {
      const amount = await freshMoney(1);
      const before = await windowNow();
      /* An automatic payout to Riley in another tenant's books: with this one, the cap. */
      await prisma.payout.create({ data: {
        tenantId: OTHER_T, payeeType: "ATHLETE", payeeId: E.riley, payeeTenantId: E.tenant, amountCents: 500_000 - before - amount,
        state: "PAID", decidedBy: "system", decidedAt: ago(1), approvedAutomatically: true,
      }, select: { id: true } });
      try {
        const [p] = (await request()).json.payouts;
        expect(p.state).toBe("REQUESTED");
        const reasons = (await call("GET", `/payouts/${p.id}`, "pa_admin")).json.reviewReasons as string[];
        expect(reasons).toEqual(["Automatic payouts in the last 7 days would reach the $5,000 limit"]);
        expect(reasons.join(" ")).not.toMatch(/\$\d[\d,]*(\.\d\d)? approved/);
        const trail = await prisma.auditLog.findFirstOrThrow({ where: { entityId: p.id, action: "payout.request" }, select: { after: true } });
        expect(JSON.stringify(trail.after)).not.toMatch(/\$[\d,]+(\.\d\d)? approved automatically/);
        await sendBack(p.id);
        /* The same, for a Phase 1 earning in this tenant beside the other tenant's payout. */
        const jordanForeign = await prisma.payout.create({ data: {
          tenantId: OTHER_T, payeeType: "ATHLETE", payeeId: E.jordan, payeeTenantId: T, amountCents: 495_000,
          state: "PAID", decidedBy: "system", decidedAt: ago(1), approvedAutomatically: true,
        }, select: { id: true } });
        const { orderId, earningId } = await phase1Earning(E.jordan, 10_000);
        expect(await becomeEligible(orderId)).toMatchObject({ state: "ELIGIBLE" });
        expect((await earning(earningId)).reviewReasons).toEqual(["Automatic payouts in the last 7 days would reach the $5,000 limit"]);
        await prisma.payout.delete({ where: { id: jordanForeign.id }, select: { id: true } });
        /* Everything counted in the reader's own tenant: the figure stays. */
        const own = await phase1Earning(E.jordan, 495_000, "APPROVED_FOR_PAYOUT", { approvedAutomatically: true, autoApprovedAt: ago(1) });
        const next = await phase1Earning(E.jordan, 10_000);
        expect(await becomeEligible(next.orderId)).toMatchObject({ state: "ELIGIBLE" });
        expect((await earning(next.earningId)).reviewReasons).toEqual(["$4,950 approved automatically in the last 7 days"]);
        await prisma.earning.update({ where: { id: own.earningId }, data: { autoApprovedAt: ago(30) }, select: { id: true } });
      } finally {
        /* The other tenant's seeded payouts go: its BTG must see none of this suite's. */
        await prisma.payout.deleteMany({ where: { tenantId: OTHER_T } });
      }
      const [again] = (await request()).json.payouts;
      expect(again).toMatchObject({ state: "APPROVED", approvedAutomatically: true });
      await settle(again.id);
    });

    it("payouts on hold: nothing is requested, let alone approved automatically", async () => {
      await freshMoney(1);
      const since = new Date();
      await prisma.athlete.update({ where: { id: E.riley }, data: { signupRejectedAt: new Date() } });
      try {
        const refused = await request();
        expect([403, 409]).toContain(refused.status);
        expect(await prisma.payout.count({ where: { payeeId: E.riley, createdAt: { gte: since } } })).toBe(0);
      } finally {
        await prisma.athlete.update({ where: { id: E.riley }, data: { signupRejectedAt: null } });
      }
      const [p] = (await request()).json.payouts;
      await settle(p.id);
    });

    it("two requests at once: one payout claims the money, the other is refused", async () => {
      const amount = await freshMoney(2);
      const [a, b] = await Promise.all([request(), request()]);
      expect([a.status, b.status].sort()).toEqual([201, 409]);
      const made = (a.status === 201 ? a : b).json.payouts;
      expect(made).toHaveLength(1);
      expect(made[0]).toMatchObject({ amountCents: amount, state: "APPROVED" });
      await settle(made[0].id);
    });

    it("a payout request and a Phase 1 earning at the same moment can't both slip under the cap", async () => {
      const amount = await freshMoney(1);
      const before = await windowNow();
      /* Each alone fits under $5,000; together they don't. */
      await phase1Earning(E.riley, 500_000 - before - amount - 100, "APPROVED_FOR_PAYOUT", { approvedAutomatically: true, autoApprovedAt: ago(1) });
      const racer = await phase1Earning(E.riley, 200);
      const [req] = await Promise.all([request(), becomeEligible(racer.orderId)]);
      const p = await payout(req.json.payouts[0].id);
      const e = await earning(racer.earningId);
      expect([p.approvedAutomatically, e.approvedAutomatically].filter(Boolean)).toHaveLength(1);
      if (!p.approvedAutomatically) expect(p.reviewReasons[0]).toMatch(/approved automatically in the last 7 days$/);
      else expect(e).toMatchObject({ state: "ELIGIBLE", reviewReasons: [expect.stringMatching(/approved automatically in the last 7 days$/)] });
      await settle(p.id);
      await prisma.earning.updateMany({ where: { athleteId: E.riley }, data: { autoApprovedAt: ago(30) } });
    });
  });

  /* ───────────────────────────── 2S5-BE-07 ───────────────────────────── */

  describe("2S5-BE-07 · a payout the provider couldn't send", () => {
    const H = 3_600_000;
    let amount = 0;
    async function sentPayout() {
      amount = await freshMoney(1);
      const [p] = (await request()).json.payouts;
      expect(p.state).toBe("APPROVED");
      expect(await sendPayout(p.id)).toEqual({ sent: true });
      return p.id as string;
    }
    const failWith = async (id: string, kind: string, when: Date) => {
      setEnv("STANDIN_PAYOUT_FAILURE", kind);
      try {
        expect(await completeStandinPayout(id, when)).toMatchObject({ failed: true });
      } finally {
        setEnv("STANDIN_PAYOUT_FAILURE", undefined);
      }
    };
    const sweep = (when: Date) => sweepPayoutRetries(when, { tenantIds: [T] });

    it("TEMPORARY: retried at about 1, 6 and 24 hours; after the third retry fails it is BTG's", async () => {
      const id = await sentPayout();
      let t = new Date();
      await failWith(id, "TEMPORARY", t);
      expect(await payout(id)).toMatchObject({ state: "FAILED", failureKind: "TEMPORARY", waitingOn: "SYSTEM_RETRY", retryCount: 0, nextRetryAt: new Date(t.getTime() + H) });
      /* Still claims its money — it will be sent again without anyone asking. */
      expect((await call("GET", "/payouts/me", "pa_riley")).json.totals.inFlightCents).toBe(amount);
      expect((await request()).status).toBe(409);
      /* Not BTG's: off the default list, on the Failed list with its schedule. */
      expect((await call("GET", "/payouts?waitingOn=BTG", "pa_admin")).json.payouts.map((x: { id: string }) => x.id)).not.toContain(id);
      const failed = (await call("GET", "/payouts?state=FAILED", "pa_admin")).json;
      expect(failed.payouts.find((x: { id: string }) => x.id === id)).toMatchObject({ waitingOn: "SYSTEM_RETRY", retryCount: 0, failureKind: "TEMPORARY", nextRetryAt: new Date(t.getTime() + H).toISOString() });
      expect(failed.waiting.failed.SYSTEM_RETRY).toBeGreaterThanOrEqual(1);

      expect((await sweep(new Date(t.getTime() + H - 60_000))).retried).toBe(0);
      for (const [n, hours] of [[1, 1], [2, 6], [3, 24]] as const) {
        const due = new Date(t.getTime() + hours * H);
        expect((await sweep(due)).retried, `retry ${n}`).toBeGreaterThanOrEqual(1);
        /* Run twice, it retries once. */
        await sweep(due);
        expect(await payout(id)).toMatchObject({ state: "APPROVED", retryCount: n, waitingOn: null, nextRetryAt: null });
        expect(await sendJobs(id)).toBe(1 + n);
        expect(await sendPayout(id)).toEqual({ sent: true });
        expect(await sendPayout(id)).toEqual({ sent: false }); // a second send job hands it over once
        t = new Date(due.getTime() + 60_000);
        await failWith(id, "TEMPORARY", t);
      }
      expect(await prisma.auditLog.count({ where: { entityId: id, action: "payout.autoRetry", actorId: null } })).toBe(3);
      expect(await payout(id)).toMatchObject({ state: "FAILED", waitingOn: "BTG", nextRetryAt: null, retryCount: 3, reviewReasons: ["Couldn't be sent after 3 tries"] });
      expect((await sweep(new Date(t.getTime() + 72 * H))).retried).toBe(0);
      expect((await call("GET", "/payouts?waitingOn=BTG", "pa_admin")).json.payouts.map((x: { id: string }) => x.id)).toContain(id);
      /* Left for BTG, it no longer claims the money. */
      expect((await call("GET", "/payouts/me", "pa_riley")).json.totals.inFlightCents).toBe(0);

      /* BTG's retry resets the count: the next temporary failure is retried automatically again. */
      const retried = await call("POST", `/payouts/${id}/retry`, "pa_admin");
      expect(retried.json, retried.text).toMatchObject({ state: "APPROVED", retryCount: 0, waitingOn: null });
      expect(await sendPayout(id)).toEqual({ sent: true });
      const t2 = new Date();
      await failWith(id, "TEMPORARY", t2);
      expect(await payout(id)).toMatchObject({ waitingOn: "SYSTEM_RETRY", retryCount: 0, nextRetryAt: new Date(t2.getTime() + H) });
      await sweep(new Date(t2.getTime() + H));
      await sendPayout(id);
      expect(await completeStandinPayout(id)).toMatchObject({ paid: true });
    });

    it("BTG's retry is refused once the money has been requested again", async () => {
      const id = await sentPayout();
      await failWith(id, "OTHER", new Date());
      const [again] = (await request()).json.payouts;
      expect(again.amountCents).toBe(amount);
      const refused = await call("POST", `/payouts/${id}/retry`, "pa_admin");
      expect(refused.status).toBe(409);
      expect((await payout(id)).state).toBe("FAILED");
      await settle(again.id);
    });

    it("ACCOUNT: the payee is emailed with a link to their money page; READY again, it is retried once; failing again, it is BTG's", async () => {
      const id = await sentPayout();
      await failWith(id, "ACCOUNT", new Date());
      expect(await payout(id)).toMatchObject({ state: "FAILED", failureKind: "ACCOUNT", waitingOn: "PAYEE_ACCOUNT", reviewReasons: ["Waiting for the payee to fix their payout account"] });
      const mail = (await emails()).filter((m) => m.template === "payout.accountNeedsFix" && m.to === "pa_riley@pa-test.invalid");
      expect(mail).toHaveLength(1);
      expect(mail[0]!.data.portalUrl).toMatch(/\/athlete\/money$/);
      /* The payee reads who it waits on, never the reasons. */
      const mine = (await call("GET", "/payouts/me", "pa_riley")).json.payouts.find((x: { id: string }) => x.id === id);
      expect(mine).toMatchObject({ state: "FAILED", waitingOn: "PAYEE_ACCOUNT" });
      expect("reviewReasons" in mine).toBe(false);
      expect((await sweep(new Date(Date.now() + 48 * H))).retried).toBe(0);
      expect((await call("GET", "/payouts?state=FAILED&waitingOn=PAYEE_ACCOUNT", "pa_admin")).json.payouts.map((x: { id: string }) => x.id)).toEqual([id]);

      /* Riley fixes it at the provider: READY, and the payout goes again on its own. */
      const link = (await call("POST", "/payouts/account/link", "pa_riley", {})).json;
      await call("POST", "/public/test-provider/account", undefined, { token: tokenOf(link.url), outcome: "READY" });
      expect(await payout(id)).toMatchObject({ state: "APPROVED", accountRetryUsed: true, waitingOn: null });
      expect(await prisma.auditLog.count({ where: { entityId: id, action: "payout.autoRetry", actorId: null } })).toBe(1);
      expect(await sendPayout(id)).toEqual({ sent: true });
      await failWith(id, "ACCOUNT", new Date());
      expect(await payout(id)).toMatchObject({ state: "FAILED", waitingOn: "BTG", reviewReasons: ["Couldn't be sent after the payee fixed their payout account"] });
      /* Once only: the next READY report does nothing more. */
      await call("POST", "/public/test-provider/account", undefined, { token: tokenOf(link.url), outcome: "READY" });
      expect((await payout(id)).state).toBe("FAILED");
      expect((await emails()).filter((m) => m.template === "payout.accountNeedsFix" && m.to === "pa_riley@pa-test.invalid")).toHaveLength(1);
      expect((await call("POST", `/payouts/${id}/retry`, "pa_admin")).json.state).toBe("APPROVED");
      await sendPayout(id);
      expect(await completeStandinPayout(id)).toMatchObject({ paid: true });
    });

    it("OTHER: straight to BTG, and on BTG's default list", async () => {
      const id = await sentPayout();
      await failWith(id, "OTHER", new Date());
      expect(await payout(id)).toMatchObject({ state: "FAILED", failureKind: "OTHER", waitingOn: "BTG", nextRetryAt: null, reviewReasons: [] });
      expect((await sweep(new Date(Date.now() + 48 * H))).retried).toBe(0);
      const mine = (await call("GET", "/payouts?waitingOn=BTG", "pa_admin")).json;
      expect(mine.payouts.find((x: { id: string }) => x.id === id)).toMatchObject({ waitingOn: "BTG", failureReason: expect.stringMatching(/refused/) });
      expect((await call("POST", `/payouts/${id}/retry`, "pa_admin")).json.state).toBe("APPROVED");
      await sendPayout(id);
      expect(await completeStandinPayout(id)).toMatchObject({ paid: true });
    });

    it("with no provider connected nothing is sent, so nothing fails: an approved payout waits", async () => {
      await freshMoney(1);
      setEnv("PAYMENT_PROVIDER", "none");
      try {
        const [p] = (await request()).json.payouts;
        expect(p.state).toBe("APPROVED");
        expect(await sendPayout(p.id)).toEqual({ sent: false });
        expect(await completeStandinPayout(p.id)).toEqual({ paid: false, failed: false });
        expect((await payout(p.id)).state).toBe("APPROVED");
        setEnv("PAYMENT_PROVIDER", "standin");
        await settle(p.id);
      } finally {
        setEnv("PAYMENT_PROVIDER", "standin");
      }
    });
  });

  /* ───────────────────────────── 2S5-BE-08 ───────────────────────────── */

  describe("2S5-BE-08 · Phase 1 earnings approved for payout automatically", () => {
    it("an earning under $2,000 moves on to APPROVED_FOR_PAYOUT as the system as it becomes ELIGIBLE", async () => {
      const { orderId, earningId } = await phase1Earning(E.jordan, 150_000);
      expect(await becomeEligible(orderId)).toMatchObject({ state: "APPROVED_FOR_PAYOUT" });
      expect(await earning(earningId)).toMatchObject({ state: "APPROVED_FOR_PAYOUT", approvedAutomatically: true, reviewReasons: [] });
      const trail = await prisma.auditLog.findMany({ where: { entityId: earningId }, select: { action: true, actorId: true }, orderBy: { at: "asc" } });
      expect(trail).toEqual(expect.arrayContaining([
        expect.objectContaining({ action: "earning.markEligible" }),
        { action: "earning.approveForPayout", actorId: null },
      ]));
      /* Finance sees the badge; the athlete sees it too, never a reason. */
      const fin = (await call("GET", "/earnings", "pa_finance")).json.earnings.find((x: { id: string }) => x.id === earningId);
      expect(fin).toMatchObject({ approvedAutomatically: true, reviewReasons: [] });
      const own = await call("GET", "/earnings", "pa_jordan");
      expect(own.status, own.text).toBe(200);
      const row = own.json.earnings.find((x: { id: string }) => x.id === earningId);
      expect(row).toMatchObject({ approvedAutomatically: true });
      expect("reviewReasons" in row).toBe(false);
      /* PAID stays manual: nothing pays it; Finance records the transfer. */
      expect((await earning(earningId)).state).toBe("APPROVED_FOR_PAYOUT");
      const paid = await call("POST", `/earnings/${earningId}/transition`, "pa_finance", { to: "PAID", reference: "ZB-PA-0001" });
      expect(paid.json, paid.text).toMatchObject({ state: "PAID" });
      expect(await earning(earningId)).toMatchObject({ reference: "ZB-PA-0001" });
    });

    it("over $2,000 it stays ELIGIBLE with its reason, for Finance to approve by hand", async () => {
      const { orderId, earningId } = await phase1Earning(E.jordan, 250_000);
      expect(await becomeEligible(orderId)).toMatchObject({ state: "ELIGIBLE" });
      expect(await earning(earningId)).toMatchObject({ state: "ELIGIBLE", approvedAutomatically: false, reviewReasons: ["Over $2,000"] });
      const fin = (await call("GET", "/earnings", "pa_finance")).json.earnings.find((x: { id: string }) => x.id === earningId);
      expect(fin).toMatchObject({ state: "ELIGIBLE", reviewReasons: ["Over $2,000"] });
      const ok = await call("POST", `/earnings/${earningId}/transition`, "pa_finance", { to: "APPROVED_FOR_PAYOUT" });
      expect(ok.json, ok.text).toMatchObject({ state: "APPROVED_FOR_PAYOUT" });
      expect((await earning(earningId)).approvedAutomatically).toBe(false);
    });

    it("the athlete's 7-day total counts their automatic approvals", async () => {
      await phase1Earning(E.jordan, 0, "PAID"); // noise: nothing automatic
      const before = await autoApprovedSince(prisma, { payeeType: "ATHLETE", payeeId: E.jordan }, windowStart(new Date()));
      await phase1Earning(E.jordan, 500_000 - before - 30_000, "APPROVED_FOR_PAYOUT", { approvedAutomatically: true, autoApprovedAt: ago(1) });
      const { orderId, earningId } = await phase1Earning(E.jordan, 30_000);
      expect(await becomeEligible(orderId)).toMatchObject({ state: "ELIGIBLE" });
      expect((await earning(earningId)).reviewReasons).toEqual([`${dollars(500_000 - 30_000)} approved automatically in the last 7 days`]);
      await prisma.earning.updateMany({ where: { athleteId: E.jordan }, data: { autoApprovedAt: ago(30) } });
    });

    it("an athlete whose payouts are on hold is left for Finance", async () => {
      await prisma.athlete.update({ where: { id: E.jordan }, data: { signupRejectedAt: new Date() } });
      try {
        const { orderId, earningId } = await phase1Earning(E.jordan, 10_000);
        expect(await becomeEligible(orderId)).toMatchObject({ state: "ELIGIBLE" });
        expect((await earning(earningId)).reviewReasons).toEqual(["Payouts on hold"]);
      } finally {
        await prisma.athlete.update({ where: { id: E.jordan }, data: { signupRejectedAt: null } });
      }
    });

    it.each(["HELD", "DISPUTED"])("a %s earning is never touched — nor when Finance releases it to ELIGIBLE", async (state) => {
      const { orderId, earningId } = await phase1Earning(E.jordan, 10_000, state);
      expect(await becomeEligible(orderId)).toBeNull();
      expect(await earning(earningId)).toMatchObject({ state, approvedAutomatically: false, reviewReasons: [] });
      const back = await call("POST", `/earnings/${earningId}/transition`, "pa_finance", { to: "ELIGIBLE" });
      expect(back.json, back.text).toMatchObject({ state: "ELIGIBLE" });
      expect(await earning(earningId)).toMatchObject({ state: "ELIGIBLE", approvedAutomatically: false });
    });
  });

  /* ─────────────────────────── authz, tenants ─────────────────────────── */

  describe("who reads and moves what", () => {
    it("only BTG admin and Finance list payouts or retry them; another tenant's BTG sees none of these", async () => {
      const any = await prisma.payout.findFirstOrThrow({ where: { tenantId: T }, select: { id: true } });
      for (const who of ["pa_riley", "pa_mgr", "pa_buyer", "pa_jordan"]) {
        expect((await call("GET", "/payouts?waitingOn=BTG", who)).status, who).toBe(403);
        expect((await call("POST", `/payouts/${any.id}/retry`, who)).status, who).toBe(403);
      }
      const other = await call("GET", "/payouts?state=FAILED,REQUESTED,APPROVED,PAID", "pa_other_admin");
      expect(other.status, other.text).toBe(200);
      expect(other.json.payouts).toEqual([]);
      expect(other.json.waiting).toMatchObject({ BTG: 0, SYSTEM_RETRY: 0, PAYEE_ACCOUNT: 0 });
      expect((await call("GET", `/payouts/${any.id}`, "pa_other_admin")).status).toBe(403);
      expect((await call("POST", `/payouts/${any.id}/retry`, "pa_other_admin")).status).toBe(403);
      expect((await call("GET", "/payouts?waitingOn=NOBODY", "pa_admin")).status).toBe(400);
      /* Phase 1 reasons are BTG's: another tenant's Finance-less admin sees none of these earnings. */
      expect((await call("GET", "/earnings", "pa_other_admin")).json.earnings).toEqual([]);
    });
  });
});
