import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { manualPayment } from "./support/order-payment";

/* --------------------------------------------------------------------------
   2S8-QA-03 · Financial reconciliation testing — Spec §38.

   "Prove the ledger balances against orders, payments and payouts across a
   full campaign cycle." Done when: "Reconciliation passes within defined
   tolerance across a seeded full-cycle dataset."

   phase2-ledger and phase2-payouts each reconcile ONE feature. This file
   runs one whole cycle through the real API and database, then reconciles
   the books as a whole.

   THE DATASET (tenant rc_btg; odd prices so every rounding rule is hit):
     sellers  Lakeside Herons RC (a team; its roster athlete Casey sells at a
              20% team share) · Hillcrest Foxes RC (a team selling its own
              item) · Sam Ortiz (an independent athlete — no team)
     buyers   Pier Roasters RC · Ridge Bakehouse RC; a 2.5% buyer fee
     O1  Pier   Casey ×2 + Sam ×1   card: one decline, then paid   delivered, confirmed, payouts, CLOSED (reserve released), reserve payouts
     O2  Pier   Foxes ×1 + Sam ×1   Zoho invoice paid              Foxes confirmed; Sam's line refunded, settled between the sides; CLOSED
     O3  Ridge  Casey ×1            BTG's manual Mark paid         whole order REFUNDED
     O4  Ridge  Foxes ×2 + Casey ×1 card                           delivered, confirmed, CLOSED, payouts
     O5  Ridge  Sam ×1              left unpaid
     payouts  requested by each payee, approved, sent and confirmed by the
              provider; one rejected by BTG first and requested again

   THE TOLERANCE IS EXACTLY 0 CENTS. Money is integer cents throughout
   (schema convention) and every split is decided once, at contract time;
   nothing is recomputed later. So there is no rounding drift to allow for,
   and any difference — one cent — is a defect, not noise.
   -------------------------------------------------------------------------- */

