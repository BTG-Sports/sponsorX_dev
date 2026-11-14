import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   POL-BE-43 — the help desk form, against the real API and database.
   Done when:

     each topic shows only the person's cases; ticking cases with no text
     submits; "Other" without text is refused; the message reaches the inbox
     labelled with its cases; the existing contact-form tests still pass.

   (The existing contact-form tests are phase2-support.test.ts, unchanged.
   The case list itself is helpdesk-cases.test.ts.)
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
process.env.PUBLIC_INTAKE_TENANT_ID = "hdf_btg";
process.env.SUPPORT_EMAIL = "help@hd-support.invalid";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
/* Signed in = the x-test-clerk header. A Bearer token with no identity behind it is an expired session. */
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@hd-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("POL-BE-43 · the help desk form: tick a case", { timeout: 90_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");

  const T = "hdf_btg";
  const ADMIN = "hdf_admin", ATHLETE = "hdf_athlete", SPONSOR = "hdf_sponsor", NOBODY = "hdf_no_account";
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";

  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };
  /* The portal sends its session as a Bearer token; the mock reads who it is from x-test-clerk. */
  const signedIn = (who: string) => ({ "x-test-clerk": who, authorization: `Bearer session-of-${who}` });
  const form = (extra: Record<string, unknown>) => ({ name: "Sam Tester", email: "sam@hd-test.invalid", ...extra });
  const caseIds = (topics: { sections: { cases: { id: string }[] }[] }[]) => topics.flatMap((t) => t.sections.flatMap((s) => s.cases.map((c) => c.id)));
  const jobs = async (id: string) => (await prisma.outboxJob.findMany({ where: { tenantId: T, name: "notify.email" }, select: { payload: true } }))
    .map((j) => j.payload as { template: string; idempotencyKey: string; data: Record<string, string> })
    .filter((p) => p.idempotencyKey.endsWith(`:${id}`));

  async function clean() {
    for (const t of ["SupportAttachment", "SupportMessage", "OutboxJob", "AuditLog", "User"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => {});
    }
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "Help desk BTG" } });
    for (const [id, role] of [[ADMIN, "BTG_ADMIN"], [ATHLETE, "ATHLETE"], [SPONSOR, "SPONSOR_ADMIN"]] as const) {
      await prisma.user.create({ data: { id, tenantId: T, clerkId: id, email: `${id}@hd-test.invalid`, roles: [role] } });
    }
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise((r) => server?.close(r));
    await clean();
  });

  it("each topic shows only the person's cases: a visitor the public ones, an athlete and a sponsor their own", async () => {
    const v = await call("GET", "/public/support/cases");
    expect(v.status).toBe(200);
    expect(v.json.signedIn).toBe(false);
    expect(v.json.topics.map((t: { key: string; label: string }) => [t.key, t.label])).toEqual([
      ["ACCOUNT", "Account"], ["PAYMENT", "Payment"], ["GUARDIANSHIP", "Guardianship"], ["CAMPAIGNS", "Campaigns"],
      ["SHOP", "Shop"], ["REWARDS", "Rewards"], ["NEXT", "NEXT"], ["OTHER", "Other"],
    ]);
    const visitor = caseIds(v.json.topics);
    expect(visitor).toEqual(expect.arrayContaining(["ACC-04", "ACC-30", "OTH-01"]));
    expect(visitor).not.toContain("ACC-01");

    const a = await call("GET", "/public/support/cases?topic=ACCOUNT", undefined, signedIn(ATHLETE));
    expect(a.json.signedIn).toBe(true);
    expect(a.json.topics).toHaveLength(1);
    expect(a.json.topics[0].sections[0]).toMatchObject({ title: "Signing up" });
    expect(a.json.topics[0].sections[0].cases[0]).toEqual({ id: "ACC-01", text: "My application is locked and I can't edit it" });
    expect(caseIds(a.json.topics)).not.toContain("ACC-13");

    const s = await call("GET", "/public/support/cases?topic=ACCOUNT", undefined, signedIn(SPONSOR));
    expect(caseIds(s.json.topics)).toContain("ACC-13");
    expect(caseIds(s.json.topics)).not.toContain("ACC-01");
  });

  it("an expired session is told to sign in again, not shown the visitor's cases", async () => {
    const expired = { authorization: "Bearer expired-session-token" };
    expect((await call("GET", "/public/support/cases", undefined, expired)).status).toBe(401);
    expect((await call("POST", "/public/support/messages", form({ topic: "ACCOUNT", cases: ["ACC-30"] }), expired)).status).toBe(401);
  });

  it("ticking cases with no text submits; signed in, it is linked to the account; the emails carry the cases", async () => {
    const r = await call("POST", "/public/support/messages", form({ topic: "ACCOUNT", cases: ["ACC-01", "ACC-30", "ACC-30"] }), signedIn(ATHLETE));
    expect(r.status, r.text).toBe(201);
    expect(r.json.queued).toBe(true);
    const row = await prisma.supportMessage.findUniqueOrThrow({ where: { id: r.json.id }, select: { caseIds: true, message: true, userId: true, state: true } });
    expect(row).toEqual({ caseIds: ["ACC-01", "ACC-30"], message: "", userId: ATHLETE, state: "QUEUED" });

    const sent = await jobs(r.json.id);
    const n = sent.find((j) => j.template === "support.message")!.data;
    expect(n).toMatchObject({ cases: "ACC-01, ACC-30", signedIn: "yes" });
    const c = sent.find((j) => j.template === "support.copy")!.data;
    expect(c.ticked).toBe("- My application is locked and I can't edit it\n- I didn't get the confirmation email");

    const { EMAIL_TEMPLATES } = await import("../worker/jobs/send-email.mts");
    expect(EMAIL_TEMPLATES["support.message"]!(n).text).toContain("Cases ticked: ACC-01, ACC-30\nSent while signed in to SponsorX");
    expect(EMAIL_TEMPLATES["support.copy"]!(c).text).toContain("What you ticked:\n- My application is locked and I can't edit it");
  });

  it("\"Something else\" without text is refused; with text it is sent, under any topic", async () => {
    const bare = await call("POST", "/public/support/messages", form({ topic: "PAYMENT", cases: ["OTH-01"] }));
    expect(bare.status).toBe(422);
    expect(bare.json.error.message).toMatch(/Something else/);
    const blank = await call("POST", "/public/support/messages", form({ topic: "OTHER", cases: ["OTH-01"], message: "   " }));
    expect(blank.status).toBe(422);
    const ok = await call("POST", "/public/support/messages", form({ topic: "PAYMENT", cases: ["OTH-01"], message: "My receipt shows the wrong company name." }));
    expect(ok.status, ok.text).toBe(201);
  });

  it("nothing ticked needs the text, as the form always did; nothing at all is refused", async () => {
    expect((await call("POST", "/public/support/messages", form({ topic: "ACCOUNT" }))).status).toBe(422);
    const text = await call("POST", "/public/support/messages", form({ topic: "GUARDIANSHIP", message: "Carmen declined my request." }));
    expect(text.status, text.text).toBe(201);
    expect(await prisma.supportMessage.findUniqueOrThrow({ where: { id: text.json.id }, select: { caseIds: true, userId: true } })).toEqual({ caseIds: [], userId: null });
  });

  it("a case that isn't the person's, isn't on the topic or doesn't exist is refused by name", async () => {
    const refused = async (body: Record<string, unknown>, headers?: Record<string, string>) => {
      const r = await call("POST", "/public/support/messages", form(body), headers);
      expect(r.status, r.text).toBe(422);
      return r.json.error.message as string;
    };
    expect(await refused({ topic: "ACCOUNT", cases: ["ACC-01"] })).toBe("ACC-01 is only for signed-in accounts. Sign in to choose it.");
    expect(await refused({ topic: "ACCOUNT", cases: ["ACC-13"] }, signedIn(ATHLETE))).toBe("ACC-13 isn't a case for your account.");
    expect(await refused({ topic: "ACCOUNT", cases: ["PAY-02"] })).toBe("PAY-02 isn't under Account.");
    expect(await refused({ topic: "ACCOUNT", cases: ["ACC-99"] })).toBe("ACC-99 isn't one of the help desk's cases.");
    expect((await call("POST", "/public/support/messages", form({ topic: "ACCOUNT", cases: ["not a case"] }))).status).toBe(400);
  });

  it("signed in without a SponsorX account (who most needs the desk) uses it as a visitor", async () => {
    const cases = await call("GET", "/public/support/cases", undefined, signedIn(NOBODY));
    expect(cases.json.signedIn).toBe(false);
    const r = await call("POST", "/public/support/messages", form({ topic: "ACCOUNT", cases: ["ACC-30"] }), signedIn(NOBODY));
    expect(r.status, r.text).toBe(201);
    expect((await prisma.supportMessage.findUniqueOrThrow({ where: { id: r.json.id }, select: { userId: true } })).userId).toBeNull();
  });

  it("the message reaches the inbox labelled with its cases; the inbox filters by case and by topic", async () => {
    const admin = signedIn(ADMIN);
    const byCase = await call("GET", "/support-messages?case=ACC-30", undefined, admin);
    expect(byCase.status, byCase.text).toBe(200);
    expect(byCase.json.messages.length).toBe(2); // the athlete's and the visitor-without-an-account's
    for (const m of byCase.json.messages) expect(m.cases.map((c: { id: string }) => c.id)).toContain("ACC-30");
    expect(byCase.json.counts.NEW).toBe(2);
    const athletes = byCase.json.messages.find((m: { signedIn: boolean }) => m.signedIn);
    expect(athletes.cases).toEqual([
      { id: "ACC-01", topic: "ACCOUNT", text: "My application is locked and I can't edit it", retired: false },
      { id: "ACC-30", topic: "ACCOUNT", text: "I didn't get the confirmation email", retired: false },
    ]);

    const payments = await call("GET", "/support-messages?topic=PAYMENT", undefined, admin);
    expect(payments.json.messages.map((m: { cases: { id: string }[] }) => m.cases.map((c) => c.id))).toEqual([["OTH-01"]]);

    const page = await call("GET", `/support-messages/${athletes.id}`, undefined, admin);
    expect(page.json).toMatchObject({ message: "", account: { id: ATHLETE, roles: ["ATHLETE"] } });
    expect(page.json.cases.map((c: { id: string }) => c.id)).toEqual(["ACC-01", "ACC-30"]);
    expect((await call("GET", "/support-messages?case=ACC-13", undefined, admin)).json.messages).toEqual([]);
  });
});
