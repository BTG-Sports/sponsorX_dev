import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { settleDeliveries } from "./support/delivery";
import { manualPayment, transitionBody } from "./support/order-payment";

/* --------------------------------------------------------------------------
   2S4-BE-09 — order approval, automated; 2S4-BE-10 — payment, automated.
   Agreed with the programme owner on 2026-10-02.

     - Each sponsor has a spending limit: $5,000 to start; after each order
       completed without a refund or an upheld delivery problem, twice their
       largest completed order (never below the start), capped at $25,000; a
       refund or an upheld problem stops it rising. Within it, an order is
       approved automatically (first order included); above it, it waits for
       BTG with the reason, and BTG's admins are emailed a link.
     - "The listing asks for approval" asks the SELLER: 48 hours to accept
       or decline (with a reason); silence declines. Seller first, then BTG.
     - BTG gets one summary a day of the orders approved automatically.
     - Approval moves the order straight to AWAITING_PAYMENT; the sponsor is
       reminded after 1 and 2 days and the order cancelled at 3 — never with
       a payment in progress.
     - Zoho Books marking a marketplace order's invoice paid pays the order.
     - BTG's manual "Mark paid" needs the method, a reference and the date
       received; BTG admin and Finance only.

   Against the real API and database. The outside team is provisioned by
   BTG approving its onboarding; Zoho is the fake org (tests/support/fake-zoho.ts).
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
process.env.ZOHO_WEBHOOK_SECRET = "ox-test-webhook-secret";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@ox-test.invalid` } : null;
  },
}));

const rules = await import("../src/domain/marketplace-order-rules");
const { spendingLimit, remindersDue, manualPaymentProblems, zohoInvoicePaid, approvalReasons } = rules;
const D = (iso: string) => new Date(iso);
const settings = { startCents: 500_000, capCents: 2_500_000 };

describe("2S4-BE-09 · the spending limit, as written (pure)", () => {
  it("starts at $5,000 with no history", () => {
    expect(spendingLimit([], settings)).toMatchObject({ limitCents: 500_000, frozen: null, largestCompletedCents: 0, history: [] });
  });

  it("each completed order makes it twice the largest completed order — never below the start, never above the cap", () => {
    const l = spendingLimit([
      { kind: "COMPLETED", at: D("2026-10-01"), orderId: "a", totalCents: 100_000 }, // 2 × $1,000 < $5,000: stays $5,000
      { kind: "COMPLETED", at: D("2026-10-02"), orderId: "b", totalCents: 300_000 }, // 2 × $3,000 = $6,000
      { kind: "COMPLETED", at: D("2026-10-03"), orderId: "c", totalCents: 200_000 }, // largest is still $3,000
      { kind: "COMPLETED", at: D("2026-10-04"), orderId: "d", totalCents: 800_000 }, // $16,000
      { kind: "COMPLETED", at: D("2026-10-05"), orderId: "e", totalCents: 2_000_000 }, // $40,000 → capped at $25,000
    ], settings);
    expect(l.history.map((h) => h.limitAfterCents)).toEqual([500_000, 600_000, 600_000, 1_600_000, 2_500_000]);
    expect(l).toMatchObject({ limitCents: 2_500_000, largestCompletedCents: 2_000_000, frozen: null });
    expect(l.history[0]!.note).toMatch(/the starting limit/);
    expect(l.history[1]!.note).toMatch(/twice the largest completed order \(\$3,000\.00\)/);
    expect(l.history[4]!.note).toMatch(/the cap of \$25,000\.00/);
  });

  it("a refund stops it rising: it stays where it was, and later completions leave it there", () => {
    const l = spendingLimit([
      { kind: "COMPLETED", at: D("2026-10-01"), orderId: "a", totalCents: 300_000 },
      { kind: "REFUNDED", at: D("2026-10-02"), orderId: "r" },
      { kind: "COMPLETED", at: D("2026-10-03"), orderId: "b", totalCents: 900_000 },
    ], settings);
    expect(l).toMatchObject({ limitCents: 600_000, frozen: { kind: "REFUNDED", orderId: "r" } });
    expect(l.history.map((h) => [h.kind, h.limitBeforeCents, h.limitAfterCents])).toEqual([
      ["COMPLETED", 500_000, 600_000], ["REFUNDED", 600_000, 600_000], ["COMPLETED", 600_000, 600_000],
    ]);
    expect(l.history[2]!.note).toMatch(/stays at \$6,000\.00: it stopped rising after a refund/);
  });

  it("so does a delivery problem BTG upheld; and at the same instant, the stop counts first", () => {
    expect(spendingLimit([
      { kind: "COMPLETED", at: D("2026-10-05"), orderId: "a", totalCents: 400_000 },
      { kind: "PROBLEM_UPHELD", at: D("2026-10-05"), orderId: "a", lineId: "l1" },
    ], settings)).toMatchObject({ limitCents: 500_000, frozen: { kind: "PROBLEM_UPHELD", orderId: "a" } });
  });

  it("takes its start and cap from settings", () => {
    expect(spendingLimit([{ kind: "COMPLETED", at: D("2026-10-01"), orderId: "a", totalCents: 300_000 }], { startCents: 100_000, capCents: 400_000 }).limitCents).toBe(400_000);
  });

  it("holds an order for BTG only above the limit, and says why", () => {
    expect(approvalReasons({ totalCents: 500_000, limitCents: 500_000, sponsorName: "Lantern" })).toEqual([]);
    expect(approvalReasons({ totalCents: 1_200_000, limitCents: 500_000, sponsorName: "Lantern" })).toEqual(["$12,000.00 is above Lantern's limit of $5,000.00"]);
  });
});

describe("2S4-BE-10 · the payment rules, as written (pure)", () => {
  it("reminds one and two days in", () => {
    const since = D("2026-10-01T12:00:00Z");
    expect(remindersDue(since, D("2026-10-02T11:59:00Z"))).toBe(0);
    expect(remindersDue(since, D("2026-10-02T12:00:00Z"))).toBe(1);
    expect(remindersDue(since, D("2026-10-03T12:00:00Z"))).toBe(2);
    expect(remindersDue(since, D("2026-10-05T12:00:00Z"))).toBe(2);
  });

  it("a payment recorded by hand needs a method, a reference (≤ 200, not a card number) and a real date received, not in the future", () => {
    const now = D("2026-10-02T12:00:00Z");
    expect(manualPaymentProblems({ method: "BANK_TRANSFER", reference: "WIRE-1", receivedOn: "2026-10-02" }, now)).toEqual([]);
    expect(manualPaymentProblems(null, now)).toHaveLength(3);
    expect(manualPaymentProblems({ method: "CARD" as never, reference: "x", receivedOn: "2026-10-01" }, now)).toEqual([expect.stringMatching(/how it was paid/)]);
    expect(manualPaymentProblems({ method: "CHEQUE", reference: "  ", receivedOn: "2026-10-01" }, now)).toEqual(["the payment reference"]);
    expect(manualPaymentProblems({ method: "CHEQUE", reference: "x".repeat(201), receivedOn: "2026-10-01" }, now)).toEqual([expect.stringMatching(/at most 200/)]);
    expect(manualPaymentProblems({ method: "OTHER", reference: "4242 4242 4242 4242", receivedOn: "2026-10-01" }, now)).toEqual([expect.stringMatching(/not a card number/)]);
    expect(manualPaymentProblems({ method: "OTHER", reference: "x", receivedOn: "2026-10-03" }, now)).toEqual([expect.stringMatching(/not in the future/)]);
    expect(manualPaymentProblems({ method: "OTHER", reference: "x", receivedOn: "2026-02-30" }, now)).toEqual(["the date the payment was received"]);
  });

  it("Zoho Books says paid by its status, or by nothing left owing on a live invoice", () => {
    expect(zohoInvoicePaid("paid", null)).toBe(true);
    expect(zohoInvoicePaid("Paid", 500)).toBe(true);
    expect(zohoInvoicePaid("sent", 0)).toBe(true);
    expect(zohoInvoicePaid("sent", 100)).toBe(false);
    expect(zohoInvoicePaid("overdue", null)).toBe(false);
    expect(zohoInvoicePaid("void", 0)).toBe(false);
    expect(zohoInvoicePaid("draft", 0)).toBe(false);
  });

  it("the worker runs the seller and unpaid sweeps, and the daily summary", () => {
    const worker = readFileSync(new URL("../worker/index.mts", import.meta.url), "utf8");
    expect(worker).toMatch(/Promise\.all\(\[sweepSellerApprovals\(\), sweepUnpaidOrders\(\)\]\)/);
    expect(worker).toMatch(/orderTimer = setInterval\(orderSweep, ORDER_SWEEP_INTERVAL_MS\)/);
    expect(worker).toMatch(/getUTCHours\(\) < ORDER_DIGEST_HOUR_UTC\) return;\s*void sendOrderApprovalDigests\(\)/);
  });
});

const seededDb = await import("./support/seeded-db");
const { issueOrderTerms, placeOrderBody } = await import("./support/order-terms");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("2S4-BE-09 / 2S4-BE-10 over the API", { timeout: 90_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { decideOnboarding } = await import("../src/domain/onboarding");
  const { sweepSellerApprovals, sendOrderApprovalDigests } = await import("../src/domain/order-approval");
  const { sweepUnpaidOrders } = await import("../src/domain/order-payment");
  const { confirmPayment } = await import("../src/domain/payouts");
  const { ingestZohoInvoice } = await import("../src/domain/invoice");
  const { handleIngestInvoice } = await import("../worker/jobs/ingest-invoice.mts");
  const { handlePushMarketplaceOrder } = await import("../worker/jobs/zoho-sync.mts");
  const { FakeZoho } = await import("./support/fake-zoho");
  const pg = (await import("pg")).default;

  const T = "ox_btg";
  const TERMS = `${T}_order_terms`;
  const L: Record<string, string> = {};
  const E = { tenant: "", property: "", managerUser: "" };
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  let pool: InstanceType<typeof pg.Pool>;
  let day = 10;

  const call = async (method: string, path: string, clerk?: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method, headers: { "content-type": "application/json", ...(clerk ? { "x-test-clerk": clerk } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };
  const at = (days: number) => new Date(Date.now() + days * 864e5).toISOString();
  const HOUR = 3_600_000;

  async function tenantsInPlay() {
    const outside = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM "Tenant" WHERE "operatorTenantId" = $1
       UNION SELECT "tenantId" FROM "User" WHERE email LIKE 'ox\\_%@ox-test.invalid' AND "tenantId" <> $1`, T,
    );
    return [T, ...outside.map((r) => r.id)];
  }
  async function clean() {
    const ids = await tenantsInPlay();
    await prisma.$executeRawUnsafe(`DELETE FROM "PayoutLine" WHERE "payoutId" IN (SELECT id FROM "Payout" WHERE "tenantId" = ANY($1::text[]))`, ids);
    await prisma.$executeRawUnsafe(`DELETE FROM "WebhookDelivery" WHERE "externalId" LIKE 'ox\\_zinv\\_%'`);
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

  /** The emails queued with this template, in every tenant this suite owns. */
  const mails = async (template: string) => {
    const rows = await prisma.outboxJob.findMany({
      where: { name: "notify.email", tenantId: { in: await tenantsInPlay() }, payload: { path: ["template"], equals: template } },
      select: { payload: true }, orderBy: { createdAt: "asc" },
    });
    return rows.map((r) => r.payload as { to: string; data: Record<string, string>; idempotencyKey: string });
  };
  const ref = (id: string) => `SX-${id.slice(-8).toUpperCase()}`;
  const live = (orderId: string) => prisma.inventoryCommitment.count({ where: { sourceId: { startsWith: `${orderId}:` }, releasedAt: null } });

  async function publish(key: string, item: Record<string, unknown>, owner = "ox_mgr") {
    const made = await call("POST", "/inventory", owner, item);
    expect(made.status, made.text).toBe(201);
    const listing = await call("POST", "/listings", owner, { inventoryItemId: made.json.id, title: `${item.title}`, description: "A description long enough for governance." });
    expect(listing.status, listing.text).toBe(201);
    L[key] = listing.json.id;
    expect((await call("POST", `/listings/${L[key]}/submit`, owner)).json.state).toBe("PUBLISHED");
  }
  /** A sponsor places an order for these lines — each order on its own dates, so stock never collides. */
  async function order(sponsor: string, lines: Array<{ key: string; quantity: number }>, billing?: Record<string, unknown>) {
    const d = (day += 2);
    await call("POST", "/cart", sponsor);
    for (const l of lines) {
      const r = await call("POST", "/cart/lines", sponsor, { listingId: L[l.key], quantity: l.quantity, startsOn: at(d), endsOn: at(d) });
      expect(r.status, r.text).toBe(201);
    }
    const hold = await call("POST", "/cart/reserve", sponsor);
    expect(hold.status, hold.text).toBe(201);
    const placed = await call("POST", "/marketplace-orders", sponsor, placeOrderBody(hold.json.id, TERMS, billing));
    expect(placed.status, placed.text).toBe(201);
    return placed.json;
  }
  const move = (id: string, to: string, who = "ox_finance") => call("POST", `/marketplace-orders/${id}/transition`, who, transitionBody(to));
  /** Paid by hand, delivered and fulfilled — a completed order. */
  async function complete(id: string) {
    expect((await move(id, "PAID")).json.state).toBe("PAID");
    expect((await move(id, "IN_DELIVERY")).json.state).toBe("IN_DELIVERY");
    await settleDeliveries(prisma, id);
    expect((await move(id, "FULFILLED")).json.state).toBe("FULFILLED");
  }
  const limitOf = async (sponsorId: string) => (await call("GET", `/sponsors/${sponsorId}/spending-limit`, "ox_admin")).json;

  beforeAll(async () => {
    await clean();
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    await prisma.tenant.create({ data: { id: T, name: "Order automation BTG" } });
    await issueOrderTerms(prisma, T);
    await prisma.sponsor.createMany({ data: [
      { id: "ox_s1", tenantId: T, name: "Lantern Goods OX", categories: ["APPAREL"] },
      { id: "ox_s2", tenantId: T, name: "Quay Outfitters OX", categories: ["APPAREL"] },
      { id: "ox_s3", tenantId: T, name: "Pier Supply OX", categories: ["APPAREL"] },
      { id: "ox_s4", tenantId: T, name: "Dock Wear OX", categories: ["APPAREL"] },
    ] });
    await prisma.guardian.create({ data: { id: "ox_g", tenantId: T, legalName: "Mara Quinn", email: "ox_guardian@ox-test.invalid", relationship: "PARENT", verifiedAt: new Date(), emailConfirmedAt: new Date() } });
    const athlete = (id: string, legalName: string, displayName: string, extra: Record<string, unknown> = {}) =>
      ({ id, tenantId: T, slug: id.replace(/_/g, "-"), legalName, displayName, email: `${id}@ox-test.invalid`, sport: "Basketball", stateCode: "MD", ageBand: "18_PLUS", state: "APPROVED" as const, emailConfirmedAt: new Date(), ...extra });
    await prisma.athlete.createMany({ data: [
      athlete("ox_ath_jo", "Jo Marsh", "JO.MARSH.OX"),
      athlete("ox_ath_kid", "Kit Quinn", "KIT.QUINN.OX", { ageBand: null, birthDate: new Date(Date.now() - 16 * 365.25 * 864e5), guardianId: "ox_g", state: "ACTIVE" }),
    ] });
    await prisma.user.createMany({ data: [
      { id: "ox_admin", tenantId: T, clerkId: "ox_admin", email: "ox_admin@ox-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "ox_admin2", tenantId: T, clerkId: "ox_admin2", email: "ox_admin2@ox-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "ox_finance", tenantId: T, clerkId: "ox_finance", email: "ox_finance@ox-test.invalid", roles: ["FINANCE"] },
      { id: "ox_sales", tenantId: T, clerkId: "ox_sales", email: "ox_sales@ox-test.invalid", roles: ["SALES"] },
      { id: "ox_super", tenantId: T, clerkId: "ox_super", email: "ox_super@ox-test.invalid", roles: ["SUPER_ADMIN"] },
      ...["s1", "s2", "s3", "s4"].map((s) => ({ id: `ox_${s}_admin`, tenantId: T, clerkId: `ox_${s}_admin`, email: `ox_${s}_admin@ox-test.invalid`, roles: ["SPONSOR_ADMIN" as const], sponsorId: `ox_${s}` })),
      { id: "ox_s1_analyst", tenantId: T, clerkId: "ox_s1_analyst", email: "ox_s1_analyst@ox-test.invalid", roles: ["SPONSOR_ANALYST"], sponsorId: "ox_s1" },
      { id: "ox_jo", tenantId: T, clerkId: "ox_jo", email: "ox_jo@ox-test.invalid", roles: ["ATHLETE"], athleteId: "ox_ath_jo" },
      { id: "ox_kid", tenantId: T, clerkId: "ox_kid", email: "ox_kid@ox-test.invalid", roles: ["ATHLETE"], athleteId: "ox_ath_kid" },
      { id: "ox_guardian", tenantId: T, clerkId: "ox_guardian", email: "ox_guardian@ox-test.invalid", roles: ["GUARDIAN"], guardianId: "ox_g" },
    ] });
    await prisma.propertyOnboarding.create({ data: {
      id: "ox_onb", tenantId: T, orgType: "TEAM", orgName: "OX Harbor Hawks", stateCode: "MD", state: "PENDING_REVIEW",
      contacts: [{ name: "Sky Ortega", email: "ox_mgr@ox-test.invalid", phone: "301-555-0109", role: "General manager", primary: true }],
      details: { legalEntityName: "OX Harbor Hawks LLC", league: "MD Youth", sport: "Basketball" },
      payoutAcknowledgedAt: new Date(), termsAcceptedAt: new Date(), submittedAt: new Date(),
    } });
    const approved = await decideOnboarding({ userId: "ox_admin", tenantId: T, roles: ["BTG_ADMIN"], sponsorId: null, athleteId: null, guardianId: null, propertyId: null }, "ox_onb", "APPROVE");
    const p = await prisma.property.findUniqueOrThrow({ where: { id: approved.propertyId! }, select: { id: true, tenantId: true } });
    Object.assign(E, { tenant: p.tenantId, property: p.id });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    E.managerUser = (await call("GET", "/me", "ox_mgr")).json.userId;

    await publish("banner", { title: "Courtside banner OX", kind: "SIGNAGE", priceCents: 100_000, quantity: 50 });
    await publish("poster", { title: "Concourse poster OX", kind: "SIGNAGE", priceCents: 10_000, quantity: 100 });
    await publish("vip", { title: "VIP table OX", kind: "TICKETS", priceCents: 50_000, quantity: 30, packageRules: { requiresApproval: true } });
    await publish("clinic", { title: "Jo's shooting clinic OX", kind: "CAMP", priceCents: 30_000, quantity: 20, packageRules: { requiresApproval: true } }, "ox_jo");
    /* A minor's own listing — the guardian answers for them. */
    await prisma.inventoryItem.create({ data: { id: "ox_item_kid", tenantId: T, athleteId: "ox_ath_kid", title: "Kit's skills camp OX", kind: "CAMP", priceCents: 20_000, quantity: 10, packageRules: { requiresApproval: true } } });
    await prisma.listing.create({ data: { id: "ox_list_kid", tenantId: T, sellerAthleteId: "ox_ath_kid", inventoryItemId: "ox_item_kid", title: "Kit's skills camp OX", description: "A youth skills camp, two hours, up to 20 kids.", state: "PUBLISHED", publishedAt: new Date() } });
    L.kid = "ox_list_kid";
  });

  afterAll(async () => {
    server?.close();
    await pool?.end();
    await clean();
  });

  /* ── 2S4-BE-09 · the limit decides ─────────────────────────────────────── */
  const O: Record<string, string> = {};

  describe("2S4-BE-09 · within the limit it is approved automatically; above it, BTG decides", () => {
    it("a first order within the $5,000 limit is approved automatically and goes straight to AWAITING_PAYMENT", async () => {
      const o = await order("ox_s1_admin", [{ key: "banner", quantity: 1 }]);
      expect(o).toMatchObject({
        state: "AWAITING_PAYMENT", requiresApproval: false, approvalReasons: [], decidedBy: "system", spendingLimitCents: 500_000,
        waitingOn: "PAYMENT", paymentRemindersSent: 0, sellerApprovals: [],
      });
      expect(o.contractedAt).not.toBeNull();
      expect(new Date(o.deadlineAt).toISOString()).toBe(new Date(o.paymentDueAt).toISOString());
      expect(new Date(o.paymentDueAt).getTime() - new Date(o.awaitingPaymentAt).getTime()).toBe(3 * 24 * HOUR);
      O.auto1 = o.id;
      /* The sponsor is told it is approved, and the deadline. */
      const approvedMail = (await mails("order.approved")).find((m) => m.data.orderRef === ref(o.id))!;
      expect(approvedMail).toMatchObject({ to: "ox_s1_admin@ox-test.invalid", data: { approvedBy: "It was approved automatically", amount: "$1,000.00" } });
      expect(approvedMail.data.payBy).toMatch(/UTC$/);
      /* Equal to the limit is within it. */
      const equal = await order("ox_s1_admin", [{ key: "banner", quantity: 5 }]);
      expect(equal).toMatchObject({ state: "AWAITING_PAYMENT", totalCents: 500_000, decidedBy: "system" });
      O.auto2 = equal.id;
      /* Nothing for BTG to decide. */
      expect((await call("POST", `/marketplace-orders/${o.id}/decision`, "ox_admin", { decision: "APPROVE" })).status).toBe(409);
    });

    it("above the limit it waits for BTG with the reason, holding its stock, and each BTG admin is emailed a link", async () => {
      const o = await order("ox_s1_admin", [{ key: "banner", quantity: 6 }]);
      expect(o).toMatchObject({ state: "PENDING_APPROVAL", requiresApproval: true, contractedAt: null, waitingOn: "BTG", deadlineAt: null });
      expect(o.approvalReasons).toEqual(["$6,000.00 is above Lantern Goods OX's limit of $5,000.00"]);
      O.held = o.id;
      const held = (await mails("order.heldForBtg")).filter((m) => m.data.orderRef === ref(o.id));
      expect(held.map((m) => m.to).sort()).toEqual(["ox_admin2@ox-test.invalid", "ox_admin@ox-test.invalid"]);
      expect(held[0]!.data).toMatchObject({ sponsorName: "Lantern Goods OX", amount: "$6,000.00", reviewUrl: expect.stringMatching(new RegExp(`/admin/marketplace/orders/${o.id}$`)) });
      expect(held[0]!.data.reasons).toContain("$6,000.00 is above Lantern Goods OX's limit of $5,000.00");
      /* The sponsor can't pay a held order. */
      expect((await call("POST", `/marketplace-orders/${o.id}/pay`, "ox_s1_admin")).status).toBe(409);
      /* BTG approves: contracted, and waiting for payment at once. */
      const ok = await call("POST", `/marketplace-orders/${o.id}/decision`, "ox_admin", { decision: "APPROVE" });
      expect(ok.json).toMatchObject({ state: "AWAITING_PAYMENT", decidedBy: "ox_admin", waitingOn: "PAYMENT" });
      expect((await mails("order.approved")).find((m) => m.data.orderRef === ref(o.id))!.data.approvedBy).toBe("BTG approved it");
    });
  });

  describe("2S4-BE-09 · the limit grows with completed orders, is capped, and stops after a refund or an upheld problem", () => {
    it("grows to twice the largest completed order, so a $13,000 order is held at $8,000 — and the cap is $25,000", async () => {
      const a = await order("ox_s2_admin", [{ key: "banner", quantity: 4 }]);
      expect(a.state).toBe("AWAITING_PAYMENT");
      await complete(a.id);
      expect(await limitOf("ox_s2")).toMatchObject({ limitCents: 800_000, rising: true, frozen: null, largestCompletedCents: 400_000 });
      const b = await order("ox_s2_admin", [{ key: "banner", quantity: 13 }]);
      expect(b).toMatchObject({ state: "PENDING_APPROVAL", spendingLimitCents: 800_000 });
      expect(b.approvalReasons).toEqual(["$13,000.00 is above Quay Outfitters OX's limit of $8,000.00"]);
      await call("POST", `/marketplace-orders/${b.id}/decision`, "ox_admin", { decision: "APPROVE" });
      await complete(b.id);
      const l = await limitOf("ox_s2");
      expect(l).toMatchObject({ sponsorName: "Quay Outfitters OX", limitCents: 2_500_000, startCents: 500_000, capCents: 2_500_000, rising: false, frozen: null });
      expect(l.history.map((h: { orderRef: string; limitAfterCents: number }) => [h.orderRef, h.limitAfterCents])).toEqual([[ref(a.id), 800_000], [ref(b.id), 2_500_000]]);
      expect(l.history[1].note).toMatch(/the cap of \$25,000\.00/);
    });

    it("a refund stops it rising: it stays where it was, and a later completion doesn't lift it", async () => {
      const a = await order("ox_s3_admin", [{ key: "banner", quantity: 3 }]);
      await complete(a.id);
      expect((await limitOf("ox_s3")).limitCents).toBe(600_000);
      const r = await order("ox_s3_admin", [{ key: "poster", quantity: 1 }]);
      expect((await move(r.id, "PAID")).json.state).toBe("PAID");
      expect((await move(r.id, "REFUNDED")).json).toMatchObject({ state: "REFUNDED" });
      expect((await prisma.marketplaceOrder.findUniqueOrThrow({ where: { id: r.id }, select: { refundedAt: true } })).refundedAt).not.toBeNull();
      const c = await order("ox_s3_admin", [{ key: "banner", quantity: 5 }]);
      expect(c.state).toBe("AWAITING_PAYMENT"); // $5,000 within $6,000
      await complete(c.id);
      const l = await limitOf("ox_s3");
      expect(l).toMatchObject({ limitCents: 600_000, rising: false, frozen: { kind: "REFUNDED", orderId: r.id, orderRef: ref(r.id) } });
      expect(l.history.map((h: { kind: string }) => h.kind)).toEqual(["COMPLETED", "REFUNDED", "COMPLETED"]);
      expect(l.history[2].note).toMatch(/stays at \$6,000\.00/);
      /* So $7,000 still waits for BTG. */
      const d = await order("ox_s3_admin", [{ key: "banner", quantity: 7 }]);
      expect(d.approvalReasons).toEqual(["$7,000.00 is above Pier Supply OX's limit of $6,000.00"]);
      await call("POST", `/marketplace-orders/${d.id}/transition`, "ox_s3_admin", { to: "CANCELLED" });
    });

    it("a delivery problem BTG upheld (the line refunded) stops it too — the order completing doesn't lift it", async () => {
      const o = await order("ox_s4_admin", [{ key: "banner", quantity: 2 }, { key: "poster", quantity: 1 }]);
      await move(o.id, "PAID");
      await move(o.id, "IN_DELIVERY");
      const poster = o.lines.find((l: { title: string }) => l.title === "Concourse poster OX").id;
      /* BTG upheld the sponsor's problem with the poster and refunded that line (as the delivery-issues desk records it). */
      await prisma.orderLineDelivery.update({ where: { lineId: poster }, data: { state: "REFUNDED", problemAt: new Date(), problemNote: "Never went up.", resolvedAt: new Date(), resolvedBy: "ox_admin", resolution: "REFUNDED", resolutionNote: "Upheld." } });
      await settleDeliveries(prisma, o.id);
      expect((await move(o.id, "FULFILLED")).json.state).toBe("FULFILLED");
      const l = await limitOf("ox_s4");
      expect(l).toMatchObject({ limitCents: 500_000, frozen: { kind: "PROBLEM_UPHELD", orderId: o.id } });
      expect(l.history.map((h: { kind: string }) => h.kind)).toEqual(["PROBLEM_UPHELD", "COMPLETED"]);
    });

    it("the limit is BTG's to read — not the sponsor's, not another tenant's", async () => {
      expect((await call("GET", "/sponsors/ox_s1/spending-limit", "ox_finance")).status).toBe(200);
      expect((await call("GET", "/sponsors/ox_s1/spending-limit", "ox_s1_admin")).status).toBe(403);
      expect((await call("GET", "/sponsors/ox_s1/spending-limit", "ox_mgr")).status).toBe(403);
      expect((await call("GET", "/sponsors/ox_nobody/spending-limit", "ox_admin")).status).toBe(403);
    });
  });

  /* ── 2S4-BE-09 · the seller's step ─────────────────────────────────────── */
  describe("2S4-BE-09 · a listing that asks for approval asks its seller", () => {
    it("the order waits for the seller, holding its stock; the seller is emailed a link with 48 hours", async () => {
      const o = await order("ox_s1_admin", [{ key: "vip", quantity: 1 }, { key: "poster", quantity: 1 }]);
      expect(o).toMatchObject({ state: "PENDING_SELLER", requiresApproval: false, approvalReasons: [], contractedAt: null, waitingOn: "SELLER" });
      const vipLine = o.lines.find((l: { title: string }) => l.title === "VIP table OX");
      expect(o.sellerApprovals).toEqual([expect.objectContaining({ state: "PENDING", lineIds: [vipLine.id], seller: { type: "PROPERTY", id: E.property, name: "OX Harbor Hawks" } })]);
      const approval = o.sellerApprovals[0];
      expect(new Date(approval.dueAt).getTime() - new Date(o.createdAt).getTime()).toBeGreaterThan(47.9 * HOUR);
      expect(new Date(approval.dueAt).getTime() - new Date(o.createdAt).getTime()).toBeLessThan(48.1 * HOUR);
      expect(new Date(o.deadlineAt).toISOString()).toBe(new Date(approval.dueAt).toISOString());
      expect(await live(o.id)).toBe(2);
      O.sellerOk = o.id;
      L.sellerOkApproval = approval.id;
      const asked = (await mails("sale.approvalRequested")).find((m) => m.idempotencyKey.startsWith(`sale.approvalRequested:${approval.id}:`))!;
      expect(asked).toMatchObject({ to: "ox_mgr@ox-test.invalid", data: { sponsorName: "Lantern Goods OX", total: "$500.00" } });
      expect(asked.data.lines).toContain("VIP table OX");
      expect(asked.data.lines).not.toContain("Concourse poster OX");
      expect(asked.data.approvalUrl).toMatch(new RegExp(`/property/sales/approvals/${approval.id}$`));
      /* Nobody pays, and BTG decides nothing, while the seller is asked. */
      expect((await call("POST", `/marketplace-orders/${o.id}/pay`, "ox_s1_admin")).status).toBe(409);
      expect((await call("POST", `/marketplace-orders/${o.id}/decision`, "ox_admin", { decision: "APPROVE" })).status).toBe(409);
    });

    it("the seller reads only the lines it covers — never the order — and only the seller answers", async () => {
      const mine = await call("GET", "/seller-approvals", "ox_mgr");
      expect(mine.status, mine.text).toBe(200);
      const a = mine.json.approvals.find((x: { id: string }) => x.id === L.sellerOkApproval);
      expect(a).toMatchObject({ state: "PENDING", canAnswer: true, orderOutcome: "WAITING", sponsorName: "Lantern Goods OX", totalCents: 50_000, lines: [expect.objectContaining({ title: "VIP table OX", quantity: 1 })] });
      expect(a.hoursLeft).toBeGreaterThanOrEqual(47);
      const one = await call("GET", `/seller-approvals/${L.sellerOkApproval}`, "ox_mgr");
      expect(one.text).not.toContain("Concourse poster OX");
      expect(one.text).not.toContain("billing");
      expect(one.text).not.toContain("60000"); // the order's total
      for (const who of ["ox_jo", "ox_s1_admin", "ox_admin", "ox_finance"]) {
        expect((await call("GET", `/seller-approvals/${L.sellerOkApproval}`, who)).status, who).toBe(403);
        expect((await call("POST", `/seller-approvals/${L.sellerOkApproval}/decision`, who, { decision: "ACCEPT" })).status, who).toBe(403);
      }
      /* Declining needs a reason. */
      expect((await call("POST", `/seller-approvals/${L.sellerOkApproval}/decision`, "ox_mgr", { decision: "DECLINE" })).status).toBe(422);
    });

    it("the seller accepts: within the limit the order is approved and waiting for payment, and the sponsor is told", async () => {
      const r = await call("POST", `/seller-approvals/${L.sellerOkApproval}/decision`, "ox_mgr", { decision: "ACCEPT" });
      expect(r.status, r.text).toBe(200);
      expect(r.json).toMatchObject({ state: "ACCEPTED", canAnswer: false, orderOutcome: "APPROVED" });
      expect((await call("POST", `/seller-approvals/${L.sellerOkApproval}/decision`, "ox_mgr", { decision: "ACCEPT" })).status).toBe(409);
      const o = (await call("GET", `/marketplace-orders/${O.sellerOk}`, "ox_s1_admin")).json;
      expect(o).toMatchObject({ state: "AWAITING_PAYMENT", decidedBy: "system", waitingOn: "PAYMENT", sellerApprovals: [expect.objectContaining({ state: "ACCEPTED" })] });
      expect(await prisma.orderSellerApproval.findUniqueOrThrow({ where: { id: L.sellerOkApproval }, select: { decidedBy: true } })).toEqual({ decidedBy: E.managerUser });
      expect((await mails("order.approved")).find((m) => m.data.orderRef === ref(O.sellerOk))).toMatchObject({ to: "ox_s1_admin@ox-test.invalid", data: { approvedBy: "The seller accepted it, and it was approved automatically" } });
      const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: L.sellerOkApproval, action: "orderSellerApproval.accept" }, select: { actorId: true } });
      expect(audit.actorId).toBe(E.managerUser);
    });

    it("the seller declines with a reason: the order is cancelled, its stock released, and the sponsor reads why", async () => {
      const o = await order("ox_s2_admin", [{ key: "vip", quantity: 2 }]);
      const id = o.sellerApprovals[0].id;
      const r = await call("POST", `/seller-approvals/${id}/decision`, "ox_mgr", { decision: "DECLINE", reason: "We can't host a table that night." });
      expect(r.json).toMatchObject({ state: "DECLINED", reason: "We can't host a table that night.", orderOutcome: "CANCELLED" });
      const read = (await call("GET", `/marketplace-orders/${o.id}`, "ox_s2_admin")).json;
      expect(read).toMatchObject({ state: "CANCELLED", cancelReason: "SELLER_DECLINED", waitingOn: null, sellerApprovals: [expect.objectContaining({ state: "DECLINED", reason: "We can't host a table that night." })] });
      expect(await live(o.id)).toBe(0);
      expect((await mails("order.sellerDeclined")).find((m) => m.data.orderRef === ref(o.id))).toMatchObject({ to: "ox_s2_admin@ox-test.invalid", data: { reason: "We can't host a table that night.", sellerName: "OX Harbor Hawks" } });
    });

    it("silence declines: 48 hours on, the sweep cancels it and releases the stock — once", async () => {
      const o = await order("ox_s3_admin", [{ key: "clinic", quantity: 1 }]);
      expect(o.sellerApprovals).toEqual([expect.objectContaining({ seller: { type: "ATHLETE", id: "ox_ath_jo", name: "JO.MARSH.OX" } })]);
      const id = o.sellerApprovals[0].id;
      expect((await mails("sale.approvalRequested")).find((m) => m.idempotencyKey.startsWith(`sale.approvalRequested:${id}:`))!.data.approvalUrl).toMatch(/\/athlete\/sales\/approvals\//);
      expect(await sweepSellerApprovals(new Date(Date.now() + 47 * HOUR), { tenantIds: [T] })).toMatchObject({ expired: 0, cancelled: 0 });
      expect(await sweepSellerApprovals(new Date(Date.now() + 49 * HOUR), { tenantIds: [T] })).toMatchObject({ expired: 1, cancelled: 1, failed: 0 });
      expect(await sweepSellerApprovals(new Date(Date.now() + 50 * HOUR), { tenantIds: [T] })).toMatchObject({ expired: 0, cancelled: 0 });
      const read = (await call("GET", `/marketplace-orders/${o.id}`, "ox_s3_admin")).json;
      expect(read).toMatchObject({ state: "CANCELLED", cancelReason: "SELLER_NO_ANSWER", sellerApprovals: [expect.objectContaining({ state: "EXPIRED" })] });
      expect(await live(o.id)).toBe(0);
      expect((await mails("order.sellerNoAnswer")).filter((m) => m.data.orderRef === ref(o.id))).toHaveLength(1);
      expect((await mails("sale.approvalExpired")).filter((m) => m.data.orderRef === ref(o.id)).map((m) => m.to)).toEqual(["ox_jo@ox-test.invalid"]);
      /* Too late to answer now. */
      const late = await call("POST", `/seller-approvals/${id}/decision`, "ox_jo", { decision: "ACCEPT" });
      expect(late.status).toBe(409);
      expect(late.text).toMatch(/48 hours/);
    });

    it("above the limit AND asking its seller: the seller first, then BTG", async () => {
      const o = await order("ox_s1_admin", [{ key: "vip", quantity: 12 }]); // $6,000 against $5,000
      expect(o).toMatchObject({ state: "PENDING_SELLER", requiresApproval: true, waitingOn: "SELLER" });
      expect(o.approvalReasons).toEqual(["$6,000.00 is above Lantern Goods OX's limit of $5,000.00"]);
      expect((await mails("order.heldForBtg")).filter((m) => m.data.orderRef === ref(o.id))).toEqual([]); // not BTG's yet
      await call("POST", `/seller-approvals/${o.sellerApprovals[0].id}/decision`, "ox_mgr", { decision: "ACCEPT" });
      expect((await call("GET", `/marketplace-orders/${o.id}`, "ox_admin")).json).toMatchObject({ state: "PENDING_APPROVAL", waitingOn: "BTG", contractedAt: null });
      expect((await mails("order.heldForBtg")).filter((m) => m.data.orderRef === ref(o.id))).toHaveLength(2);
      expect((await mails("order.sellerAccepted")).find((m) => m.data.orderRef === ref(o.id))).toMatchObject({ to: "ox_s1_admin@ox-test.invalid", data: { sellerName: "OX Harbor Hawks" } });
      expect((await call("POST", `/marketplace-orders/${o.id}/decision`, "ox_admin", { decision: "APPROVE" })).json.state).toBe("AWAITING_PAYMENT");
    });

    it("two sellers: one accepting is not enough; the other declining ends it", async () => {
      const o = await order("ox_s2_admin", [{ key: "vip", quantity: 1 }, { key: "clinic", quantity: 1 }]);
      expect(o.sellerApprovals.map((a: { seller: { type: string } }) => a.seller.type).sort()).toEqual(["ATHLETE", "PROPERTY"]);
      const team = o.sellerApprovals.find((a: { seller: { type: string } }) => a.seller.type === "PROPERTY").id;
      const jo = o.sellerApprovals.find((a: { seller: { type: string } }) => a.seller.type === "ATHLETE").id;
      await call("POST", `/seller-approvals/${team}/decision`, "ox_mgr", { decision: "ACCEPT" });
      expect((await call("GET", `/marketplace-orders/${o.id}`, "ox_s2_admin")).json.state).toBe("PENDING_SELLER");
      /* Jo reads only Jo's line. */
      const joView = (await call("GET", `/seller-approvals/${jo}`, "ox_jo")).json;
      expect(joView.lines.map((l: { title: string }) => l.title)).toEqual(["Jo's shooting clinic OX"]);
      await call("POST", `/seller-approvals/${jo}/decision`, "ox_jo", { decision: "DECLINE", reason: "I'm away that weekend." });
      expect((await call("GET", `/marketplace-orders/${o.id}`, "ox_s2_admin")).json).toMatchObject({ state: "CANCELLED", cancelReason: "SELLER_DECLINED" });
      expect(await live(o.id)).toBe(0);
    });

    it("a minor's order is answered by their guardian — never by the minor's own login", async () => {
      const o = await order("ox_s4_admin", [{ key: "kid", quantity: 1 }]);
      const id = o.sellerApprovals[0].id;
      expect((await mails("sale.approvalRequested")).filter((m) => m.idempotencyKey.startsWith(`sale.approvalRequested:${id}:`)).map((m) => m.to).sort())
        .toEqual(["ox_guardian@ox-test.invalid", "ox_kid@ox-test.invalid"]);
      const own = await call("POST", `/seller-approvals/${id}/decision`, "ox_kid", { decision: "ACCEPT" });
      expect(own.status).toBe(403);
      expect(own.json.error.code).toBe("guardian_must_act");
      const g = await call("POST", `/seller-approvals/${id}/decision`, "ox_guardian", { decision: "ACCEPT" }, { "x-sponsorx-ward": "ox_ath_kid" });
      expect(g.status, g.text).toBe(200);
      expect(g.json.state).toBe("ACCEPTED");
      const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: id, action: "orderSellerApproval.accept" }, select: { actorId: true, after: true } });
      expect(audit).toMatchObject({ actorId: "ox_guardian", after: { actingForAthleteId: "ox_ath_kid" } });
      expect((await call("GET", `/marketplace-orders/${o.id}`, "ox_s4_admin")).json.state).toBe("AWAITING_PAYMENT");
    });
  });

  /* ── 2S4-BE-09 · BTG's daily summary ───────────────────────────────────── */
  describe("2S4-BE-09 · BTG's daily summary of orders approved automatically", () => {
    it("one email per BTG admin per day, listing the automatic approvals (not BTG's own) — and a second run sends nothing", async () => {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const first = await sendOrderApprovalDigests(now, [T]);
      expect(first.tenants).toBe(1);
      const autos = await prisma.marketplaceOrder.count({ where: { tenantId: T, decidedBy: "system", decidedAt: { lte: now } } });
      expect(first.orders).toBe(autos);
      const digest = (await mails("order.autoApprovedDigest")).filter((m) => m.idempotencyKey.startsWith(`order.autoApprovedDigest:${T}:${today}:`));
      expect(digest.map((m) => m.to).sort()).toEqual(["ox_admin2@ox-test.invalid", "ox_admin@ox-test.invalid"]);
      expect(digest[0]!.data).toMatchObject({ count: String(autos), day: today });
      expect(digest[0]!.data.orders).toContain(ref(O.auto1));
      expect(digest[0]!.data.orders).toContain("(limit $5,000.00)");
      expect(digest[0]!.data.orders).not.toContain(ref(O.held)); // BTG approved that one itself
      expect(await sendOrderApprovalDigests(new Date(now.getTime() + HOUR), [T])).toMatchObject({ tenants: 0, orders: 0 });
      expect(await prisma.orderApprovalDigest.findMany({ where: { tenantId: T }, select: { day: true, orders: true } })).toEqual([{ day: today, orders: autos }]);
      expect((await mails("order.autoApprovedDigest")).filter((m) => m.idempotencyKey.startsWith(`order.autoApprovedDigest:${T}:`))).toHaveLength(2);
    });
  });

  /* ── 2S4-BE-10 · BTG's manual "Mark paid" ──────────────────────────────── */
  describe("2S4-BE-10 · Mark paid by hand needs the method, a reference and the date — BTG admin and Finance only", () => {
    it("refuses without them, and refuses anyone else", async () => {
      const o = await order("ox_s1_admin", [{ key: "poster", quantity: 1 }]);
      O.manual = o.id;
      const url = `/marketplace-orders/${o.id}/transition`;
      const missing = await call("POST", url, "ox_finance", { to: "PAID" });
      expect(missing.status).toBe(422);
      expect(missing.text).toMatch(/payment reference/);
      expect((await call("POST", url, "ox_finance", { to: "PAID", payment: { ...manualPayment(), reference: "" } })).status).toBe(422);
      expect((await call("POST", url, "ox_finance", { to: "PAID", payment: { ...manualPayment(), reference: "4111 1111 1111 1111" } })).status).toBe(422);
      expect((await call("POST", url, "ox_finance", { to: "PAID", payment: { ...manualPayment(), receivedOn: at(2).slice(0, 10) } })).status).toBe(422);
      expect((await call("POST", url, "ox_finance", { to: "PAID", payment: { ...manualPayment(), reference: "x".repeat(201) } })).status).toBe(400);
      for (const who of ["ox_sales", "ox_super", "ox_s1_admin", "ox_mgr"]) expect((await call("POST", url, who, transitionBody("PAID"))).status, who).toBe(403);
      expect((await call("GET", `/marketplace-orders/${o.id}`, "ox_admin")).json.state).toBe("AWAITING_PAYMENT");
    });

    it("recorded on the order, audited, and the sponsor and sellers told as for a card payment", async () => {
      const r = await call("POST", `/marketplace-orders/${O.manual}/transition`, "ox_finance", { to: "PAID", payment: { method: "CHEQUE", reference: "  CHQ-20441 ", receivedOn: new Date().toISOString().slice(0, 10) } });
      expect(r.status, r.text).toBe(200);
      expect(r.json).toMatchObject({ state: "PAID", paidVia: "CHEQUE", paymentReference: "CHQ-20441", waitingOn: null });
      expect(r.json.paymentReceivedOn.slice(0, 10)).toBe(new Date().toISOString().slice(0, 10));
      expect(await prisma.marketplaceOrder.findUniqueOrThrow({ where: { id: O.manual }, select: { paymentRecordedBy: true } })).toEqual({ paymentRecordedBy: "ox_finance" });
      const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: O.manual, action: "marketplaceOrder.paymentRecorded" }, select: { actorId: true, after: true } });
      expect(audit).toMatchObject({ actorId: "ox_finance", after: { via: "CHEQUE", reference: "CHQ-20441", amountCents: 10_000 } });
      /* 2S5-FE-05 — checkout says "Invoices and receipts for this order go to this contact": the billing contact gets
         the receipt, and the sponsor who placed the order (a different address here) gets a copy. */
      const receipts = (await mails("payment.received")).filter((m) => m.data.orderRef === ref(O.manual));
      expect(receipts.map((m) => m.to).sort()).toEqual(["billing@sponsor-test.invalid", "ox_s1_admin@ox-test.invalid"]);
      const receipt = receipts.find((m) => m.to === "billing@sponsor-test.invalid")!;
      expect(receipt).toMatchObject({ data: { amount: "$100.00" } });
      expect(receipt.data.paidHow).toMatch(/BTG has recorded your payment .*cheque, reference CHQ-20441/);
      expect((await mails("sale.paid")).find((m) => m.data.orderRef === ref(O.manual))).toMatchObject({ to: "ox_mgr@ox-test.invalid" });
      /* The database refuses a hand-recorded payment without its record. */
      await expect(prisma.$executeRawUnsafe(`UPDATE "MarketplaceOrder" SET "paymentReference" = NULL WHERE id = $1`, O.manual)).rejects.toThrow(/MarketplaceOrder_manual_payment_check/);
    });

    it("refused while a card payment is being confirmed; the provider's confirmation then records it as CARD", async () => {
      const o = await order("ox_s1_admin", [{ key: "poster", quantity: 2 }]);
      const pay = await call("POST", `/marketplace-orders/${o.id}/pay`, "ox_s1_admin");
      expect(pay.status, pay.text).toBe(200);
      const token = new URL(pay.json.url).searchParams.get("t")!;
      await call("POST", "/public/test-provider/checkout", undefined, { token, outcome: "SUCCEED" });
      const busy = await call("POST", `/marketplace-orders/${o.id}/transition`, "ox_admin", transitionBody("PAID"));
      expect(busy.status).toBe(409);
      expect(busy.text).toMatch(/being confirmed/);
      const attempt = await prisma.paymentAttempt.findFirstOrThrow({ where: { orderId: o.id, state: "PROCESSING" }, select: { id: true } });
      expect(await confirmPayment(attempt.id)).toEqual({ confirmed: true });
      expect((await call("GET", `/marketplace-orders/${o.id}`, "ox_s1_admin")).json).toMatchObject({ state: "PAID", paidVia: "CARD" });
      const receipts = (await mails("payment.received")).filter((m) => m.data.orderRef === ref(o.id));
      expect(receipts.map((m) => m.to).sort()).toEqual(["billing@sponsor-test.invalid", "ox_s1_admin@ox-test.invalid"]);
      expect(receipts.every((m) => m.data.card === "yes")).toBe(true);
    });

    it("2S5-FE-05 · a billing contact who is the sponsor themselves gets one receipt, not a copy as well", async () => {
      const o = await order("ox_s1_admin", [{ key: "poster", quantity: 1 }], { name: "Sam Sponsor", email: "OX_S1_ADMIN@ox-test.invalid", reference: "PO-1002" });
      const pay = await call("POST", `/marketplace-orders/${o.id}/pay`, "ox_s1_admin");
      expect(pay.status, pay.text).toBe(200);
      await call("POST", "/public/test-provider/checkout", undefined, { token: new URL(pay.json.url).searchParams.get("t")!, outcome: "SUCCEED" });
      const attempt = await prisma.paymentAttempt.findFirstOrThrow({ where: { orderId: o.id, state: "PROCESSING" }, select: { id: true } });
      expect(await confirmPayment(attempt.id)).toEqual({ confirmed: true });
      expect((await mails("payment.received")).filter((m) => m.data.orderRef === ref(o.id)).map((m) => m.to)).toEqual(["OX_S1_ADMIN@ox-test.invalid"]);
    });
  });

  /* ── 2S4-BE-10 · Zoho Books: the invoice paid → the order paid ─────────── */
  describe("2S4-BE-10 · Zoho Books marking the order's invoice paid marks the order PAID — queued, idempotent, audited", () => {
    const secret = "ox-test-webhook-secret";
    const hook = async (body: Record<string, unknown>) => {
      const res = await fetch(`${base}/api/v1/webhooks/zoho/invoice`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-zoho-signature": createHmac("sha256", secret).update(JSON.stringify(body)).digest("hex") },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(202);
      /* The worker's job, exactly as worker/index.mts runs it. */
      const delivery = await prisma.webhookDelivery.findFirstOrThrow({ where: { externalId: body.invoiceId as string, status: "RECEIVED" }, orderBy: { receivedAt: "desc" }, select: { id: true } });
      return handleIngestInvoice(pool, { deliveryId: delivery.id }, {
        apply: async (payload) => prisma.$transaction(async (tx) => {
          const result = await ingestZohoInvoice(tx, payload as never);
          return result.applied ? { applied: true, invoiceId: result.invoiceId } : { applied: false, reason: result.reason };
        }),
      });
    };

    it("an order pushed to Zoho as a Deal; its invoice sent, then paid: the order is PAID through the same path as a card", async () => {
      const o = await order("ox_s2_admin", [{ key: "poster", quantity: 3 }]);
      O.zoho = o.id;
      const zoho = new FakeZoho();
      expect(await handlePushMarketplaceOrder({ db: prisma, zoho: () => zoho as never }, { tenantId: T, orderId: o.id })).toMatchObject({ status: "pushed" });
      const dealId = (await prisma.marketplaceOrder.findUniqueOrThrow({ where: { id: o.id }, select: { zohoDealId: true } })).zohoDealId!;
      L.dealId = dealId;
      const sent = { invoiceId: "ox_zinv_1", dealId, number: "INV-OX-0001", status: "sent", amount: 30_000, balance: 30_000, currency: "USD", issuedAt: new Date().toISOString() };
      expect(await hook(sent)).toMatchObject({ status: "APPLIED" });
      expect((await call("GET", `/marketplace-orders/${o.id}`, "ox_s2_admin")).json.state).toBe("AWAITING_PAYMENT");
      expect(await prisma.marketplaceOrderInvoice.findUniqueOrThrow({ where: { zohoInvoiceId: "ox_zinv_1" }, select: { status: true, orderId: true, tenantId: true } })).toEqual({ status: "sent", orderId: o.id, tenantId: T });

      const paidAt = new Date().toISOString();
      expect(await hook({ ...sent, status: "paid", balance: 0, paidAt })).toMatchObject({ status: "APPLIED" });
      const read = (await call("GET", `/marketplace-orders/${o.id}`, "ox_s2_admin")).json;
      expect(read).toMatchObject({ state: "PAID", paidVia: "ZOHO_INVOICE", paymentReference: "INV-OX-0001" });
      expect(read.paymentReceivedOn.slice(0, 10)).toBe(paidAt.slice(0, 10));
      const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: o.id, action: "marketplaceOrder.paymentRecorded" }, select: { actorId: true, after: true } });
      expect(audit).toMatchObject({ actorId: null, after: { via: "ZOHO_INVOICE", zohoInvoiceId: "ox_zinv_1", invoiceNumber: "INV-OX-0001" } });
      /* The ledger's payables are available, the lines in delivery, and everyone told. */
      const payables = { orderId: o.id, entryType: "BOOKING", account: { in: ["PROPERTY_PAYABLE", "ATHLETE_PAYABLE", "REFERRAL_PAYABLE"] } };
      expect(await prisma.ledgerEntry.count({ where: { ...payables, status: "PENDING" } })).toBe(0);
      expect(await prisma.ledgerEntry.count({ where: { ...payables, status: "AVAILABLE" } })).toBeGreaterThan(0);
      expect(await prisma.orderLineDelivery.findMany({ where: { orderId: o.id }, select: { state: true } })).toEqual([{ state: "IN_DELIVERY" }]);
      expect((await mails("payment.received")).find((m) => m.data.orderRef === ref(o.id))!.data.paidHow).toMatch(/invoice INV-OX-0001 .* is paid in full/);
      expect((await mails("sale.paid")).find((m) => m.data.orderRef === ref(o.id))).toMatchObject({ to: "ox_mgr@ox-test.invalid" });
    });

    it("redelivered, or paid again, it changes nothing", async () => {
      const paid = await prisma.marketplaceOrderInvoice.findUniqueOrThrow({ where: { zohoInvoiceId: "ox_zinv_1" }, select: { paidAt: true } });
      const again = { invoiceId: "ox_zinv_1", dealId: L.dealId, number: "INV-OX-0001", status: "paid", amount: 30_000, balance: 0, currency: "USD", paidAt: paid.paidAt!.toISOString() };
      await hook(again);
      await hook({ ...again, status: "Paid" });
      expect(await prisma.auditLog.count({ where: { entityId: O.zoho, action: "marketplaceOrder.paymentRecorded" } })).toBe(1);
      expect(await prisma.auditLog.count({ where: { entityId: O.zoho, action: "marketplaceOrder.paid" } })).toBe(1);
      expect((await mails("payment.received")).filter((m) => m.data.orderRef === ref(O.zoho)).map((m) => m.to).sort()).toEqual(["billing@sponsor-test.invalid", "ox_s2_admin@ox-test.invalid"]);
      expect((await prisma.marketplaceOrder.findUniqueOrThrow({ where: { id: O.zoho }, select: { state: true } })).state).toBe("PAID");
    });

    it("an invoice for less than the order's total does not pay it, and BTG can see why", async () => {
      const o = await order("ox_s2_admin", [{ key: "poster", quantity: 2 }]);
      const zoho = new FakeZoho();
      await handlePushMarketplaceOrder({ db: prisma, zoho: () => zoho as never }, { tenantId: T, orderId: o.id });
      const dealId = (await prisma.marketplaceOrder.findUniqueOrThrow({ where: { id: o.id }, select: { zohoDealId: true } })).zohoDealId!;
      await hook({ invoiceId: "ox_zinv_2", dealId, number: "INV-OX-0002", status: "paid", amount: 5_000, balance: 0 });
      expect((await prisma.marketplaceOrder.findUniqueOrThrow({ where: { id: o.id }, select: { state: true } })).state).toBe("AWAITING_PAYMENT");
      expect(await prisma.auditLog.count({ where: { entityId: o.id, action: "marketplaceOrder.invoicePaidShort" } })).toBe(1);
    });
  });

  /* ── 2S4-BE-10 · the payment window ────────────────────────────────────── */
  describe("2S4-BE-10 · unpaid orders are reminded on days one and two, and cancelled on day three", () => {
    /** Move an order's payment window back in time, as if it started waiting `hours` ago. */
    const waitingFor = (id: string, hours: number) =>
      prisma.marketplaceOrder.update({ where: { id }, data: { awaitingPaymentAt: new Date(Date.now() - hours * HOUR), paymentDueAt: new Date(Date.now() + (72 - hours) * HOUR) } });

    it("reminder one a day in, reminder two (the last) two days in — each once", async () => {
      const o = await order("ox_s3_admin", [{ key: "poster", quantity: 1 }]);
      O.unpaid = o.id;
      const sweep = () => sweepUnpaidOrders(new Date(), { tenantIds: [T] });
      await waitingFor(o.id, 23);
      await sweep();
      expect((await prisma.marketplaceOrder.findUniqueOrThrow({ where: { id: o.id }, select: { paymentRemindersSent: true } })).paymentRemindersSent).toBe(0);
      await waitingFor(o.id, 25);
      await sweep();
      await sweep();
      let reminders = (await mails("order.paymentReminder")).filter((m) => m.data.orderRef === ref(o.id));
      expect(reminders).toEqual([expect.objectContaining({ to: "ox_s3_admin@ox-test.invalid", data: expect.objectContaining({ final: "", amount: "$100.00" }) })]);
      await waitingFor(o.id, 49);
      await sweep();
      await sweep();
      reminders = (await mails("order.paymentReminder")).filter((m) => m.data.orderRef === ref(o.id));
      expect(reminders.map((m) => m.data.final)).toEqual(["", "yes"]);
      expect((await prisma.marketplaceOrder.findUniqueOrThrow({ where: { id: o.id }, select: { paymentRemindersSent: true, state: true } }))).toEqual({ paymentRemindersSent: 2, state: "AWAITING_PAYMENT" });
    });

    it("at three days it is cancelled — the stock released, the books reversed, the sponsor and the seller told — once", async () => {
      const sweep = () => sweepUnpaidOrders(new Date(), { tenantIds: [T] });
      await waitingFor(O.unpaid, 73);
      const r = await sweep();
      expect(r.cancelled).toBeGreaterThanOrEqual(1);
      expect((await sweep()).failed).toBe(0);
      const o = (await call("GET", `/marketplace-orders/${O.unpaid}`, "ox_s3_admin")).json;
      expect(o).toMatchObject({ state: "CANCELLED", cancelReason: "UNPAID", waitingOn: null });
      expect(await live(O.unpaid)).toBe(0);
      expect(await prisma.ledgerEntry.count({ where: { orderId: O.unpaid, entryType: "REVERSAL" } })).toBeGreaterThan(0);
      expect(await prisma.orderLineDelivery.findMany({ where: { orderId: O.unpaid }, select: { state: true } })).toEqual([{ state: "CANCELLED" }]);
      expect((await mails("order.cancelledUnpaid")).filter((m) => m.data.orderRef === ref(O.unpaid))).toEqual([expect.objectContaining({ to: "ox_s3_admin@ox-test.invalid" })]);
      expect((await mails("sale.cancelled")).filter((m) => m.data.orderRef === ref(O.unpaid))).toEqual([expect.objectContaining({ to: "ox_mgr@ox-test.invalid" })]);
    });

    it("never with a payment in progress: a card payment being confirmed, or one just started on the provider's page", async () => {
      const o = await order("ox_s4_admin", [{ key: "poster", quantity: 1 }]);
      const sweep = () => sweepUnpaidOrders(new Date(), { tenantIds: [T] });
      const pay = await call("POST", `/marketplace-orders/${o.id}/pay`, "ox_s4_admin");
      expect(pay.status, pay.text).toBe(200);
      await waitingFor(o.id, 73);
      /* Started a minute ago, still on the provider's page. */
      expect((await sweep()).deferred).toBeGreaterThanOrEqual(1);
      expect((await prisma.marketplaceOrder.findUniqueOrThrow({ where: { id: o.id }, select: { state: true } })).state).toBe("AWAITING_PAYMENT");
      /* Back from the provider, being confirmed — however long ago it started. */
      await prisma.paymentAttempt.updateMany({ where: { orderId: o.id }, data: { state: "PROCESSING", createdAt: new Date(Date.now() - 5 * HOUR) } });
      await sweep();
      expect((await prisma.marketplaceOrder.findUniqueOrThrow({ where: { id: o.id }, select: { state: true } })).state).toBe("AWAITING_PAYMENT");
      /* The attempt failed: nothing in progress, so the next pass cancels it. */
      await prisma.paymentAttempt.updateMany({ where: { orderId: o.id }, data: { state: "FAILED" } });
      await sweep();
      expect((await prisma.marketplaceOrder.findUniqueOrThrow({ where: { id: o.id }, select: { state: true, cancelReason: true } }))).toEqual({ state: "CANCELLED", cancelReason: "UNPAID" });
    });
  });
});
