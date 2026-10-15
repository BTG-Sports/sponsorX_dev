import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   3S8-DATA-01 — anomaly detection (documentation/SponsorX-Anomalies.md).
   Done when: the anomaly console identifies seeded duplicate, bot and
   redemption test patterns. Every number below is worked out by hand.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();
const R = await import("../src/domain/anomaly-rules");

const D = (s: string) => new Date(`${s}T00:00:00Z`);
const at = (s: string, plusSeconds: number) => new Date(new Date(s).getTime() + plusSeconds * 1000);

describe("3S8-DATA-01 · the rules", () => {
  it("the densest window", () => {
    expect(R.densest([0, 10, 20, 70, 75].map((s) => at("2026-11-05T12:00:00Z", s)), 60)).toEqual({ count: 3, from: at("2026-11-05T12:00:00Z", 0) });
  });

  it("spike: a day at 5× the trailing median (and 1,000 views or more); 10× is high", () => {
    const row = (d: string, views: number) => ({ deliverableId: "d1", title: "Post", source: "VERIFIED_API", day: D(d), views });
    const base = [row("2026-11-01", 200), row("2026-11-02", 220), row("2026-11-03", 210)];
    expect(R.spikeFlags([...base, row("2026-11-04", 2000)])).toMatchObject([{ severity: "medium", ruleId: "spike.views", fingerprint: "spike.views:d1:VERIFIED_API:2026-11-04" }]);
    expect(R.spikeFlags([...base, row("2026-11-04", 2500)])[0]!.severity).toBe("high");
    /* Under 1,000 views is never a spike; nor is a day without 3 earlier ones. */
    expect(R.spikeFlags([...base, row("2026-11-04", 999)])).toEqual([]);
    expect(R.spikeFlags([row("2026-11-02", 220), row("2026-11-03", 5000)])).toEqual([]);
  });

  it("duplicate: the same post on two deliverables — the later one, excluded automatically", () => {
    const flags = R.duplicateFlags([
      { deliverableId: "d2", title: "Reel B", publishedUrl: "https://instagram.com/p/abc/?igsh=1", publishedAt: D("2026-11-04"), campaignId: "c2", campaignName: "Second" },
      { deliverableId: "d1", title: "Reel A", publishedUrl: "https://Instagram.com/p/abc", publishedAt: D("2026-11-02"), campaignId: "c1", campaignName: "First" },
    ]);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ kind: "duplicate", fingerprint: "duplicate.post:d2", subject: { id: "c2" }, auto: { outcome: "excluded_from_reporting" } });
  });

  it("bot: 30 clicks inside a minute; redemption: 10 inside 5 minutes, or one fan 3 times", () => {
    const clicks = Array.from({ length: 35 }, (_, i) => ({ linkId: "l1", campaignId: "c1", campaignName: "First", at: at("2026-11-05T12:00:00Z", i) }));
    expect(R.botFlags(clicks)).toMatchObject([{ kind: "bot", severity: "medium", evidence: [{ value: "35" }, { value: "2026-11-05 12:00:00 UTC" }, { value: "35" }] }]);
    expect(R.botFlags(clicks.slice(0, 29))).toEqual([]);
    const redeems = Array.from({ length: 12 }, (_, i) => ({ rewardId: "r1", offerText: "Free shake", at: at("2026-11-06T09:00:00Z", i * 15), fanEmail: i < 3 ? "Fan@x.invalid" : null }));
    expect(R.redemptionFlags(redeems).map((f) => [f.ruleId, f.severity, f.evidence[0]!.value])).toEqual([
      ["redemption.burst", "high", "12"], ["redemption.repeat_fan", "medium", "f***@x.invalid"],
    ]);
  });

  it("manual entry: 3× what the API measured that day, or more engagements than views", () => {
    const flags = R.manualFlags([
      { deliverableId: "d1", title: "Post", day: D("2026-11-02"), source: "VERIFIED_API", views: 220, engagements: 10 },
      { deliverableId: "d1", title: "Post", day: D("2026-11-02"), source: "VERIFIED_MANUAL", views: 900, engagements: 30 },
      { deliverableId: "d2", title: "Reel", day: D("2026-11-03"), source: "SELF_REPORTED", views: 400, engagements: 500 },
    ]);
    expect(flags.map((f) => [f.ruleId, f.severity])).toEqual([["manual.over_measured", "medium"], ["manual.engagement_over_views", "low"]]);
    expect(flags[0]!.evidence.at(-1)).toEqual({ label: "Times measured", value: "4.1×" });
  });
});

