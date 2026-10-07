import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   2S8-PMO-02, owner decision 5 (2026-10-06) — a profile claimant confirms
   their email before a school's advisor can verify the claim.

   The whole path, over HTTP against the database: an unconfirmed claim is
   neither listed nor verifiable; the emailed link confirms it (as a click,
   through the redirect, and as JSON); then it is verifiable; an expired link
   is refused and a fresh one is mailed; a tampered link is refused; each
   step is audited; the database refuses a SUBMITTED claim with no
   confirmation.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
process.env.APP_URL = "https://web.pmo02.example";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@pmo02-claim.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();
const { issueClaimEmailToken, readClaimEmailToken } = await import("../src/lib/claim-token");
const { LinkExpiredError } = await import("../src/lib/signed-link");

const DAY = 86_400_000;

describe("the claim link itself", () => {
  it("is a 14-day signed link of its own kind, with no undated form", () => {
    const t0 = new Date("2026-11-02T09:00:00Z");
    const t = issueClaimEmailToken("cl_1", t0);
    expect(readClaimEmailToken(t, new Date(t0.getTime() + 13 * DAY + 23 * 3_600_000))).toBe("cl_1");
    expect(() => readClaimEmailToken(t, new Date(t0.getTime() + 14 * DAY + 60_000))).toThrow(LinkExpiredError);
    /* No pre-decision form: an undated token is never ours, before or after the cutoff. */
    const undated = `cl_1.${createHmac("sha256", "dev-intake-secret-not-for-production").update("athlete-claim-email:cl_1").digest("base64url")}`;
    expect(readClaimEmailToken(undated, new Date("2026-10-07T00:00:00Z"))).toBeNull();
  });
});

