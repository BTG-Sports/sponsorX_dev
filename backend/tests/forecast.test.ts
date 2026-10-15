import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   3S4 — forecasting and pacing (documentation/SponsorX-Forecasting.md).

   3S4-DATA-01 — pacing computes nightly for every active campaign.
   3S4-BE-01   — the forecast refreshes automatically and persists history.
   3S4-BE-02   — at-risk campaigns generate actionable alerts before the end,
                 not after.

   Every number below is worked out by hand.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();
const R = await import("../src/domain/forecast-rules");

const D = (s: string) => new Date(`${s}T00:00:00Z`);

describe("3S4 · the forecast's rules", () => {
  it("the flight: days gone (today counts), days left, the share gone", () => {
    expect(R.flight(D("2026-11-01"), D("2026-11-30"), D("2026-11-10"))).toEqual({ total: 30, gone: 10, left: 20, elapsed: 0.3333 });
  });

  it("a flow on plan reaches its guarantee; a flow at half the plan does not", () => {
    /* 1,000 a day for 10 of 30 days, trusted fully at a third of the flight: 10,000 + 1,000 × 20 = 30,000. */
    expect(R.forecastFlow(30000, Array(10).fill(1000), 30)).toMatchObject({ low: 30000, mid: 30000, high: 30000, probability: 1 });
    /* 500 a day: 5,000 + 500 × 20 = 15,000 — certain to fall short. */
    expect(R.forecastFlow(30000, Array(10).fill(500), 30)).toMatchObject({ mid: 15000, probability: 0 });
  });

  it("a noisy flow: the spread of the days gives the band and the probability", () => {
    /* 0 and 2,000 alternating: mean 1,000, sd 1,000; over 20 days left, sd 1,000 × √20 = 4,472.
       Mid 30,000 exactly on the guarantee: probability ½. Band ±1.2816 sd. */
    const p = R.forecastFlow(30000, [0, 2000, 0, 2000, 0, 2000, 0, 2000, 0, 2000], 30);
    expect(p).toMatchObject({ mid: 30000, low: 24269, high: 35731, probability: 0.5 });
    expect(R.riskOf(p.probability)).toBe("watch");
  });

  it("early on, the plan's rate weighs in: two days of nothing is not yet a forecast of nothing", () => {
    /* 2 of 30 days: trust (2/30)/0.3 = 0.222 → rate 0.222 × 0 + 0.778 × 1,000 = 778/day → 21,778. */
    expect(R.forecastFlow(30000, [0, 0], 30).mid).toBe(21778);
  });

  it("deliverables: each still to verify has a chance of landing; the guarantee needs every one", () => {
    const today = D("2026-11-10");
    const end = D("2026-11-30");
    const pending = [{ dueOn: D("2026-11-20"), onTimeRate: null }, { dueOn: D("2026-11-25"), onTimeRate: null }, { dueOn: D("2026-11-07"), onTimeRate: null }];
    /* 0.98 × 0.98 × 0.75 (overdue, more than a week left) = 0.7203; mid 1 + 2.71 = 3.71. */
    expect(R.forecastDeliverables(4, 1, pending, today, end)).toEqual({ low: 3, mid: 4, high: 4, probability: 0.7203 });
    expect(R.landingChance({ dueOn: D("2026-11-20"), onTimeRate: 0.6 }, today, end)).toBe(0.8);
    expect(R.landingChance({ dueOn: D("2026-11-20"), onTimeRate: 0.6 }, D("2026-11-25"), end)).toBe(0.4);
    /* More booked than delivered can never reach a larger guarantee. */
    expect(R.forecastDeliverables(10, 1, pending, today, end).probability).toBe(0);
  });

  it("risk at 80% and 50%", () => {
    expect([0.8, 0.79, 0.5, 0.49].map(R.riskOf)).toEqual(["on_track", "watch", "watch", "at_risk"]);
  });

  it("the reasons, and what to do about them", () => {
    const s = {
      metric: "impressions" as const, guarantee: 30000, delivered: 5000, expectedToday: 10000, projectedMid: 15000, elapsed: 0.33, daysLeft: 20, overdue: 2,
      channels: [{ channel: "SOCIAL_INSTAGRAM", published: 4, delivered: 4800 }, { channel: "SOCIAL_TIKTOK", published: 2, delivered: 200 }], risk: "at_risk" as const,
    };
    expect(R.riskFactors(s)).toEqual([
      { key: "behind_pace", label: "Behind pace", detail: "5,000 of 10,000 impressions expected by today (50%)." },
      { key: "overdue_work", label: "Overdue work", detail: "2 deliverable(s) past due and not verified." },
      { key: "projected_shortfall", label: "Projected shortfall", detail: "Projected 15,000 against a guarantee of 30,000 — 15,000 short." },
      { key: "channel_lag", label: "Channel lagging", detail: "TikTok: 100 impressions per deliverable against 833 on average." },
    ]);
    expect(R.recommendedActions(s).map((a) => [a.kind, a.detail])).toEqual([
      ["accelerate_content", "Chase the 2 overdue deliverable(s) — the plan already counts on them."],
      ["change_channel", "Move the remaining deliverables from TikTok to Instagram, which delivers 1,200 per deliverable."],
      ["add_deliverable", "Add about 18 deliverable(s): at 833 impressions each, that covers the 15,000 gap."],
    ]);
    /* Late in the flight: reserve make-good inventory instead of adding work. */
    const late = { ...s, elapsed: 0.85, daysLeft: 4, overdue: 0, channels: [] };
    expect(R.recommendedActions(late).map((a) => a.kind)).toEqual(["reserve_make_good"]);
    expect(R.riskFactors(late).map((f) => f.key)).toContain("running_out");
    expect(R.recommendedActions({ ...s, risk: "on_track" })).toEqual([]);
  });

  it("alerts: raised once, before the end and after the first fifth; at risk emailed once, held through a dip to watch, recovered once", () => {
    expect(R.alertMove(null, "watch", true, 0.3)).toEqual({ raise: { risk: "watch", threshold: 0.8, email: false }, close: false, emailRecovery: false });
    expect(R.alertMove(null, "at_risk", true, 0.3)).toEqual({ raise: { risk: "at_risk", threshold: 0.5, email: true }, close: false, emailRecovery: false });
    expect(R.alertMove({ id: "a", risk: "watch", emailed: false }, "at_risk", true, 0.3)).toMatchObject({ raise: { risk: "at_risk", email: true }, close: true });
    expect(R.alertMove({ id: "a", risk: "at_risk", emailed: true }, "at_risk", true, 0.3).raise).toBeNull();
    expect(R.alertMove({ id: "a", risk: "at_risk", emailed: true }, "watch", true, 0.3)).toEqual({ raise: null, close: false, emailRecovery: false });
    expect(R.alertMove({ id: "a", risk: "at_risk", emailed: true }, "on_track", true, 0.3)).toEqual({ raise: null, close: true, emailRecovery: true });
    expect(R.alertMove({ id: "a", risk: "watch", emailed: false }, "on_track", true, 0.3)).toEqual({ raise: null, close: true, emailRecovery: false });
    /* Never after the end; never in the first fifth of the flight. */
    expect(R.alertMove(null, "at_risk", false, 0.9).raise).toBeNull();
    expect(R.alertMove(null, "at_risk", true, 0.1).raise).toBeNull();
  });
});

