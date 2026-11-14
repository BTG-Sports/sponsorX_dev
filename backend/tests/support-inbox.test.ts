import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   POL-BE-41 — BTG's support inbox, against the real API and database.
   Done when:

     a contact-form message appears in the inbox as New; a reply sent from
     it reaches the sender from noreply@ and marks it Answered; the support@
     email has no message text; a sender with held sign-ups shows them with
     their reasons; BTG admins only (cross-tenant and role tests pass).
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
process.env.PUBLIC_INTAKE_TENANT_ID = "sib_btg";
process.env.SUPPORT_EMAIL = "help@sib-support.invalid";

const { sent } = vi.hoisted(() => ({ sent: [] as Record<string, unknown>[] }));
vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@sib-test.invalid` } : null;
  },
}));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: async (m: Record<string, unknown>) => { sent.push(m); return { data: { id: "em" }, error: null }; } };
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("POL-BE-41 · BTG's support inbox", { timeout: 90_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const pg = (await import("pg")).default;
  const { handleSendEmail, EMAIL_TEMPLATES } = await import("../worker/jobs/send-email.mts");

  const T = "sib_btg";
  const OTHER_T = "sib_other";
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
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
  type Job = { tenantId: string; template: string; to: string; data: Record<string, string>; idempotencyKey: string; replyTo?: string; headers?: Record<string, string> };
  const jobs = async () => (await prisma.outboxJob.findMany({ where: { tenantId: T, name: "notify.email" }, select: { payload: true }, orderBy: { createdAt: "asc" } }))
    .map((j) => j.payload as Job);

  async function clean() {
    for (const t of ["SupportReply", "SupportAttachment", "SupportMessage", "Athlete", "Guardian", "Inquiry", "PropertyOnboarding", "OutboxJob", "AuditLog", "EmailSendLog", "User"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [T, OTHER_T]).catch(() => {});
    }
    await prisma.tenant.deleteMany({ where: { id: { in: [T, OTHER_T] } } });
  }

  const SENDER = "serena.k@sib-test.invalid";
  beforeAll(async () => {
    await clean();
    await prisma.tenant.createMany({ data: [{ id: T, name: "Inbox BTG" }, { id: OTHER_T, name: "Other BTG" }] });
    await prisma.user.createMany({ data: [
      { id: "sib_admin", tenantId: T, clerkId: "sib_admin", email: "sib_admin@sib-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "sib_finance", tenantId: T, clerkId: "sib_finance", email: "sib_finance@sib-test.invalid", roles: ["FINANCE"] },
      { id: "sib_cm", tenantId: T, clerkId: "sib_cm", email: "sib_cm@sib-test.invalid", roles: ["CAMPAIGN_MGR"] },
      { id: "sib_other_admin", tenantId: OTHER_T, clerkId: "sib_other_admin", email: "sib_other_admin@sib-test.invalid", roles: ["BTG_ADMIN"] },
    ] });
    /* What the sender has on SponsorX: a held athlete sign-up and a held sponsor request (the 2026-11-12 tester's case),
       an approved one, and — under another address — a guardian whose ward is held. */
    await prisma.athlete.create({ data: {
      id: "sib_ath_held", tenantId: T, slug: "sib-ath-held", legalName: "Serena Kay", displayName: "Serena", email: "Serena.K@sib-test.invalid",
      sport: "Track", stateCode: "IL", ageBand: "18_PLUS", state: "SUBMITTED", emailConfirmedAt: new Date(),
      reviewReasons: ["The ID doesn't read as a government ID"],
    } });
    await prisma.inquiry.create({ data: {
      id: "sib_req_held", tenantId: T, companyName: "Midwest Running Co", lastName: "Kay", email: SENDER, source: "web-form",
      reviewReasons: ["The proof of business doesn't name the business"],
    } });
    await prisma.inquiry.create({ data: {
      id: "sib_req_done", tenantId: T, companyName: "Old Request Co", lastName: "Kay", email: SENDER, source: "web-form", state: "APPROVED",
      reviewReasons: ["A leftover reason the approval cleared"],
    } });
    /* Same address in another tenant: never shown. */
    await prisma.inquiry.create({ data: { id: "sib_req_other", tenantId: OTHER_T, companyName: "Elsewhere Co", lastName: "Kay", email: SENDER, source: "web-form", reviewReasons: ["x"] } });
    await prisma.guardian.create({ data: { id: "sib_guardian", tenantId: T, legalName: "Gail Parent", email: "gail@sib-test.invalid", relationship: "PARENT", emailConfirmedAt: new Date() } });
    await prisma.athlete.create({ data: {
      id: "sib_ward", tenantId: T, slug: "sib-ward", legalName: "Milo Parent", displayName: "Milo", sport: "Soccer", stateCode: "IL", ageBand: "13_17",
      state: "SUBMITTED", guardianId: "sib_guardian", reviewReasons: ["Proof of guardianship is missing"],
    } });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise((r) => server?.close(r));
    await clean();
    await pool.end();
  });

  let msg = "";
  const TEXT = "Need full access to complete test run. My daughter Milo's papers are attached.";

  it("a contact-form message lands in the inbox as New; the support@ email is a notice with no message text", async () => {
    const r = await call("POST", "/public/support/messages", undefined, { name: "Serena Kay", email: SENDER, topic: "ACCOUNT", message: TEXT });
    expect(r.status, r.text).toBe(201);
    msg = r.json.id;

    const inbox = await call("GET", "/support-messages", "sib_admin");
    expect(inbox.status, inbox.text).toBe(200);
    expect(inbox.json.counts).toEqual({ NEW: 1, ANSWERED: 0, CLOSED: 0 });
    expect(inbox.json.messages).toEqual([expect.objectContaining({ id: msg, name: "Serena Kay", email: SENDER, topic: "ACCOUNT", topicLabel: "Account", status: "NEW", attachments: 0, replies: 0 })]);
    /* A row never carries the text. */
    expect(inbox.text).not.toContain("full access");

    const [notice, copy] = await jobs();
    expect(notice).toMatchObject({ template: "support.message", to: "help@sib-support.invalid", headers: { "Message-ID": `<support-${msg}@sponsorx.net>` } });
    expect(notice).not.toHaveProperty("replyTo");
    expect(JSON.stringify(notice)).not.toContain("full access");
    expect(notice!.data.openUrl).toMatch(new RegExp(`/admin/support/${msg}$`));
    /* The copy's payload holds only our words; no Reply-To into the mailbox. */
    expect(copy).toMatchObject({ template: "support.copy", to: SENDER, data: { topic: "Account", reference: msg } });
    expect(Object.keys(copy!.data).sort()).toEqual(["contactUrl", "reference", "topic"]);
    expect(copy).not.toHaveProperty("replyTo");

    process.env.RESEND_API_KEY = "re_test";
    await expect(handleSendEmail(pool, notice!)).resolves.toBe("sent");
    const out = sent.at(-1)!;
    expect(out).toMatchObject({ to: "help@sib-support.invalid", from: expect.stringContaining("noreply@sponsorx.net") });
    expect(out).not.toHaveProperty("replyTo");
    expect(String(out.text)).toContain(notice!.data.openUrl);
    expect(String(out.text)).not.toMatch(/full access|Milo/);
  });

  it("a notice queued before the change, still carrying the text, is sent without it", () => {
    const old = EMAIL_TEMPLATES["support.message"]!({ name: "Ana", email: "a@x.invalid", topic: "Guardianship", message: "SECRET minor details", reference: "sm_1", attachments: "birth-certificate-milo.pdf", attachmentsUrl: "https://app.test/admin/support/sm_1" });
    expect(old.text).not.toMatch(/SECRET|birth-certificate/);
    expect(old.text).toContain("https://app.test/admin/support/sm_1");
  });

  it("the message shows what the sender has on SponsorX — held records first, with their reasons and BTG's page; nothing from another tenant", async () => {
    const r = await call("GET", `/support-messages/${msg}`, "sib_admin");
    expect(r.status, r.text).toBe(200);
    expect(r.json).toMatchObject({ id: msg, message: TEXT, status: "NEW", replies: [], sender: { held: 2 } });
    const records = r.json.sender.records as { kind: string; id: string; held: boolean; reasons: string[]; adminPath: string | null }[];
    expect(records.map((x) => x.id).sort()).toEqual(["sib_ath_held", "sib_req_done", "sib_req_held"]);
    expect(records.slice(0, 2).every((x) => x.held)).toBe(true);
    expect(records.find((x) => x.id === "sib_ath_held")).toMatchObject({ kind: "ATHLETE", held: true, reasons: ["The ID doesn't read as a government ID"], adminPath: "/admin/new-signups/athletes/sib_ath_held" });
    expect(records.find((x) => x.id === "sib_req_held")).toMatchObject({ kind: "SPONSOR_REQUEST", label: "Midwest Running Co", held: true, reasons: ["The proof of business doesn't name the business"], adminPath: "/admin/sponsor-requests/sib_req_held" });
    /* Not held: no reasons shown, even stale ones. */
    expect(records.find((x) => x.id === "sib_req_done")).toMatchObject({ held: false, reasons: [] });
    expect(r.text).not.toContain("tenantId");
  });

  it("a guardian's message shows their account and the athletes they look after", async () => {
    const r = await call("POST", "/public/support/messages", undefined, { name: "Gail Parent", email: "gail@sib-test.invalid", topic: "GUARDIANSHIP", message: "Why is Milo waiting?" });
    expect(r.status, r.text).toBe(201);
    const v = await call("GET", `/support-messages/${r.json.id}`, "sib_admin");
    expect(v.json.sender.records).toEqual([
      expect.objectContaining({ kind: "ATHLETE", relation: "WARD", id: "sib_ward", held: true, reasons: ["Proof of guardianship is missing"] }),
      expect.objectContaining({ kind: "GUARDIAN", relation: "SELF", id: "sib_guardian", state: "ACTIVE", adminPath: "/admin/new-signups/guardians/sib_guardian" }),
    ]);
    await call("POST", `/support-messages/${r.json.id}/close`, "sib_admin");
  });

  it("a reply sent from the inbox is kept, reaches the sender from noreply@ in their thread, and marks the message Answered", async () => {
    const before = (await jobs()).length;
    const r = await call("POST", `/support-messages/${msg}/replies`, "sib_admin", { body: "  Your ID and proof of business didn't match — please upload them again.  " });
    expect(r.status, r.text).toBe(201);
    expect(r.json).toMatchObject({ id: msg, status: "ANSWERED", reply: { body: "Your ID and proof of business didn't match — please upload them again.", authorId: "sib_admin" } });

    const job = (await jobs()).slice(before);
    expect(job).toHaveLength(1);
    expect(job[0]).toMatchObject({ template: "support.reply", to: SENDER, headers: { "In-Reply-To": `<support-${msg}@sponsorx.net>`, References: `<support-${msg}@sponsorx.net>` } });
    expect(job[0]).not.toHaveProperty("replyTo");
    await expect(handleSendEmail(pool, job[0]!)).resolves.toBe("sent");
    const out = sent.at(-1)!;
    expect(out).toMatchObject({ to: SENDER, from: expect.stringContaining("noreply@sponsorx.net") });
    expect(String(out.text)).toContain("please upload them again");
    /* Nothing the sender typed is echoed back (2S8-SEC-02). */
    expect(String(out.text)).not.toMatch(/Serena|full access/);

    const v = await call("GET", `/support-messages/${msg}`, "sib_admin");
    expect(v.json).toMatchObject({ status: "ANSWERED", answeredAt: expect.any(String) });
    expect(v.json.replies).toHaveLength(1);
    const inbox = await call("GET", "/support-messages?status=ANSWERED", "sib_admin");
    expect(inbox.json.counts).toMatchObject({ NEW: 0, ANSWERED: 1 });
    expect(inbox.json.messages.map((m: { id: string }) => m.id)).toEqual([msg]);
    const a = await prisma.auditLog.findFirst({ where: { tenantId: T, action: "support.replied", entityId: msg }, select: { actorId: true, after: true } });
    expect(a).toMatchObject({ actorId: "sib_admin", after: { status: "ANSWERED" } });
    expect(JSON.stringify(a)).not.toContain("upload them again");
  });

  it("an empty reply is refused; Mark closed closes it once; writing again reopens it as Answered", async () => {
    expect((await call("POST", `/support-messages/${msg}/replies`, "sib_admin", { body: "   " })).status).toBe(400);
    const c = await call("POST", `/support-messages/${msg}/close`, "sib_admin");
    expect(c.status, c.text).toBe(200);
    expect(c.json).toEqual({ id: msg, status: "CLOSED" });
    expect((await call("POST", `/support-messages/${msg}/close`, "sib_admin")).json).toEqual({ id: msg, status: "CLOSED" });
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "support.closed", entityId: msg } })).toBe(1);
    expect((await call("GET", "/support-messages?status=CLOSED&page=1", "sib_admin")).json).toMatchObject({ counts: { CLOSED: 2 }, page: { page: 1, total: 2 } });

    const again = await call("POST", `/support-messages/${msg}/replies`, "sib_admin", { body: "One more thing." });
    expect(again.json.status).toBe("ANSWERED");
    expect(await prisma.supportMessage.findUniqueOrThrow({ where: { id: msg }, select: { status: true, closedAt: true } })).toEqual({ status: "ANSWERED", closedAt: null });
  });

  it("a message still waiting for its files is not in the inbox and can't be answered", async () => {
    const r = await call("POST", "/public/support/messages", undefined, {
      name: "Dana", email: "dana@sib-test.invalid", topic: "OTHER", message: "File coming", attachments: [{ filename: "a.pdf", contentType: "application/pdf", bytes: 1000 }],
    });
    expect(r.status, r.text).toBe(201);
    const inbox = await call("GET", "/support-messages", "sib_admin");
    expect(inbox.json.messages.map((m: { id: string }) => m.id)).not.toContain(r.json.id);
    expect((await call("POST", `/support-messages/${r.json.id}/replies`, "sib_admin", { body: "Hi" })).status).toBe(409);
  });

  it("BTG admins only: Finance, a campaign manager and another tenant's admin are refused, as is nobody signed in", async () => {
    for (const who of ["sib_finance", "sib_cm", "sib_other_admin"]) {
      expect((await call("GET", `/support-messages/${msg}`, who)).status, who).toBe(403);
      expect((await call("POST", `/support-messages/${msg}/replies`, who, { body: "x" })).status, who).toBe(403);
      expect((await call("POST", `/support-messages/${msg}/close`, who)).status, who).toBe(403);
    }
    for (const who of ["sib_finance", "sib_cm"]) expect((await call("GET", "/support-messages", who)).status, who).toBe(403);
    /* Another tenant's admin sees their own (empty) inbox, never this one. */
    const other = await call("GET", "/support-messages", "sib_other_admin");
    expect(other.status, other.text).toBe(200);
    expect(other.json).toMatchObject({ messages: [], counts: { NEW: 0, ANSWERED: 0, CLOSED: 0 } });
    expect((await call("GET", "/support-messages", undefined)).status).toBe(401);
    expect(await prisma.supportReply.count({ where: { messageId: msg } })).toBe(2);
  });
});