const TOLERANCE_CENTS = 0;

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@rc-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const { issueOrderTerms, placeOrderBody } = await import("./support/order-terms");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("2S8-QA-03 · a full marketplace cycle reconciles to the cent", { timeout: 180_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { env } = await import("../src/config/env");
  const { decideOnboarding } = await import("../src/domain/onboarding");
  const { confirmPayment, sendPayout, confirmPayoutPaid } = await import("../src/domain/payouts");
  const { ingestZohoInvoice } = await import("../src/domain/invoice");
  const { summarise } = await import("../src/domain/ledger");

  const T = "rc_btg";
  const PRICE = { casey: 33_333, foxes: 27_777, sam: 19_999 } as const;
  const BUYER_FEE_BPS = 250;
  const E = { herons: "", foxes: "", casey: "", sam: "rc_ath_sam", L: { casey: "", foxes: "", sam: "" } };
  const O: Record<"o1" | "o2" | "o3" | "o4" | "o5", string> = { o1: "", o2: "", o3: "", o4: "", o5: "" };
  const refundedCents = { line: 0, order: 0 };
  let feeWas = 0;
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";

  const call = async (method: string, path: string, clerk?: string, body?: unknown) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method, headers: { "content-type": "application/json", ...(clerk ? { "x-test-clerk": clerk } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };
  const ok = async (method: string, path: string, clerk?: string, body?: unknown) => {
    const r = await call(method, path, clerk, body);
    expect(r.status, `${method} ${path}: ${r.text}`).toBeLessThan(300);
    return r.json;
  };
  const at = (days: number) => new Date(Date.now() + days * 864e5).toISOString();
  const tokenOf = (url: string) => new URL(url).searchParams.get("t")!;
  const adminActor = { userId: "rc_admin", tenantId: T, roles: ["BTG_ADMIN" as const], sponsorId: null, athleteId: null, guardianId: null, propertyId: null };
  /** Exact, within the stated tolerance (0). */
  const same = (actual: number, expected: number, what: string) => expect(Math.abs(actual - expected), `${what}: ${actual} vs ${expected}`).toBeLessThanOrEqual(TOLERANCE_CENTS);

  async function tenantsInPlay() {
    const outside = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM "Tenant" WHERE "operatorTenantId" = $1
       UNION SELECT "tenantId" FROM "User" WHERE email LIKE 'rc\\_%@rc-test.invalid' AND "tenantId" <> $1`, T,
    );
    return [T, ...outside.map((r) => r.id)];
  }
  async function clean() {
    const ids = await tenantsInPlay();
    await prisma.$executeRawUnsafe(`DELETE FROM "PayoutLine" WHERE "payoutId" IN (SELECT id FROM "Payout" WHERE "tenantId" = ANY($1::text[]))`, ids);
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 8; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = ANY($1::text[])`, ids).catch(() => {});
      }
    }
    await prisma.tenant.updateMany({ where: { id: { in: ids } }, data: { operatorTenantId: null } });
    await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
  }

  async function approveTeam(id: string, name: string, manager: string) {
    await prisma.propertyOnboarding.create({ data: {
      id, tenantId: T, orgType: "TEAM", orgName: name, stateCode: "MD", state: "PENDING_REVIEW",
      contacts: [{ name: "Robin Hale", email: `${manager}@rc-test.invalid`, phone: "301-555-0170", role: "General manager", primary: true }],
      details: { legalEntityName: `${name} LLC`, league: "MD Amateur", sport: "Basketball" },
      payoutAcknowledgedAt: new Date(), termsAcceptedAt: new Date(), submittedAt: new Date(),
    } });
    const approved = await decideOnboarding(adminActor, id, "APPROVE");
    return approved.propertyId!;
  }
  async function publish(seller: string, inventoryItemId: string, title: string) {
    const l = await ok("POST", "/listings", seller, { inventoryItemId, title, description: "A 90-minute session at your venue, for up to 20 kids." });
    expect((await ok("POST", `/listings/${l.id}/submit`, seller)).state).toBe("PUBLISHED");
    return l.id as string;
  }
  /** Place an order through the contract gate; BTG approves it if it asks. Returns it waiting for payment. */
  async function place(buyer: string, lines: Array<{ listing: keyof typeof E.L; quantity: number; day: number }>) {
    await call("POST", "/cart", buyer);
    for (const l of lines) await ok("POST", "/cart/lines", buyer, { listingId: E.L[l.listing], quantity: l.quantity, startsOn: at(l.day), endsOn: at(l.day + 1) });
    const hold = await ok("POST", "/cart/reserve", buyer);
    let order = await ok("POST", "/marketplace-orders", buyer, placeOrderBody(hold.id, `${T}_order_terms`));
    if (order.state === "PENDING_APPROVAL") order = await ok("POST", `/marketplace-orders/${order.id}/decision`, "rc_admin", { decision: "APPROVE" });
    expect(["AWAITING_PAYMENT", "APPROVED"]).toContain(order.state);
    return order.id as string;
  }
  async function payByCard(buyer: string, orderId: string, declineFirst = false) {
    if (declineFirst) {
      const declined = await ok("POST", `/marketplace-orders/${orderId}/pay`, buyer);
      await ok("POST", "/public/test-provider/checkout", undefined, { token: tokenOf(declined.url), outcome: "DECLINE" });
    }
    const link = await ok("POST", `/marketplace-orders/${orderId}/pay`, buyer);
    await call("POST", "/public/test-provider/checkout", undefined, { token: tokenOf(link.url), outcome: "SUCCEED" });
    const attempt = (await ok("GET", `/marketplace-orders/${orderId}/payment`, buyer)).latest;
    expect(await confirmPayment(attempt.id)).toEqual({ confirmed: true });
  }
  const lineOf = async (orderId: string, listing: keyof typeof E.L) =>
    ((await prisma.marketplaceOrderLine.findMany({ where: { orderId }, select: { id: true, listingId: true } })).find((l) => l.listingId === E.L[listing]))!.id;
  async function deliverAndConfirm(orderId: string, buyer: string, sellers: Partial<Record<keyof typeof E.L, string>>) {
    for (const [listing, seller] of Object.entries(sellers) as Array<[keyof typeof E.L, string]>) {
      const line = await lineOf(orderId, listing);
      await ok("POST", `/sales/${line}/delivered`, seller, { note: "Session held as agreed." });
      await ok("POST", `/deliveries/${line}/confirm`, buyer);
    }
  }
  const stateOf = async (orderId: string) => (await prisma.marketplaceOrder.findUniqueOrThrow({ where: { id: orderId }, select: { state: true } })).state;
  async function payoutAccount(payee: string) {
    const link = await ok("POST", "/payouts/account/link", payee, {});
    await ok("POST", "/public/test-provider/account", undefined, { token: tokenOf(link.url), outcome: "READY" });
  }
  /** The payee asks for everything requestable; BTG approves; the provider sends and confirms. */
  async function payOut(payee: string) {
    const made = await ok("POST", "/payouts", payee);
    for (const p of made.payouts as Array<{ id: string }>) {
      expect((await ok("POST", `/payouts/${p.id}/decision`, "rc_finance", { decision: "APPROVE" })).state).toBe("APPROVED");
      expect(await sendPayout(p.id)).toEqual({ sent: true });
      expect(await confirmPayoutPaid(p.id)).toEqual({ paid: true });
    }
    return made.payouts as Array<{ id: string; amountCents: number }>;
  }

  beforeAll(async () => {
    await clean();
    feeWas = env.MARKETPLACE_BUYER_FEE_BPS;
    (env as { MARKETPLACE_BUYER_FEE_BPS: number }).MARKETPLACE_BUYER_FEE_BPS = BUYER_FEE_BPS;
    await prisma.tenant.create({ data: { id: T, name: "Reconciliation BTG" } });
    await issueOrderTerms(prisma, T);
    await prisma.sponsor.createMany({ data: [
      { id: "rc_pier", tenantId: T, name: "Pier Roasters RC", categories: ["RESTAURANT"] },
      { id: "rc_ridge", tenantId: T, name: "Ridge Bakehouse RC", categories: ["RESTAURANT"] },
    ] });
    await prisma.athlete.create({ data: {
      id: E.sam, tenantId: T, slug: "rc-sam-ortiz", legalName: "Sam Ortiz RC", displayName: "SAM.ORTIZ.RC", email: "rc_sam@rc-test.invalid",
      sport: "Basketball", stateCode: "VA", ageBand: "18_PLUS", state: "APPROVED",
    } });
    await prisma.user.createMany({ data: [
      { id: "rc_admin", tenantId: T, clerkId: "rc_admin", email: "rc_admin@rc-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "rc_finance", tenantId: T, clerkId: "rc_finance", email: "rc_finance@rc-test.invalid", roles: ["FINANCE"] },
      { id: "rc_pier_buyer", tenantId: T, clerkId: "rc_pier_buyer", email: "rc_pier_buyer@rc-test.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "rc_pier" },
      { id: "rc_ridge_buyer", tenantId: T, clerkId: "rc_ridge_buyer", email: "rc_ridge_buyer@rc-test.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "rc_ridge" },
      { id: "rc_sam", tenantId: T, clerkId: "rc_sam", email: "rc_sam@rc-test.invalid", roles: ["ATHLETE"], athleteId: E.sam },
    ] });
    /* The walkthrough's sample rates: 15% + 5% BTG, 2.9% + 30¢ processing, 2% referral, 10% reserve. */
    const rule = (kind: string, bps: number, fixedCents = 0) => ({ id: `rc_${kind}`, tenantId: T, ruleKey: `rc_${kind}`, version: 1, kind, scope: "GLOBAL", bps, fixedCents, priority: 0, effectiveFrom: new Date("2026-01-01") });
    await prisma.commissionRule.createMany({ data: [rule("PLATFORM_FEE", 1500), rule("MANAGEMENT_FEE", 500), rule("PROCESSING", 290, 30), rule("REFERRAL", 200), rule("RESERVE", 1000)] });

    E.herons = await approveTeam("rc_onb_herons", "Lakeside Herons RC", "rc_mgr_herons");
    E.foxes = await approveTeam("rc_onb_foxes", "Hillcrest Foxes RC", "rc_mgr_foxes");
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await ok("GET", "/me", "rc_mgr_herons");
    await ok("GET", "/me", "rc_mgr_foxes");
    E.casey = (await ok("POST", "/team/roster", "rc_mgr_herons", { legalName: "Casey Lin RC", displayName: "CASEY.LIN.RC", email: "rc_casey@rc-test.invalid", sport: "Basketball", ageBand: "18_PLUS", teamShareBps: 2000 })).id;
    const caseyItem = await ok("POST", "/inventory", "rc_casey", { title: "Ball-handling clinic", kind: "CAMP", priceCents: PRICE.casey, quantity: 40 });
    E.L.casey = await publish("rc_mgr_herons", caseyItem.id, "Ball-handling clinic with Casey Lin");
    const foxesItem = await ok("POST", "/inventory", "rc_mgr_foxes", { title: "Team scrimmage", kind: "CAMP", priceCents: PRICE.foxes, quantity: 40 });
    E.L.foxes = await publish("rc_mgr_foxes", foxesItem.id, "A scrimmage with the Hillcrest Foxes");
    const samItem = await ok("POST", "/inventory", "rc_sam", { title: "Shooting clinic", kind: "CAMP", priceCents: PRICE.sam, quantity: 40 });
    E.L.sam = await publish("rc_sam", samItem.id, "Shooting clinic with Sam Ortiz");
    for (const payee of ["rc_casey", "rc_mgr_herons", "rc_mgr_foxes", "rc_sam"]) await payoutAccount(payee);
  });

  afterAll(async () => {
    (env as { MARKETPLACE_BUYER_FEE_BPS: number }).MARKETPLACE_BUYER_FEE_BPS = feeWas;
    server?.close();
    await clean();
  });

  /* ── the cycle ─────────────────────────────────────────────────────────── */

  it("O1 · paid by card after a decline; delivered and confirmed; each payee is paid its share; closing releases the reserve, which is paid too", async () => {
    O.o1 = await place("rc_pier_buyer", [{ listing: "casey", quantity: 2, day: 10 }, { listing: "sam", quantity: 1, day: 10 }]);
    await payByCard("rc_pier_buyer", O.o1, true);
    expect(await stateOf(O.o1)).toBe("PAID");
    await deliverAndConfirm(O.o1, "rc_pier_buyer", { casey: "rc_casey", sam: "rc_sam" });
    expect(await stateOf(O.o1)).toBe("FULFILLED");

    /* One payout sent back first: a rejected payout posts nothing and frees the money. */
    const asked = await ok("POST", "/payouts", "rc_sam");
    expect((await ok("POST", `/payouts/${asked.payouts[0].id}/decision`, "rc_admin", { decision: "REJECT", note: "Re-request after the bank check." })).state).toBe("REJECTED");
    for (const payee of ["rc_casey", "rc_mgr_herons", "rc_sam"]) expect((await payOut(payee)).length, payee).toBe(1);

    await ok("POST", `/marketplace-orders/${O.o1}/transition`, "rc_finance", { to: "CLOSED" });
    for (const payee of ["rc_casey", "rc_mgr_herons", "rc_sam"]) {
      expect((await ok("GET", "/payouts/me", payee)).totals.requestableCents, payee).toBeGreaterThan(0); // the released reserve
      await payOut(payee);
    }
  });

  it("O2 · paid by Zoho invoice; Foxes delivered; Sam's line refunded, settled between seller and sponsor; closed and Foxes paid", async () => {
    O.o2 = await place("rc_pier_buyer", [{ listing: "foxes", quantity: 1, day: 12 }, { listing: "sam", quantity: 1, day: 12 }]);
    const order = await prisma.marketplaceOrder.update({ where: { id: O.o2 }, data: { zohoDealId: "rc_deal_o2" }, select: { totalCents: true } });
    await prisma.$transaction((tx) => ingestZohoInvoice(tx, {
      invoiceId: "rc_zinv_o2", dealId: "rc_deal_o2", number: "INV-RC-0002", status: "paid", amount: order.totalCents, balance: 0, currency: "USD",
      issuedAt: new Date().toISOString(), paidAt: new Date().toISOString(),
    }));
    expect(await prisma.marketplaceOrder.findUniqueOrThrow({ where: { id: O.o2 }, select: { state: true, paidVia: true } })).toEqual({ state: "PAID", paidVia: "ZOHO_INVOICE" });

    await deliverAndConfirm(O.o2, "rc_pier_buyer", { foxes: "rc_mgr_foxes" });
    const sam = await lineOf(O.o2, "sam");
    await ok("POST", `/sales/${sam}/delivered`, "rc_sam", { note: "Held." });
    await ok("POST", `/deliveries/${sam}/problem`, "rc_pier_buyer", { note: "Sam didn't show." });
    expect(await ok("POST", `/sales/${sam}/problem-answer`, "rc_sam", { answer: "REFUND", note: "Sorry — I was ill." })).toMatchObject({ answer: "REFUND" });
    expect(await ok("POST", `/deliveries/${sam}/problem-answer`, "rc_pier_buyer", { decision: "ACCEPT" })).toMatchObject({ outcome: "REFUNDED", state: "REFUNDED" });
    refundedCents.line = (await prisma.orderLineFinancials.findFirstOrThrow({ where: { lineId: sam }, select: { netCents: true } })).netCents;
    expect(await stateOf(O.o2)).toBe("FULFILLED");

    await ok("POST", `/marketplace-orders/${O.o2}/transition`, "rc_finance", { to: "CLOSED" });
    expect((await payOut("rc_mgr_foxes")).length).toBe(1);
  });

  it("O3 · marked paid by hand by BTG, then refunded whole", async () => {
    O.o3 = await place("rc_ridge_buyer", [{ listing: "casey", quantity: 1, day: 14 }]);
    await ok("POST", `/marketplace-orders/${O.o3}/transition`, "rc_finance", { to: "PAID", payment: manualPayment("RC-WIRE-0003") });
    expect(await prisma.marketplaceOrder.findUniqueOrThrow({ where: { id: O.o3 }, select: { state: true, paidVia: true } })).toEqual({ state: "PAID", paidVia: "BANK_TRANSFER" });
    await ok("POST", `/marketplace-orders/${O.o3}/transition`, "rc_finance", { to: "REFUNDED" });
    refundedCents.order = (await prisma.marketplaceOrder.findUniqueOrThrow({ where: { id: O.o3 }, select: { totalCents: true } })).totalCents;
  });

  it("O4 · paid by card across two sellers; delivered, confirmed, closed; every payee paid", async () => {
    O.o4 = await place("rc_ridge_buyer", [{ listing: "foxes", quantity: 2, day: 16 }, { listing: "casey", quantity: 1, day: 16 }]);
    await payByCard("rc_ridge_buyer", O.o4);
    await deliverAndConfirm(O.o4, "rc_ridge_buyer", { foxes: "rc_mgr_foxes", casey: "rc_casey" });
    expect(await stateOf(O.o4)).toBe("FULFILLED");
    await ok("POST", `/marketplace-orders/${O.o4}/transition`, "rc_finance", { to: "CLOSED" });
    for (const payee of ["rc_casey", "rc_mgr_herons", "rc_mgr_foxes"]) expect((await payOut(payee)).length, payee).toBe(1);
  });

  it("O5 · placed and left unpaid", async () => {
    O.o5 = await place("rc_ridge_buyer", [{ listing: "sam", quantity: 1, day: 18 }]);
    expect(await stateOf(O.o5)).toBe("AWAITING_PAYMENT");
  });

  /* ── the reconciliation ────────────────────────────────────────────────── */

  const entriesOf = async () => prisma.ledgerEntry.findMany({
    where: { tenantId: { in: await tenantsInPlay() } },
    select: { tenantId: true, journalId: true, entryType: true, orderId: true, lineId: true, account: true, partyType: true, partyId: true, partyTenantId: true, debitCents: true, creditCents: true, status: true },
  });
  type Row = Awaited<ReturnType<typeof entriesOf>>[number];
  const total = (rows: Row[], f: (r: Row) => number) => rows.reduce((s, r) => s + f(r), 0);

  it("the trial balance: in every tenant's books, and in every journal, debits equal credits", async () => {
    const rows = await entriesOf();
    expect(rows.length).toBeGreaterThan(50);
    /* Every order here is in BTG's books — the sellers' tenants hold none of their own. */
    expect([...new Set(rows.map((r) => r.tenantId))]).toEqual([T]);
    for (const books of new Set(rows.map((r) => r.tenantId))) {
      const mine = rows.filter((r) => r.tenantId === books);
      same(total(mine, (r) => r.debitCents), total(mine, (r) => r.creditCents), `trial balance of ${books}`);
    }
    const journals = new Map<string, Row[]>();
    for (const r of rows) journals.set(r.journalId, [...(journals.get(r.journalId) ?? []), r]);
    for (const [id, js] of journals) same(total(js, (r) => r.debitCents), total(js, (r) => r.creditCents), `journal ${id}`);
    /* Every kind of movement the cycle makes is in the books. */
    expect(new Set(rows.map((r) => r.entryType))).toEqual(new Set(["BOOKING", "RESERVE_RELEASE", "REVERSAL", "PAYOUT"]));
  });

  it("orders ↔ ledger: each order's booked receivable is its total; each line's booking is its frozen breakdown", async () => {
    const rows = await entriesOf();
    const orders = await prisma.marketplaceOrder.findMany({
      where: { tenantId: T }, select: { id: true, subtotalCents: true, feesCents: true, totalCents: true, lines: { select: { id: true, lineTotalCents: true, quantity: true, unitPriceCents: true } } },
    });
    expect(orders.map((o) => o.id).sort()).toEqual(Object.values(O).sort());
    for (const o of orders) {
      /* Recomputed here from the seeded prices — not read back from the code under test. */
      same(o.subtotalCents, o.lines.reduce((s, l) => s + l.quantity * l.unitPriceCents, 0), `${o.id} subtotal`);
      same(o.feesCents, Math.round((o.subtotalCents * BUYER_FEE_BPS) / 10_000), `${o.id} buyer fee`);
      same(o.totalCents, o.subtotalCents + o.feesCents, `${o.id} total`);
      const booked = rows.filter((r) => r.orderId === o.id && r.entryType === "BOOKING" && r.account === "SPONSOR_RECEIVABLE");
      same(total(booked, (r) => r.debitCents), o.totalCents, `${o.id} booked receivable`);
    }
    for (const f of await prisma.orderLineFinancials.findMany({
      where: { tenantId: T },
      select: { lineId: true, netCents: true, platformFeeCents: true, managementFeeCents: true, processingCents: true, referralCents: true, reserveCents: true, availableCents: true },
    })) {
      same(f.platformFeeCents + f.managementFeeCents + f.processingCents + f.referralCents + f.reserveCents + f.availableCents, f.netCents, `${f.lineId} breakdown sums to net`);
      const booking = rows.filter((r) => r.journalId.endsWith(`:${f.lineId}:booking`));
      const on = (account: string, side: "debitCents" | "creditCents") => total(booking.filter((r) => r.account === account), (r) => r[side]);
      same(on("SPONSOR_RECEIVABLE", "debitCents"), f.netCents, `${f.lineId} receivable`);
      same(on("PLATFORM_REVENUE", "creditCents"), f.platformFeeCents, `${f.lineId} platform fee`);
      same(on("MANAGEMENT_REVENUE", "creditCents"), f.managementFeeCents, `${f.lineId} management fee`);
      same(on("PROCESSING_PAYABLE", "creditCents"), f.processingCents, `${f.lineId} processing`);
      same(on("REFERRAL_PAYABLE", "creditCents"), f.referralCents, `${f.lineId} referral`);
      same(on("RESERVE_HELD", "creditCents"), f.reserveCents, `${f.lineId} reserve`);
      same(on("PROPERTY_PAYABLE", "creditCents") + on("ATHLETE_PAYABLE", "creditCents"), f.availableCents, `${f.lineId} available`);
    }
  });

  it("payments ↔ ledger: the money received, by each route, is exactly what was booked for the paid orders; refunds are exactly what was reversed", async () => {
    const rows = await entriesOf();
    const orders = await prisma.marketplaceOrder.findMany({ where: { tenantId: T }, select: { id: true, state: true, paidVia: true, totalCents: true } });
    const attempts = await prisma.paymentAttempt.findMany({ where: { tenantId: T }, select: { orderId: true, state: true, amountCents: true } });
    const invoices = await prisma.marketplaceOrderInvoice.findMany({ where: { tenantId: T }, select: { orderId: true, status: true, amount: true, balance: true } });
    const manual = await prisma.auditLog.findMany({ where: { tenantId: T, action: "marketplaceOrder.paymentRecorded" }, select: { entityId: true, after: true } });
    const via = Object.fromEntries(orders.map((o) => [o.id, o.paidVia]));
    expect(via).toEqual({ [O.o1]: "CARD", [O.o2]: "ZOHO_INVOICE", [O.o3]: "BANK_TRANSFER", [O.o4]: "CARD", [O.o5]: null });

    /* What each route says was received, per order — one source per order, never two. */
    const received = new Map<string, number>();
    const add = (orderId: string, cents: number) => {
      expect(received.has(orderId), `${orderId} paid twice`).toBe(false);
      received.set(orderId, cents);
    };
    for (const a of attempts.filter((x) => x.state === "SUCCEEDED")) add(a.orderId, a.amountCents);
    for (const i of invoices.filter((x) => x.status === "paid" && (x.balance ?? 0) === 0)) add(i.orderId, i.amount);
    for (const m of manual) {
      const after = m.after as { via: string; amountCents: number };
      if (after.via === "BANK_TRANSFER") add(m.entityId, after.amountCents);
    }
    /* The declined try is on record and moved no money. */
    expect(attempts.filter((a) => a.state === "FAILED").map((a) => a.orderId)).toEqual([O.o1]);
    expect([...received.keys()].sort()).toEqual([O.o1, O.o2, O.o3, O.o4].sort());

    const bookedFor = (id: string) => total(rows.filter((r) => r.orderId === id && r.entryType === "BOOKING" && r.account === "SPONSOR_RECEIVABLE"), (r) => r.debitCents);
    for (const [id, cents] of received) same(cents, bookedFor(id), `${id} received vs booked`);
    const receivedTotal = [...received.values()].reduce((s, c) => s + c, 0);
    same(receivedTotal, [O.o1, O.o2, O.o3, O.o4].reduce((s, id) => s + bookedFor(id), 0), "received, all routes, vs booked for the paid orders");

    /* Refunds: the line settled between the sides and the whole O3. */
    const reversedReceivable = rows.filter((r) => r.entryType === "REVERSAL" && r.account === "SPONSOR_RECEIVABLE");
    same(total(reversedReceivable, (r) => r.creditCents - r.debitCents), refundedCents.line + refundedCents.order, "refunded vs reversed receivable");
    expect(new Set(reversedReceivable.map((r) => r.orderId))).toEqual(new Set([O.o2, O.o3]));
    /* What the sponsors are still owed back, or still owe: received − refunded = the receivable left on the paid orders; the unpaid O5's is outstanding in full. */
    const receivableLeft = (ids: string[]) => total(rows.filter((r) => ids.includes(r.orderId!) && r.account === "SPONSOR_RECEIVABLE"), (r) => r.debitCents - r.creditCents);
    same(receivableLeft([O.o1, O.o2, O.o3, O.o4]), receivedTotal - refundedCents.line - refundedCents.order, "net sponsor money vs receivable");
    same(receivableLeft([O.o5]), orders.find((o) => o.id === O.o5)!.totalCents, "unpaid order outstanding");
  });

  it("payouts ↔ ledger: every paid payout is one PAYOUT journal per order it covered, to the cent; rejected payouts posted nothing", async () => {
    const rows = await entriesOf();
    const payouts = await prisma.payout.findMany({ where: { tenantId: T }, select: { id: true, state: true, amountCents: true, payeeType: true, payeeId: true, payeeTenantId: true, lines: { select: { orderId: true, amountCents: true } } } });
    expect(payouts.filter((p) => p.state === "REJECTED")).toHaveLength(1);
    expect(payouts.filter((p) => !["PAID", "REJECTED"].includes(p.state))).toEqual([]);
    const paid = payouts.filter((p) => p.state === "PAID");
    expect(paid.length).toBe(10); // O1: three shares + three released reserves · O2: Foxes · O4: three
    const payoutRows = rows.filter((r) => r.entryType === "PAYOUT");
    for (const p of payouts) {
      same(p.lines.reduce((s, l) => s + l.amountCents, 0), p.amountCents, `payout ${p.id} lines`);
      const journal = payoutRows.filter((r) => r.journalId.startsWith(`${p.id}:`));
      if (p.state !== "PAID") {
        expect(journal, `payout ${p.id} (${p.state})`).toEqual([]);
        continue;
      }
      for (const l of p.lines) {
        const j = journal.filter((r) => r.journalId === `${p.id}:${l.orderId}:payout`);
        const payable = j.filter((r) => r.account === (p.payeeType === "ATHLETE" ? "ATHLETE_PAYABLE" : "PROPERTY_PAYABLE"));
        expect(payable.every((r) => r.partyId === p.payeeId && r.partyTenantId === p.payeeTenantId)).toBe(true);
        same(total(payable, (r) => r.debitCents), l.amountCents, `payout ${p.id} on ${l.orderId}, payee side`);
        same(total(j.filter((r) => r.account === "PAYOUT_CLEARING"), (r) => r.creditCents), l.amountCents, `payout ${p.id} on ${l.orderId}, clearing side`);
      }
    }
    const paidTotal = paid.reduce((s, p) => s + p.amountCents, 0);
    same(total(payoutRows.filter((r) => r.account !== "PAYOUT_CLEARING"), (r) => r.debitCents), paidTotal, "payouts paid vs payables debited");
    same(total(payoutRows.filter((r) => r.account === "PAYOUT_CLEARING"), (r) => r.creditCents), paidTotal, "payouts paid vs clearing credited");
  });

  it("each payee's balance identity: booked − reversed − paid = ledger balance = what its payout page shows, and the closed orders are paid out in full", async () => {
    const rows = await entriesOf();
    const payees = [
      { clerk: "rc_casey", partyType: "ATHLETE", partyId: E.casey, settled: true },
      { clerk: "rc_sam", partyType: "ATHLETE", partyId: E.sam, settled: false },
      { clerk: "rc_mgr_herons", partyType: "PROPERTY", partyId: E.herons, settled: true },
      { clerk: "rc_mgr_foxes", partyType: "PROPERTY", partyId: E.foxes, settled: true },
    ];
    let partyBalances = 0;
    for (const p of payees) {
      const mine = rows.filter((r) => r.partyType === p.partyType && r.partyId === p.partyId && ["ATHLETE_PAYABLE", "PROPERTY_PAYABLE", "RESERVE_HELD"].includes(r.account));
      expect(mine.length, p.clerk).toBeGreaterThan(0);
      const s = summarise(mine);
      expect(s.reconciles, `${p.clerk}: ${JSON.stringify(s)}`).toBe(true);
      same(s.bookedRevenueCents - s.reversedCents - s.paidEarningsCents, s.ledgerBalanceCents, `${p.clerk} booked − reversed − paid`);
      partyBalances += s.ledgerBalanceCents;

      const me = await ok("GET", "/payouts/me", p.clerk);
      const t = me.totals;
      same(t.requestableCents + t.notYetReleasableCents + t.inFlightCents + t.heldCents + t.awaitingPaymentCents, s.ledgerBalanceCents, `${p.clerk} payout page vs ledger balance`);
      same(t.paidOutCents, s.paidEarningsCents, `${p.clerk} paid out vs PAYOUT journals`);
      if (p.settled) same(s.ledgerBalanceCents, 0, `${p.clerk} owed nothing once every order is closed and paid out`);
    }
    /* Sam: O1 paid out in full, O2's line refunded (nothing owed), O5 waiting on the sponsor. */
    const o5 = await prisma.orderLineFinancials.findFirstOrThrow({ where: { orderId: O.o5 }, select: { availableCents: true, reserveCents: true } });
    const sam = summarise(rows.filter((r) => r.partyId === E.sam && ["ATHLETE_PAYABLE", "RESERVE_HELD"].includes(r.account)));
    same(sam.ledgerBalanceCents, o5.availableCents + o5.reserveCents, "Sam's balance is the unpaid O5 share");
    same(sam.pendingEarnings.awaitingSponsorPaymentCents + sam.pendingEarnings.reservedCents, o5.availableCents + o5.reserveCents, "Sam's O5 share awaits payment");

    /* Both teams' own dashboards say they reconcile. */
    for (const mgr of ["rc_mgr_herons", "rc_mgr_foxes"]) expect((await ok("GET", "/team/ledger", mgr)).reconciles, mgr).toBe(true);

    /* And the whole: what the sponsors owe = platform + processor + referrers + the payees, less what has left as payouts. */
    const net = (account: string) => total(rows.filter((r) => r.account === account), (r) => r.creditCents - r.debitCents);
    same(
      -net("SPONSOR_RECEIVABLE"),
      net("PLATFORM_REVENUE") + net("MANAGEMENT_REVENUE") + net("PROCESSING_PAYABLE") + net("REFERRAL_PAYABLE") + partyBalances + net("PAYOUT_CLEARING"),
      "receivable vs every other account",
    );
  });
});
