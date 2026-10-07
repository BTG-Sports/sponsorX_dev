import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   2S1-BE-16 — contacting BTG support, against the real API and database.
   Done when:

     Anyone can send BTG a message with an attachment from the contact page;
     it reaches the support mailbox through the queue even when the mail
     service is briefly down; the support address appears on the guardian
     request page and in decline and rejection emails; the form is
     rate-limited and stores attachments privately.

   (The address on the guardian pages and in the decline and rejection
   emails is asserted in phase2-guardian-handoff and phase2-account-closure.)
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
process.env.PUBLIC_INTAKE_TENANT_ID = "sp_btg";
process.env.SUPPORT_EMAIL = "help@btg-support.invalid";

const { uploaded, limited, sent } = vi.hoisted(() => ({
  uploaded: new Set<string>(), limited: [] as string[], sent: [] as Record<string, unknown>[],
}));
vi.mock("../src/lib/storage", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/lib/storage")>();
  return { ...real, checkPrivateUpload: async (_actor: unknown, key: string) => (uploaded.has(key) ? { ok: true as const, bytes: 40_000 } : { ok: false as const, problem: "missing" as const }) };
});
vi.mock("../src/lib/rate-limit", () => ({ limit: async (key: string) => { limited.push(key); } }));
/* The vendor: refuses the first attempt (a bad minute), then accepts. */
vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: async (m: Record<string, unknown>) => {
        sent.push(m);
        return sent.length === 1 ? { error: { message: "503 Service Unavailable" } } : { data: { id: "em" }, error: null };
      },
    };
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("2S1-BE-16 · contacting BTG support", { timeout: 90_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const pg = (await import("pg")).default;
  const { handleSendEmail } = await import("../worker/jobs/send-email.mts");

  const T = "sp_btg";
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";

  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };
  const jobs = async () => (await prisma.outboxJob.findMany({ where: { tenantId: T, name: "notify.email" }, select: { payload: true }, orderBy: { createdAt: "asc" } }))
    .map((j) => j.payload as { tenantId: string; template: string; to: string; data: Record<string, string>; idempotencyKey: string; replyTo?: string; headers?: Record<string, string>; attachments?: { filename: string; key: string; contentType: string }[] });

  async function clean() {
    for (const t of ["SupportAttachment", "SupportMessage", "OutboxJob", "AuditLog", "EmailSendLog"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => {});
    }
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "Support BTG" } });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server?.close();
    await clean();
    await pool.end();
  });

  it("every rejection and decline email names the support address", async () => {
    const { EMAIL_TEMPLATES } = await import("../worker/jobs/send-email.mts");
    for (const t of ["athlete.rejected", "onboarding.rejected"]) {
      expect(EMAIL_TEMPLATES[t]!({}).text, t).toContain("help@btg-support.invalid");
    }
    /* These are sent with the address in their data (asserted where they are sent). */
    for (const t of [
      "sponsor.accountRejected", "handoff.declined", "account.reactivationDeclined", "handoff.confirmEmail", "handoff.requested",
      /* Added at the merge of Groups A, B1 and B2 (2S1-BE-16): the organisation's Reject, the sponsor's decline, and B1's athlete and guardian Rejects. */
      "onboarding.accountRejected", "sponsor.requestDeclined", "athlete.accountRejected", "guardian.accountRejected", "guardian.replacedByBtg",
      /* BTG's decline of a handed-off guardian request (2S2 review fix). */
      "handoff.declinedByBtg",
    ]) {
      expect(EMAIL_TEMPLATES[t]!({ supportEmail: "help@btg-support.invalid" }).text, t).toContain("help@btg-support.invalid");
    }
  });

  it("the page reads the configurable support address, whether it is live yet, and the four topics", async () => {
    expect((await call("GET", "/public/support")).json).toEqual({
      email: "help@btg-support.invalid", ready: false,
      topics: [{ key: "GUARDIANSHIP", label: "Guardianship" }, { key: "ACCOUNT", label: "Account" }, { key: "PAYMENT", label: "Payment" }, { key: "OTHER", label: "Other" }],
    });
  });

  it("a message with no attachments is queued at once: to the mailbox (Reply-To the sender) and a copy to the sender", async () => {
    limited.length = 0;
    const r = await call("POST", "/public/support/messages", { name: "Luis Reyes", email: "Luis@sp-test.invalid", topic: "GUARDIANSHIP", message: "Carmen declined, but I have a court order." });
    expect(r.status, r.text).toBe(201);
    expect(r.json).toMatchObject({ queued: true, token: null, uploads: [], supportEmail: "help@btg-support.invalid" });
    expect(limited).toEqual(["support:message", "support:message:sender"]);
    const [toDesk, copy] = await jobs();
    expect(toDesk).toMatchObject({
      template: "support.message", to: "help@btg-support.invalid", replyTo: "luis@sp-test.invalid",
      headers: { "Message-ID": `<support-${r.json.id}@sponsorx.net>` }, data: { topic: "Guardianship", name: "Luis Reyes", reference: r.json.id },
    });
    expect(copy).toMatchObject({ template: "support.copy", to: "luis@sp-test.invalid", headers: { "In-Reply-To": `<support-${r.json.id}@sponsorx.net>` } });
    expect((await prisma.supportMessage.findUniqueOrThrow({ where: { id: r.json.id }, select: { state: true } })).state).toBe("QUEUED");
  });

  it("anything else is refused before it is stored", async () => {
    expect((await call("POST", "/public/support/messages", { name: "X", email: "x@sp-test.invalid", topic: "LEGAL", message: "hi" })).status).toBe(400);
    expect((await call("POST", "/public/support/messages", { name: "X", email: "x@sp-test.invalid", topic: "OTHER", message: "hi", attachments: [{ filename: "a.exe", contentType: "application/x-msdownload", bytes: 10 }] })).status).toBe(400);
    expect((await call("POST", "/public/support/messages", { name: "X", email: "x@sp-test.invalid", topic: "OTHER", message: "hi", attachments: [{ filename: "a.pdf", contentType: "application/pdf", bytes: 11 * 1024 * 1024 }] })).status).toBe(400);
  });

  let withFile = { id: "", token: "" };
  it("an attachment goes straight to the private bucket; the message waits until it has arrived", async () => {
    const r = await call("POST", "/public/support/messages", {
      name: "Dana Brooks", email: "dana@sp-test.invalid", topic: "ACCOUNT", message: "My account was rejected — here is my license.",
      attachments: [{ filename: "../license.pdf", contentType: "application/pdf", bytes: 40_000 }],
    });
    expect(r.status, r.text).toBe(201);
    expect(r.json).toMatchObject({ queued: false, uploads: [expect.objectContaining({ filename: "license.pdf", uploadUrl: expect.stringMatching(/sponsorx-private/) })] });
    withFile = { id: r.json.id, token: r.json.token };
    const grant = await prisma.auditLog.findFirstOrThrow({ where: { tenantId: T, action: "storage.privateUploadGrant", entity: "SupportAttachment" }, select: { after: true } });
    expect(grant.after).toMatchObject({ bucket: "sponsorx-private" });
    expect((await call("POST", `/public/support/messages/${encodeURIComponent(withFile.token)}/send`)).status).toBe(409);
    expect((await jobs()).filter((j) => j.to === "dana@sp-test.invalid")).toHaveLength(0);
    const att = await prisma.supportAttachment.findFirstOrThrow({ where: { tenantId: T, messageId: withFile.id }, select: { r2Key: true } });
    uploaded.add(att.r2Key);
    const done = await call("POST", `/public/support/messages/${encodeURIComponent(withFile.token)}/send`);
    expect(done.json).toMatchObject({ queued: true });
    const desk = (await jobs()).find((j) => j.template === "support.message" && j.replyTo === "dana@sp-test.invalid")!;
    /* 2S0-SEC-01 (O1) — the desk's job names the file and links to BTG's signed-in page; it carries no file and no key. */
    const { env } = await import("../src/config/env");
    expect(desk.attachments).toBeUndefined();
    expect(JSON.stringify(desk)).not.toContain(att.r2Key);
    expect(desk.data.attachments).toBe("license.pdf");
    expect(desk.data.attachmentsUrl).toBe(`${env.APP_URL.replace(/\/+$/, "")}/admin/support/${withFile.id}`);
    expect((await call("POST", `/public/support/messages/${encodeURIComponent(withFile.token)}x/send`)).status).toBe(400);
  });

  it("the worker sends it naming the file and linking to BTG's signed-in page, never attaching it — and when the mail service is briefly down, the retry still delivers it, once", async () => {
    process.env.RESEND_API_KEY = "re_test";
    const desk = (await jobs()).find((j) => j.template === "support.message" && j.replyTo === "dana@sp-test.invalid")!;
    await expect(handleSendEmail(pool, desk)).rejects.toThrow(/503/);
    expect(await prisma.emailSendLog.count({ where: { idempotencyKey: desk.idempotencyKey } })).toBe(0);
    await expect(handleSendEmail(pool, desk)).resolves.toBe("sent");
    await expect(handleSendEmail(pool, desk)).resolves.toBe("duplicate");
    expect(sent).toHaveLength(2);
    expect(sent[1]).toMatchObject({
      to: "help@btg-support.invalid", replyTo: "dana@sp-test.invalid",
      headers: { "Message-ID": `<support-${withFile.id}@sponsorx.net>` },
    });
    expect(sent[1]).not.toHaveProperty("attachments");
    expect(sent[1]!.text).toContain(`Attachments: license.pdf — not attached to this email. Open them in SponsorX (BTG sign-in required): ${desk.data.attachmentsUrl}`);
    /* A job queued before the change, still naming a key, is sent without reading it. */
    const old = { ...desk, idempotencyKey: `${desk.idempotencyKey}:old`, attachments: [{ filename: "license.pdf", key: "support/x/y/license.pdf", contentType: "application/pdf" }] };
    await expect(handleSendEmail(pool, old)).resolves.toBe("sent");
    expect(sent[2]).not.toHaveProperty("attachments");
    await prisma.emailSendLog.deleteMany({ where: { idempotencyKey: old.idempotencyKey } });
  });
});
