import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   2S1-BE-11 — the guardian acts for the minor; and 2S1-BE-12's coming of
   age. Against the real API and database. Done when:

   BE-11  For a minor, only the guardian can accept, list, set up payouts or
          request a payout, and the minor's login is refused for each (tested
          route by route); the minor can upload content and the guardian is
          emailed for every upload; an adult's account is unaffected.
   BE-12  During the 90-day allowance neither the athlete nor the guardian
          can add items or start a new transaction while existing orders and
          campaigns continue, a reminder persists on both portals, and
          reminder emails go out at the start and 30, 14, 7 and 1 days before
          the end; uploading a government ID moves control from the guardian
          to the athlete; if it isn't done in 90 days both accounts are
          terminated (only the guardian's link ends when they have other
          minors), under the 30-day retention and reactivation rules.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

const { uploaded } = vi.hoisted(() => ({ uploaded: new Set<string>() }));
vi.mock("../src/lib/storage", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/lib/storage")>();
  return { ...real, checkPrivateUpload: async (_actor: unknown, key: string) => (uploaded.has(key) ? { ok: true as const, bytes: 20_480 } : { ok: false as const, problem: "missing" as const }) };
});
vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
/* The test's NIL job isn't one of the catalogue's: give it a one-post template. */
vi.mock("../src/domain/deliverable-template", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/domain/deliverable-template")>();
  return { ...real, deliverablesForOrder: (i: { dueDate: Date }) => [{ title: "Feed post", dueDate: i.dueDate }] };
});
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@ga-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

const DAY = 86_400_000;
const birth = (years: number, days = 0) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return new Date(d.getTime() - days * DAY);
};

