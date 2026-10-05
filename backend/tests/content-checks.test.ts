import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   P5-BE-09 — automatic checks before BTG reviews content, and the 48-hour
   review reminders, against a real database through the HTTP API.

   - A failing draft goes back to the athlete with each failure in words, is
     emailed, and never reaches BTG's queue (not listed, not counted, cannot
     be picked up). A passing one reaches BTG as before, checks attached.
   - Disclosures ignore case. The file type is the presigned one.
   - Reminders: once each, after 48 hours and not before, BTG then sponsor;
     the sweep touches only the tenants it is given.
   - Cross-tenant and role checks on the touched routes.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@cc-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("P5-BE-09 · content checks and review reminders", async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { sweepReviewReminders } = await import("../src/domain/review-reminders");

  const T = "cc_tenant_a";
  const OTHER = "cc_tenant_b";
  const HOUR = 3_600_000;

  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  const call = async (method: string, path: string, who: string, body?: unknown) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: { "x-test-clerk": who, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null };
  };

  async function wipe() {
    const tables = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 6; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" IN ($1, $2)`, T, OTHER).catch(() => {});
      }
    }
    await prisma.tenant.deleteMany({ where: { id: { in: [T, OTHER] } } });
  }

  /** A tenant with an athlete, a sponsor, a campaign and the deliverables
   *  named in `deliverables` — on an order with an offer requiring #ad, or
   *  (ids starting "plain") on one with no offer. */
  async function seed(tenant: string, deliverables: string[]) {
    const p = (s: string) => `${tenant}_${s}`;
    await prisma.tenant.create({ data: { id: tenant, name: `CC ${tenant}` } });
    await prisma.sponsor.create({ data: { id: p("sponsor"), tenantId: tenant, name: `CC Sponsor ${tenant}` } });
    for (const a of ["ath", "ath2"]) {
      await prisma.athlete.create({ data: {
        id: p(a), tenantId: tenant, slug: p(a), legalName: `Casey ${a} ${tenant}`, displayName: `Casey ${a} ${tenant}`,
        sport: "Soccer", ageBand: "18_PLUS", state: "ACTIVE",
      } });
    }
    await prisma.nilJob.create({ data: {
      id: p("job"), tenantId: tenant, name: "CC reel", baseLow: 100, baseHigh: 150, sellLow: 200, sellHigh: 400,
      sellFloorEmerging: 210, sellFloorCreator: 263, sellFloorPremium: 315,
    } });
    await prisma.campaign.create({ data: {
      id: p("campaign"), tenantId: tenant, sponsorId: p("sponsor"), name: `CC campaign ${tenant}`, budget: 500_000,
      startDate: new Date("2026-10-01"), endDate: new Date("2026-12-31"), state: "ACTIVE",
    } });
    const order = (id: string, athleteId: string) => ({
      id: p(id), tenantId: tenant, campaignId: p("campaign"), athleteId: p(athleteId), jobId: p("job"),
      compensation: 10_000, sellPrice: 30_000, usageRights: "90 days", dueDate: new Date("2026-12-15"), state: "ACTIVE" as const,
    });
    await prisma.campaignOrder.create({ data: order("order", "ath") });
    await prisma.campaignOrder.create({ data: order("plain_order", "ath2") });
    await prisma.offer.create({ data: {
      id: p("offer"), tenantId: tenant, campaignId: p("campaign"), athleteId: p("ath"), jobId: p("job"), brief: "A reel",
      compensation: 10_000, sellPrice: 30_000, deliverables: [], usageRights: "90 days", disclosures: ["#ad"],
      expiresAt: new Date("2026-12-01"), state: "ACCEPTED", orderId: p("order"),
    } });
    for (const d of deliverables) {
      await prisma.deliverable.create({ data: {
        id: p(d), tenantId: tenant, orderId: p(d.startsWith("plain") ? "plain_order" : "order"), title: `Reel ${d}`, dueDate: new Date("2026-12-15"),
      } });
    }
    const users: Array<[string, string, Record<string, string>]> = [
      ["athlete", "ATHLETE", { athleteId: p("ath") }],
      ["athlete2", "ATHLETE", { athleteId: p("ath2") }],
      ["cm", "CAMPAIGN_MGR", {}],
      ["admin", "BTG_ADMIN", {}],
      ["sponsor_admin", "SPONSOR_ADMIN", { sponsorId: p("sponsor") }],
    ];
    for (const [id, role, extra] of users) {
      await prisma.user.create({ data: { id: p(id), tenantId: tenant, clerkId: p(id), email: `${p(id)}@cc-test.invalid`, roles: [role as never], ...extra } });
    }
  }

  const A = (s: string) => `${T}_${s}`;
  const B = (s: string) => `${OTHER}_${s}`;

  /** Presign as `contentType`, then record it — the way the athlete's page does. */
  async function upload(who: string, deliverableId: string, contentType: string) {
    const pre = await call("POST", `/deliverables/${deliverableId}/uploads`, who, { contentType, bytes: 48_213 });
    expect(pre.status).toBe(201);
    const reg = await call("POST", `/deliverables/${deliverableId}/assets`, who, { r2Key: pre.json.key });
    expect(reg.status).toBe(201);
    return reg.json as { version: number };
  }

  const emails = async (template: string) =>
    (await prisma.outboxJob.findMany({ where: { tenantId: { in: [T, OTHER] }, name: "notify.email" }, select: { payload: true } }))
      .map((j) => j.payload as { template: string; to: string; idempotencyKey: string; data: Record<string, string> })
      .filter((m) => m.template === template);

  const queue = async (who: string) =>
    ((await call("GET", "/deliverables?state=DRAFT_SUBMITTED,BTG_REVIEW,SPONSOR_REVIEW&systemReturned=exclude", who)).json.deliverables as { id: string }[]).map((d) => d.id);

  beforeAll(async () => {
    await wipe();
    await seed(T, ["good", "bad", "nofile", "plain1", "waits"]);
    await seed(OTHER, ["waits"]);
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await wipe();
  });

  it("records the file type the upload was presigned for", async () => {
    await upload(A("athlete"), A("good"), "video/mp4");
    const asset = await prisma.creativeAsset.findFirstOrThrow({ where: { tenantId: T, deliverableId: A("good") }, select: { contentType: true } });
    expect(asset.contentType).toBe("video/mp4");
  });

  it("the PUT is signed for that type and that size — 2S8-SEC-03: the size is required", async () => {
    const signed = (u: string) => new URL(u).searchParams.get("X-Amz-SignedHeaders");
    /* 2S8-SEC-03 — every private upload URL is signed for one type and one size; a grant without a size is refused. */
    const typed = await call("POST", `/deliverables/${A("good")}/uploads`, A("athlete"), { contentType: "image/png" });
    expect(typed.status, typed.text).toBe(400);
    const sized = await call("POST", `/deliverables/${A("good")}/uploads`, A("athlete"), { contentType: "image/png", bytes: 48_213 });
    expect(sized.status, sized.text).toBe(201);
    expect(signed(sized.json.url)).toBe("content-length;content-type;host");
    /* The grant records the size it was pinned to. */
    const grant = await prisma.auditLog.findFirstOrThrow({
      where: { tenantId: T, action: "storage.privateUploadGrant", entity: "Deliverable", entityId: A("good"), after: { path: ["key"], equals: sized.json.key } },
      select: { after: true },
    });
    expect(grant.after).toMatchObject({ contentType: "image/png", bytes: 48_213 });
    expect((await call("POST", `/deliverables/${A("good")}/uploads`, A("athlete"), { contentType: "image/png", bytes: 0 })).status).toBe(400);
  });

  it("a passing draft reaches BTG's queue with its checks, caption and wait — disclosures ignoring case", async () => {
    const r = await call("POST", `/deliverables/${A("good")}/submit`, A("athlete"), { caption: "Game day with the crew #AD" });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ state: "DRAFT_SUBMITTED", passed: true });
    expect(r.json.checks.map((c: { ok: boolean }) => c.ok)).toEqual([true, true, true]);

    expect(await queue(A("cm"))).toContain(A("good"));
    const d = (await call("GET", `/deliverables/${A("good")}`, A("cm"))).json;
    expect(d).toMatchObject({
      caption: "Game day with the crew #AD", captionVersion: 1, requiredDisclosures: ["#ad"], revision: null,
      checks: [
        { key: "file", ok: true, text: "File attached (version 1)" },
        { key: "fileType", ok: true, text: "File type allowed (MP4 video)" },
        { key: "disclosures", ok: true, text: "The caption includes #ad" },
      ],
    });
    expect(Date.parse(d.waitingSince)).toBeGreaterThan(Date.now() - HOUR);
    expect(await emails("deliverable.checksFailed")).toEqual([]);

    /* …and BTG picks it up exactly as before. */
    expect((await call("POST", `/deliverables/${A("good")}/btg-review`, A("cm"))).json).toMatchObject({ state: "BTG_REVIEW" });
  });

  it("a failing draft goes back to the athlete with each failure in words, is emailed, and never reaches BTG", async () => {
    await upload(A("athlete"), A("bad"), "application/pdf");
    const r = await call("POST", `/deliverables/${A("bad")}/submit`, A("athlete"), { caption: "Game day with the crew" });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ state: "DRAFT_SUBMITTED", passed: false });

    /* The athlete reads it as a revision from the system, in words. */
    const mine = (await call("GET", `/deliverables/${A("bad")}`, A("athlete"))).json;
    expect(mine.revision).toMatchObject({
      by: "SYSTEM",
      failed: [
        "The file type (application/pdf) isn't allowed — upload a JPG, PNG or WebP image, or an MP4 or MOV video",
        "The caption is missing #ad",
      ],
    });
    expect(mine.waitingSince).toBeNull();

    /* Emailed, once, listing the failures. */
    const mail = (await emails("deliverable.checksFailed")).filter((m) => m.data.portalUrl?.endsWith(A("bad")));
    expect(mail).toHaveLength(1);
    expect(mail[0]!.to).toBe(`${A("athlete")}@cc-test.invalid`);
    expect(mail[0]!.data.reasons).toContain("The caption is missing #ad");

    /* Audited as the system's revision, beside the athlete's submission. */
    const log = await prisma.auditLog.findMany({ where: { tenantId: T, entityId: A("bad") }, select: { action: true, actorId: true } });
    expect(log).toEqual(expect.arrayContaining([
      { action: "deliverable.submitDraft", actorId: A("athlete") },
      { action: "deliverable.systemRevision", actorId: null },
    ]));

    /* Never on BTG's queue: not listed, not counted, cannot be picked up. */
    expect(await queue(A("cm"))).not.toContain(A("bad"));
    const board = (await call("GET", "/operations/board", A("admin"))).json.queues.approvals.waiting;
    const pickUp = await call("POST", `/deliverables/${A("bad")}/btg-review`, A("cm"));
    expect(pickUp.status).toBe(409);
    expect(pickUp.json.error.message).toMatch(/automatic checks/);
    expect((await prisma.deliverable.findUniqueOrThrow({ where: { id: A("bad") }, select: { state: true } })).state).toBe("DRAFT_SUBMITTED");

    /* Fixed and resubmitted, it passes and reaches the queue — counted once more. */
    await upload(A("athlete"), A("bad"), "image/png");
    const again = await call("POST", `/deliverables/${A("bad")}/submit`, A("athlete"), { caption: "Fixed it #ad" });
    expect(again.json).toMatchObject({ passed: true });
    expect(await queue(A("cm"))).toContain(A("bad"));
    expect((await call("GET", "/operations/board", A("admin"))).json.queues.approvals.waiting).toBe(board + 1);
  });

  it("no file attached fails, and a caption is required when the offer requires a disclosure", async () => {
    const r = await call("POST", `/deliverables/${A("nofile")}/submit`, A("athlete"), {});
    expect(r.json.passed).toBe(false);
    expect(r.json.checks.filter((c: { ok: boolean }) => !c.ok).map((c: { text: string }) => c.text)).toEqual([
      "No file attached",
      "No file, so its type can't be checked",
      "The caption is missing — it must include #ad",
    ]);
  });

  it("an order without an offer requires no disclosure — a captionless draft passes", async () => {
    await upload(A("athlete2"), A("plain1"), "image/jpeg");
    const r = await call("POST", `/deliverables/${A("plain1")}/submit`, A("athlete2"));
    expect(r.json).toMatchObject({ passed: true });
    expect(r.json.checks[2]).toEqual({ key: "disclosures", ok: true, text: "No disclosures required by the offer" });
  });

  it("a draft already in BTG's queue can't be resubmitted, and takes no new version until it comes back", async () => {
    const r = await call("POST", `/deliverables/${A("plain1")}/submit`, A("athlete2"), { caption: "again" });
    expect(r.status).toBe(409);
    expect((await call("POST", `/deliverables/${A("plain1")}/uploads`, A("athlete2"), { contentType: "image/png", bytes: 48_213 })).status).toBe(409);
    /* A reviewer's revision hands it back: a new version, then a resubmission, answer it. */
    await call("POST", `/deliverables/${A("plain1")}/btg-review`, A("cm"));
    expect((await call("POST", `/deliverables/${A("plain1")}/uploads`, A("athlete2"), { contentType: "image/png", bytes: 48_213 })).status).toBe(409);
    expect((await call("POST", `/deliverables/${A("plain1")}/revision`, A("cm"), { reason: "Brighter, please" })).status).toBe(200);
    const back = (await call("GET", `/deliverables/${A("plain1")}`, A("athlete2"))).json;
    expect(back.revision).toMatchObject({ by: "REVIEWER", reason: "Brighter, please" });
    await upload(A("athlete2"), A("plain1"), "image/png");
    /* An upload alone does not answer it under the checks — the resubmission does. */
    expect((await call("GET", `/deliverables/${A("plain1")}`, A("athlete2"))).json.revision).toMatchObject({ by: "REVIEWER" });
    expect((await call("POST", `/deliverables/${A("plain1")}/submit`, A("athlete2"))).json).toMatchObject({ passed: true });
    expect((await call("GET", `/deliverables/${A("plain1")}`, A("athlete2"))).json.revision).toBeNull();
  });

  it("only the athlete submits, and never across tenants", async () => {
    expect((await call("POST", `/deliverables/${A("waits")}/submit`, A("sponsor_admin"), {})).status).toBe(403);
    expect((await call("POST", `/deliverables/${A("waits")}/submit`, B("athlete"), {})).status).toBe(403);
    expect((await call("GET", `/deliverables/${A("good")}`, B("cm"))).status).toBe(403);
    expect((await call("POST", `/deliverables/${A("bad")}/btg-review`, B("cm"))).status).toBe(403);
    /* A caption past the limit is refused, not truncated. */
    expect((await call("POST", `/deliverables/${A("waits")}/submit`, A("athlete"), { caption: "x".repeat(2201) })).status).toBe(400);
    /* Another tenant's queue never lists this tenant's drafts. */
    expect(await queue(B("cm"))).not.toContain(A("good"));
    expect((await prisma.deliverable.findUniqueOrThrow({ where: { id: A("waits") }, select: { state: true } })).state).toBe("NOT_STARTED");
  });

  it("reminds BTG's campaign managers once after 48 hours, then the sponsor's admins once — scoped by tenant", async () => {
    /* Both tenants have a draft waiting on BTG. */
    for (const [who, id] of [[A("athlete"), A("waits")], [B("athlete"), B("waits")]] as const) {
      await upload(who, id, "video/quicktime");
      expect((await call("POST", `/deliverables/${id}/submit`, who, { caption: "#ad" })).json.passed).toBe(true);
    }
    const since = (await prisma.deliverable.findUniqueOrThrow({ where: { id: A("waits") }, select: { reviewWaitingSince: true } })).reviewWaitingSince!;
    const after = (h: number) => new Date(since.getTime() + h * HOUR);

    /* Not before 48 hours. */
    expect(await sweepReviewReminders(after(47), { tenantIds: [T] })).toMatchObject({ btg: 0, sponsor: 0 });
    expect(await remindersFor("deliverable.btgReviewReminder", A("waits"))).toEqual([]);

    /* After it: BTG's campaign manager, once — picking it up does not restart the wait. */
    await call("POST", `/deliverables/${A("waits")}/btg-review`, A("cm"));
    await sweepReviewReminders(after(49), { tenantIds: [T] });
    await sweepReviewReminders(after(60), { tenantIds: [T] });
    const btg = await remindersFor("deliverable.btgReviewReminder", A("waits"));
    expect(btg.map((m) => m.to)).toEqual([`${A("cm")}@cc-test.invalid`]);
    expect(btg[0]!.data).toMatchObject({ title: "Reel waits", waited: "2 days" });

    /* The sweep was scoped: the other tenant's draft, just as old, was not reminded. */
    expect(await remindersFor("deliverable.btgReviewReminder", B("waits"))).toEqual([]);
    expect((await prisma.deliverable.findUniqueOrThrow({ where: { id: B("waits") }, select: { reviewRemindedAt: true } })).reviewRemindedAt).toBeNull();

    /* Sent to the sponsor: a new wait, the sponsor's admin, once. */
    await call("POST", `/deliverables/${A("waits")}/sponsor-review`, A("cm"));
    const sponsorSince = (await prisma.deliverable.findUniqueOrThrow({ where: { id: A("waits") }, select: { reviewWaitingSince: true } })).reviewWaitingSince!;
    const sponsorAfter = (h: number) => new Date(sponsorSince.getTime() + h * HOUR);
    await sweepReviewReminders(sponsorAfter(40), { tenantIds: [T] });
    expect(await remindersFor("deliverable.sponsorReviewReminder", A("waits"))).toEqual([]);
    await sweepReviewReminders(sponsorAfter(50), { tenantIds: [T] });
    await sweepReviewReminders(sponsorAfter(70), { tenantIds: [T] });
    const sponsor = await remindersFor("deliverable.sponsorReviewReminder", A("waits"));
    expect(sponsor.map((m) => m.to)).toEqual([`${A("sponsor_admin")}@cc-test.invalid`]);
    expect(await remindersFor("deliverable.btgReviewReminder", A("waits"))).toHaveLength(1);

    /* The sponsor's read shows the caption and the wait. */
    const seen = (await call("GET", `/deliverables/${A("waits")}`, A("sponsor_admin"))).json;
    expect(seen).toMatchObject({ caption: "#ad", waitingSince: sponsorSince.toISOString() });

    /* Leaving review clears the wait; nothing more is sent. */
    await call("POST", `/deliverables/${A("waits")}/approve`, A("sponsor_admin"));
    expect(await prisma.deliverable.findUniqueOrThrow({ where: { id: A("waits") }, select: { reviewWaitingSince: true, reviewRemindedAt: true } }))
      .toEqual({ reviewWaitingSince: null, reviewRemindedAt: null });
    expect(await sweepReviewReminders(sponsorAfter(200), { tenantIds: [T] })).toMatchObject({ btg: 0, sponsor: 0 });
  });

  it("a draft the checks sent back is never reminded about", async () => {
    expect(await sweepReviewReminders(new Date(Date.now() + 500 * HOUR), { tenantIds: [T] })).toMatchObject({ failed: 0 });
    expect(await remindersFor("deliverable.btgReviewReminder", A("nofile"))).toEqual([]);
  });

  async function remindersFor(template: string, id: string) {
    return (await emails(template)).filter((m) => m.idempotencyKey.includes(`:${id}:`));
  }
});
