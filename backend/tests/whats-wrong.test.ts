import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   POL-BE-42 — "What's wrong" at a glance, against the real API and database.
   Done when:

     a held record shows each problem as a tag on its list row and at the top
     of its page; a record with no problems shows none; the tags match the
     stored reasons exactly (tests on each type).

   Each type's code is tested in hold-problems.test.ts; here every list and
   page BTG reviews from carries them, for athletes, sponsor requests and
   organisations, and the support inbox's sender card too.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
process.env.PUBLIC_INTAKE_TENANT_ID = "ww_btg";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@ww-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("POL-BE-42 · \"What's wrong\" on BTG's lists and review pages", { timeout: 90_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");

  const T = "ww_btg";
  const ADMIN = "ww_admin";
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  const get = async (path: string) => {
    const res = await fetch(`${base}/api/v1${path}`, { headers: { "x-test-clerk": ADMIN } });
    const text = await res.text();
    expect(res.status, `${path}: ${text}`).toBe(200);
    return JSON.parse(text);
  };

  /* The 2026-11-12 tester's two held records, word for word as the rules store them. */
  const ATHLETE_REASONS = [
    "Document check — Athlete's government ID: It doesn't read like a government ID",
    "Document check — Athlete's government ID: The date of birth on the account (03/14/2005) isn't on it",
  ];
  const SPONSOR_REASONS = [
    "Document check — Proof of business: Midwest Running Co (Midwest Running Co) isn't named on it",
    "Their email already has a SponsorX login",
  ];
  const ORG_REASONS = [
    "Missing document: Business registration",
    "The primary contact hasn't confirmed their email yet — open the link we emailed",
    "Document check — W-9: No words could be read on it — check it by eye",
    "Restricted words in their description: \"casino\"",
  ];

  async function clean() {
    for (const t of ["SupportMessage", "Athlete", "Inquiry", "PropertyOnboarding", "AuditLog", "OutboxJob", "User"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => {});
    }
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "What's wrong BTG" } });
    await prisma.user.create({ data: { id: ADMIN, tenantId: T, clerkId: ADMIN, email: `${ADMIN}@ww-test.invalid`, roles: ["BTG_ADMIN"] } });
    const athlete = { tenantId: T, sport: "Softball", stateCode: "MD", ageBand: "18_PLUS" as const, birthDate: new Date("2005-03-14T00:00:00Z") };
    await prisma.athlete.create({ data: { ...athlete, id: "ww_ath_held", slug: "ww-ath-held", legalName: "Held Athlete", displayName: "Held", email: "tester@ww-test.invalid", state: "SUBMITTED", reviewReasons: ATHLETE_REASONS } });
    await prisma.athlete.create({ data: { ...athlete, id: "ww_ath_ok", slug: "ww-ath-ok", legalName: "Fine Athlete", displayName: "Fine", state: "ACTIVE", autoApproved: true } });
    await prisma.inquiry.create({ data: { id: "ww_req_held", tenantId: T, companyName: "Midwest Running Co", lastName: "Kay", email: "tester@ww-test.invalid", source: "web-form", reviewReasons: SPONSOR_REASONS } });
    await prisma.inquiry.create({ data: { id: "ww_req_ok", tenantId: T, companyName: "Fine Co", lastName: "Lee", email: "fine@ww-test.invalid", source: "web-form", state: "APPROVED", autoApproved: true } });
    const org = { tenantId: T, orgType: "TEAM", stateCode: "MD", details: { legalEntityName: "X LLC", league: "MD Amateur", sport: "Basketball" } };
    await prisma.propertyOnboarding.create({ data: { ...org, id: "ww_org_held", orgName: "Held Hawks", state: "PENDING_REVIEW", submittedAt: new Date(), reviewReasons: ORG_REASONS,
      contacts: [{ name: "Dana Brooks", email: "dana@ww-test.invalid", phone: "301-555-0100", role: "General manager", primary: true }] } });
    await prisma.supportMessage.create({ data: { id: "ww_msg", tenantId: T, name: "Tester", email: "tester@ww-test.invalid", topic: "ACCOUNT", message: "Need full access", state: "QUEUED", queuedAt: new Date() } });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise((r) => server?.close(r));
    await clean();
  });

  type P = { code: string; type: string; label: string; document: string | null; field: string | null };
  const tags = (ps: P[]) => ps.map((p) => [p.type, p.code]);

  it("athlete sign-ups: the held one's list row and page carry its problems, labels word for word; an approved one carries none", async () => {
    const desk = await get("/signups");
    const row = (id: string) => desk.signups.find((r: { id: string }) => r.id === id);
    expect(tags(row("ww_ath_held").problems)).toEqual([["UPLOAD_MISMATCH", "DOC_WRONG_KIND"], ["UPLOAD_MISMATCH", "DOC_BIRTH_DATE_NOT_FOUND"]]);
    expect(row("ww_ath_held").problems.map((p: P) => p.label)).toEqual(ATHLETE_REASONS);
    expect(row("ww_ath_held").problems[0].document).toBe("Athlete's government ID");
    expect(row("ww_ath_ok").problems).toEqual([]);

    const page = await get("/signups/athletes/ww_ath_held");
    expect(page.problems.map((p: P) => p.label)).toEqual(ATHLETE_REASONS);
    expect((await get("/signups/athletes/ww_ath_ok")).problems).toEqual([]);
  });

  it("sponsor requests: the held one's row and page carry its problems; an approved one carries none", async () => {
    const list = await get("/sponsor-requests");
    const held = list.requests.find((r: { id: string }) => r.id === "ww_req_held");
    expect(tags(held.problems)).toEqual([["UPLOAD_MISMATCH", "DOC_NAME_NOT_FOUND"], ["ALREADY_REGISTERED", "EMAIL_HAS_LOGIN"]]);
    expect(held.problems.map((p: P) => p.label)).toEqual(SPONSOR_REASONS);
    const approved = await get("/sponsor-requests?state=APPROVED");
    expect(approved.requests.find((r: { id: string }) => r.id === "ww_req_ok").problems).toEqual([]);

    const page = await get("/sponsor-requests/ww_req_held");
    expect(page.problems.map((p: P) => p.label)).toEqual(SPONSOR_REASONS);
    expect(page.problems[0]).toMatchObject({ code: "DOC_NAME_NOT_FOUND", document: "Proof of business" });
  });

  it("organisations: the onboarding queue and page carry Missing, Email not confirmed, Couldn't read and Technical Decision", async () => {
    const queue = await get("/onboarding");
    const held = queue.onboardings.find((r: { id: string }) => r.id === "ww_org_held");
    const page = await get("/onboarding/ww_org_held");
    for (const view of [held, page]) {
      expect(tags(view.problems)).toEqual([
        ["MISSING", "MISSING_DOCUMENT"], ["EMAIL_NOT_CONFIRMED", "EMAIL_NOT_CONFIRMED"], ["COULDNT_READ", "DOC_UNREADABLE"], ["TECHNICAL_DECISION", "RESTRICTED_WORDS"],
      ]);
      expect(view.problems.map((p: P) => p.label)).toEqual(ORG_REASONS);
    }
  });

  it("the New sign-ups stream: every held row has its tags, and only held rows", async () => {
    const stream = await get("/signups/stream?page=1&size=50");
    const by = (kind: string, id: string) => stream.rows.find((r: { kind: string; id: string }) => r.kind === kind && r.id === id);
    expect(by("ATHLETE", "ww_ath_held").problems).toHaveLength(2);
    expect(by("SPONSOR", "ww_req_held").problems).toHaveLength(2);
    expect(by("ORGANIZATION", "ww_org_held").problems).toHaveLength(4);
    for (const r of stream.rows) if (r.state !== "NEEDS_REVIEW") expect(r.problems, `${r.kind} ${r.id}`).toEqual([]);
    expect(by("ATHLETE", "ww_ath_ok").problems).toEqual([]);
  });

  it("the support inbox's sender card shows the same tags", async () => {
    const m = await get("/support-messages/ww_msg");
    const records = m.sender.records as { id: string; problems: P[] }[];
    expect(records.find((r) => r.id === "ww_ath_held")!.problems.map((p) => p.code)).toEqual(["DOC_WRONG_KIND", "DOC_BIRTH_DATE_NOT_FOUND"]);
    expect(records.find((r) => r.id === "ww_req_held")!.problems.map((p) => p.code)).toEqual(["DOC_NAME_NOT_FOUND", "EMAIL_HAS_LOGIN"]);
  });
});
