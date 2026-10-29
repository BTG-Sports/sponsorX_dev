import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   POL-BE-10 — a guardian handoff could wait forever: no reminder, no
   expiry, and BTG couldn't step in until the current guardian answered.

   Against the real API and database: the hourly sweep reminds the current
   guardian at 3 days (once) and escalates at 7 (once) — BTG's admins, the
   requester and the current guardian told; the request moves to the desk's
   "Waiting for BTG". BTG may then confirm (the switch) or decline it; not
   before. The current guardian can still answer, and the first answer
   decides.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
process.env.PUBLIC_INTAKE_TENANT_ID = "he_btg";

const { uploaded } = vi.hoisted(() => ({ uploaded: new Set<string>() }));
vi.mock("../src/lib/storage", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/lib/storage")>();
  return { ...real, checkPrivateUpload: async (_actor: unknown, key: string) => (uploaded.has(key) ? { ok: true as const, bytes: 204_800 } : { ok: false as const, problem: "missing" as const }) };
});
vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@he-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("POL-BE-10 · a guardian handoff is reminded, then BTG may decide", { timeout: 90_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { sweepGuardianHandoffs } = await import("../src/domain/guardian-handoff");

  const T = "he_btg";
  const DAY = 86_400_000;
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
  const emails = async () => (await prisma.outboxJob.findMany({ where: { tenantId: T, name: "notify.email" }, select: { payload: true }, orderBy: { createdAt: "asc" } }))
    .map((j) => j.payload as { template: string; to: string; data: Record<string, string>; idempotencyKey: string });
  const mailsOf = async (template: string, id: string) => (await emails()).filter((m) => m.template === template && m.idempotencyKey.includes(id)).map((m) => m.to).sort();
  const pub = (token: string, rest = "") => `/public/guardian-handoffs/${encodeURIComponent(token)}${rest}`;
  const sweep = (now = new Date()) => sweepGuardianHandoffs(now, { tenantIds: [T] });
  /** The request was sent `days` ago. */
  const sentAgo = (id: string, days: number) => prisma.guardianHandoff.update({ where: { id }, data: { submittedAt: new Date(Date.now() - days * DAY - 60_000) } });

  async function clean() {
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 6; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = $1`, T).catch(() => {});
      }
    }
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  /** A new guardian's request about this athlete: started, documents in, email confirmed, sent to the current guardian. */
  async function request(athlete: string, b: { name: string; email: string }) {
    const start = await call("POST", "/public/guardian-handoffs", undefined, { athleteEmail: `${athlete}@he-test.invalid`, name: b.name, email: b.email, relationship: "PARENT" });
    expect(start.status, start.text).toBe(201);
    const token = start.json.token as string;
    for (const doc of [{ kind: "GUARDIAN_ID", filename: "id.png", contentType: "image/png" }, { kind: "GUARDIANSHIP_PROOF", proofKind: "BIRTH_CERTIFICATE", filename: "birth.pdf", contentType: "application/pdf" }]) {
      const up = await call("POST", pub(token, "/documents"), undefined, { ...doc, bytes: 204_800 });
      expect(up.status, up.text).toBe(201);
      const row = await prisma.guardianHandoffDocument.findUniqueOrThrow({ where: { id: up.json.document.id }, select: { r2Key: true } });
      uploaded.add(row.r2Key);
      expect((await call("POST", pub(token, `/documents/${up.json.document.id}/confirm`))).status).toBe(200);
    }
    const mail = (await emails()).filter((m) => m.template === "handoff.confirmEmail" && m.to === b.email).at(-1)!;
    await call("POST", "/public/guardian-handoffs/confirm-email", undefined, { token: new URL(mail.data.confirmUrl!).searchParams.get("e")! });
    const sent = await call("POST", pub(token, "/submit"), undefined, { acceptAgreement: true });
    expect(sent.json.state, sent.text).toBe("WAITING");
    return start.json.request.id as string;
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "Handoff escalation BTG" } });
    await prisma.guardian.create({ data: { id: "he_carmen", tenantId: T, legalName: "Carmen Reyes", email: "he_carmen@he-test.invalid", relationship: "PARENT", verifiedAt: new Date() } });
    await prisma.athlete.createMany({ data: ["he_a1", "he_a2", "he_a3", "he_a4"].map((id, i) => ({
      id, tenantId: T, slug: id.replace("_", "-"), legalName: `Kid${i + 1} Reyes`, displayName: `Kid${i + 1} Reyes`, email: `${id}@he-test.invalid`,
      sport: "Basketball", birthDate: new Date(Date.UTC(new Date().getUTCFullYear() - 15, 0, 1)), state: "ACTIVE" as const, guardianId: "he_carmen",
    })) });
    await prisma.user.createMany({ data: [
      { id: "he_admin", tenantId: T, clerkId: "he_admin", email: "he_admin@he-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "he_u_carmen", tenantId: T, clerkId: "he_carmen", email: "he_carmen@he-test.invalid", roles: ["GUARDIAN"], guardianId: "he_carmen" },
    ] });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server?.close();
    await clean();
  });

  let first = "";

  it("reminded once at 3 days, escalated once at 7 — everyone told, and it moves to the desk's Waiting for BTG", async () => {
    first = await request("he_a1", { name: "Luis Reyes", email: "he_luis@he-test.invalid" });
    await sentAgo(first, 2);
    expect(await sweep()).toEqual({ reminded: 0, escalated: 0 });

    await sentAgo(first, 3);
    expect(await sweep()).toEqual({ reminded: 1, escalated: 0 });
    expect(await mailsOf("handoff.reminder", first)).toEqual(["he_carmen@he-test.invalid"]);
    expect(await sweep()).toEqual({ reminded: 0, escalated: 0 });

    /* Not BTG's to decide yet. */
    const early = await call("POST", `/guardian-handoffs/${first}/staff-decision`, "he_admin", { decision: "CONFIRM" });
    expect(early.status, early.text).toBe(409);
    expect(early.json.error.message).toMatch(/still with the current guardian/);

    await sentAgo(first, 7);
    expect(await sweep()).toEqual({ reminded: 0, escalated: 1 });
    expect(await sweep()).toEqual({ reminded: 0, escalated: 0 });
    expect(await mailsOf("handoff.escalated", first)).toEqual(["he_admin@he-test.invalid"]);
    expect(await mailsOf("handoff.escalatedRequester", first)).toEqual(["he_luis@he-test.invalid"]);
    expect(await mailsOf("handoff.escalatedGuardian", first)).toEqual(["he_carmen@he-test.invalid"]);

    const desk = await call("GET", `/guardian-handoffs/${first}`, "he_admin");
    expect(desk.json).toMatchObject({ state: "WAITING", btgMayDecide: true, waitingDays: 7, remindedAt: expect.any(String), escalatedAt: expect.any(String), sentAt: expect.any(String) });
    const waiting = await call("GET", "/guardian-handoffs?group=WAITING_FOR_BTG", "he_admin");
    expect(waiting.json.handoffs.map((h: { id: string }) => h.id)).toEqual([first]);
    expect(waiting.json.counts).toMatchObject({ WAITING_FOR_BTG: 1, IN_PROGRESS: 0 });
    expect((await call("GET", "/guardian-handoffs?group=IN_PROGRESS", "he_admin")).json.handoffs).toEqual([]);
    expect(await prisma.auditLog.count({ where: { tenantId: T, entityId: first, action: { in: ["guardianHandoff.remind", "guardianHandoff.escalate"] } } })).toBe(2);
  });

  it("BTG confirms an escalated request: the switch, worded as BTG's decision; the guardian's late answer is refused", async () => {
    const r = await call("POST", `/guardian-handoffs/${first}/staff-decision`, "he_admin", { decision: "CONFIRM" });
    expect(r.status, r.text).toBe(200);
    expect(r.json.state).toBe("SWITCHED");
    expect((await prisma.athlete.findUniqueOrThrow({ where: { id: "he_a1" }, select: { guardianId: true } })).guardianId).not.toBe("he_carmen");
    const mail = (await emails()).find((m) => m.template === "handoff.switchedNew" && m.idempotencyKey.includes(first))!;
    expect(mail.data.byBtg).toBe("yes");
    const late = await call("POST", `/guardian-handoffs/${first}/decision`, "he_carmen", { decision: "DECLINE" });
    expect(late.status).not.toBe(200);
  });

  it("BTG declines an escalated request, with its reason", async () => {
    const id = await request("he_a2", { name: "Pat Reyes", email: "he_pat@he-test.invalid" });
    await sentAgo(id, 8);
    expect(await sweep()).toMatchObject({ escalated: 1 });
    expect((await call("POST", `/guardian-handoffs/${id}/staff-decision`, "he_admin", { decision: "DECLINE", note: " " })).status).toBe(400);
    const r = await call("POST", `/guardian-handoffs/${id}/staff-decision`, "he_admin", { decision: "DECLINE", note: "The proof of guardianship names someone else." });
    expect(r.status, r.text).toBe(200);
    expect(r.json.state).toBe("DECLINED");
    expect(await mailsOf("handoff.declinedByBtg", id)).toEqual(["he_pat@he-test.invalid"]);
    expect((await prisma.athlete.findUniqueOrThrow({ where: { id: "he_a2" }, select: { guardianId: true } })).guardianId).toBe("he_carmen");
  });

  it("the current guardian can still answer after BTG steps in — the first answer decides", async () => {
    const id = await request("he_a3", { name: "Rae Reyes", email: "he_rae@he-test.invalid" });
    await sentAgo(id, 8);
    expect(await sweep()).toMatchObject({ escalated: 1 });
    const answer = await call("POST", `/guardian-handoffs/${id}/decision`, "he_carmen", { decision: "DECLINE" });
    expect(answer.status, answer.text).toBe(200);
    expect(answer.json.state).toBe("DECLINED");
    expect(await mailsOf("handoff.declined", id)).toEqual(["he_rae@he-test.invalid"]);
    const btg = await call("POST", `/guardian-handoffs/${id}/staff-decision`, "he_admin", { decision: "CONFIRM" });
    expect(btg.status).toBe(409);
  });

  it("an answered request is never reminded or escalated", async () => {
    const id = await request("he_a4", { name: "Sam Reyes", email: "he_sam@he-test.invalid" });
    expect((await call("POST", `/guardian-handoffs/${id}/decision`, "he_carmen", { decision: "DECLINE" })).json.state).toBe("DECLINED");
    await sentAgo(id, 10);
    expect(await sweep()).toEqual({ reminded: 0, escalated: 0 });
    expect(await mailsOf("handoff.reminder", id)).toEqual([]);
  });
});
