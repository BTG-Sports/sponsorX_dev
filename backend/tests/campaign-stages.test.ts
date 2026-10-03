import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   P4-BE-09 — campaign stages move by themselves; P6-BE-09 — rewards follow
   the campaign (BTG admin review, items 20 and 22).

   On a real database, through the real domain functions: the order
   acceptance, the invitation answer, the deliverable verification and the
   report render each make their move in their own transaction; the sweep
   catches a missed one and changes nothing on a second pass; a manual BTG
   move racing an automatic one yields one move; a cancelled or ad-only
   campaign is never moved; one tenant's sweep never touches another's.
   Only Clerk, the deliverable template's job codes and the PDF printer are
   stubbed.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@cs-test.invalid` } : null;
  },
}));
/* The NIL job ids are global primary keys ("SX-01"…); this file uses its own,
   so the template is asked for those. */
vi.mock("../src/domain/deliverable-template", async (actual) => {
  const real = await actual<typeof import("../src/domain/deliverable-template")>();
  const mine = (jobId: string) => (jobId.startsWith("cs_job") ? "SX-01" : jobId);
  return {
    ...real,
    templateForJob: (jobId: string) => real.templateForJob(mine(jobId)),
    deliverablesForOrder: (input: { jobId: string; dueDate: Date }) => real.deliverablesForOrder({ ...input, jobId: mine(input.jobId) }),
  };
});

const { automaticMove, nextStep } = await import("../src/domain/campaign-stage-rules");
const { followsCampaign, notReadyToGoLive } = await import("../src/domain/reward-state");

const facts = (over: Partial<import("../src/domain/campaign-stage-rules").StageFacts> = {}) => ({
  state: "STAFFING" as const, ordersAll: 2, ordersSigned: 2, athletesSigned: 2, athleteRange: { min: 1, max: 2 } as { min: number; max: number } | null,
  ordersSent: 0, ordersDraft: 0, offersWaiting: 0,
  invitesWaiting: 0, invitesWithoutOrder: 0, adSlots: 0, deliverables: { total: 0, published: 0, verified: 0 },
  reportingSince: null, finalReportAt: null, ...over,
});

describe("P4-BE-09 · the rules (pure)", () => {
  it("STAFFING → APPROVAL only when every order is signed and nothing waits", () => {
    expect(automaticMove(facts())?.to).toBe("APPROVAL");
    expect(automaticMove(facts({ ordersSent: 1 }))).toBeNull();
    expect(automaticMove(facts({ ordersDraft: 1 }))).toBeNull();
    expect(automaticMove(facts({ offersWaiting: 1 }))).toBeNull();
    expect(automaticMove(facts({ invitesWaiting: 1 }))).toBeNull();
    expect(automaticMove(facts({ invitesWithoutOrder: 1 }))).toBeNull();
    expect(automaticMove(facts({ ordersSigned: 0, athletesSigned: 0, ordersAll: 1 }))).toBeNull();
  });

  it("STAFFING → APPROVAL only at the package's maximum; never without a package", () => {
    const p59 = { athleteRange: { min: 5, max: 9 } };
    expect(automaticMove(facts({ ...p59, ordersSigned: 1, athletesSigned: 1 }))).toBeNull();
    expect(automaticMove(facts({ ...p59, ordersSigned: 8, athletesSigned: 8 }))).toBeNull();
    expect(automaticMove(facts({ ...p59, ordersSigned: 9, athletesSigned: 9 }))?.to).toBe("APPROVAL");
    expect(automaticMove(facts({ ...p59, ordersSigned: 9, athletesSigned: 9, offersWaiting: 1 }))).toBeNull();
    /* Two signed jobs for one athlete are one athlete. */
    expect(automaticMove(facts({ ...p59, ordersSigned: 9, athletesSigned: 8 }))).toBeNull();
    expect(automaticMove(facts({ athleteRange: null, ordersSigned: 50, athletesSigned: 50 }))).toBeNull();
  });

  it("below the maximum the next step is BTG's, with the count", () => {
    const p59 = { athleteRange: { min: 5, max: 9 } };
    expect(nextStep(facts({ ...p59, ordersSigned: 3, athletesSigned: 3 }), "staff")).toEqual({ who: "BTG", text: "Staffed 3 of 5–9 — needs at least 5" });
    expect(nextStep(facts({ ...p59, ordersSigned: 6, athletesSigned: 6 }), "staff"))
      .toEqual({ who: "BTG", text: "Staffed 6 of 5–9 — move to approval when you're done, or it moves on its own at 9" });
    expect(nextStep(facts({ athleteRange: null, ordersSigned: 4, athletesSigned: 4 }), "staff")).toEqual({ who: "BTG", text: "Move to approval when staffing is done" });
    expect(nextStep(facts({ athleteRange: { min: 1, max: 1 }, ordersSigned: 0, athletesSigned: 0 }), "staff")).toEqual({ who: "BTG", text: "Staffed 0 of 1 — needs at least 1" });
    /* Answers still out come first; the sponsor's wording is unchanged. */
    expect(nextStep(facts({ ...p59, athletesSigned: 6, ordersSent: 1 }), "staff")).toEqual({ who: "ATHLETES", text: "Waiting for 1 athlete to accept" });
    expect(nextStep(facts({ ...p59, athletesSigned: 6 }), "sponsor")).toEqual({ who: "BTG", text: "We're lining up athletes for your campaign" });
  });

  it("ACTIVE → REPORTING only with at least one deliverable, all verified", () => {
    const active = (d: { total: number; published: number; verified: number }, o = {}) => facts({ state: "ACTIVE", deliverables: d, ...o });
    expect(automaticMove(active({ total: 2, published: 0, verified: 2 }))?.to).toBe("REPORTING");
    expect(automaticMove(active({ total: 2, published: 1, verified: 1 }))).toBeNull();
    expect(automaticMove(active({ total: 0, published: 0, verified: 0 }))).toBeNull();
    expect(automaticMove(active({ total: 1, published: 0, verified: 1 }, { ordersSent: 1 }))).toBeNull();
  });

  it("REPORTING → COMPLETED only on a final report; an ad-only campaign never moves", () => {
    expect(automaticMove(facts({ state: "REPORTING" }))).toBeNull();
    expect(automaticMove(facts({ state: "REPORTING", finalReportAt: new Date() }))?.to).toBe("COMPLETED");
    expect(automaticMove(facts({ state: "REPORTING", finalReportAt: new Date(), ordersAll: 0, ordersSigned: 0, adSlots: 1 }))).toBeNull();
    expect(automaticMove(facts({ state: "CANCELLED" }))).toBeNull();
  });

  it("says the next step — BTG's wording, and the plain one that names no invitation", () => {
    expect(nextStep(facts({ ordersSigned: 1, ordersSent: 1, invitesWaiting: 1 }), "staff")).toEqual({ who: "ATHLETES", text: "Waiting for 2 athletes to accept" });
    expect(nextStep(facts({ ordersSigned: 1, ordersSent: 1, invitesWaiting: 1 }), "sponsor")).toEqual({ who: "ATHLETES", text: "Waiting for 1 athlete to accept" });
    expect(nextStep(facts({ state: "APPROVAL" }), "staff")).toEqual({ who: "BTG", text: "Ready for BTG to launch" });
    expect(nextStep(facts({ state: "ACTIVE", deliverables: { total: 4, published: 3, verified: 1 } }), "staff"))
      .toEqual({ who: "BTG", text: "Waiting for 3 deliverables to be verified" });
    expect(nextStep(facts({ state: "REPORTING" }), "staff")).toEqual({ who: "SYSTEM", text: "Moves to completed when the final report is sent" });
    expect(nextStep(facts({ state: "COMPLETED" }), "sponsor")).toEqual({ who: "SPONSOR", text: "Your final report is ready" });
  });
});

describe("P6-BE-09 · the reward rules (pure)", () => {
  const now = new Date("2026-10-03T12:00:00Z");
  it("a draft is ready only while it could pass the ACTIVE transition", () => {
    const ok = { state: "DRAFT" as const, expiresAt: new Date("2026-12-01"), offerText: "Free taco", terms: "One per fan" };
    expect(notReadyToGoLive(ok, now)).toBeNull();
    expect(notReadyToGoLive({ ...ok, expiresAt: new Date("2026-10-01") }, now)).toBe("Its expiry has passed.");
    expect(notReadyToGoLive({ ...ok, terms: "​ " }, now)).toBe("The terms are blank.");
    expect(notReadyToGoLive({ ...ok, state: "EXPIRED" }, now)).toMatch(/not a draft/);
  });
  it("says how it follows its campaign", () => {
    expect(followsCampaign("DRAFT", "APPROVAL", false)).toBe("Goes live when the campaign launches");
    expect(followsCampaign("ACTIVE", "ACTIVE", false)).toBe("Pauses if the campaign is cancelled");
    expect(followsCampaign("ACTIVE", "COMPLETED", false)).toBe("Stays open to fans until its own expiry");
    expect(followsCampaign("PAUSED", "CANCELLED", false)).toBe("Paused because the campaign was cancelled");
    expect(followsCampaign("EXPIRED", "COMPLETED", true)).toBeNull();
  });
});

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("P4-BE-09 / P6-BE-09 · on a real database", async () => {
  const { prisma } = await import("../src/db/client");
  const { acceptOrder, createOrder } = await import("../src/domain/campaign-order");
  const { verifyPublished } = await import("../src/domain/deliverable");
  const { inviteAthlete, transitionInvite } = await import("../src/domain/invitation");
  const { launchCampaign, transitionCampaign } = await import("../src/domain/campaign");
  const { advanceCampaign, CampaignNotStaffingError, sweepCampaignStages } = await import("../src/domain/campaign-stages");
  const { handleRenderReport } = await import("../worker/jobs/render-report.mts");
  const { createApp } = await import("../src/app");
  type Actor = import("../src/auth/actor").Actor;

  const A = "cs_tenant_a";
  const B = "cs_tenant_b";
  const person = (userId: string, tenantId: string, roles: string[], extra: Partial<Actor> = {}) =>
    ({ userId, tenantId, roles, sponsorId: null, athleteId: null, guardianId: null, propertyId: null, ...extra }) as unknown as Actor;
  const staff = person("cs_staff", A, ["BTG_ADMIN"]);
  const athlete = (n: number) => person(`cs_ath${n}_user`, A, ["ATHLETE"], { athleteId: `cs_ath${n}` });
  const evidence = { agreementId: "cs_agr", bodyHashShown: "cs-order-terms-hash", ip: "127.0.0.1", userAgent: "vitest" };
  const FUTURE = new Date(Date.now() + 30 * 864e5);
  const PAST = new Date(Date.now() - 864e5);

  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  const call = async (path: string, clerk: string) => {
    const res = await fetch(`${base}/api/v1${path}`, { headers: { "x-test-clerk": clerk } });
    return { status: res.status, json: await res.json() };
  };

  const TABLES = [
    "OutboxJob", "SyncTask", "ReportFile", "AuditLog", "RewardEvent", "RewardToken", "Reward", "Earning", "Offer", "MetricDaily",
    "Deliverable", "CampaignOrder", "AgreementAcceptance", "Agreement", "CampaignInvite", "AdSlot", "Edition", "Publication",
    "Campaign", "CampaignBrief", "SponsorPackage", "NilJob", "User", "Athlete", "SponsorContact", "Sponsor",
  ];
  async function clean() {
    for (const t of TABLES) await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" IN ($1, $2)`, A, B);
    await prisma.tenant.deleteMany({ where: { id: { in: [A, B] } } });
  }

  const state = async (id: string) => (await prisma.campaign.findUniqueOrThrow({ where: { id }, select: { state: true } })).state;
  const stageAudits = (id: string) => prisma.auditLog.findMany({
    where: { tenantId: { in: [A, B] }, entity: "Campaign", entityId: id, action: { startsWith: "campaign." } },
    select: { action: true, actorId: true, before: true, after: true }, orderBy: [{ at: "asc" }, { id: "asc" }],
  });
  const emails = async (template: string, campaignId: string) =>
    (await prisma.outboxJob.findMany({ where: { tenantId: { in: [A, B] }, name: "notify.email" }, select: { payload: true } }))
      .map((j) => j.payload as { template: string; to: string; idempotencyKey: string })
      .filter((p) => p.template === template && p.idempotencyKey.includes(`:${campaignId}:`));
  const jobs = async (name: string, campaignId: string) =>
    (await prisma.outboxJob.findMany({ where: { tenantId: { in: [A, B] }, name }, select: { payload: true } }))
      .map((j) => j.payload as Record<string, unknown>).filter((p) => p.campaignId === campaignId);

  /* Every campaign comes from a brief with a package — a one-athlete package
     unless the test names another, or `null` for no brief at all. */
  async function campaign(id: string, s: string, tenantId = A, pkg: string | null = tenantId === A ? "cs_pkg_1" : "cs_pkg_b") {
    const sponsorId = tenantId === A ? "cs_sponsor" : "cs_sponsor_b";
    const window = { startDate: new Date("2026-09-01"), endDate: new Date("2026-12-31") };
    if (pkg) {
      await prisma.campaignBrief.create({ data: {
        id: `${id}_brief`, tenantId, sponsorId, objective: "CS stages", budget: 1_000_000, packageId: pkg, ...window,
        sports: [], stateCodes: [], categories: [], state: "CAMPAIGN_CREATED",
      } });
    }
    await prisma.campaign.create({ data: {
      id, tenantId, sponsorId, name: `CS ${id}`, budget: 1_000_000, ...window, state: s as never,
      ...(pkg ? { briefId: `${id}_brief` } : {}),
    } });
  }
  async function order(id: string, campaignId: string, ath: number | string, s: string, job = "cs_job_1", tenantId = A) {
    await prisma.campaignOrder.create({ data: {
      id, tenantId, campaignId, athleteId: typeof ath === "string" ? ath : `cs_ath${ath}`, jobId: job, compensation: 10_000, sellPrice: 20_000,
      usageRights: "90 days", dueDate: FUTURE, state: s as never, ...(s === "ACCEPTED" || s === "ACTIVE" ? { acceptedAt: new Date() } : {}),
    } });
  }
  async function deliverable(id: string, orderId: string, s: string) {
    await prisma.deliverable.create({ data: {
      id, tenantId: A, orderId, title: `CS ${id}`, dueDate: FUTURE, state: s as never,
      ...(s === "PUBLISHED" || s === "VERIFIED" ? { publishedUrl: "https://example.com/cs", publishedAt: new Date() } : {}),
    } });
  }
  const render = (campaignId: string, trigger: "FINAL" | "REQUESTED" | "COMPLETED", at = new Date()) =>
    handleRenderReport(
      { db: prisma, put: async () => {}, pdf: async () => Buffer.from("%PDF-cs"), now: () => at },
      { tenantId: A, campaignId, trigger, requestedBy: null },
    );

  beforeAll(async () => {
    await clean();
    await prisma.tenant.createMany({ data: [{ id: A, name: "Campaign stages test A" }, { id: B, name: "Campaign stages test B" }] });
    await prisma.sponsor.createMany({ data: [
      { id: "cs_sponsor", tenantId: A, name: "CS Stages Tacos" },
      { id: "cs_sponsor_b", tenantId: B, name: "CS Stages Other" },
    ] });
    await prisma.athlete.createMany({ data: [1, 2, 3].map((n) => ({
      id: `cs_ath${n}`, tenantId: A, slug: `cs-stages-ath-${n}`, legalName: `CS Athlete ${n}`, displayName: `CS.ATH${n}`,
      email: `cs_ath${n}@cs-test.invalid`, sport: "Basketball", stateCode: "MD", ageBand: "18_PLUS" as const, state: "ACTIVE" as const,
    })) });
    await prisma.athlete.create({ data: {
      id: "cs_ath9", tenantId: B, slug: "cs-stages-ath-9", legalName: "CS Athlete 9", displayName: "CS.ATH9",
      email: "cs_ath9@cs-test.invalid", sport: "Soccer", stateCode: "MD", ageBand: "18_PLUS", state: "ACTIVE",
    } });
    await prisma.user.createMany({ data: [
      { id: "cs_staff", tenantId: A, clerkId: "cs_staff", email: "cs_staff@cs-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "cs_mgr", tenantId: A, clerkId: "cs_mgr", email: "cs_mgr@cs-test.invalid", roles: ["CAMPAIGN_MGR"] },
      { id: "cs_sp_admin", tenantId: A, clerkId: "cs_sp_admin", email: "cs_sp_admin@cs-test.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "cs_sponsor" },
      ...[1, 2, 3].map((n) => ({ id: `cs_ath${n}_user`, tenantId: A, clerkId: `cs_ath${n}_user`, email: `cs_ath${n}@cs-test.invalid`, roles: ["ATHLETE" as const], athleteId: `cs_ath${n}` })),
    ] });
    await prisma.nilJob.createMany({ data: [A, B].flatMap((t, i) => [1, 2].map((n) => ({
      id: `cs_job_${n}${i ? "_b" : ""}`, tenantId: t, name: `CS job ${n}`, baseLow: 5_000, baseHigh: 10_000, sellLow: 10_000, sellHigh: 20_000,
      sellFloorEmerging: 8_000, sellFloorCreator: 10_000, sellFloorPremium: 15_000,
    }))) });
    await prisma.agreement.create({ data: { id: "cs_agr", tenantId: A, kind: "CS_CAMPAIGN_ORDER", version: 1, bodyHash: "cs-order-terms-hash", effectiveAt: new Date("2026-01-01") } });
    const pkg = (id: string, tenantId: string, min: number, max: number) => ({
      id, tenantId, code: id.toUpperCase(), name: `CS ${min}–${max}`, priceLow: 100_000, priceHigh: 900_000,
      athleteCountMin: min, athleteCountMax: max, lineItems: [],
    });
    await prisma.sponsorPackage.createMany({ data: [pkg("cs_pkg_1", A, 1, 1), pkg("cs_pkg_59", A, 5, 9), pkg("cs_pkg_b", B, 1, 1)] });
    /* Nine more athletes for the 5–9 package; the ninth signs through the app. */
    await prisma.athlete.createMany({ data: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({
      id: `cs_pk${n}`, tenantId: A, slug: `cs-stages-pk-${n}`, legalName: `CS Package Athlete ${n}`, displayName: `CS.PK${n}`,
      email: `cs_pk${n}@cs-test.invalid`, sport: "Basketball", stateCode: "MD", ageBand: "18_PLUS" as const, state: "ACTIVE" as const,
    })) });
    await prisma.user.create({ data: { id: "cs_pk9_user", tenantId: A, clerkId: "cs_pk9_user", email: "cs_pk9@cs-test.invalid", roles: ["ATHLETE"], athleteId: "cs_pk9" } });

    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await clean();
  });

  describe("STAFFING → APPROVAL", () => {
    it("moves on the last acceptance, as the system, audited — a partly accepted campaign stays put", async () => {
      await campaign("cs_c1", "STAFFING");
      await order("cs_c1_o1", "cs_c1", 1, "SENT");
      await order("cs_c1_o2", "cs_c1", 2, "SENT");

      await acceptOrder(athlete(1), "cs_c1_o1", evidence);
      expect(await state("cs_c1")).toBe("STAFFING");

      await acceptOrder(athlete(2), "cs_c1_o2", evidence);
      expect(await state("cs_c1")).toBe("APPROVAL");

      const moves = await stageAudits("cs_c1");
      expect(moves).toEqual([{
        action: "campaign.submitForApproval", actorId: null, before: { state: "STAFFING" },
        after: { state: "APPROVAL", automatic: true, reason: expect.stringMatching(/Fully staffed: 2 athletes signed/) },
      }]);
      /* BTG's CRM task, and one "ready to launch" to the campaign manager. */
      expect(await prisma.syncTask.count({ where: { tenantId: A, campaignId: "cs_c1", kind: "APPROVAL" } })).toBe(1);
      expect((await emails("campaign.readyToLaunch", "cs_c1")).map((e) => e.to)).toEqual(["cs_mgr@cs-test.invalid"]);
    });

    it("an invitation still open holds it; declining the last one moves it", async () => {
      await campaign("cs_c1b", "STAFFING");
      await order("cs_c1b_o1", "cs_c1b", 1, "SENT");
      await prisma.campaignInvite.create({ data: { id: "cs_c1b_inv", tenantId: A, campaignId: "cs_c1b", athleteId: "cs_ath3", jobId: "cs_job_1", offered: 10_000, expiresAt: FUTURE } });

      await acceptOrder(athlete(1), "cs_c1b_o1", evidence);
      expect(await state("cs_c1b")).toBe("STAFFING");
      const desk = await call("/campaigns/cs_c1b", "cs_staff");
      expect(desk.json.campaign.nextStep).toEqual({ who: "ATHLETES", text: "Waiting for 1 athlete to accept" });

      await transitionInvite(athlete(3), "cs_c1b_inv", "DECLINED");
      expect(await state("cs_c1b")).toBe("APPROVAL");
    });

    it("an accepted invitation with no order yet holds it for BTG", async () => {
      await campaign("cs_c1c", "STAFFING");
      await order("cs_c1c_o1", "cs_c1c", 1, "ACCEPTED");
      await prisma.campaignInvite.create({ data: { id: "cs_c1c_inv", tenantId: A, campaignId: "cs_c1c", athleteId: "cs_ath2", jobId: "cs_job_1", offered: 10_000, expiresAt: FUTURE, state: "ACCEPTED" } });
      await sweepCampaignStages(new Date(), { tenantIds: [A] });
      expect(await state("cs_c1c")).toBe("STAFFING");
      expect((await call("/campaigns/cs_c1c", "cs_staff")).json.campaign.nextStep).toEqual({ who: "BTG", text: "BTG to send 1 order" });
    });
  });

  describe("STAFFING → APPROVAL at the package's maximum (5–9)", () => {
    const pk9 = person("cs_pk9_user", A, ["ATHLETE"], { athleteId: "cs_pk9" });
    const signed = async (campaignId: string, ids: number[]) => {
      for (const n of ids) await order(`${campaignId}_pk${n}`, campaignId, `cs_pk${n}`, "ACCEPTED");
    };

    it("one acceptance doesn't move it, and the desk is told how far staffing has got", async () => {
      await campaign("cs_p59", "STAFFING", A, "cs_pkg_59");
      await order("cs_p59_first", "cs_p59", 1, "SENT");
      await acceptOrder(athlete(1), "cs_p59_first", evidence);
      expect(await state("cs_p59")).toBe("STAFFING");
      expect((await call("/campaigns/cs_p59", "cs_staff")).json.campaign.nextStep).toEqual({ who: "BTG", text: "Staffed 1 of 5–9 — needs at least 5" });

      await signed("cs_p59", [1, 2, 3, 4, 5]);
      await sweepCampaignStages(new Date(), { tenantIds: [A] });
      expect(await state("cs_p59")).toBe("STAFFING");
      expect((await call("/campaigns/cs_p59", "cs_staff")).json.campaign.nextStep)
        .toEqual({ who: "BTG", text: "Staffed 6 of 5–9 — move to approval when you're done, or it moves on its own at 9" });
      expect(await stageAudits("cs_p59")).toEqual([]);
    });

    it("reaching 9 with nothing outstanding moves it, on the ninth acceptance", async () => {
      await campaign("cs_p59b", "STAFFING", A, "cs_pkg_59");
      await signed("cs_p59b", [1, 2, 3, 4, 5, 6, 7, 8]);
      await order("cs_p59b_ninth", "cs_p59b", "cs_pk9", "SENT");
      await acceptOrder(pk9, "cs_p59b_ninth", evidence);
      expect(await state("cs_p59b")).toBe("APPROVAL");
      expect((await stageAudits("cs_p59b"))[0]).toMatchObject({ action: "campaign.submitForApproval", actorId: null, after: { automatic: true } });
    });

    it("reaching 9 with an offer still open doesn't move it — until the offer is closed", async () => {
      await campaign("cs_p59c", "STAFFING", A, "cs_pkg_59");
      await signed("cs_p59c", [1, 2, 3, 4, 5, 6, 7, 8]);
      await prisma.offer.create({ data: {
        id: "cs_p59c_offer", tenantId: A, campaignId: "cs_p59c", athleteId: "cs_pk10", jobId: "cs_job_1", brief: "One more.",
        compensation: 10_000, sellPrice: 20_000, deliverables: [{ title: "Post", dueDate: FUTURE.toISOString() }], usageRights: "90 days",
        disclosures: ["#ad"], expiresAt: FUTURE, state: "SENT", sentAt: new Date(), termsHash: "cs-offer-hash",
      } });
      await order("cs_p59c_ninth", "cs_p59c", "cs_pk9", "SENT");
      await acceptOrder(pk9, "cs_p59c_ninth", evidence);
      expect(await state("cs_p59c")).toBe("STAFFING");
      expect((await call("/campaigns/cs_p59c", "cs_staff")).json.campaign.nextStep).toEqual({ who: "ATHLETES", text: "Waiting for 1 athlete to accept" });

      await prisma.offer.update({ where: { id: "cs_p59c_offer" }, data: { state: "WITHDRAWN", respondedAt: new Date() } });
      await sweepCampaignStages(new Date(), { tenantIds: [A] });
      expect(await state("cs_p59c")).toBe("APPROVAL");
    });

    it("no package never moves on its own; BTG's manual move is unchanged", async () => {
      await campaign("cs_nopkg", "STAFFING", A, null);
      await order("cs_nopkg_o1", "cs_nopkg", 1, "SENT");
      await acceptOrder(athlete(1), "cs_nopkg_o1", evidence);
      await sweepCampaignStages(new Date(), { tenantIds: [A] });
      expect(await state("cs_nopkg")).toBe("STAFFING");
      expect((await call("/campaigns/cs_nopkg", "cs_staff")).json.campaign.nextStep).toEqual({ who: "BTG", text: "Move to approval when staffing is done" });
      await transitionCampaign(staff, "cs_nopkg", "APPROVAL");
      expect(await state("cs_nopkg")).toBe("APPROVAL");
      expect((await stageAudits("cs_nopkg"))[0]).toMatchObject({ action: "campaign.submitForApproval", actorId: "cs_staff" });
    });
  });

  describe("ACTIVE → REPORTING → COMPLETED", () => {
    it("moves on the last verification; a cancelled order's work does not count", async () => {
      await campaign("cs_c2", "ACTIVE");
      await order("cs_c2_o1", "cs_c2", 1, "ACTIVE");
      await order("cs_c2_o2", "cs_c2", 2, "CANCELLED");
      await deliverable("cs_c2_d1", "cs_c2_o1", "PUBLISHED");
      await deliverable("cs_c2_d2", "cs_c2_o1", "PUBLISHED");
      await deliverable("cs_c2_dx", "cs_c2_o2", "NOT_STARTED");
      await prisma.reward.create({ data: { id: "cs_c2_reward", tenantId: A, campaignId: "cs_c2", offerText: "Free taco", terms: "One per fan", expiresAt: FUTURE, state: "ACTIVE" } });

      await verifyPublished(staff, "cs_c2_d1");
      expect(await state("cs_c2")).toBe("ACTIVE");
      expect((await call("/campaigns/cs_c2", "cs_staff")).json.campaign.nextStep).toEqual({ who: "BTG", text: "Waiting for 1 deliverable to be verified" });

      await verifyPublished(staff, "cs_c2_d2");
      expect(await state("cs_c2")).toBe("REPORTING");
      /* The final report is queued with the move. */
      expect(await jobs("report.render", "cs_c2")).toEqual([{ campaignId: "cs_c2", trigger: "FINAL", requestedBy: null }]);
    });

    it("completes on the final report's render — not on a file rendered before it entered REPORTING", async () => {
      await render("cs_c2", "REQUESTED", new Date(Date.now() - 3_600_000));
      expect(await state("cs_c2")).toBe("REPORTING");

      const out = await render("cs_c2", "FINAL");
      expect(out).toMatchObject({ status: "rendered", moved: ["COMPLETED"] });
      expect(await state("cs_c2")).toBe("COMPLETED");
      const last = (await stageAudits("cs_c2")).at(-1)!;
      expect(last).toMatchObject({ action: "campaign.complete", actorId: null, after: { state: "COMPLETED", automatic: true } });
      /* The renewal follows; the file just rendered IS the report, so no second render is queued. */
      expect(await jobs("zoho.pushRenewal", "cs_c2")).toHaveLength(1);
      expect((await jobs("report.render", "cs_c2")).map((j) => j.trigger)).toEqual(["FINAL"]);
      expect((await emails("campaign.finalReportReady", "cs_c2")).map((e) => e.to)).toEqual(["cs_sp_admin@cs-test.invalid"]);
    });

    it("leaves the rewards alone on completion, and tells the sponsor once", async () => {
      expect((await prisma.reward.findUniqueOrThrow({ where: { id: "cs_c2_reward" }, select: { state: true } })).state).toBe("ACTIVE");
      await render("cs_c2", "REQUESTED");
      await sweepCampaignStages(new Date(), { tenantIds: [A] });
      expect(await emails("campaign.finalReportReady", "cs_c2")).toHaveLength(1);
      expect(await state("cs_c2")).toBe("COMPLETED");

      const mine = await call("/campaigns/cs_c2", "cs_sp_admin");
      expect(mine.json.campaign.nextStep).toEqual({ who: "SPONSOR", text: "Your final report is ready" });
      expect(mine.json.campaign.stageChange).toEqual({ state: "COMPLETED", at: expect.any(String), movedAutomatically: true });
      expect(mine.json.campaign.stageHistory).toBeUndefined();
      const desk = await call("/campaigns/cs_c2", "cs_staff");
      expect(desk.json.campaign.stageHistory.map((s: { state: string }) => s.state)).toEqual(["COMPLETED", "REPORTING"]);
      expect(desk.json.campaign.stageHistory.every((s: { movedAutomatically: boolean }) => s.movedAutomatically)).toBe(true);
    });

    it("BTG completing by hand: the render tells the sponsor, once", async () => {
      await campaign("cs_c2m", "ACTIVE");
      await order("cs_c2m_o1", "cs_c2m", 1, "ACTIVE");
      await deliverable("cs_c2m_d1", "cs_c2m_o1", "NOT_STARTED");
      await transitionCampaign(staff, "cs_c2m", "REPORTING");
      await transitionCampaign(staff, "cs_c2m", "COMPLETED");
      expect(await emails("campaign.finalReportReady", "cs_c2m")).toEqual([]);
      expect((await jobs("report.render", "cs_c2m")).map((j) => j.trigger).sort()).toEqual(["COMPLETED", "FINAL"]);
      await render("cs_c2m", "COMPLETED");
      await render("cs_c2m", "COMPLETED");
      expect(await emails("campaign.finalReportReady", "cs_c2m")).toHaveLength(1);
      expect((await call("/campaigns/cs_c2m", "cs_staff")).json.campaign.stageChange).toMatchObject({ state: "COMPLETED", movedAutomatically: false });
    });
  });

  describe("an AD-ONLY campaign is unaffected", () => {
    it("is never moved, and gets no final-report render", async () => {
      await campaign("cs_ad", "ACTIVE");
      await prisma.publication.create({ data: { id: "cs_pub", tenantId: A, name: "CS Masthead" } });
      await prisma.edition.create({ data: { id: "cs_ed", tenantId: A, publicationId: "cs_pub", label: "CS Edition", closeDate: FUTURE, publishTarget: FUTURE, thresholdCents: 100_000, state: "SELLING" } });
      await prisma.adSlot.create({ data: { id: "cs_slot", tenantId: A, editionId: "cs_ed", slotCode: "CS-HALF", kind: "HALF", priceCents: 50_000, campaignId: "cs_ad", soldCents: 50_000, soldAt: new Date() } });
      await sweepCampaignStages(new Date(), { tenantIds: [A] });
      expect(await state("cs_ad")).toBe("ACTIVE");
      await transitionCampaign(staff, "cs_ad", "REPORTING");
      expect(await jobs("report.render", "cs_ad")).toEqual([]);
      await render("cs_ad", "REQUESTED");
      await sweepCampaignStages(new Date(), { tenantIds: [A] });
      expect(await state("cs_ad")).toBe("REPORTING");
      expect((await call("/campaigns/cs_ad", "cs_staff")).json.campaign.nextStep).toEqual({ who: "BTG", text: "BTG completes it once the report is sent" });
    });
  });

  describe("the sweep", () => {
    it("catches a campaign whose event was missed, and a second pass changes nothing", async () => {
      await campaign("cs_c4", "STAFFING");
      await order("cs_c4_o1", "cs_c4", 1, "ACCEPTED");
      await campaign("cs_c4b", "ACTIVE");
      await order("cs_c4b_o1", "cs_c4b", 2, "ACTIVE");
      await deliverable("cs_c4b_d1", "cs_c4b_o1", "VERIFIED");

      await sweepCampaignStages(new Date(), { tenantIds: [A] });
      expect(await state("cs_c4")).toBe("APPROVAL");
      expect(await state("cs_c4b")).toBe("REPORTING");
      const before = [await stageAudits("cs_c4"), await stageAudits("cs_c4b")];

      await sweepCampaignStages(new Date(), { tenantIds: [A] });
      expect([await stageAudits("cs_c4"), await stageAudits("cs_c4b")]).toEqual(before);
      expect(await emails("campaign.readyToLaunch", "cs_c4")).toHaveLength(1);
      expect(await jobs("report.render", "cs_c4b")).toHaveLength(1);
    });

    it("never moves a cancelled campaign", async () => {
      await campaign("cs_c7", "CANCELLED");
      await order("cs_c7_o1", "cs_c7", 1, "ACCEPTED");
      await sweepCampaignStages(new Date(), { tenantIds: [A] });
      expect(await prisma.$transaction((tx) => advanceCampaign(tx, A, "cs_c7"))).toEqual([]);
      expect(await state("cs_c7")).toBe("CANCELLED");
      expect(await stageAudits("cs_c7")).toEqual([]);
    });

    it("scoped to one tenant, never touches another's", async () => {
      await campaign("cs_b1", "STAFFING", B);
      await prisma.campaignOrder.create({ data: {
        id: "cs_b1_o1", tenantId: B, campaignId: "cs_b1", athleteId: "cs_ath9", jobId: "cs_job_1_b", compensation: 10_000, sellPrice: 20_000,
        usageRights: "90 days", dueDate: FUTURE, state: "ACCEPTED", acceptedAt: new Date(),
      } });
      await sweepCampaignStages(new Date(), { tenantIds: [A] });
      expect(await state("cs_b1")).toBe("STAFFING");
      /* …nor does an event in tenant A's books reach it. */
      expect(await prisma.$transaction((tx) => advanceCampaign(tx, A, "cs_b1"))).toEqual([]);
      expect(await state("cs_b1")).toBe("STAFFING");
      await sweepCampaignStages(new Date(), { tenantIds: [B] });
      expect(await state("cs_b1")).toBe("APPROVAL");
    });
  });

  describe("a manual BTG move racing an automatic one", () => {
    it("gives one move, whichever lands first", async () => {
      for (let i = 0; i < 4; i++) {
        const id = `cs_race${i}`;
        await campaign(id, "STAFFING");
        await order(`${id}_o1`, id, 1, "ACCEPTED");
        const results = await Promise.allSettled([
          transitionCampaign(staff, id, "APPROVAL"),
          prisma.$transaction((tx) => advanceCampaign(tx, A, id)),
          sweepCampaignStages(new Date(), { tenantIds: [A] }),
        ]);
        expect(await state(id)).toBe("APPROVAL");
        expect((await stageAudits(id)).filter((a) => a.action === "campaign.submitForApproval")).toHaveLength(1);
        /* The loser (if the manual move lost) was told plainly, not silently overwritten. */
        if (results[0].status === "rejected") expect(String(results[0].reason)).toMatch(/APPROVAL to APPROVAL/);
      }
    });

    it("a DRAFT order created alongside the last acceptance: it holds the campaign in STAFFING, or the move wins and it is refused", async () => {
      const outcomes = new Set<string>();
      for (let i = 0; i < 6; i++) {
        const id = `cs_lockrace${i}`;
        await campaign(id, "STAFFING");
        await order(`${id}_o1`, id, 1, "SENT");
        const [accepted, created] = await Promise.allSettled([
          acceptOrder(athlete(1), `${id}_o1`, evidence),
          createOrder(staff, { campaignId: id, athleteId: "cs_ath2", jobId: "cs_job_1", compensation: 10_000, sellPrice: 20_000, usageRights: "90 days", dueDate: FUTURE }),
        ]);
        expect(accepted.status).toBe("fulfilled");
        const orders = await prisma.campaignOrder.findMany({ where: { tenantId: A, campaignId: id }, select: { state: true }, orderBy: { id: "asc" } });
        if (created.status === "fulfilled") {
          /* The new order committed first: the move saw it and waits for it. */
          expect(await state(id)).toBe("STAFFING");
          expect(orders.map((o) => o.state).sort()).toEqual(["ACCEPTED", "DRAFT"]);
          outcomes.add("held");
        } else {
          /* The move committed first: the campaign's staffing is settled, and the order is refused. */
          expect(created.reason).toBeInstanceOf(CampaignNotStaffingError);
          expect(await state(id)).toBe("APPROVAL");
          expect(orders.map((o) => o.state)).toEqual(["ACCEPTED"]);
          outcomes.add("refused");
        }
      }
      expect(outcomes.size).toBeGreaterThan(0);
    });

    it("once the campaign has moved to APPROVAL, new orders and invitations are refused", async () => {
      await campaign("cs_settled", "STAFFING");
      await order("cs_settled_o1", "cs_settled", 1, "ACCEPTED");
      await sweepCampaignStages(new Date(), { tenantIds: [A] });
      expect(await state("cs_settled")).toBe("APPROVAL");
      await expect(createOrder(staff, { campaignId: "cs_settled", athleteId: "cs_ath2", jobId: "cs_job_1", compensation: 10_000, sellPrice: 20_000, usageRights: "90 days", dueDate: FUTURE }))
        .rejects.toMatchObject({ status: 409, code: "campaign_not_staffing" });
      await expect(inviteAthlete(staff, { campaignId: "cs_settled", athleteId: "cs_ath3", jobId: "cs_job_1", offered: 10_000 }))
        .rejects.toMatchObject({ status: 409, code: "campaign_not_staffing" });
      expect(await prisma.campaignOrder.count({ where: { tenantId: A, campaignId: "cs_settled" } })).toBe(1);
      expect(await prisma.campaignInvite.count({ where: { tenantId: A, campaignId: "cs_settled" } })).toBe(0);
    });

    it("a cancel racing the automatic move leaves a consistent history", async () => {
      await campaign("cs_race_c", "STAFFING");
      await order("cs_race_c_o1", "cs_race_c", 1, "ACCEPTED");
      await Promise.allSettled([
        transitionCampaign(staff, "cs_race_c", "CANCELLED"),
        prisma.$transaction((tx) => advanceCampaign(tx, A, "cs_race_c")),
      ]);
      expect(await state("cs_race_c")).toBe("CANCELLED");
      const chain = await stageAudits("cs_race_c");
      for (let i = 1; i < chain.length; i++) expect(chain[i]!.before).toEqual({ state: (chain[i - 1]!.after as { state: string }).state });
    });
  });

  describe("P6-BE-09 · rewards follow the campaign", () => {
    it("launch puts complete drafts live as the system and leaves the incomplete ones, saying why", async () => {
      await campaign("cs_rw", "APPROVAL");
      await order("cs_rw_o1", "cs_rw", 1, "ACCEPTED");
      await prisma.reward.createMany({ data: [
        { id: "cs_rw_ok", tenantId: A, campaignId: "cs_rw", offerText: "Free taco", terms: "One per fan", expiresAt: FUTURE },
        { id: "cs_rw_old", tenantId: A, campaignId: "cs_rw", offerText: "Old taco", terms: "One per fan", expiresAt: PAST },
        { id: "cs_rw_blank", tenantId: A, campaignId: "cs_rw", offerText: "Blank taco", terms: "  ", expiresAt: FUTURE },
      ] });
      const desk = await call("/rewards?campaignId=cs_rw", "cs_staff");
      expect(desk.json.rewards.find((r: { id: string }) => r.id === "cs_rw_ok").followsCampaign).toBe("Goes live when the campaign launches");

      const out = await launchCampaign(staff, "cs_rw");
      expect(out.rewards.activated).toBe(1);
      expect(out.rewards.leftInDraft.map((r) => [r.id, r.reason]).sort()).toEqual([
        ["cs_rw_blank", "The terms are blank."], ["cs_rw_old", "Its expiry has passed."],
      ]);
      const rows = await prisma.reward.findMany({ where: { tenantId: A, campaignId: "cs_rw" }, select: { id: true, state: true }, orderBy: { id: "asc" } });
      expect(rows).toEqual([{ id: "cs_rw_blank", state: "DRAFT" }, { id: "cs_rw_ok", state: "ACTIVE" }, { id: "cs_rw_old", state: "DRAFT" }]);
      const audit = await prisma.auditLog.findFirstOrThrow({ where: { tenantId: A, entity: "Reward", entityId: "cs_rw_ok" }, select: { actorId: true, after: true } });
      expect(audit).toEqual({ actorId: null, after: { state: "ACTIVE", automatic: true, reason: "The campaign launched." } });
    });

    it("cancelling pauses the live ones, as the system", async () => {
      await transitionCampaign(staff, "cs_rw", "CANCELLED");
      const ok = await prisma.reward.findUniqueOrThrow({ where: { id: "cs_rw_ok" }, select: { state: true } });
      expect(ok.state).toBe("PAUSED");
      const audits = await prisma.auditLog.findMany({ where: { tenantId: A, entity: "Reward", entityId: "cs_rw_ok" }, select: { actorId: true, after: true }, orderBy: { at: "asc" } });
      expect(audits.at(-1)).toEqual({ actorId: null, after: { state: "PAUSED", automatic: true, reason: "The campaign was cancelled." } });
      const desk = await call("/rewards/cs_rw_ok", "cs_staff");
      expect(desk.json.followsCampaign).toBe("Paused because the campaign was cancelled");
    });
  });
});
