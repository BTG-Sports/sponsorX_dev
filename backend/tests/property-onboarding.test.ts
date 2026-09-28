import type { AddressInfo } from "node:net";
import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";

/* --------------------------------------------------------------------------
   2S1-BE-01 — "An external organisation can complete and submit onboarding
   through the API without database intervention."
   2S1-BE-03 — "A reviewer can action every decision type; PENDING_REVIEW to
   APPROVED grants listing access and is audited."

   The applicant's whole journey is HTTP only — start, save each step, read
   back, submit — against the real app. The test's only database writes are
   the platform itself: a tenant, a published terms agreement, the reviewer's
   user. Nothing touches the application row by hand.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
process.env.INTAKE_TOKEN_SECRET ??= "test-intake-secret-test-intake-secret";
process.env.PUBLIC_INTAKE_TENANT_ID = "po_tenant";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@onboarding-test.invalid` } : null;
  },
}));

const { canTransitionOnboarding, missingFor } = await import("../src/domain/onboarding-rules");

describe("the onboarding state machine, as the state-machine document states it (pure)", () => {
  it("refuses the named illegal moves", () => {
    expect(canTransitionOnboarding("DRAFT", "APPROVED")).toBe(false);
    expect(canTransitionOnboarding("APPROVED", "DRAFT")).toBe(false);
    expect(canTransitionOnboarding("SUSPENDED", "REJECTED")).toBe(false);
    for (const to of ["DRAFT", "PENDING_REVIEW", "APPROVED", "CHANGES_REQUESTED", "SUSPENDED"] as const) {
      expect(canTransitionOnboarding("REJECTED", to)).toBe(false);
    }
    expect(canTransitionOnboarding("CHANGES_REQUESTED", "PENDING_REVIEW")).toBe(true);
  });

  it("required fields vary by organisation type and state", () => {
    const base = {
      orgName: "X", contacts: [{ name: "A", email: "a@x.invalid", role: "Owner", primary: true }],
      payoutAcknowledgedAt: new Date(), termsAcceptedAt: new Date(),
    };
    const team = { legalEntityName: "Bowie Bulldogs LLC", league: "MD Youth", sport: "Football" };
    expect(missingFor({ ...base, orgType: "TEAM", stateCode: "MD", details: team })).toEqual([]);
    expect(missingFor({ ...base, orgType: "TEAM", stateCode: "CA", details: team })).toEqual(["business.stateRegistrationId"]);
    /* A school is a public body — no registration number, even in CA — but it names its district. */
    expect(missingFor({ ...base, orgType: "SCHOOL", stateCode: "CA", details: { district: "LAUSD", athleticDirector: "Pat Lee", sports: ["Soccer"] } })).toEqual([]);
    expect(missingFor({ ...base, orgType: "SCHOOL", stateCode: "MD", details: team })).not.toEqual([]);
  });
});

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("property onboarding over the API", async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const T = "po_tenant";
  const HASH = "t".repeat(64);
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";

  const call = async (method: string, path: string, body?: unknown, clerk?: string) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method, headers: { "content-type": "application/json", ...(clerk ? { "x-test-clerk": clerk } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };

  async function clean() {
    for (const t of ["AuditLog", "PropertyOnboarding", "Property", "Agreement", "User"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T);
    }
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  /** The wizard, end to end, as a browser would drive it. */
  async function completeTeam(name: string, stateCode = "CA") {
    const started = await call("POST", "/public/onboarding", { orgType: "TEAM", orgName: name });
    const tok = started.json.resumeToken as string;
    await call("PATCH", `/public/onboarding/${tok}`, { step: "organisation", stateCode });
    await call("PATCH", `/public/onboarding/${tok}`, { step: "contacts", contacts: [{ name: "Dana Cole", email: "dana@team.invalid", role: "Director", primary: true }] });
    await call("PATCH", `/public/onboarding/${tok}`, { step: "business", details: { legalEntityName: `${name} LLC`, league: "SoCal Youth", sport: "Soccer", stateRegistrationId: "C1234567" } });
    await call("PATCH", `/public/onboarding/${tok}`, { step: "payout", acknowledged: true });
    const terms = (await call("GET", `/public/onboarding/${tok}`)).json.terms;
    await call("PATCH", `/public/onboarding/${tok}`, { step: "agreements", agreementId: terms.agreementId, bodyHashShown: terms.bodyHash });
    const submitted = await call("POST", `/public/onboarding/${tok}/submit`);
    return { tok, id: started.json.id as string, submitted };
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "Onboarding test tenant" } });
    await prisma.agreement.create({ data: { id: "po_terms", tenantId: T, kind: "PROPERTY_TERMS", version: 1, bodyHash: HASH, effectiveAt: new Date("2026-09-01") } });
    await prisma.user.createMany({ data: [
      { id: "po_reviewer", tenantId: T, clerkId: "po_reviewer", email: "r@po.invalid", roles: ["BTG_ADMIN"] },
      { id: "po_sponsor", tenantId: T, clerkId: "po_sponsor", email: "s@po.invalid", roles: ["SPONSOR_ADMIN"] },
    ] });
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await clean();
  });

  describe("2S1-BE-01", () => {
    it("an organisation completes and submits through the API alone — saving progress step by step", async () => {
      const started = await call("POST", "/public/onboarding", { orgType: "TEAM", orgName: "Riverside FC" });
      expect(started.status).toBe(201);
      const tok = started.json.resumeToken as string;

      /* A fresh application says what is missing — every step. */
      const fresh = (await call("GET", `/public/onboarding/${tok}`)).json;
      expect(fresh.state).toBe("DRAFT");
      expect(fresh.missing).toEqual(expect.arrayContaining(["organisation.stateCode", "contacts.primary", "payout.acknowledged", "agreements.terms"]));

      await call("PATCH", `/public/onboarding/${tok}`, { step: "organisation", stateCode: "CA" });
      await call("PATCH", `/public/onboarding/${tok}`, { step: "contacts", contacts: [{ name: "Dana Cole", email: "dana@team.invalid", role: "Director", primary: true }] });
      /* A partial business step saves — the rest can come later. */
      await call("PATCH", `/public/onboarding/${tok}`, { step: "business", details: { legalEntityName: "Riverside FC LLC", league: "SoCal Youth" } });
      const halfway = (await call("GET", `/public/onboarding/${tok}`)).json;
      expect(halfway.details).toEqual({ legalEntityName: "Riverside FC LLC", league: "SoCal Youth" });
      expect(halfway.contacts[0].email).toBe("dana@team.invalid");

      /* Submitting early is refused with the list. */
      const early = await call("POST", `/public/onboarding/${tok}/submit`);
      expect(early.status).toBe(422);
      expect(early.text).toMatch(/business\.sport/);

      /* California: a commercial organisation must give its registration number. */
      await call("PATCH", `/public/onboarding/${tok}`, { step: "business", details: { sport: "Soccer" } });
      expect((await call("GET", `/public/onboarding/${tok}`)).json.missing).toContain("business.stateRegistrationId");
      await call("PATCH", `/public/onboarding/${tok}`, { step: "business", details: { stateRegistrationId: "C1234567" } });

      await call("PATCH", `/public/onboarding/${tok}`, { step: "payout", acknowledged: true });
      const terms = (await call("GET", `/public/onboarding/${tok}`)).json.terms;
      expect(terms).toEqual({ agreementId: "po_terms", version: 1, bodyHash: HASH });
      expect((await call("PATCH", `/public/onboarding/${tok}`, { step: "agreements", agreementId: "po_terms", bodyHashShown: "x".repeat(64) })).status).toBe(409);
      await call("PATCH", `/public/onboarding/${tok}`, { step: "agreements", agreementId: terms.agreementId, bodyHashShown: terms.bodyHash });

      const done = await call("POST", `/public/onboarding/${tok}/submit`);
      expect(done.status).toBe(200);
      expect(done.json).toMatchObject({ state: "PENDING_REVIEW", missing: [] });
      /* Locked while BTG reviews it. */
      expect((await call("PATCH", `/public/onboarding/${tok}`, { step: "organisation", orgName: "Changed" })).status).toBe(409);
    });

    it("never takes a tax id or bank details — the strict business step refuses them, and stores nothing", async () => {
      const tok = (await call("POST", "/public/onboarding", { orgType: "EVENT", orgName: "Harbor Classic" })).json.resumeToken;
      for (const details of [{ ein: "12-3456789" }, { bankAccount: "000123456" }, { routingNumber: "021000021" }]) {
        const r = await call("PATCH", `/public/onboarding/${tok}`, { step: "business", details });
        expect(r.status, JSON.stringify(details)).toBe(422);
      }
      expect((await call("GET", `/public/onboarding/${tok}`)).json.details).toEqual({});
    });

    it("a bad or forged token reaches nothing", async () => {
      expect((await call("GET", "/public/onboarding/not-a-token")).status).toBe(404);
      const tok = (await call("POST", "/public/onboarding", { orgType: "MEDIA", orgName: "Local Sports Pod" })).json.resumeToken as string;
      expect((await call("GET", `/public/onboarding/${tok.replace(/.$/, (c) => (c === "A" ? "B" : "A"))}`)).status).toBe(404);
    });
  });

  describe("2S1-BE-03", () => {
    it("PENDING_REVIEW → APPROVED grants listing access and is audited", async () => {
      const { id, submitted } = await completeTeam("Valley United");
      expect(submitted.json.state).toBe("PENDING_REVIEW");
      const queue = await call("GET", "/onboarding", undefined, "po_reviewer");
      expect(queue.json.onboardings.map((o: { id: string }) => o.id)).toContain(id);

      const approved = await call("POST", `/onboarding/${id}/decision`, { decision: "APPROVE" }, "po_reviewer");
      expect(approved.status).toBe(200);
      expect(approved.json).toMatchObject({ state: "APPROVED", listingAccess: true });
      const property = await prisma.property.findUniqueOrThrow({ where: { id: approved.json.propertyId }, select: { kind: true, name: true, stateCode: true, listingAccessAt: true } });
      expect(property).toMatchObject({ kind: "TEAM", name: "Valley United", stateCode: "CA" });
      expect(property.listingAccessAt).not.toBeNull();

      const trail = await prisma.auditLog.findFirstOrThrow({ where: { tenantId: T, entity: "PropertyOnboarding", entityId: id, action: "onboarding.approve" }, select: { actorId: true, before: true, after: true } });
      expect(trail).toMatchObject({ actorId: "po_reviewer", before: { state: "PENDING_REVIEW" }, after: { state: "APPROVED", listingAccess: true } });
    });

    it("every decision type can be actioned — and each is refused where the machine says so", async () => {
      /* Request changes → the applicant fixes and resubmits → approve → suspend → reinstate. */
      const { tok, id } = await completeTeam("Coastal Stars");
      expect((await call("POST", `/onboarding/${id}/decision`, { decision: "REQUEST_CHANGES" }, "po_reviewer")).status).toBe(422); // needs a note
      expect((await call("POST", `/onboarding/${id}/decision`, { decision: "REQUEST_CHANGES", notes: "Add your league's sanction number to the name." }, "po_reviewer")).json.state).toBe("CHANGES_REQUESTED");
      expect((await call("GET", `/public/onboarding/${tok}`)).json.reviewNotes).toMatch(/sanction number/);
      await call("PATCH", `/public/onboarding/${tok}`, { step: "organisation", orgName: "Coastal Stars (USYS #4411)" });
      expect((await call("POST", `/public/onboarding/${tok}/submit`)).json.state).toBe("PENDING_REVIEW");

      expect((await call("POST", `/onboarding/${id}/decision`, { decision: "REINSTATE" }, "po_reviewer")).status).toBe(409); // not suspended
      expect((await call("POST", `/onboarding/${id}/decision`, { decision: "APPROVE" }, "po_reviewer")).json.listingAccess).toBe(true);
      expect((await call("POST", `/onboarding/${id}/decision`, { decision: "APPROVE" }, "po_reviewer")).status).toBe(409); // already approved

      const suspended = await call("POST", `/onboarding/${id}/decision`, { decision: "SUSPEND", notes: "Chargeback under investigation." }, "po_reviewer");
      expect(suspended.json).toMatchObject({ state: "SUSPENDED", listingAccess: false });
      const reinstated = await call("POST", `/onboarding/${id}/decision`, { decision: "REINSTATE" }, "po_reviewer");
      expect(reinstated.json).toMatchObject({ state: "APPROVED", listingAccess: true });
      /* Reinstating keeps the same Property — no second one. */
      expect(reinstated.json.propertyId).toBe(suspended.json.propertyId);

      /* Reject a different one; it is terminal. */
      const other = await completeTeam("Nowhere FC");
      expect((await call("POST", `/onboarding/${other.id}/decision`, { decision: "REJECT", notes: "Could not verify the rights to sell." }, "po_reviewer")).json).toMatchObject({ state: "REJECTED", listingAccess: false });
      expect((await call("POST", `/onboarding/${other.id}/decision`, { decision: "APPROVE" }, "po_reviewer")).status).toBe(409);

      /* An unsubmitted draft cannot be approved. */
      const draft = (await call("POST", "/public/onboarding", { orgType: "TEAM", orgName: "Draft Only" })).json.id;
      expect((await call("POST", `/onboarding/${draft}/decision`, { decision: "APPROVE" }, "po_reviewer")).status).toBe(409);

      const actions = (await prisma.auditLog.findMany({ where: { tenantId: T, entityId: id }, select: { action: true }, orderBy: { at: "asc" } })).map((a) => a.action);
      expect(actions).toEqual(expect.arrayContaining(["onboarding.submit", "onboarding.request_changes", "onboarding.approve", "onboarding.suspend", "onboarding.reinstate"]));
    });

    it("only BTG reviews", async () => {
      const { id } = await completeTeam("Hill Rovers");
      expect((await call("GET", "/onboarding", undefined, "po_sponsor")).status).toBe(403);
      expect((await call("POST", `/onboarding/${id}/decision`, { decision: "APPROVE" }, "po_sponsor")).status).toBe(403);
    });
  });
});
