import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { briefAnswers, categoryText, suggestCategories, sponsorNameFor } from "../src/domain/sponsor-request-rules";

/* --------------------------------------------------------------------------
   2S1-BE-05 — BTG approves a new sponsor and opens the account, against the
   real API and database. Done when:

     A sponsor's request appears in BTG's queue with its business type;
     approving it creates the sponsor, its contact and a login the requester
     can sign in with, and links the Zoho account without a duplicate;
     declining tells the requester why; only BTG admin and sales can decide;
     tenant and role tests cover it.

   The walkthrough's step 4 → 4b: Harbor Coffee asks through the public
   form; BTG approves; Dana Brooks signs in and lands in the sponsor portal.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
process.env.PUBLIC_INTAKE_TENANT_ID = "sr_btg";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@sr-test.invalid` } : null;
  },
}));

describe("sponsor request rules (pure)", () => {
  const message = "Sponsor brief (sponsorx /brief)\nGoal: More weekday foot traffic\nBudget: $1,000–$2,500\nBrand category: Coffee shop / café\nMarket: Westfield, MD";
  it("reads the brief's answers back, and the business's own words for what it is", () => {
    expect(briefAnswers(message)).toEqual([
      { label: "Goal", value: "More weekday foot traffic" },
      { label: "Budget", value: "$1,000–$2,500" },
      { label: "Brand category", value: "Coffee shop / café" },
      { label: "Market", value: "Westfield, MD" },
    ]);
    expect(categoryText(message)).toBe("Coffee shop / café");
    expect(categoryText(null)).toBeNull();
  });
  it("suggests categories from their words, restricted ones included", () => {
    expect(suggestCategories("Coffee shop / café")).toEqual(["RESTAURANT"]);
    expect(suggestCategories("Hardware store")).toEqual(["LOCAL_RETAIL"]);
    expect(suggestCategories("Quick-service restaurant")).toEqual(["FAST_FOOD", "RESTAURANT"]);
    expect(suggestCategories("Craft brewery and taproom")).toEqual(["ALCOHOL"]);
    expect(suggestCategories("Family dentist")).toEqual(["HEALTHCARE"]);
    expect(suggestCategories("something else")).toEqual([]);
  });
  it("names the account after the company, else the person", () => {
    expect(sponsorNameFor({ companyName: " Harbor Coffee ", firstName: "Dana", lastName: "Brooks" })).toBe("Harbor Coffee");
    expect(sponsorNameFor({ companyName: null, firstName: "Dana", lastName: "Brooks" })).toBe("Dana Brooks");
  });
});

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("2S1-BE-05 · BTG reviews a sponsor's request and opens the account", { timeout: 90_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");

  const T = "sr_btg";
  const X = "sr_other";
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  const E = { harbor: "", rosa: "", zohoTwin: "", taken: "", other: "" };

  const call = async (method: string, path: string, clerk?: string, body?: unknown) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method, headers: { "content-type": "application/json", ...(clerk ? { "x-test-clerk": clerk } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };
  const ask = async (b: { company?: string; first?: string; last: string; email: string; category?: string }) => {
    const r = await call("POST", "/public/inquiries", undefined, {
      ...(b.company ? { companyName: b.company } : {}), ...(b.first ? { firstName: b.first } : {}), lastName: b.last, email: b.email, phone: "301-555-0142",
      message: `Sponsor brief (sponsorx /brief)\nGoal: More weekday foot traffic\nBudget: $1,000–$2,500\n${b.category ? `Brand category: ${b.category}\n` : ""}Market: Westfield, MD`,
    });
    expect(r.status, r.text).toBe(201);
    return r.json.id as string;
  };
  const emails = async () => (await prisma.outboxJob.findMany({ where: { tenantId: T, name: "notify.email" }, select: { payload: true } }))
    .map((j) => j.payload as { template: string; to: string; data: Record<string, string> });

  async function clean() {
    const ids = [T, X];
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 5; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = ANY($1::text[])`, ids).catch(() => {});
      }
    }
    await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.createMany({ data: [{ id: T, name: "Requests BTG" }, { id: X, name: "Another BTG" }] });
    await prisma.sponsor.createMany({ data: [
      /* Sales converted this lead in Zoho already; the account synced in with no login. */
      { id: "sr_zoho_twin", tenantId: T, name: "Rosa's Tacos", zohoAccountId: "zoho_acc_rosa" },
      { id: "sr_existing", tenantId: T, name: "Existing Sponsor", categories: ["FITNESS"] },
    ] });
    await prisma.user.createMany({ data: [
      { id: "sr_admin", tenantId: T, clerkId: "sr_admin", email: "sr_admin@sr-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "sr_sales", tenantId: T, clerkId: "sr_sales", email: "sr_sales@sr-test.invalid", roles: ["SALES"] },
      { id: "sr_cm", tenantId: T, clerkId: "sr_cm", email: "sr_cm@sr-test.invalid", roles: ["CAMPAIGN_MGR"] },
      { id: "sr_finance", tenantId: T, clerkId: "sr_finance", email: "sr_finance@sr-test.invalid", roles: ["FINANCE"] },
      { id: "sr_sponsor_user", tenantId: T, clerkId: "sr_sponsor_user", email: "sr_taken@sr-test.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "sr_existing" },
      { id: "sr_x_admin", tenantId: X, clerkId: "sr_x_admin", email: "sr_x_admin@sr-test.invalid", roles: ["BTG_ADMIN"] },
    ] });
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    E.harbor = await ask({ company: "Harbor Coffee", first: "Dana", last: "Brooks", email: "sr_dana@sr-test.invalid", category: "Coffee shop / café" });
    E.rosa = await ask({ company: "Rosa's Tacos", first: "Rosa", last: "Diaz", email: "sr_rosa@sr-test.invalid", category: "Quick-service restaurant" });
    E.taken = await ask({ company: "Taken Co", last: "Lee", email: "sr_taken@sr-test.invalid", category: "Gym" });
    E.other = await ask({ company: "Nope Ltd", last: "Kim", email: "sr_nope@sr-test.invalid" });
  });

  afterAll(async () => {
    server?.close();
    await clean();
  });

  describe("the request waits in BTG's queue", () => {
    it("the public form's request is still a Zoho lead, and is now also waiting for BTG with the business's own words", async () => {
      const row = await prisma.inquiry.findUniqueOrThrow({ where: { id: E.harbor }, select: { state: true, categoryText: true, tenantId: true } });
      expect(row).toEqual({ state: "NEW", categoryText: "Coffee shop / café", tenantId: T });
      const leads = await prisma.outboxJob.findMany({ where: { tenantId: T, name: "zoho.pushLead" }, select: { payload: true } });
      expect(leads.map((l) => l.payload)).toContainEqual(expect.objectContaining({ inquiryId: E.harbor }));
    });

    it("BTG admin and sales see the queue with counts; the detail suggests a business type and runs the checks", async () => {
      for (const who of ["sr_admin", "sr_sales"]) {
        const q = await call("GET", "/sponsor-requests", who);
        expect(q.status, q.text).toBe(200);
        expect(q.json.counts).toEqual({ NEW: 4, APPROVED: 0, DECLINED: 0, REJECTED: 0 });
        expect(q.json.requests[0]).toMatchObject({ id: E.harbor, businessName: "Harbor Coffee", contactName: "Dana Brooks", categoryText: "Coffee shop / café", budget: "$1,000–$2,500", state: "NEW" });
      }
      const d = (await call("GET", `/sponsor-requests/${E.harbor}`, "sr_sales")).json;
      expect(d).toMatchObject({ suggestedCategories: ["RESTAURANT"], checks: { emailInUse: false, matches: [] } });
      expect(d.answers).toContainEqual({ label: "Goal", value: "More weekday foot traffic" });
      const rosa = (await call("GET", `/sponsor-requests/${E.rosa}`, "sr_admin")).json;
      expect(rosa.checks.matches).toEqual([{ id: "sr_zoho_twin", name: "Rosa's Tacos", fromZoho: true, hasLogin: false }]);
      expect((await call("GET", `/sponsor-requests/${E.taken}`, "sr_admin")).json.checks.emailInUse).toBe(true);
    });

    it("nobody else can see it, and another tenant's BTG can't reach it", async () => {
      for (const who of ["sr_cm", "sr_finance", "sr_sponsor_user"]) {
        expect((await call("GET", "/sponsor-requests", who)).status, who).toBe(403);
        expect((await call("GET", `/sponsor-requests/${E.harbor}`, who)).status, who).toBe(403);
      }
      expect((await call("GET", "/sponsor-requests", "sr_x_admin")).json.counts).toEqual({ NEW: 0, APPROVED: 0, DECLINED: 0, REJECTED: 0 });
      expect((await call("GET", `/sponsor-requests/${E.harbor}`, "sr_x_admin")).status).toBe(403);
      expect((await call("POST", `/sponsor-requests/${E.harbor}/decision`, "sr_x_admin", { decision: "APPROVE", categories: ["RESTAURANT"] })).status).toBe(403);
      expect((await call("GET", "/sponsor-requests")).status).toBe(401);
    });
  });

  describe("only BTG admin and sales decide", () => {
    it("campaign managers, finance and sponsors are refused; approving needs a business type", async () => {
      for (const who of ["sr_cm", "sr_finance", "sr_sponsor_user"]) {
        expect((await call("POST", `/sponsor-requests/${E.harbor}/decision`, who, { decision: "APPROVE", categories: ["RESTAURANT"] })).status, who).toBe(403);
      }
      expect((await call("POST", `/sponsor-requests/${E.harbor}/decision`, "sr_admin", { decision: "APPROVE", categories: [] })).status).toBe(400);
      expect((await call("POST", `/sponsor-requests/${E.harbor}/decision`, "sr_admin", { decision: "APPROVE", categories: ["COFFEE"] })).status).toBe(400);
      expect(await prisma.inquiry.findUniqueOrThrow({ where: { id: E.harbor }, select: { state: true } })).toEqual({ state: "NEW" });
    });
  });

  describe("approving opens the account", () => {
    it("creates Harbor Coffee with its business type, Dana as primary contact and a sponsor login, and emails a sign-in link", async () => {
      const ok = await call("POST", `/sponsor-requests/${E.harbor}/decision`, "sr_sales", { decision: "APPROVE", categories: ["RESTAURANT"] });
      expect(ok.status, ok.text).toBe(200);
      expect(ok.json).toMatchObject({ state: "APPROVED", decidedBy: "sr_sales", sponsorId: expect.any(String) });
      const sponsor = await prisma.sponsor.findUniqueOrThrow({ where: { id: ok.json.sponsorId }, select: { tenantId: true, name: true, categories: true } });
      expect(sponsor).toEqual({ tenantId: T, name: "Harbor Coffee", categories: ["RESTAURANT"] });
      expect(await prisma.sponsorContact.findMany({ where: { sponsorId: ok.json.sponsorId }, select: { name: true, email: true, isPrimary: true } }))
        .toEqual([{ name: "Dana Brooks", email: "sr_dana@sr-test.invalid", isPrimary: true }]);
      const login = await prisma.user.findFirstOrThrow({ where: { email: "sr_dana@sr-test.invalid" }, select: { tenantId: true, roles: true, sponsorId: true, clerkId: true } });
      expect(login).toMatchObject({ tenantId: T, roles: ["SPONSOR_ADMIN"], sponsorId: ok.json.sponsorId, clerkId: expect.stringMatching(/^invite:/) });
      expect(await emails()).toContainEqual(expect.objectContaining({
        template: "sponsor.accountOpened", to: "sr_dana@sr-test.invalid",
        data: expect.objectContaining({ firstName: "Dana", businessName: "Harbor Coffee", portalUrl: expect.stringMatching(/\/sponsor$/) }),
      }));
      const pushes = await prisma.outboxJob.findMany({ where: { tenantId: T, name: "zoho.pushSponsor" }, select: { payload: true } });
      expect(pushes.map((p) => p.payload)).toEqual([expect.objectContaining({ sponsorId: ok.json.sponsorId })]);
      const trail = await prisma.auditLog.findMany({ where: { entity: "Inquiry", entityId: E.harbor }, select: { action: true, actorId: true } });
      expect(trail).toEqual([{ action: "sponsorRequest.approve", actorId: "sr_sales" }]);
    });

    it("Dana signs in with that email and lands as Harbor Coffee's sponsor admin", async () => {
      const me = await call("GET", "/me", "sr_dana");
      expect(me.status, me.text).toBe(200);
      const sponsorId = (await prisma.inquiry.findUniqueOrThrow({ where: { id: E.harbor }, select: { sponsorId: true } })).sponsorId;
      expect(me.json).toMatchObject({ tenantId: T, roles: ["SPONSOR_ADMIN"], sponsorId });
      /* The sponsor portal answers for her — e.g. her (empty) cart. */
      expect((await call("GET", "/cart", "sr_dana")).status).toBe(200);
      /* She is a sponsor, not staff: the queue is closed to her. */
      expect((await call("GET", "/sponsor-requests", "sr_dana")).status).toBe(403);
      /* BTG's page now shows the login claimed — read from the login itself. The email
         hasn't gone (no email provider runs in tests), and the page says so rather than guessing. */
      expect((await call("GET", `/sponsor-requests/${E.harbor}`, "sr_admin")).json.progress)
        .toEqual({ categories: ["RESTAURANT"], decidedBy: { email: "sr_sales@sr-test.invalid", roles: ["SALES"] }, emailSentAt: null, signedIn: true, automatic: false, loginSwitchedOff: false });
    });

    it("a request is decided once", async () => {
      const again = await call("POST", `/sponsor-requests/${E.harbor}/decision`, "sr_admin", { decision: "DECLINE", note: "Changed our mind" });
      expect(again.status).toBe(409);
      expect(again.json.error.message).toMatch(/already approved/);
      expect((await call("GET", "/sponsor-requests?state=APPROVED", "sr_admin")).json.counts).toMatchObject({ NEW: 3, APPROVED: 1 });
    });
  });

  describe("no duplicates", () => {
    it("a same-named sponsor must be answered: linking uses the account Zoho already has", async () => {
      const blocked = await call("POST", `/sponsor-requests/${E.rosa}/decision`, "sr_admin", { decision: "APPROVE", categories: ["FAST_FOOD"] });
      expect(blocked.status).toBe(409);
      expect(blocked.json.error.message).toMatch(/already exists. Link this request to it/);
      const linked = await call("POST", `/sponsor-requests/${E.rosa}/decision`, "sr_admin", { decision: "APPROVE", categories: ["FAST_FOOD"], linkSponsorId: "sr_zoho_twin" });
      expect(linked.status, linked.text).toBe(200);
      expect(linked.json.sponsorId).toBe("sr_zoho_twin");
      expect(await prisma.sponsor.count({ where: { tenantId: T, name: "Rosa's Tacos" } })).toBe(1);
      expect(await prisma.sponsor.findUniqueOrThrow({ where: { id: "sr_zoho_twin" }, select: { categories: true, zohoAccountId: true } }))
        .toEqual({ categories: ["FAST_FOOD"], zohoAccountId: "zoho_acc_rosa" });
      expect(await prisma.user.findFirstOrThrow({ where: { email: "sr_rosa@sr-test.invalid" }, select: { sponsorId: true } })).toEqual({ sponsorId: "sr_zoho_twin" });
    });

    it("an email that already has a SponsorX login is refused, and nothing is created", async () => {
      const before = await prisma.sponsor.count({ where: { tenantId: T } });
      const r = await call("POST", `/sponsor-requests/${E.taken}/decision`, "sr_admin", { decision: "APPROVE", categories: ["FITNESS"] });
      expect(r.status).toBe(409);
      expect(r.json.error.message).toMatch(/already has a SponsorX login/);
      expect(await prisma.sponsor.count({ where: { tenantId: T } })).toBe(before);
      expect(await prisma.inquiry.findUniqueOrThrow({ where: { id: E.taken }, select: { state: true } })).toEqual({ state: "NEW" });
    });

    it("a sponsor that already has people signing in can't be linked a second login this way", async () => {
      const r = await call("POST", `/sponsor-requests/${E.other}/decision`, "sr_admin", { decision: "APPROVE", categories: ["FITNESS"], linkSponsorId: "sr_existing" });
      expect(r.status).toBe(409);
      expect(await prisma.inquiry.findUniqueOrThrow({ where: { id: E.other }, select: { state: true } })).toEqual({ state: "NEW" });
    });
  });

  describe("declining tells them why", () => {
    it("needs a note, then emails it and records who decided", async () => {
      expect((await call("POST", `/sponsor-requests/${E.other}/decision`, "sr_admin", { decision: "DECLINE", note: "  " })).status).toBe(400);
      const r = await call("POST", `/sponsor-requests/${E.other}/decision`, "sr_admin", { decision: "DECLINE", note: "We only work with businesses in Maryland for now." });
      expect(r.status, r.text).toBe(200);
      expect(r.json).toMatchObject({ state: "DECLINED", decisionNote: "We only work with businesses in Maryland for now.", decidedBy: "sr_admin", sponsorId: null });
      expect(await emails()).toContainEqual(expect.objectContaining({
        template: "sponsor.requestDeclined", to: "sr_nope@sr-test.invalid", data: expect.objectContaining({ note: "We only work with businesses in Maryland for now." }),
      }));
      expect(await prisma.user.count({ where: { email: "sr_nope@sr-test.invalid" } })).toBe(0);
      /* Once the email job has sent it, the page says so. */
      await prisma.emailSendLog.create({ data: { idempotencyKey: `sponsor.requestDeclined:${E.other}`, tenantId: T, template: "sponsor.requestDeclined", to: "sr_nope@sr-test.invalid" } });
      expect((await call("GET", `/sponsor-requests/${E.other}`, "sr_admin")).json.progress).toMatchObject({ emailSentAt: expect.any(String), signedIn: null });
      expect((await call("GET", "/sponsor-requests?state=DECLINED", "sr_sales")).json.requests.map((x: { id: string }) => x.id)).toEqual([E.other]);
    });
  });
});
