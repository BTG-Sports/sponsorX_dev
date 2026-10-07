import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
/* 2S8-SEC-03 — registering a creative or artwork upload HEADs the object.
   There is no bucket here, so the file stands in as arrived exactly as its
   grant pinned it; tests/private-upload-pins.test.ts checks the real thing. */
vi.mock("../src/lib/storage", async (original) => ({
  ...(await original<typeof import("../src/lib/storage")>()),
  checkPrivateUpload: async (_actor: unknown, _key: string, expected: { bytes?: number | null }) => ({ ok: true as const, bytes: expected.bytes ?? 1 }),
}));

/* --------------------------------------------------------------------------
   P5-BE-10 — BTG's content review skipped for trusted drafts, against a real
   database through the HTTP API.

   - A trusted adult athlete's passing draft skips straight to the sponsor:
     moved by the system, audited with the reason, once.
   - Untrusted, a minor, an unknown age, a sensitive category (sponsor or
     brief), a sponsor with no reviewer: BTG reviews it as before.
   - A BTG revision — on a skipped draft, while it is with the sponsor —
     resets the streak, and that deliverable goes to BTG from then on. The
     system's revisions and the sponsor's do not count.
   - A failing draft still goes back to the athlete. Reminders for a skipped
     draft go to the sponsor. Reads: btgReviewSkipped, skipReason (BTG only),
     ?btgSkipped=only, the summary count, and contentTrust on BTG's view of
     the athlete. Cross-tenant and role checks.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@ctr-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("P5-BE-10 · trusted drafts skip BTG's content review", async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { sweepReviewReminders } = await import("../src/domain/review-reminders");

  const T = "ctr_tenant_a";
  const OTHER = "ctr_tenant_b";
  const HOUR = 3_600_000;
  const TRUSTED = "Trusted: last 3 drafts approved without changes";

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

  const ATHLETES: Record<string, { birthDate?: Date; ageBand?: string }> = {
    pro: { birthDate: new Date("1996-04-02") },
    pro2: { ageBand: "18_PLUS" },
    racer: { ageBand: "18_PLUS" },
    kid: { birthDate: new Date("2012-06-01") },
    noage: {},
  };
  /* sponsor → its categories; "orphan" has no one to review for it. */
  const SPONSORS: Record<string, string[]> = { plain: ["APPAREL"], booze: ["ALCOHOL"], orphan: [] };
  /* campaign → [sponsor, brief categories | null] */
  const CAMPAIGNS: Record<string, [string, string[] | null]> = {
    c_plain: ["plain", null],
    c_booze: ["booze", null],
    c_bet: ["plain", ["FITNESS", "GAMBLING"]],
    c_orphan: ["orphan", null],
  };

  async function seed(tenant: string) {
    const p = (s: string) => `${tenant}_${s}`;
    await prisma.tenant.create({ data: { id: tenant, name: `CTR ${tenant}` } });
    for (const [s, categories] of Object.entries(SPONSORS)) {
      await prisma.sponsor.create({ data: { id: p(s), tenantId: tenant, name: `CTR Sponsor ${s} ${tenant}`, categories } });
    }
    for (const [a, age] of Object.entries(ATHLETES)) {
      await prisma.athlete.create({ data: {
        id: p(a), tenantId: tenant, slug: p(a), legalName: `Rory ${a} ${tenant}`, displayName: `Rory ${a} ${tenant}`,
        sport: "Track", state: "ACTIVE", ...age,
      } });
    }
    await prisma.nilJob.create({ data: {
      id: p("job"), tenantId: tenant, name: "CTR post", baseLow: 100, baseHigh: 150, sellLow: 200, sellHigh: 400,
      sellFloorEmerging: 210, sellFloorCreator: 263, sellFloorPremium: 315,
    } });
    for (const [c, [sponsor, briefCats]] of Object.entries(CAMPAIGNS)) {
      if (briefCats) {
        await prisma.campaignBrief.create({ data: {
          id: p(`${c}_brief`), tenantId: tenant, sponsorId: p(sponsor), objective: "Launch", budget: 500_000,
          startDate: new Date("2026-10-01"), endDate: new Date("2026-12-31"), categories: briefCats,
        } });
      }
      await prisma.campaign.create({ data: {
        id: p(c), tenantId: tenant, sponsorId: p(sponsor), name: `CTR ${c} ${tenant}`, budget: 500_000,
        startDate: new Date("2026-10-01"), endDate: new Date("2026-12-31"), state: "ACTIVE",
        ...(briefCats ? { briefId: p(`${c}_brief`) } : {}),
      } });
      for (const a of Object.keys(ATHLETES)) {
        await prisma.campaignOrder.create({ data: {
          id: p(`${c}_${a}`), tenantId: tenant, campaignId: p(c), athleteId: p(a), jobId: p("job"),
          compensation: 10_000, sellPrice: 30_000, usageRights: "90 days", dueDate: new Date("2026-12-15"), state: "ACTIVE",
        } });
      }
    }
    const users: Array<[string, string, Record<string, string>]> = [
      ...Object.keys(ATHLETES).map((a) => [a, "ATHLETE", { athleteId: p(a) }] as [string, string, Record<string, string>]),
      ["cm", "CAMPAIGN_MGR", {}],
      ["admin", "BTG_ADMIN", {}],
      ["sp_plain", "SPONSOR_ADMIN", { sponsorId: p("plain") }],
      ["sp_booze", "SPONSOR_ADMIN", { sponsorId: p("booze") }],
    ];
    for (const [id, role, extra] of users) {
      await prisma.user.create({ data: { id: p(id), tenantId: tenant, clerkId: p(id), email: `${p(id)}@ctr-test.invalid`, roles: [role as never], ...extra } });
    }
  }

  const A = (s: string) => `${T}_${s}`;
  const B = (s: string) => `${OTHER}_${s}`;

  let n = 0;
  /** A fresh deliverable for `athlete` on `campaign`. */
  async function deliverable(tenant: string, campaign: string, athlete: string): Promise<string> {
    const id = `${tenant}_d${++n}`;
    await prisma.deliverable.create({ data: {
      id, tenantId: tenant, orderId: `${tenant}_${campaign}_${athlete}`, title: `Post ${n}`, dueDate: new Date("2026-12-15"),
    } });
    return id;
  }

  /** Upload a file and submit, the way the athlete's page does. */
  async function submit(who: string, id: string, opts: { file?: boolean } = {}) {
    if (opts.file !== false) {
      const pre = await call("POST", `/deliverables/${id}/uploads`, who, { contentType: "image/png", bytes: 4_096 });
      expect(pre.status).toBe(201);
      expect((await call("POST", `/deliverables/${id}/assets`, who, { r2Key: pre.json.key })).status).toBe(201);
    }
    return call("POST", `/deliverables/${id}/submit`, who, {});
  }

  /** A clean BTG review, through the API: picked up, then sent to the sponsor
   *  (or approved outright). */
  async function btgPasses(id: string, how: "sponsor" | "approve" = "sponsor") {
    expect((await call("POST", `/deliverables/${id}/btg-review`, A("cm"))).status).toBe(200);
    expect((await call("POST", `/deliverables/${id}/${how === "sponsor" ? "sponsor-review" : "approve"}`, A("cm"))).status).toBe(200);
  }

  /** Simulated history: `count` deliverables BTG passed cleanly an hour ago. */
  async function history(tenant: string, athlete: string, count: number) {
    for (let i = 0; i < count; i++) {
      const id = await deliverable(tenant, "c_plain", athlete);
      await prisma.deliverable.update({ where: { id }, data: { state: "APPROVED", btgPassedAt: new Date(Date.now() - HOUR) } });
    }
  }

  const trust = async (athlete: string, who = A("admin")) => (await call("GET", `/signups/athletes/${athlete}`, who)).json.contentTrust;
  const stateOf = async (id: string) => (await prisma.deliverable.findUniqueOrThrow({ where: { id }, select: { state: true } })).state;
  const auditOf = (id: string) =>
    prisma.auditLog.findMany({ where: { tenantId: T, entityId: id }, select: { action: true, actorId: true, after: true }, orderBy: { at: "asc" } });

  beforeAll(async () => {
    await wipe();
    await seed(T);
    await seed(OTHER);
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await wipe();
  });

  const skipped: Record<string, string> = {};

  it("an untrusted athlete's passing draft goes to BTG; three clean BTG reviews make them trusted", async () => {
    expect(await trust(A("pro"))).toEqual({ trusted: false, cleanStreak: 0, needed: 3 });

    const first = await deliverable(T, "c_plain", "pro");
    const r = await submit(A("pro"), first);
    expect(r.json).toMatchObject({ state: "DRAFT_SUBMITTED", passed: true, btgReviewSkipped: false });
    const log = await auditOf(first);
    expect(log.find((l) => l.action === "deliverable.submitDraft")!.after).toMatchObject({
      btgReview: { skipped: false, reason: "Not trusted yet: 0 of 3 clean drafts — reviewed by BTG" },
    });
    expect(log.map((l) => l.action)).not.toContain("deliverable.btgReviewSkipped");

    await btgPasses(first);
    expect(await trust(A("pro"))).toEqual({ trusted: false, cleanStreak: 1, needed: 3 });
    for (const how of ["approve", "sponsor"] as const) {
      const id = await deliverable(T, "c_plain", "pro");
      expect((await submit(A("pro"), id)).json.btgReviewSkipped).toBe(false);
      await btgPasses(id, how);
    }
    expect(await trust(A("pro"))).toEqual({ trusted: true, cleanStreak: 3, needed: 3 });
  });

  it("a trusted adult athlete's passing draft skips straight to the sponsor — moved by the system, with the reason", async () => {
    const id = await deliverable(T, "c_plain", "pro");
    const r = await submit(A("pro"), id);
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ state: "SPONSOR_REVIEW", passed: true, btgReviewSkipped: true });
    skipped.pro = id;

    const row = await prisma.deliverable.findUniqueOrThrow({ where: { id }, select: { state: true, btgReviewSkipped: true, skipReason: true, reviewWaitingSince: true, btgPassedAt: true } });
    expect(row).toMatchObject({ state: "SPONSOR_REVIEW", btgReviewSkipped: true, skipReason: TRUSTED, btgPassedAt: null });
    expect(row.reviewWaitingSince).not.toBeNull();

    const log = await auditOf(id);
    const skip = log.filter((l) => l.action === "deliverable.btgReviewSkipped");
    expect(skip).toEqual([{
      action: "deliverable.btgReviewSkipped", actorId: null,
      after: { state: "SPONSOR_REVIEW", via: ["BTG_REVIEW", "SPONSOR_REVIEW"], reason: TRUSTED },
    }]);
    expect(log.find((l) => l.action === "deliverable.submitDraft")).toMatchObject({ actorId: A("pro") });

    /* BTG sees it skipped and why; the athlete and the sponsor see that it skipped. */
    expect((await call("GET", `/deliverables/${id}`, A("cm"))).json).toMatchObject({ state: "SPONSOR_REVIEW", btgReviewSkipped: true, skipReason: TRUSTED });
    expect((await call("GET", `/deliverables/${id}`, A("pro"))).json).toMatchObject({ btgReviewSkipped: true, skipReason: null });
    expect((await call("GET", `/deliverables/${id}`, A("sp_plain"))).json).toMatchObject({ btgReviewSkipped: true, skipReason: null });

    /* BTG's spot-check filter, both list modes, and the count. */
    const only = (await call("GET", "/deliverables?btgSkipped=only", A("cm"))).json.deliverables.map((d: { id: string }) => d.id);
    expect(only).toEqual([id]);
    const paged = (await call("GET", "/deliverables?btgSkipped=only&page=1&size=12&state=DRAFT_SUBMITTED,BTG_REVIEW,SPONSOR_REVIEW,APPROVED,PUBLISHED,VERIFIED", A("cm"))).json;
    expect(paged.deliverables.map((d: { id: string }) => d.id)).toEqual([id]);
    expect(paged.page.total).toBe(1);
    expect((await call("GET", "/deliverables/summary", A("cm"))).json.btgSkipped).toBe(1);

    /* A skip does not add to the streak (BTG never reviewed it), nor take from it. */
    expect(await trust(A("pro"))).toEqual({ trusted: true, cleanStreak: 3, needed: 3 });
  });

  it("no double move: a skipped draft can't be resubmitted, and two racing submissions skip once", async () => {
    const again = await call("POST", `/deliverables/${skipped.pro}/submit`, A("pro"), {});
    expect(again.status).toBe(409);
    expect(await stateOf(skipped.pro!)).toBe("SPONSOR_REVIEW");

    const id = await deliverable(T, "c_plain", "pro");
    const pre = await call("POST", `/deliverables/${id}/uploads`, A("pro"), { contentType: "image/jpeg", bytes: 4_096 });
    await call("POST", `/deliverables/${id}/assets`, A("pro"), { r2Key: pre.json.key });
    const both = await Promise.all([
      call("POST", `/deliverables/${id}/submit`, A("pro"), {}),
      call("POST", `/deliverables/${id}/submit`, A("pro"), {}),
    ]);
    expect(both.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await stateOf(id)).toBe("SPONSOR_REVIEW");
    expect((await auditOf(id)).filter((l) => l.action === "deliverable.btgReviewSkipped")).toHaveLength(1);
    expect((await auditOf(id)).filter((l) => l.action === "deliverable.submitDraft")).toHaveLength(1);
    skipped.race = id;
  });

  it("a draft failing its checks still goes back to the athlete, and skips nothing", async () => {
    const id = await deliverable(T, "c_plain", "pro");
    const r = await submit(A("pro"), id, { file: false });
    expect(r.json).toMatchObject({ state: "DRAFT_SUBMITTED", passed: false, btgReviewSkipped: false });
    expect((await call("GET", `/deliverables/${id}`, A("pro"))).json.revision).toMatchObject({ by: "SYSTEM" });
    const actions = (await auditOf(id)).map((l) => l.action);
    expect(actions).toContain("deliverable.systemRevision");
    expect(actions).not.toContain("deliverable.btgReviewSkipped");
    /* The system's revision does not count against them. */
    expect(await trust(A("pro"))).toMatchObject({ trusted: true, cleanStreak: 3 });
    /* Fixed and resubmitted, it skips. */
    const fixed = await submit(A("pro"), id);
    expect(fixed.json).toMatchObject({ state: "SPONSOR_REVIEW", btgReviewSkipped: true });
  });

  it("reminders for a skipped draft go to the sponsor only", async () => {
    const since = (await prisma.deliverable.findUniqueOrThrow({ where: { id: skipped.pro! }, select: { reviewWaitingSince: true } })).reviewWaitingSince!;
    await sweepReviewReminders(new Date(since.getTime() + 49 * HOUR), { tenantIds: [T] });
    const mails = (await prisma.outboxJob.findMany({ where: { tenantId: T, name: "notify.email" }, select: { payload: true } }))
      .map((j) => j.payload as { template: string; to: string; idempotencyKey: string })
      .filter((m) => m.idempotencyKey.includes(`:${skipped.pro}:`));
    expect(mails.map((m) => [m.template, m.to])).toEqual([["deliverable.sponsorReviewReminder", `${A("sp_plain")}@ctr-test.invalid`]]);
  });

  it("a minor never skips, however clean their record", async () => {
    await history(T, "kid", 3);
    expect(await trust(A("kid"))).toMatchObject({ trusted: true });
    const id = await deliverable(T, "c_plain", "kid");
    const r = await submit(A("kid"), id);
    expect(r.json).toMatchObject({ state: "DRAFT_SUBMITTED", passed: true, btgReviewSkipped: false });
    expect((await auditOf(id)).find((l) => l.action === "deliverable.submitDraft")!.after).toMatchObject({
      btgReview: { skipped: false, reason: "Athlete is a minor — always reviewed by BTG" },
    });
  });

  it("an athlete with no age on file doesn't skip", async () => {
    await history(T, "noage", 3);
    const id = await deliverable(T, "c_plain", "noage");
    expect((await submit(A("noage"), id)).json).toMatchObject({ state: "DRAFT_SUBMITTED", btgReviewSkipped: false });
  });

  it("a sensitive category never skips — on the sponsor or on the brief", async () => {
    expect(await trust(A("pro"))).toMatchObject({ trusted: true });
    const booze = await deliverable(T, "c_booze", "pro");
    expect((await submit(A("pro"), booze)).json).toMatchObject({ state: "DRAFT_SUBMITTED", btgReviewSkipped: false });
    expect((await auditOf(booze)).find((l) => l.action === "deliverable.submitDraft")!.after).toMatchObject({
      btgReview: { skipped: false, reason: "Sponsor is in a sensitive category (alcohol) — always reviewed by BTG" },
    });
    const bet = await deliverable(T, "c_bet", "pro");
    expect((await submit(A("pro"), bet)).json).toMatchObject({ state: "DRAFT_SUBMITTED", btgReviewSkipped: false });
    expect((await auditOf(bet)).find((l) => l.action === "deliverable.submitDraft")!.after).toMatchObject({
      btgReview: { skipped: false, reason: "Brief is in a sensitive category (gambling) — always reviewed by BTG" },
    });
  });

  it("a sponsor with no one to review it doesn't get a skipped draft", async () => {
    const id = await deliverable(T, "c_orphan", "pro");
    expect((await submit(A("pro"), id)).json).toMatchObject({ state: "DRAFT_SUBMITTED", btgReviewSkipped: false });
  });

  it("the sponsor's revision doesn't count against the athlete; the resubmission skips again", async () => {
    const r = await call("POST", `/deliverables/${skipped.race}/revision`, A("sp_plain"), { reason: "Show the logo" });
    expect(r.json).toMatchObject({ state: "DRAFT_SUBMITTED" });
    const log = await auditOf(skipped.race!);
    expect(log.find((l) => l.action === "deliverable.requestRevision")!.after).toMatchObject({ by: "SPONSOR", reason: "Show the logo" });
    expect(await trust(A("pro"))).toMatchObject({ trusted: true, cleanStreak: 3 });
    expect((await submit(A("pro"), skipped.race!)).json).toMatchObject({ state: "SPONSOR_REVIEW", btgReviewSkipped: true });
  });

  it("BTG can request changes on a skipped draft while it is with the sponsor — and that resets the streak", async () => {
    const r = await call("POST", `/deliverables/${skipped.pro}/revision`, A("cm"), { reason: "The logo is cropped" });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ state: "DRAFT_SUBMITTED" });
    const log = await auditOf(skipped.pro!);
    expect(log.find((l) => l.action === "deliverable.requestRevision")!.after).toMatchObject({ by: "BTG", reason: "The logo is cropped" });
    expect(await trust(A("pro"))).toEqual({ trusted: false, cleanStreak: 0, needed: 3 });

    /* This deliverable goes to BTG from now on — the streak aside. */
    const back = await submit(A("pro"), skipped.pro!);
    expect(back.json).toMatchObject({ state: "DRAFT_SUBMITTED", btgReviewSkipped: false });
    expect((await auditOf(skipped.pro!)).filter((l) => l.action === "deliverable.submitDraft").at(-1)!.after).toMatchObject({
      btgReview: { skipped: false },
    });
    /* No longer on the skipped list: the latest submission went to BTG. */
    expect((await call("GET", "/deliverables?btgSkipped=only", A("cm"))).json.deliverables.map((d: { id: string }) => d.id)).not.toContain(skipped.pro);

    /* Its later BTG pass doesn't count: BTG revised this deliverable. */
    await btgPasses(skipped.pro!);
    expect(await trust(A("pro"))).toMatchObject({ cleanStreak: 0 });

    /* The next three must be clean again. */
    for (let i = 0; i < 3; i++) {
      const id = await deliverable(T, "c_plain", "pro");
      expect((await submit(A("pro"), id)).json).toMatchObject({ state: "DRAFT_SUBMITTED", btgReviewSkipped: false });
      await btgPasses(id);
      expect(await trust(A("pro"))).toMatchObject({ cleanStreak: i + 1 });
    }
    const next = await deliverable(T, "c_plain", "pro");
    expect((await submit(A("pro"), next)).json).toMatchObject({ state: "SPONSOR_REVIEW", btgReviewSkipped: true });
  });

  it("a BTG revision from BTG's own desk resets the streak too", async () => {
    await history(T, "pro2", 3);
    expect(await trust(A("pro2"))).toMatchObject({ trusted: true });
    const id = await deliverable(T, "c_booze", "pro2"); // sensitive: goes to BTG
    await submit(A("pro2"), id);
    await call("POST", `/deliverables/${id}/btg-review`, A("cm"));
    expect((await call("POST", `/deliverables/${id}/revision`, A("cm"), { reason: "Add the 21+ line" })).status).toBe(200);
    expect(await trust(A("pro2"))).toEqual({ trusted: false, cleanStreak: 0, needed: 3 });
  });

  /** Wait until `n` sessions are queued on the athlete's content-trust lock. */
  async function lockWaiters(n: number) {
    for (let i = 0; i < 300; i++) {
      const [row] = await prisma.$queryRaw<Array<{ n: number }>>`
        SELECT count(*)::int AS n FROM pg_stat_activity
         WHERE datname = current_database() AND wait_event_type = 'Lock'
           AND query LIKE '%FROM "Athlete"%FOR NO KEY UPDATE%'`;
      if ((row?.n ?? 0) >= n) return;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`fewer than ${n} sessions ever waited on the athlete's lock`);
  }

  it("a BTG revision and a submission racing: the submission never skips on the streak the revision breaks", async () => {
    await history(T, "racer", 3);
    expect(await trust(A("racer"))).toMatchObject({ trusted: true });
    /* X skipped to the sponsor; BTG is about to revise it. Y is uploaded, ready to submit. */
    const x = await deliverable(T, "c_plain", "racer");
    expect((await submit(A("racer"), x)).json.btgReviewSkipped).toBe(true);
    const y = await deliverable(T, "c_plain", "racer");
    const pre = await call("POST", `/deliverables/${y}/uploads`, A("racer"), { contentType: "image/png", bytes: 4_096 });
    await call("POST", `/deliverables/${y}/assets`, A("racer"), { r2Key: pre.json.key });

    /* Hold the athlete's lock, queue the revision on it, then the submission. */
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let locked!: () => void;
    const isLocked = new Promise<void>((r) => (locked = r));
    const holder = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Athlete" WHERE "id" = ${A("racer")} FOR NO KEY UPDATE`;
      locked();
      await held;
    }, { timeout: 30_000, maxWait: 10_000 });
    await isLocked;

    let revisionDone = false;
    const revision = call("POST", `/deliverables/${x}/revision`, A("cm"), { reason: "The logo is cropped" }).then((r) => {
      revisionDone = true;
      return r;
    });
    await lockWaiters(1);
    /* The revision takes the lock before it writes: it is waiting, not done. */
    expect(revisionDone).toBe(false);
    const submission = call("POST", `/deliverables/${y}/submit`, A("racer"), {});
    await lockWaiters(2);

    release();
    await holder;
    const [r, s] = await Promise.all([revision, submission]);
    expect(r.status).toBe(200);
    expect(s.status).toBe(200);
    /* The submission read the streak after the revision broke it. */
    expect(s.json).toMatchObject({ state: "DRAFT_SUBMITTED", passed: true, btgReviewSkipped: false });
    expect((await auditOf(y)).find((l) => l.action === "deliverable.submitDraft")!.after).toMatchObject({
      btgReview: { skipped: false, reason: "Not trusted yet: 0 of 3 clean drafts — reviewed by BTG" },
    });
    expect(await trust(A("racer"))).toEqual({ trusted: false, cleanStreak: 0, needed: 3 });
  });

  it("a sponsor can't approve while BTG is reviewing — only once it reaches them", async () => {
    const id = await deliverable(T, "c_booze", "pro2"); // sensitive: goes to BTG
    expect((await submit(A("pro2"), id)).json).toMatchObject({ state: "DRAFT_SUBMITTED" });
    expect((await call("POST", `/deliverables/${id}/btg-review`, A("cm"))).json).toMatchObject({ state: "BTG_REVIEW" });
    const early = await call("POST", `/deliverables/${id}/approve`, A("sp_booze"));
    expect(early.status).toBe(409);
    expect(early.json.error.message).toMatch(/BTG is still reviewing/);
    expect(await stateOf(id)).toBe("BTG_REVIEW");
    expect((await auditOf(id)).map((l) => l.action)).not.toContain("deliverable.approve");

    expect((await call("POST", `/deliverables/${id}/sponsor-review`, A("cm"))).json).toMatchObject({ state: "SPONSOR_REVIEW" });
    const ok = await call("POST", `/deliverables/${id}/approve`, A("sp_booze"));
    expect(ok.status).toBe(200);
    expect(ok.json).toMatchObject({ state: "APPROVED" });
  });

  it("cross-tenant: no reads, no revisions, no counts, no trust across tenants", async () => {
    const id = skipped.race!;
    expect((await call("GET", `/deliverables/${id}`, B("cm"))).status).toBe(403);
    expect((await call("POST", `/deliverables/${id}/revision`, B("cm"), { reason: "x" })).status).toBe(403);
    expect((await call("POST", `/deliverables/${id}/revision`, B("sp_plain"), { reason: "x" })).status).toBe(403);
    expect((await call("GET", "/deliverables?btgSkipped=only", B("cm"))).json.deliverables).toEqual([]);
    expect((await call("GET", "/deliverables/summary?btgSkipped=only", B("cm"))).json).toMatchObject({ total: 0, btgSkipped: 0 });
    expect((await call("GET", `/signups/athletes/${A("pro")}`, B("admin"))).status).toBe(403);
    /* The trust read is BTG's: not the athlete's, not the sponsor's. */
    expect((await call("GET", `/signups/athletes/${A("pro")}`, A("pro"))).status).toBe(403);
    expect((await call("GET", `/signups/athletes/${A("pro")}`, A("sp_plain"))).status).toBe(403);
    /* The other tenant's athlete of the same name starts from nothing. */
    expect(await trust(B("pro"), B("admin"))).toEqual({ trusted: false, cleanStreak: 0, needed: 3 });
    expect(await stateOf(id)).toBe("SPONSOR_REVIEW");
  });
});
