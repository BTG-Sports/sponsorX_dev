import type { AddressInfo } from "node:net";
import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";

/* --------------------------------------------------------------------------
   2S1-BE-06 — "An organization with every required document, a confirmed
   contact email and a unique name is approved without BTG; a duplicate name
   (after normalising) is refused, even between two applications at once;
   anything incomplete goes to BTG's queue with the reason shown to the
   applicant; BTG admins are emailed for each new organization with a link
   to its profile; Reject withdraws access, ends listings, holds payouts and
   emails the reason; tenant and role tests cover it."

   2S1-BE-07 — "An approved organization can replace or add documents; each
   change re-runs the checklist, keeps the previous file and emails BTG
   admins a link; a missing required document flags the organization for
   BTG; only the organization's own manager can change its documents."

   2S1-BE-08 — "An agency can apply, is held to its own document list, can
   hold a roster and an agreed share, and can be targeted by commission
   rules like any other organization type."

   Every applicant step is HTTP against the real app. The only hand-made
   rows are the platform's own (a tenant, its terms, BTG's admin, a sponsor)
   and, for the Reject test, the listings and payouts a live organisation
   would have.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
process.env.INTAKE_TOKEN_SECRET ??= "test-intake-secret-test-intake-secret";
process.env.PUBLIC_INTAKE_TENANT_ID = "oa_tenant";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
const { uploaded } = vi.hoisted(() => ({ uploaded: new Set<string>() }));
vi.mock("../src/lib/storage", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/lib/storage")>();
  return { ...real, checkPrivateUpload: async (_actor: unknown, key: string) => (uploaded.has(key) ? { ok: true as const, bytes: 52_000 } : { ok: false as const, problem: "missing" as const }) };
});
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@oa-test.invalid` } : null;
  },
}));

const rules = await import("../src/domain/onboarding-rules");
const { normalizeBusinessName } = await import("../src/domain/business-name-rules");

describe("the rules (pure)", () => {
  it("one name, compared one way", () => {
    for (const n of ["Westfield Hawks", "The Westfield Hawks", "westfield hawks, LLC", "WESTFIELD-HAWKS Inc."]) {
      expect(normalizeBusinessName(n)).toBe("westfieldhawks");
    }
    expect(normalizeBusinessName("Westfield Hawks Laurel")).not.toBe("westfieldhawks");
  });

  it("documents by type and state — an agency is held to its own list, one registration per state", () => {
    const keys = (o: Parameters<typeof rules.requiredDocuments>[0]) => rules.requiredDocuments(o).map((r) => r.key);
    expect(keys({ orgType: "TEAM", stateCode: "MD", details: {} })).toEqual(["IDENTITY", "RIGHTS_PROOF"]);
    expect(keys({ orgType: "TEAM", stateCode: "CA", details: {} })).toEqual(["IDENTITY", "RIGHTS_PROOF", "BUSINESS_REGISTRATION:CA"]);
    expect(keys({ orgType: "SCHOOL", stateCode: "CA", details: {} })).toEqual(["IDENTITY", "RIGHTS_PROOF"]);
    expect(keys({ orgType: "MEDIA", stateCode: "TX", details: {} })).toEqual(["IDENTITY", "BUSINESS_REGISTRATION:TX"]);
    expect(keys({ orgType: "AGENCY", stateCode: "MD", details: { statesOperatedIn: ["VA", "DC", "VA"] } })).toEqual([
      "IDENTITY", "REPRESENTATION_AGREEMENT", "BUSINESS_REGISTRATION:DC", "BUSINESS_REGISTRATION:MD", "BUSINESS_REGISTRATION:VA",
    ]);
    /* A registration counts for its own state only. */
    const checklist = rules.documentChecklist({ orgType: "AGENCY", stateCode: "MD", details: { statesOperatedIn: ["VA"] } }, [
      { id: "a", kind: "BUSINESS_REGISTRATION", stateCode: "MD", filename: "md.pdf", uploadedAt: new Date(), replacedAt: null, removedAt: null },
      { id: "b", kind: "BUSINESS_REGISTRATION", stateCode: "VA", filename: "va.pdf", uploadedAt: new Date(), replacedAt: new Date(), removedAt: null },
    ]);
    expect(checklist.filter((c) => !c.document).map((c) => c.key)).toEqual(["IDENTITY", "REPRESENTATION_AGREEMENT", "BUSINESS_REGISTRATION:VA"]);
  });

  it("an agency's details name the states it operates in, and nothing else", () => {
    expect(rules.DETAILS_SCHEMA.AGENCY.safeParse({ legalEntityName: "Prime Athletes LLC", statesOperatedIn: ["MD", "VA"] }).success).toBe(true);
    expect(rules.DETAILS_SCHEMA.AGENCY.safeParse({ legalEntityName: "X", statesOperatedIn: ["ZZ"] }).success).toBe(false);
    expect(rules.DETAILS_SCHEMA.AGENCY.safeParse({ legalEntityName: "X", statesOperatedIn: ["MD"], ein: "12-3456789" }).success).toBe(false);
  });

  it("the verdict approves only when every item holds, and names each one that doesn't", () => {
    const ok = { answersMissing: [], missingDocuments: [], contactEmail: "a@x.invalid", emailConfirmed: true, nameTakenBy: null, emailHasLogin: false };
    expect(rules.approvalVerdict(ok)).toMatchObject({ outcome: "approve", reasons: [] });
    const held = rules.approvalVerdict({ ...ok, missingDocuments: ["Government ID of the person signing"], emailConfirmed: false, nameTakenBy: "Other FC" });
    expect(held.outcome).toBe("review");
    expect(held.reasons).toEqual([
      "Missing document: Government ID of the person signing",
      "The primary contact hasn't confirmed their email yet — open the link we emailed",
      "This name is already registered on SponsorX — add your town to tell it apart, or contact BTG",
    ]);
    /* The applicant reads the reasons, so the other organisation is not named there — only in BTG's checks. */
    expect(held.reasons.join(" ")).not.toContain("Other FC");
    expect(held.checks.find((c) => c.key === "name")!.label).toContain("Other FC");
  });
});

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("organisations over the API", async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { decidePayout } = await import("../src/domain/payouts");
  const { resolveRates } = await import("../src/domain/commission");
  const T = "oa_tenant";
  const HASH = "o".repeat(64);
  const ADMIN = "oa_admin";
  const admin = { userId: ADMIN, tenantId: T, roles: ["BTG_ADMIN" as const], sponsorId: null, athleteId: null, guardianId: null, propertyId: null };
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

  async function provisionedTenants() {
    return (await prisma.$queryRawUnsafe<{ tenantId: string }[]>(
      `SELECT p."tenantId" FROM "PropertyOnboarding" o JOIN "Property" p ON p.id = o."propertyId" WHERE o."tenantId" = $1 AND p."tenantId" <> $1`, T,
    )).map((r) => r.tenantId);
  }

  async function clean() {
    const provisioned = await provisionedTenants();
    for (const tenant of [T, ...provisioned]) {
      for (const t of ["AuditLog", "OutboxJob", "Listing", "InventoryItem", "Payout", "CommissionRule", "OnboardingDocument", "PropertyOnboarding", "User", "Athlete", "Property", "Agreement"]) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, tenant);
      }
    }
    await prisma.tenant.deleteMany({ where: { id: { in: [T, ...provisioned] } } });
  }

  /** Every queued email in the tests' tenant, newest last. */
  const outbox = async () =>
    (await prisma.outboxJob.findMany({ where: { tenantId: T, name: "notify.email" }, select: { payload: true }, orderBy: { createdAt: "asc" } }))
      .map((j) => j.payload as { template: string; to: string; data: Record<string, string>; idempotencyKey: string });

  type Opts = { orgType?: string; stateCode?: string; clerk?: string; details?: Record<string, unknown> };

  /** The wizard's answers, end to end — everything but the documents and the email link. */
  async function apply(name: string, o: Opts = {}) {
    const started = await call("POST", "/public/onboarding", { orgType: o.orgType ?? "TEAM", orgName: name });
    expect(started.status, started.text).toBe(201);
    const tok = started.json.resumeToken as string;
    await call("PATCH", `/public/onboarding/${tok}`, { step: "organisation", stateCode: o.stateCode ?? "MD" });
    const clerk = o.clerk ?? `oa_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
    await call("PATCH", `/public/onboarding/${tok}`, { step: "contacts", contacts: [{ name: "Dana Cole", email: `${clerk}@oa-test.invalid`, role: "Director", primary: true }] });
    const details = o.details ?? { legalEntityName: `${name} LLC`, league: "MD Youth", sport: "Soccer" };
    expect((await call("PATCH", `/public/onboarding/${tok}`, { step: "business", details })).status).toBe(200);
    await call("PATCH", `/public/onboarding/${tok}`, { step: "payout", acknowledged: true });
    const terms = (await call("GET", `/public/onboarding/${tok}`)).json.terms;
    await call("PATCH", `/public/onboarding/${tok}`, { step: "agreements", agreementId: terms.agreementId, bodyHashShown: terms.bodyHash });
    return { tok, id: started.json.id as string, clerk };
  }

  /** The browser's upload: grant, PUT (the test marks the key as arrived), confirm. */
  async function upload(tok: string, kind: string, stateCode?: string) {
    const g = await call("POST", `/public/onboarding/${tok}/documents`, { kind, filename: `${kind.toLowerCase()}.pdf`, contentType: "application/pdf", bytes: 2000, ...(stateCode ? { stateCode } : {}) });
    expect(g.status, g.text).toBe(201);
    uploaded.add((await prisma.onboardingDocument.findUniqueOrThrow({ where: { id: g.json.document.id }, select: { r2Key: true } })).r2Key);
    const c = await call("POST", `/public/onboarding/${tok}/documents/${g.json.document.id}/confirm`);
    expect(c.status, c.text).toBe(200);
    return g.json.document.id as string;
  }

  /** The `t` in the newest confirmation link sent for this application. */
  async function confirmToken(id: string) {
    const link = (await outbox()).filter((e) => e.template === "onboarding.confirmEmail" && e.idempotencyKey.includes(`:${id}:`)).at(-1);
    return new URL(link!.data.confirmUrl!).searchParams.get("t")!;
  }

  /** Every check passed: answers, both documents, the email link — approved without BTG. */
  async function approvedTeam(name: string, o: Opts = {}) {
    const a = await apply(name, o);
    await upload(a.tok, "IDENTITY");
    await upload(a.tok, "RIGHTS_PROOF");
    await call("POST", `/public/onboarding/${a.tok}/submit`);
    const confirmed = await call("POST", "/public/onboarding/confirm-email", { token: await confirmToken(a.id) });
    expect(confirmed.json, confirmed.text).toMatchObject({ state: "APPROVED", approved: true });
    const row = await prisma.propertyOnboarding.findUniqueOrThrow({ where: { id: a.id }, select: { propertyId: true } });
    return { ...a, propertyId: row.propertyId! };
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "Org auto-approval test tenant" } });
    await prisma.agreement.create({ data: { id: "oa_terms", tenantId: T, kind: "PROPERTY_TERMS", version: 1, bodyHash: HASH, effectiveAt: new Date("2026-09-01") } });
    await prisma.user.createMany({ data: [
      { id: ADMIN, tenantId: T, clerkId: ADMIN, email: "admin@oa.invalid", roles: ["BTG_ADMIN"] },
      { id: "oa_sponsor", tenantId: T, clerkId: "oa_sponsor", email: "sponsor@oa.invalid", roles: ["SPONSOR_ADMIN"] },
    ] });
    /* A property BTG runs itself, never onboarded — its name is taken too. */
    await prisma.property.create({ data: { id: "oa_btg_property", tenantId: T, name: "OA Harbour Rowing Club", kind: "TEAM", slug: "oa-harbour-rowing-club" } });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await clean();
  });

  describe("2S1-BE-06 · approved without BTG", () => {
    it("every document, a confirmed email and a free name: approved, the login created, BTG told — no person involved", async () => {
      const a = await apply("OA Valley Rovers");
      /* The applicant's live checklist: exactly what is still missing. */
      const fresh = (await call("GET", `/public/onboarding/${a.tok}`)).json;
      expect(fresh.checklist.map((c: { key: string; done: boolean }) => [c.key, c.done])).toEqual([["IDENTITY", false], ["RIGHTS_PROOF", false]]);
      expect(fresh.emailConfirmed).toBe(false);
      /* Saving the contact sent the link. */
      expect((await outbox()).filter((e) => e.template === "onboarding.confirmEmail" && e.to === `${a.clerk}@oa-test.invalid`)).toHaveLength(1);

      await upload(a.tok, "IDENTITY");
      /* Submitted with one paper missing and the email unconfirmed: BTG's queue, the reasons shown to the applicant. */
      const submitted = await call("POST", `/public/onboarding/${a.tok}/submit`);
      expect(submitted.json).toMatchObject({ state: "PENDING_REVIEW" });
      expect(submitted.json.reviewReasons).toEqual([
        "Missing document: Proof of the rights to sell your inventory",
        "The primary contact hasn't confirmed their email yet — open the link we emailed",
      ]);
      const receipt = (await outbox()).find((e) => e.template === "onboarding.received" && e.data.orgName === "OA Valley Rovers")!;
      expect(receipt.data.stillNeeded).toContain("Proof of the rights to sell");
      const queue = await call("GET", "/onboarding", undefined, ADMIN);
      expect(queue.json.onboardings.find((o: { id: string }) => o.id === a.id).reviewReasons).toHaveLength(2);
      /* BTG admins are emailed a link to the profile. */
      const review = (await outbox()).filter((e) => e.template === "onboarding.newOrganization" && e.data.orgName === "OA Valley Rovers");
      expect(review).toHaveLength(1);
      expect(review[0]).toMatchObject({ to: "admin@oa.invalid" });
      expect(review[0]!.data.profileUrl).toMatch(new RegExp(`/admin/onboarding/${a.id}$`));

      /* While it waits, the applicant fixes it: the last paper, then the email link. */
      await upload(a.tok, "RIGHTS_PROOF");
      expect((await call("GET", `/public/onboarding/${a.tok}`)).json).toMatchObject({ state: "PENDING_REVIEW", reviewReasons: ["The primary contact hasn't confirmed their email yet — open the link we emailed"] });
      const confirmed = await call("POST", "/public/onboarding/confirm-email", { token: await confirmToken(a.id) });
      expect(confirmed.json).toMatchObject({ state: "APPROVED", approved: true, emailConfirmed: true });

      const row = await prisma.propertyOnboarding.findUniqueOrThrow({ where: { id: a.id }, select: { autoApproved: true, decidedBy: true, approvalChecks: true, propertyId: true } });
      expect(row).toMatchObject({ autoApproved: true, decidedBy: null });
      expect((row.approvalChecks as { checks: { ok: boolean }[] }).checks.every((c) => c.ok)).toBe(true);
      const property = await prisma.property.findUniqueOrThrow({ where: { id: row.propertyId! }, select: { tenantId: true, listingAccessAt: true, kind: true } });
      expect(property.listingAccessAt).not.toBeNull();
      /* The manager's login exists, and signs in to its own tenant. */
      const me = await call("GET", "/me", undefined, a.clerk);
      expect(me.json).toMatchObject({ tenantId: property.tenantId, roles: ["PROPERTY_MGR"], propertyId: row.propertyId });
      const trail = await prisma.auditLog.findFirstOrThrow({ where: { tenantId: T, entityId: a.id, action: "onboarding.autoApprove" }, select: { actorId: true } });
      expect(trail.actorId).toBeNull();
      const sent = (await outbox()).filter((e) => e.data.orgName === "OA Valley Rovers").map((e) => e.template);
      expect(sent).toEqual(expect.arrayContaining(["onboarding.approved"]));
      expect((await outbox()).filter((e) => e.template === "onboarding.newOrganization" && e.data.orgName === "OA Valley Rovers").map((e) => e.data.outcome))
        .toEqual(["is waiting for your review", "was approved automatically"]);

      /* The spot-check list shows it. */
      const auto = await call("GET", "/onboarding?list=auto", undefined, ADMIN);
      expect(auto.json.onboardings.map((o: { id: string }) => o.id)).toContain(a.id);
    });

    it("all in before submitting: approved at the moment of submit, with one email to the applicant", async () => {
      const a = await apply("OA Quick Start FC");
      await upload(a.tok, "IDENTITY");
      await upload(a.tok, "RIGHTS_PROOF");
      /* Confirming before submitting only records the address — it is not submitted yet. */
      expect((await call("POST", "/public/onboarding/confirm-email", { token: await confirmToken(a.id) })).json).toMatchObject({ state: "DRAFT", approved: false });
      const submitted = await call("POST", `/public/onboarding/${a.tok}/submit`);
      expect(submitted.json).toMatchObject({ state: "APPROVED", autoApproved: true, listingAccess: true });
      const mine = (await outbox()).filter((e) => e.data.orgName === "OA Quick Start FC" && e.to.endsWith("@oa-test.invalid")).map((e) => e.template);
      expect(mine).toEqual(["onboarding.confirmEmail", "onboarding.approved"]);
    });

    it("a link sent to an earlier contact confirms nothing; a forged one is refused", async () => {
      const a = await apply("OA Changed Contact FC");
      const old = await confirmToken(a.id);
      await call("PATCH", `/public/onboarding/${a.tok}`, { step: "contacts", contacts: [{ name: "Lee Park", email: "oa_new_contact@oa-test.invalid", role: "Owner", primary: true }] });
      expect((await call("POST", "/public/onboarding/confirm-email", { token: old })).status).toBe(400);
      expect((await call("POST", "/public/onboarding/confirm-email", { token: `${a.id}.forgedforgedforged` })).status).toBe(400);
      expect((await call("POST", "/public/onboarding/confirm-email", { token: a.tok })).status).toBe(400); // the resume token never confirms an email
      const fresh = await confirmToken(a.id);
      expect((await call("POST", "/public/onboarding/confirm-email", { token: fresh })).json.emailConfirmed).toBe(true);
      expect((await call("GET", `/public/onboarding/${a.tok}`)).json.emailConfirmed).toBe(true);
      /* Resend while unconfirmed is a fresh email; once confirmed it sends nothing. */
      const before = (await outbox()).length;
      await call("POST", `/public/onboarding/${a.tok}/resend-confirmation`);
      expect((await outbox()).length).toBe(before);
    });

    it("an email that already has a login waits for BTG, with the reason", async () => {
      const a = await apply("OA Taken Login FC");
      /* Someone signs up elsewhere with the contact's address before the checks run. */
      await prisma.user.create({ data: { tenantId: T, clerkId: "oa_dup_login", email: `${a.clerk}@oa-test.invalid`, roles: ["SPONSOR_ADMIN"] } });
      await upload(a.tok, "IDENTITY");
      await upload(a.tok, "RIGHTS_PROOF");
      await call("POST", `/public/onboarding/${a.tok}/submit`);
      const r = await call("POST", "/public/onboarding/confirm-email", { token: await confirmToken(a.id) });
      expect(r.json.state).toBe("PENDING_REVIEW");
      expect(r.json.reviewReasons).toEqual([expect.stringMatching(/already has a SponsorX login/)]);
    });

    it("P1-FE-31 · ?page=1&size=1 answers one row with the page and every tab's count; without ?page the old shape", async () => {
      const whole = await call("GET", "/onboarding", undefined, ADMIN);
      expect(whole.status, whole.text).toBe(200);
      expect(Object.keys(whole.json)).toEqual(["onboardings"]);
      const paged = await call("GET", "/onboarding?page=1&size=1", undefined, ADMIN);
      expect(paged.status, paged.text).toBe(200);
      const total = whole.json.onboardings.length;
      expect(total).toBeGreaterThanOrEqual(1);
      expect(paged.json.page).toEqual({ page: 1, size: 1, total, pages: total });
      expect(paged.json.onboardings).toHaveLength(1);
      expect(paged.json.onboardings[0].id).toBe(whole.json.onboardings[0].id);
      /* The counts: one per state the tenant has, plus the two spot-check lists. */
      const autoWhole = await call("GET", "/onboarding?list=auto", undefined, ADMIN);
      const flaggedWhole = await call("GET", "/onboarding?list=flagged", undefined, ADMIN);
      expect(paged.json.counts).toMatchObject({ PENDING_REVIEW: total, auto: autoWhole.json.onboardings.length, flagged: flaggedWhole.json.onboardings.length });
      expect(paged.json.counts.auto).toBeGreaterThanOrEqual(1);
      const autoPaged = await call("GET", "/onboarding?list=auto&page=1&size=1", undefined, ADMIN);
      expect(autoPaged.json.page).toEqual({ page: 1, size: 1, total: autoWhole.json.onboardings.length, pages: autoWhole.json.onboardings.length });
      expect(autoPaged.json.onboardings).toHaveLength(1);
      expect(autoPaged.json.counts).toEqual(paged.json.counts);
    });
  });

  describe("2S1-BE-06 · one name, platform-wide", () => {
    it("a duplicate after normalising is refused — against an application in progress and a property BTG runs", async () => {
      expect((await call("POST", "/public/onboarding", { orgType: "TEAM", orgName: "OA Westfield Hawks" })).status).toBe(201);
      for (const dup of ["The OA Westfield Hawks", "oa westfield hawks, LLC", "OA WESTFIELD-HAWKS Inc."]) {
        const r = await call("POST", "/public/onboarding", { orgType: "EVENT", orgName: dup });
        expect(r.status, dup).toBe(409);
        expect(r.text).toMatch(/already registered/);
      }
      expect((await call("POST", "/public/onboarding", { orgType: "TEAM", orgName: "The OA Harbour Rowing Club, Inc" })).status).toBe(409);
      /* Renaming into a taken name is refused too. */
      const other = (await call("POST", "/public/onboarding", { orgType: "TEAM", orgName: "OA Westfield Hawks Laurel" })).json.resumeToken;
      expect((await call("PATCH", `/public/onboarding/${other}`, { step: "organisation", orgName: "Westfield Hawks, OA" })).status).toBe(200); // a different name
      expect((await call("PATCH", `/public/onboarding/${other}`, { step: "organisation", orgName: "OA Westfield Hawks LLC" })).status).toBe(409);
    });

    it("even between two applications at once — the database refuses the second", async () => {
      const both = await Promise.all([
        call("POST", "/public/onboarding", { orgType: "TEAM", orgName: "OA Twin Rivers" }),
        call("POST", "/public/onboarding", { orgType: "MEDIA", orgName: "the oa twin rivers co" }),
        call("POST", "/public/onboarding", { orgType: "EVENT", orgName: "OA TWIN RIVERS" }),
      ]);
      expect(both.map((r) => r.status).sort()).toEqual([201, 409, 409]);
      expect(await prisma.propertyOnboarding.count({ where: { nameKey: "oatwinrivers" } })).toBe(1);
    });

    it("an application BTG rejects at review frees its name", async () => {
      const a = await apply("OA Released Name FC");
      await call("POST", `/public/onboarding/${a.tok}/submit`);
      await call("POST", `/onboarding/${a.id}/decision`, { decision: "REJECT", notes: "Not a real club." }, ADMIN);
      expect((await call("POST", "/public/onboarding", { orgType: "TEAM", orgName: "OA Released Name FC" })).status).toBe(201);
      /* …and it stays terminal: no reinstating an application that was never approved. */
      expect((await call("POST", `/onboarding/${a.id}/decision`, { decision: "REINSTATE" }, ADMIN)).status).toBe(409);
    });
  });

  describe("2S1-BE-06 · BTG reviews afterwards: Reject and Reinstate", () => {
    it("Reject withdraws access, ends listings, holds payouts and emails the reason; Reinstate reverses it", async () => {
      const a = await approvedTeam("OA Reject Me FC");
      const property = await prisma.property.findUniqueOrThrow({ where: { id: a.propertyId }, select: { tenantId: true } });
      /* What a live organisation has: a listing on sale, one waiting for BTG, a requested and an approved payout. */
      const item = await prisma.inventoryItem.create({ data: { tenantId: property.tenantId, propertyId: a.propertyId, title: "Banner", kind: "SIGNAGE", priceCents: 50_000, categories: [], restrictedCategories: [] } });
      const live = await prisma.listing.create({ data: { tenantId: property.tenantId, propertyId: a.propertyId, inventoryItemId: item.id, title: "Banner", state: "PUBLISHED", publishedAt: new Date() } });
      const item2 = await prisma.inventoryItem.create({ data: { tenantId: property.tenantId, propertyId: a.propertyId, title: "Tickets", kind: "TICKETS", priceCents: 9_000, categories: [], restrictedCategories: [] } });
      const waiting = await prisma.listing.create({ data: { tenantId: property.tenantId, propertyId: a.propertyId, inventoryItemId: item2.id, title: "Tickets", state: "PENDING_APPROVAL" } });
      const requested = await prisma.payout.create({ data: { tenantId: T, payeeType: "PROPERTY", payeeId: a.propertyId, payeeTenantId: property.tenantId, amountCents: 10_000, state: "REQUESTED" } });
      const approvedPayout = await prisma.payout.create({ data: { tenantId: T, payeeType: "PROPERTY", payeeId: a.propertyId, payeeTenantId: property.tenantId, amountCents: 5_000, state: "APPROVED" } });
      expect((await call("GET", "/me", undefined, a.clerk)).status).toBe(200);

      /* A reason is required — the organisation reads it. */
      expect((await call("POST", `/onboarding/${a.id}/decision`, { decision: "REJECT" }, ADMIN)).status).toBe(422);
      const rejected = await call("POST", `/onboarding/${a.id}/decision`, { decision: "REJECT", notes: "The registration was for a different club." }, ADMIN);
      expect(rejected.json).toMatchObject({ state: "REJECTED", listingAccess: false });

      /* Login off — refused at sign-in. */
      expect((await call("GET", "/me", undefined, a.clerk)).status).toBeGreaterThanOrEqual(401);
      const p = await prisma.property.findUniqueOrThrow({ where: { id: a.propertyId }, select: { listingAccessAt: true, payoutsHeldAt: true } });
      expect(p.listingAccessAt).toBeNull();
      expect(p.payoutsHeldAt).not.toBeNull();
      /* Listings end; the one waiting for BTG goes back to draft. */
      expect((await prisma.listing.findUniqueOrThrow({ where: { id: live.id }, select: { state: true } })).state).toBe("ARCHIVED");
      expect((await prisma.listing.findUniqueOrThrow({ where: { id: waiting.id }, select: { state: true } })).state).toBe("DRAFT");
      /* Payouts held: BTG can't approve one while it lasts. */
      await expect(decidePayout(admin, requested.id, "APPROVE")).rejects.toMatchObject({ status: 409 });
      /* The reason is emailed. */
      const email = (await outbox()).find((e) => e.template === "onboarding.accountRejected" && e.data.orgName === "OA Reject Me FC")!;
      expect(email.data.notes).toBe("The registration was for a different club.");
      /* 2S1-BE-16 — like every rejection, it names the support address. */
      expect(email.data.supportEmail).toBeTruthy();
      const trail = await prisma.auditLog.findFirstOrThrow({ where: { tenantId: T, entityId: a.id, action: "onboarding.reject" }, select: { actorId: true, after: true } });
      expect(trail).toMatchObject({ actorId: ADMIN, after: { afterApproval: true, loginsSwitchedOff: 1, listingsEnded: 2 } });
      /* The name stays held while it may come back. */
      expect((await call("POST", "/public/onboarding", { orgType: "TEAM", orgName: "OA Reject Me FC" })).status).toBe(409);

      const back = await call("POST", `/onboarding/${a.id}/decision`, { decision: "REINSTATE" }, ADMIN);
      expect(back.json).toMatchObject({ state: "APPROVED", listingAccess: true, propertyId: a.propertyId });
      expect((await call("GET", "/me", undefined, a.clerk)).status).toBe(200);
      expect((await prisma.property.findUniqueOrThrow({ where: { id: a.propertyId }, select: { payoutsHeldAt: true } })).payoutsHeldAt).toBeNull();
      /* The approved payout that waited goes to the provider now; the requested one can be decided again. */
      const resent = await prisma.outboxJob.findMany({ where: { tenantId: T, name: "payouts.send" }, select: { payload: true } });
      expect(resent.map((j) => (j.payload as { payoutId: string }).payoutId)).toContain(approvedPayout.id);
      await expect(decidePayout(admin, requested.id, "APPROVE")).resolves.toMatchObject({ state: "APPROVED" });
      expect((await outbox()).some((e) => e.template === "onboarding.reinstated" && e.data.orgName === "OA Reject Me FC")).toBe(true);
    });

    it("BTG's manual decisions still work, and only BTG decides or reads profiles", async () => {
      const a = await apply("OA Manual FC");
      await call("POST", `/public/onboarding/${a.tok}/submit`);
      for (const who of ["oa_sponsor", undefined]) {
        expect((await call("POST", `/onboarding/${a.id}/decision`, { decision: "APPROVE" }, who)).status).toBeGreaterThanOrEqual(401);
        expect((await call("GET", `/onboarding/${a.id}/profile`, undefined, who)).status).toBeGreaterThanOrEqual(401);
        expect((await call("GET", "/onboarding/signups", undefined, who)).status).toBeGreaterThanOrEqual(401);
      }
      const approved = await call("POST", `/onboarding/${a.id}/decision`, { decision: "APPROVE" }, ADMIN);
      expect(approved.json).toMatchObject({ state: "APPROVED", autoApproved: false });
      /* An organisation's own manager reaches none of BTG's routes. */
      for (const path of ["/onboarding/signups", `/onboarding/${a.id}/profile`, `/onboarding/${a.id}/documents`]) {
        expect((await call("GET", path, undefined, a.clerk)).status, path).toBe(403);
      }
      expect((await call("POST", `/onboarding/${a.id}/decision`, { decision: "REJECT", notes: "x" }, a.clerk)).status).toBe(403);
    });

    it("the profile and the sign-ups desk read what happened", async () => {
      const a = await approvedTeam("OA Profile FC");
      const profile = await call("GET", `/onboarding/${a.id}/profile`, undefined, ADMIN);
      expect(profile.status).toBe(200);
      expect(profile.json).toMatchObject({ id: a.id, kind: "ORGANIZATION", name: "OA Profile FC", state: "AUTO_APPROVED", autoApproved: true });
      expect([...profile.json.decisions].sort()).toEqual(["REJECT", "SUSPEND"]);
      expect(profile.json.checks.every((c: { ok: boolean }) => c.ok)).toBe(true);
      expect(profile.json.activity.map((x: { text: string }) => x.text)).toEqual(expect.arrayContaining(["Submitted", "Contact email confirmed", "Approved automatically"]));
      expect(profile.json.documents.map((d: { kind: string }) => d.kind).sort()).toEqual(["IDENTITY", "RIGHTS_PROOF"]);
      /* Each document opens through a five-minute, audited link. */
      const docId = profile.json.documents[0].id as string;
      const view = await call("GET", `/onboarding/${a.id}/documents/${docId}`, undefined, ADMIN);
      expect(view.json.expiresInSeconds).toBe(300);
      expect(Number(new URL(view.json.url).searchParams.get("X-Amz-Expires"))).toBe(300);
      expect(await prisma.auditLog.count({ where: { tenantId: T, action: "storage.privateDownloadGrant", entityId: docId, actorId: ADMIN } })).toBeGreaterThanOrEqual(1);

      const desk = await call("GET", "/onboarding/signups", undefined, ADMIN);
      const row = desk.json.signups.find((s: { id: string }) => s.id === a.id);
      expect(row).toMatchObject({ kind: "ORGANIZATION", name: "OA Profile FC", sub: "Team · MD", state: "AUTO_APPROVED", reasons: [] });
    });
  });

  describe("2S1-BE-07 · documents after approval", () => {
    it("the manager replaces and adds; the earlier file is kept; the checklist re-runs; BTG is emailed; a missing one flags without suspending", async () => {
      const a = await approvedTeam("OA Paperwork FC");
      const list = await call("GET", "/property/documents", undefined, a.clerk);
      expect(list.status, list.text).toBe(200);
      const id = list.json.documents.find((d: { kind: string }) => d.kind === "IDENTITY");
      expect(id).toMatchObject({ required: true, state: "ON_FILE", history: [] });

      /* Replace the ID. */
      const grant = await call("POST", "/property/documents", { kind: "IDENTITY", filename: "new-id.png", contentType: "image/png", bytes: 3000, replacesId: id.file.documentId }, a.clerk);
      expect(grant.status, grant.text).toBe(201);
      expect(new URL(grant.json.uploadUrl).pathname.startsWith("/sponsorx-private/onboarding/")).toBe(true);
      /* An ID is at most 10 MB. */
      expect((await call("POST", "/property/documents", { kind: "IDENTITY", filename: "big.png", contentType: "image/png", bytes: 11 * 1024 * 1024 }, a.clerk)).status).toBe(422);
      expect((await call("POST", `/property/documents/${grant.json.document.id}/confirm`, undefined, a.clerk)).status).toBe(409); // not in the bucket yet
      uploaded.add((await prisma.onboardingDocument.findUniqueOrThrow({ where: { id: grant.json.document.id }, select: { r2Key: true } })).r2Key);
      const after = await call("POST", `/property/documents/${grant.json.document.id}/confirm`, undefined, a.clerk);
      const idRow = after.json.documents.find((d: { kind: string }) => d.kind === "IDENTITY");
      expect(idRow.file.documentId).toBe(grant.json.document.id);
      expect(idRow.history).toEqual([expect.objectContaining({ documentId: id.file.documentId, ended: "REPLACED" })]);
      const old = await prisma.onboardingDocument.findUniqueOrThrow({ where: { id: id.file.documentId }, select: { replacedAt: true, r2Key: true } });
      expect(old.replacedAt).not.toBeNull(); // kept, not deleted
      const told = (await outbox()).filter((e) => e.template === "onboarding.documentChanged" && e.data.orgName === "OA Paperwork FC");
      expect(told).toEqual([expect.objectContaining({ to: "admin@oa.invalid", data: expect.objectContaining({ change: "replaced a document", flagged: "" }) })]);
      expect(told[0]!.data.profileUrl).toMatch(new RegExp(`/admin/onboarding/${a.id}$`));

      /* Remove the rights proof without a replacement: flagged for BTG, listings stay live. */
      const rights = after.json.documents.find((d: { kind: string }) => d.kind === "RIGHTS_PROOF");
      const removed = await call("DELETE", `/property/documents/${rights.file.documentId}`, undefined, a.clerk);
      expect(removed.json.flags).toEqual(["Document missing after an update: Proof of the rights to sell your inventory"]);
      expect(removed.json.documents.find((d: { kind: string }) => d.kind === "RIGHTS_PROOF")).toMatchObject({ state: "MISSING", history: [expect.objectContaining({ ended: "REMOVED" })] });
      expect((await prisma.property.findUniqueOrThrow({ where: { id: a.propertyId }, select: { listingAccessAt: true } })).listingAccessAt).not.toBeNull();
      expect((await call("GET", `/onboarding/${a.id}`, undefined, ADMIN)).json).toMatchObject({ state: "APPROVED", flags: removed.json.flags });
      expect((await call("GET", "/onboarding?list=flagged", undefined, ADMIN)).json.onboardings.map((o: { id: string }) => o.id)).toContain(a.id);
      expect((await call("GET", "/onboarding/signups", undefined, ADMIN)).json.signups.find((s: { id: string }) => s.id === a.id)).toMatchObject({ state: "NEEDS_REVIEW", reasons: removed.json.flags });
      expect((await outbox()).filter((e) => e.template === "onboarding.documentChanged" && e.data.orgName === "OA Paperwork FC").at(-1)!.data.flagged).toMatch(/rights to sell/);

      /* Adding the replacement clears the flag. */
      const fix = await call("POST", "/property/documents", { kind: "RIGHTS_PROOF", filename: "rights-2026.pdf", contentType: "application/pdf", bytes: 3000, expiresOn: "2027-06-30" }, a.clerk);
      uploaded.add((await prisma.onboardingDocument.findUniqueOrThrow({ where: { id: fix.json.document.id }, select: { r2Key: true } })).r2Key);
      const fixed = await call("POST", `/property/documents/${fix.json.document.id}/confirm`, undefined, a.clerk);
      expect(fixed.json.flags).toEqual([]);
      expect(fixed.json.documents.find((d: { kind: string }) => d.kind === "RIGHTS_PROOF")).toMatchObject({ state: "ON_FILE", file: expect.objectContaining({ expiresOn: "2027-06-30T00:00:00.000Z" }) });
      expect((await prisma.propertyOnboarding.findUniqueOrThrow({ where: { id: a.id }, select: { flaggedAt: true } })).flaggedAt).toBeNull();
      /* BTG's profile page shows each change — the organisation's own audit rows, in its own tenant. */
      const activity = (await call("GET", `/onboarding/${a.id}/profile`, undefined, ADMIN)).json.activity.map((x: { text: string }) => x.text);
      expect(activity).toEqual(expect.arrayContaining([expect.stringMatching(/^Document replaced:/), expect.stringMatching(/^Document removed:/), expect.stringMatching(/^Document added:/)]));
    });

    it("BTG's own approval checks the name too, even on a row from before the name key", async () => {
      const a = await apply("OA Old Row FC");
      await call("POST", `/public/onboarding/${a.tok}/submit`);
      /* As if it predated the migration: no name key, and a name a BTG-run property already holds. */
      await prisma.propertyOnboarding.update({ where: { id: a.id }, data: { nameKey: null, orgName: "OA Harbour Rowing Club, LLC" } });
      const r = await call("POST", `/onboarding/${a.id}/decision`, { decision: "APPROVE" }, ADMIN);
      expect(r.status, r.text).toBe(409);
      expect(r.json.error.message).toMatch(/already registered/);
      expect((await prisma.propertyOnboarding.findUniqueOrThrow({ where: { id: a.id }, select: { state: true, propertyId: true } }))).toMatchObject({ propertyId: null });
    });

    it("only the organisation's own manager changes its documents", async () => {
      const mine = await approvedTeam("OA Own Docs FC");
      const theirs = await approvedTeam("OA Their Docs FC");
      const list = (await call("GET", "/property/documents", undefined, theirs.clerk)).json;
      const doc = list.documents[0].file.documentId as string;
      /* Another organisation's manager: not theirs to touch. */
      expect((await call("DELETE", `/property/documents/${doc}`, undefined, mine.clerk)).status).toBe(404);
      expect((await call("POST", "/property/documents", { kind: "IDENTITY", filename: "x.pdf", contentType: "application/pdf", bytes: 10, replacesId: doc }, mine.clerk)).status).toBe(409);
      /* BTG reads documents through its own routes, and changes none; a sponsor has no property. */
      for (const who of [ADMIN, "oa_sponsor"]) {
        expect((await call("GET", "/property/documents", undefined, who)).status, who).toBe(403);
        expect((await call("DELETE", `/property/documents/${doc}`, undefined, who)).status, who).toBe(403);
      }
      expect((await call("GET", "/property/documents")).status).toBe(401);
      expect((await prisma.onboardingDocument.findUniqueOrThrow({ where: { id: doc }, select: { removedAt: true } })).removedAt).toBeNull();
    });
  });

  describe("2S1-BE-08 · AGENCY", () => {
    it("applies, is held to its own documents, holds a roster and a share, and is a commission-rule target", async () => {
      const a = await apply("OA Prime Athletes", { orgType: "AGENCY", details: { legalEntityName: "OA Prime Athletes LLC", statesOperatedIn: ["VA", "DC"] } });
      const fresh = (await call("GET", `/public/onboarding/${a.tok}`)).json;
      expect(fresh.missing).toEqual([]);
      expect(fresh.checklist.map((c: { key: string }) => c.key)).toEqual(["IDENTITY", "REPRESENTATION_AGREEMENT", "BUSINESS_REGISTRATION:DC", "BUSINESS_REGISTRATION:MD", "BUSINESS_REGISTRATION:VA"]);
      await upload(a.tok, "IDENTITY");
      await upload(a.tok, "REPRESENTATION_AGREEMENT");
      await upload(a.tok, "BUSINESS_REGISTRATION", "MD");
      await upload(a.tok, "BUSINESS_REGISTRATION", "VA");
      /* A registration names a state; only a registration does. */
      expect((await call("POST", `/public/onboarding/${a.tok}/documents`, { kind: "IDENTITY", filename: "x.pdf", contentType: "application/pdf", bytes: 10, stateCode: "MD" })).status).toBe(422);
      await call("POST", `/public/onboarding/${a.tok}/submit`);
      const held = await call("POST", "/public/onboarding/confirm-email", { token: await confirmToken(a.id) });
      expect(held.json).toMatchObject({ state: "PENDING_REVIEW", reviewReasons: ["Missing document: Business registration (DC)"] });
      await upload(a.tok, "BUSINESS_REGISTRATION", "DC");
      const row = await prisma.propertyOnboarding.findUniqueOrThrow({ where: { id: a.id }, select: { state: true, propertyId: true } });
      expect(row.state).toBe("APPROVED");
      expect((await prisma.property.findUniqueOrThrow({ where: { id: row.propertyId! }, select: { kind: true } })).kind).toBe("AGENCY");

      /* A roster, with the agreed share — like a team. */
      const added = await call("POST", "/team/roster", { legalName: "Jamie Fox", displayName: "Jamie Fox", email: "oa_jamie@oa-test.invalid", sport: "Track", teamShareBps: 1500 }, a.clerk);
      expect(added.status, added.text).toBeLessThan(300);
      const roster = await call("GET", "/team/roster", undefined, a.clerk);
      expect(JSON.stringify(roster.json)).toContain("Jamie Fox");

      /* Commission rules by property kind reach it. */
      const rule = await call("POST", "/commission-rules", { kind: "PLATFORM_FEE", scope: "PROPERTY_KIND", scopeRef: "AGENCY", bps: 1700, priority: 50 }, ADMIN);
      expect(rule.status, rule.text).toBeLessThan(300);
      const rates = await resolveRates(prisma, T, { propertyKind: "AGENCY", propertyId: row.propertyId }, new Date(Date.now() + 1000));
      expect(rates.PLATFORM_FEE.bps).toBe(1700);
      const preview = await call("POST", "/commission-rules/preview", { lines: [{ grossCents: 10_000, propertyKind: "AGENCY" }] }, ADMIN);
      expect(preview.status, preview.text).toBe(200);
    });
  });
});
