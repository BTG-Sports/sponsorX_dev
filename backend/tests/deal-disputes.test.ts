import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   P8-BE-02 / P8-BE-03 (P0-LEG-06) — the athlete's own rules are their
   responsibility, and a concern raised about a deal pauses it. Against the
   real API and database. Done when:

   BE-02  The rules wording is served with its version; an adult confirms it
          on the application or from their login, a minor's guardian on
          their page or acting for them (a minor's own tick doesn't count,
          and a minor's own login is refused); a stale wording is refused;
          with the tenant switch on, accepting a deal waits on a confirmation
          that counts, and with it off nothing changes.
   BE-03  BTG opens a dispute on a sent, accepted or active order: the deal
          pauses (no deliverable moves, the order can only be cancelled, the
          earning is held and stays held); the athlete — or the guardian, for
          a minor — is emailed what was raised and what to send, sends
          documents through the private two-step upload, and BTG's admins are
          emailed; BTG opens them through audited links and resumes (the
          earning goes back) or cancels (the order cancelled, the earning
          left held). Sponsors see none of it.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

const { uploaded } = vi.hoisted(() => ({ uploaded: new Set<string>() }));
vi.mock("../src/lib/storage", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/lib/storage")>();
  return { ...real, checkPrivateUpload: async (_actor: unknown, key: string) => (uploaded.has(key) ? { ok: true as const, bytes: 20_480 } : { ok: false as const, problem: "missing" as const }) };
});
vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@dd-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();
const R = await import("../src/domain/rules-attestation");
const P = await import("../src/domain/deal-disputes");

const DAY = 86_400_000;
const birth = (years: number) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d;
};

describe("P8-BE-02 · whose confirmation counts (pure)", () => {
  const row = (extra: Record<string, unknown>) => ({
    rulesAttestedAt: new Date(), rulesAttestationVersion: R.RULES_ATTESTATION.version, rulesAttestedVia: "APPLICATION",
    birthDate: birth(25), ageBand: null, majorityAge: null, guardianId: null,
    comingOfAgeStartedAt: null, comingOfAgeCompletedAt: null, comingOfAgeTerminatedAt: null, ...extra,
  });
  it("an adult's own, for the current wording; never an old wording; a minor's only from their guardian", () => {
    expect(R.attestationCounts(row({}))).toBe(true);
    expect(R.attestationCounts(row({ rulesAttestationVersion: "2020-01-01" }))).toBe(false);
    expect(R.attestationCounts(row({ rulesAttestedAt: null }))).toBe(false);
    expect(R.attestationCounts(row({ birthDate: birth(15), guardianId: "g" }))).toBe(false);
    expect(R.attestationCounts(row({ birthDate: birth(15), guardianId: "g", rulesAttestedVia: "GUARDIAN_SETUP" }))).toBe(true);
    expect(R.attestationCounts(row({ birthDate: birth(15), guardianId: "g", rulesAttestedVia: "GUARDIAN_PORTAL" }))).toBe(true);
  });
  it("RESUME puts the earning back, but an approval is made again", () => {
    expect(P.resumedEarningState("PENDING")).toBe("PENDING");
    expect(P.resumedEarningState("ELIGIBLE")).toBe("ELIGIBLE");
    expect(P.resumedEarningState("APPROVED_FOR_PAYOUT")).toBe("ELIGIBLE");
    expect(P.resumedEarningState(null)).toBe("PENDING");
  });
});

