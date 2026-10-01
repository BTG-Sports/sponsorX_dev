import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   The reviewer's failed rows (2026-10-01), against the real API and database:

     2S1-BE-10  proof of guardianship is per (guardian, athlete): a guardian
                already verified for one child, named for a second by a
                profile edit, does not act for the second until proof naming
                THEM (and the agreement for them) is in — on the short page.
                (The intake half — a second minor held until its own proof —
                is in phase2-athlete-signup.test.ts.)
     2S1-BE-13  the applications desk's Reject, an organisation rejected
                before approval, and a sponsor request declined before an
                account each record a closure: the files go on the 30-day
                purge, and the applicant can ask BTG to look again.
     2S1-BE-14  a newly named guardian acts only once verified (403
                `guardian_not_verified` on items, the payout account and a
                team invitation); BTG's first-time link emails their set-up
                page. 2S1-BE-09: a rejected ward drops out of the guardian's
                wards.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

/* The private bucket isn't running: a key counts as uploaded once the test says so. */
const { uploaded } = vi.hoisted(() => ({ uploaded: new Set<string>() }));
vi.mock("../src/lib/storage", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/lib/storage")>();
  return { ...real, privateObjectSize: async (key: string) => (uploaded.has(key) ? 40_960 : null) };
});
vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@rf-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("review fixes · per-child proof, every Reject closes, only a verified guardian acts", { timeout: 120_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { purgeExpiredClosures } = await import("../src/domain/account-closure");

  const T = "rf_btg";
  const MINOR = new Date("2012-05-01");
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- response bodies are asserted field by field
  type Res = { status: number; text: string; json: any };
  const call = async (method: string, path: string, clerk?: string, body?: unknown, headers: Record<string, string> = {}): Promise<Res> => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method, headers: { "content-type": "application/json", ...(clerk ? { "x-test-clerk": clerk } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };
  const ward = (id: string) => ({ "x-sponsorx-ward": id });
  const emails = async (template?: string) => (await prisma.outboxJob.findMany({ where: { tenantId: T, name: "notify.email" }, select: { payload: true }, orderBy: { createdAt: "asc" } }))
    .map((j) => j.payload as { template: string; to: string; data: Record<string, string> }).filter((m) => !template || m.template === template);
  const code = (r: Res) => r.json?.error?.code ?? r.json?.code;
  const item = { title: "Signed jersey", kind: "OTHER", priceCents: 5_000 };

  /* The guardian's own page, driven exactly as the browser does. */
  const setupToken = async (to: string, athleteName: string) => {
    const mail = (await emails("guardian.setup")).filter((m) => m.to === to && m.data.athleteName === athleteName).at(-1);
    expect(mail, `a set-up email to ${to} for ${athleteName}`).toBeTruthy();
    return new URL(mail!.data.setupUrl!).searchParams.get("t")!;
  };
  const page = (token: string) => `/public/guardian-setup/${encodeURIComponent(token)}`;
  const guardianUpload = async (token: string, kind: "GUARDIAN_ID" | "GUARDIANSHIP_PROOF") => {
    const up = await call("POST", `${page(token)}/documents`, undefined, {
      kind, ...(kind === "GUARDIANSHIP_PROOF" ? { proofKind: "COURT_ORDER" } : {}), filename: "doc.pdf", contentType: "application/pdf", bytes: 40_960,
    });
    expect(up.status, up.text).toBe(201);
    const d = await prisma.accountDocument.findUniqueOrThrow({ where: { id: up.json.document.id }, select: { r2Key: true } });
    uploaded.add(d.r2Key);
    const done = await call("POST", `${page(token)}/documents/${up.json.document.id}/confirm`);
    expect(done.status, done.text).toBe(200);
    return done.json;
  };
  const acceptAgreement = async (token: string) => {
    const st = await call("GET", page(token));
    const r = await call("POST", `${page(token)}/accept`, undefined, { agreementId: st.json.agreement.agreementId, bodyHashShown: st.json.agreement.bodyHash });
    expect(r.status, r.text).toBe(200);
    return r.json;
  };
  const reactivationToken = async (email: string) => {
    expect((await call("POST", "/public/account/reactivation-link", undefined, { email })).status).toBe(202);
    const mail = (await emails("account.reactivationLink")).filter((m) => m.to === email).at(-1);
    return new URL(mail!.data.reactivateUrl!).searchParams.get("t")!;
  };

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
    const now = new Date();
    await prisma.tenant.create({ data: { id: T, name: "Review fixes BTG" } });
    await prisma.guardian.createMany({ data: [
      { id: "rf_g_olga", tenantId: T, legalName: "Olga Stone", email: "rf_olga@rf-test.invalid", relationship: "PARENT", verifiedAt: now, emailConfirmedAt: now },
      { id: "rf_g_pat", tenantId: T, legalName: "Pat Lane", email: "rf_pat@rf-test.invalid", relationship: "PARENT", verifiedAt: now, emailConfirmedAt: now },
    ] });
    const athlete = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
      id, tenantId: T, slug: id.replace("_", "-"), legalName: name, displayName: name.split(" ")[0]!, email: `${id}@rf-test.invalid`,
      sport: "Golf", stateCode: "MD", birthDate: MINOR, state: "ACTIVE" as const, emailConfirmedAt: now, ...extra,
    });
    await prisma.athlete.createMany({ data: [
      athlete("rf_mia", "Mia Gray"),
      athlete("rf_noah", "Noah Stone", { guardianId: "rf_g_olga" }),
      athlete("rf_ned", "Ned Stone"),
      athlete("rf_lou", "Lou Park"),
      athlete("rf_pia", "Pia Lane", { guardianId: "rf_g_pat" }),
      athlete("rf_pete", "Pete Lane", { guardianId: "rf_g_pat" }),
      athlete("rf_appl", "Alex Apply", { birthDate: new Date("2000-01-01"), state: "UNDER_REVIEW" }),
    ] });
    await prisma.property.create({ data: { id: "rf_team", tenantId: T, slug: "rf-team", name: "RF United", kind: "TEAM", listingAccessAt: now } });
    await prisma.teamInvitation.create({ data: { id: "rf_inv_mia", tenantId: T, propertyId: "rf_team", athleteId: "rf_mia", athleteTenantId: T, teamShareBps: 1500, invitedBy: "rf_admin" } });
    await prisma.user.createMany({ data: [
      { id: "rf_admin", tenantId: T, clerkId: "rf_admin", email: "rf_admin@rf-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "rf_u_mia", tenantId: T, clerkId: "rf_mia", email: "rf_mia@rf-test.invalid", roles: ["ATHLETE"], athleteId: "rf_mia" },
      { id: "rf_u_ned", tenantId: T, clerkId: "rf_ned", email: "rf_ned@rf-test.invalid", roles: ["ATHLETE"], athleteId: "rf_ned" },
      { id: "rf_u_olga", tenantId: T, clerkId: "rf_olga", email: "rf_olga@rf-test.invalid", roles: ["GUARDIAN"], guardianId: "rf_g_olga" },
      { id: "rf_u_pat", tenantId: T, clerkId: "rf_pat", email: "rf_pat@rf-test.invalid", roles: ["GUARDIAN"], guardianId: "rf_g_pat" },
    ] });
    /* What each rejected application uploaded. */
    await prisma.accountDocument.create({ data: {
      id: "rf_doc_appl", tenantId: T, athleteId: "rf_appl", kind: "GOVERNMENT_ID", filename: "id.pdf", contentType: "application/pdf", bytes: 100,
      r2Key: "identity/athletes/rf_appl/rf_doc_appl/id.pdf", uploadedAt: now,
    } });
    await prisma.propertyOnboarding.create({ data: {
      id: "rf_onb", tenantId: T, orgType: "TEAM", orgName: "RF Rejected Rovers", state: "PENDING_REVIEW", submittedAt: now,
      contacts: [{ name: "Rory Rover", email: "rf_rory@rf-test.invalid", role: "Director", primary: true }],
      documents: { create: [{ tenantId: T, kind: "RIGHTS_PROOF", filename: "rights.pdf", contentType: "application/pdf", bytes: 100, r2Key: "onboarding/rf_onb/rights.pdf", uploadedAt: now }] },
    } });
    await prisma.inquiry.create({ data: {
      id: "rf_inq", tenantId: T, firstName: "Dee", lastName: "Cline", email: "rf_dee@rf-test.invalid", source: "WEBSITE", companyName: "RF Declined Diner", state: "NEW",
    } });
    await prisma.inquiryDocument.create({ data: {
      id: "rf_idoc", tenantId: T, inquiryId: "rf_inq", kind: "PROOF_OF_BUSINESS", filename: "license.pdf", contentType: "application/pdf", bytes: 100,
      r2Key: "inquiries/rf_inq/license.pdf", uploadedAt: now,
    } });
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server?.close();
    await clean();
  });

  /* ═══════════════ 2S1-BE-14 — only a verified guardian acts ═══════════════ */

  describe("2S1-BE-14 · a newly named guardian acts only once verified", () => {
    it("named by a profile edit, they get a login — but items, the payout account and a team invitation are refused until their page is done", async () => {
      const r = await call("POST", "/athletes/rf_mia/profile-changes", "rf_mia", { guardian: { legalName: "Gus Gray", email: "rf_gus@rf-test.invalid", relationship: "PARENT" } });
      expect(r.status, r.text).toBe(201);
      expect(r.json.checkNotes.join(" ")).toMatch(/New agreements and payments wait until then/);
      expect(await prisma.user.count({ where: { tenantId: T, email: "rf_gus@rf-test.invalid", roles: { has: "GUARDIAN" } } })).toBe(1);

      for (const headers of [{}, ward("rf_mia")]) {
        const inv = await call("POST", "/inventory", "rf_gus", item, headers);
        expect(inv.status, inv.text).toBe(403);
        expect(code(inv)).toBe("guardian_not_verified");
        const pay = await call("POST", "/payouts/account/link", "rf_gus", { returnPath: "/athlete" }, headers);
        expect(pay.status, pay.text).toBe(403);
        expect(code(pay)).toBe("guardian_not_verified");
        const team = await call("POST", "/team-invitations/rf_inv_mia/respond", "rf_gus", { decision: "ACCEPT" }, headers);
        expect(team.status, team.text).toBe(403);
        expect(code(team)).toBe("guardian_not_verified");
      }
      expect(await prisma.inventoryItem.count({ where: { tenantId: T, athleteId: "rf_mia" } })).toBe(0);
      /* Reads go on as the guardian's own login: Mia is listed as waiting, not as a ward acted for. */
      const me = await call("GET", "/me", "rf_gus");
      expect(me.status, me.text).toBe(200);
      expect(me.json).toMatchObject({ wards: [], actingFor: null, pendingWards: [{ athleteId: "rf_mia" }] });
    });

    it("once their ID, proof naming Mia and the agreement are in, they act for her", async () => {
      const token = await setupToken("rf_gus@rf-test.invalid", "Mia Gray");
      expect((await call("POST", "/public/guardian-setup/open", undefined, { token })).json).toMatchObject({ returning: false, state: "IN_PROGRESS" });
      expect((await call("PATCH", page(token), undefined, { legalName: "Gus Gray", relationship: "PARENT" })).status).toBe(200);
      await guardianUpload(token, "GUARDIAN_ID");
      await guardianUpload(token, "GUARDIANSHIP_PROOF");
      expect((await call("POST", "/inventory", "rf_gus", item)).status).toBe(403);
      const done = await acceptAgreement(token);
      expect(done.state).toBe("APPROVED");
      expect((await prisma.guardian.findFirstOrThrow({ where: { tenantId: T, email: "rf_gus@rf-test.invalid" }, select: { verifiedAt: true } })).verifiedAt).toEqual(expect.any(Date));
      const inv = await call("POST", "/inventory", "rf_gus", item);
      expect(inv.status, inv.text).toBe(201);
      const team = await call("POST", "/team-invitations/rf_inv_mia/respond", "rf_gus", { decision: "ACCEPT" });
      expect(team.status, team.text).toBe(200);
    });

    it("BTG's first-time link emails the guardian their set-up page; they can't act until they finish it", async () => {
      const r = await call("POST", "/athletes/rf_lou/guardian", "rf_admin", { legalName: "Lena Park", email: "rf_lena@rf-test.invalid", relationship: "PARENT" });
      expect(r.status, r.text).toBe(201);
      const token = await setupToken("rf_lena@rf-test.invalid", "Lou Park");
      expect((await call("GET", page(token))).status).toBe(200);
      const inv = await call("POST", "/inventory", "rf_lena", item);
      expect(inv.status, inv.text).toBe(403);
      expect(code(inv)).toBe("guardian_not_verified");
    });
  });

  /* ═══════════════ 2S1-BE-10 — proof is per child ═══════════════ */

  describe("2S1-BE-10 · a verified guardian named for a second child needs proof naming that child", () => {
    it("acts for the first child at once, for the second only after the short page: proof for them and the agreement", async () => {
      const r = await call("POST", "/athletes/rf_ned/profile-changes", "rf_ned", { guardian: { legalName: "Olga Stone", email: "rf_olga@rf-test.invalid", relationship: "PARENT" } });
      expect(r.status, r.text).toBe(201);
      expect((await prisma.athlete.findUniqueOrThrow({ where: { id: "rf_ned" }, select: { guardianId: true, guardianPendingSince: true } })))
        .toEqual({ guardianId: "rf_g_olga", guardianPendingSince: expect.any(Date) });
      /* Noah, her first child, is unaffected; Ned is waiting. */
      expect((await call("POST", "/inventory", "rf_olga", item, ward("rf_noah"))).status).toBe(201);
      const refused = await call("POST", "/inventory", "rf_olga", item, ward("rf_ned"));
      expect(refused.status, refused.text).toBe(403);
      expect(code(refused)).toBe("guardian_not_verified");
      expect((await call("GET", "/me", "rf_olga")).json).toMatchObject({ wards: [{ athleteId: "rf_noah" }], pendingWards: [{ athleteId: "rf_ned" }] });

      const token = await setupToken("rf_olga@rf-test.invalid", "Ned Stone");
      const st = await call("POST", "/public/guardian-setup/open", undefined, { token });
      /* The short page: details and ID are on file. */
      expect(st.json).toMatchObject({ returning: true, proof: null, state: "IN_PROGRESS" });
      expect(st.json.missing).toEqual(["proof you're the guardian", "the guardian agreement"]);
      await acceptAgreement(token);
      expect((await call("POST", "/inventory", "rf_olga", item, ward("rf_ned"))).status).toBe(403);
      const done = await guardianUpload(token, "GUARDIANSHIP_PROOF");
      expect(done).toMatchObject({ state: "APPROVED", proof: { kind: "COURT_ORDER" } });
      expect((await prisma.athlete.findUniqueOrThrow({ where: { id: "rf_ned" }, select: { guardianPendingSince: true } })).guardianPendingSince).toBeNull();
      const ok = await call("POST", "/inventory", "rf_olga", item, ward("rf_ned"));
      expect(ok.status, ok.text).toBe(201);
      expect(ok.json.athleteId).toBe("rf_ned");
    });
  });

  /* ═══════════════ 2S1-BE-09 — a rejected ward drops out ═══════════════ */

  describe("2S1-BE-09 · a ward BTG rejected is no longer the guardian's to act for", () => {
    it("Pia, rejected, leaves Pat's wards; Pete stays", async () => {
      expect((await call("GET", "/me", "rf_pat")).json.wards.map((w: { athleteId: string }) => w.athleteId).sort()).toEqual(["rf_pete", "rf_pia"]);
      expect((await call("POST", "/signups/athletes/rf_pia/reject", "rf_admin", { note: "Not on this roster." })).status).toBe(200);
      expect((await call("GET", "/me", "rf_pat")).json.wards.map((w: { athleteId: string }) => w.athleteId)).toEqual(["rf_pete"]);
      const asPia = await call("POST", "/inventory", "rf_pat", item, ward("rf_pia"));
      expect(asPia.status).toBe(403);
      expect(await prisma.inventoryItem.count({ where: { tenantId: T, athleteId: "rf_pia" } })).toBe(0);
      /* With no header, the only ward left is Pete. */
      const asPete = await call("POST", "/inventory", "rf_pat", item);
      expect(asPete.status, asPete.text).toBe(201);
      expect(asPete.json.athleteId).toBe("rf_pete");
    });
  });

  /* ═══════════════ 2S1-BE-13 — every Reject closes ═══════════════ */

  describe("2S1-BE-13 · the Rejects that recorded no closure now do", () => {
    it("the applications desk's Reject: a closure, and the applicant can ask BTG to look again", async () => {
      const r = await call("POST", "/applications/rf_appl/reject", "rf_admin", { reviewerNotes: "The ID doesn't match the application." });
      expect(r.status, r.text).toBe(200);
      expect(await prisma.accountClosure.findFirst({ where: { subjectKind: "ATHLETE", subjectId: "rf_appl" }, select: { tenantId: true, cause: true, state: true } }))
        .toEqual({ tenantId: T, cause: "REJECTED", state: "CLOSED" });
      const t = await reactivationToken("rf_appl@rf-test.invalid");
      expect((await call("GET", `/public/account/reactivation/${encodeURIComponent(t)}`)).json).toMatchObject({ standing: "CLOSED_BY_BTG", kind: "ATHLETE" });
      expect((await call("POST", `/public/account/reactivation/${encodeURIComponent(t)}`, undefined, { action: "REQUEST", note: "New ID attached." })).status).toBe(200);
      expect((await emails("account.reactivationRequested")).at(-1)!.data.reviewUrl).toMatch(/\/admin\/new-signups\/athletes\/rf_appl$/);
    });

    it("an organisation rejected before approval: its application is closed, and it can ask BTG", async () => {
      const r = await call("POST", "/onboarding/rf_onb/decision", "rf_admin", { decision: "REJECT", notes: "Not a real club." });
      expect(r.status, r.text).toBe(200);
      expect(await prisma.accountClosure.findFirst({ where: { subjectKind: "ONBOARDING", subjectId: "rf_onb" }, select: { cause: true, state: true, contactEmail: true } }))
        .toEqual({ cause: "REJECTED", state: "CLOSED", contactEmail: "rf_rory@rf-test.invalid" });
      const t = await reactivationToken("rf_rory@rf-test.invalid");
      expect((await call("GET", `/public/account/reactivation/${encodeURIComponent(t)}`)).json).toMatchObject({ standing: "CLOSED_BY_BTG", kind: "ONBOARDING", greeting: "RF Rejected Rovers" });
      expect((await call("POST", `/public/account/reactivation/${encodeURIComponent(t)}`, undefined, { action: "REACTIVATE" })).status).toBe(403);
      expect((await call("POST", `/public/account/reactivation/${encodeURIComponent(t)}`, undefined, { action: "REQUEST" })).status).toBe(200);
      expect((await emails("account.reactivationRequested")).at(-1)!.data.reviewUrl).toMatch(/\/admin\/onboarding\/rf_onb$/);
    });

    it("a sponsor request declined before an account opened: closed too", async () => {
      const r = await call("POST", "/sponsor-requests/rf_inq/decision", "rf_admin", { decision: "DECLINE", note: "We couldn't verify the business." });
      expect(r.status, r.text).toBe(200);
      expect(await prisma.accountClosure.findFirst({ where: { subjectKind: "INQUIRY", subjectId: "rf_inq" }, select: { cause: true, state: true } }))
        .toEqual({ cause: "REJECTED", state: "CLOSED" });
    });

    it("after 30 days the purge deletes all three's files and rows", async () => {
      const deleted: string[] = [];
      await purgeExpiredClosures(prisma, new Date(Date.now() + 31 * 86_400_000), async (k) => { deleted.push(k); }, T);
      expect(deleted).toEqual(expect.arrayContaining([
        "identity/athletes/rf_appl/rf_doc_appl/id.pdf", "onboarding/rf_onb/rights.pdf", "inquiries/rf_inq/license.pdf",
      ]));
      expect(await prisma.accountDocument.count({ where: { id: "rf_doc_appl" } })).toBe(0);
      expect(await prisma.onboardingDocument.count({ where: { onboardingId: "rf_onb" } })).toBe(0);
      expect(await prisma.inquiryDocument.count({ where: { id: "rf_idoc" } })).toBe(0);
      for (const subjectId of ["rf_appl", "rf_onb", "rf_inq"]) {
        expect((await prisma.accountClosure.findFirstOrThrow({ where: { subjectId }, select: { state: true } })).state, subjectId).toBe("PURGED");
      }
    });
  });
});