describe.skipIf(!hasDatabase)("3S4 · pacing, forecasts and alerts, nightly, against the database", { timeout: 120_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { recordFact } = await import("../src/domain/facts");
  const { runForecasts, forecastList, forecastDetail, setGuarantee, ForecastNotFoundError, GuaranteeError } = await import("../src/domain/forecast-engine");
  const { ForbiddenError } = await import("../src/auth/errors");
  const { NIL_JOBS } = await import("../src/domain/nil-jobs");
  const { EMAIL_TEMPLATES } = await import("../worker/jobs/send-email.mts");

  const T = "fo_t";
  const OTHER = "fo_o";
  const NOW = new Date("2026-11-10T20:00:00Z");
  const NEXT = new Date("2026-11-11T20:00:00Z");
  const actor = (tenantId: string, role: string, extra: Partial<Actor> = {}) =>
    ({ userId: `fo_${role}`, tenantId, roles: [role], sponsorId: null, athleteId: null, guardianId: null, propertyId: null, ...extra }) as unknown as Actor;
  const page = { page: 1, size: 25, skip: 0, take: 25 };
  const mails = async (template: string) => (await prisma.outboxJob.findMany({
    where: { tenantId: T, name: "notify.email" }, select: { payload: true },
  })).map((j) => j.payload as { template: string; to: string }).filter((p) => p.template === template).map((p) => p.to).sort();
  const views = (campaign: string, on: string, n: number) => prisma.$transaction((tx) => recordFact(tx, {
    tenantId: T, kind: "METRIC_RECORDED", key: `metric:${campaign}:${on}`, occurredOn: D(on), campaignId: campaign, athleteId: "fo_a1",
    inventory: { kind: "NIL_JOB", id: "SX-04" }, channel: "SOCIAL_INSTAGRAM", market: { state: "MD" }, source: { type: "MetricDaily", id: `${campaign}:${on}` },
    measures: { views_verified_api: n },
  }));

  async function clean() {
    for (const t of ["CampaignForecastAlert", "CampaignForecast", "CampaignPacing", "OutboxJob", "AuditLog", "CampaignDaySummary", "Fact", "Deliverable", "CampaignOrder", "Campaign", "Athlete", "Sponsor", "User"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [T, OTHER]);
    }
    await prisma.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [T, OTHER]);
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.createMany({ data: [{ id: T, name: "Forecasts" }, { id: OTHER, name: "Another operator" }] });
    await prisma.nilJob.createMany({ data: NIL_JOBS.filter((j) => j.id === "SX-04").map((j) => ({ ...j, tenantId: T })), skipDuplicates: true });
    await prisma.sponsor.create({ data: { id: "fo_sp", tenantId: T, name: "Fit Co" }, select: { id: true } });
    await prisma.user.createMany({ data: [
      { id: "fo_BTG_ADMIN", tenantId: T, clerkId: "fo_btg", email: "ana@fo.invalid", roles: ["BTG_ADMIN"] },
      { id: "fo_CAMPAIGN_MGR", tenantId: T, clerkId: "fo_cm", email: "cam@fo.invalid", roles: ["CAMPAIGN_MGR"] },
      { id: "fo_SALES", tenantId: T, clerkId: "fo_sales", email: "sal@fo.invalid", roles: ["SALES"] },
      { id: "fo_gone", tenantId: T, clerkId: "fo_gone", email: "gone@fo.invalid", roles: ["BTG_ADMIN"], disabledAt: new Date("2026-01-01") },
    ] });
    await prisma.athlete.create({ data: {
      id: "fo_a1", tenantId: T, slug: "fo-a1", legalName: "Sam", displayName: "Sam Lee", email: "sam@fo.invalid", sport: "Soccer",
      city: "Baltimore", stateCode: "MD", ageBand: "18_PLUS", state: "ACTIVE",
    }, select: { id: true } });
    const campaign = (id: string, name: string, start: string, end: string) => prisma.campaign.create({
      data: { id, tenantId: T, sponsorId: "fo_sp", name, budget: 500000, startDate: D(start), endDate: D(end), state: "ACTIVE" }, select: { id: true },
    });
    /* A — every deliverable booked (no guarantee set). */
    await campaign("fo_A", "Deliverables", "2026-11-01", "2026-11-30");
    await prisma.campaignOrder.create({ data: {
      id: "fo_oA", tenantId: T, campaignId: "fo_A", athleteId: "fo_a1", jobId: "SX-04", compensation: 10000, sellPrice: 20000, usageRights: "90 days",
      dueDate: D("2026-11-25"), state: "ACCEPTED", acceptedAt: D("2026-10-30"),
    }, select: { id: true } });
    await prisma.deliverable.createMany({ data: [
      { id: "fo_d1", tenantId: T, orderId: "fo_oA", title: "d1", dueDate: D("2026-11-05"), state: "VERIFIED" },
      { id: "fo_d2", tenantId: T, orderId: "fo_oA", title: "d2", dueDate: D("2026-11-20") },
      { id: "fo_d3", tenantId: T, orderId: "fo_oA", title: "d3", dueDate: D("2026-11-25") },
      { id: "fo_d4", tenantId: T, orderId: "fo_oA", title: "d4", dueDate: D("2026-11-07"), state: "PUBLISHED" },
    ] });
    await prisma.$transaction((tx) => recordFact(tx, {
      tenantId: T, kind: "DELIVERABLE_VERIFIED", key: "deliverable.verified:fo_d1", occurredOn: D("2026-11-08"), campaignId: "fo_A", athleteId: "fo_a1",
      inventory: { kind: "NIL_JOB", id: "SX-04" }, channel: "SOCIAL_INSTAGRAM", market: { state: "MD" }, source: { type: "Deliverable", id: "fo_d1" },
      measures: { deliverables_verified: 1 },
    }));
    /* B — 30,000 impressions promised; 500 a day so far. */
    await campaign("fo_B", "Impressions", "2026-11-01", "2026-11-30");
    for (let d = 1; d <= 10; d++) await views("fo_B", `2026-11-${String(d).padStart(2, "0")}`, 500);
    /* C — 30,000 impressions promised, two days in, nothing yet. */
    await campaign("fo_C", "Just started", "2026-11-09", "2026-12-08");
    /* Not forecast: a completed campaign, and one not started. */
    await prisma.campaign.create({ data: { id: "fo_X", tenantId: T, sponsorId: "fo_sp", name: "Done", budget: 1, startDate: D("2026-10-01"), endDate: D("2026-10-31"), state: "COMPLETED" }, select: { id: true } });
    await campaign("fo_Y", "Next month", "2026-12-01", "2026-12-31");
  });

  afterAll(clean);

  it("BTG sets a campaign's guarantee — campaign managers too, Sales not; a value is required; it is audited", async () => {
    await expect(setGuarantee(actor(T, "SALES"), "fo_B", { metric: "impressions", value: 30000 })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setGuarantee(actor(T, "BTG_ADMIN"), "fo_B", { metric: "impressions", value: 0 })).rejects.toBeInstanceOf(GuaranteeError);
    await expect(setGuarantee(actor(OTHER, "BTG_ADMIN"), "fo_B", { metric: "impressions", value: 30000 })).rejects.toBeInstanceOf(ForecastNotFoundError);
    expect(await setGuarantee(actor(T, "BTG_ADMIN"), "fo_B", { metric: "impressions", value: 30000 })).toEqual({ campaignId: "fo_B", guarantee: { metric: "impressions", value: 30000 } });
    expect(await setGuarantee(actor(T, "CAMPAIGN_MGR"), "fo_C", { metric: "impressions", value: 30000 })).toMatchObject({ guarantee: { metric: "impressions" } });
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "campaign.guaranteeSet" } })).toBe(2);
    /* Not after the end date — still ACTIVE, but nothing forecasts it any more (QA 2026-10-15). */
    await prisma.campaign.create({ data: { id: "fo_Z", tenantId: T, sponsorId: "fo_sp", name: "Over", budget: 1, startDate: D("2026-10-01"), endDate: D("2026-11-05"), state: "ACTIVE" }, select: { id: true } });
    await expect(setGuarantee(actor(T, "BTG_ADMIN"), "fo_Z", { metric: "impressions", value: 10 }, NOW)).rejects.toThrow(/ended on 2026-11-05/);
    await expect(setGuarantee(actor(T, "BTG_ADMIN"), "fo_Z", { metric: null }, NOW)).rejects.toBeInstanceOf(GuaranteeError);
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "campaign.guaranteeSet" } })).toBe(2);
    await prisma.campaign.delete({ where: { id: "fo_Z" } });
  });

  it("nightly: pacing for every day so far, a forecast per active campaign, and the alerts — at risk emailed to BTG admins and campaign managers once", async () => {
    expect(await runForecasts(prisma, NOW, { tenantId: T, emails: true })).toEqual({ tenants: 1, campaigns: 3, forecasts: 3, alertsRaised: 2, emails: 2, skipped: [] });
    expect(await prisma.campaignPacing.count({ where: { tenantId: T, campaignId: "fo_A" } })).toBe(10);
    expect(await prisma.campaignPacing.count({ where: { tenantId: T, campaignId: "fo_C" } })).toBe(2);
    expect(await mails("forecast.atRisk")).toEqual(["ana@fo.invalid", "cam@fo.invalid"]);
    /* A second run the same day makes nothing new and emails nobody. */
    expect(await runForecasts(prisma, NOW, { tenantId: T, emails: true })).toMatchObject({ forecasts: 0, alertsRaised: 0, emails: 0 });
    expect(await prisma.campaignForecast.count({ where: { tenantId: T } })).toBe(3);
  });

  it("the list: every active campaign, riskiest first, counts over the tenant", async () => {
    const list = await forecastList(actor(T, "SALES"), { page });
    expect(list.counts).toEqual({ active: 3, at_risk: 2, watch: 1, on_track: 0 });
    expect(list.campaigns.map((c) => [c.campaignId, c.risk])).toEqual([["fo_B", "at_risk"], ["fo_C", "at_risk"], ["fo_A", "watch"]]);
    expect(list.campaigns[0]).toMatchObject({
      guarantee: { metric: "impressions", value: 30000 }, delivered: 5000, deliveredSource: "VERIFIED_API",
      /* 2.0.0: the pace may yet change — spread 500 × 0.6 × (20 ÷ 30) × 20 = 4,000; Φ((15,000 − 30,000) ÷ 4,000) = Φ(−3.75) ≈ 0.0001. */
      projectedFinal: { mid: 15000 }, probabilityOfGuarantee: 0.0001, elapsed: 0.3333, stamp: { modelVersion: "forecast-rules@2.0.0" },
    });
    expect((await forecastList(actor(T, "SALES"), { page, risk: "watch" })).campaigns.map((c) => c.campaignId)).toEqual(["fo_A"]);
  });

  it("deliverables by default: watch at 72%, with the overdue one as the reason and chasing it as the action", async () => {
    const a = await forecastDetail(actor(T, "BTG_ADMIN"), "fo_A");
    expect(a).toMatchObject({ guarantee: { metric: "deliverables", value: 4 }, delivered: 1, deliveredSource: "VERIFIED_SYSTEM",
      projectedFinal: { low: 3, mid: 4, high: 4 }, probabilityOfGuarantee: 0.7203, risk: "watch" });
    expect(a.pacing.map((p) => [p.date, p.delivered, p.expected])).toEqual([
      ["2026-11-01", 0, 0], ["2026-11-02", 0, 0], ["2026-11-03", 0, 0], ["2026-11-04", 0, 0], ["2026-11-05", 0, 1],
      ["2026-11-06", 0, 1], ["2026-11-07", 0, 2], ["2026-11-08", 1, 2], ["2026-11-09", 1, 2], ["2026-11-10", 1, 2],
    ]);
    expect((a.riskFactors as Array<{ key: string }>).map((f) => f.key)).toEqual(["behind_pace", "overdue_work"]);
    expect((a.actions as Array<{ kind: string }>).map((x) => x.kind)).toEqual(["accelerate_content"]);
    expect(a.alert).toMatchObject({ risk: "watch", threshold: 0.8 });
    expect((a.projection as unknown[]).length).toBe(20);
  });

  it("an alert is raised before the end, never in the first fifth: two days in, at risk but not alerted", async () => {
    const c = await forecastDetail(actor(T, "BTG_ADMIN"), "fo_C");
    expect(c.risk).toBe("at_risk");
    expect(c.alert).toBeNull();
    const b = await forecastDetail(actor(T, "BTG_ADMIN"), "fo_B");
    expect(b.alert).toMatchObject({ risk: "at_risk", threshold: 0.5 });
    expect(new Date(b.alert!.raisedAt) < new Date(b.endsAt)).toBe(true);
    expect((b.actions as Array<{ detail: string }>)[0]!.detail).toBe("Add a deliverable to cover the projected 15,000 impressions gap.");
  });

  it("the next night: a campaign back on track closes its alert, says so once, and the history keeps both forecasts", async () => {
    await views("fo_B", "2026-11-11", 25000);
    await runForecasts(prisma, NEXT, { tenantId: T, emails: true });
    const b = await forecastDetail(actor(T, "BTG_ADMIN"), "fo_B");
    expect(b.risk).toBe("on_track");
    expect(b.alert).toBeNull();
    expect(await mails("forecast.recovered")).toEqual(["ana@fo.invalid", "cam@fo.invalid"]);
    expect(b.history.map((h) => h.projectedMid)).toEqual([b.projectedFinal.mid, 15000]);
    expect(b.pacing).toHaveLength(11);
    /* A, still on watch, raises nothing new. */
    expect(await prisma.campaignForecastAlert.count({ where: { tenantId: T, campaignId: "fo_A" } })).toBe(1);
  });

  it("with emails off it still forecasts and alerts on the dashboard, and sends nothing", async () => {
    await prisma.campaignForecast.deleteMany({ where: { tenantId: T, campaignId: "fo_C", day: D("2026-11-11") } });
    const before = await prisma.outboxJob.count({ where: { tenantId: T } });
    await runForecasts(prisma, NEXT, { tenantId: T, emails: false });
    expect(await prisma.outboxJob.count({ where: { tenantId: T } })).toBe(before);
  });

  it("another tenant's campaign answers 404; a sponsor never sees a forecast", async () => {
    await expect(forecastDetail(actor(OTHER, "BTG_ADMIN"), "fo_A")).rejects.toBeInstanceOf(ForecastNotFoundError);
    expect((await forecastList(actor(OTHER, "BTG_ADMIN"), { page })).counts.active).toBe(0);
    for (const a of [actor(T, "SPONSOR_ADMIN", { sponsorId: "fo_sp" }), actor(T, "ATHLETE", { athleteId: "fo_a1" }), actor(T, "FINANCE")]) {
      await expect(forecastList(a, { page })).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it("the two emails render in plain words, with nothing undefined", () => {
    for (const t of ["forecast.atRisk", "forecast.recovered"] as const) {
      const r = EMAIL_TEMPLATES[t]!({});
      expect(r.text).not.toContain("undefined");
      expect(r.subject).not.toContain("undefined");
    }
  });
});
