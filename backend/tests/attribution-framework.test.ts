import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   3S6-BE-01 — the attribution adapter framework
   (documentation/SponsorX-Attribution-Framework.md).
   Done when: a new attribution partner can be added as an adapter without
   changing the engine.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();
const A = await import("../src/domain/attribution-adapters");

describe("3S6-BE-01 · adapters", () => {
  it("every adapter declares its method (deterministic first), lookback and exact keys — or is refused", () => {
    const base = { key: "test-a", name: "Test", methods: ["deterministic"] as const, lookbackDays: 30, matchKeys: ["order_id"] as const, intake: "webhook" as const, parse: () => ({ events: [], problems: [] }) };
    expect(() => A.registerAdapter({ ...base, key: "Bad Key" })).toThrow(/lowercase/);
    expect(() => A.registerAdapter({ ...base, key: "test-prob", methods: ["probabilistic", "deterministic"] })).toThrow(/deterministic matching comes first/);
    expect(() => A.registerAdapter({ ...base, key: "test-long", lookbackDays: 400 })).toThrow(/1 to 365/);
    expect(() => A.registerAdapter({ ...base, key: "test-nokey", matchKeys: [] })).toThrow(/at least one exact key/);
    expect(() => A.registerAdapter({ ...base, key: "generic-webhook-v1" })).toThrow(/already registered/);
    expect(A.describeAdapter(A.GENERIC_WEBHOOK)).toEqual({
      key: "generic-webhook-v1", name: "Generic partner webhook", methods: ["deterministic"], lookbackDays: 30, matchKeys: ["token", "order_id", "click_id"], intake: "webhook",
    });
  });

  it("the generic webhook: valid events kept with their exact keys; an invalid one or one with no key left out, with the reason", () => {
    const r = A.GENERIC_WEBHOOK.parse({ events: [
      { id: "o-1", type: "sale", occurred_at: "2026-11-05T12:00:00Z", amount_cents: 4500, reward_token: "rt-abc" },
      { id: "o-2", type: "refund", occurred_at: "2026-11-06T09:00:00Z", amount_cents: 4500, order_id: "PX-9", currency: "CAD" },
      { id: "o-3", type: "sale", occurred_at: "yesterday" },
      { id: "o-4", type: "sale", occurred_at: "2026-11-06T09:00:00Z", amount_cents: 100 },
    ] });
    expect(r.events).toEqual([
      { externalId: "o-1", kind: "sale", occurredAt: "2026-11-05T12:00:00Z", amountCents: 4500, currency: "USD", keys: { token: "rt-abc" } },
      { externalId: "o-2", kind: "refund", occurredAt: "2026-11-06T09:00:00Z", amountCents: 4500, currency: "CAD", keys: { order_id: "PX-9" } },
    ]);
    expect(r.problems).toHaveLength(2);
    expect(r.problems[0]).toMatch(/^Event 3: occurred_at/);
    expect(r.problems[1]).toBe("Event 4 (o-4): no reward token, order id or click id — it can't be matched exactly.");
    expect(A.GENERIC_WEBHOOK.parse({ nope: true })).toEqual({ events: [], problems: ["The delivery is { events: [ … ] }, 1 to 500 events."] });
  });
});