describe.skipIf(!hasDatabase)("2S1-BE-11 / -12 · the guardian acts for the minor; coming of age", { timeout: 120_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { sweepComingOfAge } = await import("../src/domain/coming-of-age");

  const T = "ga_btg";
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- response bodies are asserted field by field
  type Res = { status: number; text: string; json: any };
  const call = async (method: string, path: string, clerk?: string, body?: unknown, ward?: string): Promise<Res> => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: { "content-type": "application/json", ...(clerk ? { "x-test-clerk": clerk } : {}), ...(ward ? { "x-sponsorx-ward": ward } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };
  const code = (r: Res) => r.json?.error?.code;
  const emails = async () => (await prisma.outboxJob.findMany({ where: { tenantId: T, name: "notify.email" }, select: { payload: true }, orderBy: { createdAt: "asc" } }))
    .map((j) => j.payload as { template: string; to: string; data: Record<string, string>; idempotencyKey: string });
  const mailTo = async (template: string, to: string) => (await emails()).filter((m) => m.template === template && m.to === to);
  const GE = "ga_guardian@ga-test.invalid";

  async function clean() {
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    await prisma.$executeRawUnsafe(`DELETE FROM "PayoutLine" WHERE "payoutId" IN (SELECT id FROM "Payout" WHERE "tenantId" = $1)`, T).catch(() => {});
    for (let pass = 0; pass < 6; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = $1`, T).catch(() => {});
      }
    }
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  const ath = (id: string, extra: Record<string, unknown>) => ({
    id, tenantId: T, slug: `ga-${id}`, legalName: `${id[3]!.toUpperCase()}${id.slice(4)} Reyes`, displayName: id.toUpperCase(),
    email: `${id}@ga-test.invalid`, sport: "Basketball", stateCode: "MD", state: "ACTIVE" as const, emailConfirmedAt: new Date(), ...extra,
  });

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "GA BTG" } });
    await prisma.guardian.createMany({ data: [
      { id: "ga_g", tenantId: T, legalName: "Carmen Reyes", email: GE, relationship: "PARENT", verifiedAt: new Date(), emailConfirmedAt: new Date() },
      { id: "ga_h", tenantId: T, legalName: "Hal Ortiz", email: "ga_h@ga-test.invalid", relationship: "PARENT", verifiedAt: new Date(), emailConfirmedAt: new Date() },
    ] });
    await prisma.athlete.createMany({ data: [
      ath("ga_jordan", { birthDate: birth(16), guardianId: "ga_g" }),
      ath("ga_casey", { birthDate: birth(18, 2), guardianId: "ga_g" }),
      ath("ga_dana", { birthDate: birth(18, 3), guardianId: "ga_g" }),
      ath("ga_eli", { birthDate: birth(18, 4), guardianId: "ga_h" }),
      ath("ga_adult", { birthDate: birth(25) }),
    ] });
    await prisma.user.createMany({ data: [
      { id: "ga_admin", tenantId: T, clerkId: "ga_admin", email: "ga_admin@ga-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "ga_guardian", tenantId: T, clerkId: "ga_guardian", email: GE, roles: ["GUARDIAN"], guardianId: "ga_g" },
      { id: "ga_hal", tenantId: T, clerkId: "ga_hal", email: "ga_h@ga-test.invalid", roles: ["GUARDIAN"], guardianId: "ga_h" },
      ...["jordan", "casey", "dana", "eli", "adult"].map((n) => ({ id: `ga_u_${n}`, tenantId: T, clerkId: `ga_u_${n}`, email: `ga_${n}@ga-test.invalid`, roles: ["ATHLETE" as const], athleteId: `ga_${n}` })),
    ] });
    await prisma.sponsor.create({ data: { id: "ga_sponsor", tenantId: T, name: "Harbor Coffee", categories: ["RESTAURANT"] } });
    await prisma.nilJob.create({ data: { id: "ga_job2", tenantId: T, name: "Reel", baseLow: 10_000, baseHigh: 20_000, sellLow: 20_000, sellHigh: 40_000, sellFloorEmerging: 15_000, sellFloorCreator: 20_000, sellFloorPremium: 30_000 } });
    await prisma.nilJob.create({ data: { id: "ga_job", tenantId: T, name: "Post", baseLow: 10_000, baseHigh: 20_000, sellLow: 20_000, sellHigh: 40_000, sellFloorEmerging: 15_000, sellFloorCreator: 20_000, sellFloorPremium: 30_000 } });
    await prisma.campaign.create({ data: { id: "ga_campaign", tenantId: T, sponsorId: "ga_sponsor", name: "Fall", budget: 500_000, startDate: new Date(), endDate: new Date(Date.now() + 90 * DAY), state: "STAFFING" } });
    await prisma.agreement.create({ data: { id: "ga_collab", tenantId: T, kind: "COLLAB", version: 1, bodyHash: "d".repeat(64), effectiveAt: new Date("2026-01-01") } });
    await prisma.agreement.create({ data: { id: "ga_terms", tenantId: T, kind: "CAMPAIGN_ORDER", version: 1, bodyHash: "c".repeat(64), effectiveAt: new Date("2026-01-01") } });
    for (const who of ["ga_jordan", "ga_adult"]) {
      await prisma.campaignInvite.create({ data: { id: `${who}_invite`, tenantId: T, campaignId: "ga_campaign", athleteId: who, jobId: "ga_job", offered: 20_000, state: "VIEWED", expiresAt: new Date(Date.now() + 7 * DAY) } });
    }
    await prisma.campaignOrder.create({ data: { id: "ga_order", tenantId: T, campaignId: "ga_campaign", athleteId: "ga_jordan", jobId: "ga_job", compensation: 20_000, sellPrice: 40_000, usageRights: "90 days", dueDate: new Date(Date.now() + 30 * DAY), state: "SENT" } });
    await prisma.campaignOrder.create({ data: { id: "ga_live_order", tenantId: T, campaignId: "ga_campaign", athleteId: "ga_jordan", jobId: "ga_job2", compensation: 10_000, sellPrice: 20_000, usageRights: "90 days", dueDate: new Date(Date.now() + 30 * DAY), state: "ACTIVE" } });
    await prisma.deliverable.create({ data: { id: "ga_deliv", tenantId: T, orderId: "ga_live_order", title: "Game-day reel", dueDate: new Date(Date.now() + 14 * DAY) } });
    await prisma.offer.create({ data: {
      id: "ga_offer", tenantId: T, campaignId: "ga_campaign", athleteId: "ga_jordan", jobId: "ga_job", brief: "Post twice.", compensation: 20_000, sellPrice: 40_000,
      deliverables: [{ title: "Feed post", dueDate: new Date(Date.now() + 14 * DAY).toISOString() }], usageRights: "90 days", disclosures: ["#ad"],
      expiresAt: new Date(Date.now() + 7 * DAY), state: "SENT", sentAt: new Date(), termsHash: "a".repeat(64), createdBy: "ga_admin",
    } });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server?.close();
    await clean();
  });

  /* ─────────────────── 2S1-BE-11, route by route ───────────────────────── */

  const J = "ga_jordan";
  let jordanItem = "";

  it("the portals know who acts: the minor sees their guardian; the guardian acts for their minor", async () => {
    const minor = await call("GET", "/me", "ga_u_jordan");
    expect(minor.json).toMatchObject({ roles: ["ATHLETE"], guardianControl: { guardianName: "Carmen Reyes" } });
    const g = await call("GET", "/me", "ga_guardian", undefined, J);
    expect(g.json).toMatchObject({ roles: ["GUARDIAN"], actingFor: J });
    expect(g.json.wards.map((w: { athleteId: string }) => w.athleteId)).toEqual(expect.arrayContaining([J]));
  });

  it("listing an item: the minor is refused; the guardian adds it, for the minor", async () => {
    const body = { title: "Shooting clinic", kind: "OTHER", priceCents: 50_000 };
    const refused = await call("POST", "/inventory", "ga_u_jordan", body);
    expect(refused.status, refused.text).toBe(403);
    expect(code(refused)).toBe("guardian_must_act");
    expect(refused.text).toMatch(/Carmen Reyes/);
    const ok = await call("POST", "/inventory", "ga_guardian", body, J);
    expect(ok.status, ok.text).toBe(201);
    expect(ok.json.athleteId).toBe(J);
    jordanItem = ok.json.id;
    /* The audit names the guardian's own login. */
    expect((await prisma.auditLog.findFirst({ where: { tenantId: T, action: "inventory.create", entityId: jordanItem }, select: { actorId: true } }))?.actorId).toBe("ga_guardian");
    expect(code(await call("PATCH", `/inventory/${jordanItem}`, "ga_u_jordan", { priceCents: 45_000 }))).toBe("guardian_must_act");
    expect((await call("PATCH", `/inventory/${jordanItem}`, "ga_guardian", { priceCents: 45_000 }, J)).status).toBe(200);
  });

  it("creating a listing: the minor is refused; the guardian lists it", async () => {
    const body = { inventoryItemId: jordanItem, title: "Clinic with Jordan" };
    expect(code(await call("POST", "/listings", "ga_u_jordan", body))).toBe("guardian_must_act");
    const ok = await call("POST", "/listings", "ga_guardian", body, J);
    expect(ok.status, ok.text).toBe(201);
    expect(ok.json).toMatchObject({ state: "DRAFT" });
  });

  it("the payout account: the minor is refused; the guardian sets it up", async () => {
    expect(code(await call("POST", "/payouts/account/link", "ga_u_jordan", { returnPath: "/athlete" }))).toBe("guardian_must_act");
    const ok = await call("POST", "/payouts/account/link", "ga_guardian", { returnPath: "/athlete" }, J);
    expect(ok.status, ok.text).toBe(200);
    expect(ok.json.url).toBeTruthy();
    expect(await prisma.payoutAccount.count({ where: { payeeType: "ATHLETE", payeeId: J } })).toBe(1);
  });

  it("requesting a payout: the minor is refused; the guardian's request reaches the payout rules", async () => {
    expect(code(await call("POST", "/payouts", "ga_u_jordan"))).toBe("guardian_must_act");
    const g = await call("POST", "/payouts", "ga_guardian", undefined, J);
    expect(g.status, g.text).toBe(409);
    expect(code(g)).not.toBe("guardian_must_act");
  });

  it("accepting an invitation: the minor is refused; the guardian accepts", async () => {
    expect(code(await call("POST", `/invitations/${J}_invite/respond`, "ga_u_jordan", { to: "ACCEPTED" }))).toBe("guardian_must_act");
    const ok = await call("POST", `/invitations/${J}_invite/respond`, "ga_guardian", { to: "ACCEPTED" }, J);
    expect(ok.status, ok.text).toBe(200);
    expect(ok.json.state).toBe("ACCEPTED");
  });

  it("accepting a Campaign Order: the minor is refused; the guardian signs, and the acceptance records them", async () => {
    const body = { agreementId: "ga_terms", bodyHashShown: "c".repeat(64) };
    expect(code(await call("POST", "/orders/ga_order/accept", "ga_u_jordan", body))).toBe("guardian_must_act");
    const ok = await call("POST", "/orders/ga_order/accept", "ga_guardian", body, J);
    expect(ok.status, ok.text).toBe(201);
    const acc = await prisma.agreementAcceptance.findUniqueOrThrow({ where: { id: ok.json.acceptanceId }, select: { userId: true, guardianId: true } });
    expect(acc).toEqual({ userId: "ga_guardian", guardianId: "ga_g" });
  });

  it("accepting an agreement or an offer: the minor is refused; the guardian gets past the guard", async () => {
    const collab = { agreementId: "ga_collab", bodyHashShown: "d".repeat(64) };
    expect(code(await call("POST", "/agreements/accept", "ga_u_jordan", collab))).toBe("guardian_must_act");
    const accepted = await call("POST", "/agreements/accept", "ga_guardian", collab, J);
    expect(accepted.status, accepted.text).toBe(201);
    expect(accepted.json.guardianId).toBe("ga_g");
    const offer = { decision: "ACCEPT", termsHashShown: "b".repeat(64), agreementId: "ga_terms", bodyHashShown: "c".repeat(64) };
    expect(code(await call("POST", "/offers/ga_offer/respond", "ga_u_jordan", offer))).toBe("guardian_must_act");
    /* The guardian is let through to the offer's own checks — here, terms not as shown. */
    const g = await call("POST", "/offers/ga_offer/respond", "ga_guardian", offer, J);
    expect(g.status, g.text).toBe(409);
    expect(g.text).toMatch(/terms shown/);
    /* Declining is not an agreement: the minor may. */
    expect((await call("POST", "/offers/ga_offer/respond", "ga_u_jordan", { decision: "DECLINE" })).status).toBe(200);
  });

  it("the minor uploads their own content, and the guardian is emailed for every upload", async () => {
    for (const n of [1, 2]) {
      const r = await call("POST", "/deliverables/ga_deliv/assets", "ga_u_jordan", { r2Key: `t/${T}/deliverable/ga_deliv/clip-${n}` });
      expect(r.status, r.text).toBe(201);
    }
    const mail = await mailTo("guardian.contentUploaded", GE);
    expect(mail).toHaveLength(2);
    expect(mail[0]!.data).toMatchObject({ athleteFirstName: "Jordan", what: "Game-day reel" });
  });

  it("an adult's own account is unaffected", async () => {
    expect((await call("POST", "/inventory", "ga_u_adult", { title: "Camp", kind: "OTHER", priceCents: 20_000 })).status).toBe(201);
    expect((await call("POST", "/invitations/ga_adult_invite/respond", "ga_u_adult", { to: "ACCEPTED" })).status).toBe(200);
    expect((await call("GET", "/me", "ga_u_adult")).json.guardianControl).toBeNull();
  });

  it("a guardian acts only for their own minors — a header naming another athlete acts for nobody", async () => {
    const r = await call("POST", "/inventory", "ga_guardian", { title: "X", kind: "OTHER", priceCents: 100 }, "ga_adult");
    expect(r.status).toBe(403);
    expect((await call("POST", "/inventory", "ga_hal", { title: "X", kind: "OTHER", priceCents: 100 }, J)).status).toBe(403);
  });

  /* ─────────────────── 2S1-BE-12 · coming of age ───────────────────────── */

  const now = new Date();
  it("reaching the age of majority opens a 90-day allowance; both are emailed, and both portals show the reminder", async () => {
    /* Narrowed to this file's tenant (2S8-QA-04): run platform-wide with the
       clock moved 91 days on, this sweep started, reminded and terminated
       phase2-merge-gaps' athletes too (traced 2026-10-02). Still assert on
       this file's athletes, never on a count. */
    await sweepComingOfAge(now, { tenantIds: [T] });
    const casey = await prisma.athlete.findUniqueOrThrow({ where: { id: "ga_casey" }, select: { comingOfAgeStartedAt: true, comingOfAgeDueAt: true, comingOfAgeReminders: true } });
    expect(casey.comingOfAgeDueAt!.getTime() - casey.comingOfAgeStartedAt!.getTime()).toBe(90 * DAY);
    expect(casey.comingOfAgeReminders).toEqual([90]);
    expect(await mailTo("comingOfAge.started", "ga_casey@ga-test.invalid")).toHaveLength(1);
    expect((await mailTo("comingOfAge.started", GE)).length).toBeGreaterThanOrEqual(2);
    /* Jordan, still 16, is untouched. */
    expect((await prisma.athlete.findUniqueOrThrow({ where: { id: J }, select: { comingOfAgeStartedAt: true } })).comingOfAgeStartedAt).toBeNull();

    const mine = await call("GET", "/coming-of-age/mine", "ga_u_casey");
    expect(mine.json.comingOfAge).toMatchObject({ seat: "athlete", athleteFirstName: "Casey", ageOfMajority: 18, uploadPath: expect.stringMatching(/^\/coming-of-age\//) });
    const theirs = await call("GET", "/coming-of-age/mine", "ga_guardian", undefined, "ga_casey");
    expect(theirs.json.comingOfAge).toMatchObject({ seat: "guardian", uploadPath: null });
    expect((await call("GET", "/coming-of-age/mine", "ga_u_jordan")).json.comingOfAge).toBeNull();
  });

  it("during the allowance nothing new is started by either, and existing work carries on", async () => {
    const item = { title: "New camp", kind: "OTHER", priceCents: 10_000 };
    expect(code(await call("POST", "/inventory", "ga_guardian", item, "ga_casey"))).toBe("coming_of_age_paused");
    expect(code(await call("POST", "/payouts", "ga_guardian", undefined, "ga_casey"))).toBe("coming_of_age_paused");
    /* The athlete hasn't taken over yet: control is still the guardian's. */
    expect(code(await call("POST", "/inventory", "ga_u_casey", item))).toBe("guardian_must_act");
    /* Existing items stay manageable, and the payout account isn't new business. */
    const existing = await prisma.inventoryItem.create({ data: { tenantId: T, athleteId: "ga_casey", title: "Old camp", kind: "OTHER", priceCents: 5_000 }, select: { id: true } });
    expect((await call("PATCH", `/inventory/${existing.id}`, "ga_guardian", { priceCents: 6_000 }, "ga_casey")).status).toBe(200);
    expect((await call("POST", "/payouts/account/link", "ga_guardian", { returnPath: "/athlete" }, "ga_casey")).status).toBe(200);
  });

  it("the guardian sends the athlete the link; reminders go out 30, 14, 7 and 1 days before the end, once each", async () => {
    const sent = await call("POST", "/coming-of-age/send-link", "ga_guardian", undefined, "ga_casey");
    expect(sent.status, sent.text).toBe(200);
    expect(await mailTo("comingOfAge.uploadLink", "ga_casey@ga-test.invalid")).toHaveLength(1);
    for (const [day, expected] of [[61, [90, 30]], [61, [90, 30]], [77, [90, 30, 14]], [84, [90, 30, 14, 7]], [89.5, [90, 30, 14, 7, 1]]] as const) {
      await sweepComingOfAge(new Date(now.getTime() + day * DAY), { tenantIds: [T] });
      const a = await prisma.athlete.findUniqueOrThrow({ where: { id: "ga_casey" }, select: { comingOfAgeReminders: true } });
      expect(a.comingOfAgeReminders, `day ${day}`).toEqual(expected);
    }
    const reminders = await mailTo("comingOfAge.reminder", "ga_casey@ga-test.invalid");
    expect(reminders.map((m) => m.idempotencyKey.split(":")[2])).toEqual(["30", "14", "7", "1"]);
    expect((await mailTo("comingOfAge.reminder", GE)).filter((m) => m.idempotencyKey.includes("ga_casey"))).toHaveLength(4);
  });

  it("uploading a government ID moves control from the guardian to the athlete", async () => {
    const link = (await mailTo("comingOfAge.uploadLink", "ga_casey@ga-test.invalid"))[0]!.data.uploadUrl!;
    const token = decodeURIComponent(link.split("/coming-of-age/")[1]!);
    const page = await call("GET", `/public/coming-of-age/${encodeURIComponent(token)}`);
    expect(page.json).toMatchObject({ athleteFirstName: "Casey", window: "allowance", idUploaded: false });
    const up = await call("POST", `/public/coming-of-age/${encodeURIComponent(token)}/documents`, undefined, { filename: "license.jpg", contentType: "image/jpeg", bytes: 20_480 });
    expect(up.status, up.text).toBe(201);
    uploaded.add((await prisma.accountDocument.findUniqueOrThrow({ where: { id: up.json.document.id }, select: { r2Key: true } })).r2Key);
    const done = await call("POST", `/public/coming-of-age/${encodeURIComponent(token)}/documents/${up.json.document.id}/confirm`);
    expect(done.status, done.text).toBe(200);
    expect(done.json).toMatchObject({ idUploaded: true, window: "done" });
    expect(await prisma.athlete.findUniqueOrThrow({ where: { id: "ga_casey" }, select: { guardianId: true, comingOfAgeCompletedAt: true } })).toMatchObject({ guardianId: null, comingOfAgeCompletedAt: expect.any(Date) });
    expect(await mailTo("comingOfAge.completed", GE)).toHaveLength(1);
    /* Casey now acts for themselves; the guardian no longer can. */
    expect((await call("POST", "/inventory", "ga_u_casey", { title: "My camp", kind: "OTHER", priceCents: 10_000 })).status).toBe(201);
    expect((await call("GET", "/coming-of-age/mine", "ga_u_casey")).json.comingOfAge).toBeNull();
    expect((await call("GET", "/me", "ga_guardian", undefined, "ga_casey")).json.actingFor).toBeNull();
  });

  it("90 days without the ID: both accounts end — but a guardian with other minors keeps theirs, only the link ends", async () => {
    await sweepComingOfAge(new Date(now.getTime() + 91 * DAY), { tenantIds: [T] });
    /* Dana (Carmen still looks after Jordan): Dana ends, Carmen stays. */
    expect(await prisma.athlete.findUniqueOrThrow({ where: { id: "ga_dana" }, select: { state: true, guardianId: true, comingOfAgeTerminatedAt: true } }))
      .toMatchObject({ state: "SUSPENDED", guardianId: null, comingOfAgeTerminatedAt: expect.any(Date) });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: "ga_u_dana" }, select: { disabledAt: true } })).disabledAt).not.toBeNull();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: "ga_guardian" }, select: { disabledAt: true } })).disabledAt).toBeNull();
    expect((await call("GET", "/me", "ga_guardian", undefined, J)).json.actingFor).toBe(J);
    /* Eli (Hal's only minor): both end. */
    expect((await prisma.athlete.findUniqueOrThrow({ where: { id: "ga_eli" }, select: { state: true } })).state).toBe("SUSPENDED");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: "ga_hal" }, select: { disabledAt: true } })).disabledAt).not.toBeNull();
    expect((await mailTo("comingOfAge.terminated", "ga_eli@ga-test.invalid"))[0]?.data.seat).toBe("athlete");
    expect((await mailTo("comingOfAge.btgSettle", "ga_admin@ga-test.invalid")).length).toBeGreaterThanOrEqual(2);
  });

  it("…under the 30-day retention rule: a government ID within 30 days brings the account back", async () => {
    const link = (await mailTo("comingOfAge.terminated", "ga_eli@ga-test.invalid"))[0]!.data.uploadUrl!;
    const token = decodeURIComponent(link.split("/coming-of-age/")[1]!);
    expect((await call("GET", `/public/coming-of-age/${encodeURIComponent(token)}`)).json.window).toBe("reactivate");
    const up = await call("POST", `/public/coming-of-age/${encodeURIComponent(token)}/documents`, undefined, { filename: "id.pdf", contentType: "application/pdf", bytes: 20_480 });
    uploaded.add((await prisma.accountDocument.findUniqueOrThrow({ where: { id: up.json.document.id }, select: { r2Key: true } })).r2Key);
    expect((await call("POST", `/public/coming-of-age/${encodeURIComponent(token)}/documents/${up.json.document.id}/confirm`)).status).toBe(200);
    expect((await prisma.athlete.findUniqueOrThrow({ where: { id: "ga_eli" }, select: { state: true } })).state).toBe("ACTIVE");
    expect((await call("GET", "/me", "ga_u_eli")).status).toBe(200);
    /* And past 30 days the link no longer works. */
    await prisma.athlete.update({ where: { id: "ga_dana" }, data: { comingOfAgeTerminatedAt: new Date(Date.now() - 31 * DAY) } });
    const danaLink = (await mailTo("comingOfAge.terminated", "ga_dana@ga-test.invalid"))[0]!.data.uploadUrl!;
    const danaToken = decodeURIComponent(danaLink.split("/coming-of-age/")[1]!);
    expect((await call("GET", `/public/coming-of-age/${encodeURIComponent(danaToken)}`)).json.window).toBe("expired");
    expect((await call("POST", `/public/coming-of-age/${encodeURIComponent(danaToken)}/documents`, undefined, { filename: "id.pdf", contentType: "application/pdf", bytes: 20_480 })).status).toBe(409);
  });
});