describe.skipIf(!hasDatabase)("3S8-DATA-01 · the seeded patterns, through the nightly run and the console", { timeout: 120_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { runAnomalies, anomalyDesk, disposeAnomaly, AnomalyDecidedError, AnomalyNoteError, AnomalyNotFoundError } = await import("../src/domain/anomaly-engine");
  const { ForbiddenError } = await import("../src/auth/errors");
  const { NIL_JOBS } = await import("../src/domain/nil-jobs");

  const T = "anm_t";
  const OTHER = "anm_o";
  const NOW = new Date("2026-11-10T20:00:00Z");
  const actor = (tenantId: string, role: string) =>
    ({ userId: `anm_${role}`, tenantId, roles: [role], sponsorId: null, athleteId: null, guardianId: null, propertyId: null }) as unknown as Actor;
  const page = { page: 1, size: 25, skip: 0, take: 25 };

  async function clean() {
    for (const t of ["Anomaly", "AnomalyScan", "AuditLog", "RewardEvent", "RewardToken", "Reward", "LinkEvent", "TrackingLink", "MetricDaily", "Deliverable", "CampaignOrder", "Campaign", "Athlete", "Sponsor", "User"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [T, OTHER]);
    }
    await prisma.$executeRawUnsafe(`DELETE FROM "AnomalyScan" WHERE "tenantId" = ANY($1::text[])`, [T, OTHER]);
    await prisma.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [T, OTHER]);
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.createMany({ data: [{ id: T, name: "Anomalies" }, { id: OTHER, name: "Another operator" }] });
    await prisma.nilJob.createMany({ data: NIL_JOBS.map((j) => ({ ...j, tenantId: T })), skipDuplicates: true });
    await prisma.user.create({ data: { id: "anm_CAMPAIGN_MGR", tenantId: T, clerkId: "anm_cm", email: "cam@anm.invalid", roles: ["CAMPAIGN_MGR"] } });
    await prisma.sponsor.create({ data: { id: "anm_sp", tenantId: T, name: "Fit Co" }, select: { id: true } });
    await prisma.athlete.create({ data: {
      id: "anm_a1", tenantId: T, slug: "anm-a1", legalName: "Ava", displayName: "Ava Cruz", email: "ava@anm.invalid", sport: "Soccer", city: "X", stateCode: "MD", ageBand: "18_PLUS", state: "ACTIVE",
    }, select: { id: true } });
    await prisma.campaign.create({ data: { id: "anm_c", tenantId: T, sponsorId: "anm_sp", name: "Fall push", budget: 1, startDate: D("2026-11-01"), endDate: D("2026-11-30"), state: "ACTIVE" }, select: { id: true } });
    await prisma.campaignOrder.create({ data: {
      id: "anm_o", tenantId: T, campaignId: "anm_c", athleteId: "anm_a1", jobId: "SX-02", compensation: 5000, sellPrice: 10000, usageRights: "90 days", dueDate: D("2026-11-20"), state: "ACTIVE",
    }, select: { id: true } });
    await prisma.deliverable.createMany({ data: [
      { id: "anm_d1", tenantId: T, orderId: "anm_o", title: "Reel A", dueDate: D("2026-11-02"), state: "PUBLISHED", publishedUrl: "https://instagram.com/p/abc", publishedAt: D("2026-11-02") },
      /* The same post again, two days later: counted twice. */
      { id: "anm_d2", tenantId: T, orderId: "anm_o", title: "Reel B", dueDate: D("2026-11-04"), state: "PUBLISHED", publishedUrl: "https://instagram.com/p/abc/?igsh=1", publishedAt: D("2026-11-04") },
    ] });
    await prisma.metricDaily.createMany({ data: [
      /* 200, 220, 210, then 2,000: 9.5× the usual day. */
      ...[["2026-11-01", 200], ["2026-11-02", 220], ["2026-11-03", 210], ["2026-11-04", 2000]].map(([d, v]) => ({ tenantId: T, deliverableId: "anm_d1", day: D(d as string), views: v as number, engagements: 5, source: "VERIFIED_API" as const })),
      /* Typed in at 900 on a day the API measured 220. */
      { tenantId: T, deliverableId: "anm_d1", day: D("2026-11-02"), views: 900, engagements: 30, source: "VERIFIED_MANUAL" as const },
      /* More engagements than views. */
      { tenantId: T, deliverableId: "anm_d2", day: D("2026-11-03"), views: 400, engagements: 500, source: "SELF_REPORTED" as const },
    ] });
    /* 40 clicks in 40 seconds. */
    await prisma.trackingLink.create({ data: { id: "anm_l1", tenantId: T, code: "anm-code-1", deliverableId: "anm_d1", destinationUrl: "https://example.invalid" } });
    await prisma.linkEvent.createMany({ data: Array.from({ length: 40 }, (_, i) => ({ tenantId: T, linkId: "anm_l1", at: at("2026-11-05T12:00:00Z", i) })) });
    /* 12 redemptions in under 3 minutes, three by the same fan. */
    await prisma.reward.create({ data: { id: "anm_r1", tenantId: T, campaignId: "anm_c", offerText: "Free shake", terms: "One per fan", expiresAt: D("2027-01-01"), state: "ACTIVE", singleUse: false } });
    await prisma.rewardToken.create({ data: { id: "anm_tk", tenantId: T, rewardId: "anm_r1", athleteId: "anm_a1", token: "anm-token-1" } });
    await prisma.rewardEvent.createMany({ data: Array.from({ length: 12 }, (_, i) => ({
      tenantId: T, tokenId: "anm_tk", type: "REDEEM" as const, singleUse: false, at: at("2026-11-06T09:00:00Z", i * 15), fanEmail: i < 3 ? "fan@anm.invalid" : null,
    })) });
  });

  afterAll(clean);

  it("nightly: every seeded pattern is flagged once; the duplicate post is excluded automatically and audited", async () => {
    expect(await runAnomalies(prisma, NOW, { tenantId: T })).toEqual({ tenants: 1, flagged: 7, excludedAutomatically: 1, skipped: [] });
    expect(await runAnomalies(prisma, NOW, { tenantId: T })).toMatchObject({ flagged: 0, excludedAutomatically: 0 });
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "anomaly.autoDispose", actorId: null } })).toBe(1);
  });

  it("the console: open highest severity first, counts by kind; the duplicate resolved by SponsorX", async () => {
    const open = await anomalyDesk(actor(T, "CAMPAIGN_MGR"), { tab: "open", page });
    expect(open.asOf).toBe(NOW.toISOString());
    expect(open.counts).toEqual({ open: 6, resolved: 1, openByKind: { spike: 1, duplicate: 0, bot: 1, redemption: 2, manual_entry: 2 } });
    expect(open.anomalies.map((a) => [a.rule.id, a.severity])).toEqual([
      ["redemption.burst", "high"], ["bot.clicks", "medium"], ["manual.over_measured", "medium"], ["redemption.repeat_fan", "medium"], ["spike.views", "medium"], ["manual.engagement_over_views", "low"],
    ]);
    expect(open.anomalies[1]).toMatchObject({ kind: "bot", subject: { type: "campaign", id: "anm_c", name: "Fall push" }, rule: { version: "anomaly-rules@1.0.0" } });
    const resolved = await anomalyDesk(actor(T, "BTG_ADMIN"), { tab: "resolved", page });
    expect(resolved.anomalies[0]).toMatchObject({
      kind: "duplicate", subject: { name: "Fall push" }, disposition: { outcome: "excluded_from_reporting", by: "SponsorX (automatic)", automatic: true },
    });
    expect((await anomalyDesk(actor(T, "BTG_ADMIN"), { tab: "open", kind: "redemption", page })).anomalies).toHaveLength(2);
  });

  it("a person decides with a note — final; a person may replace SponsorX's automatic decision", async () => {
    const open = await anomalyDesk(actor(T, "CAMPAIGN_MGR"), { tab: "open", kind: "spike", page });
    const spike = open.anomalies[0]!;
    await expect(disposeAnomaly(actor(T, "CAMPAIGN_MGR"), spike.id, { outcome: "false_positive", note: "ok" }, NOW)).rejects.toBeInstanceOf(AnomalyNoteError);
    const done = await disposeAnomaly(actor(T, "CAMPAIGN_MGR"), spike.id, { outcome: "false_positive", note: "A viral repost, checked with the athlete." }, NOW);
    expect(done.anomaly.disposition).toMatchObject({ outcome: "false_positive", by: "cam@anm.invalid (Campaign manager)", automatic: false });
    await expect(disposeAnomaly(actor(T, "BTG_ADMIN"), spike.id, { outcome: "confirmed_issue", note: "Changing my mind here" }, NOW)).rejects.toBeInstanceOf(AnomalyDecidedError);
    const dup = (await anomalyDesk(actor(T, "BTG_ADMIN"), { tab: "resolved", kind: "duplicate", page })).anomalies[0]!;
    const replaced = await disposeAnomaly(actor(T, "CAMPAIGN_MGR"), dup.id, { outcome: "confirmed_issue", note: "Same post filed on two deliverables; fixing the record." }, NOW);
    expect(replaced.anomaly.disposition).toMatchObject({ outcome: "confirmed_issue", automatic: false });
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "anomaly.dispose" } })).toBe(2);
  });

  it("who: Sales, sponsors and Finance never see flags; another tenant's answers 404", async () => {
    for (const a of [actor(T, "SALES"), actor(T, "SPONSOR_ADMIN"), actor(T, "FINANCE")]) {
      await expect(anomalyDesk(a, { tab: "open", page })).rejects.toBeInstanceOf(ForbiddenError);
    }
    const any = (await anomalyDesk(actor(T, "BTG_ADMIN"), { tab: "open", page })).anomalies[0]!;
    await expect(disposeAnomaly(actor(OTHER, "BTG_ADMIN"), any.id, { outcome: "false_positive", note: "Reaching across" }, NOW)).rejects.toBeInstanceOf(AnomalyNotFoundError);
    expect((await anomalyDesk(actor(OTHER, "BTG_ADMIN"), { tab: "open", page })).counts.open).toBe(0);
  });
});