describe.skipIf(!hasDatabase)("2S8-PMO-02 · profile claim: email first, then the school", { timeout: 60_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const featured = await import("../src/domain/featured");

  const T = "pmo02_claim";
  const staff = { userId: "pmo02c_staff", tenantId: T, roles: ["BTG_ADMIN"] } as unknown as Parameters<typeof featured.createFeaturedAthlete>[0];
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  let slug = "";
  let athleteId = "";

  const call = async (method: string, path: string, clerk: string | null, body?: unknown) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method, redirect: "manual",
      headers: { "content-type": "application/json", ...(clerk ? { "x-test-clerk": clerk } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, location: res.headers.get("location"), json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };
  const claimEmails = async () =>
    (await prisma.outboxJob.findMany({ where: { tenantId: T, name: "notify.email" }, select: { payload: true }, orderBy: { createdAt: "asc" } }))
      .map((j) => j.payload as { template: string; to: string; idempotencyKey: string; data: Record<string, string> })
      .filter((m) => m.template === "athleteClaim.confirmEmail");
  const tokenIn = (url: string) => decodeURIComponent(url.split("confirm?t=")[1]!);
  const listed = async () => ((await call("GET", "/claims", "pmo02c_advisor")).json.claims as Array<{ id: string; state: string }>).map((c) => c.id);
  const auditsOf = async (entityId: string) =>
    (await prisma.auditLog.findMany({ where: { tenantId: T, entityId }, select: { action: true }, orderBy: [{ at: "asc" }, { id: "asc" }] })).map((a) => a.action);

  async function clean() {
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 5; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = $1`, T).catch(() => {});
      }
    }
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "PMO-02 claims" } });
    await prisma.property.create({ data: { id: "pmo02c_school", tenantId: T, slug: "pmo02c-northside", name: "Northside High", kind: "SCHOOL" } });
    await prisma.user.createMany({ data: [
      { id: "pmo02c_staff", tenantId: T, clerkId: "pmo02c_staff", email: "ops@pmo02-claim.invalid", roles: ["BTG_ADMIN"] },
      { id: "pmo02c_advisor", tenantId: T, clerkId: "pmo02c_advisor", email: "adv@pmo02-claim.invalid", roles: ["ADVISOR"], propertyId: "pmo02c_school" },
    ] });
    await prisma.rosterEntry.create({ data: { tenantId: T, propertyId: "pmo02c_school", legalName: "Maya Thompson", gradYear: 2028 } });
    ({ id: athleteId, slug } = await featured.createFeaturedAthlete(staff, { displayName: "Maya T.", sport: "Basketball", propertyId: "pmo02c_school" }));
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server?.close();
    await clean();
  });

  let claimId = "";

  it("a new claim is PENDING_EMAIL, and the claimant is emailed a 14-day link to the web app", async () => {
    const r = await call("POST", `/public/athletes/${slug}/claim`, null, { claimantName: "Maya Thompson", claimantEmail: "Maya@Family.invalid", birthDate: "2010-02-02" });
    expect(r.status).toBe(201);
    expect(r.json).toEqual({ id: expect.any(String), state: "PENDING_EMAIL" });
    claimId = r.json.id;
    const mail = await claimEmails();
    expect(mail).toHaveLength(1);
    expect(mail[0]).toMatchObject({ to: "maya@family.invalid", data: { firstName: "Maya", days: "14", profileUrl: `https://web.pmo02.example/athletes/${slug}` } });
    /* 2S8-FE-02: the link lands on the web app's own page, whose button POSTs the confirmation. */
    expect(mail[0]!.data.confirmUrl).toMatch(/^https:\/\/web\.pmo02\.example\/athletes\/claim\/confirm\?t=/);
    expect(readClaimEmailToken(tokenIn(mail[0]!.data.confirmUrl!))).toBe(claimId);
    expect(await auditsOf(claimId)).toEqual(["athleteClaim.submit"]);
  });

  it("unconfirmed: the advisor neither sees it, nor counts it, nor can verify or reject it", async () => {
    expect(await listed()).not.toContain(claimId);
    const paged = await call("GET", "/claims?page=1", "pmo02c_advisor");
    expect(paged.json.summary).toEqual({ open: 0, all: 0 });
    expect((await call("POST", `/claims/${claimId}/verify`, "pmo02c_advisor")).status).toBe(403);
    expect((await call("POST", `/claims/${claimId}/reject`, "pmo02c_advisor")).status).toBe(403);
    expect((await prisma.athlete.findUniqueOrThrow({ where: { id: athleteId }, select: { state: true, email: true } }))).toEqual({ state: "FEATURED", email: null });
  });

  it("a tampered link is refused and confirms nothing", async () => {
    const good = tokenIn((await claimEmails())[0]!.data.confirmUrl!);
    const [id, exp, sig] = good.split(".");
    for (const bad of [`${id}.${Number(exp) + 86_400}.${sig}`, `${id}.${exp}.${sig!.slice(0, -2)}AA`, `other_claim.${exp}.${sig}`, "nonsense"]) {
      const click = await call("GET", `/public/athlete-claims/confirm?t=${encodeURIComponent(bad)}`, null);
      expect(click.status).toBe(302);
      expect(click.location).toBe("https://web.pmo02.example/?claim=invalid");
      expect((await call("POST", "/public/athlete-claims/confirm-email", null, { token: bad })).status).toBe(400);
    }
    expect((await prisma.athleteClaim.findUniqueOrThrow({ where: { id: claimId }, select: { state: true } })).state).toBe("PENDING_EMAIL");
  });

  it("an expired link is refused (410 as JSON); clicked, it mails a fresh link and says so", async () => {
    const old = issueClaimEmailToken(claimId, new Date(Date.now() - 15 * DAY));
    const json = await call("POST", "/public/athlete-claims/confirm-email", null, { token: old });
    expect(json.status).toBe(410);
    expect(json.json.error).toMatchObject({ code: "link_expired", kind: "claim-email", renew: { path: "/api/v1/public/links/renew", body: { kind: "claim-email" } } });
    const click = await call("GET", `/public/athlete-claims/confirm?t=${encodeURIComponent(old)}`, null);
    expect(click.status).toBe(302);
    expect(click.location).toBe(`https://web.pmo02.example/athletes/${slug}?claim=expired-resent`);
    const mail = await claimEmails();
    expect(mail).toHaveLength(2);
    expect(mail[1]!.to).toBe("maya@family.invalid");
    expect(readClaimEmailToken(tokenIn(mail[1]!.data.confirmUrl!))).toBe(claimId);
    /* The renew endpoint does the same, once an hour. */
    await call("POST", "/public/links/renew", null, { kind: "claim-email", token: old });
    expect(new Set((await claimEmails()).map((m) => m.idempotencyKey)).size).toBe(2);
    expect((await prisma.athleteClaim.findUniqueOrThrow({ where: { id: claimId }, select: { state: true } })).state).toBe("PENDING_EMAIL");
  });

  it("the link, clicked: confirmed, redirected to the profile, audited — and now the advisor sees it", async () => {
    const t = tokenIn((await claimEmails())[0]!.data.confirmUrl!);
    const click = await call("GET", `/public/athlete-claims/confirm?t=${encodeURIComponent(t)}`, null);
    expect(click).toMatchObject({ status: 302, location: `https://web.pmo02.example/athletes/${slug}?claim=confirmed` });
    const row = await prisma.athleteClaim.findUniqueOrThrow({ where: { id: claimId }, select: { state: true, emailConfirmedAt: true } });
    expect(row.state).toBe("SUBMITTED");
    expect(row.emailConfirmedAt).toBeInstanceOf(Date);
    /* Opening it again changes nothing and audits nothing more. */
    expect((await call("POST", "/public/athlete-claims/confirm-email", null, { token: t })).json).toEqual({ state: "SUBMITTED", slug });
    expect(await auditsOf(claimId)).toEqual(["athleteClaim.submit", "link.renewed", "athleteClaim.emailConfirmed"]);
    expect(await listed()).toContain(claimId);
    expect((await call("GET", "/claims?page=1", "pmo02c_advisor")).json.summary).toEqual({ open: 1, all: 1 });
  });

  it("confirmed: verifiable, and the verification is audited", async () => {
    expect((await call("POST", `/claims/${claimId}/verify`, "pmo02c_advisor")).json).toEqual({ athleteId, state: "UNDER_REVIEW" });
    expect(await prisma.athlete.findUniqueOrThrow({ where: { id: athleteId }, select: { email: true } })).toEqual({ email: "maya@family.invalid" });
    const verified = await prisma.auditLog.count({ where: { tenantId: T, action: "athleteClaim.verify", entityId: athleteId } });
    expect(verified).toBe(1);
  });

  it("the database itself refuses a SUBMITTED claim with no confirmation", async () => {
    await expect(prisma.athleteClaim.create({
      data: { tenantId: T, athleteId, claimantName: "Nobody", claimantEmail: "n@pmo02-claim.invalid", state: "SUBMITTED" },
      select: { id: true },
    })).rejects.toThrow();
    const pending = await prisma.athleteClaim.create({
      data: { tenantId: T, athleteId, claimantName: "Nobody", claimantEmail: "n@pmo02-claim.invalid" },
      select: { state: true },
    });
    expect(pending.state).toBe("PENDING_EMAIL");
  });
});