describe.skipIf(!hasDatabase)("P8-BE-02 / P8-BE-03 · the athlete's own rules; a concern pauses a deal", { timeout: 120_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { createApplicantIn } = await import("../src/domain/application-intake");

  const T = "dd_btg";
  const V = R.RULES_ATTESTATION.version;
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- response bodies are asserted field by field
  type Res = { status: number; text: string; json: any };
  const call = async (method: string, path: string, clerk?: string, body?: unknown, ward?: string): Promise<Res> => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: { "content-type": "application/json", ...(clerk ? { "x-test-clerk": clerk } : {}), ...(ward ? { "x-sponsorx-ward": ward } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };
  const code = (r: Res) => r.json?.error?.code;
  const emails = async () => (await prisma.outboxJob.findMany({ where: { tenantId: T, name: "notify.email" }, select: { payload: true }, orderBy: { createdAt: "asc" } }))
    .map((j) => j.payload as { template: string; to: string; data: Record<string, string> });
  const earningOf = async (orderId: string) => (await prisma.earning.findUnique({ where: { orderId }, select: { state: true } }))?.state;
  const GUARDIAN_EMAIL = "dd_guardian@dd-test.invalid";

  async function clean() {
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 6; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = $1`, T).catch(() => {});
      }
    }
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  const ath = (id: string, extra: Record<string, unknown>) => ({
    id, tenantId: T, slug: `dd-${id}`, legalName: `${id[3]!.toUpperCase()}${id.slice(4)} Okafor`, displayName: id.toUpperCase(),
    email: `${id}@dd-test.invalid`, sport: "Soccer", stateCode: "VA", state: "ACTIVE" as const, emailConfirmedAt: new Date(), ...extra,
  });
  const order = (id: string, athleteId: string, jobId: string, state: "SENT" | "ACCEPTED" | "ACTIVE" | "COMPLETED") => ({
    id, tenantId: T, campaignId: "dd_campaign", athleteId, jobId, compensation: 20_000, sellPrice: 40_000, usageRights: "90 days",
    dueDate: new Date(Date.now() + 30 * DAY), state,
  });

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "DD BTG" } });
    await prisma.guardian.create({ data: { id: "dd_g", tenantId: T, legalName: "Grace Okafor", email: GUARDIAN_EMAIL, relationship: "PARENT", verifiedAt: new Date(), emailConfirmedAt: new Date() } });
    await prisma.athlete.createMany({ data: [
      ath("dd_ada", { birthDate: birth(24) }),
      ath("dd_ben", { birthDate: birth(22) }),
      ath("dd_kid", { birthDate: birth(15), guardianId: "dd_g" }),
    ] });
    await prisma.sponsor.create({ data: { id: "dd_sponsor", tenantId: T, name: "Harbor Coffee", categories: ["RESTAURANT"] } });
    await prisma.user.createMany({ data: [
      { id: "dd_admin", tenantId: T, clerkId: "dd_admin", email: "dd_admin@dd-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "dd_finance", tenantId: T, clerkId: "dd_finance", email: "dd_finance@dd-test.invalid", roles: ["FINANCE"] },
      { id: "dd_sponsor_admin", tenantId: T, clerkId: "dd_sponsor_admin", email: "dd_sp@dd-test.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "dd_sponsor" },
      { id: "dd_guardian", tenantId: T, clerkId: "dd_guardian", email: GUARDIAN_EMAIL, roles: ["GUARDIAN"], guardianId: "dd_g" },
      ...["ada", "ben", "kid"].map((n) => ({ id: `dd_u_${n}`, tenantId: T, clerkId: `dd_u_${n}`, email: `dd_${n}@dd-test.invalid`, roles: ["ATHLETE" as const], athleteId: `dd_${n}` })),
    ] });
    for (const j of ["dd_job1", "dd_job2", "dd_job3", "dd_job4", "dd_job5"]) {
      await prisma.nilJob.create({ data: { id: j, tenantId: T, name: `Post ${j}`, baseLow: 10_000, baseHigh: 20_000, sellLow: 20_000, sellHigh: 40_000, sellFloorEmerging: 15_000, sellFloorCreator: 20_000, sellFloorPremium: 30_000 } });
    }
    await prisma.campaign.create({ data: { id: "dd_campaign", tenantId: T, sponsorId: "dd_sponsor", name: "Spring", budget: 500_000, startDate: new Date(), endDate: new Date(Date.now() + 90 * DAY), state: "STAFFING" } });
    await prisma.agreement.create({ data: { id: "dd_collab", tenantId: T, kind: "COLLAB", version: 1, bodyHash: "d".repeat(64), effectiveAt: new Date("2026-01-01") } });
    /* Ada's live deal (earning approved for payout), Ben's live deal (pending), a completed one, a minor's, and one to cancel. */
    await prisma.campaignOrder.createMany({ data: [
      order("dd_order_ada", "dd_ada", "dd_job1", "ACTIVE"),
      order("dd_order_ben", "dd_ben", "dd_job2", "ACTIVE"),
      order("dd_order_done", "dd_ben", "dd_job3", "COMPLETED"),
      order("dd_order_kid", "dd_kid", "dd_job4", "ACTIVE"),
    ] });
    await prisma.deliverable.create({ data: { id: "dd_deliv_ada", tenantId: T, orderId: "dd_order_ada", title: "Match-day post", dueDate: new Date(Date.now() + 14 * DAY) } });
    await prisma.earning.createMany({ data: [
      { id: "dd_earn_ada", tenantId: T, athleteId: "dd_ada", orderId: "dd_order_ada", gross: 20_000, taxYear: 2026, state: "APPROVED_FOR_PAYOUT" },
      { id: "dd_earn_ben", tenantId: T, athleteId: "dd_ben", orderId: "dd_order_ben", gross: 20_000, taxYear: 2026, state: "PENDING" },
    ] });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server?.close();
    await clean();
  });

  /* ─────────────────────────── P8-BE-02 ─────────────────────────── */

  it("BE-02 · the wording is public, with its version", async () => {
    const r = await call("GET", "/public/rules-attestation");
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ version: V, text: expect.stringMatching(/my responsibility/) });
  });

  it("BE-02 · the application records the applicant's tick; a stale wording is refused", async () => {
    const input = { legalName: "Cleo Ma", displayName: "Cleo Ma", email: "dd_cleo@dd-test.invalid", stateCode: "MD", sport: "Tennis", birthDate: "2000-01-01", socials: [] };
    await expect(prisma.$transaction((tx) => createApplicantIn(tx, T, { userId: null, tenantId: T }, { ...input, rulesAttestationVersion: "2020-01-01" } as never)))
      .rejects.toMatchObject({ code: "rules_attestation_stale" });
    const made = await prisma.$transaction((tx) => createApplicantIn(tx, T, { userId: null, tenantId: T }, { ...input, rulesAttestationVersion: V } as never));
    expect(await prisma.athlete.findUnique({ where: { id: made.id }, select: { rulesAttestationVersion: true, rulesAttestedVia: true } }))
      .toEqual({ rulesAttestationVersion: V, rulesAttestedVia: "APPLICATION" });
  });

  it("BE-02 · switched off, nothing waits on it; switched on, a deal waits on a confirmation that counts", async () => {
    const accept = (who: string) => call("POST", "/agreements/accept", who, { agreementId: "dd_collab", bodyHashShown: "d".repeat(64) });
    /* Off by default: Ben has confirmed nothing and still accepts. */
    expect((await call("GET", "/signup-rules/settings", "dd_admin")).json).toEqual({ staffConfirmMinors: false, requireRulesAttestation: false });
    expect((await accept("dd_u_ben")).status).toBeLessThan(300);

    /* On, switched alone: staffConfirmMinors is untouched. */
    const set = await call("PUT", "/signup-rules/settings", "dd_admin", { requireRulesAttestation: true });
    expect(set.json).toEqual({ staffConfirmMinors: false, requireRulesAttestation: true });
    expect((await call("PUT", "/signup-rules/settings", "dd_admin", {})).status).toBe(400);

    const refused = await accept("dd_u_ada");
    expect(refused.status).toBe(409);
    expect(code(refused)).toBe("rules_attestation_required");
    expect((await call("GET", "/me/rules-attestation", "dd_u_ada")).json).toMatchObject({ version: V, current: false, required: true, byGuardian: false });

    const stale = await call("POST", "/me/rules-attestation", "dd_u_ada", { version: "2020-01-01" });
    expect([stale.status, code(stale)]).toEqual([422, "rules_attestation_stale"]);
    const ok = await call("POST", "/me/rules-attestation", "dd_u_ada", { version: V });
    expect(ok.json).toMatchObject({ current: true, attestedVia: "PORTAL", attestedVersion: V });
    expect((await accept("dd_u_ada")).status).toBeLessThan(300);
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "athlete.rulesAttest", entityId: "dd_ada" } })).toBe(1);
  });

  it("BE-02 · for a minor only the guardian confirms; the minor's own login is refused", async () => {
    const own = await call("POST", "/me/rules-attestation", "dd_u_kid", { version: V });
    expect([own.status, code(own)]).toEqual([403, "guardian_must_act"]);
    const g = await call("POST", "/me/rules-attestation", "dd_guardian", { version: V }, "dd_kid");
    expect(g.status).toBe(200);
    expect(g.json).toMatchObject({ current: true, attestedVia: "GUARDIAN_PORTAL", byGuardian: true });
    await call("PUT", "/signup-rules/settings", "dd_admin", { requireRulesAttestation: false });
  });

  /* ─────────────────────────── P8-BE-03 ─────────────────────────── */

  let disputeId = "";
  const OPEN = { source: "SCHOOL", sourceName: "Riverside High athletic director", reason: "The school says its logo appears in the post.", documentsRequested: "A letter from the school approving the deal." };

  it("BE-03 · only BTG opens one; the deal pauses and its earning is held; the athlete is told what to send", async () => {
    expect((await call("POST", "/orders/dd_order_ada/disputes", "dd_u_ada", OPEN)).status).toBe(403);
    expect((await call("POST", "/orders/dd_order_ada/disputes", "dd_sponsor_admin", OPEN)).status).toBe(403);
    const r = await call("POST", "/orders/dd_order_ada/disputes", "dd_admin", OPEN);
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ state: "OPEN", paused: true, reason: OPEN.reason, documentsRequested: OPEN.documentsRequested, orderState: "ACTIVE" });
    disputeId = r.json.id;
    expect(await earningOf("dd_order_ada")).toBe("HELD");
    expect((await prisma.dealDispute.findUnique({ where: { id: disputeId }, select: { earningStateBefore: true } }))?.earningStateBefore).toBe("APPROVED_FOR_PAYOUT");
    const mail = (await emails()).filter((m) => m.template === "dealDispute.opened");
    expect(mail).toEqual([expect.objectContaining({ to: "dd_ada@dd-test.invalid", data: expect.objectContaining({ reason: OPEN.reason, documentsRequested: OPEN.documentsRequested }) })]);

    const again = await call("POST", "/orders/dd_order_ada/disputes", "dd_admin", OPEN);
    expect([again.status, code(again)]).toEqual([409, "deal_already_paused"]);
    const done = await call("POST", "/orders/dd_order_done/disputes", "dd_admin", OPEN);
    expect([done.status, code(done)]).toEqual([409, "deal_not_disputable"]);
  });

  it("BE-03 · the athlete reads their own; Finance reads; the sponsor and another athlete see nothing", async () => {
    expect((await call("GET", `/deal-disputes/${disputeId}`, "dd_u_ada")).status).toBe(200);
    expect((await call("GET", "/deal-disputes", "dd_u_ada")).json.disputes).toHaveLength(1);
    expect((await call("GET", `/deal-disputes/${disputeId}`, "dd_finance")).status).toBe(200);
    expect((await call("GET", `/deal-disputes/${disputeId}`, "dd_u_ben")).status).toBe(403);
    expect((await call("GET", `/deal-disputes/${disputeId}`, "dd_sponsor_admin")).status).toBe(403);
    expect((await call("GET", "/deal-disputes", "dd_u_ben")).json.disputes).toEqual([]);
  });

  it("BE-03 · while paused nothing moves: no draft, no completing, no releasing the earning — only cancelling is open", async () => {
    const submit = await call("POST", "/deliverables/dd_deliv_ada/submit", "dd_u_ada", {});
    expect([submit.status, code(submit)]).toEqual([409, "deal_paused"]);
    const complete = await call("POST", "/orders/dd_order_ada/transition", "dd_admin", { to: "COMPLETED" });
    expect([complete.status, code(complete)]).toEqual([409, "deal_paused"]);
    const release = await call("POST", "/earnings/dd_earn_ada/transition", "dd_finance", { to: "ELIGIBLE" });
    expect([release.status, code(release)]).toEqual([409, "deal_paused"]);
    expect(await earningOf("dd_order_ada")).toBe("HELD");
  });

  it("BE-03 · the athlete sends documents through the private two-step upload; BTG's admins hear; only BTG opens them", async () => {
    const wrong = await call("POST", `/deal-disputes/${disputeId}/documents`, "dd_u_ada", { filename: "a.exe", contentType: "application/x-msdownload", bytes: 100 });
    expect(wrong.status).toBe(422);
    const start = await call("POST", `/deal-disputes/${disputeId}/documents`, "dd_u_ada", { filename: "school letter.pdf", contentType: "application/pdf", bytes: 20_480 });
    expect(start.status).toBe(201);
    expect(start.json.uploadUrl).toMatch(/^https?:\/\//);
    const docId = start.json.document.id as string;
    expect([(await call("POST", `/deal-disputes/${disputeId}/documents/${docId}/confirm`, "dd_u_ada")).status]).toEqual([409]);
    expect((await call("POST", `/deal-disputes/${disputeId}/documents`, "dd_u_ben", { filename: "x.pdf", contentType: "application/pdf", bytes: 10 })).status).toBe(403);

    const doc = await prisma.dealDisputeDocument.findUniqueOrThrow({ where: { id: docId }, select: { r2Key: true } });
    uploaded.add(doc.r2Key);
    const done = await call("POST", `/deal-disputes/${disputeId}/documents/${docId}/confirm`, "dd_u_ada");
    expect(done.status).toBe(200);
    expect(done.json).toMatchObject({ state: "DOCUMENTS_IN", documents: [expect.objectContaining({ id: docId, filename: "school-letter.pdf" })] });
    expect((await emails()).filter((m) => m.template === "dealDispute.documentsIn").map((m) => m.to)).toEqual(["dd_admin@dd-test.invalid"]);

    expect((await call("GET", `/deal-disputes/${disputeId}/documents/${docId}`, "dd_u_ada")).status).toBe(403);
    expect((await call("GET", `/deal-disputes/${disputeId}/documents/${docId}`, "dd_finance")).status).toBe(403);
    const view = await call("GET", `/deal-disputes/${disputeId}/documents/${docId}`, "dd_admin");
    expect(view.status).toBe(200);
    expect(view.json).toMatchObject({ id: docId, expiresInSeconds: 300, url: expect.stringMatching(/^https?:\/\//) });
  });

  it("BE-03 · RESUME lifts the pause and puts the earning back (an approval is made again); the athlete is told", async () => {
    expect((await call("POST", `/deal-disputes/${disputeId}/resolve`, "dd_u_ada", { outcome: "RESUME", note: "Looks fine." })).status).toBe(403);
    const r = await call("POST", `/deal-disputes/${disputeId}/resolve`, "dd_admin", { outcome: "RESUME", note: "The school confirmed in writing that the deal is approved." });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ state: "RESUMED", paused: false });
    expect(await earningOf("dd_order_ada")).toBe("ELIGIBLE");
    const submit = await call("POST", "/deliverables/dd_deliv_ada/submit", "dd_u_ada", {});
    expect(code(submit)).not.toBe("deal_paused");
    expect((await emails()).filter((m) => m.template === "dealDispute.resolved")).toEqual([expect.objectContaining({ to: "dd_ada@dd-test.invalid", data: expect.objectContaining({ outcome: "RESUME" }) })]);
    expect((await call("POST", `/deal-disputes/${disputeId}/resolve`, "dd_admin", { outcome: "CANCEL", note: "again" })).status).toBe(409);
  });

  it("BE-03 · CANCEL cancels the order the normal way and leaves the earning held for Finance", async () => {
    const opened = await call("POST", "/orders/dd_order_ben/disputes", "dd_admin", { ...OPEN, source: "LEAGUE", sourceName: null });
    expect(opened.status).toBe(201);
    expect(await earningOf("dd_order_ben")).toBe("HELD");
    const r = await call("POST", `/deal-disputes/${opened.json.id}/resolve`, "dd_admin", { outcome: "CANCEL", note: "The league does not allow this category." });
    expect(r.json).toMatchObject({ state: "CANCELLED", orderState: "CANCELLED" });
    expect(await earningOf("dd_order_ben")).toBe("HELD");
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "order.cancel", entityId: "dd_order_ben" } })).toBe(1);
  });

  it("BE-03 · for a minor the guardian is told, and sends the documents acting for them", async () => {
    const r = await call("POST", "/orders/dd_order_kid/disputes", "dd_admin", { ...OPEN, source: "PARENT" });
    expect(r.status).toBe(201);
    const told = (await emails()).filter((m) => m.template === "dealDispute.opened" && m.data.forGuardian === "yes");
    expect(told).toEqual([expect.objectContaining({ to: GUARDIAN_EMAIL, data: expect.objectContaining({ athleteFirstName: "Kid" }) })]);
    const start = await call("POST", `/deal-disputes/${r.json.id}/documents`, "dd_guardian", { filename: "permission.png", contentType: "image/png", bytes: 20_480 }, "dd_kid");
    expect(start.status).toBe(201);
  });
});
