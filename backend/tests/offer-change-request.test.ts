import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   2S2-FE-03 — "requesting a change routes back to the campaign manager",
   against the real API and database.

   POST /offers/:id/respond { decision: "REQUEST_CHANGE", note }:
     - needs a note (≤ 2000 chars);
     - neither accepts nor declines: the offer stays SENT, no order is made,
       and the athlete can still accept or decline it;
     - is audited (who, the note, when) and emailed through the outbox to the
       offer's author and the tenant's active CAMPAIGN_MGRs — BTG_ADMINs only
       when there is no campaign manager;
     - shows on GET /offers/:id and GET /offers for BTG's staff;
     - is the named athlete's alone (not another athlete, not another
       tenant's, not staff), and a minor needs a verified guardian — the
       same gate as ACCEPT.
   Only Clerk is stubbed.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@ocr-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("2S2-FE-03 · requesting a change to an offer", { timeout: 60_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");

  const T = "ocr_btg";   // BTG's tenant: the offers' campaign managers
  const X = "ocr_other"; // another tenant: an admin, no campaign manager
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
  const inDays = (n: number) => new Date(Date.now() + n * 864e5);
  const change = (note?: string) => ({ decision: "REQUEST_CHANGE", ...(note === undefined ? {} : { note }) });

  async function clean() {
    const ids = [T, X];
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 6; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = ANY($1::text[])`, ids).catch(() => {});
      }
    }
    await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
  }

  const emails = async (tenantId: string) =>
    (await prisma.outboxJob.findMany({ where: { tenantId, name: "notify.email" }, select: { payload: true } }))
      .map((r) => r.payload as { template: string; to: string; data: Record<string, string> })
      .filter((p) => p.template === "offer.changeRequested");
  /* The audit log is append-only — a previous run's rows outlive clean() — so
     only this run's count. */
  let stale: string[] = [];
  const audits = (entityId: string) =>
    prisma.auditLog.findMany({ where: { tenantId: { in: [T, X] }, entityId, action: "offer.requestChange", id: { notIn: stale } }, select: { actorId: true, tenantId: true, after: true, at: true } });

  const offerRow = (id: string, tenantId: string, athleteId: string, createdBy: string | null) => ({
    id, tenantId, campaignId: `${tenantId}_campaign`, athleteId, jobId: `${tenantId}_job`, brief: "Post twice on game day.",
    compensation: 20_000, sellPrice: 40_000, deliverables: [{ title: "Feed post", dueDate: inDays(14).toISOString() }],
    usageRights: "Organic social, 90 days", disclosures: ["#ad"], expiresAt: inDays(7), state: "SENT" as const,
    sentAt: new Date(), termsHash: "a".repeat(64), createdBy,
  });

  beforeAll(async () => {
    await clean();
    stale = (await prisma.auditLog.findMany({ where: { tenantId: { in: [T, X] }, action: "offer.requestChange" }, select: { id: true } })).map((r) => r.id);
    await prisma.tenant.createMany({ data: [{ id: T, name: "OCR BTG" }, { id: X, name: "OCR other" }] });
    for (const t of [T, X]) {
      await prisma.sponsor.create({ data: { id: `${t}_sponsor`, tenantId: t, name: "Rosa's Tacos", categories: ["FAST_FOOD"] } });
      await prisma.nilJob.create({ data: { id: `${t}_job`, tenantId: t, name: "Game-day post", baseLow: 10_000, baseHigh: 20_000, sellLow: 20_000, sellHigh: 40_000, sellFloorEmerging: 15_000, sellFloorCreator: 20_000, sellFloorPremium: 30_000 } });
      await prisma.campaign.create({ data: { id: `${t}_campaign`, tenantId: t, sponsorId: `${t}_sponsor`, name: "Fall tacos", budget: 500_000, startDate: new Date(), endDate: inDays(90), state: "STAFFING" } });
    }
    await prisma.guardian.create({ data: { id: "ocr_guardian", tenantId: T, legalName: "Pat Rivera", email: "ocr_guardian@ocr-test.invalid", relationship: "PARENT" } });
    await prisma.athlete.createMany({ data: [
      { id: "ocr_ath", tenantId: T, slug: "ocr-ath", legalName: "Jordan Reed", displayName: "JORDAN", email: "ocr_athlete@ocr-test.invalid", sport: "Basketball", stateCode: "MD", ageBand: "18_PLUS", state: "ACTIVE" },
      { id: "ocr_ath2", tenantId: T, slug: "ocr-ath2", legalName: "Sam Lee", displayName: "SAM", email: "ocr_athlete2@ocr-test.invalid", sport: "Soccer", stateCode: "MD", ageBand: "18_PLUS", state: "ACTIVE" },
      { id: "ocr_minor", tenantId: T, slug: "ocr-minor", legalName: "Alex Rivera", displayName: "ALEX", email: "ocr_minor@ocr-test.invalid", sport: "Soccer", stateCode: "MD", ageBand: "16_17", state: "ACTIVE", guardianId: "ocr_guardian" },
      { id: "ocr_x_ath", tenantId: X, slug: "ocr-x-ath", legalName: "Kim Park", displayName: "KIM", email: "ocr_x_athlete@ocr-test.invalid", sport: "Soccer", stateCode: "MD", ageBand: "18_PLUS", state: "ACTIVE" },
    ] });
    await prisma.user.createMany({ data: [
      { id: "ocr_cm", tenantId: T, clerkId: "ocr_cm", email: "ocr_cm@ocr-test.invalid", roles: ["CAMPAIGN_MGR"] },
      { id: "ocr_cm2", tenantId: T, clerkId: "ocr_cm2", email: "ocr_cm2@ocr-test.invalid", roles: ["CAMPAIGN_MGR"] },
      { id: "ocr_cm_off", tenantId: T, clerkId: "ocr_cm_off", email: "ocr_cm_off@ocr-test.invalid", roles: ["CAMPAIGN_MGR"], disabledAt: new Date() },
      { id: "ocr_admin", tenantId: T, clerkId: "ocr_admin", email: "ocr_admin@ocr-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "ocr_athlete", tenantId: T, clerkId: "ocr_athlete", email: "ocr_athlete@ocr-test.invalid", roles: ["ATHLETE"], athleteId: "ocr_ath" },
      { id: "ocr_athlete2", tenantId: T, clerkId: "ocr_athlete2", email: "ocr_athlete2@ocr-test.invalid", roles: ["ATHLETE"], athleteId: "ocr_ath2" },
      { id: "ocr_minor_user", tenantId: T, clerkId: "ocr_minor_user", email: "ocr_minor@ocr-test.invalid", roles: ["ATHLETE"], athleteId: "ocr_minor" },
      /* 2S1-BE-11 — the minor's guardian, who negotiates for them from their own login. */
      { id: "ocr_guardian_user", tenantId: T, clerkId: "ocr_guardian_user", email: "ocr_guardian@ocr-test.invalid", roles: ["GUARDIAN"], guardianId: "ocr_guardian" },
      { id: "ocr_x_admin", tenantId: X, clerkId: "ocr_x_admin", email: "ocr_x_admin@ocr-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "ocr_x_athlete", tenantId: X, clerkId: "ocr_x_athlete", email: "ocr_x_athlete@ocr-test.invalid", roles: ["ATHLETE"], athleteId: "ocr_x_ath" },
    ] });
    await prisma.offer.create({ data: offerRow("ocr_offer", T, "ocr_ath", "ocr_cm") });
    await prisma.offer.create({ data: offerRow("ocr_offer_minor", T, "ocr_minor", "ocr_cm") });
    await prisma.offer.create({ data: offerRow("ocr_offer_x", X, "ocr_x_ath", null) });
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await clean();
  });

  it("needs a note, of at most 2000 characters", async () => {
    expect((await call("POST", "/offers/ocr_offer/respond", "ocr_athlete", change())).status).toBe(422);
    expect((await call("POST", "/offers/ocr_offer/respond", "ocr_athlete", change("   "))).status).toBe(400);
    expect((await call("POST", "/offers/ocr_offer/respond", "ocr_athlete", change("x".repeat(2001)))).status).toBe(400);
    expect(await audits("ocr_offer")).toEqual([]);
    expect(await emails(T)).toEqual([]);
  });

  it("is refused for anyone but the athlete named on the offer", async () => {
    const note = "Can the second post move a week later?";
    expect((await call("POST", "/offers/ocr_offer/respond", "ocr_athlete2", change(note))).status).toBe(403); // another athlete
    expect((await call("POST", "/offers/ocr_offer/respond", "ocr_x_athlete", change(note))).status).toBe(403); // another tenant
    expect((await call("POST", "/offers/ocr_offer/respond", "ocr_cm", change(note))).status).toBe(403); // staff answer nothing
    expect((await call("POST", "/offers/ocr_offer/respond", "ocr_x_admin", change(note))).status).toBe(403);
    expect(await audits("ocr_offer")).toEqual([]);
    expect(await emails(T)).toEqual([]);
    expect(await prisma.offerChangeRequest.count({ where: { offerId: "ocr_offer" } })).toBe(0);
  });

  it("records the request, audits it and emails the campaign managers — without accepting or declining", async () => {
    const note = "Could the exclusivity be 14 days instead of 30?";
    const res = await call("POST", "/offers/ocr_offer/respond", "ocr_athlete", change(`  ${note}  `));
    expect(res.status).toBe(200);
    expect(res.json.state).toBe("SENT");
    expect(res.json.respondedAt).toBeNull();
    expect(res.json.orderId).toBeNull();
    expect(res.json.changeRequests).toEqual([expect.objectContaining({ note, requestedBy: "ocr_athlete" })]);
    expect(res.json).not.toHaveProperty("sellPrice"); // still the athlete's view
    expect(await prisma.campaignOrder.count({ where: { tenantId: T } })).toBe(0);

    /* Audited: who, the note, when. */
    const [row, ...more] = await audits("ocr_offer");
    expect(more).toEqual([]);
    expect(row).toMatchObject({ actorId: "ocr_athlete", tenantId: T, after: expect.objectContaining({ state: "SENT", note }) });

    /* Routed: the offer's author and the other active campaign manager — not
       the disabled one, not the admin (there are managers), not tenant X. */
    const sent = await emails(T);
    expect(sent.map((e) => e.to).sort()).toEqual(["ocr_cm2@ocr-test.invalid", "ocr_cm@ocr-test.invalid"]);
    expect(sent[0].data).toMatchObject({ athleteName: "JORDAN", sponsorName: "Rosa's Tacos", campaignName: "Fall tacos", note });
    expect(await emails(X)).toEqual([]);

    /* Visible to BTG where it reads offers. */
    const one = await call("GET", "/offers/ocr_offer", "ocr_cm");
    expect(one.json.changeRequests).toEqual([expect.objectContaining({ note, requestedBy: "ocr_athlete" })]);
    const list = await call("GET", "/offers", "ocr_admin");
    expect(list.json.offers.find((o: { id: string }) => o.id === "ocr_offer").changeRequests).toHaveLength(1);
    /* …and not to the other tenant. */
    expect((await call("GET", "/offers/ocr_offer", "ocr_x_admin")).status).toBe(403);

    /* Still answerable: a second request, then a decline, both work. */
    expect((await call("POST", "/offers/ocr_offer/respond", "ocr_athlete", change("Or 21 days?"))).json.changeRequests).toHaveLength(2);
    expect((await call("POST", "/offers/ocr_offer/respond", "ocr_athlete", { decision: "DECLINE" })).json.state).toBe("DECLINED");
    /* Once answered, there is nothing left to change. */
    expect((await call("POST", "/offers/ocr_offer/respond", "ocr_athlete", change("Too late?"))).status).toBe(409);
  });

  it("a minor's change request comes from their verified guardian, as accepting does (2S1-BE-11)", async () => {
    const note = "Can my guardian join the shoot?";
    /* The minor's own login is refused — the guardian negotiates for them. */
    const refused = await call("POST", "/offers/ocr_offer_minor/respond", "ocr_minor_user", change(note));
    expect(refused.status).toBe(403);
    expect(refused.json.error?.code ?? refused.json.code).toBe("guardian_must_act");
    expect(refused.text).toMatch(/guardian/i);
    expect(await audits("ocr_offer_minor")).toEqual([]);
    /* The guardian, unverified, cannot either — they don't act for the minor until verified (2S1-BE-14). */
    const unverified = await call("POST", "/offers/ocr_offer_minor/respond", "ocr_guardian_user", change(note));
    expect(unverified.status).toBe(403);
    expect(unverified.json.error?.code ?? unverified.json.code).toBe("guardian_not_verified");
    await prisma.guardian.update({ where: { id: "ocr_guardian" }, data: { verifiedAt: new Date() } });
    expect((await call("POST", "/offers/ocr_offer_minor/respond", "ocr_minor_user", change(note))).status).toBe(403);
    const ok = await call("POST", "/offers/ocr_offer_minor/respond", "ocr_guardian_user", change(note));
    expect(ok.status, ok.text).toBe(200);
    expect(ok.json.state).toBe("SENT");
  });

  it("with no campaign manager in the tenant, BTG's admins hear of it", async () => {
    const res = await call("POST", "/offers/ocr_offer_x/respond", "ocr_x_athlete", change("Different due date, please."));
    expect(res.status).toBe(200);
    expect((await emails(X)).map((e) => e.to)).toEqual(["ocr_x_admin@ocr-test.invalid"]);
  });
});
