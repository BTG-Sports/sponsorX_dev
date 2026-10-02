import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { reactivationStanding, retainUntilFrom, retentionDaysLeft } from "../src/domain/account-closure-rules";

/* --------------------------------------------------------------------------
   2S1-BE-13 — closing an account, 30-day retention and coming back, against
   the real API and database. Done when:

     Closing an account keeps its files for 30 days and then deletes them
     permanently, with an audit record; returning within 30 days through the
     reactivation page restores the account and its files (self-closed) or
     asks BTG (rejected); after 30 days the files are gone and a new sign-up
     is needed.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

const { limited } = vi.hoisted(() => ({ limited: [] as string[] }));
vi.mock("../src/lib/rate-limit", () => ({ limit: async (key: string) => { limited.push(key); } }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@ac-test.invalid` } : null;
  },
}));

describe("the rules (pure)", () => {
  const now = new Date("2026-10-01T12:00:00Z");
  it("keeps files 30 days; the owner may come back inside them, a rejected account may only ask", () => {
    const until = retainUntilFrom(now);
    expect(until.toISOString()).toBe("2026-10-31T12:00:00.000Z");
    expect(retentionDaysLeft(until, now)).toBe(30);
    expect(reactivationStanding({ cause: "SELF", state: "CLOSED", retainUntil: until }, now)).toBe("CLOSED_SELF");
    expect(reactivationStanding({ cause: "REJECTED", state: "CLOSED", retainUntil: until }, now)).toBe("CLOSED_BY_BTG");
    expect(reactivationStanding({ cause: "SELF", state: "CLOSED", retainUntil: until }, new Date("2026-11-01T00:00:00Z"))).toBe("EXPIRED");
    expect(reactivationStanding({ cause: "SELF", state: "PURGED", retainUntil: until }, now)).toBe("EXPIRED");
    expect(reactivationStanding({ cause: "SELF", state: "REACTIVATED", retainUntil: until }, now)).toBe("REACTIVATED");
  });
});

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("2S1-BE-13 · closing an account and coming back", { timeout: 90_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { purgeExpiredClosures } = await import("../src/domain/account-closure");

  const T = "ac_btg";
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
    .map((j) => j.payload as { template: string; to: string; data: Record<string, string> });
  const tokenFrom = (url: string) => new URL(url).searchParams.get("t")!;
  const lastLink = async (template: string, to: string) => tokenFrom((await emails()).filter((m) => m.template === template && m.to === to).at(-1)!.data.reactivateUrl!);

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
    await prisma.tenant.create({ data: { id: T, name: "Closure BTG" } });
    await prisma.athlete.createMany({ data: [
      { id: "ac_riley", tenantId: T, slug: "ac-riley", legalName: "Riley Stone", displayName: "Riley", email: "ac_riley@ac-test.invalid", sport: "Soccer", ageBand: "18_PLUS", state: "ACTIVE" },
      { id: "ac_sam", tenantId: T, slug: "ac-sam", legalName: "Sam Lee", displayName: "Sam", email: "ac_sam@ac-test.invalid", sport: "Track", ageBand: "18_PLUS", state: "ACTIVE" },
    ] });
    await prisma.property.create({ data: { id: "ac_hawks", tenantId: T, slug: "ac-hawks", name: "Westfield Hawks AC", kind: "TEAM", listingAccessAt: new Date() } });
    await prisma.propertyOnboarding.create({ data: {
      id: "ac_onb", tenantId: T, orgType: "TEAM", orgName: "Westfield Hawks AC", state: "APPROVED", propertyId: "ac_hawks",
      documents: { create: [{ tenantId: T, kind: "BUSINESS_REGISTRATION", filename: "reg.pdf", contentType: "application/pdf", bytes: 100, r2Key: "onboarding/ac_onb/reg.pdf", uploadedAt: new Date() }] },
    } });
    await prisma.inventoryItem.createMany({ data: [
      { id: "ac_item_riley", tenantId: T, athleteId: "ac_riley", title: "Shout-out", kind: "OTHER", priceCents: 5000 },
      { id: "ac_item_hawks", tenantId: T, propertyId: "ac_hawks", title: "Banner", kind: "SIGNAGE", priceCents: 9000 },
    ] });
    await prisma.listing.createMany({ data: [
      { id: "ac_list_riley", tenantId: T, sellerAthleteId: "ac_riley", inventoryItemId: "ac_item_riley", title: "Riley shout-out", description: "A personal video shout-out for your team or business.", state: "PUBLISHED", publishedAt: new Date() },
      { id: "ac_list_hawks", tenantId: T, propertyId: "ac_hawks", inventoryItemId: "ac_item_hawks", title: "Hawks banner", description: "A courtside banner at every Hawks home game.", state: "PUBLISHED", publishedAt: new Date() },
    ] });
    await prisma.athleteProfileChange.create({ data: {
      id: "ac_pc_sam", tenantId: T, athleteId: "ac_sam", sections: ["identity"], fields: { legalName: "Samuel Lee" }, state: "APPROVED", sensitive: true,
      idDocumentKey: "athlete-ids/ac_sam/ac_pc_sam/passport.pdf", idDocumentFilename: "passport.pdf", idDocumentUploadedAt: new Date(),
    } });
    await prisma.sponsor.create({ data: { id: "ac_cafe", tenantId: T, name: "Harbor Cafe", categories: ["RESTAURANT"] } });
    await prisma.inquiry.create({ data: {
      id: "ac_inq", tenantId: T, companyName: "Harbor Cafe", firstName: "Dana", lastName: "Brooks", email: "ac_dana@ac-test.invalid", source: "web-form",
      state: "APPROVED", sponsorId: "ac_cafe", autoApproved: true,
      documents: { create: [{ id: "ac_inq_doc", tenantId: T, kind: "PROOF_OF_BUSINESS", filename: "license.pdf", contentType: "application/pdf", bytes: 100, r2Key: "sponsor-requests/ac_inq/ac_inq_doc/license.pdf", uploadedAt: new Date() }] },
    } });
    await prisma.user.createMany({ data: [
      { id: "ac_admin", tenantId: T, clerkId: "ac_admin", email: "ac_admin@ac-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "ac_u_riley", tenantId: T, clerkId: "ac_riley", email: "ac_riley@ac-test.invalid", roles: ["ATHLETE"], athleteId: "ac_riley" },
      { id: "ac_u_sam", tenantId: T, clerkId: "ac_sam", email: "ac_sam@ac-test.invalid", roles: ["ATHLETE"], athleteId: "ac_sam" },
      { id: "ac_u_pm", tenantId: T, clerkId: "ac_pm", email: "ac_pm@ac-test.invalid", roles: ["PROPERTY_MGR"], propertyId: "ac_hawks" },
      { id: "ac_u_dana", tenantId: T, clerkId: "ac_dana", email: "ac_dana@ac-test.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "ac_cafe" },
    ] });
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server?.close();
    await clean();
  });

  describe("an athlete closes their own account", () => {
    it("needs an explicit confirm; then the login is refused, the listings stop, and the way back is emailed", async () => {
      expect((await call("POST", "/me/close", "ac_riley", {})).status).toBe(400);
      const closed = await call("POST", "/me/close", "ac_riley", { confirm: true, reason: "Taking a season off" });
      expect(closed.status, closed.text).toBe(200);
      expect(closed.json).toMatchObject({ account: "ATHLETE", loginsSwitchedOff: 1, listingsPaused: 1 });

      const me = await call("GET", "/me", "ac_riley");
      expect(me.status).toBe(403);
      expect(me.json.error.code).toBe("account_disabled");
      expect(me.json.error.message).toMatch(/reactivated within 30 days/);
      expect((await prisma.listing.findUniqueOrThrow({ where: { id: "ac_list_riley" }, select: { state: true } })).state).toBe("PAUSED");

      const mail = (await emails()).find((m) => m.template === "account.closed" && m.to === "ac_riley@ac-test.invalid")!;
      expect(mail.data.reactivateUrl).toMatch(/\/reactivate\?t=/);
      const trail = await prisma.auditLog.findFirstOrThrow({ where: { tenantId: T, action: "account.close", entityId: "ac_riley" }, select: { actorId: true } });
      expect(trail.actorId).toBe("ac_u_riley");
    });

    it("the emailed link shows the 30 days; a forged one is refused", async () => {
      const t = await lastLink("account.closed", "ac_riley@ac-test.invalid");
      const s = await call("GET", `/public/account/reactivation/${encodeURIComponent(t)}`);
      expect(s.status, s.text).toBe(200);
      expect(s.json).toMatchObject({ standing: "CLOSED_SELF", kind: "ATHLETE", greeting: "Riley", daysLeft: 30, portalPath: "/athlete" });
      expect((await call("GET", `/public/account/reactivation/${encodeURIComponent(t)}x`)).status).toBe(400);
    });

    it("someone who lost the email asks for a new link; the answer never says whether an account exists", async () => {
      limited.length = 0;
      const a = await call("POST", "/public/account/reactivation-link", undefined, { email: "AC_Riley@ac-test.invalid" });
      const b = await call("POST", "/public/account/reactivation-link", undefined, { email: "nobody@ac-test.invalid" });
      expect([a.status, b.status]).toEqual([202, 202]);
      expect(a.json).toEqual(b.json);
      expect(limited).toEqual(expect.arrayContaining(["account:reactivation-link", "account:reactivation-link:mailbox"]));
      const links = (await emails()).filter((m) => m.template === "account.reactivationLink");
      expect(links.map((m) => m.to)).toEqual(["ac_riley@ac-test.invalid"]);
    });

    it("reactivating restores the login and the listing, re-runs the checks, and happens once", async () => {
      const t = await lastLink("account.reactivationLink", "ac_riley@ac-test.invalid");
      expect((await call("POST", `/public/account/reactivation/${encodeURIComponent(t)}`, undefined, { action: "REQUEST" })).status).toBe(409);
      const r = await call("POST", `/public/account/reactivation/${encodeURIComponent(t)}`, undefined, { action: "REACTIVATE" });
      expect(r.status, r.text).toBe(200);
      expect(r.json).toMatchObject({ standing: "REACTIVATED", recheckNotes: [expect.stringMatching(/Everything checked out/)] });
      expect((await call("GET", "/me", "ac_riley")).status).toBe(200);
      expect((await prisma.listing.findUniqueOrThrow({ where: { id: "ac_list_riley" }, select: { state: true } })).state).toBe("PUBLISHED");
      expect((await call("POST", `/public/account/reactivation/${encodeURIComponent(t)}`, undefined, { action: "REACTIVATE" })).json.standing).toBe("REACTIVATED");
      expect(await prisma.auditLog.count({ where: { tenantId: T, action: "account.reactivate" } })).toBe(1);
      expect((await emails()).filter((m) => m.template === "account.reactivated")).toHaveLength(1);
    });
  });

  describe("an organization closes its account", () => {
    it("listing access is withdrawn and its listings paused; coming back re-checks the onboarding and restores both", async () => {
      const c = await call("POST", "/me/close", "ac_pm", { confirm: true });
      expect(c.status, c.text).toBe(200);
      expect(c.json).toMatchObject({ account: "PROPERTY", listingsPaused: 1 });
      expect((await prisma.property.findUniqueOrThrow({ where: { id: "ac_hawks" }, select: { listingAccessAt: true } })).listingAccessAt).toBeNull();
      expect((await prisma.listing.findUniqueOrThrow({ where: { id: "ac_list_hawks" }, select: { state: true } })).state).toBe("PAUSED");
      const t = await lastLink("account.closed", "ac_pm@ac-test.invalid");
      const r = await call("POST", `/public/account/reactivation/${encodeURIComponent(t)}`, undefined, { action: "REACTIVATE" });
      expect(r.json).toMatchObject({ standing: "REACTIVATED", kind: "PROPERTY", portalPath: "/property" });
      expect((await prisma.property.findUniqueOrThrow({ where: { id: "ac_hawks" }, select: { listingAccessAt: true } })).listingAccessAt).not.toBeNull();
      expect((await prisma.listing.findUniqueOrThrow({ where: { id: "ac_list_hawks" }, select: { state: true } })).state).toBe("PUBLISHED");
    });
  });

  describe("a rejected account asks BTG; BTG decides", () => {
    let token = "";
    it("BTG's Reject starts the 30 days; the link can only ask, never reactivate", async () => {
      const rej = await call("POST", "/sponsor-requests/ac_inq/decision", "ac_admin", { decision: "REJECT", note: "The license is for another business." });
      expect(rej.status, rej.text).toBe(200);
      const rejection = (await emails()).find((m) => m.template === "sponsor.accountRejected")!;
      expect(rejection.data.supportEmail).toBe("support@sponsorx.net");
      const closure = await prisma.accountClosure.findFirstOrThrow({ where: { tenantId: T, subjectKind: "SPONSOR", subjectId: "ac_cafe" }, select: { cause: true, state: true, userIds: true } });
      expect(closure).toMatchObject({ cause: "REJECTED", state: "CLOSED", userIds: ["ac_u_dana"] });
      await call("POST", "/public/account/reactivation-link", undefined, { email: "ac_dana@ac-test.invalid" });
      token = await lastLink("account.reactivationLink", "ac_dana@ac-test.invalid");
      expect((await call("GET", `/public/account/reactivation/${encodeURIComponent(token)}`)).json).toMatchObject({ standing: "CLOSED_BY_BTG", kind: "SPONSOR" });
      expect((await call("POST", `/public/account/reactivation/${encodeURIComponent(token)}`, undefined, { action: "REACTIVATE" })).status).toBe(403);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: "ac_u_dana" }, select: { disabledAt: true } })).disabledAt).not.toBeNull();
    });

    it("asking emails BTG admins a link to the account; only BTG reads the requests", async () => {
      const ask = await call("POST", `/public/account/reactivation/${encodeURIComponent(token)}`, undefined, { action: "REQUEST", note: "The license is ours — here's the new one." });
      expect(ask.status, ask.text).toBe(200);
      expect(ask.json.requestedAt).toBeTruthy();
      const told = (await emails()).filter((m) => m.template === "account.reactivationRequested");
      expect(told.map((m) => m.to)).toEqual(["ac_admin@ac-test.invalid"]);
      expect(told[0]!.data.reviewUrl).toMatch(/\/admin\/sponsor-requests\/ac_inq$/);
      const list = await call("GET", "/account-closures?requested=true", "ac_admin");
      expect(list.json.closures.map((c: { subjectId: string }) => c.subjectId)).toEqual(["ac_cafe"]);
      expect((await call("GET", "/account-closures", "ac_riley")).status).toBe(403);
      expect((await call("POST", `/account-closures/${list.json.closures[0].id}/reactivation-decision`, "ac_riley", { decision: "DECLINE", note: "x" })).status).toBe(403);
    });

    it("BTG declines with a reason, which is emailed with the support address; a Reinstate reopens the account", async () => {
      const c = await prisma.accountClosure.findFirstOrThrow({ where: { tenantId: T, subjectId: "ac_cafe" }, select: { id: true } });
      const d = await call("POST", `/account-closures/${c.id}/reactivation-decision`, "ac_admin", { decision: "DECLINE", note: "We still can't match the license." });
      expect(d.status, d.text).toBe(200);
      expect(d.json.requestDeclined).toBe(true);
      const no = (await emails()).find((m) => m.template === "account.reactivationDeclined")!;
      expect(no).toMatchObject({ to: "ac_dana@ac-test.invalid", data: { note: "We still can't match the license.", supportEmail: "support@sponsorx.net" } });
      expect((await call("POST", `/account-closures/${c.id}/reactivation-decision`, "ac_admin", { decision: "DECLINE", note: "again" })).status).toBe(409);
      expect((await call("POST", "/sponsor-requests/ac_inq/decision", "ac_admin", { decision: "REINSTATE" })).status).toBe(200);
      expect((await prisma.accountClosure.findUniqueOrThrow({ where: { id: c.id }, select: { state: true } })).state).toBe("REACTIVATED");
      expect((await call("GET", "/me", "ac_dana")).status).toBe(200);
    });
  });

  describe("after 30 days the files are gone and a new sign-up is needed", () => {
    it("the retention job deletes the ID files and their rows, audits it, releases the email, and changes nothing the second time", async () => {
      expect((await call("POST", "/me/close", "ac_sam", { confirm: true })).status).toBe(200);
      const t = await lastLink("account.closed", "ac_sam@ac-test.invalid");
      const deleted: string[] = [];
      const later = new Date(Date.now() + 31 * 86_400_000);
      const run = await purgeExpiredClosures(prisma, later, async (k) => { deleted.push(k); }, T);
      expect(run).toMatchObject({ closures: 1, files: 1 });
      expect(deleted).toEqual(["athlete-ids/ac_sam/ac_pc_sam/passport.pdf"]);
      expect((await prisma.athleteProfileChange.findUniqueOrThrow({ where: { id: "ac_pc_sam" }, select: { idDocumentKey: true } })).idDocumentKey).toBeNull();
      const closure = await prisma.accountClosure.findFirstOrThrow({ where: { tenantId: T, subjectId: "ac_sam" }, select: { id: true, state: true, contactEmail: true } });
      expect(closure).toMatchObject({ state: "PURGED", contactEmail: "" });
      const trail = await prisma.auditLog.findFirstOrThrow({ where: { tenantId: T, action: "account.filesPurged", entityId: closure.id }, select: { actorId: true, after: true } });
      expect(trail).toMatchObject({ actorId: null, after: { deleted: { "AthleteProfileChange.idDocument": 1 }, loginsReleased: 1 } });
      /* The address is free for a new sign-up; the old login can never be claimed again. */
      expect(await prisma.user.count({ where: { email: "ac_sam@ac-test.invalid" } })).toBe(0);
      expect((await call("GET", `/public/account/reactivation/${encodeURIComponent(t)}`)).json.standing).toBe("EXPIRED");
      expect((await call("POST", `/public/account/reactivation/${encodeURIComponent(t)}`, undefined, { action: "REACTIVATE" })).status).toBe(410);
      expect(await purgeExpiredClosures(prisma, later, async (k) => { deleted.push(k); }, T)).toMatchObject({ closures: 0, files: 0 });
      expect(deleted).toHaveLength(1);
    });

    it("a closure inside its 30 days is never touched", async () => {
      expect(await purgeExpiredClosures(prisma, new Date(), async () => { throw new Error("must not delete"); }, T)).toMatchObject({ closures: 0 });
    });
  });
});
