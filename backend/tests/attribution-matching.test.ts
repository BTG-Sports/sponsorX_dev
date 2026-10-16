import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   3S6-BE-02/03/04 — partner sales normalised, matched exact-first, and the
   reconciliation queue (documentation/SponsorX-Attribution-Matching.md).
   Done when:
     02  attribution events identify source, method and confidence; modelled
         revenue is never labelled verified;
     03  deterministic matches are attempted first; probabilistic matches
         carry an explicit method and confidence;
     04  unmatched and ambiguous events remain in a reviewable queue.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();
const M = await import("../src/domain/attribution-matching");

describe("3S6-BE-03 · the matching rules (pure)", () => {
  const hit = (key: "token" | "click_id" | "order_id", campaignId: string, inWindow = true) => ({ key, found: true as const, campaignId, athleteId: "a1", inWindow });
  const model = { stamp: "attr-geo-time@0.1.0", t: { confidence: 0.5, minRedemptions: 3 } };

  it("exact keys: token first; keys that disagree are ambiguous; found but too late is outside the window; an unknown token says so", () => {
    expect(M.exactOutcome([hit("click_id", "c1"), hit("token", "c1")])).toEqual({
      status: "matched", campaignId: "c1", athleteId: "a1", class: "VERIFIED_TRANSACTION", method: "deterministic", matchKey: "token", confidence: 1, modelVersion: null,
    });
    expect(M.exactOutcome([hit("token", "c1"), hit("click_id", "c2")])).toEqual({ status: "unmatched", reason: "ambiguous", candidates: 2 });
    expect(M.exactOutcome([hit("token", "c1", false)])).toEqual({ status: "unmatched", reason: "outside_window", candidates: null });
    expect(M.exactOutcome([{ key: "token", found: false }])).toMatchObject({ reason: "unknown_token" });
    expect(M.exactOutcome([{ key: "order_id", found: false }])).toMatchObject({ reason: "no_match" });
    expect(M.exactOutcome([])).toMatchObject({ reason: "no_match" });
  });

  it("a refund found by its order id is what its sale was: modelled stays modelled, never becomes verified", () => {
    const basis = { class: "MODELLED" as const, method: "probabilistic" as const, matchKey: null, confidence: 0.5, modelVersion: "attr-geo-time@0.1.0" };
    expect(M.exactOutcome([{ ...hit("order_id", "c1"), basis }])).toMatchObject({ status: "matched", class: "MODELLED", method: "probabilistic", matchKey: null, confidence: 0.5 });
    expect(M.exactOutcome([hit("order_id", "c1")])).toMatchObject({ class: "VERIFIED_TRANSACTION", matchKey: "order_id", confidence: 1 });
  });

  it("the model: one campaign fits → modelled, with its version and a confidence below 1; several → ambiguous; none → nothing", () => {
    expect(M.modelledOutcome([{ campaignId: "c1", redemptions: 4 }, { campaignId: "c2", redemptions: 1 }], model)).toEqual({
      status: "matched", campaignId: "c1", athleteId: null, class: "MODELLED", method: "probabilistic", matchKey: null, confidence: 0.5, modelVersion: "attr-geo-time@0.1.0",
    });
    expect(M.modelledOutcome([{ campaignId: "c1", redemptions: 4 }, { campaignId: "c2", redemptions: 3 }], model)).toEqual({ status: "unmatched", reason: "ambiguous", candidates: 2 });
    expect(M.modelledOutcome([{ campaignId: "c1", redemptions: 2 }], model)).toBeNull();
    /* Whatever the settings say, a modelled match is never certain. */
    expect(M.modelledOutcome([{ campaignId: "c1", redemptions: 9 }], { ...model, t: { confidence: 1, minRedemptions: 1 } })).toMatchObject({ confidence: 0.99 });
  });

  it("exact first: the model never overrides a key that matched, was ambiguous or was too late", () => {
    const modelled = M.modelledOutcome([{ campaignId: "c9", redemptions: 9 }], model);
    expect(M.decide(M.exactOutcome([hit("token", "c1", false)]), modelled)).toMatchObject({ reason: "outside_window" });
    expect(M.decide(M.exactOutcome([hit("token", "c1"), hit("click_id", "c2")]), modelled)).toMatchObject({ reason: "ambiguous" });
    expect(M.decide(M.exactOutcome([{ key: "token", found: false }]), modelled)).toMatchObject({ class: "MODELLED", campaignId: "c9" });
    expect(M.decide(M.exactOutcome([{ key: "token", found: false }]), null)).toMatchObject({ reason: "unknown_token" });
  });
});

