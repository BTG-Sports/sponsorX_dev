import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   2S1-BE-15 — BTG's Guardian handoffs desk (/admin/guardian-handoffs),
   against the real API and database:

     - BTG reads every request in the tenant, one still being filled in
       too, with each tab's count and the desk's detail (`staff`); a
       guardian's and an athlete's answers are unchanged — no `staff`, no
       counts, never a request before it is sent;
     - ?group= picks one tab;
     - the new guardian's documents open for BTG only, through a
       five-minute link that is recorded;
     - who decided — the current guardian or BTG, and which BTG login — is
       read back for a staff decline and a staff-confirmed switch.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
process.env.PUBLIC_INTAKE_TENANT_ID = "hd_btg";

/* The private bucket isn't running: a key counts as uploaded once the test says the browser sent it. */
const { uploaded } = vi.hoisted(() => ({ uploaded: new Set<string>() }));
vi.mock("../src/lib/storage", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/lib/storage")>();
  return { ...real, privateObjectSize: async (key: string) => (uploaded.has(key) ? 204_800 : null) };
});
vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@hd-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("2S1-BE-15 · BTG's Guardian handoffs desk", { timeout: 90_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");

  const T = "hd_btg";
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

  /** Each request's public token, by request id — the requester's status page. */
  const tokens = new Map<string, string>();

  /** The new guardian's request: started, both documents in; confirmed and sent unless `send` is false. */
  async function request(b: { name: string; email: string; phone?: string }, send = true) {
    const start = await call("POST", "/public/guardian-handoffs", undefined, {
      athleteEmail: "hd_jordan@hd-test.invalid", name: b.name, email: b.email, phone: b.phone, relationship: "PARENT",
    });
    expect(start.status, start.text).toBe(201);
    const token = start.json.token as string;
    for (const doc of [{ kind: "GUARDIAN_ID", filename: "luis-id.png", contentType: "image/png" }, { kind: "GUARDIANSHIP_PROOF", proofKind: "BIRTH_CERTIFICATE", filename: "birth-cert.pdf", contentType: "application/pdf" }]) {
      const up = await call("POST", pub(token, "/documents"), undefined, { ...doc, bytes: 204_800 });
      expect(up.status, up.text).toBe(201);
      const row = await prisma.guardianHandoffDocument.findUniqueOrThrow({ where: { id: up.json.document.id }, select: { r2Key: true } });
      uploaded.add(row.r2Key);
      expect((await call("POST", pub(token, `/documents/${up.json.document.id}/confirm`))).status).toBe(200);
    }
    const id = start.json.request.id as string;
    tokens.set(id, token);
    if (!send) return id;
    const mail = (await emails()).filter((m) => m.template === "handoff.confirmEmail" && m.to === b.email).at(-1)!;
    await call("POST", "/public/guardian-handoffs/confirm-email", undefined, { token: new URL(mail.data.confirmUrl!).searchParams.get("e")! });
    const sent = await call("POST", pub(token, "/submit"), undefined, { acceptAgreement: true });
    expect(sent.json.state, sent.text).toBe("WAITING");
    return id;
  }

  let luis = "";
  let pat = "";
  let rae = "";

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "Handoff desk BTG", staffConfirmMinors: true } });
    await prisma.guardian.create({ data: { id: "hd_carmen", tenantId: T, legalName: "Carmen Reyes", email: "hd_carmen@hd-test.invalid", relationship: "PARENT", verifiedAt: new Date() } });
    await prisma.athlete.create({ data: {
      id: "hd_jordan", tenantId: T, slug: "hd-jordan", legalName: "Jordan Reyes", displayName: "Jordan Reyes", email: "hd_jordan@hd-test.invalid",
      sport: "Basketball", birthDate: new Date(Date.UTC(new Date().getUTCFullYear() - 16, 0, 1)), state: "ACTIVE", guardianId: "hd_carmen",
    } });
    await prisma.user.createMany({ data: [
      { id: "hd_admin", tenantId: T, clerkId: "hd_admin", email: "hd_admin@hd-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "hd_netmgr", tenantId: T, clerkId: "hd_netmgr", email: "hd_netmgr@hd-test.invalid", roles: ["NETWORK_MGR"] },
      { id: "hd_u_carmen", tenantId: T, clerkId: "hd_carmen", email: "hd_carmen@hd-test.invalid", roles: ["GUARDIAN"], guardianId: "hd_carmen" },
      { id: "hd_u_jordan", tenantId: T, clerkId: "hd_jordan", email: "hd_jordan@hd-test.invalid", roles: ["ATHLETE"], athleteId: "hd_jordan" },
    ] });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    luis = await request({ name: "Luis Reyes", email: "hd_luis@hd-test.invalid", phone: "555-0101" });
    pat = await request({ name: "Pat Reyes", email: "hd_pat@hd-test.invalid" });
    rae = await request({ name: "Rae Reyes", email: "hd_rae@hd-test.invalid" }, false);
    for (const id of [luis, pat]) {
      const r = await call("POST", `/guardian-handoffs/${id}/decision`, "hd_carmen", { decision: "HAND_OFF" });
      expect(r.json.state, r.text).toBe("HANDED_OFF");
    }
  });
  afterAll(async () => {
    server?.close();
    await clean();
  });

  it("BTG reads every request, one still being filled in too, with each tab's count and the desk's detail", async () => {
    const all = await call("GET", "/guardian-handoffs", "hd_admin");
    expect(all.status, all.text).toBe(200);
    expect(all.json.counts).toEqual({ WAITING_FOR_BTG: 2, IN_PROGRESS: 1, SWITCHED: 0, DECLINED: 0, CANCELLED: 0 });
    expect(all.json.handoffs.map((h: { id: string }) => h.id).sort()).toEqual([luis, pat, rae].sort());
    const l = all.json.handoffs.find((h: { id: string }) => h.id === luis);
    expect(l).toMatchObject({
      state: "HANDED_OFF", athlete: { name: "Jordan Reyes", sport: "Basketball" }, current: { name: "Carmen Reyes" }, requester: { name: "Luis Reyes", relationship: "Parent" },
      staff: {
        athlete: { id: "hd_jordan", age: 16, sport: "Basketball" },
        current: { id: "hd_carmen", relationship: "Parent" },
        newGuardian: null,
        requester: { email: "hd_luis@hd-test.invalid", phone: "555-0101", emailConfirmedAt: expect.any(String), agreementVersion: expect.stringContaining("GUARDIAN"), agreementAcceptedAt: expect.any(String) },
        handedOffAt: expect.any(String),
        decision: null,
      },
    });
    expect(l.staff.documents).toHaveLength(2);
    expect(l.staff.documents).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "GUARDIAN_ID", label: "Government ID", proof: null, filename: "luis-id.png", uploadedAt: expect.any(String) }),
      expect.objectContaining({ kind: "GUARDIANSHIP_PROOF", label: "Proof of guardianship", proof: "Birth certificate", filename: "birth-cert.pdf" }),
    ]));
    /* The new guardian's own request page reaches the desk too: REQUESTED, in progress. */
    expect((await call("GET", `/guardian-handoffs/${rae}`, "hd_admin")).json).toMatchObject({ state: "REQUESTED", staff: { requester: { email: "hd_rae@hd-test.invalid", emailConfirmedAt: null } } });
  });

  it("?group= picks one tab; an unknown group is refused", async () => {
    const waiting = await call("GET", "/guardian-handoffs?group=WAITING_FOR_BTG", "hd_admin");
    expect(waiting.json.handoffs.map((h: { id: string }) => h.id).sort()).toEqual([luis, pat].sort());
    expect(waiting.json.counts.IN_PROGRESS).toBe(1);
    expect((await call("GET", "/guardian-handoffs?group=IN_PROGRESS", "hd_admin")).json.handoffs.map((h: { id: string }) => h.id)).toEqual([rae]);
    expect((await call("GET", "/guardian-handoffs?group=EVERYTHING", "hd_admin")).status).toBe(400);
  });

  it("a guardian's and an athlete's answers are unchanged: no desk detail, no counts, nothing before it is sent", async () => {
    for (const who of ["hd_carmen", "hd_jordan"]) {
      const mine = await call("GET", "/guardian-handoffs", who);
      expect(mine.status, mine.text).toBe(200);
      expect(Object.keys(mine.json)).toEqual(["handoffs"]);
      expect(mine.json.handoffs.map((h: { id: string }) => h.id).sort()).toEqual([luis, pat].sort());
      for (const h of mine.json.handoffs) expect(h).not.toHaveProperty("staff");
      expect((await call("GET", "/guardian-handoffs?group=IN_PROGRESS", who)).json.handoffs).toEqual([]);
      const one = await call("GET", `/guardian-handoffs/${luis}`, who);
      expect(one.status).toBe(200);
      expect(one.json).not.toHaveProperty("staff");
      expect((await call("GET", `/guardian-handoffs/${rae}`, who)).status).toBe(403);
    }
  });

  it("the new guardian's documents open for BTG only, through a five-minute link that is recorded", async () => {
    const docs = await prisma.guardianHandoffDocument.findMany({ where: { tenantId: T, handoffId: luis }, select: { id: true } });
    const doc = docs[0]!.id;
    const link = await call("GET", `/guardian-handoffs/${luis}/documents/${doc}`, "hd_admin");
    expect(link.status, link.text).toBe(200);
    expect(link.json).toEqual({ url: expect.any(String), expiresInSeconds: 300 });
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "storage.privateDownloadGrant", entity: "GuardianHandoffDocument", entityId: doc, actorId: "hd_admin" } })).toBe(1);
    /* The current guardian reads the request, never the new guardian's ID; nor the athlete, nor a network manager. */
    for (const who of ["hd_carmen", "hd_jordan", "hd_netmgr"]) {
      expect((await call("GET", `/guardian-handoffs/${luis}/documents/${doc}`, who)).status, who).toBe(403);
    }
    /* A document of another request isn't reached through this one. */
    const other = (await prisma.guardianHandoffDocument.findFirstOrThrow({ where: { tenantId: T, handoffId: pat }, select: { id: true } })).id;
    expect((await call("GET", `/guardian-handoffs/${luis}/documents/${other}`, "hd_admin")).status).toBe(403);
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "storage.privateDownloadGrant", entityId: other } })).toBe(0);
  });

  it("the staff-confirm email links to the desk", async () => {
    const mail = (await emails()).find((m) => m.template === "handoff.staffConfirm")!;
    expect(mail.data.reviewUrl).toMatch(new RegExp(`/admin/guardian-handoffs/(${luis}|${pat})$`));
  });

  it("a staff decline and a staff-confirmed switch read back who decided; the switch cancels what was still open", async () => {
    const no = await call("POST", `/guardian-handoffs/${pat}/staff-decision`, "hd_admin", { decision: "DECLINE", note: "We need a clearer copy of the birth certificate." });
    expect(no.status, no.text).toBe(200);
    const yes = await call("POST", `/guardian-handoffs/${luis}/staff-decision`, "hd_admin", { decision: "CONFIRM" });
    expect(yes.status, yes.text).toBe(200);

    /* BTG's decline reaches the requester (found in review): its own email, with BTG's reason as
       written and the support address — not "Carmen declined", which she did not. */
    const mail = (await emails()).filter((m) => m.to === "hd_pat@hd-test.invalid" && m.template.startsWith("handoff.declined"));
    expect(mail.map((m) => m.template)).toEqual(["handoff.declinedByBtg"]);
    expect(mail[0]!.data).toMatchObject({ note: "We need a clearer copy of the birth certificate.", supportEmail: expect.any(String), name: "Pat" });
    const { EMAIL_TEMPLATES } = await import("../worker/jobs/send-email.mts");
    const text = EMAIL_TEMPLATES["handoff.declinedByBtg"]!(mail[0]!.data).text;
    expect(text).toContain("BTG looked at your request and declined it:\n\nWe need a clearer copy of the birth certificate.");
    expect(text).toContain(mail[0]!.data.supportEmail!);
    expect(text).not.toContain("Carmen declined");
    /* And it is on their status page: who declined, and the reason. */
    expect((await call("GET", pub(tokens.get(pat)!))).json).toMatchObject({ state: "DECLINED", declinedBy: "BTG", declineNote: "We need a clearer copy of the birth certificate." });

    const declined = (await call("GET", `/guardian-handoffs/${pat}`, "hd_admin")).json;
    expect(declined).toMatchObject({
      state: "DECLINED",
      staff: { handedOffAt: expect.any(String), decision: { by: "BTG", byEmail: "hd_admin@hd-test.invalid", at: expect.any(String), note: "We need a clearer copy of the birth certificate." } },
    });
    const switched = (await call("GET", `/guardian-handoffs/${luis}`, "hd_admin")).json;
    expect(switched).toMatchObject({
      state: "SWITCHED",
      staff: { handedOffAt: expect.any(String), newGuardian: { name: "Luis Reyes" }, decision: { by: "BTG", byEmail: "hd_admin@hd-test.invalid", at: switched.switchedAt } },
    });
    expect(Date.parse(switched.staff.handedOffAt)).toBeLessThan(Date.parse(switched.switchedAt));
    const cancelled = (await call("GET", `/guardian-handoffs/${rae}`, "hd_admin")).json;
    expect(cancelled).toMatchObject({ state: "CANCELLED", staff: { decision: { by: null } } });
    expect((await call("GET", "/guardian-handoffs", "hd_admin")).json.counts).toEqual({ WAITING_FOR_BTG: 0, IN_PROGRESS: 0, SWITCHED: 1, DECLINED: 1, CANCELLED: 1 });
  });
});
