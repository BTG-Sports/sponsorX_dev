import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   2S1-BE-15 — changing a minor's guardian (the handoff), against the real
   API and database. Done when:

     A handoff can happen only after the new guardian's request and the
     current guardian's Hand off; the current guardian keeps control until
     the switch, which is atomic; agreed work and earned money stay where
     they were; a guardian's other children are unaffected; a declined or
     disputed request goes to BTG support and is never automated; every step
     is audited.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
process.env.PUBLIC_INTAKE_TENANT_ID = "gh_btg";

/* The private bucket isn't running: a key counts as uploaded once the test says the browser sent it. */
const { uploaded } = vi.hoisted(() => ({ uploaded: new Set<string>() }));
vi.mock("../src/lib/storage", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/lib/storage")>();
  return { ...real, checkPrivateUpload: async (_actor: unknown, key: string) => (uploaded.has(key) ? { ok: true as const, bytes: 204_800 } : { ok: false as const, problem: "missing" as const }) };
});
vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@gh-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("2S1-BE-15 · changing a minor's guardian", { timeout: 90_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");

  const T = "gh_btg";
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
  const pub = (token: string, rest = "") => `/public/guardian-handoffs/${encodeURIComponent(token)}${rest}`;

  /** The money and the work the switch must never touch. */
  const moneyAndWork = async () => JSON.stringify(await Promise.all([
    prisma.earning.findMany({ where: { tenantId: T }, select: { id: true, athleteId: true, orderId: true, gross: true, state: true }, orderBy: { id: "asc" } }),
    prisma.campaignOrder.findMany({ where: { tenantId: T }, select: { id: true, athleteId: true, state: true, compensation: true }, orderBy: { id: "asc" } }),
    prisma.payoutAccount.findMany({ where: { tenantId: T }, select: { id: true, payeeType: true, payeeId: true, status: true }, orderBy: { id: "asc" } }),
  ]));

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

  /** The new guardian does everything the request page asks, up to Send. */
  async function request(b: { name: string; email: string; relationship?: string }) {
    const start = await call("POST", "/public/guardian-handoffs", undefined, {
      athleteEmail: "gh_jordan@gh-test.invalid", name: b.name, email: b.email, relationship: b.relationship ?? "PARENT",
    });
    expect(start.status, start.text).toBe(201);
    const token = start.json.token as string;
    for (const doc of [{ kind: "GUARDIAN_ID" }, { kind: "GUARDIANSHIP_PROOF", proofKind: "COURT_ORDER" }]) {
      const up = await call("POST", pub(token, "/documents"), undefined, { ...doc, filename: "scan.pdf", contentType: "application/pdf", bytes: 204_800 });
      expect(up.status, up.text).toBe(201);
      const row = await prisma.guardianHandoffDocument.findUniqueOrThrow({ where: { id: up.json.document.id }, select: { r2Key: true } });
      uploaded.add(row.r2Key);
      expect((await call("POST", pub(token, `/documents/${up.json.document.id}/confirm`))).status).toBe(200);
    }
    const mail = (await emails()).filter((m) => m.template === "handoff.confirmEmail" && m.to === b.email).at(-1)!;
    const emailToken = new URL(mail.data.confirmUrl!).searchParams.get("e")!;
    return { token, emailToken, id: start.json.request.id as string };
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "Handoff BTG" } });
    await prisma.guardian.createMany({ data: [
      { id: "gh_carmen", tenantId: T, legalName: "Carmen Reyes", email: "gh_carmen@gh-test.invalid", relationship: "PARENT", verifiedAt: new Date() },
      { id: "gh_other", tenantId: T, legalName: "Pat Other", email: "gh_pat@gh-test.invalid", relationship: "PARENT", verifiedAt: new Date() },
    ] });
    await prisma.athlete.createMany({ data: [
      { id: "gh_jordan", tenantId: T, slug: "gh-jordan", legalName: "Jordan Reyes", displayName: "Jordan Reyes", email: "gh_jordan@gh-test.invalid", sport: "Basketball", birthDate: new Date("2011-03-01"), state: "ACTIVE", guardianId: "gh_carmen" },
      { id: "gh_mia", tenantId: T, slug: "gh-mia", legalName: "Mia Reyes", displayName: "Mia Reyes", email: "gh_mia@gh-test.invalid", sport: "Soccer", birthDate: new Date("2013-05-01"), state: "ACTIVE", guardianId: "gh_carmen" },
      { id: "gh_adult", tenantId: T, slug: "gh-adult", legalName: "Alex Adult", displayName: "Alex", email: "gh_adult@gh-test.invalid", sport: "Track", ageBand: "18_PLUS", state: "ACTIVE" },
    ] });
    await prisma.user.createMany({ data: [
      { id: "gh_admin", tenantId: T, clerkId: "gh_admin", email: "gh_admin@gh-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "gh_u_carmen", tenantId: T, clerkId: "gh_carmen", email: "gh_carmen@gh-test.invalid", roles: ["GUARDIAN"], guardianId: "gh_carmen" },
      { id: "gh_u_pat", tenantId: T, clerkId: "gh_pat", email: "gh_pat@gh-test.invalid", roles: ["GUARDIAN"], guardianId: "gh_other" },
      { id: "gh_u_jordan", tenantId: T, clerkId: "gh_jordan", email: "gh_jordan@gh-test.invalid", roles: ["ATHLETE"], athleteId: "gh_jordan" },
      { id: "gh_u_sponsor", tenantId: T, clerkId: "gh_sponsor", email: "gh_sponsor@gh-test.invalid", roles: ["SPONSOR_ADMIN"] },
    ] });
    /* Work already agreed and money already earned, under Carmen. */
    await prisma.sponsor.create({ data: { id: "gh_sp", tenantId: T, name: "Hoops Co" } });
    await prisma.nilJob.create({ data: { id: "gh_job", tenantId: T, name: "Post", baseLow: 10000, baseHigh: 20000, sellLow: 20000, sellHigh: 40000, sellFloorEmerging: 15000, sellFloorCreator: 20000, sellFloorPremium: 30000 } });
    await prisma.campaign.create({ data: { id: "gh_camp", tenantId: T, sponsorId: "gh_sp", name: "Fall", budget: 100000, startDate: new Date("2026-10-01"), endDate: new Date("2026-12-01"), state: "ACTIVE" } });
    await prisma.campaignOrder.create({ data: { id: "gh_order", tenantId: T, campaignId: "gh_camp", athleteId: "gh_jordan", jobId: "gh_job", compensation: 20000, sellPrice: 40000, usageRights: "90 days", dueDate: new Date("2026-11-15"), state: "ACCEPTED" } });
    await prisma.earning.create({ data: { id: "gh_earn", tenantId: T, athleteId: "gh_jordan", orderId: "gh_order", gross: 20000, taxYear: 2026 } });
    await prisma.payoutAccount.create({ data: { id: "gh_pa", tenantId: T, payeeType: "ATHLETE", payeeId: "gh_jordan", provider: "standin", status: "READY" } });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server?.close();
    await clean();
  });

  it("the new guardian finds the athlete by email, first names only; an adult or unknown email isn't a match", async () => {
    const found = await call("GET", "/public/guardian-handoffs/lookup?athleteEmail=GH_Jordan%40gh-test.invalid");
    expect(found.json).toEqual({ found: true, athlete: { firstName: "Jordan", sport: "Basketball" }, current: { firstName: "Carmen" } });
    expect((await call("GET", "/public/guardian-handoffs/lookup?athleteEmail=gh_adult%40gh-test.invalid")).json).toEqual({ found: false });
    expect((await call("POST", "/public/guardian-handoffs", undefined, { athleteEmail: "gh_adult@gh-test.invalid", name: "X", email: "x@gh-test.invalid", relationship: "PARENT" })).status).toBe(404);
  });

  it("only the new guardian starts one: not with the current guardian's email, the athlete's, or another login's", async () => {
    for (const email of ["gh_carmen@gh-test.invalid", "gh_jordan@gh-test.invalid", "gh_sponsor@gh-test.invalid"]) {
      const r = await call("POST", "/public/guardian-handoffs", undefined, { athleteEmail: "gh_jordan@gh-test.invalid", name: "Not Them", email, relationship: "PARENT" });
      expect(r.status, email).toBe(422);
    }
    /* Nobody signed in has a route to start one: there is no POST /guardian-handoffs. */
    expect((await call("POST", "/guardian-handoffs", "gh_carmen", {})).status).toBe(404);
    expect((await call("POST", "/guardian-handoffs", "gh_jordan", {})).status).toBe(404);
  });

  let luis: Awaited<ReturnType<typeof request>>;
  it("the request can't be sent until the email is confirmed, both documents are in and the agreement is accepted", async () => {
    luis = await request({ name: "Luis Reyes", email: "gh_luis@gh-test.invalid" });
    const s = await call("GET", pub(luis.token));
    expect(s.json).toMatchObject({ state: "REQUESTED", idUploaded: true, proofUploaded: true, emailConfirmed: false, missing: ["confirm your email", "accept the guardian agreement"] });
    expect((await call("POST", pub(luis.token, "/submit"), undefined, { acceptAgreement: true })).status).toBe(409);
    expect((await call("POST", pub(luis.token, "/submit"), undefined, {})).status).toBe(400);
    /* The browser's request token cannot confirm the mailbox. */
    expect((await call("POST", "/public/guardian-handoffs/confirm-email", undefined, { token: luis.token })).status).toBe(400);
    const c = await call("POST", "/public/guardian-handoffs/confirm-email", undefined, { token: luis.emailToken });
    expect(c.json.request).toMatchObject({ emailConfirmed: true });
    const sent = await call("POST", pub(luis.token, "/submit"), undefined, { acceptAgreement: true });
    expect(sent.status, sent.text).toBe(200);
    expect(sent.json).toMatchObject({ state: "WAITING", agreementAccepted: true, supportEmail: "support@sponsorx.net" });
    const asked = (await emails()).find((m) => m.template === "handoff.requested")!;
    expect(asked).toMatchObject({ to: "gh_carmen@gh-test.invalid", data: { requesterName: "Luis Reyes", portalUrl: expect.stringMatching(/\/athlete\/guardian-requests$/) } });
  });

  it("until the switch Carmen is the guardian; the athlete and anyone else can read but never answer", async () => {
    expect((await prisma.athlete.findUniqueOrThrow({ where: { id: "gh_jordan" }, select: { guardianId: true } })).guardianId).toBe("gh_carmen");
    const mine = await call("GET", "/guardian-handoffs", "gh_carmen");
    expect(mine.json.handoffs).toEqual([expect.objectContaining({ id: luis.id, state: "WAITING", requester: expect.objectContaining({ name: "Luis Reyes", relationship: "Parent" }), current: expect.objectContaining({ name: "Carmen Reyes" }) })]);
    expect((await call("GET", "/guardian-handoffs", "gh_jordan")).json.handoffs.map((h: { id: string }) => h.id)).toEqual([luis.id]);
    expect((await call("POST", `/guardian-handoffs/${luis.id}/decision`, "gh_jordan", { decision: "HAND_OFF" })).status).toBe(403);
    expect((await call("POST", `/guardian-handoffs/${luis.id}/decision`, "gh_pat", { decision: "HAND_OFF" })).status).toBe(403);
    expect((await call("POST", `/guardian-handoffs/${luis.id}/decision`, "gh_admin", { decision: "HAND_OFF" })).status).toBe(403);
    expect((await call("POST", `/guardian-handoffs/${luis.id}/decision`, "gh_sponsor", { decision: "HAND_OFF" })).status).toBe(403);
    expect((await call("GET", `/guardian-handoffs/${luis.id}`, "gh_admin")).status).toBe(200);
  });

  let rival: Awaited<ReturnType<typeof request>>;
  it("Carmen hands off: one switch, the new guardian approved with a login, money and work untouched, Mia unaffected", async () => {
    rival = await request({ name: "Rae Rival", email: "gh_rae@gh-test.invalid", relationship: "LEGAL_GUARDIAN" });
    await call("POST", "/public/guardian-handoffs/confirm-email", undefined, { token: rival.emailToken });
    expect((await call("POST", pub(rival.token, "/submit"), undefined, { acceptAgreement: true })).json.state).toBe("WAITING");

    const before = await moneyAndWork();
    const done = await call("POST", `/guardian-handoffs/${luis.id}/decision`, "gh_carmen", { decision: "HAND_OFF" });
    expect(done.status, done.text).toBe(200);
    expect(done.json).toMatchObject({ state: "SWITCHED", documentsCheckedAt: expect.any(String), switchedAt: expect.any(String) });

    const jordan = await prisma.athlete.findUniqueOrThrow({ where: { id: "gh_jordan" }, select: { guardianId: true, guardian: { select: { legalName: true, email: true, verifiedAt: true } } } });
    expect(jordan.guardian).toMatchObject({ legalName: "Luis Reyes", email: "gh_luis@gh-test.invalid", verifiedAt: expect.any(Date) });
    expect((await prisma.athlete.findUniqueOrThrow({ where: { id: "gh_mia" }, select: { guardianId: true } })).guardianId).toBe("gh_carmen");
    expect(await moneyAndWork()).toBe(before);
    expect(await prisma.user.findFirstOrThrow({ where: { tenantId: T, email: "gh_luis@gh-test.invalid" }, select: { roles: true, guardianId: true } }))
      .toEqual({ roles: ["GUARDIAN"], guardianId: jordan.guardianId });
    /* The other open request was made of a guardian who no longer is one. */
    expect((await prisma.guardianHandoff.findUniqueOrThrow({ where: { id: rival.id }, select: { state: true } })).state).toBe("CANCELLED");
    expect((await call("POST", `/guardian-handoffs/${rival.id}/decision`, "gh_carmen", { decision: "HAND_OFF" })).status).toBe(409);
    /* Carmen no longer reaches Jordan; she still reaches Mia. */
    expect((await call("GET", "/athletes/gh_jordan/guardian-readiness", "gh_carmen")).status).toBe(403);
    expect((await call("GET", "/athletes/gh_mia/guardian-readiness", "gh_carmen")).status).toBe(200);

    const sent = await emails();
    expect(sent.filter((m) => m.template.startsWith("handoff.switched")).map((m) => [m.template, m.to]).sort()).toEqual([
      ["handoff.switchedAthlete", "gh_jordan@gh-test.invalid"],
      ["handoff.switchedNew", "gh_luis@gh-test.invalid"],
      ["handoff.switchedPrevious", "gh_carmen@gh-test.invalid"],
    ]);
    expect(sent.find((m) => m.template === "handoff.switchedPrevious")!.data.otherChildren).toBe("yes");
    expect(sent.find((m) => m.template === "handoff.btgNotice")).toMatchObject({ to: "gh_admin@gh-test.invalid", data: { reviewUrl: expect.stringContaining("/admin/new-signups/guardians/") } });
  });

  it("every step is audited", async () => {
    const actions = (await prisma.auditLog.findMany({ where: { tenantId: T, OR: [{ entityId: luis.id }, { action: "guardianHandoff.switch" }, { action: "guardian.autoApprove" }] }, select: { action: true }, orderBy: { at: "asc" } }))
      .map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining([
      "guardianHandoff.request", "guardianHandoff.documentUploaded", "guardianHandoff.emailConfirmed", "guardianHandoff.submit",
      "guardian.autoApprove", "guardianHandoff.switch",
    ]));
  });

  it("a decline changes nothing, points to BTG support, and nothing else happens by itself", async () => {
    const pat = await request({ name: "Pat Other", email: "gh_pat@gh-test.invalid" });
    await call("POST", "/public/guardian-handoffs/confirm-email", undefined, { token: pat.emailToken });
    expect((await call("POST", pub(pat.token, "/submit"), undefined, { acceptAgreement: true })).json.state).toBe("WAITING");
    /* Now Luis answers: he is the guardian. */
    const luisLogin = await prisma.user.findFirstOrThrow({ where: { tenantId: T, email: "gh_luis@gh-test.invalid" }, select: { id: true, guardianId: true } });
    await prisma.user.update({ where: { id: luisLogin.id }, data: { clerkId: "gh_luis" } });
    const no = await call("POST", `/guardian-handoffs/${pat.id}/decision`, "gh_luis", { decision: "DECLINE" });
    expect(no.status, no.text).toBe(200);
    expect(no.json.state).toBe("DECLINED");
    const guardian = (await prisma.athlete.findUniqueOrThrow({ where: { id: "gh_jordan" }, select: { guardianId: true } })).guardianId;
    expect(guardian).toBe(luisLogin.guardianId);
    /* The current guardian's decline reads as before: who declined, and no note — none is asked of them. */
    expect((await call("GET", pub(pat.token))).json).toMatchObject({ state: "DECLINED", supportEmail: "support@sponsorx.net", declinedBy: "CURRENT_GUARDIAN", declineNote: null });
    const mail = (await emails()).find((m) => m.template === "handoff.declined")!;
    expect(mail).toMatchObject({ to: "gh_pat@gh-test.invalid", data: { supportEmail: "support@sponsorx.net", supportUrl: expect.stringMatching(/\/contact\?topic=guardianship$/) } });
    expect(mail.data).not.toHaveProperty("note");
    expect((await emails()).some((m) => m.template === "handoff.declinedByBtg")).toBe(false);
    const { EMAIL_TEMPLATES } = await import("../worker/jobs/send-email.mts");
    expect(EMAIL_TEMPLATES["handoff.declined"]!(mail.data as Record<string, string>).text).toMatch(/declined your request\. Nothing changed/);
    expect((await call("POST", `/guardian-handoffs/${pat.id}/decision`, "gh_luis", { decision: "HAND_OFF" })).status).toBe(409);
  });
});
