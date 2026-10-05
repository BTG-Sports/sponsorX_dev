import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   2S8-SEC-04 — a replayed invoice webhook can't roll an invoice back.

   Zoho Books signs the webhook but sends no timestamp, so an old delivery
   replayed today still verifies. Done when: "A replayed older invoice
   webhook leaves the stored status unchanged; paid never returns to sent."

   The rule is tested pure (invoice-status-rules.ts), and then end to end:
   a correctly signed delivery POSTed to the real route, then the worker's
   own job (worker/jobs/ingest-invoice.mts, wired as worker/index.mts wires
   it), for a campaign's invoice and for a marketplace order's.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
process.env.ZOHO_WEBHOOK_SECRET = "ir-test-webhook-secret";

vi.mock("../src/lib/rate-limit", () => ({
  limit: async () => {},
  rateLimit: async () => ({ allowed: true, retryAfter: 0 }),
  RateLimitedError: class extends Error {},
}));

const { backwardsMove } = await import("../src/domain/invoice-status-rules");

describe("the forward order of an invoice (pure)", () => {
  const s = (status: string, balance?: number | null) => ({ status, balance });

  it("moves forward: draft → sent → overdue → paid, and void from any open state", () => {
    expect(backwardsMove(null, s("paid"))).toBeNull();
    expect(backwardsMove(s("draft"), s("sent"))).toBeNull();
    expect(backwardsMove(s("sent"), s("overdue"))).toBeNull();
    expect(backwardsMove(s("overdue"), s("partially_paid"))).toBeNull();
    expect(backwardsMove(s("partially_paid"), s("overdue"))).toBeNull();
    expect(backwardsMove(s("overdue"), s("paid"))).toBeNull();
    expect(backwardsMove(s("sent"), s("void"))).toBeNull();
    /* A balance of nothing owed on a live invoice is paid (2S4-BE-10). */
    expect(backwardsMove(s("sent", 9000), s("sent", 0))).toBeNull();
  });

  it("paid never returns to sent — nor to any other state, void included", () => {
    for (const older of ["draft", "sent", "viewed", "unpaid", "overdue", "partially_paid", "void", "something_new"]) {
      expect(backwardsMove(s("paid"), s(older)), older).toMatch(/a paid invoice never goes back/);
    }
    expect(backwardsMove(s("sent", 0), s("sent", 9000))).toMatch(/a paid invoice never goes back/);
    expect(backwardsMove(s("PAID"), s("Sent"))).toMatch(/never goes back/);
    /* Another paid payload (a corrected date or amount) still lands. */
    expect(backwardsMove(s("paid"), s("paid"))).toBeNull();
  });

  it("an older open state is refused; void is never reopened; an unknown word only while open", () => {
    expect(backwardsMove(s("overdue"), s("sent"))).toMatch(/older state/);
    expect(backwardsMove(s("sent"), s("draft"))).toMatch(/older state/);
    expect(backwardsMove(s("void"), s("draft"))).toMatch(/void invoice is never reopened/);
    expect(backwardsMove(s("void"), s("void"))).toBeNull();
    expect(backwardsMove(s("sent"), s("something_new"))).toBeNull();
    expect(backwardsMove(s("something_new"), s("sent"))).toBeNull();
  });
});

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("2S8-SEC-04 · a replayed, correctly signed invoice webhook never rolls the stored invoice back", { timeout: 60_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { ingestZohoInvoice } = await import("../src/domain/invoice");
  const { handleIngestInvoice } = await import("../worker/jobs/ingest-invoice.mts");

  const T = "ir_tenant";
  const pool = new pg.Pool({ connectionString: seededDb.TEST_DATABASE_URL, max: 2 });
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";

  /** Exactly what Zoho sends: the bytes, signed with the shared secret. */
  async function deliver(body: Record<string, unknown>) {
    const raw = JSON.stringify(body);
    const res = await fetch(`${base}/api/v1/webhooks/zoho/invoice`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-zoho-signature": createHmac("sha256", "ir-test-webhook-secret").update(raw).digest("hex") },
      body: raw,
    });
    const delivery = await prisma.webhookDelivery.findFirstOrThrow({
      where: { externalId: body.invoiceId as string, status: "RECEIVED" }, orderBy: { receivedAt: "desc" }, select: { id: true },
    });
    /* The worker's job, wired exactly as worker/index.mts wires it. */
    const outcome = await handleIngestInvoice(pool, { deliveryId: delivery.id }, {
      apply: async (payload) => prisma.$transaction(async (tx) => {
        const result = await ingestZohoInvoice(tx, payload as never);
        return result.applied
          ? { applied: true, invoiceId: result.invoiceId }
          : { applied: false, reason: result.reason, rejected: result.stale === true };
      }),
    });
    const row = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: delivery.id }, select: { status: true, error: true } });
    return { http: res.status, outcome, delivery: row };
  }

  async function wipe() {
    await prisma.webhookDelivery.deleteMany({ where: { externalId: { startsWith: "ir_zinv_" } } });
    await prisma.auditLog.deleteMany({ where: { tenantId: T } });
    await prisma.outboxJob.deleteMany({ where: { tenantId: T } });
    await prisma.campaignInvoice.deleteMany({ where: { tenantId: T } });
    await prisma.marketplaceOrderInvoice.deleteMany({ where: { tenantId: T } });
    await prisma.marketplaceOrder.deleteMany({ where: { tenantId: T } });
    await prisma.reservation.deleteMany({ where: { tenantId: T } });
    await prisma.cart.deleteMany({ where: { tenantId: T } });
    await prisma.campaign.deleteMany({ where: { tenantId: T } });
    await prisma.sponsor.deleteMany({ where: { tenantId: T } });
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  beforeAll(async () => {
    await wipe();
    const far = new Date(Date.now() + 3650 * 864e5);
    await prisma.tenant.create({ data: { id: T, name: "IR Tenant" } });
    await prisma.sponsor.create({ data: { id: "ir_sponsor", tenantId: T, name: "IR Sponsor" } });
    await prisma.campaign.create({ data: {
      id: "ir_campaign", tenantId: T, sponsorId: "ir_sponsor", name: "IR Campaign", budget: 500000,
      startDate: new Date("2026-10-01"), endDate: new Date("2026-11-30"), state: "ACTIVE", zohoDealId: "ir_deal_campaign",
    } });
    await prisma.cart.create({ data: { id: "ir_cart", tenantId: T, sponsorId: "ir_sponsor", expiresAt: far } });
    await prisma.reservation.create({ data: { id: "ir_res", tenantId: T, sponsorId: "ir_sponsor", cartId: "ir_cart", state: "CONVERTED", convertedAt: new Date(), expiresAt: far } });
    /* Already paid by card: the invoice is mirrored, and Zoho marking it paid changes nothing on the order. */
    await prisma.marketplaceOrder.create({ data: {
      id: "ir_order", tenantId: T, sponsorId: "ir_sponsor", reservationId: "ir_res", state: "PAID", zohoDealId: "ir_deal_order",
      subtotalCents: 9000, feesCents: 0, totalCents: 9000, requiresApproval: false, approvalReasons: [],
    } });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await wipe();
    await pool.end();
  });

  const stored = (id: string) => prisma.campaignInvoice.findUniqueOrThrow({ where: { zohoInvoiceId: id }, select: { id: true, status: true, paidAt: true, amount: true } });

  it("a campaign invoice: sent, then paid; the old 'sent' replayed is refused — still paid, audited, and Zoho gets its 202", async () => {
    const sent = { invoiceId: "ir_zinv_c1", dealId: "ir_deal_campaign", number: "INV-IR-1", status: "sent", amount: 500000, issuedAt: "2026-10-01T00:00:00.000Z" };
    const paid = { ...sent, status: "paid", paidAt: "2026-10-04T00:00:00.000Z" };
    expect(await deliver(sent)).toMatchObject({ http: 202, outcome: { status: "APPLIED" } });
    expect(await deliver(paid)).toMatchObject({ http: 202, outcome: { status: "APPLIED" } });
    const before = await stored("ir_zinv_c1");
    expect(before).toMatchObject({ status: "paid" });

    /* The replay: the very bytes of the earlier delivery, still correctly signed. */
    const replay = await deliver(sent);
    expect(replay.http).toBe(202); // received — Zoho is not asked to retry
    expect(replay.outcome).toEqual({ status: "REJECTED", reason: expect.stringMatching(/a paid invoice never goes back/) });
    expect(replay.delivery).toEqual({ status: "REJECTED", error: expect.stringMatching(/sent after paid/) });
    expect(await stored("ir_zinv_c1")).toEqual(before);

    /* Any older state, and void, are refused the same way. */
    for (const older of ["draft", "overdue", "void"]) {
      const r = await deliver({ ...sent, status: older, number: `INV-IR-1-${older}` });
      expect(r.outcome.status, older).toBe("REJECTED");
    }
    expect(await stored("ir_zinv_c1")).toEqual(before);

    const audits = await prisma.auditLog.findMany({ where: { tenantId: T, action: "invoice.staleRefused", entityId: before.id }, select: { entity: true, before: true, after: true }, orderBy: { at: "asc" } });
    expect(audits).toHaveLength(4);
    expect(audits[0]).toMatchObject({ entity: "CampaignInvoice", before: { status: "paid" }, after: { zohoInvoiceId: "ir_zinv_c1", status: "sent" } });

    /* A later paid payload (a corrected amount) still lands. */
    expect(await deliver({ ...paid, amount: 510000 })).toMatchObject({ outcome: { status: "APPLIED" } });
    expect(await stored("ir_zinv_c1")).toMatchObject({ status: "paid", amount: 510000 });
  });

  it("an open invoice is not rolled back either: overdue never returns to sent; forward moves still apply", async () => {
    const sent = { invoiceId: "ir_zinv_c2", dealId: "ir_deal_campaign", number: "INV-IR-2", status: "sent", amount: 100000 };
    expect(await deliver(sent)).toMatchObject({ outcome: { status: "APPLIED" } });
    expect(await deliver({ ...sent, status: "overdue" })).toMatchObject({ outcome: { status: "APPLIED" } });
    expect(await deliver(sent)).toMatchObject({ outcome: { status: "REJECTED" } });
    expect(await stored("ir_zinv_c2")).toMatchObject({ status: "overdue" });
    expect(await deliver({ ...sent, status: "paid" })).toMatchObject({ outcome: { status: "APPLIED" } });
    expect(await stored("ir_zinv_c2")).toMatchObject({ status: "paid" });
  });

  it("a marketplace order's invoice: paid never returns to sent", async () => {
    const sent = { invoiceId: "ir_zinv_o1", dealId: "ir_deal_order", number: "INV-IR-O1", status: "sent", amount: 9000, balance: 9000, currency: "USD" };
    expect(await deliver(sent)).toMatchObject({ http: 202, outcome: { status: "APPLIED" } });
    expect(await deliver({ ...sent, status: "paid", balance: 0, paidAt: "2026-10-04T00:00:00.000Z" })).toMatchObject({ outcome: { status: "APPLIED" } });
    const row = () => prisma.marketplaceOrderInvoice.findUniqueOrThrow({ where: { zohoInvoiceId: "ir_zinv_o1" }, select: { id: true, status: true, balance: true } });
    const before = await row();
    expect(before).toMatchObject({ status: "paid", balance: 0 });

    const replay = await deliver(sent);
    expect(replay).toMatchObject({ http: 202, outcome: { status: "REJECTED" }, delivery: { status: "REJECTED" } });
    expect(await row()).toEqual(before);
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "invoice.staleRefused", entity: "MarketplaceOrderInvoice", entityId: before.id } })).toBe(1);
    expect((await prisma.marketplaceOrder.findUniqueOrThrow({ where: { id: "ir_order" }, select: { state: true } })).state).toBe("PAID");
  });
});