describe.skipIf(!hasDatabase)("3S6-BE-02/03/04 · partner sales, against the database", { timeout: 120_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const A = await import("../src/domain/attribution-adapters");
  const I = await import("../src/domain/attribution-intake");
  const Q = await import("../src/domain/attribution-desk");
  const { sponsorIntelligence } = await import("../src/domain/sponsor-intelligence");
  const { ForbiddenError } = await import("../src/auth/errors");
  const { NIL_JOBS } = await import("../src/domain/nil-jobs");

  const T = "atm_t";
  const OTHER = "atm_o";
  const NOW = new Date("2026-11-10T20:00:00Z");
  const D = (s: string) => new Date(`${s}T00:00:00Z`);
  const actor = (tenantId: string, role: string, sponsorId: string | null = null) =>
    ({ userId: `atm_${role}`, tenantId, roles: [role], sponsorId, athleteId: null, guardianId: null, propertyId: null }) as unknown as Actor;
  const admin = actor(T, "BTG_ADMIN");
  const page = { page: 1, size: 25, skip: 0, take: 25 };
  const rowOf = (externalId: string) => prisma.partnerSaleAttribution.findFirstOrThrow({
    where: { tenantId: T, externalId },
    select: { status: true, class: true, method: true, matchKey: true, confidence: true, modelVersion: true, campaignId: true, athleteId: true, reason: true, candidates: true, windowDays: true, adapter: true },
  });

  async function clean() {
    for (const t of ["PartnerSaleAttribution", "AttributionDelivery", "AttributionPartner", "AuditLog", "RewardEvent", "RewardToken", "Reward", "LinkEvent", "TrackingLink", "Deliverable", "CampaignOrder", "Campaign", "Athlete", "Sponsor"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [T, OTHER]);
    }
    await prisma.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [T, OTHER]);
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.createMany({ data: [{ id: T, name: "Attribution matching" }, { id: OTHER, name: "Another operator" }] });
    await prisma.nilJob.createMany({ data: NIL_JOBS.map((j) => ({ ...j, tenantId: T })), skipDuplicates: true });
    await prisma.sponsor.create({ data: { id: "atm_sp", tenantId: T, name: "Fit Co" }, select: { id: true } });
    await prisma.athlete.createMany({ data: ["a1", "a2"].map((a) => ({
      id: `atm_${a}`, tenantId: T, slug: `atm-${a}`, legalName: a, displayName: `Athlete ${a}`, email: `${a}@atm.invalid`, sport: "Soccer", city: "X", stateCode: "TX", ageBand: "18_PLUS" as const, state: "ACTIVE" as const,
    })) });
    await prisma.campaign.createMany({ data: [["c1", "Fall push"], ["c2", "Winter push"]].map(([id, name]) => ({
      id: `atm_${id}`, tenantId: T, sponsorId: "atm_sp", name: name!, budget: 1, startDate: D("2026-11-01"), endDate: D("2026-11-30"), state: "ACTIVE" as const,
    })) });
    await prisma.campaignOrder.create({ data: {
      id: "atm_o2", tenantId: T, campaignId: "atm_c2", athleteId: "atm_a2", jobId: "SX-02", compensation: 5000, sellPrice: 10000, usageRights: "90 days", dueDate: D("2026-11-20"), state: "ACTIVE",
    }, select: { id: true } });
    await prisma.deliverable.create({ data: { id: "atm_d2", tenantId: T, orderId: "atm_o2", title: "Reel", dueDate: D("2026-11-02"), state: "PUBLISHED" }, select: { id: true } });
    await prisma.trackingLink.create({ data: { id: "atm_l2", tenantId: T, code: "atm-click-2", deliverableId: "atm_d2", destinationUrl: "https://example.invalid" } });
    await prisma.linkEvent.create({ data: { tenantId: T, linkId: "atm_l2", at: new Date("2026-11-04T12:00:00Z") } });
    /* Rewards, where they are handed out, and their redemptions: Texas is the Fall push's (4); California is both campaigns' (3 each). */
    const rewards = [["r1", "atm_c1", "TX", "atm_a1", 4], ["r2", "atm_c2", "CA", "atm_a2", 3], ["r3", "atm_c2", "TX", null, 1], ["r5", "atm_c1", "CA", null, 3]] as const;
    for (const [r, campaignId, venueStateCode, athleteId, redeems] of rewards) {
      await prisma.reward.create({ data: { id: `atm_${r}`, tenantId: T, campaignId, offerText: "Free shake", terms: "One per fan", expiresAt: D("2027-01-01"), state: "ACTIVE", singleUse: false, venueStateCode } });
      await prisma.rewardToken.create({ data: { id: `atm_tk_${r}`, tenantId: T, rewardId: `atm_${r}`, athleteId, token: `atm-tok-${r}` } });
      await prisma.rewardEvent.createMany({ data: Array.from({ length: redeems }, (_, i) => ({
        tenantId: T, tokenId: `atm_tk_${r}`, type: "REDEEM" as const, singleUse: false, at: new Date(Date.parse("2026-11-03T10:00:00Z") + i * 60_000),
      })) });
    }
  });
  afterAll(clean);

  let generic = { id: "", token: "" };
  let geo = { id: "", token: "" };

  it("02/03 · each sale is stored once, matched exact-first, with its source, method, key, window and confidence — or queued with its reason", async () => {
    const out = await I.addPartner(admin, { name: "Corner Store", adapter: "generic-webhook-v1" });
    generic = { id: out.partner.id, token: out.token };
    const r = await I.receiveDelivery(generic.id, `Bearer ${generic.token}`, { events: [
      { id: "s1", type: "sale", occurred_at: "2026-11-05T12:00:00Z", amount_cents: 4500, reward_token: "atm-tok-r1", order_id: "PX-1" },
      { id: "s2", type: "sale", occurred_at: "2026-11-06T12:00:00Z", amount_cents: 3000, click_id: "atm-click-2" },
      { id: "x1", type: "refund", occurred_at: "2026-11-07T12:00:00Z", amount_cents: 4500, order_id: "PX-1" },
      { id: "s3", type: "sale", occurred_at: "2026-11-05T12:00:00Z", amount_cents: 999, reward_token: "atm-tok-unknown" },
      { id: "s4", type: "sale", occurred_at: "2026-12-20T12:00:00Z", amount_cents: 999, reward_token: "atm-tok-r1" },
      { id: "s5", type: "sale", occurred_at: "2026-11-06T13:00:00Z", amount_cents: 999, reward_token: "atm-tok-r1", click_id: "atm-click-2" },
      { id: "x2", type: "refund", occurred_at: "2026-11-07T12:00:00Z", amount_cents: 999, order_id: "PX-404" },
      { id: "s6", type: "sale", occurred_at: "2026-11-02T12:00:00Z", amount_cents: 999, click_id: "atm-click-2" },
    ] }, NOW);
    expect(r).toMatchObject({ accepted: 8, matched: 3, queued: 5, duplicates: 0 });

    expect(await rowOf("s1")).toEqual({
      status: "matched", class: "VERIFIED_TRANSACTION", method: "deterministic", matchKey: "token", confidence: 1, modelVersion: null,
      campaignId: "atm_c1", athleteId: "atm_a1", reason: null, candidates: null, windowDays: 30, adapter: "generic-webhook-v1",
    });
    expect(await rowOf("s2")).toMatchObject({ class: "VERIFIED_TRANSACTION", matchKey: "click_id", campaignId: "atm_c2", athleteId: "atm_a2" });
    /* The refund found its sale by the order id, in the same delivery. */
    expect(await rowOf("x1")).toMatchObject({ class: "VERIFIED_TRANSACTION", matchKey: "order_id", campaignId: "atm_c1" });
    expect(await rowOf("s3")).toMatchObject({ status: "unmatched", class: null, reason: "unknown_token" });
    /* 47 days after the fan's last redemption: past the 30-day window. */
    expect(await rowOf("s4")).toMatchObject({ status: "unmatched", reason: "outside_window" });
    expect(await rowOf("s5")).toMatchObject({ status: "unmatched", reason: "ambiguous", candidates: 2 });
    expect(await rowOf("x2")).toMatchObject({ status: "unmatched", reason: "no_match" });
    /* A sale before the click it claims: not credited. */
    expect(await rowOf("s6")).toMatchObject({ status: "unmatched", reason: "outside_window" });

    /* Sent again: a duplicate, not a second sale. */
    const again = await I.receiveDelivery(generic.id, `Bearer ${generic.token}`, { events: [
      { id: "s1", type: "sale", occurred_at: "2026-11-05T12:00:00Z", amount_cents: 4500, reward_token: "atm-tok-r1" },
    ] }, NOW);
    expect(again).toMatchObject({ accepted: 1, matched: 0, queued: 0, duplicates: 1 });
    expect(await prisma.partnerSaleAttribution.count({ where: { tenantId: T, externalId: "s1" } })).toBe(1);
  });

  it("02 · the database refuses a modelled sale labelled verified, and a verified one that is not certain", async () => {
    const id = (await prisma.partnerSaleAttribution.findFirstOrThrow({ where: { tenantId: T, externalId: "s1" }, select: { id: true } })).id;
    await expect(prisma.partnerSaleAttribution.update({ where: { id }, data: { method: "probabilistic" } })).rejects.toThrow(/PartnerSaleAttribution_class_check/);
    await expect(prisma.partnerSaleAttribution.update({ where: { id }, data: { confidence: 0.7 } })).rejects.toThrow(/PartnerSaleAttribution_class_check/);
    await expect(prisma.partnerSaleAttribution.update({ where: { id }, data: { matchKey: null } })).rejects.toThrow(/PartnerSaleAttribution_class_check/);
    const modelled = { class: "MODELLED", method: "probabilistic", matchKey: null, modelVersion: "attr-geo-time@0.1.0" };
    await expect(prisma.partnerSaleAttribution.update({ where: { id }, data: { ...modelled, confidence: 1 } })).rejects.toThrow(/PartnerSaleAttribution_class_check/);
    await expect(prisma.partnerSaleAttribution.update({ where: { id }, data: { ...modelled, class: "VERIFIED_TRANSACTION", confidence: 0.5 } })).rejects.toThrow(/PartnerSaleAttribution_class_check/);
  });

  it("03 · the modelled fallback: only for an adapter that declares it, only when no key matched, marked as modelled with its version and confidence", async () => {
    A.registerAdapter({
      key: "geo-orders-v1", name: "Store sales by state", methods: ["deterministic", "probabilistic"], lookbackDays: 30, matchKeys: ["order_id"], intake: "webhook",
      parse(payload) {
        const rows = (payload as { sales?: Array<Record<string, unknown>> }).sales ?? [];
        return {
          events: rows.map((o) => ({
            externalId: String(o.ref), kind: (o.refund ? "refund" : "sale") as "sale" | "refund", occurredAt: String(o.at), amountCents: Number(o.cents), currency: "USD",
            keys: o.order ? { order_id: String(o.order) } : {}, stateCode: String(o.state),
          })),
          problems: [],
        };
      },
    });
    const out = await I.addPartner(admin, { name: "Regional Chain", adapter: "geo-orders-v1" });
    geo = { id: out.partner.id, token: out.token };
    const r = await I.receiveDelivery(geo.id, `Bearer ${geo.token}`, { sales: [
      { ref: "g1", at: "2026-11-08T12:00:00Z", cents: 2000, state: "TX", order: "G-1" },
      { ref: "g2", at: "2026-11-08T12:00:00Z", cents: 2000, state: "CA" },
      { ref: "g3", at: "2026-11-08T12:00:00Z", cents: 2000, state: "NY" },
      { ref: "g4", at: "2026-11-09T12:00:00Z", cents: 500, state: "TX", order: "G-1", refund: true },
    ] }, NOW);
    expect(r).toMatchObject({ matched: 2, queued: 2 });
    /* Texas: only the Fall push redeemed there 3+ times (the Winter push once). */
    expect(await rowOf("g1")).toMatchObject({
      status: "matched", class: "MODELLED", method: "probabilistic", matchKey: null, confidence: 0.5, modelVersion: "attr-geo-time@0.1.0", campaignId: "atm_c1", athleteId: null,
    });
    expect(await rowOf("g2")).toMatchObject({ status: "unmatched", reason: "ambiguous", candidates: 2 });
    expect(await rowOf("g3")).toMatchObject({ status: "unmatched", reason: "no_match" });
    /* Its refund inherits "modelled" — never verified. */
    expect(await rowOf("g4")).toMatchObject({ class: "MODELLED", method: "probabilistic", campaignId: "atm_c1", confidence: 0.5 });
  });

  it("04 · the nightly retry matches a refund that arrived before its sale", async () => {
    await I.receiveDelivery(generic.id, `Bearer ${generic.token}`, { events: [
      { id: "x9", type: "refund", occurred_at: "2026-11-09T15:00:00Z", amount_cents: 700, order_id: "PX-9" },
    ] }, NOW);
    expect(await rowOf("x9")).toMatchObject({ status: "unmatched", reason: "no_match" });
    await I.receiveDelivery(generic.id, `Bearer ${generic.token}`, { events: [
      { id: "s9", type: "sale", occurred_at: "2026-11-09T12:00:00Z", amount_cents: 700, reward_token: "atm-tok-r1", order_id: "PX-9" },
    ] }, NOW);
    const q = await M.rematchQueue(prisma, NOW);
    expect(q.matched).toBe(1);
    expect(await rowOf("x9")).toMatchObject({ status: "matched", class: "VERIFIED_TRANSACTION", matchKey: "order_id", campaignId: "atm_c1" });
    /* Nothing else changed: the rest still wait, with their reasons. */
    expect(await prisma.partnerSaleAttribution.count({ where: { tenantId: T, status: "unmatched" } })).toBe(7);
  });

  it("03/04 · the desk: four totals never added together; events with source, method, key and confidence; the queue with every reason", async () => {
    const cm = actor(T, "CAMPAIGN_MGR");
    const d = await Q.attributionDesk(cm, { tab: "events", page }, NOW);
    /* Verified: s1 4500 + s2 3000 + s9 700, less refunds x1 4500 and x9 700. Modelled: g1 2000 less g4 500. */
    expect(d.totals.VERIFIED_TRANSACTION).toEqual({ count: 3, amountCents: 3000 });
    expect(d.totals.MODELLED).toEqual({ count: 1, amountCents: 1500 });
    expect(d.totals.VERIFIED_REDEMPTION.count).toBe(11);
    expect(Object.keys(d.totals)).toEqual(["VERIFIED_REDEMPTION", "VERIFIED_TRANSACTION", "MODELLED", "ESTIMATED_MEDIA_VALUE"]);
    expect(d.counts).toEqual({ events: 7, unmatched: 7 });
    const g1 = d.events!.find((e) => e.class === "MODELLED" && e.amountCents === 2000)!;
    expect(g1).toMatchObject({ source: { partner: "Regional Chain", adapter: "geo-orders-v1" }, method: "probabilistic", matchKey: null, confidence: 0.5, modelVersion: "attr-geo-time@0.1.0", windowDays: 30, campaign: { id: "atm_c1", name: "Fall push" }, athlete: null });
    expect(d.events!.find((e) => e.matchKey === "click_id")).toMatchObject({ class: "VERIFIED_TRANSACTION", method: "deterministic", confidence: 1, athlete: { id: "atm_a2", name: "Athlete a2" } });
    /* A refund reads as money back. */
    expect(d.events!.filter((e) => e.kind === "refund").map((e) => e.amountCents).sort()).toEqual([-4500, -500, -700]);
    /* No event shown as verified that isn't exact. */
    expect(d.events!.every((e) => e.class !== "VERIFIED_TRANSACTION" || (e.method === "deterministic" && e.matchKey && e.confidence === 1))).toBe(true);

    expect((await Q.attributionDesk(cm, { tab: "events", class: "MODELLED", page }, NOW)).events!.map((e) => e.class)).toEqual(["MODELLED", "MODELLED"]);
    expect((await Q.attributionDesk(cm, { tab: "events", class: "VERIFIED_REDEMPTION", page }, NOW)).events).toEqual([]);
    const c2 = await Q.attributionDesk(cm, { tab: "events", campaign: "atm_c2", page }, NOW);
    expect([c2.scope.campaign, c2.totals.VERIFIED_TRANSACTION, c2.events!.length]).toEqual([{ id: "atm_c2", name: "Winter push" }, { count: 1, amountCents: 3000 }, 1]);
    await expect(Q.attributionDesk(cm, { tab: "events", campaign: "atm_nope", page }, NOW)).rejects.toBeInstanceOf(Q.AttributionNotFoundError);

    const queue = await Q.attributionDesk(cm, { tab: "unmatched", page }, NOW);
    expect(queue.unmatched!.map((u) => [u.reference, u.reason, u.candidates]).sort()).toEqual([
      ["g2", "ambiguous", 2], ["g3", "no_match", null], ["s3", "unknown_token", null], ["s4", "outside_window", null], ["s5", "ambiguous", 2], ["s6", "outside_window", null], ["x2", "no_match", null],
    ]);
    /* Which keys it carried — never a fan's code. */
    expect(queue.unmatched!.find((u) => u.reference === "s5")).toMatchObject({ keysGiven: ["click_id", "token"], dismissed: null, source: { partner: "Corner Store" } });
    expect(JSON.stringify(queue)).not.toContain("atm-tok-");
  });

  it("04 · BTG dismisses a queued sale with a reason: it stays on the list, marked, and is audited; nobody assigns it by hand", async () => {
    const s3 = (await prisma.partnerSaleAttribution.findFirstOrThrow({ where: { tenantId: T, externalId: "s3" }, select: { id: true } })).id;
    await expect(Q.dismissUnmatched(admin, s3, { reason: "test" })).rejects.toBeInstanceOf(Q.AttributionInputError);
    await expect(Q.dismissUnmatched(actor(T, "CAMPAIGN_MGR"), s3, { reason: "A test order from the partner's staff" })).rejects.toBeInstanceOf(ForbiddenError);
    expect(await Q.dismissUnmatched(admin, s3, { reason: "A test order from the partner's staff" }, NOW)).toEqual({ id: s3, status: "dismissed", dismissedAt: NOW.toISOString() });
    await expect(Q.dismissUnmatched(admin, s3, { reason: "A test order from the partner's staff" })).rejects.toBeInstanceOf(Q.AttributionNotFoundError);
    const s1 = (await prisma.partnerSaleAttribution.findFirstOrThrow({ where: { tenantId: T, externalId: "s1" }, select: { id: true } })).id;
    await expect(Q.dismissUnmatched(admin, s1, { reason: "Matched sales are not in the queue" })).rejects.toBeInstanceOf(Q.AttributionNotFoundError);
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "attribution.dismiss", entityId: s3 } })).toBe(1);

    const queue = await Q.attributionDesk(actor(T, "SALES"), { tab: "unmatched", page }, NOW);
    expect(queue.counts.unmatched).toBe(6);
    expect(queue.unmatched!.at(-1)).toMatchObject({ reference: "s3", dismissed: { by: "atm_BTG_ADMIN", reason: "A test order from the partner's staff" } });
    /* The nightly retry leaves a dismissed sale alone. */
    await M.rematchQueue(prisma, NOW);
    expect((await rowOf("s3")).status).toBe("dismissed");
  });

  it("who: BTG admins, campaign managers and Sales read; a sponsor never; another tenant sees none of it", async () => {
    await expect(Q.attributionDesk(actor(T, "SPONSOR_ADMIN", "atm_sp"), { tab: "events", page }, NOW)).rejects.toBeInstanceOf(ForbiddenError);
    const other = await Q.attributionDesk(actor(OTHER, "BTG_ADMIN"), { tab: "unmatched", page }, NOW);
    expect([other.counts, other.unmatched, other.totals.VERIFIED_TRANSACTION]).toEqual([{ events: 0, unmatched: 0 }, [], { count: 0, amountCents: 0 }]);
    const s5 = (await prisma.partnerSaleAttribution.findFirstOrThrow({ where: { tenantId: T, externalId: "s5" }, select: { id: true } })).id;
    await expect(Q.dismissUnmatched(actor(OTHER, "BTG_ADMIN"), s5, { reason: "Not this tenant's to dismiss" })).rejects.toBeInstanceOf(Q.AttributionNotFoundError);
  });

  it("the sponsor's hub now shows its matched and likely sales — still four figures, never one", async () => {
    const hub = await sponsorIntelligence(actor(T, "SPONSOR_ADMIN", "atm_sp"), "all", NOW);
    expect(hub.totals.VERIFIED_TRANSACTION).toEqual({ count: 3, amountCents: 3000 });
    expect(hub.totals.MODELLED).toEqual({ count: 1, amountCents: 1500 });
  });
});
