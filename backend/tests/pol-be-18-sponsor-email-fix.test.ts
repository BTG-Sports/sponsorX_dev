import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   POL-BE-18 — a sponsor can resend the confirmation email or fix a mistyped
   address.

   "The sponsor is stuck for the 14 days until the request lapses. Fix:
   'Resend email' and 'Change email' on the request status page, rate
   limited."

   Both act through the request token the status page holds, only while the
   address is unconfirmed. Confirmation links are now bound to the address,
   so a link sent to a corrected-away address confirms nothing.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
process.env.PUBLIC_INTAKE_TENANT_ID = "be18_btg";

/* The per-network-address limit is Redis's; the per-request cap is the domain's own and stays real. */
vi.mock("../src/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/rate-limit")>()),
  limit: async () => {},
}));
vi.mock("../src/auth/clerk", () => ({ authenticateClerkRequest: async () => null }));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("POL-BE-18 · resend the confirmation, or fix the address", async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { issueLink } = await import("../src/lib/signed-link");
  const { SPONSOR_EMAIL_LINK, issueSponsorEmailToken } = await import("../src/lib/sponsor-request-token");

  const T = "be18_btg";
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  let n = 0;

  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };
  type Mail = { template: string; to: string; data: Record<string, string> };
  const confirmations = async (to: string) =>
    (await prisma.outboxJob.findMany({ where: { tenantId: T, name: "notify.email" }, select: { payload: true }, orderBy: { createdAt: "asc" } }))
      .map((o) => o.payload as Mail)
      .filter((m) => m.to === to);
  const linkIn = (m: Mail) => new URL(m.data.confirmUrl ?? m.data.url ?? m.data.link!).searchParams.get("t")!;

  /** A fresh request from the form; returns its id, the status page's token and the emailed link. */
  const ask = async (email: string) => {
    const r = await call("POST", "/public/inquiries", { companyName: `Harbor ${++n}`, firstName: "Ada", lastName: "Lane", email, businessType: "RESTAURANT" });
    expect(r.status, r.text).toBe(201);
    const mail = (await confirmations(email)).find((m) => m.template === "sponsor.confirmEmail")!;
    return { id: r.json.id as string, token: encodeURIComponent(r.json.requestToken as string), link: linkIn(mail) };
  };
  const confirm = (t: string) => call("POST", "/public/sponsor-requests/confirm-email", { token: t });
  const audits = (id: string, action: string) => prisma.auditLog.findMany({ where: { tenantId: T, entityId: id, action }, select: { before: true, after: true } });

  async function clean() {
    const tables = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 4; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = $1`, T).catch(() => {});
      }
    }
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "BE18 BTG" } });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server?.close();
    await clean();
  });

  it("Resend email sends a fresh link to the address on file, at most 3 an hour per request", async () => {
    const a = await ask("ada.resend@be18.invalid");
    for (let i = 0; i < 3; i++) {
      const r = await call("POST", `/public/sponsor-requests/${a.token}/resend-confirmation`);
      expect(r.status, r.text).toBe(202);
      expect(r.json).toEqual({ sent: true, email: "ada.resend@be18.invalid" });
    }
    expect((await confirmations("ada.resend@be18.invalid")).filter((m) => m.template === "sponsor.confirmEmail")).toHaveLength(4);
    expect(await audits(a.id, "sponsorRequest.confirmationResent")).toHaveLength(3);
    expect((await call("POST", `/public/sponsor-requests/${a.token}/resend-confirmation`)).status).toBe(429);
    /* The resent link confirms. */
    const last = (await confirmations("ada.resend@be18.invalid")).at(-1)!;
    expect((await confirm(linkIn(last))).status).toBe(200);
  });

  it("Change email corrects the address, sends to the new one, and the old link stops working", async () => {
    const a = await ask("ada@gmial.invalid");
    const r = await call("POST", `/public/sponsor-requests/${a.token}/email`, { email: "ada@gmail-be18.invalid" });
    expect(r.status, r.text).toBe(200);
    expect(r.json).toEqual({ sent: true, email: "ada@gmail-be18.invalid" });
    const status = await call("GET", `/public/sponsor-requests/${a.token}`);
    expect(status.json).toMatchObject({ email: "ada@gmail-be18.invalid", emailConfirmed: false });
    expect(await audits(a.id, "sponsorRequest.emailChanged")).toEqual([
      { before: { email: "ada@gmial.invalid" }, after: { email: "ada@gmail-be18.invalid" } },
    ]);
    /* The link sent to the mistyped address confirms nothing now. */
    expect((await confirm(a.link)).status).toBe(400);
    const fresh = (await confirmations("ada@gmail-be18.invalid")).find((m) => m.template === "sponsor.confirmEmail")!;
    const ok = await confirm(linkIn(fresh));
    expect(ok.status, ok.text).toBe(200);
    expect(ok.json).toMatchObject({ email: "ada@gmail-be18.invalid", emailConfirmed: true });
  });

  it("once the address is confirmed, neither can be used", async () => {
    const a = await ask("ada.done@be18.invalid");
    expect((await confirm(a.link)).status).toBe(200);
    expect((await call("POST", `/public/sponsor-requests/${a.token}/resend-confirmation`)).status).toBe(409);
    expect((await call("POST", `/public/sponsor-requests/${a.token}/email`, { email: "someone.else@be18.invalid" })).status).toBe(409);
    expect((await prisma.inquiry.findUniqueOrThrow({ where: { id: a.id }, select: { email: true } })).email).toBe("ada.done@be18.invalid");
  });

  it("a decided request, the same address, a bad address or a forged token is refused", async () => {
    const a = await ask("ada.decided@be18.invalid");
    expect((await call("POST", `/public/sponsor-requests/${a.token}/email`, { email: "ADA.decided@be18.invalid" })).status).toBe(422);
    expect((await call("POST", `/public/sponsor-requests/${a.token}/email`, { email: "not-an-address" })).status).toBe(400);
    await prisma.inquiry.update({ where: { id: a.id }, data: { state: "DECLINED", decidedAt: new Date(), decisionNote: "Not a fit" } });
    expect((await call("POST", `/public/sponsor-requests/${a.token}/resend-confirmation`)).status).toBe(409);
    expect((await call("POST", `/public/sponsor-requests/forged.token.value/resend-confirmation`)).status).toBe(400);
    expect((await call("POST", `/public/sponsor-requests/forged.token.value/email`, { email: "x@be18.invalid" })).status).toBe(400);
  });

  it("changes are capped at 3 an hour per request", async () => {
    const a = await ask("cap0@be18.invalid");
    for (let i = 1; i <= 3; i++) {
      expect((await call("POST", `/public/sponsor-requests/${a.token}/email`, { email: `cap${i}@be18.invalid` })).status).toBe(200);
    }
    expect((await call("POST", `/public/sponsor-requests/${a.token}/email`, { email: "cap4@be18.invalid" })).status).toBe(429);
  });

  it("a link sent before links were bound still confirms an unchanged address — and nothing after a change", async () => {
    const a = await ask("ada.legacy@be18.invalid");
    const unbound = issueLink(SPONSOR_EMAIL_LINK, a.id);
    expect((await confirm(unbound)).status).toBe(200);

    const b = await ask("bo.legacy@be18.invalid");
    const oldUnbound = issueLink(SPONSOR_EMAIL_LINK, b.id);
    expect((await call("POST", `/public/sponsor-requests/${b.token}/email`, { email: "bo.fixed@be18.invalid" })).status).toBe(200);
    expect((await confirm(oldUnbound)).status).toBe(400);
    /* Nor an undated one, from before links carried a date: it never named an address either. */
    const { createHmac } = await import("node:crypto");
    const { env } = await import("../src/config/env");
    const undated = `${b.id}.${createHmac("sha256", env.INTAKE_TOKEN_SECRET).update(`sponsor-request-email:${b.id}`).digest("base64url")}`;
    expect((await confirm(undated)).status).toBe(400);
  });

  it("an expired link is renewed to the current address; one bound to the old address renews nothing", async () => {
    const a = await ask("ren.old@be18.invalid");
    const expiredOld = issueSponsorEmailToken(a.id, "ren.old@be18.invalid", new Date(Date.now() - 20 * 86_400_000));
    expect((await call("POST", `/public/sponsor-requests/${a.token}/email`, { email: "ren.new@be18.invalid" })).status).toBe(200);
    const before = (await confirmations("ren.new@be18.invalid")).length;

    expect((await call("POST", "/public/links/renew", { kind: "sponsor-request-email", token: expiredOld })).status).toBe(202);
    expect((await confirmations("ren.new@be18.invalid")).length).toBe(before);
    expect((await confirmations("ren.old@be18.invalid")).length).toBe(1);

    const expiredNew = issueSponsorEmailToken(a.id, "ren.new@be18.invalid", new Date(Date.now() - 20 * 86_400_000));
    expect((await confirm(expiredNew)).status).toBe(410);
    expect((await call("POST", "/public/links/renew", { kind: "sponsor-request-email", token: expiredNew })).status).toBe(202);
    const renewed = (await confirmations("ren.new@be18.invalid")).at(-1)!;
    expect(renewed.template).not.toBe("sponsor.confirmEmail");
    expect((await confirm(linkIn(renewed))).status).toBe(200);
  });
});
