import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   The cross-group gaps found when Groups A, B1, B2 and C were merged
   (2026-10-01), against the real API and database:

     2S1-BE-13  every Reject records a closure — organisations (A), athletes
                and guardians (B1), the coming-of-age termination (B1) —
                and Reinstate reopens it; a self-closed account that BTG
                then rejects can no longer reactivate itself; every ID
                document table is on the 30-day purge.
     2S1-BE-13  a closed account's listings can't sell — the team's
                listings of a closing roster athlete pause, BTG can't
                approve one, and the catalogue / search / cart refuse it.
     2S1-BE-15  POST /athletes/:id/guardian is not a road around the
                handoff; the switch is refused when the new guardian can't
                sign in; "BTG staff confirm minors" holds the switch for BTG.
     2S2-BE-05  accepting a team invitation is the guardian's act for a
                minor, and paused during coming of age.
     2S1-BE-12 / -14  a move or a new date of birth re-runs the age of
                majority and starts the coming-of-age allowance; a guardian
                named after approval is verified by their own page.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@mg-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("merge gaps · closures, closed sellers, the handoff's second road, team invitations", { timeout: 120_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { purgeExpiredClosures } = await import("../src/domain/account-closure");
  const { sweepComingOfAge } = await import("../src/domain/coming-of-age");
  const { checkListing } = await import("../src/domain/availability");
  const { sellerCanSell } = await import("../src/domain/listing-rules");
  const { evaluateGuardianWards } = await import("../src/domain/athlete-signup");

  const T = "mg_btg";
  const DAY = 86_400_000;
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";

  const call = async (method: string, path: string, clerk?: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method, headers: { "content-type": "application/json", ...(clerk ? { "x-test-clerk": clerk } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };
  const emails = async (template?: string) => (await prisma.outboxJob.findMany({ where: { tenantId: T, name: "notify.email" }, select: { payload: true }, orderBy: { createdAt: "asc" } }))
    .map((j) => j.payload as { template: string; to: string; data: Record<string, string> }).filter((m) => !template || m.template === template);
  const closureOf = (kind: string, id: string) => prisma.accountClosure.findFirst({ where: { subjectKind: kind, subjectId: id }, orderBy: { createdAt: "desc" }, select: { id: true, tenantId: true, cause: true, state: true, userIds: true } });
  const login = (id: string) => prisma.user.findUniqueOrThrow({ where: { id }, select: { disabledAt: true, disabledReason: true } });
  const doc = (id: string, owner: { athleteId?: string; guardianId?: string; wardId?: string }, kind: string) => ({
    id, tenantId: T, ...owner, kind, ...(kind === "GUARDIANSHIP_PROOF" ? { proofKind: "BIRTH_CERTIFICATE" } : {}),
    filename: `${id}.pdf`, contentType: "application/pdf", bytes: 100, r2Key: `account-documents/${id}.pdf`, uploadedAt: new Date(),
  });

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
    await prisma.tenant.create({ data: { id: T, name: "Merge gaps BTG" } });
    await prisma.guardian.createMany({ data: [
      { id: "mg_g_carmen", tenantId: T, legalName: "Carmen Ruiz", email: "mg_carmen@mg-test.invalid", relationship: "PARENT", verifiedAt: now },
      { id: "mg_g_kai", tenantId: T, legalName: "Pat Kai", email: "mg_patkai@mg-test.invalid", relationship: "PARENT", verifiedAt: now },
      { id: "mg_g_old", tenantId: T, legalName: "Olive Old", email: "mg_olive@mg-test.invalid", relationship: "PARENT", verifiedAt: now },
      { id: "mg_g_max", tenantId: T, legalName: "Mara Max", email: "mg_mara@mg-test.invalid", relationship: "PARENT", verifiedAt: now },
      { id: "mg_g_teen", tenantId: T, legalName: "Gwen Teen", email: "mg_gwen@mg-test.invalid", relationship: "PARENT", verifiedAt: now },
      { id: "mg_g_zoe", tenantId: T, legalName: "Zed Zoe", email: "mg_zed@mg-test.invalid", relationship: "PARENT", verifiedAt: now },
      { id: "mg_g_late", tenantId: T, legalName: "Lana Late", email: "mg_lana@mg-test.invalid", relationship: "PARENT", emailConfirmedAt: now },
    ] });
    await prisma.property.create({ data: { id: "mg_hawks", tenantId: T, slug: "mg-hawks", name: "MG Merge Gaps Hawks", kind: "TEAM", listingAccessAt: now } });
    await prisma.property.create({ data: { id: "mg_team", tenantId: T, slug: "mg-team", name: "MG Merge Gaps United", kind: "TEAM", listingAccessAt: now } });
    await prisma.propertyOnboarding.create({ data: {
      id: "mg_onb", tenantId: T, orgType: "TEAM", orgName: "MG Merge Gaps Hawks", state: "APPROVED", propertyId: "mg_hawks", submittedAt: now, decidedAt: now,
      contacts: [{ name: "Dana Hawk", email: "mg_pm@mg-test.invalid", role: "Director", primary: true }],
    } });
    const minor = new Date("2012-05-01");
    await prisma.athlete.createMany({ data: [
      { id: "mg_riley", tenantId: T, slug: "mg-riley", legalName: "Riley Merge", displayName: "Riley", email: "mg_riley@mg-test.invalid", sport: "Soccer", birthDate: new Date("2000-01-01"), state: "ACTIVE" },
      { id: "mg_jo", tenantId: T, slug: "mg-jo", legalName: "Jo Ruiz", displayName: "Jo", email: "mg_jo@mg-test.invalid", sport: "Golf", birthDate: minor, state: "ACTIVE", guardianId: "mg_g_carmen" },
      { id: "mg_kai", tenantId: T, slug: "mg-kai", legalName: "Kai Kai", displayName: "Kai", email: "mg_kai@mg-test.invalid", sport: "Tennis", birthDate: new Date("2007-01-01"), state: "ACTIVE", guardianId: "mg_g_kai",
        comingOfAgeStartedAt: new Date(now.getTime() - 100 * DAY), comingOfAgeDueAt: new Date(now.getTime() - 3_600_000), comingOfAgeReminders: [90, 30, 14, 7, 1] },
      { id: "mg_ava", tenantId: T, slug: "mg-ava", legalName: "Ava Roster", displayName: "Ava", email: "mg_ava@mg-test.invalid", sport: "Track", birthDate: new Date("1999-01-01"), state: "ACTIVE", propertyId: "mg_team", teamShareBps: 2000 },
      { id: "mg_lee", tenantId: T, slug: "mg-lee", legalName: "Lee Old", displayName: "Lee", email: "mg_lee@mg-test.invalid", sport: "Golf", birthDate: minor, state: "ACTIVE", guardianId: "mg_g_old" },
      { id: "mg_max", tenantId: T, slug: "mg-max", legalName: "Max Max", displayName: "Max", email: "mg_max@mg-test.invalid", sport: "Golf", birthDate: minor, state: "ACTIVE", guardianId: "mg_g_max" },
      { id: "mg_teen", tenantId: T, slug: "mg-teen", legalName: "Tess Teen", displayName: "Tess", email: "mg_tess@mg-test.invalid", sport: "Swim", birthDate: minor, state: "ACTIVE", guardianId: "mg_g_teen" },
      { id: "mg_cole", tenantId: T, slug: "mg-cole", legalName: "Cole Teen", displayName: "Cole", email: "mg_cole@mg-test.invalid", sport: "Swim", birthDate: new Date("2007-02-01"), state: "ACTIVE", guardianId: "mg_g_teen",
        comingOfAgeStartedAt: new Date(now.getTime() - DAY), comingOfAgeDueAt: new Date(now.getTime() + 200 * DAY), comingOfAgeReminders: [90] },
      { id: "mg_tx", tenantId: T, slug: "mg-tx", legalName: "Tex Mover", displayName: "Tex", email: "mg_tex@mg-test.invalid", sport: "Golf", birthDate: new Date(now.getTime() - 18.5 * 365.25 * DAY), stateCode: "TX", state: "ACTIVE" },
      { id: "mg_zoe", tenantId: T, slug: "mg-zoe", legalName: "Zoe Zoe", displayName: "Zoe", email: "mg_zoe@mg-test.invalid", sport: "Golf", birthDate: minor, state: "ACTIVE", guardianId: "mg_g_zoe" },
      { id: "mg_late", tenantId: T, slug: "mg-late", legalName: "Liv Late", displayName: "Liv", email: "mg_liv@mg-test.invalid", sport: "Golf", birthDate: minor, state: "ACTIVE", guardianId: "mg_g_late" },
    ] });
    await prisma.accountDocument.createMany({ data: [
      doc("mg_doc_riley", { athleteId: "mg_riley" }, "GOVERNMENT_ID"),
      doc("mg_doc_jo", { athleteId: "mg_jo" }, "SCHOOL_ID"),
      doc("mg_doc_carmen_id", { guardianId: "mg_g_carmen" }, "GUARDIAN_ID"),
      doc("mg_doc_carmen_proof", { guardianId: "mg_g_carmen", wardId: "mg_jo" }, "GUARDIANSHIP_PROOF"),
      doc("mg_doc_late_id", { guardianId: "mg_g_late" }, "GUARDIAN_ID"),
      doc("mg_doc_late_proof", { guardianId: "mg_g_late", wardId: "mg_late" }, "GUARDIANSHIP_PROOF"),
      doc("mg_doc_liv", { athleteId: "mg_late" }, "SCHOOL_ID"),
    ] });
    await prisma.inventoryItem.createMany({ data: [
      { id: "mg_item_ava", tenantId: T, athleteId: "mg_ava", title: "Ava shout-out", kind: "OTHER", priceCents: 5000 },
      { id: "mg_item_ava2", tenantId: T, athleteId: "mg_ava", title: "Ava appearance", kind: "OTHER", priceCents: 9000 },
    ] });
    const description = "A thirty-second shout-out on the athlete's own channels.";
    await prisma.listing.createMany({ data: [
      { id: "mg_list_team", tenantId: T, propertyId: "mg_team", inventoryItemId: "mg_item_ava", title: "Ava shout-out", description, state: "PUBLISHED", publishedAt: now },
      { id: "mg_list_pending", tenantId: T, propertyId: "mg_team", inventoryItemId: "mg_item_ava2", title: "Ava appearance", description, state: "PENDING_APPROVAL", submittedAt: now },
    ] });
    await prisma.user.createMany({ data: [
      { id: "mg_admin", tenantId: T, clerkId: "mg_admin", email: "mg_admin@mg-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "mg_net", tenantId: T, clerkId: "mg_net", email: "mg_net@mg-test.invalid", roles: ["NETWORK_MGR"] },
      { id: "mg_u_pm", tenantId: T, clerkId: "mg_pm", email: "mg_pm@mg-test.invalid", roles: ["PROPERTY_MGR"], propertyId: "mg_hawks" },
      { id: "mg_u_riley", tenantId: T, clerkId: "mg_riley", email: "mg_riley@mg-test.invalid", roles: ["ATHLETE"], athleteId: "mg_riley" },
      { id: "mg_u_jo", tenantId: T, clerkId: "mg_jo", email: "mg_jo@mg-test.invalid", roles: ["ATHLETE"], athleteId: "mg_jo" },
      { id: "mg_u_carmen", tenantId: T, clerkId: "mg_carmen", email: "mg_carmen@mg-test.invalid", roles: ["GUARDIAN"], guardianId: "mg_g_carmen" },
      { id: "mg_u_kai", tenantId: T, clerkId: "mg_kai", email: "mg_kai@mg-test.invalid", roles: ["ATHLETE"], athleteId: "mg_kai" },
      { id: "mg_u_patkai", tenantId: T, clerkId: "mg_patkai", email: "mg_patkai@mg-test.invalid", roles: ["GUARDIAN"], guardianId: "mg_g_kai" },
      { id: "mg_u_ava", tenantId: T, clerkId: "mg_ava", email: "mg_ava@mg-test.invalid", roles: ["ATHLETE"], athleteId: "mg_ava" },
      { id: "mg_u_olive", tenantId: T, clerkId: "mg_olive", email: "mg_olive@mg-test.invalid", roles: ["GUARDIAN"], guardianId: "mg_g_old" },
      { id: "mg_u_mara", tenantId: T, clerkId: "mg_mara", email: "mg_mara@mg-test.invalid", roles: ["GUARDIAN"], guardianId: "mg_g_max" },
      { id: "mg_u_tess", tenantId: T, clerkId: "mg_tess", email: "mg_tess@mg-test.invalid", roles: ["ATHLETE"], athleteId: "mg_teen" },
      { id: "mg_u_cole", tenantId: T, clerkId: "mg_cole", email: "mg_cole@mg-test.invalid", roles: ["ATHLETE"], athleteId: "mg_cole" },
      { id: "mg_u_gwen", tenantId: T, clerkId: "mg_gwen", email: "mg_gwen@mg-test.invalid", roles: ["GUARDIAN"], guardianId: "mg_g_teen" },
      { id: "mg_u_tex", tenantId: T, clerkId: "mg_tex", email: "mg_tex@mg-test.invalid", roles: ["ATHLETE"], athleteId: "mg_tx" },
      { id: "mg_u_zed", tenantId: T, clerkId: "mg_zed", email: "mg_zed@mg-test.invalid", roles: ["GUARDIAN"], guardianId: "mg_g_zoe" },
      { id: "mg_u_inuse", tenantId: T, clerkId: "mg_inuse", email: "mg_taken@mg-test.invalid", roles: ["SPONSOR_ADMIN"] },
    ] });
    await prisma.teamInvitation.createMany({ data: [
      { id: "mg_inv_tess", tenantId: T, propertyId: "mg_team", athleteId: "mg_teen", athleteTenantId: T, teamShareBps: 1500, invitedBy: "mg_admin" },
      { id: "mg_inv_cole", tenantId: T, propertyId: "mg_team", athleteId: "mg_cole", athleteTenantId: T, teamShareBps: 1500, invitedBy: "mg_admin" },
    ] });
    /* Two handoffs waiting with Max's guardian, the new guardian's checks all done. */
    for (const [id, email] of [["mg_ho_taken", "mg_taken@mg-test.invalid"], ["mg_ho_staff", "mg_newmax@mg-test.invalid"]] as const) {
      await prisma.guardianHandoff.create({ data: {
        id, tenantId: T, athleteId: "mg_max", fromGuardianId: "mg_g_max", requesterName: "Nia New", requesterEmail: email, relationship: "PARENT",
        state: "WAITING", emailConfirmedAt: now, agreementAcceptedAt: now, agreementVersion: "1", submittedAt: now,
        documents: { create: [
          { tenantId: T, kind: "GUARDIAN_ID", filename: "id.pdf", contentType: "application/pdf", bytes: 100, r2Key: `handoffs/${id}/id.pdf`, uploadedAt: now },
          { tenantId: T, kind: "GUARDIANSHIP_PROOF", proofKind: "BIRTH_CERTIFICATE", filename: "proof.pdf", contentType: "application/pdf", bytes: 100, r2Key: `handoffs/${id}/proof.pdf`, uploadedAt: now },
        ] },
      } });
    }
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server?.close();
    await clean();
  });

  /* ═══════════════ 2S1-BE-13 — every Reject records a closure ═══════════════ */

  describe("2S1-BE-13 · every Reject records a closure, and Reinstate reopens it", () => {
    it("an organisation that closed itself and is then rejected: one closure, now REJECTED; it can only ask; Reinstate brings its login back", async () => {
      expect((await call("POST", "/me/close", "mg_pm", { confirm: true })).status).toBe(200);
      const self = (await closureOf("PROPERTY", "mg_hawks"))!;
      expect(self).toMatchObject({ cause: "SELF", state: "CLOSED" });
      expect((await login("mg_u_pm")).disabledReason).toBe(`accountClosure:${self.id}`);

      const rej = await call("POST", "/onboarding/mg_onb/decision", "mg_admin", { decision: "REJECT", notes: "The registration is for another club." });
      expect(rej.status, rej.text).toBe(200);
      const c = (await closureOf("PROPERTY", "mg_hawks"))!;
      expect(c).toMatchObject({ id: self.id, tenantId: T, cause: "REJECTED", state: "CLOSED", userIds: ["mg_u_pm"] });
      /* The Reject took over the self-closed login, so it is the Reject's to give back. */
      expect((await login("mg_u_pm")).disabledReason).toBe("onboarding:mg_onb");
      expect(await prisma.auditLog.count({ where: { action: "account.closureCauseChanged", entityId: self.id } })).toBe(1);

      const link = (await emails("account.closed")).find((m) => m.to === "mg_pm@mg-test.invalid")!.data.reactivateUrl!;
      const token = encodeURIComponent(new URL(link).searchParams.get("t")!);
      expect((await call("GET", `/public/account/reactivation/${token}`)).json.standing).toBe("CLOSED_BY_BTG");
      expect((await call("POST", `/public/account/reactivation/${token}`, undefined, { action: "REACTIVATE" })).status).toBe(403);
      const ask = await call("POST", `/public/account/reactivation/${token}`, undefined, { action: "REQUEST", note: "We fixed the registration." });
      expect(ask.status, ask.text).toBe(200);
      expect((await emails("account.reactivationRequested")).at(-1)).toMatchObject({ to: "mg_admin@mg-test.invalid", data: { reviewUrl: expect.stringMatching(/\/admin\/onboarding\/mg_onb$/) } });

      const back = await call("POST", "/onboarding/mg_onb/decision", "mg_admin", { decision: "REINSTATE" });
      expect(back.status, back.text).toBe(200);
      expect((await closureOf("PROPERTY", "mg_hawks"))!.state).toBe("REACTIVATED");
      expect((await login("mg_u_pm")).disabledAt).toBeNull();
    });

    it("an athlete's Reject records a closure (files on the purge, the athlete can ask); Reinstate reopens it", async () => {
      const r = await call("POST", "/signups/athletes/mg_riley/reject", "mg_admin", { note: "The ID belongs to someone else." });
      expect(r.status, r.text).toBe(200);
      expect(await closureOf("ATHLETE", "mg_riley")).toMatchObject({ cause: "REJECTED", state: "CLOSED", userIds: ["mg_u_riley"] });
      expect((await prisma.athlete.findUniqueOrThrow({ where: { id: "mg_riley" }, select: { accountClosedAt: true } })).accountClosedAt).not.toBeNull();
      expect((await emails("athlete.accountRejected")).at(-1)!.data.supportEmail).toBe("support@sponsorx.net");
      const back = await call("POST", "/signups/athletes/mg_riley/reinstate", "mg_admin");
      expect(back.status, back.text).toBe(200);
      expect((await closureOf("ATHLETE", "mg_riley"))!.state).toBe("REACTIVATED");
      expect((await prisma.athlete.findUniqueOrThrow({ where: { id: "mg_riley" }, select: { accountClosedAt: true } })).accountClosedAt).toBeNull();
    });

    it("a guardian's Reject records a closure for the guardian and for each athlete it takes", async () => {
      const r = await call("POST", "/signups/guardians/mg_g_carmen/reject", "mg_admin", { note: "The proof doesn't name you." });
      expect(r.status, r.text).toBe(200);
      expect(await closureOf("GUARDIAN", "mg_g_carmen")).toMatchObject({ cause: "REJECTED", state: "CLOSED", userIds: ["mg_u_carmen"] });
      expect(await closureOf("ATHLETE", "mg_jo")).toMatchObject({ cause: "REJECTED", state: "CLOSED", userIds: ["mg_u_jo"] });
      expect((await emails("guardian.accountRejected")).at(-1)!.data.supportEmail).toBe("support@sponsorx.net");
    });

    it("the coming-of-age termination records TERMINATED closures for the athlete and their guardian", async () => {
      await sweepComingOfAge(new Date(), { tenantIds: [T] });
      expect((await prisma.athlete.findUniqueOrThrow({ where: { id: "mg_kai" }, select: { comingOfAgeTerminatedAt: true } })).comingOfAgeTerminatedAt).not.toBeNull();
      expect(await closureOf("ATHLETE", "mg_kai")).toMatchObject({ cause: "TERMINATED", state: "CLOSED", userIds: ["mg_u_kai"] });
      expect(await closureOf("GUARDIAN", "mg_g_kai")).toMatchObject({ cause: "TERMINATED", state: "CLOSED", userIds: ["mg_u_patkai"] });
    });

    it("after 30 days the purge deletes the sign-up ID documents (AccountDocument) of the rejected guardian and athlete", async () => {
      const deleted: string[] = [];
      await purgeExpiredClosures(prisma, new Date(Date.now() + 31 * DAY), async (k) => { deleted.push(k); }, T);
      expect(deleted).toEqual(expect.arrayContaining([
        "account-documents/mg_doc_jo.pdf", "account-documents/mg_doc_carmen_id.pdf", "account-documents/mg_doc_carmen_proof.pdf",
      ]));
      /* Riley came back: their closure is not due, so their ID stays. */
      expect(deleted).not.toContain("account-documents/mg_doc_riley.pdf");
      expect(await prisma.accountDocument.count({ where: { id: { in: ["mg_doc_jo", "mg_doc_carmen_id", "mg_doc_carmen_proof"] } } })).toBe(0);
      expect(await prisma.accountDocument.count({ where: { id: "mg_doc_riley" } })).toBe(1);
      expect((await closureOf("GUARDIAN", "mg_g_carmen"))!.state).toBe("PURGED");
    });
  });

  /* ═══════════════ 2S1-BE-13 — a closed account's listings can't sell ═══════════════ */

  describe("2S1-BE-13 · a closed roster athlete's items stop selling through their team", () => {
    it("closing pauses the team's listing of their item; BTG can't approve one; the catalogue and the cart refuse it", async () => {
      const closed = await call("POST", "/me/close", "mg_ava", { confirm: true });
      expect(closed.status, closed.text).toBe(200);
      expect((await prisma.listing.findUniqueOrThrow({ where: { id: "mg_list_team" }, select: { state: true } })).state).toBe("PAUSED");

      const approve = await call("POST", "/listings/mg_list_pending/decision", "mg_admin", { decision: "APPROVE" });
      expect(approve.status).toBe(422);
      expect(approve.json.error.message).toMatch(/item's athlete: account closed/);

      /* Even a listing put back live by hand is not for sale: search / catalogue (sellerCanSell) and the cart (checkListing). */
      await prisma.listing.update({ where: { id: "mg_list_team" }, data: { state: "PUBLISHED" } });
      expect(await prisma.listing.count({ where: { id: "mg_list_team", AND: [sellerCanSell()] } })).toBe(0);
      const check = await prisma.$transaction((tx) => checkListing(tx, "mg_list_team", { quantity: 1 }));
      expect(check.ok).toBe(false);

      /* Reactivating clears it: the listing sells again while Ava is still on the team. */
      const link = (await emails("account.closed")).find((m) => m.to === "mg_ava@mg-test.invalid")!.data.reactivateUrl!;
      await prisma.listing.update({ where: { id: "mg_list_team" }, data: { state: "PAUSED" } });
      const r = await call("POST", `/public/account/reactivation/${encodeURIComponent(new URL(link).searchParams.get("t")!)}`, undefined, { action: "REACTIVATE" });
      expect(r.status, r.text).toBe(200);
      expect((await prisma.listing.findUniqueOrThrow({ where: { id: "mg_list_team" }, select: { state: true } })).state).toBe("PUBLISHED");
      expect(await prisma.listing.count({ where: { id: "mg_list_team", AND: [sellerCanSell()] } })).toBe(1);
    });
  });

  /* ═══════════════ 2S1-BE-15 — the handoff's second road, and its gaps ═══════════════ */

  describe("2S1-BE-15 · POST /athletes/:id/guardian is not a road around the handoff", () => {
    const body = { legalName: "Hank Hijack", email: "mg_hank@mg-test.invalid", relationship: "PARENT" };
    it("refuses the guardian and the network manager with handoff_required; a BTG admin needs a reason", async () => {
      const g = await call("POST", "/athletes/mg_lee/guardian", "mg_olive", body);
      expect(g.status, g.text).toBe(409);
      expect(g.json.error.code).toBe("handoff_required");
      const n = await call("POST", "/athletes/mg_lee/guardian", "mg_net", { ...body, replaceReason: "Asked by phone" });
      expect(n.status).toBe(409);
      expect(n.json.error.code).toBe("handoff_required");
      const a = await call("POST", "/athletes/mg_lee/guardian", "mg_admin", body);
      expect(a.status).toBe(422);
      expect(a.json.error.code).toBe("reason_required");
      expect((await prisma.athlete.findUniqueOrThrow({ where: { id: "mg_lee" }, select: { guardianId: true } })).guardianId).toBe("mg_g_old");
    });

    it("a BTG admin replaces a guardian by hand: audited with the reason, both guardians and the athlete emailed", async () => {
      const r = await call("POST", "/athletes/mg_lee/guardian", "mg_admin", { legalName: "Rae Court", email: "mg_rae@mg-test.invalid", relationship: "LEGAL_GUARDIAN", replaceReason: "Court order received by BTG support." });
      expect(r.status, r.text).toBe(201);
      expect((await prisma.athlete.findUniqueOrThrow({ where: { id: "mg_lee" }, select: { guardianId: true } })).guardianId).toBe(r.json.guardianId);
      const trail = await prisma.auditLog.findFirstOrThrow({ where: { tenantId: T, action: "guardian.replace", entityId: "mg_lee" }, select: { actorId: true, before: true, after: true } });
      expect(trail).toMatchObject({ actorId: "mg_admin", before: { guardianId: "mg_g_old" }, after: { reason: "Court order received by BTG support." } });
      const told = await emails("guardian.replacedByBtg");
      expect(told.map((m) => [m.to, m.data.seat]).sort()).toEqual([
        ["mg_lee@mg-test.invalid", "athlete"], ["mg_olive@mg-test.invalid", "previous"], ["mg_rae@mg-test.invalid", "new"],
      ]);
      expect((await emails("guardian.setup")).map((m) => m.to)).toContain("mg_rae@mg-test.invalid");
    });
  });

  describe("2S1-BE-15 · the switch never leaves a gap, and waits for BTG when staff confirm minors", () => {
    it("refuses Hand off when the new guardian's address is another account's sign-in; nothing switches", async () => {
      const r = await call("POST", "/guardian-handoffs/mg_ho_taken/decision", "mg_mara", { decision: "HAND_OFF" });
      expect(r.status).toBe(409);
      expect(r.json.error.message).toMatch(/already another SponsorX account's sign-in/);
      expect((await prisma.athlete.findUniqueOrThrow({ where: { id: "mg_max" }, select: { guardianId: true } })).guardianId).toBe("mg_g_max");
      expect((await prisma.guardianHandoff.findUniqueOrThrow({ where: { id: "mg_ho_taken" }, select: { state: true } })).state).toBe("WAITING");
    });

    it("with 'BTG staff confirm minors' on, Hand off waits for BTG; only BTG confirms; then the switch", async () => {
      await prisma.tenant.update({ where: { id: T }, data: { staffConfirmMinors: true } });
      try {
        const r = await call("POST", "/guardian-handoffs/mg_ho_staff/decision", "mg_mara", { decision: "HAND_OFF" });
        expect(r.status, r.text).toBe(200);
        expect(r.json.state).toBe("HANDED_OFF");
        expect((await prisma.athlete.findUniqueOrThrow({ where: { id: "mg_max" }, select: { guardianId: true } })).guardianId).toBe("mg_g_max");
        expect((await emails("handoff.staffConfirm")).map((m) => m.to)).toEqual(["mg_admin@mg-test.invalid"]);

        expect((await call("POST", "/guardian-handoffs/mg_ho_staff/staff-decision", "mg_mara", { decision: "CONFIRM" })).status).toBe(403);
        const ok = await call("POST", "/guardian-handoffs/mg_ho_staff/staff-decision", "mg_admin", { decision: "CONFIRM" });
        expect(ok.status, ok.text).toBe(200);
        expect(ok.json.state).toBe("SWITCHED");
        const max = await prisma.athlete.findUniqueOrThrow({ where: { id: "mg_max" }, select: { guardian: { select: { email: true } } } });
        expect(max.guardian?.email).toBe("mg_newmax@mg-test.invalid");
        expect(await prisma.user.count({ where: { tenantId: T, email: "mg_newmax@mg-test.invalid", disabledAt: null, roles: { has: "GUARDIAN" } } })).toBe(1);
        /* The other open request for Max was cancelled by the switch. */
        expect((await prisma.guardianHandoff.findUniqueOrThrow({ where: { id: "mg_ho_taken" }, select: { state: true } })).state).toBe("CANCELLED");
      } finally {
        await prisma.tenant.update({ where: { id: T }, data: { staffConfirmMinors: false } });
      }
    });
  });

  /* ═══════════════ 2S2-BE-05 — accepting a team invitation ═══════════════ */

  describe("2S2-BE-05 · accepting a team invitation is the guardian's act, and paused during coming of age", () => {
    it("a minor's own login is refused; their guardian, acting for them, accepts", async () => {
      const own = await call("POST", "/team-invitations/mg_inv_tess/respond", "mg_tess", { decision: "ACCEPT" });
      expect(own.status).toBe(403);
      expect(own.json.error.code).toBe("guardian_must_act");
      const g = await call("POST", "/team-invitations/mg_inv_tess/respond", "mg_gwen", { decision: "ACCEPT" }, { "x-sponsorx-ward": "mg_teen" });
      expect(g.status, g.text).toBe(200);
      expect(g.json.state).toBe("ACCEPTED");
      expect((await prisma.athlete.findUniqueOrThrow({ where: { id: "mg_teen" }, select: { propertyId: true } })).propertyId).toBe("mg_team");
    });

    it("during the coming-of-age allowance nobody accepts", async () => {
      expect((await call("POST", "/team-invitations/mg_inv_cole/respond", "mg_cole", { decision: "ACCEPT" })).json.error.code).toBe("guardian_must_act");
      const g = await call("POST", "/team-invitations/mg_inv_cole/respond", "mg_gwen", { decision: "ACCEPT" }, { "x-sponsorx-ward": "mg_cole" });
      expect(g.status).toBe(409);
      expect(g.json.error.code).toBe("coming_of_age_paused");
    });
  });

  /* ═══════════════ 2S1-BE-12 / -14 — a sensitive edit re-runs the age rules ═══════════════ */

  describe("2S1-BE-12 / -14 · a move or a new date of birth re-runs the age of majority", () => {
    it("an 18-year-old moving from Texas to Alabama (19) becomes a minor: majorityAge and the band follow, BTG is told", async () => {
      const r = await call("POST", "/athletes/mg_tx/profile-changes", "mg_tex", { identity: { stateCode: "AL" } });
      expect(r.status, r.text).toBe(201);
      expect(r.json.checkNotes.join(" ")).toMatch(/a guardian is needed/);
      expect(await prisma.athlete.findUniqueOrThrow({ where: { id: "mg_tx" }, select: { majorityAge: true, ageBand: true } })).toEqual({ majorityAge: 19, ageBand: "16_17" });
      expect((await emails("athlete.sensitiveEdit")).at(-1)).toMatchObject({ data: { what: expect.stringMatching(/where they live/), reviewUrl: expect.stringMatching(/\/admin\/new-signups\/athletes\/mg_tx$/) } });
    });

    it("a new date of birth that makes a minor an adult with a guardian starts the coming-of-age allowance at once", async () => {
      const r = await call("POST", "/athletes/mg_zoe/profile-changes", "mg_zed", { identity: { birthDate: "2001-01-01" } }, { "x-sponsorx-ward": "mg_zoe" });
      expect(r.status, r.text).toBe(201);
      const z = await prisma.athlete.findUniqueOrThrow({ where: { id: "mg_zoe" }, select: { comingOfAgeStartedAt: true, comingOfAgeDueAt: true, ageBand: true } });
      expect(z.comingOfAgeStartedAt).not.toBeNull();
      expect(z.ageBand).toBe("18_PLUS");
      expect((await emails("comingOfAge.started")).map((m) => m.to).sort()).toEqual(["mg_zed@mg-test.invalid", "mg_zoe@mg-test.invalid"]);
    });

    it("a guardian named after approval is verified by their own page once their ID, proof and agreement are in", async () => {
      const agreement = await prisma.agreement.create({ data: { tenantId: T, kind: "GUARDIAN", version: 1, bodyHash: "mg-hash", effectiveAt: new Date() } });
      await evaluateGuardianWards("mg_g_late", T);
      expect((await prisma.guardian.findUniqueOrThrow({ where: { id: "mg_g_late" }, select: { verifiedAt: true } })).verifiedAt).toBeNull();
      await prisma.agreementAcceptance.create({ data: { tenantId: T, agreementId: agreement.id, athleteId: "mg_late", guardianId: "mg_g_late", bodyHash: "mg-hash", ip: "127.0.0.1", userAgent: "vitest" } });
      await evaluateGuardianWards("mg_g_late", T);
      expect((await prisma.guardian.findUniqueOrThrow({ where: { id: "mg_g_late" }, select: { verifiedAt: true, autoVerified: true } }))).toMatchObject({ verifiedAt: expect.any(Date), autoVerified: true });
      expect((await emails("guardian.approved")).map((m) => m.to)).toContain("mg_lana@mg-test.invalid");
    });
  });
});
