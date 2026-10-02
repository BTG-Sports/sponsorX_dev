import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   2S6-BE-02 — "A user can mute a channel per event type and the worker
   honours it."

   The user mutes through the real API (their own preferences, nobody else's);
   the worker's real email handler then runs against the same database and
   does not send what was muted — while every other event, every other
   person, and every decision notice still goes. Only Clerk and the email
   vendor are stubbed.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

const { sent } = vi.hoisted(() => ({ sent: [] as Array<{ to: string; subject: string }> }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: async (m: { to: string; subject: string }) => { sent.push(m); return { data: { id: "em" }, error: null }; } };
  },
}));
vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@prefs-test.invalid` } : null;
  },
}));

const { MUTABLE_EVENTS } = await import("../src/domain/notification-rules");

describe("2S6-BE-02 · what can be muted (pure)", () => {
  it("offers, reminders and delivery updates — never a decision about the person", () => {
    expect(MUTABLE_EVENTS).toContain("invitation.reminder");
    for (const decision of ["athlete.approved", "athlete.rejected", "athlete.changesRequested", "guardian.verificationRequested",
      "onboarding.approved", "onboarding.rejected", "onboarding.suspended", "reward.claimed"]) {
      expect(MUTABLE_EVENTS as readonly string[]).not.toContain(decision);
    }
  });
});

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("a muted channel is not sent by the worker", { timeout: 30_000 }, async () => {
  const pg = (await import("pg")).default;
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { handleSendEmail } = await import("../worker/jobs/send-email.mts");

  const T = "np_tenant";
  const OTHER = "np_tenant_other";
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  let n = 0;

  const call = async (method: string, path: string, clerk: string, body?: unknown) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method, headers: { "x-test-clerk": clerk, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };
  /** One job, as the drain would hand it to the worker. */
  const job = (template: string, to: string, tenantId = T) =>
    handleSendEmail(pool, { tenantId, template, to, data: { firstName: "Jo" }, idempotencyKey: `np:${template}:${to}:${++n}` });

  async function clean() {
    for (const t of [T, OTHER]) {
      for (const table of ["NotificationPreference", "EmailSendLog", "User", "Athlete"]) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table}" WHERE "tenantId" = $1`, t);
      }
    }
    await prisma.tenant.deleteMany({ where: { id: { in: [T, OTHER] } } });
  }

  beforeAll(async () => {
    process.env.RESEND_API_KEY = "re_test";
    await clean();
    await prisma.tenant.createMany({ data: [{ id: T, name: "Prefs tenant" }, { id: OTHER, name: "Prefs other tenant" }] });
    /* Athlete mail goes to the athlete record's address, which differs from the login's. */
    await prisma.athlete.create({ data: { id: "np_ath", tenantId: T, slug: "np-ath", legalName: "Jo Park", displayName: "JO", email: "jo.park@athlete.invalid", sport: "Soccer", stateCode: "MD", ageBand: "18_PLUS", state: "ACTIVE" } });
    await prisma.user.createMany({ data: [
      { id: "np_athlete", tenantId: T, clerkId: "np_athlete", email: "np_athlete@prefs-test.invalid", roles: ["ATHLETE"], athleteId: "np_ath" },
      { id: "np_staff", tenantId: T, clerkId: "np_staff", email: "np_staff@prefs-test.invalid", roles: ["CAMPAIGN_MGR"] },
      { id: "np_elsewhere", tenantId: OTHER, clerkId: "np_elsewhere", email: "np_elsewhere@prefs-test.invalid", roles: ["ATHLETE"] },
    ] });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await clean();
    await pool.end();
  });

  it("a user mutes one channel for one event type, through the API", async () => {
    const fresh = await call("GET", "/me/notification-preferences", "np_athlete");
    expect(fresh.status).toBe(200);
    expect(fresh.json.preferences.every((p: { muted: boolean }) => !p.muted)).toBe(true);

    const muted = await call("PUT", "/me/notification-preferences", "np_athlete", { event: "invitation.reminder", channel: "EMAIL", muted: true });
    expect(muted.status).toBe(200);
    expect(muted.json.preferences).toContainEqual({ event: "invitation.reminder", channel: "EMAIL", muted: true });
    expect(muted.json.preferences).toContainEqual({ event: "invitation.sent", channel: "EMAIL", muted: false });

    /* A decision notice cannot be muted, nor an unknown channel. */
    expect((await call("PUT", "/me/notification-preferences", "np_athlete", { event: "athlete.approved", channel: "EMAIL", muted: true })).status).toBe(400);
    expect((await call("PUT", "/me/notification-preferences", "np_athlete", { event: "invitation.sent", channel: "CARRIER_PIGEON", muted: true })).status).toBe(400);
  });

  it("only ever the caller's own — a smuggled user id sets nothing of anyone else's", async () => {
    await call("PUT", "/me/notification-preferences", "np_staff", { event: "deliverable.dueSoon", channel: "EMAIL", muted: true, userId: "np_athlete", tenantId: OTHER });
    const rows = await prisma.notificationPreference.findMany({ where: { tenantId: { in: [T, OTHER] } }, select: { userId: true, tenantId: true, event: true } });
    expect(rows).toContainEqual({ userId: "np_staff", tenantId: T, event: "deliverable.dueSoon" });
    expect(rows.filter((r) => r.userId === "np_athlete").map((r) => r.event)).toEqual(["invitation.reminder"]);
    /* And one person's list never shows another's. */
    const athletes = (await call("GET", "/me/notification-preferences", "np_athlete")).json.preferences;
    expect(athletes).toContainEqual({ event: "deliverable.dueSoon", channel: "EMAIL", muted: false });
  });

  it("the worker honours it — at send time, for that event, that person, that tenant only", async () => {
    sent.length = 0;
    /* Muted: to the athlete record's address, and to the login's. Nothing sent, nothing recorded as sent. */
    expect(await job("invitation.reminder", "jo.park@athlete.invalid")).toBe("muted");
    expect(await job("invitation.reminder", "NP_ATHLETE@prefs-test.invalid")).toBe("muted");
    expect(await prisma.emailSendLog.count({ where: { tenantId: T, template: "invitation.reminder" } })).toBe(0);
    /* Not muted: another event, another person, the same address in another tenant, a decision notice. */
    expect(await job("invitation.sent", "jo.park@athlete.invalid")).toBe("sent");
    expect(await job("invitation.reminder", "np_staff@prefs-test.invalid")).toBe("sent");
    expect(await job("invitation.reminder", "jo.park@athlete.invalid", OTHER)).toBe("sent");
    await prisma.notificationPreference.create({ data: { tenantId: T, userId: "np_athlete", event: "athlete.approved", channel: "EMAIL", muted: true } }); // a stray row
    expect(await job("athlete.approved", "jo.park@athlete.invalid")).toBe("sent");
    expect(sent.map((m) => m.to)).toEqual(["jo.park@athlete.invalid", "np_staff@prefs-test.invalid", "jo.park@athlete.invalid", "jo.park@athlete.invalid"]);

    /* Unmuting takes effect on the next job. */
    await call("PUT", "/me/notification-preferences", "np_athlete", { event: "invitation.reminder", channel: "EMAIL", muted: false });
    expect(await job("invitation.reminder", "jo.park@athlete.invalid")).toBe("sent");
  });
});