describe.skipIf(!hasDatabase)("3S6-BE-01 · partners and deliveries, against the database", { timeout: 120_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const I = await import("../src/domain/attribution-intake");
  const { setFlag } = await import("../src/domain/model-admin");
  const { ForbiddenError } = await import("../src/auth/errors");

  const T = "atf_t";
  const OTHER = "atf_o";
  const actor = (tenantId: string, role: string) =>
    ({ userId: `atf_${role}`, tenantId, roles: [role], sponsorId: null, athleteId: null, guardianId: null, propertyId: null }) as unknown as Actor;
  const admin = actor(T, "BTG_ADMIN");
  const NOW = new Date("2026-11-10T20:00:00Z");

  async function clean() {
    for (const t of ["AttributionDelivery", "AttributionPartner", "FeatureFlag", "AuditLog"]) await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [T, OTHER]);
    await prisma.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [T, OTHER]);
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.createMany({ data: [{ id: T, name: "Attribution" }, { id: OTHER, name: "Another operator" }] });
  });
  afterAll(clean);

  let partner = { id: "", token: "" };

  it("BTG adds a partner with an adapter: the token is returned once and kept only as a hash; audited", async () => {
    const out = await I.addPartner(admin, { name: "Corner Store", adapter: "generic-webhook-v1" });
    expect(out.token).toMatch(/^sxp_[0-9a-f]{48}$/);
    expect(out.endpoint).toBe(`/api/v1/attribution/partners/${out.partner.id}/events`);
    const row = await prisma.attributionPartner.findFirstOrThrow({ where: { id: out.partner.id }, select: { tokenHash: true } });
    expect(row.tokenHash).not.toContain(out.token);
    expect(row.tokenHash).toHaveLength(64);
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "attribution.partnerAdd" } })).toBe(1);
    await expect(I.addPartner(admin, { name: "Nowhere", adapter: "no-such-adapter" })).rejects.toBeInstanceOf(I.PartnerInputError);
    partner = { id: out.partner.id, token: out.token };
  });

  it("a delivery with the right token is kept as received, with its events and every problem", async () => {
    const r = await I.receiveDelivery(partner.id, `Bearer ${partner.token}`, { events: [
      { id: "o-1", type: "sale", occurred_at: "2026-11-05T12:00:00Z", amount_cents: 4500, reward_token: "rt-abc" },
      { id: "o-4", type: "sale", occurred_at: "2026-11-06T09:00:00Z" },
    ] }, NOW);
    expect(r).toMatchObject({ accepted: 1, problems: ["Event 2 (o-4): no reward token, order id or click id — it can't be matched exactly."] });
    const d = await prisma.attributionDelivery.findFirstOrThrow({ where: { id: r.deliveryId }, select: { tenantId: true, status: true, eventCount: true, adapter: true } });
    expect(d).toEqual({ tenantId: T, status: "accepted", eventCount: 1, adapter: "generic-webhook-v1" });
    /* Nothing valid: still kept, as rejected — nothing a partner sends disappears silently. */
    expect((await I.receiveDelivery(partner.id, `Bearer ${partner.token}`, { junk: 1 }, NOW)).accepted).toBe(0);
    expect(await prisma.attributionDelivery.count({ where: { tenantId: T, status: "rejected" } })).toBe(1);
  });

  it("a wrong or missing token, or an unknown partner, is refused the same way; a switched-off feature refuses", async () => {
    for (const [id, auth] of [[partner.id, "Bearer sxp_wrong"], [partner.id, undefined], ["atf_nope", `Bearer ${partner.token}`]] as const) {
      await expect(I.receiveDelivery(id, auth, { events: [] }, NOW)).rejects.toBeInstanceOf(I.PartnerAuthError);
    }
    await setFlag(admin, { feature: "attribution", tenantId: T, enabled: false, reason: "Pausing partner intake" });
    await expect(I.receiveDelivery(partner.id, `Bearer ${partner.token}`, { events: [] }, NOW)).rejects.toBeInstanceOf(I.PartnerOffError);
    await setFlag(admin, { feature: "attribution", tenantId: T, enabled: true, reason: "Partner intake back on" });
  });

  it("a NEW partner format is a new adapter — registered, used, with no change to the engine", async () => {
    /* A partner that sends a flat list of orders keyed by a click id: a different shape, a 14-day lookback. */
    A.registerAdapter({
      key: "flat-orders-v1", name: "Flat order list", methods: ["deterministic"], lookbackDays: 14, matchKeys: ["click_id"], intake: "webhook",
      parse(payload) {
        const rows = Array.isArray((payload as { orders?: unknown }).orders) ? (payload as { orders: Array<Record<string, unknown>> }).orders : [];
        return {
          events: rows.filter((o) => typeof o.ref === "string" && typeof o.click === "string").map((o) => ({
            externalId: o.ref as string, kind: "sale" as const, occurredAt: String(o.at), amountCents: Number(o.cents ?? 0), currency: "USD", keys: { click_id: o.click as string },
          })),
          problems: [],
        };
      },
    });
    const flat = await I.addPartner(admin, { name: "Stadium Shop", adapter: "flat-orders-v1" });
    const r = await I.receiveDelivery(flat.partner.id, `Bearer ${flat.token}`, { orders: [{ ref: "S-1", click: "ck-9", at: "2026-11-07T10:00:00Z", cents: 1200 }] }, NOW);
    expect(r.accepted).toBe(1);
    const desk = await I.partnerDesk(admin);
    expect(desk.adapters.map((a) => a.key)).toEqual(["flat-orders-v1", "generic-webhook-v1"]);
    expect(desk.partners.map((p) => [p.name, p.adapter, p.deliveries, p.rejected, p.events])).toEqual([
      ["Corner Store", "generic-webhook-v1", 2, 1, 1], ["Stadium Shop", "flat-orders-v1", 1, 0, 1],
    ]);
  });

  it("who: BTG admins only; another tenant sees none of these partners", async () => {
    for (const a of [actor(T, "CAMPAIGN_MGR"), actor(T, "SALES"), actor(T, "SPONSOR_ADMIN")]) {
      await expect(I.partnerDesk(a)).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect((await I.partnerDesk(actor(OTHER, "BTG_ADMIN"))).partners).toEqual([]);
  });
});
