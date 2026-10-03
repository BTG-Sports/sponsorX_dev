import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   P9-BE-20 (students approved from the school roster) and P9-BE-21
   (prospects decided automatically), on the path a request takes: HTTP
   through the production auth, scope and route code (only Clerk and the
   rate limit are stubbed), over a real database.

   Names, slugs and tenant ids are this file's own (`sa20`), and every
   assertion is on this file's rows — the suite shares one database.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@sa20-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("P9-BE-20 / P9-BE-21 · students and prospects decided automatically", async () => {
  const { prisma } = await import("../src/db/client");
  const { verifyGuardian } = await import("../src/domain/guardian");
  const auto = await import("../src/domain/student-auto");
  const { STUDENT_HOLD, PROSPECT_HOLD } = await import("../src/domain/student-auto-rules");
  const { createApp } = await import("../src/app");

  const T = "sa20_tenant";
  const T2 = "sa20_tenant_two";
  const DOMAIN = "north-sa20.k12.us";
  const staff = { userId: "sa20_staff", tenantId: T, roles: ["BTG_ADMIN" as const], sponsorId: null, athleteId: null, guardianId: null, propertyId: null };
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";

  const call = async (method: string, path: string, clerk: string | null, body?: unknown) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: { ...(clerk ? { "x-test-clerk": clerk } : {}), "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };

  async function clean() {
    for (const t of [T, T2]) {
      for (const table of ["AdSlot", "Edition", "Publication", "Campaign", "CampaignBrief", "StudentProspect", "StudentCode", "OutboxJob",
        "AuditLog", "User", "Student", "Guardian", "RosterEntry", "BrandRestriction", "Athlete", "Sponsor", "Property"]) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table}" WHERE "tenantId" = $1`, t);
      }
      await prisma.tenant.deleteMany({ where: { id: t } });
    }
  }

  /** The public application, as a stranger sends it. */
  const apply = (over: Record<string, unknown>) =>
    call("POST", "/public/students/applications", null, { schoolSlug: "sa20-north", displayName: "Applicant", masthead: ["WRITER"], ...over });
  const minorGuardian = (who: string) => ({ birthDate: "2011-04-04", guardian: { legalName: `Parent ${who}`, email: `parent.${who}@sa20.invalid`, relationship: "PARENT" } });
  const row = (id: string) => prisma.student.findUniqueOrThrow({
    where: { id }, select: { state: true, reviewReasons: true, autoApprovedAt: true, autoApprovedRosterEntryId: true, guardianId: true, code: { select: { code: true } } },
  });

  beforeAll(async () => {
    await clean();
    await prisma.tenant.createMany({ data: [{ id: T, name: "SA20 tenant" }, { id: T2, name: "SA20 tenant two" }] });
    await prisma.property.createMany({ data: [
      { id: "sa20_north", tenantId: T, slug: "sa20-north", name: "SA20 North High", kind: "SCHOOL", emailDomain: DOMAIN },
      { id: "sa20_south", tenantId: T, slug: "sa20-south", name: "SA20 South High", kind: "SCHOOL" },
      { id: "sa20_nodomain", tenantId: T, slug: "sa20-nodomain", name: "SA20 No-Domain High", kind: "SCHOOL" },
      { id: "sa20_t2_school", tenantId: T2, slug: "sa20-t2", name: "SA20 Other Tenant High", kind: "SCHOOL" },
    ] });
    await prisma.rosterEntry.createMany({ data: [
      { tenantId: T, propertyId: "sa20_north", legalName: "Ada Sa20 Lovelace", gradYear: 2028 },
      { tenantId: T, propertyId: "sa20_north", legalName: "Al Sa20 Adult", gradYear: 2026 },
      { tenantId: T, propertyId: "sa20_north", legalName: "Ozzie Sa20 Offdomain", gradYear: 2026 },
      { tenantId: T, propertyId: "sa20_north", legalName: "Sam Sa20 Twin", gradYear: 2027 },
      { tenantId: T, propertyId: "sa20_north", legalName: "SAM SA20 TWIN", gradYear: 2027 },
      { tenantId: T, propertyId: "sa20_north", legalName: "Gina Sa20 Grad", gradYear: 2026 },
      { tenantId: T, propertyId: "sa20_north", legalName: "Ex Sa20 Isting", gradYear: 2027 },
      { tenantId: T, propertyId: "sa20_north", legalName: "Mia Sa20 Minor", gradYear: 2029 },
      { tenantId: T, propertyId: "sa20_north", legalName: "Pat Sa20 Prospector", gradYear: 2029 },
      { tenantId: T, propertyId: "sa20_nodomain", legalName: "Nina Sa20 Nodomain", gradYear: 2026 },
      /* On another tenant's roster — never this tenant's evidence. */
      { tenantId: T2, propertyId: "sa20_t2_school", legalName: "Cross Sa20 Tenant", gradYear: 2027 },
    ] });
    /* Already on the masthead at North: a second application in this name is someone posing. */
    await prisma.student.create({ data: { id: "sa20_existing", tenantId: T, propertyId: "sa20_north", legalName: "Ex Sa20 Isting", displayName: "Ex", masthead: ["WRITER"], ageBand: "18_PLUS", state: "ACTIVE" } });
    await prisma.user.createMany({ data: [
      { id: "sa20_staff", tenantId: T, clerkId: "sa20_staff", email: "ops@sa20.invalid", roles: ["BTG_ADMIN"] },
      { id: "sa20_sales", tenantId: T, clerkId: "sa20_sales", email: "sales@sa20.invalid", roles: ["SALES"] },
      { id: "sa20_advisor", tenantId: T, clerkId: "sa20_advisor", email: "adv@sa20.invalid", roles: ["ADVISOR"], propertyId: "sa20_north" },
      { id: "sa20_advisor2", tenantId: T, clerkId: "sa20_advisor2", email: "adv2@sa20.invalid", roles: ["ADVISOR"], propertyId: "sa20_north" },
      { id: "sa20_advisor_south", tenantId: T, clerkId: "sa20_advisor_south", email: "south@sa20.invalid", roles: ["ADVISOR"], propertyId: "sa20_south" },
      { id: "sa20_t2_staff", tenantId: T2, clerkId: "sa20_t2_staff", email: "ops@sa20-two.invalid", roles: ["BTG_ADMIN"] },
    ] });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await clean();
  });

  describe("P9-BE-20 · roster approval", () => {
    let ada = "";
    let al = "";

    it("an exact match approves a minor — as the system, audited, logins once — and the stranger is told only SUBMITTED", async () => {
      const r = await apply({ legalName: "ada sa20 LOVELACE", email: "ada@gmail-sa20.invalid", gradYear: 2028, ...minorGuardian("ada") });
      expect(r.status).toBe(201);
      expect(r.json).toEqual({ id: expect.any(String), state: "SUBMITTED", guardianRequired: true });
      ada = r.json.id;
      const s = await row(ada);
      /* A minor: approved from the roster, but ACTIVE only once a guardian is verified. */
      expect(s).toMatchObject({ state: "APPROVED", reviewReasons: [], code: null });
      expect(s.autoApprovedAt).not.toBeNull();
      const entry = await prisma.rosterEntry.findFirstOrThrow({ where: { tenantId: T, legalName: "Ada Sa20 Lovelace" }, select: { id: true } });
      expect(s.autoApprovedRosterEntryId).toBe(entry.id);
      const acts = await prisma.auditLog.findMany({ where: { tenantId: T, entityId: ada }, select: { action: true, actorId: true, after: true }, orderBy: { at: "asc" } });
      expect(acts.map((a) => a.action)).toEqual(expect.arrayContaining(["student.apply", "student.transition", "student.autoApprove"]));
      expect(acts.find((a) => a.action === "student.autoApprove")).toMatchObject({ actorId: null, after: { automatic: true, rosterEntryId: entry.id } });
      /* The student's login and the guardian's, provisioned once. */
      expect(await prisma.user.count({ where: { tenantId: T, studentId: ada } })).toBe(1);
      expect(await prisma.user.count({ where: { tenantId: T, guardianId: s.guardianId } })).toBe(1);
    });

    it("an adult on the school's email domain is approved AND activated at once, with one sales code", async () => {
      const r = await apply({ legalName: "Al Sa20 Adult", email: `al@${DOMAIN}`, gradYear: 2026, birthDate: "2006-02-02" });
      al = r.json.id;
      const s = await row(al);
      expect(s.state).toBe("ACTIVE");
      expect(s.code?.code).toMatch(/^[A-Za-z0-9_-]{12}$/);
      expect(await prisma.studentCode.count({ where: { tenantId: T, studentId: al } })).toBe(1);
      expect(await prisma.auditLog.count({ where: { tenantId: T, entityId: al, action: "studentCode.issue" } })).toBe(1);
      /* BTG's issue is idempotent — the same code back, no second row. */
      const again = await call("POST", `/students/${al}/code`, "sa20_staff");
      expect(again.json.code).toBe(s.code!.code);
      expect(await prisma.studentCode.count({ where: { tenantId: T, studentId: al } })).toBe(1);
    });

    it("each failure holds in UNDER_REVIEW with its reason — and provisions no login", async () => {
      const cases: Array<[Record<string, unknown>, string[]]> = [
        [{ legalName: "Nobody Sa20 Here", ...minorGuardian("nobody") }, [STUDENT_HOLD.NOT_ON_ROSTER]],
        [{ legalName: "Sam Sa20 Twin", ...minorGuardian("sam") }, [STUDENT_HOLD.TWO_ENTRIES]],
        [{ legalName: "Ex Sa20 Isting", ...minorGuardian("ex") }, [STUDENT_HOLD.ALREADY_APPROVED]],
        [{ legalName: "Gina Sa20 Grad", gradYear: 2027, ...minorGuardian("gina") }, [STUDENT_HOLD.GRAD_YEAR]],
        [{ legalName: "Ozzie Sa20 Offdomain", email: "ozzie@gmail-sa20.invalid", ageBand: "18_PLUS" }, [STUDENT_HOLD.ADULT_OFF_DOMAIN]],
        [{ legalName: "Ozzie Sa20 Offdomain", ageBand: "18_PLUS" }, [STUDENT_HOLD.ADULT_OFF_DOMAIN]],
        [{ schoolSlug: "sa20-nodomain", legalName: "Nina Sa20 Nodomain", email: "nina@nodomain-sa20.invalid", ageBand: "18_PLUS" }, [STUDENT_HOLD.ADULT_NO_DOMAIN]],
      ];
      for (const [body, reasons] of cases) {
        const r = await apply({ email: null, ...body });
        expect(r.status, JSON.stringify(body)).toBe(201);
        expect(r.json.state).toBe("SUBMITTED");
        const s = await row(r.json.id);
        expect({ state: s.state, reviewReasons: s.reviewReasons, auto: s.autoApprovedAt }, JSON.stringify(body)).toEqual({ state: "UNDER_REVIEW", reviewReasons: reasons, auto: null });
        expect(await prisma.user.count({ where: { tenantId: T, studentId: r.json.id } })).toBe(0);
      }
    });

    it("an empty roster approves nobody, and another school's or tenant's roster is never evidence", async () => {
      /* South has no roster — Ada is on North's, not South's. */
      const south = await apply({ schoolSlug: "sa20-south", legalName: "Ada Sa20 Lovelace", gradYear: 2028, ...minorGuardian("south") });
      expect(await row(south.json.id)).toMatchObject({ state: "UNDER_REVIEW", reviewReasons: [STUDENT_HOLD.NO_ROSTER] });
      /* Tenant two's roster names this person; North's does not. */
      const cross = await apply({ legalName: "Cross Sa20 Tenant", ...minorGuardian("cross") });
      expect(await row(cross.json.id)).toMatchObject({ state: "UNDER_REVIEW", reviewReasons: [STUDENT_HOLD.NOT_ON_ROSTER] });
    });

    it("idempotent: the sweep re-runs approve nobody twice, provision no second login, and hold once", async () => {
      const held = await prisma.student.findFirstOrThrow({ where: { tenantId: T, legalName: "Nobody Sa20 Here" }, select: { id: true } });
      for (let i = 0; i < 2; i++) {
        await prisma.$transaction((tx) => auto.autoReviewStudentIn(tx, T, held.id));
        await prisma.$transaction((tx) => auto.autoReviewStudentIn(tx, T, ada));
        await auto.sweepStudentAutomation({ tenantIds: [T] });
      }
      expect(await prisma.auditLog.count({ where: { tenantId: T, entityId: held.id, action: "student.holdForAdvisor" } })).toBe(1);
      expect(await prisma.auditLog.count({ where: { tenantId: T, entityId: ada, action: "student.autoApprove" } })).toBe(1);
      expect(await prisma.user.count({ where: { tenantId: T, studentId: ada } })).toBe(1);
      expect((await row(held.id)).state).toBe("UNDER_REVIEW");
    });

    it("an application submitted before the rule (still SUBMITTED) is picked up by the sweep", async () => {
      await prisma.student.create({ data: { id: "sa20_legacy", tenantId: T, propertyId: "sa20_north", legalName: "Mia Sa20 Minor", displayName: "Mia", masthead: ["WRITER"], birthDate: new Date("2012-01-01"), state: "SUBMITTED" } });
      await auto.sweepStudentAutomation({ tenantIds: [T] });
      expect((await row("sa20_legacy")).state).toBe("APPROVED");
    });

    it("the student sees only that their school is reviewing — never the reasons; the advisor sees them", async () => {
      const held = await prisma.student.findFirstOrThrow({ where: { tenantId: T, legalName: "Nobody Sa20 Here" }, select: { id: true } });
      await prisma.user.create({ data: { id: "sa20_nobody_user", tenantId: T, clerkId: "sa20_nobody_user", email: "nobody@sa20.invalid", roles: ["STUDENT"], studentId: held.id, propertyId: "sa20_north" } });
      for (const path of [`/students/${held.id}`, "/students", "/students?page=1&size=5", "/students?page=1&size=5&auto=true"]) {
        const own = await call("GET", path, "sa20_nobody_user");
        expect(own.status, path).toBe(200);
        expect(own.text, path).not.toContain("reviewReasons");
        expect(own.text, path).not.toContain(STUDENT_HOLD.NOT_ON_ROSTER);
        expect(own.text, path).not.toContain("autoApproved");
      }
      const adv = await call("GET", `/students/${held.id}`, "sa20_advisor");
      expect(adv.json.reviewReasons).toEqual([STUDENT_HOLD.NOT_ON_ROSTER]);
    });

    it("the advisor's desk lists who was approved automatically; another school's advisor sees none of it and can act on none of it", async () => {
      const desk = await call("GET", "/students?page=1&size=50&auto=true", "sa20_advisor");
      const ids = desk.json.students.map((s: { id: string }) => s.id);
      expect(ids).toEqual(expect.arrayContaining([ada, al, "sa20_legacy"]));
      expect(desk.json.students.every((s: { autoApprovedAt: string | null }) => s.autoApprovedAt)).toBe(true);
      expect(desk.json.summary.autoApproved).toBe(ids.length);

      const south = await call("GET", "/students?page=1&size=50&auto=true", "sa20_advisor_south");
      expect(south.json.students.map((s: { id: string }) => s.id)).not.toContain(ada);
      expect((await call("GET", `/students/${ada}`, "sa20_advisor_south")).status).toBe(403);
      expect((await call("POST", `/students/${al}/transition`, "sa20_advisor_south", { to: "SUSPENDED", reviewerNotes: "x" })).status).toBe(403);
      /* The school's own advisor can suspend anyone the system approved (existing). */
      expect((await call("POST", `/students/${al}/transition`, "sa20_advisor", { to: "SUSPENDED", reviewerNotes: "Not ours" })).json.state).toBe("SUSPENDED");
      /* Reinstating keeps the one code. */
      const code = (await row(al)).code!.code;
      expect((await call("POST", `/students/${al}/transition`, "sa20_advisor", { to: "ACTIVE" })).json.state).toBe("ACTIVE");
      expect((await row(al)).code!.code).toBe(code);
      /* Another tenant reaches nothing. */
      expect((await call("GET", `/students/${ada}`, "sa20_t2_staff")).status).toBe(403);
    });

    it("the school email domain: the advisor sets their own school's, never another's; free mail is refused; tenant two reaches nothing", async () => {
      const read = await call("GET", "/properties/sa20_north/email-domain", "sa20_advisor");
      expect(read.json).toEqual({ propertyId: "sa20_north", school: "SA20 North High", emailDomain: DOMAIN, rosterEntries: 9 });
      expect((await call("PUT", "/properties/sa20_south/email-domain", "sa20_advisor", { emailDomain: "south-sa20.k12.us" })).status).toBe(403);
      expect((await call("GET", "/properties/sa20_south/email-domain", "sa20_advisor")).status).toBe(403);
      expect((await call("PUT", "/properties/sa20_north/email-domain", "sa20_advisor", { emailDomain: "gmail.com" })).status).toBe(422);
      expect((await call("PUT", "/properties/sa20_north/email-domain", "sa20_t2_staff", { emailDomain: "evil-sa20.org" })).status).toBe(403);
      const own = await call("PUT", "/properties/sa20_south/email-domain", "sa20_advisor_south", { emailDomain: "@South-SA20.k12.us" });
      expect(own.json).toEqual({ propertyId: "sa20_south", emailDomain: "south-sa20.k12.us" });
      expect((await call("PUT", "/properties/sa20_south/email-domain", "sa20_staff", { emailDomain: null })).json.emailDomain).toBeNull();
      expect(await prisma.auditLog.count({ where: { tenantId: T, entityId: "sa20_south", action: "property.setEmailDomain" } })).toBe(2);
      expect((await prisma.property.findUniqueOrThrow({ where: { id: "sa20_north" }, select: { emailDomain: true } })).emailDomain).toBe(DOMAIN);
    });

    it("the advisors get ONE digest a day listing who was approved automatically", async () => {
      const now = new Date();
      const first = await auto.sendStudentApprovalDigests(now, { tenantIds: [T] });
      expect(first.schools).toBe(1);
      const mails = await prisma.outboxJob.findMany({ where: { tenantId: T, name: "notify.email" }, select: { payload: true } });
      const digests = mails.map((m) => m.payload as { template: string; to: string; data: Record<string, string> }).filter((p) => p.template === "student.autoApprovedDigest");
      expect(digests.map((d) => d.to).sort()).toEqual(["adv2@sa20.invalid", "adv@sa20.invalid"]);
      expect(digests[0]!.data.students).toContain("Applicant");
      /* South's advisor is told nothing about North. */
      expect(digests.some((d) => d.to === "south@sa20.invalid")).toBe(false);

      /* A later approval the same day waits for tomorrow's digest. */
      await apply({ legalName: "Pat Sa20 Prospector", ...minorGuardian("pat") });
      expect((await auto.sendStudentApprovalDigests(new Date(now.getTime() + 1000), { tenantIds: [T] })).schools).toBe(0);
      const tomorrow = await auto.sendStudentApprovalDigests(new Date(now.getTime() + 864e5), { tenantIds: [T] });
      expect(tomorrow).toMatchObject({ schools: 1, students: 1 });
    });
  });

  describe("P9-BE-20 · activation and the guardian", () => {
    it("a minor is activated only after guardian verification — then automatically, with a code", async () => {
      const mia = await row("sa20_legacy");
      expect(mia.state).toBe("APPROVED");
      /* No guardian at all: the sweep never activates. */
      await auto.sweepStudentAutomation({ tenantIds: [T] });
      expect((await row("sa20_legacy")).state).toBe("APPROVED");

      const ada = await prisma.student.findFirstOrThrow({ where: { tenantId: T, legalName: "ada sa20 LOVELACE" }, select: { id: true, guardianId: true } });
      /* Not verified by anything in the app: still waiting. */
      const g = await prisma.guardian.findUniqueOrThrow({ where: { id: ada.guardianId! }, select: { verifiedAt: true, autoVerified: true } });
      expect(g).toEqual({ verifiedAt: null, autoVerified: false });
      await auto.sweepStudentAutomation({ tenantIds: [T] });
      expect((await row(ada.id)).state).toBe("APPROVED");
      /* The manual ACTIVE is refused too — the gate is unchanged. */
      expect((await call("POST", `/students/${ada.id}/transition`, "sa20_advisor", { to: "ACTIVE" })).status).toBe(409);

      await verifyGuardian(staff, ada.guardianId!);
      const after = await row(ada.id);
      expect(after.state).toBe("ACTIVE");
      expect(after.code).not.toBeNull();
      const move = await prisma.auditLog.findFirstOrThrow({
        where: { tenantId: T, entityId: ada.id, action: "student.transition", after: { path: ["state"], equals: "ACTIVE" } }, select: { actorId: true, after: true },
      });
      expect(move).toMatchObject({ actorId: null, after: { automatic: true } });
    });

    it("an unknown age is never activated by the system", async () => {
      await prisma.student.create({ data: { id: "sa20_noage", tenantId: T, propertyId: "sa20_north", legalName: "No Sa20 Age", displayName: "NA", masthead: ["WRITER"], state: "APPROVED" } });
      await auto.sweepStudentAutomation({ tenantIds: [T] });
      expect((await row("sa20_noage")).state).toBe("APPROVED");
    });
  });

  describe("P9-BE-21 · prospects decided on submit", () => {
    let pat = "";
    const submit = async (studentClerk: string, studentId: string, businessName: string, category: string) =>
      call("POST", `/students/${studentId}/prospects`, studentClerk, { businessName, category });

    beforeAll(async () => {
      /* Pat (a minor, on North's roster): verified guardian, email of their own. */
      pat = (await prisma.student.findFirstOrThrow({ where: { tenantId: T, legalName: "Pat Sa20 Prospector" }, select: { id: true } })).id;
      await prisma.student.update({ where: { id: pat }, data: { email: "pat@sa20.invalid" } });
      const g = await prisma.student.findUniqueOrThrow({ where: { id: pat }, select: { guardianId: true } });
      await verifyGuardian(staff, g.guardianId!);
      expect((await row(pat)).state).toBe("ACTIVE");
      await prisma.user.create({ data: { id: "sa20_pat_user", tenantId: T, clerkId: "sa20_pat_user", email: "pat.login@sa20.invalid", roles: ["STUDENT"], studentId: pat, propertyId: "sa20_north" } });

      /* RESTAURANT is held at North: a presenting sponsor of an edition on sale. */
      await prisma.sponsor.createMany({ data: [
        { id: "sa20_presenter", tenantId: T, name: "SA20 Presenting Grill" },
        { id: "sa20_bakery", tenantId: T, name: "SA20 Bakery & Co." },
      ] });
      await prisma.campaignBrief.create({ data: { id: "sa20_brief", tenantId: T, sponsorId: "sa20_presenter", objective: "Presenting", budget: 300_000, startDate: new Date("2026-10-01"), endDate: new Date("2026-12-01"), categories: ["RESTAURANT"] } });
      await prisma.campaign.create({ data: { id: "sa20_campaign", tenantId: T, sponsorId: "sa20_presenter", briefId: "sa20_brief", name: "SA20 presenting", budget: 300_000, startDate: new Date("2026-10-01"), endDate: new Date("2026-12-01") } });
      await prisma.publication.create({ data: { id: "sa20_pub", tenantId: T, propertyId: "sa20_north", name: "SA20 Record" } });
      await prisma.edition.create({ data: { id: "sa20_edition", tenantId: T, publicationId: "sa20_pub", label: "Fall", state: "SELLING", closeDate: new Date("2026-11-01"), publishTarget: new Date("2026-12-01"), thresholdCents: 1 } });
      await prisma.adSlot.create({ data: { tenantId: T, editionId: "sa20_edition", slotCode: "PR", kind: "PRESENTING", priceCents: 300_000, campaignId: "sa20_campaign" } });
      /* North restricts LOCAL_RETAIL; an athlete at North is restricted from AUTOMOTIVE. */
      await prisma.brandRestriction.create({ data: { tenantId: T, propertyId: "sa20_north", category: "LOCAL_RETAIL", type: "SCHOOL_POLICY", reason: "Board rule" } });
      await prisma.athlete.create({ data: { id: "sa20_athlete", tenantId: T, slug: "sa20-athlete", legalName: "SA20 Athlete", displayName: "SA20 ATH", sport: "Track", propertyId: "sa20_north", ageBand: "18_PLUS", state: "ACTIVE", restrictedCategories: ["AUTOMOTIVE"] } });
    });

    it("auto-rejects on exclusivity, with the open categories — and the decline reaches the student and their guardian", async () => {
      const r = await submit("sa20_pat_user", pat, "SA20 Luigi's", "RESTAURANT");
      expect(r.status).toBe(201);
      expect(r.json.state).toBe("REJECTED");
      const p = await prisma.studentProspect.findUniqueOrThrow({ where: { id: r.json.id }, select: { reasonCode: true, redirectCategories: true, decidedAutomatically: true, reviewReasons: true } });
      expect(p).toMatchObject({ reasonCode: "CATEGORY_EXCLUSIVE", decidedAutomatically: true, reviewReasons: [] });
      expect(p.redirectCategories).not.toContain("RESTAURANT");
      expect(p.redirectCategories).not.toContain("ALCOHOL");
      const mails = (await prisma.outboxJob.findMany({ where: { tenantId: T, name: "notify.email" }, select: { payload: true } }))
        .map((m) => m.payload as { template: string; to: string; idempotencyKey: string })
        .filter((m) => m.template === "student.prospectDeclined" && m.idempotencyKey.includes(r.json.id));
      expect(mails.map((m) => m.to).sort()).toEqual(["parent.pat@sa20.invalid", "pat@sa20.invalid"]);
    });

    it("auto-accepts when nothing is in the way", async () => {
      const r = await submit("sa20_pat_user", pat, "SA20 Fit Gym", "FITNESS");
      expect(r.json.state).toBe("ACCEPTED");
      expect(await prisma.studentProspect.findUniqueOrThrow({ where: { id: r.json.id }, select: { decidedAutomatically: true } })).toEqual({ decidedAutomatically: true });
    });

    it("holds for SALES otherwise — a school restriction, an athlete's, an existing sponsor, a business already brought in", async () => {
      const cases: Array<[string, string, string]> = [
        ["SA20 Corner Shop", "LOCAL_RETAIL", PROSPECT_HOLD.SCHOOL_RESTRICTION],
        ["SA20 Motors", "AUTOMOTIVE", PROSPECT_HOLD.ATHLETE_RESTRICTION],
        ["sa20 BAKERY & co", "EDUCATION", PROSPECT_HOLD.ALREADY_SPONSOR],
        ["SA20 FIT-GYM", "APPAREL", PROSPECT_HOLD.ALREADY_PROSPECT],
      ];
      for (const [name, category, reason] of cases) {
        const r = await submit("sa20_pat_user", pat, name, category);
        expect(r.json.state, name).toBe("SUBMITTED");
        const p = await prisma.studentProspect.findUniqueOrThrow({ where: { id: r.json.id }, select: { reviewReasons: true, decidedAutomatically: true } });
        expect(p, name).toEqual({ reviewReasons: [reason], decidedAutomatically: false });
      }
    });

    it("the student never reads the internal reasons; SALES's desk shows held ones by default, with reasons and badges", async () => {
      const own = await call("GET", `/students/${pat}/prospects?page=1&size=20`, "sa20_pat_user");
      expect(own.status).toBe(200);
      expect(own.text).not.toContain("reviewReasons");
      expect(own.text).not.toContain(PROSPECT_HOLD.SCHOOL_RESTRICTION);
      expect(own.text).not.toContain("decidedAutomatically");

      const held = await call("GET", "/prospects?page=1&size=50", "sa20_sales");
      expect(held.status).toBe(200);
      expect(held.json.prospects.every((p: { state: string }) => p.state === "SUBMITTED")).toBe(true);
      expect(held.json.prospects.find((p: { businessName: string }) => p.businessName === "SA20 Corner Shop")).toMatchObject({
        reviewReasons: [PROSPECT_HOLD.SCHOOL_RESTRICTION], student: { displayName: "Applicant", property: { name: "SA20 North High" } },
      });
      expect(held.json.summary).toEqual({ held: 4, auto: 2, all: 6 });
      const autoView = await call("GET", "/prospects?page=1&view=auto", "sa20_sales");
      expect(autoView.json.prospects.map((p: { state: string }) => p.state).sort()).toEqual(["ACCEPTED", "REJECTED"]);

      /* Not a decider: the advisor and the student are refused; another tenant sees none of these. */
      expect((await call("GET", "/prospects?page=1", "sa20_advisor")).status).toBe(403);
      expect((await call("GET", "/prospects?page=1", "sa20_pat_user")).status).toBe(403);
      const other = await call("GET", "/prospects?page=1&view=all", "sa20_t2_staff");
      expect(other.status).toBe(200);
      expect(other.text).not.toContain("SA20 Corner Shop");
    });

    it("a held prospect is decided by SALES on the unchanged path; the system never decides it later", async () => {
      const shop = await prisma.studentProspect.findFirstOrThrow({ where: { tenantId: T, businessName: "SA20 Corner Shop" }, select: { id: true } });
      expect(await prisma.$transaction((tx) => auto.autoDecideProspectIn(tx, T, shop.id))).toEqual({ outcome: "skipped" });
      expect((await call("POST", `/prospects/${shop.id}/decision`, "sa20_t2_staff", { decision: "ACCEPT" })).status).toBe(403);
      const d = await call("POST", `/prospects/${shop.id}/decision`, "sa20_sales", { decision: "REJECT", reasonCode: "SCHOOL_RESTRICTION" });
      expect(d.json.state).toBe("REJECTED");
      const p = await prisma.studentProspect.findUniqueOrThrow({ where: { id: shop.id }, select: { decidedAutomatically: true, reviewReasons: true } });
      expect(p).toEqual({ decidedAutomatically: false, reviewReasons: [PROSPECT_HOLD.SCHOOL_RESTRICTION] });
      /* And a decided one is never decided twice. */
      expect(await prisma.$transaction((tx) => auto.autoDecideProspectIn(tx, T, shop.id))).toEqual({ outcome: "skipped" });
      expect(await prisma.auditLog.count({ where: { tenantId: T, entityId: shop.id, action: "studentProspect.decide" } })).toBe(1);
    });
  });
});
