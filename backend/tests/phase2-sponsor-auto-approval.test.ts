import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { normalizeBusinessName } from "../src/domain/business-name-rules";
import { sponsorApprovalVerdict, type ApprovalFacts } from "../src/domain/sponsor-request-rules";

/* --------------------------------------------------------------------------
   2S1-BE-17 — sponsors are approved automatically, against the real API and
   database. Done when:

     A sponsor whose email is confirmed and whose proof of business is
     uploaded is approved by the system, with no BTG step; a restricted
     business type, restricted words in an "Other" description, an email
     that already has a login, or a same-named sponsor sends the request to
     BTG's review with the reason; BTG admins and sales are emailed a link to
     every new sponsor; BTG can reject an approved sponsor (its logins
     switched off, the reason emailed) and reinstate it; proofs are read
     through five-minute audited links.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
process.env.PUBLIC_INTAKE_TENANT_ID = "sa_btg";

/* The private bucket isn't running: a key counts as "in the bucket" once the
   test says the browser uploaded it. Signing the upload URL is real. */
const { uploaded } = vi.hoisted(() => ({ uploaded: new Set<string>() }));
vi.mock("../src/lib/storage", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/lib/storage")>();
  return { ...real, checkPrivateUpload: async (_actor: unknown, key: string) => (uploaded.has(key) ? { ok: true as const, bytes: 81_920 } : { ok: false as const, problem: "missing" as const }) };
});
vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@sa-test.invalid` } : null;
  },
}));

describe("the rules (pure)", () => {
  const ok: ApprovalFacts = {
    emailConfirmed: true, proofUploaded: true, businessType: "RESTAURANT", businessTypeOther: null,
    restrictedWords: [], emailInUse: false, sameNameSponsors: [],
  };
  it("waits for the applicant, approves a clean request, and gives BTG reasons otherwise", () => {
    expect(sponsorApprovalVerdict({ ...ok, emailConfirmed: false, proofUploaded: false }))
      .toEqual({ outcome: "waiting", missing: ["confirm your email", "upload your proof of business"] });
    expect(sponsorApprovalVerdict(ok)).toEqual({ outcome: "approve", categories: ["RESTAURANT"] });
    expect(sponsorApprovalVerdict({ ...ok, businessType: "ALCOHOL" })).toEqual({ outcome: "review", reasons: ["Restricted business type: Alcohol"] });
    expect(sponsorApprovalVerdict({ ...ok, businessType: "OTHER", businessTypeOther: "Craft brewery" }))
      .toMatchObject({ outcome: "review", reasons: [expect.stringMatching(/sounds like a restricted business type: Alcohol/)] });
    expect(sponsorApprovalVerdict({ ...ok, businessType: "OTHER", businessTypeOther: "x", restrictedWords: [{ word: "escort", kind: "ADULT" }] }))
      .toEqual({ outcome: "review", reasons: ['Restricted words in their description: "escort"'] });
    expect(sponsorApprovalVerdict({ ...ok, emailInUse: true, sameNameSponsors: ["Harbor Coffee"] })).toEqual({
      outcome: "review", reasons: ["Their email already has a SponsorX login", "A sponsor with the same name already exists: Harbor Coffee"],
    });
  });
  it("one business name, however it is written", () => {
    for (const n of ["Harbor Coffee", "The Harbor Coffee, LLC", "HARBOR  COFFEE Inc.", "harbor-coffee co"]) expect(normalizeBusinessName(n), n).toBe("harborcoffee");
    expect(normalizeBusinessName("Smith & Sons")).toBe(normalizeBusinessName("Smith and Sons"));
    expect(normalizeBusinessName("Harbor Coffee Roasters")).not.toBe("harborcoffee");
  });
});

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("2S1-BE-17 · sponsors are approved automatically", { timeout: 90_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");

  const T = "sa_btg";
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

  type Asked = { id: string; requestToken: string; emailToken: string };
  const ask = async (b: { company: string; first: string; last: string; email: string; type: string; other?: string }): Promise<Asked> => {
    const r = await call("POST", "/public/inquiries", undefined, {
      companyName: b.company, firstName: b.first, lastName: b.last, email: b.email,
      businessType: b.type, ...(b.other ? { businessTypeOther: b.other } : {}),
    });
    expect(r.status, r.text).toBe(201);
    const mail = (await emails()).find((m) => m.template === "sponsor.confirmEmail" && m.to === b.email)!;
    const emailToken = new URL(mail.data.confirmUrl!).searchParams.get("t")!;
    return { id: r.json.id, requestToken: r.json.requestToken, emailToken };
  };
  const uploadProof = async (a: Asked) => {
    const up = await call("POST", `/public/sponsor-requests/${encodeURIComponent(a.requestToken)}/documents`, undefined, { filename: "business-license.pdf", contentType: "application/pdf", bytes: 81_920 });
    expect(up.status, up.text).toBe(201);
    const doc = await prisma.inquiryDocument.findUniqueOrThrow({ where: { id: up.json.document.id }, select: { r2Key: true } });
    uploaded.add(doc.r2Key);
    const done = await call("POST", `/public/sponsor-requests/${encodeURIComponent(a.requestToken)}/documents/${up.json.document.id}/confirm`);
    expect(done.status, done.text).toBe(200);
    return { documentId: up.json.document.id as string, status: done.json };
  };
  const confirm = async (a: Asked) => {
    const r = await call("POST", "/public/sponsor-requests/confirm-email", undefined, { token: a.emailToken });
    expect(r.status, r.text).toBe(200);
    return r.json;
  };
  const complete = async (a: Asked) => { await uploadProof(a); return confirm(a); };
  const state = async (id: string) => prisma.inquiry.findUniqueOrThrow({ where: { id }, select: { state: true, autoApproved: true, reviewReasons: true, sponsorId: true } });

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
    await prisma.tenant.create({ data: { id: T, name: "Auto BTG" } });
    await prisma.sponsor.create({ data: { id: "sa_existing", tenantId: T, name: "Existing Gym", categories: ["FITNESS"] } });
    await prisma.user.createMany({ data: [
      { id: "sa_admin", tenantId: T, clerkId: "sa_admin", email: "sa_admin@sa-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "sa_sales", tenantId: T, clerkId: "sa_sales", email: "sa_sales@sa-test.invalid", roles: ["SALES"] },
      { id: "sa_cm", tenantId: T, clerkId: "sa_cm", email: "sa_cm@sa-test.invalid", roles: ["CAMPAIGN_MGR"] },
      { id: "sa_gym", tenantId: T, clerkId: "sa_gym", email: "sa_gym@sa-test.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "sa_existing" },
    ] });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server?.close();
    await clean();
  });

  let harbor: Asked;

  describe("a clean request opens the account with no BTG step", () => {
    it("the form emails a confirmation link and hands back a token for the upload", async () => {
      harbor = await ask({ company: "Harbor Coffee", first: "Dana", last: "Brooks", email: "sa_dana@sa-test.invalid", type: "RESTAURANT" });
      const s = await call("GET", `/public/sponsor-requests/${encodeURIComponent(harbor.requestToken)}`);
      expect(s.json).toEqual({
        state: "NEW", businessName: "Harbor Coffee", email: "sa_dana@sa-test.invalid", emailConfirmed: false, proofUploaded: false,
        missing: ["confirm your email", "upload your proof of business"], underReview: false,
      });
      /* The Zoho lead still goes, as before. */
      expect(await prisma.outboxJob.count({ where: { tenantId: T, name: "zoho.pushLead" } })).toBe(1);
    });

    it("an upload counts only once it has arrived; the browser's token can't confirm the email", async () => {
      const up = await call("POST", `/public/sponsor-requests/${encodeURIComponent(harbor.requestToken)}/documents`, undefined, { filename: "../../license.pdf", contentType: "application/pdf", bytes: 1000 });
      expect(up.status, up.text).toBe(201);
      expect(up.json.uploadUrl).toMatch(/^https?:\/\//);
      const early = await call("POST", `/public/sponsor-requests/${encodeURIComponent(harbor.requestToken)}/documents/${up.json.document.id}/confirm`);
      expect(early.status).toBe(409);
      expect((await call("POST", "/public/sponsor-requests/confirm-email", undefined, { token: harbor.requestToken })).status).toBe(400);
      expect((await call("GET", `/public/sponsor-requests/${harbor.id}.forged`)).status).toBe(400);
      expect((await call("POST", `/public/sponsor-requests/${encodeURIComponent(harbor.requestToken)}/documents`, undefined, { filename: "x.exe", contentType: "application/x-msdownload", bytes: 10 })).status).toBe(400);
      expect((await call("POST", `/public/sponsor-requests/${encodeURIComponent(harbor.requestToken)}/documents`, undefined, { filename: "big.pdf", contentType: "application/pdf", bytes: 500 * 1024 * 1024 })).status).toBe(422);
    });

    it("proof uploaded, then email confirmed: approved by the system", async () => {
      const { status } = await uploadProof(harbor);
      expect(status).toMatchObject({ state: "NEW", proofUploaded: true, missing: ["confirm your email"] });
      expect((await state(harbor.id)).state).toBe("NEW");
      const c = await confirm(harbor);
      expect(c).toMatchObject({ state: "APPROVED", emailConfirmed: true, underReview: false });
      /* 2S8-PMO-02: tokens now carry their expiry, so the fresh one is a new
         string — what matters is that it opens this same request. */
      const { readSponsorRequestToken } = await import("../src/lib/sponsor-request-token");
      expect(readSponsorRequestToken(c.requestToken)).toBe(harbor.id);
      const row = await state(harbor.id);
      expect(row).toMatchObject({ state: "APPROVED", autoApproved: true, reviewReasons: [] });
      expect(await prisma.sponsor.findUniqueOrThrow({ where: { id: row.sponsorId! }, select: { name: true, categories: true } }))
        .toEqual({ name: "Harbor Coffee", categories: ["RESTAURANT"] });
      expect(await prisma.user.findFirstOrThrow({ where: { email: "sa_dana@sa-test.invalid" }, select: { roles: true, sponsorId: true } }))
        .toEqual({ roles: ["SPONSOR_ADMIN"], sponsorId: row.sponsorId });
      const trail = await prisma.auditLog.findMany({ where: { entity: "Inquiry", entityId: harbor.id }, select: { action: true, actorId: true }, orderBy: { at: "asc" } });
      expect(trail).toEqual([{ action: "sponsorRequest.emailConfirmed", actorId: null }, { action: "sponsorRequest.autoApprove", actorId: null }]);
      expect(await prisma.outboxJob.count({ where: { tenantId: T, name: "zoho.pushSponsor" } })).toBe(1);
      /* Confirming again changes nothing. */
      expect(await confirm(harbor)).toMatchObject({ state: "APPROVED" });
      expect(await prisma.sponsor.count({ where: { tenantId: T, name: "Harbor Coffee" } })).toBe(1);
    });

    it("Dana signs in; BTG admin and sales are each emailed a link to the new sponsor", async () => {
      expect((await call("GET", "/me", "sa_dana")).json).toMatchObject({ roles: ["SPONSOR_ADMIN"] });
      const all = await emails();
      expect(all).toContainEqual(expect.objectContaining({ template: "sponsor.accountOpened", to: "sa_dana@sa-test.invalid" }));
      const told = all.filter((m) => m.template === "sponsor.newSponsor");
      expect(told.map((m) => m.to).sort()).toEqual(["sa_admin@sa-test.invalid", "sa_sales@sa-test.invalid"]);
      expect(told[0]!.data).toMatchObject({ businessName: "Harbor Coffee", outcome: "was approved automatically", reviewUrl: expect.stringMatching(new RegExp(`/admin/sponsor-requests/${harbor.id}$`)) });
      const d = (await call("GET", `/sponsor-requests/${harbor.id}`, "sa_admin")).json;
      expect(d).toMatchObject({ autoApproved: true, businessType: "RESTAURANT", emailConfirmed: true, progress: { automatic: true, decidedBy: null, signedIn: true } });
      /* The first attempt never arrived (and its path was stripped); the second did. */
      expect(d.documents).toEqual([expect.objectContaining({ filename: "license.pdf", uploadedAt: null }), expect.objectContaining({ filename: "business-license.pdf", uploadedAt: expect.any(String) })]);
    });

    it("BTG reads the proof through a five-minute audited link; nobody else can", async () => {
      const docId = (await prisma.inquiryDocument.findFirstOrThrow({ where: { inquiryId: harbor.id, uploadedAt: { not: null } }, select: { id: true } })).id;
      const v = await call("GET", `/sponsor-requests/${harbor.id}/documents/${docId}`, "sa_sales");
      expect(v.status, v.text).toBe(200);
      expect(v.json).toMatchObject({ url: expect.stringMatching(/^https?:\/\//), expiresInSeconds: 300 });
      const grant = await prisma.auditLog.findFirst({ where: { tenantId: T, entity: "InquiryDocument", entityId: docId, actorId: "sa_sales" }, select: { after: true } });
      expect(grant?.after).toMatchObject({ ttlSeconds: 300 });
      expect((await call("GET", `/sponsor-requests/${harbor.id}/documents/${docId}`, "sa_cm")).status).toBe(403);
      expect((await call("GET", `/sponsor-requests/${harbor.id}/documents/${docId}`, "sa_dana")).status).toBe(403);
    });
  });

  describe("what goes to BTG's review, with the reason", () => {
    it("a restricted business type", async () => {
      const a = await ask({ company: "Bay Brewing", first: "Sam", last: "Ortiz", email: "sa_sam@sa-test.invalid", type: "ALCOHOL" });
      expect(await complete(a)).toMatchObject({ state: "NEW", underReview: true });
      expect(await state(a.id)).toMatchObject({ state: "NEW", autoApproved: false, reviewReasons: ["Restricted business type: Alcohol"] });
      expect(await prisma.sponsor.count({ where: { tenantId: T, name: "Bay Brewing" } })).toBe(0);
      expect(await emails()).toContainEqual(expect.objectContaining({
        template: "sponsor.newSponsor", to: "sa_admin@sa-test.invalid",
        data: expect.objectContaining({ businessName: "Bay Brewing", outcome: "needs your review", reasons: "• Restricted business type: Alcohol" }),
      }));
      /* The applicant hears it is with BTG — never BTG's reasons. */
      const s = (await call("GET", `/public/sponsor-requests/${encodeURIComponent(a.requestToken)}`)).json;
      expect(s).toEqual(expect.objectContaining({ underReview: true, missing: [] }));
      expect(JSON.stringify(s)).not.toMatch(/Alcohol/);
    });

    it("restricted words in an Other description, even disguised", async () => {
      const a = await ask({ company: "Night Owl", first: "Lee", last: "Park", email: "sa_lee@sa-test.invalid", type: "OTHER", other: "Late night 3sc0rt service" });
      await complete(a);
      expect((await state(a.id)).reviewReasons).toEqual(['Restricted words in their description: "escort", "escort service"']);
    });

    it("an Other description that is fine is approved, with no restricted category", async () => {
      const a = await ask({ company: "Paws & Claws", first: "Kim", last: "Ng", email: "sa_kim@sa-test.invalid", type: "OTHER", other: "Dog grooming salon" });
      expect(await complete(a)).toMatchObject({ state: "APPROVED" });
    });

    it("an email that already has a login", async () => {
      const a = await ask({ company: "Gym Two", first: "Gail", last: "Yu", email: "sa_gym@sa-test.invalid", type: "FITNESS" });
      await complete(a);
      expect((await state(a.id)).reviewReasons).toEqual(["Their email already has a SponsorX login"]);
    });

    it("a same-named sponsor, however the name is written", async () => {
      const a = await ask({ company: "The Harbor Coffee, LLC", first: "Max", last: "Hale", email: "sa_max@sa-test.invalid", type: "RESTAURANT" });
      await complete(a);
      expect((await state(a.id)).reviewReasons).toEqual(["A sponsor with the same name already exists: Harbor Coffee"]);
      /* BTG can still approve it by hand, confirming it is a different business. */
      const ok = await call("POST", `/sponsor-requests/${a.id}/decision`, "sa_admin", { decision: "APPROVE", categories: ["RESTAURANT"], newSponsor: true });
      expect(ok.status, ok.text).toBe(200);
      expect(await state(a.id)).toMatchObject({ state: "APPROVED", autoApproved: false, reviewReasons: [] });
    });

    it("BTG's queue holds only what is waiting for a person", async () => {
      const q = (await call("GET", "/sponsor-requests", "sa_admin")).json;
      expect(q.requests.map((r: { businessName: string }) => r.businessName).sort()).toEqual(["Bay Brewing", "Gym Two", "Night Owl"]);
      expect(q.counts).toEqual({ NEW: 3, APPROVED: 3, DECLINED: 0, REJECTED: 0 });
    });
  });

  describe("BTG can reject an approved sponsor, and reinstate it", () => {
    it("only BTG admin and sales; a note is required; only an approved one", async () => {
      for (const who of ["sa_cm", "sa_dana"]) expect((await call("POST", `/sponsor-requests/${harbor.id}/decision`, who, { decision: "REJECT", note: "x" })).status, who).toBe(403);
      expect((await call("POST", `/sponsor-requests/${harbor.id}/decision`, "sa_admin", { decision: "REJECT", note: " " })).status).toBe(400);
      const waiting = (await prisma.inquiry.findFirstOrThrow({ where: { tenantId: T, companyName: "Bay Brewing" }, select: { id: true } })).id;
      expect((await call("POST", `/sponsor-requests/${waiting}/decision`, "sa_admin", { decision: "REJECT", note: "x" })).status).toBe(409);
      expect((await call("POST", `/sponsor-requests/${harbor.id}/decision`, "sa_admin", { decision: "REINSTATE" })).status).toBe(409);
    });

    it("rejecting switches the sponsor's logins off and emails the reason", async () => {
      const r = await call("POST", `/sponsor-requests/${harbor.id}/decision`, "sa_admin", { decision: "REJECT", note: "The business license you uploaded belongs to another company." });
      expect(r.status, r.text).toBe(200);
      expect(r.json).toMatchObject({ state: "REJECTED", decisionNote: "The business license you uploaded belongs to another company." });
      const me = await call("GET", "/me", "sa_dana");
      expect(me.status).toBe(403);
      expect(me.json.error.code).toBe("account_disabled");
      expect((await call("GET", "/cart", "sa_dana")).status).toBe(403);
      expect(await emails()).toContainEqual(expect.objectContaining({
        template: "sponsor.accountRejected", to: "sa_dana@sa-test.invalid",
        data: expect.objectContaining({ note: "The business license you uploaded belongs to another company." }),
      }));
      expect((await call("GET", `/sponsor-requests/${harbor.id}`, "sa_admin")).json.progress).toMatchObject({ loginSwitchedOff: true });
      /* Other sponsors' people are untouched. */
      expect((await call("GET", "/me", "sa_gym")).status).toBe(200);
    });

    it("reinstating switches them back on", async () => {
      const r = await call("POST", `/sponsor-requests/${harbor.id}/decision`, "sa_sales", { decision: "REINSTATE" });
      expect(r.status, r.text).toBe(200);
      expect(r.json.state).toBe("APPROVED");
      expect((await call("GET", "/me", "sa_dana")).status).toBe(200);
      expect(await emails()).toContainEqual(expect.objectContaining({ template: "sponsor.accountReinstated", to: "sa_dana@sa-test.invalid" }));
      const trail = (await prisma.auditLog.findMany({ where: { entity: "Inquiry", entityId: harbor.id }, select: { action: true }, orderBy: { at: "asc" } })).map((t) => t.action);
      expect(trail.slice(-2)).toEqual(["sponsorRequest.reject", "sponsorRequest.reinstate"]);
    });
  });
});
