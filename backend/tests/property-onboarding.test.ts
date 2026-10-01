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
/* 2S1-BE-02 — the bucket's HEAD is the one network call stubbed: a key is
   "in the bucket" once the test says the browser uploaded it. Signing the
   upload and download URLs is real (it is local crypto, no network). */
const { uploaded } = vi.hoisted(() => ({ uploaded: new Set<string>() }));
vi.mock("../src/lib/storage", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/lib/storage")>();
  return { ...real, privateObjectSize: async (key: string) => (uploaded.has(key) ? 48_213 : null) };
});
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
    for (const to of ["DRAFT", "PENDING_REVIEW", "CHANGES_REQUESTED", "SUSPENDED"] as const) {
      expect(canTransitionOnboarding("REJECTED", to)).toBe(false);
    }
    /* 2S1-BE-06 — Reinstate after a Reject; decideOnboarding allows it only
       for an organisation that had been approved (phase2-org-auto-approval). */
    expect(canTransitionOnboarding("REJECTED", "APPROVED")).toBe(true);
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
    /* The tenants approval provisioned (2S1-BE-04), found through their Property. */
    const provisioned = (await prisma.$queryRawUnsafe<{ tenantId: string }[]>(
      `SELECT p."tenantId" FROM "PropertyOnboarding" o JOIN "Property" p ON p.id = o."propertyId" WHERE o."tenantId" = $1 AND p."tenantId" <> $1
       UNION SELECT "tenantId" FROM "User" WHERE (email LIKE '%@team.invalid' OR email LIKE 'po\\_mgr\\_%@onboarding-test.invalid') AND "tenantId" <> $1`, T,
    )).map((r) => r.tenantId);
    for (const tenant of [T, ...provisioned]) {
      for (const t of ["AuditLog", "OutboxJob", "OnboardingDocument", "PropertyOnboarding", "User", "Property", "Agreement"]) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, tenant);
      }
    }
    await prisma.tenant.deleteMany({ where: { id: { in: [T, ...provisioned] } } });
  }

  const emails = async (onboardingName: string) =>
    (await prisma.outboxJob.findMany({ where: { tenantId: T, name: "notify.email" }, select: { payload: true }, orderBy: { createdAt: "asc" } }))
      .map((j) => j.payload as { template: string; to: string; data: Record<string, string>; idempotencyKey: string })
      /* The five decision moments to the primary contact. 2S1-BE-06's email
         confirmation and BTG's new-organisation notice are tested in
         phase2-org-auto-approval.test.ts. */
      .filter((p) => p.data.orgName === onboardingName && p.template !== "onboarding.confirmEmail" && p.template !== "onboarding.newOrganization");

  /** The wizard, end to end, as a browser would drive it. */
  async function completeTeam(name: string, stateCode = "CA", contactEmail?: string) {
    const started = await call("POST", "/public/onboarding", { orgType: "TEAM", orgName: name });
    const tok = started.json.resumeToken as string;
    await call("PATCH", `/public/onboarding/${tok}`, { step: "organisation", stateCode });
    /* One address per organisation: approval gives the primary contact an
       account (2S1-BE-04), and an address can hold only one. */
    const email = contactEmail ?? `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}@team.invalid`;
    await call("PATCH", `/public/onboarding/${tok}`, { step: "contacts", contacts: [{ name: "Dana Cole", email, role: "Director", primary: true }] });
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
      /* No file hashes to HASH, so the wording is withheld rather than shown mismatched. */
      expect(terms).toEqual({ agreementId: "po_terms", version: 1, bodyHash: HASH, body: null });
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
  describe("2S1-BE-02 · verification documents", () => {
    it("upload straight to the private bucket — a signed PUT for one key, audited, never a read", async () => {
      const started = await call("POST", "/public/onboarding", { orgType: "TEAM", orgName: "Docs United" });
      const tok = started.json.resumeToken as string;
      const granted = await call("POST", `/public/onboarding/${tok}/documents`, { kind: "RIGHTS_PROOF", filename: "../../etc/Rights letter (signed).pdf", contentType: "application/pdf", bytes: 48_000 });
      expect(granted.status).toBe(201);
      const url = new URL(granted.json.uploadUrl);
      /* The private bucket, a signed PUT, and a key under this application only. */
      expect(url.pathname.startsWith("/sponsorx-private/onboarding/")).toBe(true);
      expect(url.pathname).toContain(`/onboarding/${started.json.id}/`);
      expect(url.pathname).not.toContain("..");
      expect(url.searchParams.get("X-Amz-Signature")).toBeTruthy();
      expect(granted.text).not.toContain("sponsorx-public");
      const doc = granted.json.document;
      expect(doc).toMatchObject({ kind: "RIGHTS_PROOF", filename: "Rights-letter-signed-.pdf", uploadedAt: null });
      expect(await prisma.auditLog.count({ where: { tenantId: T, action: "storage.privateUploadGrant", entity: "OnboardingDocument", entityId: doc.id } })).toBe(1);

      /* Only paper: no HTML, nothing over 20 MB. */
      expect((await call("POST", `/public/onboarding/${tok}/documents`, { kind: "OTHER", filename: "x.html", contentType: "text/html", bytes: 10 })).status).toBe(400);
      expect((await call("POST", `/public/onboarding/${tok}/documents`, { kind: "OTHER", filename: "x.pdf", contentType: "application/pdf", bytes: 21 * 1024 * 1024 })).status).toBe(400);

      /* Attached only once it is really in the bucket. */
      expect((await call("POST", `/public/onboarding/${tok}/documents/${doc.id}/confirm`)).status).toBe(409);
      const row = await prisma.onboardingDocument.findUniqueOrThrow({ where: { id: doc.id }, select: { r2Key: true } });
      uploaded.add(row.r2Key);
      const confirmed = await call("POST", `/public/onboarding/${tok}/documents/${doc.id}/confirm`);
      expect(confirmed.status).toBe(200);
      expect(confirmed.json).toMatchObject({ id: doc.id, bytes: 48_213 });
      expect(confirmed.json.uploadedAt).not.toBeNull();

      /* The applicant sees names and status — no link, no key, not even to its own file. */
      const own = await call("GET", `/public/onboarding/${tok}`);
      expect(own.json.documents).toEqual([expect.objectContaining({ id: doc.id, kind: "RIGHTS_PROOF" })]);
      expect(own.text).not.toMatch(/X-Amz-|r2Key|downloadUrl|onboarding\/[a-z0-9]+\/odoc_/);
      /* A forged token and another application's token reach nothing. */
      const other = (await call("POST", "/public/onboarding", { orgType: "TEAM", orgName: "Other Org" })).json.resumeToken as string;
      expect((await call("POST", `/public/onboarding/${other}/documents/${doc.id}/confirm`)).status).toBe(404);
      expect((await call("POST", `/public/onboarding/not-a-token/documents`, { kind: "OTHER", filename: "x.pdf", contentType: "application/pdf", bytes: 10 })).status).toBe(404);
    });

    it("are reviewable by an admin through an audited link — and by nobody else", async () => {
      const started = await call("POST", "/public/onboarding", { orgType: "TEAM", orgName: "Review Docs FC" });
      const tok = started.json.resumeToken as string;
      const doc = (await call("POST", `/public/onboarding/${tok}/documents`, { kind: "BUSINESS_REGISTRATION", filename: "reg.png", contentType: "image/png", bytes: 900 })).json.document;
      const pending = (await call("POST", `/public/onboarding/${tok}/documents`, { kind: "IDENTITY", filename: "id.jpg", contentType: "image/jpeg", bytes: 900 })).json.document;
      uploaded.add((await prisma.onboardingDocument.findUniqueOrThrow({ where: { id: doc.id }, select: { r2Key: true } })).r2Key);
      await call("POST", `/public/onboarding/${tok}/documents/${doc.id}/confirm`);

      const review = await call("GET", `/onboarding/${started.json.id}/documents`, undefined, "po_reviewer");
      expect(review.status).toBe(200);
      const [reg, id] = review.json.documents;
      expect(reg).toMatchObject({ id: doc.id, kind: "BUSINESS_REGISTRATION" });
      const read = new URL(reg.downloadUrl);
      expect(read.pathname.startsWith("/sponsorx-private/onboarding/")).toBe(true);
      expect(Number(read.searchParams.get("X-Amz-Expires"))).toBeLessThanOrEqual(900);
      /* Never confirmed: listed, with nothing to read. */
      expect(id).toMatchObject({ id: pending.id, downloadUrl: null });
      const grant = await prisma.auditLog.findFirstOrThrow({ where: { tenantId: T, action: "storage.privateDownloadGrant", entityId: doc.id }, select: { actorId: true, after: true } });
      expect(grant.actorId).toBe("po_reviewer");
      expect(JSON.stringify(grant.after)).not.toContain("X-Amz-Signature"); // the credential is never logged

      expect((await call("GET", `/onboarding/${started.json.id}/documents`, undefined, "po_sponsor")).status).toBe(403);
      expect((await call("GET", `/onboarding/${started.json.id}/documents`)).status).toBe(401);
    });

    it("are never publicly reachable — no public-bucket path exists in the code", async () => {
      const { readFileSync } = await import("node:fs");
      const src = readFileSync(new URL("../src/domain/onboarding-documents.ts", import.meta.url), "utf8");
      expect(src).not.toMatch(/presignPublicUpload|R2_PUBLIC_BASE_URL|BUCKETS\.public/);
      /* A submitted application still takes the documents it is missing
         (2S1-BE-06); an approved one takes none through the public token —
         its manager changes them from the portal (2S1-BE-07). */
      const { tok, id } = await completeTeam("Locked Docs FC");
      expect((await call("POST", `/public/onboarding/${tok}/documents`, { kind: "OTHER", filename: "late.pdf", contentType: "application/pdf", bytes: 10 })).status).toBe(201);
      await call("POST", `/onboarding/${id}/decision`, { decision: "APPROVE" }, "po_reviewer");
      expect((await call("POST", `/public/onboarding/${tok}/documents`, { kind: "OTHER", filename: "later.pdf", contentType: "application/pdf", bytes: 10 })).status).toBe(409);
    });
  });

  describe("2S1-BE-04 · approval provisions an outside tenant", () => {
    it("an approved property's users see only their own tenant's data", async () => {
      const a = await completeTeam("Tenant A Rovers", "MD", "po_mgr_a@onboarding-test.invalid");
      const b = await completeTeam("Tenant B Rovers", "MD", "po_mgr_b@onboarding-test.invalid");
      const pa = (await call("POST", `/onboarding/${a.id}/decision`, { decision: "APPROVE" }, "po_reviewer")).json.propertyId as string;
      const pb = (await call("POST", `/onboarding/${b.id}/decision`, { decision: "APPROVE" }, "po_reviewer")).json.propertyId as string;

      /* Each is its own tenant — not BTG's, not each other's. */
      const [propA, propB] = await Promise.all([pa, pb].map((id) => prisma.property.findUniqueOrThrow({ where: { id }, select: { tenantId: true, name: true } })));
      expect(propA.tenantId).not.toBe(T);
      expect(propB.tenantId).not.toBe(T);
      expect(propA.tenantId).not.toBe(propB.tenantId);
      expect(await prisma.tenant.findUniqueOrThrow({ where: { id: propA.tenantId }, select: { name: true } })).toEqual({ name: "Tenant A Rovers" });

      /* The primary contact signs in and lands in that tenant as its property manager. */
      const meA = await call("GET", "/me", undefined, "po_mgr_a");
      expect(meA.status).toBe(200);
      expect(meA.json).toMatchObject({ tenantId: propA.tenantId, roles: ["PROPERTY_MGR"], propertyId: pa });
      expect((await call("GET", "/properties/mine", undefined, "po_mgr_a")).json.property).toMatchObject({ id: pa, name: "Tenant A Rovers" });
      expect((await call("GET", "/properties/mine", undefined, "po_mgr_b")).json.property).toMatchObject({ id: pb, name: "Tenant B Rovers" });

      /* Nothing of BTG's: not the verification queue, not an application, not a document. */
      for (const path of ["/onboarding", `/onboarding/${a.id}`, `/onboarding/${a.id}/documents`]) {
        expect((await call("GET", path, undefined, "po_mgr_a")).status, path).toBe(403);
      }
      const provisioning = await prisma.auditLog.findFirstOrThrow({ where: { tenantId: propA.tenantId, action: "tenant.provision" }, select: { after: true } });
      expect(provisioning.after).toMatchObject({ onboardingId: a.id, propertyId: pa, roles: ["PROPERTY_MGR"] });
      const approval = await prisma.auditLog.findFirstOrThrow({ where: { tenantId: T, action: "onboarding.approve", entityId: a.id }, select: { after: true } });
      expect(approval.after).toMatchObject({ tenantId: propA.tenantId });

      /* Suspension and reinstatement move listing access on the outside tenant's Property. */
      await call("POST", `/onboarding/${a.id}/decision`, { decision: "SUSPEND", notes: "Paused." }, "po_reviewer");
      expect((await prisma.property.findUniqueOrThrow({ where: { id: pa }, select: { listingAccessAt: true } })).listingAccessAt).toBeNull();
    });

    it("refuses an address that already has an account, and provisions nothing", async () => {
      const { id } = await completeTeam("Taken Address FC", "MD", "r@po.invalid"); // the reviewer's own address
      /* Counted by this org's name, not globally: other test files create and
         remove tenants in parallel, so a global count is not this test's. */
      const tenantsBefore = await prisma.tenant.count({ where: { name: "Taken Address FC" } });
      const refused = await call("POST", `/onboarding/${id}/decision`, { decision: "APPROVE" }, "po_reviewer");
      expect(refused.status).toBe(409);
      expect(refused.text).toMatch(/already has a SponsorX account/);
      expect(await prisma.tenant.count({ where: { name: "Taken Address FC" } })).toBe(tenantsBefore);
      expect((await call("GET", `/onboarding/${id}`, undefined, "po_reviewer")).json).toMatchObject({ state: "PENDING_REVIEW", propertyId: null });
    });
  });

  describe("2S1-INT-01 · the five onboarding notifications, as queued jobs", () => {
    it("received, changes requested, approved, suspended, rejected — each a queued email to the primary contact", async () => {
      const { EMAIL_TEMPLATES } = await import("../worker/jobs/send-email.mts");
      const { tok, id } = await completeTeam("Notify City", "MD", "notify@team.invalid");
      await call("POST", `/onboarding/${id}/decision`, { decision: "REQUEST_CHANGES", notes: "Add your league sanction number." }, "po_reviewer");
      await call("POST", `/public/onboarding/${tok}/submit`);
      await call("POST", `/onboarding/${id}/decision`, { decision: "REQUEST_CHANGES", notes: "And the venue." }, "po_reviewer");
      await call("POST", `/public/onboarding/${tok}/submit`);
      await call("POST", `/onboarding/${id}/decision`, { decision: "APPROVE" }, "po_reviewer");
      await call("POST", `/onboarding/${id}/decision`, { decision: "SUSPEND", notes: "Chargeback under review." }, "po_reviewer");
      const other = await completeTeam("Notify Nowhere", "MD", "nowhere@team.invalid");
      await call("POST", `/onboarding/${other.id}/decision`, { decision: "REJECT", notes: "Could not verify the rights to sell." }, "po_reviewer");

      const sent = await emails("Notify City");
      expect(sent.map((e) => e.template)).toEqual([
        "onboarding.received", "onboarding.changesRequested", "onboarding.received",
        "onboarding.changesRequested", "onboarding.received", "onboarding.approved", "onboarding.suspended",
      ]);
      expect(new Set(sent.map((e) => e.to))).toEqual(new Set(["notify@team.invalid"]));
      /* Each moment its own key — a second request for changes is a new message, a redelivery is not. */
      expect(new Set(sent.map((e) => e.idempotencyKey)).size).toBe(sent.length);
      expect(sent[3]!.idempotencyKey).toBe(`onboarding.changesRequested:${id}:2`);
      /* The reviewer's words reach the applicant, with a link back into the saved application. */
      const changes = sent[1]!;
      expect(changes.data.notes).toBe("Add your league sanction number.");
      const resume = changes.data.resumeUrl!.split("/onboarding/")[1]!;
      expect((await call("GET", `/public/onboarding/${resume}`)).json.id).toBe(id);
      expect(sent[5]!.data.portalUrl).toMatch(/\/property$/);

      const rejected = await emails("Notify Nowhere");
      expect(rejected.map((e) => e.template)).toEqual(["onboarding.received", "onboarding.rejected"]);

      /* Every one renders, with the organisation's name and the note quoted. */
      for (const e of [...sent, ...rejected]) {
        const { subject, text } = EMAIL_TEMPLATES[e.template]!(e.data);
        expect(subject + text).toContain(e.data.orgName!);
        if (e.data.notes) expect(text).toContain(e.data.notes);
      }
    });

    it("a rolled-back decision announces nothing", async () => {
      const { id } = await completeTeam("Rollback FC", "MD", "r@po.invalid"); // approval refused: address taken
      await call("POST", `/onboarding/${id}/decision`, { decision: "APPROVE" }, "po_reviewer");
      expect((await emails("Rollback FC")).map((e) => e.template)).toEqual(["onboarding.received"]);
    });
  });
});

describe("the terms wording (2S1-FE-01)", () => {
  it("is served from agreements/PROPERTY_TERMS.v1.txt only while it hashes to the stored version", async () => {
    const { readFile } = await import("node:fs/promises");
    const { createHash } = await import("node:crypto");
    const body = await readFile(new URL("../agreements/PROPERTY_TERMS.v1.txt", import.meta.url), "utf8");
    const { PROPERTY_TERMS_PLACEHOLDER } = await import("../worker/jobs/seed-environment.mts");
    /* The seeded staging row hashes the placeholder — the file must be those exact words. */
    expect(body).toBe(PROPERTY_TERMS_PLACEHOLDER);
    expect(createHash("sha256").update(body).digest("hex")).toMatch(/^[0-9a-f]{64}$/);
  });
});
