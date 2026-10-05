import type { AddressInfo } from "node:net";
import { createHmac } from "node:crypto";
import { expect } from "vitest";

import type { PrismaClient } from "../../src/generated/prisma/client";
import { transitionBody } from "./order-payment";
import { settleDeliveries } from "./delivery";
import { issueOrderTerms, placeOrderBody } from "./order-terms";

/* --------------------------------------------------------------------------
   A small marketplace for the payment-exception suites (2S5-INT-02,
   2S5-BE-03/-04/-05, 2S8-QA-02), against the real API and database: a BTG
   tenant with admin and Finance, a sponsor, a team (approved through
   onboarding) with a roster athlete, Riley, selling a clinic, and Riley's
   payout account READY at the stand-in provider.

   Each suite names its own tenants and prefix (suite isolation), and must
   mock Clerk so that the `x-test-clerk` header is the login and
   `${id}@${domain}` its email — the users here are created that way.
   -------------------------------------------------------------------------- */

type Env = Record<string, unknown>;
export type World = Awaited<ReturnType<typeof paymentWorld>>;

export async function paymentWorld(o: { T: string; OTHER_T: string; prefix: string; domain: string }) {
  const { T, OTHER_T, prefix: P, domain } = o;
  const { prisma } = await import("../../src/db/client");
  const { createApp } = await import("../../src/app");
  const { env } = await import("../../src/config/env");
  const { decideOnboarding } = await import("../../src/domain/onboarding");
  const events = await import("../../src/domain/payment-events");

  const E = { tenant: "", property: "", riley: "", clinic: "", sponsor: `${P}_harbor` };
  const id = (s: string) => `${P}_${s}`;
  let server: ReturnType<ReturnType<typeof createApp>["listen"]> | undefined;
  let base = "";
  const was: Env = {};
  const setEnv = (k: string, v: unknown) => {
    if (!(k in was)) was[k] = (env as unknown as Env)[k];
    (env as unknown as Env)[k] = v;
  };

  const call = async (method: string, path: string, clerk?: string, body?: unknown) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method, headers: { "content-type": "application/json", ...(clerk ? { "x-test-clerk": clerk } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };

  /** A raw delivery to the provider webhook: `raw` signed at `at` with `secret` (the stand-in's by default). */
  const deliver = async (raw: string, opts: { at?: Date; secret?: string; signature?: string | null; provider?: string } = {}) => {
    const t = Math.floor((opts.at ?? new Date()).getTime() / 1000);
    const sig = opts.signature !== undefined ? opts.signature : `t=${t},v1=${createHmac("sha256", opts.secret ?? env.STANDIN_PROVIDER_SECRET).update(`${t}.${raw}`).digest("hex")}`;
    const res = await fetch(`${base}/api/v1/webhooks/payments/${opts.provider ?? "standin"}`, {
      method: "POST", headers: { "content-type": "application/json", ...(sig ? { "x-standin-signature": sig } : {}) }, body: raw,
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };
  let n = 0;
  /** A neutral envelope as the stand-in sends it. */
  const envelope = (type: string, data: Record<string, unknown>, eventId = `evt_${P}_${++n}_${Date.now()}`, at = new Date()) =>
    JSON.stringify({ id: eventId, type, created: at.toISOString(), data });

  async function tenantsInPlay() {
    const outside = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM "Tenant" WHERE "operatorTenantId" = $1
       UNION SELECT "tenantId" FROM "User" WHERE email LIKE $3 AND "tenantId" NOT IN ($1, $2)`, T, OTHER_T, `${P}\\_%@${domain}`,
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

  const tokenOf = (url: string) => new URL(url).searchParams.get("t")!;
  const at = (days: number) => new Date(Date.now() + days * 864e5).toISOString();
  let day = 10;

  /** A fresh order of `units` clinics, approved by policy and waiting for payment. */
  async function freshOrder(units = 1): Promise<string> {
    await call("POST", "/cart", id("buyer"));
    const line = await call("POST", "/cart/lines", id("buyer"), { listingId: E.clinic, quantity: units, startsOn: at(day), endsOn: at(day + 1) });
    expect(line.status, line.text).toBe(201);
    day += 2;
    const hold = (await call("POST", "/cart/reserve", id("buyer"))).json;
    const order = await call("POST", "/marketplace-orders", id("buyer"), placeOrderBody(hold.id, `${T}_order_terms`));
    expect(order.json?.state, order.text).toBe("AWAITING_PAYMENT");
    return order.json.id as string;
  }

  /** The sponsor pays on the stand-in's page: the attempt is PROCESSING, the provider's confirmation still to come. */
  async function startPaying(orderId: string): Promise<{ attemptId: string; paymentRef: string; amountCents: number }> {
    const pay = await call("POST", `/marketplace-orders/${orderId}/pay`, id("buyer"));
    expect(pay.status, pay.text).toBe(200);
    const done = await call("POST", "/public/test-provider/checkout", undefined, { token: tokenOf(pay.json.url), outcome: "SUCCEED" });
    expect(done.status, done.text).toBe(200);
    const a = await prisma.paymentAttempt.findFirstOrThrow({ where: { orderId, state: "PROCESSING" }, select: { id: true, providerRef: true, amountCents: true } });
    return { attemptId: a.id, paymentRef: a.providerRef!, amountCents: a.amountCents };
  }

  /** Walk a paid order through delivery to FULFILLED (Finance's transitions; every line confirmed). */
  async function deliverOrder(orderId: string) {
    const from = await orderState(orderId);
    for (const to of from === "IN_DELIVERY" ? ["FULFILLED"] : ["IN_DELIVERY", "FULFILLED"]) {
      if (to === "FULFILLED") await settleDeliveries(prisma as unknown as PrismaClient, orderId);
      const r = await call("POST", `/marketplace-orders/${orderId}/transition`, id("finance"), transitionBody(to));
      expect(r.status, r.text).toBe(200);
    }
  }

  /** An order paid by card (the stand-in's own confirmation) and delivered: Riley's share is requestable. */
  async function paidDeliveredOrder(units = 1) {
    const orderId = await freshOrder(units);
    const pay = await startPaying(orderId);
    expect(await events.standinConfirmPayment(pay.attemptId)).toMatchObject({ confirmed: true });
    await deliverOrder(orderId);
    return { orderId, ...pay };
  }

  const orderState = async (orderId: string) => (await prisma.marketplaceOrder.findUniqueOrThrow({ where: { id: orderId }, select: { state: true } })).state;
  const attempt = (attemptId: string) => prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attemptId }, select: { state: true, refundedCents: true, failureReason: true, amountCents: true } });
  const event = (eventId: string) => prisma.paymentEvent.findUniqueOrThrow({ where: { id: eventId }, select: { status: true, outcome: true, tenantId: true, attempts: true, nextAttemptAt: true, type: true } });
  const jobs = async (name: string) => (await prisma.outboxJob.findMany({ where: { name, tenantId: { in: [T, E.tenant] } }, select: { payload: true } })).map((j) => j.payload as Record<string, unknown>);
  const emails = async () => (await jobs("notify.email")) as Array<{ template: string; to: string; idempotencyKey: string; data: Record<string, string> }>;
  const me = async () => (await call("GET", "/payouts/me", id("riley"))).json;

  /**
   * The books and the states agree (2S8-QA-02). After any scenario:
   *   - every journal in these books balances, and the books as a whole net to zero;
   *   - an attempt is never refunded beyond what it captured;
   *   - an order PAID or later has its payables available, and a contracted
   *     order CANCELLED or REFUNDED nets to zero outside its payouts;
   *   - a payout PAID has exactly its amount in PAYOUT journals; any other none (net);
   *   - at most one card attempt paid each order (any other was recorded for refund).
   */
  async function assertConsistent() {
    const books = [T];
    const entries = await prisma.ledgerEntry.findMany({ where: { tenantId: { in: books } }, select: { journalId: true, orderId: true, account: true, entryType: true, status: true, debitCents: true, creditCents: true, partyType: true } });
    const byJournal = new Map<string, number>();
    for (const e of entries) byJournal.set(e.journalId, (byJournal.get(e.journalId) ?? 0) + e.debitCents - e.creditCents);
    const unbalanced = [...byJournal].filter(([, v]) => v !== 0);
    expect(unbalanced, "every journal balances").toEqual([]);
    expect(entries.reduce((s, e) => s + e.debitCents - e.creditCents, 0), "the books net to zero").toBe(0);

    const attempts = await prisma.paymentAttempt.findMany({ where: { tenantId: { in: books } }, select: { id: true, orderId: true, state: true, amountCents: true, refundedCents: true } });
    for (const a of attempts) expect(a.refundedCents, `attempt ${a.id} refunded within what it captured`).toBeLessThanOrEqual(a.amountCents);

    const orders = await prisma.marketplaceOrder.findMany({ where: { tenantId: { in: books } }, select: { id: true, state: true, contractedAt: true, paidVia: true, paymentReference: true } });
    for (const o of orders) {
      const mine = entries.filter((e) => e.orderId === o.id && e.entryType !== "PAYOUT");
      if (["PAID", "IN_DELIVERY", "FULFILLED", "CLOSED"].includes(o.state)) {
        const pending = mine.filter((e) => e.entryType === "BOOKING" && ["PROPERTY_PAYABLE", "ATHLETE_PAYABLE"].includes(e.account) && e.status === "PENDING");
        expect(pending, `order ${o.id} (${o.state}) has its payables available`).toEqual([]);
      }
      if ((o.state === "CANCELLED" || o.state === "REFUNDED") && o.contractedAt) {
        const net = mine.filter((e) => ["PROPERTY_PAYABLE", "ATHLETE_PAYABLE", "RESERVE_HELD", "SPONSOR_RECEIVABLE"].includes(e.account)).reduce((s, e) => s + e.creditCents - e.debitCents, 0);
        expect(net, `order ${o.id} (${o.state}) is reversed`).toBe(0);
      }
      const succeeded = attempts.filter((a) => a.orderId === o.id && ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(a.state));
      if (o.paidVia === "CARD") expect(succeeded.length, `order ${o.id} was paid by a confirmed card payment`).toBeGreaterThanOrEqual(1);
      const extra = succeeded.length - (o.paidVia === "CARD" ? 1 : 0);
      if (extra > 0) {
        const recorded = await prisma.refundDue.count({ where: { orderId: o.id } });
        expect(recorded, `order ${o.id}: a second confirmed card payment is recorded for refund`).toBeGreaterThanOrEqual(1);
      }
    }

    const payouts = await prisma.payout.findMany({ where: { tenantId: { in: books } }, select: { id: true, state: true, amountCents: true } });
    const paidJournals = new Map<string, number>();
    for (const e of await prisma.ledgerEntry.findMany({ where: { tenantId: { in: books }, entryType: "PAYOUT", account: { in: ["PROPERTY_PAYABLE", "ATHLETE_PAYABLE"] } }, select: { journalId: true, debitCents: true, creditCents: true } })) {
      const pid = e.journalId.split(":")[0]!;
      paidJournals.set(pid, (paidJournals.get(pid) ?? 0) + e.debitCents - e.creditCents);
    }
    for (const p of payouts) {
      expect(paidJournals.get(p.id) ?? 0, `payout ${p.id} (${p.state}) has ${p.state === "PAID" ? "its amount" : "nothing"} paid out in the books`).toBe(p.state === "PAID" ? p.amountCents : 0);
    }
  }

  async function setup() {
    setEnv("MARKETPLACE_SPENDING_LIMIT_START_CENTS", 100_000_000);
    setEnv("MARKETPLACE_SPENDING_LIMIT_CAP_CENTS", 100_000_000);
    setEnv("PAYMENT_PROVIDER", "standin");
    setEnv("STANDIN_PAYOUT_FAILURE", undefined);
    /* An event naming nothing SponsorX knows waits in this suite's own BTG tenant. */
    setEnv("PUBLIC_INTAKE_TENANT_ID", T);
    await clean();
    await prisma.tenant.createMany({ data: [{ id: T, name: `${P} BTG` }, { id: OTHER_T, name: `${P} other BTG` }] });
    await issueOrderTerms(prisma as unknown as PrismaClient, T);
    await prisma.sponsor.create({ data: { id: E.sponsor, tenantId: T, name: `Harbor Coffee ${P}`, categories: ["RESTAURANT"] } });
    await prisma.user.createMany({ data: [
      { id: id("admin"), tenantId: T, clerkId: id("admin"), email: `${id("admin")}@${domain}`, roles: ["BTG_ADMIN"] },
      { id: id("finance"), tenantId: T, clerkId: id("finance"), email: `${id("finance")}@${domain}`, roles: ["FINANCE"] },
      { id: id("buyer"), tenantId: T, clerkId: id("buyer"), email: `${id("buyer")}@${domain}`, roles: ["SPONSOR_ADMIN"], sponsorId: E.sponsor },
      { id: id("other_admin"), tenantId: OTHER_T, clerkId: id("other_admin"), email: `${id("other_admin")}@${domain}`, roles: ["BTG_ADMIN"] },
    ] });
    const rule = (kind: string, bps: number, fixedCents = 0) => ({ id: id(kind), tenantId: T, ruleKey: id(kind), version: 1, kind, scope: "GLOBAL", bps, fixedCents, priority: 0, effectiveFrom: new Date("2026-01-01") });
    await prisma.commissionRule.createMany({ data: [rule("PLATFORM_FEE", 1500), rule("MANAGEMENT_FEE", 500), rule("PROCESSING", 290, 30), rule("REFERRAL", 200), rule("RESERVE", 1000)] });
    await prisma.propertyOnboarding.create({ data: {
      id: id("onb"), tenantId: T, orgType: "TEAM", orgName: `Westfield Hawks ${P}`, stateCode: "MD", state: "PENDING_REVIEW",
      contacts: [{ name: "Dana Brooks", email: `${id("mgr")}@${domain}`, phone: "301-555-0100", role: "General manager", primary: true }],
      details: { legalEntityName: `Westfield Hawks ${P} LLC`, league: "MD Amateur", sport: "Basketball" },
      payoutAcknowledgedAt: new Date(), termsAcceptedAt: new Date(), submittedAt: new Date(),
    } });
    const approved = await decideOnboarding({ userId: id("admin"), tenantId: T, roles: ["BTG_ADMIN"], sponsorId: null, athleteId: null, guardianId: null, propertyId: null }, id("onb"), "APPROVE");
    const property = await prisma.property.findUniqueOrThrow({ where: { id: approved.propertyId! }, select: { id: true, tenantId: true } });
    Object.assign(E, { tenant: property.tenantId, property: property.id });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server!.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    await call("GET", "/me", id("mgr"));
    const riley = await call("POST", "/team/roster", id("mgr"), { legalName: `Riley Carter ${P}`, displayName: `RILEY.${P.toUpperCase()}`, email: `${id("riley")}@${domain}`, sport: "Basketball", ageBand: "18_PLUS", teamShareBps: 2000 });
    expect(riley.status, riley.text).toBe(201);
    E.riley = riley.json.id;
    const clinic = await call("POST", "/inventory", id("riley"), { title: `Basketball clinic ${P}`, kind: "CAMP", priceCents: 50_000, quantity: 500 });
    expect(clinic.status, clinic.text).toBe(201);
    E.clinic = (await call("POST", "/listings", id("mgr"), { inventoryItemId: clinic.json.id, title: `Youth basketball clinic with Riley ${P}`, description: "A 90-minute youth clinic at your venue, for up to 20 kids." })).json.id;
    expect((await call("POST", `/listings/${E.clinic}/submit`, id("mgr"))).json.state).toBe("PUBLISHED");
    const link = (await call("POST", "/payouts/account/link", id("riley"), {})).json;
    await call("POST", "/public/test-provider/account", undefined, { token: tokenOf(link.url), outcome: "READY" });
  }

  async function teardown() {
    for (const [k, v] of Object.entries(was)) (env as unknown as Env)[k] = v;
    server?.close();
    await clean();
  }

  return {
    prisma, env, events, E, id, call, deliver, envelope, setEnv, setup, teardown, freshOrder, startPaying, deliverOrder, paidDeliveredOrder,
    orderState, attempt, event, jobs, emails, me, assertConsistent, tokenOf,
  };
}
