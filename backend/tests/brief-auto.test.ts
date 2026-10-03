import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   P4-BE-11 — sponsor briefs approved automatically; BTG handles only the
   exceptions. Against a real database, through the API where a person would
   act (a sponsor filing and editing, BTG reading and moving) and the domain
   where the system does (the daily re-check, a second run).

   Each check, passing and failing: no package, budget below the package
   price, too few athletes (after conflicts), each sensitive category on the
   brief and on the sponsor, a sponsor on hold, readiness failing. An
   approved brief's campaign, its one Zoho push and its one sponsor email; a
   held brief's reasons and its one BTG email; the sweep; a race between a
   sponsor's edit and BTG's approve; the sponsor never seeing the reasons;
   and nothing across tenants.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@bau-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

type Submitted = { id: string; state: string; autoApproved: boolean; status: { key: string; text: string }; campaignId: string | null };

describe.skipIf(!hasDatabase)("P4-BE-11 · sponsor briefs approved automatically", async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { createBrief } = await import("../src/domain/brief");
  const { autoApproveOrHold, recheckHeldBriefs } = await import("../src/domain/brief-auto");
  const { SENSITIVE_CATEGORIES, SENSITIVE_CATEGORY_WORDS } = await import("../src/domain/brand-categories");
  const { SPONSOR_APPROVED, SPONSOR_REVIEWING } = await import("../src/domain/brief-auto-rules");
  type Actor = import("../src/auth/actor").Actor;

  const T = "bau_tenant_a";
  const OTHER = "bau_tenant_b";
  const DAY = 86_400_000;
  const inDays = (n: number) => new Date(Date.now() + n * DAY);
  const isoDay = (n: number) => inDays(n).toISOString().slice(0, 10);
  const OBJECTIVE = "Drive foot traffic to the new store during the back to school weeks";

  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  const call = async (method: string, path: string, who: string, body?: unknown) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: { "x-test-clerk": who, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, text, json: text ? JSON.parse(text) : null };
  };

  async function wipe() {
    const tables = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 6; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" IN ($1, $2)`, T, OTHER).catch(() => {});
      }
    }
    await prisma.tenant.deleteMany({ where: { id: { in: [T, OTHER] } } });
  }

  const p = (tenant: string, s: string) => `${tenant}_${s}`;
  const A = (s: string) => p(T, s);
  const B = (s: string) => p(OTHER, s);
  let athleteSeq = 0;
  async function athlete(tenant: string, extra: { stateCode?: string; restrictedCategories?: string[] } = {}) {
    const id = p(tenant, `ath${athleteSeq++}`);
    await prisma.athlete.create({ data: {
      id, tenantId: tenant, slug: id, legalName: `Bau Robin ${id}`, displayName: `Bau Robin ${id}`,
      sport: "Soccer", ageBand: "18_PLUS", state: "ACTIVE", stateCode: extra.stateCode ?? "CA",
      restrictedCategories: extra.restrictedCategories ?? [],
    } });
  }

  const SPONSORS = ["good", "rival", "rejected", "closed", "pending", ...SENSITIVE_CATEGORIES.map((c) => `sells_${c}`)];

  async function seed(tenant: string) {
    await prisma.tenant.create({ data: { id: tenant, name: `BAU ${tenant}` } });
    for (const s of SPONSORS) {
      const cat = s.startsWith("sells_") ? [s.slice("sells_".length)] : [];
      await prisma.sponsor.create({ data: { id: p(tenant, s), tenantId: tenant, name: `BAU ${s} ${tenant}`, categories: cat } });
      await prisma.user.create({ data: {
        id: p(tenant, `sa_${s}`), tenantId: tenant, clerkId: p(tenant, `sa_${s}`), email: `${p(tenant, `sa_${s}`)}@bau-test.invalid`,
        roles: ["SPONSOR_ADMIN"], sponsorId: p(tenant, s),
      } });
    }
    await prisma.inquiry.create({ data: {
      tenantId: tenant, lastName: "Rejected", email: `${p(tenant, "rej")}@bau-test.invalid`, source: "web-form", state: "REJECTED", sponsorId: p(tenant, "rejected"),
    } });
    await prisma.inquiry.create({ data: {
      tenantId: tenant, lastName: "Pending", email: `${p(tenant, "pend")}@bau-test.invalid`, source: "web-form", state: "NEW", sponsorId: p(tenant, "pending"),
    } });
    await prisma.accountClosure.create({ data: {
      tenantId: tenant, subjectKind: "SPONSOR", subjectId: p(tenant, "closed"), cause: "SELF", state: "CLOSED",
      retainUntil: inDays(30), contactEmail: `${p(tenant, "closed")}@bau-test.invalid`, displayName: "Closed",
    } });
    await prisma.nilJob.createMany({ data: [
      { id: p(tenant, "SX-01"), tenantId: tenant, name: "Story Drop", baseLow: 25, baseHigh: 50, sellLow: 75, sellHigh: 125, sellFloorEmerging: 70, sellFloorCreator: 88, sellFloorPremium: 105 },
    ] });
    await prisma.sponsorPackage.create({ data: {
      id: p(tenant, "blitz"), tenantId: tenant, code: "LOCAL_BLITZ", name: "Local Blitz", priceLow: 1_500, priceHigh: 2_400,
      athleteCountMin: 5, athleteCountMax: 9, lineItems: [],
    } });
    /* Six active soccer players: three in Texas, three in California; two of
       the Californians refuse apparel. */
    for (let i = 0; i < 3; i++) await athlete(tenant, { stateCode: "TX" });
    for (let i = 0; i < 3; i++) await athlete(tenant, { stateCode: "CA", restrictedCategories: i < 2 ? ["APPAREL"] : [] });
    for (const [id, role] of [["cm", "CAMPAIGN_MGR"], ["admin", "BTG_ADMIN"], ["sales", "SALES"]] as const) {
      await prisma.user.create({ data: { id: p(tenant, id), tenantId: tenant, clerkId: p(tenant, id), email: `${p(tenant, id)}@bau-test.invalid`, roles: [role] } });
    }
  }

  /** A valid brief from the good sponsor, every check passing. */
  const body = (tenant: string, extra: Record<string, unknown> = {}) => ({
    sponsorId: p(tenant, "good"), objective: OBJECTIVE, budget: 150_000, packageId: p(tenant, "blitz"),
    startDate: isoDay(10), endDate: isoDay(38), sports: ["Soccer"], stateCodes: [], categories: [],
    ...extra,
  });
  const fileAs = async (sponsor: string, extra: Record<string, unknown> = {}) => {
    const r = await call("POST", "/briefs", A(`sa_${sponsor}`), body(T, { sponsorId: A(sponsor), ...extra }));
    expect(r.status, r.text).toBe(201);
    return r.json as Submitted;
  };
  /** A sponsor whose login is off (rejected, closed) — the domain call, as their own admin. */
  const sponsorActor = (tenant: string, sponsor: string): Actor => ({
    userId: p(tenant, `sa_${sponsor}`), tenantId: tenant, roles: ["SPONSOR_ADMIN"], sponsorId: p(tenant, sponsor),
    athleteId: null, guardianId: null, propertyId: null,
  });
  const domainBody = (tenant: string, sponsor: string, extra: Record<string, unknown> = {}) => {
    const b = body(tenant, { sponsorId: p(tenant, sponsor), ...extra });
    return { ...b, startDate: new Date(b.startDate as string), endDate: new Date(b.endDate as string) } as never;
  };

  const row = (id: string) => prisma.campaignBrief.findUniqueOrThrow({
    where: { id }, select: { state: true, autoApproved: true, heldAt: true, heldKeys: true, heldReasons: true, campaign: { select: { id: true, name: true, tenantId: true } } },
  });
  const outbox = async (tenant: string, name: string) =>
    (await prisma.outboxJob.findMany({ where: { tenantId: tenant, name }, select: { payload: true }, orderBy: { createdAt: "asc" } }))
      .map((o) => o.payload as Record<string, unknown>);
  const emails = async (tenant: string, template: string) => (await outbox(tenant, "notify.email")).filter((e) => e.template === template);

  beforeAll(async () => {
    await wipe();
    await seed(T);
    await seed(OTHER);
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await wipe();
  });

  describe("every check passing: approved automatically", () => {
    let approved: Submitted;
    beforeAll(async () => {
      approved = await fileAs("good");
    });

    it("moves DRAFT → QUALIFIED → APPROVED → CAMPAIGN_CREATED, autoApproved, and tells the sponsor in safe words", async () => {
      expect(approved).toMatchObject({ state: "CAMPAIGN_CREATED", autoApproved: true, status: { key: "APPROVED", text: SPONSOR_APPROVED } });
      const r = await row(approved.id);
      expect(r).toMatchObject({ state: "CAMPAIGN_CREATED", autoApproved: true, heldAt: null, heldKeys: [], heldReasons: [] });
      expect(r.campaign).toMatchObject({ id: approved.campaignId, tenantId: T });
      expect(r.campaign!.name).toBe(`BAU good ${T} · Local Blitz`);
    });

    it("each move is the system's, audited — the same moves BTG makes by hand", async () => {
      const audits = await prisma.auditLog.findMany({
        where: { tenantId: T, entityId: { in: [approved.id, approved.campaignId!] } },
        select: { action: true, actorId: true, after: true }, orderBy: { at: "asc" },
      });
      expect(audits.map((a) => a.action)).toEqual(["brief.create", "brief.qualify", "brief.approve", "campaign.create", "brief.autoApprove"]);
      for (const a of audits.slice(1)) {
        expect(a.actorId).toBeNull();
        expect(a.after).toMatchObject({ automatic: true });
      }
      /* The qualification's CRM follow-up task, as BTG's qualify raises it. */
      expect(await prisma.syncTask.count({ where: { tenantId: T, briefId: approved.id, kind: "FOLLOW_UP" } })).toBe(1);
    });

    it("the Zoho Deal is queued once — on the campaign — never three times", async () => {
      const pushes = (await outbox(T, "zoho.pushDeal")).filter((j) => j.briefId === approved.id || j.campaignId === approved.campaignId);
      expect(pushes).toEqual([{ campaignId: approved.campaignId }]);
    });

    it("the sponsor's admin is emailed once; BTG isn't asked to do anything", async () => {
      const mail = (await emails(T, "brief.autoApproved")).filter((e) => String(e.idempotencyKey).includes(approved.id));
      expect(mail).toHaveLength(1);
      expect(mail[0]).toMatchObject({ to: `${A("sa_good")}@bau-test.invalid` });
      expect((await emails(T, "brief.heldForBtg")).filter((e) => String(e.idempotencyKey).includes(approved.id))).toEqual([]);
    });

    it("running it again approves nothing more; an edit after approval is refused and re-runs nothing", async () => {
      const again = await prisma.$transaction((tx) => autoApproveOrHold(tx, T, approved.id));
      expect(again).toEqual({ outcome: "SKIPPED", why: "the brief is CAMPAIGN_CREATED" });
      const edit = await call("PATCH", `/briefs/${approved.id}`, A("sa_good"), { budget: 200_000 });
      expect(edit.status).toBe(409);
      expect(await prisma.campaign.count({ where: { briefId: approved.id } })).toBe(1);
      expect((await emails(T, "brief.autoApproved")).filter((e) => String(e.idempotencyKey).includes(approved.id))).toHaveLength(1);
      expect((await prisma.campaignBrief.findUniqueOrThrow({ where: { id: approved.id }, select: { budget: true } })).budget).toBe(150_000);
    });

    it("BTG's desk shows it approved automatically", async () => {
      const one = await call("GET", `/briefs/${approved.id}`, A("cm"));
      expect(one.json).toMatchObject({ autoApproved: true, heldAt: null, heldReasons: [], state: "CAMPAIGN_CREATED" });
    });
  });

  describe("each check failing: held for BTG, with the reason in words", () => {
    const heldFor = async (s: Submitted) => {
      expect(s).toMatchObject({ state: "DRAFT", autoApproved: false, campaignId: null, status: { key: "REVIEWING", text: SPONSOR_REVIEWING } });
      return row(s.id);
    };

    it("no package — BTG prices custom requests", async () => {
      const r = await heldFor(await fileAs("good", { packageId: null }));
      expect(r.heldKeys).toEqual(["NO_PACKAGE"]);
      expect(r.heldReasons).toEqual(["No package — BTG prices custom requests"]);
    });

    it("budget below the package price", async () => {
      const r = await heldFor(await fileAs("good", { budget: 100_000 }));
      expect(r.heldKeys).toEqual(["BUDGET"]);
      expect(r.heldReasons).toEqual(["Budget $1,000 is below the Local Blitz price ($1,500)"]);
    });

    it("too few athletes: by targeting, and after conflicts with the brief's categories", async () => {
      const texas = await heldFor(await fileAs("good", { stateCodes: ["TX"] }));
      expect(texas.heldKeys).toEqual(["ATHLETES"]);
      expect(texas.heldReasons).toEqual(["Only 3 athletes fit; the package needs 5"]);
      /* Six fit, but two refuse apparel. */
      const apparel = await heldFor(await fileAs("good", { categories: ["APPAREL"] }));
      expect(apparel.heldReasons).toEqual(["Only 4 athletes fit; the package needs 5"]);
      const nobody = await heldFor(await fileAs("good", { sports: ["Curling"] }));
      expect(nobody.heldReasons).toEqual(["No athletes fit yet; the package needs 5"]);
    });

    it("too few athletes counts conflicts with the SPONSOR's categories too", async () => {
      await prisma.sponsor.update({ where: { id: A("rival") }, data: { categories: ["APPAREL"] } });
      const r = await heldFor(await fileAs("rival"));
      expect(r.heldReasons).toEqual(["Only 4 athletes fit; the package needs 5"]);
    });

    for (const c of SENSITIVE_CATEGORIES) {
      it(`sensitive category on the brief: ${c}`, async () => {
        const r = await heldFor(await fileAs("good", { categories: [c] }));
        expect(r.heldKeys).toEqual(["SENSITIVE"]);
        expect(r.heldReasons).toEqual([`${SENSITIVE_CATEGORY_WORDS[c]} is a sensitive category — BTG reviews these`]);
      });

      it(`sensitive category on the sponsor: ${c}`, async () => {
        const r = await heldFor(await fileAs(`sells_${c}`));
        expect(r.heldKeys).toEqual(["SENSITIVE"]);
        expect(r.heldReasons).toEqual([`The sponsor sells in ${SENSITIVE_CATEGORY_WORDS[c].toLowerCase()}, a sensitive category — BTG reviews these`]);
      });
    }

    it("a sponsor on hold: rejected by BTG, closed, or not yet approved", async () => {
      for (const [sponsor, reason] of [
        ["rejected", "Sponsor's account was rejected by BTG"],
        ["closed", "Sponsor's account is closed"],
        ["pending", "Sponsor isn't approved yet"],
      ] as const) {
        const s = await createBrief(sponsorActor(T, sponsor), domainBody(T, sponsor));
        const r = await heldFor(s as Submitted);
        expect(r.heldKeys).toEqual(["SPONSOR"]);
        expect(r.heldReasons).toEqual([reason]);
      }
    });

    it("readiness failing: a placeholder objective, a start in the past", async () => {
      const short = await heldFor(await fileAs("good", { objective: "More sales please" }));
      expect(short.heldKeys).toEqual(["OBJECTIVE"]);
      expect(short.heldReasons).toEqual(["Objective is too short — 3 words, at least 8 needed"]);
      const past = await heldFor(await fileAs("good", { startDate: isoDay(-2), endDate: isoDay(26) }));
      expect(past.heldKeys).toEqual(["DATES"]);
      expect(past.heldReasons[0]).toMatch(/isn't in the future/);
    });

    it("several failures: every reason, in a fixed order", async () => {
      const r = await heldFor(await fileAs("good", { packageId: null, categories: ["GAMBLING"], objective: "More sales please" }));
      expect(r.heldKeys).toEqual(["OBJECTIVE", "NO_PACKAGE", "SENSITIVE"]);
    });
  });

  describe("a held brief", () => {
    let held: Submitted;
    beforeAll(async () => {
      held = await fileAs("good", { packageId: null });
    });

    it("BTG's campaign managers are emailed once, with the reasons — and not again when it is re-checked or edited", async () => {
      const mine = async () => (await emails(T, "brief.heldForBtg")).filter((e) => String(e.idempotencyKey).includes(held.id));
      expect(await mine()).toHaveLength(1);
      expect((await mine())[0]).toMatchObject({ to: `${A("cm")}@bau-test.invalid`, data: { reasons: "• No package — BTG prices custom requests" } });

      await prisma.$transaction((tx) => autoApproveOrHold(tx, T, held.id, new Date(), "sweep"));
      /* Edited, still failing — for a different reason now: the hold's reasons follow, the email doesn't repeat. */
      const edit = await call("PATCH", `/briefs/${held.id}`, A("sa_good"), { packageId: A("blitz"), budget: 100_000 });
      expect(edit.status, edit.text).toBe(200);
      expect(edit.json).toMatchObject({ state: "DRAFT", autoApproved: false, status: { key: "REVIEWING" } });
      expect((await row(held.id)).heldReasons).toEqual(["Budget $1,000 is below the Local Blitz price ($1,500)"]);
      expect(await mine()).toHaveLength(1);
    });

    it("the sponsor never sees why: not on the brief, not in the list, not in what they were answered", async () => {
      for (const path of [`/briefs/${held.id}`, "/briefs", "/briefs?page=1&size=50"]) {
        const r = await call("GET", path, A("sa_good"));
        expect(r.status).toBe(200);
        expect(r.text).not.toContain("heldReasons");
        expect(r.text).not.toContain("heldAt");
        expect(r.text).not.toMatch(/below the Local Blitz price|BTG prices custom requests|sensitive category|athletes fit/);
      }
      const one = await call("GET", `/briefs/${held.id}`, A("sa_good"));
      expect(one.json).toMatchObject({ autoApproved: false, status: { key: "REVIEWING", text: SPONSOR_REVIEWING } });
      /* ?held=true finds a sponsor nothing — it can't be used to tell held from not. */
      expect((await call("GET", "/briefs?held=true", A("sa_good"))).json.briefs).toEqual([]);
      /* BTG sees them. */
      const btg = await call("GET", `/briefs/${held.id}`, A("cm"));
      expect(btg.json.heldReasons).toEqual(["Budget $1,000 is below the Local Blitz price ($1,500)"]);
      expect(btg.json.heldAt).toEqual(expect.any(String));
    });

    it("?held=true lists BTG's held DRAFT briefs, paged and unpaged", async () => {
      const unpaged = (await call("GET", "/briefs?held=true", A("cm"))).json.briefs as { id: string; state: string }[];
      expect(unpaged.map((b) => b.id)).toContain(held.id);
      expect(unpaged.every((b) => b.state === "DRAFT")).toBe(true);
      const paged = await call("GET", "/briefs?held=true&page=1&size=100", A("cm"));
      expect((paged.json.briefs as { id: string }[]).map((b) => b.id)).toContain(held.id);
    });

    it("an edit that clears every failure approves it automatically", async () => {
      const edit = await call("PATCH", `/briefs/${held.id}`, A("sa_good"), { budget: 150_000 });
      expect(edit.json).toMatchObject({ state: "CAMPAIGN_CREATED", autoApproved: true, status: { key: "APPROVED" } });
      expect(await row(held.id)).toMatchObject({ autoApproved: true, heldAt: null, heldReasons: [] });
    });

    it("every BTG desk role reads the reasons — sales too", async () => {
      const h = await fileAs("good", { packageId: null });
      for (const who of ["cm", "admin", "sales"]) {
        expect((await call("GET", `/briefs/${h.id}`, A(who))).json.heldReasons).toEqual(["No package — BTG prices custom requests"]);
      }
    });

    it("BTG fixing a held brief lets it through; a brief BTG filed and edits stays BTG's to qualify", async () => {
      const h = await fileAs("good", { packageId: null });
      const fixed = await call("PATCH", `/briefs/${h.id}`, A("cm"), { packageId: A("blitz") });
      expect(fixed.json).toMatchObject({ state: "CAMPAIGN_CREATED", autoApproved: true });

      const own = (await call("POST", "/briefs", A("cm"), body(T, { packageId: null }))).json as Submitted;
      expect(await row(own.id)).toMatchObject({ state: "DRAFT", heldAt: null });
      const edited = await call("PATCH", `/briefs/${own.id}`, A("cm"), { packageId: A("blitz") });
      expect(edited.json).toMatchObject({ state: "DRAFT", autoApproved: false });
      expect(await row(own.id)).toMatchObject({ state: "DRAFT", heldAt: null, heldKeys: [] });
    });

    it("a package taken off sale is held for BTG to price", async () => {
      await prisma.sponsorPackage.create({ data: {
        id: A("retired"), tenantId: T, code: "RETIRED", name: "Retired Pack", priceLow: 1_000, priceHigh: 1_000,
        athleteCountMin: 1, athleteCountMax: 3, lineItems: [], active: false,
      } });
      const r = await row((await fileAs("good", { packageId: A("retired") })).id);
      expect(r).toMatchObject({ state: "DRAFT", heldKeys: ["NO_PACKAGE"], heldReasons: ["The Retired Pack package is no longer offered — BTG prices this request"] });
    });

    it("BTG's manual qualify and approve still work on a held brief, unchanged", async () => {
      const h = await fileAs("good", { categories: ["ALCOHOL"] });
      expect((await call("POST", `/briefs/${h.id}/transition`, A("cm"), { to: "QUALIFIED" })).status).toBe(200);
      expect((await call("POST", `/briefs/${h.id}/transition`, A("cm"), { to: "APPROVED" })).status).toBe(200);
      const r = await row(h.id);
      expect(r).toMatchObject({ state: "APPROVED", autoApproved: false });
      /* Kept as the record of why it waited. */
      expect(r.heldReasons).toEqual(["Alcohol is a sensitive category — BTG reviews these"]);
      const pushes = (await outbox(T, "zoho.pushDeal")).filter((j) => j.briefId === h.id);
      expect(pushes).toHaveLength(2);
      /* The sponsor now reads it approved. */
      expect((await call("GET", `/briefs/${h.id}`, A("sa_good"))).json.status.key).toBe("APPROVED");
      /* And a sponsor can't edit it once BTG has it. */
      expect((await call("PATCH", `/briefs/${h.id}`, A("sa_good"), { budget: 1 })).status).toBe(409);
    });
  });

  describe("the daily re-check", () => {
    it("approves a brief once enough athletes join — once — and only in the tenants it is given", async () => {
      const mine = await fileAs("good", { stateCodes: ["NV"] });
      const theirs = (await call("POST", "/briefs", B("sa_good"), body(OTHER, { stateCodes: ["NV"] }))).json as Submitted;
      expect((await row(mine.id)).heldKeys).toEqual(["ATHLETES"]);
      expect((await row(theirs.id)).heldKeys).toEqual(["ATHLETES"]);

      /* Nobody new yet: still held, nothing written. */
      const quiet = await recheckHeldBriefs(new Date(), { tenantIds: [T] });
      expect(quiet.failed).toBe(0);
      expect((await row(mine.id)).state).toBe("DRAFT");

      for (let i = 0; i < 5; i++) await athlete(T, { stateCode: "NV" });
      for (let i = 0; i < 5; i++) await athlete(OTHER, { stateCode: "NV" });

      await recheckHeldBriefs(new Date(), { tenantIds: [T] });
      expect(await row(mine.id)).toMatchObject({ state: "CAMPAIGN_CREATED", autoApproved: true });
      /* The other tenant's brief wasn't in this pass. */
      expect(await row(theirs.id)).toMatchObject({ state: "DRAFT", autoApproved: false });

      await recheckHeldBriefs(new Date(), { tenantIds: [T] });
      expect(await prisma.campaign.count({ where: { briefId: mine.id } })).toBe(1);
      expect((await emails(T, "brief.autoApproved")).filter((e) => String(e.idempotencyKey).includes(mine.id))).toHaveLength(1);

      /* Its own pass approves it, in its own tenant. */
      await recheckHeldBriefs(new Date(), { tenantIds: [OTHER] });
      expect((await row(theirs.id)).campaign).toMatchObject({ tenantId: OTHER });
    });

    it("leaves briefs held for anything besides athletes alone", async () => {
      const s = await fileAs("good", { stateCodes: ["WA"], categories: ["CANNABIS"] });
      for (let i = 0; i < 5; i++) await athlete(T, { stateCode: "WA" });
      await recheckHeldBriefs(new Date(), { tenantIds: [T] });
      expect(await row(s.id)).toMatchObject({ state: "DRAFT", heldKeys: ["ATHLETES", "SENSITIVE"] });
    });
  });

  describe("safety", () => {
    /** A brief BTG filed: DRAFT, every check passing, not evaluated on create. */
    const btgBrief = async () => {
      const r = await call("POST", "/briefs", A("cm"), body(T));
      expect(r.status, r.text).toBe(201);
      expect(r.json).toMatchObject({ state: "DRAFT", autoApproved: false });
      return r.json as Submitted;
    };

    it("two runs at once approve once", async () => {
      const b = await btgBrief();
      const runs = await Promise.all([1, 2, 3].map(() => prisma.$transaction((tx) => autoApproveOrHold(tx, T, b.id))));
      expect(runs.filter((r) => r.outcome === "APPROVED")).toHaveLength(1);
      expect(await prisma.campaign.count({ where: { briefId: b.id } })).toBe(1);
      expect((await outbox(T, "zoho.pushDeal")).filter((j) => j.campaignId && j.campaignId === (runs.find((r) => r.outcome === "APPROVED") as { campaignId: string }).campaignId)).toHaveLength(1);
    });

    it("a sponsor's edit racing BTG's manual qualify gives one result", async () => {
      for (let i = 0; i < 4; i++) {
        const h = await fileAs("good", { packageId: null });
        const [edit, qualify] = await Promise.all([
          call("PATCH", `/briefs/${h.id}`, A("sa_good"), { packageId: A("blitz") }),
          call("POST", `/briefs/${h.id}/transition`, A("cm"), { to: "QUALIFIED" }),
        ]);
        const r = await row(h.id);
        if (edit.status === 200) {
          /* The edit went first and approved it; BTG's qualify found it moved on. */
          expect(qualify.status).toBe(409);
          expect(r).toMatchObject({ state: "CAMPAIGN_CREATED", autoApproved: true });
        } else {
          /* BTG went first; the edit found it no longer DRAFT. */
          expect(edit.status).toBe(409);
          expect(qualify.status).toBe(200);
          expect(r).toMatchObject({ state: "QUALIFIED", autoApproved: false });
        }
        expect(await prisma.campaign.count({ where: { briefId: h.id } })).toBe(r.state === "CAMPAIGN_CREATED" ? 1 : 0);
      }
    });

    it("BTG's approve racing the automatic approval gives one result", async () => {
      const b = await btgBrief();
      expect((await call("POST", `/briefs/${b.id}/transition`, A("cm"), { to: "QUALIFIED" })).status).toBe(200);
      /* QUALIFIED: the automatic path leaves it to BTG. */
      expect(await prisma.$transaction((tx) => autoApproveOrHold(tx, T, b.id))).toEqual({ outcome: "SKIPPED", why: "the brief is QUALIFIED" });
    });

    it("a package from another tenant is refused", async () => {
      const r = await call("POST", "/briefs", A("sa_good"), body(T, { packageId: B("blitz") }));
      expect(r.status).toBe(422);
    });
  });

  describe("never across tenants", () => {
    it("another tenant can't read, edit or move a brief, or see its holds", async () => {
      const h = await fileAs("good", { packageId: null });
      expect((await call("GET", `/briefs/${h.id}`, B("cm"))).status).toBe(403);
      expect((await call("PATCH", `/briefs/${h.id}`, B("sa_good"), { packageId: B("blitz") })).status).toBe(403);
      expect((await call("PATCH", `/briefs/${h.id}`, B("cm"), { packageId: B("blitz") })).status).toBe(403);
      expect((await call("POST", `/briefs/${h.id}/transition`, B("cm"), { to: "QUALIFIED" })).status).toBe(403);
      const theirs = (await call("GET", "/briefs?held=true", B("cm"))).json.briefs as { id: string }[];
      expect(theirs.map((b) => b.id)).not.toContain(h.id);
      const tenantsOfTheirs = await prisma.campaignBrief.findMany({ where: { id: { in: theirs.map((b) => b.id) } }, select: { tenantId: true } });
      expect(tenantsOfTheirs.every((b) => b.tenantId === OTHER)).toBe(true);
      expect(await row(h.id)).toMatchObject({ state: "DRAFT", heldKeys: ["NO_PACKAGE"] });
    });

    it("the system never touches a brief outside the tenant it is given", async () => {
      const b = (await call("POST", "/briefs", A("cm"), body(T))).json as Submitted;
      expect(await prisma.$transaction((tx) => autoApproveOrHold(tx, OTHER, b.id))).toEqual({ outcome: "SKIPPED", why: "no such brief in this tenant" });
      expect(await row(b.id)).toMatchObject({ state: "DRAFT", autoApproved: false });
    });

    it("a sponsor can't file for, or edit, another sponsor's brief", async () => {
      const r = await call("POST", "/briefs", A("sa_rival"), body(T));
      expect(r.status).toBe(403);
      const h = await fileAs("good", { packageId: null });
      expect((await call("PATCH", `/briefs/${h.id}`, A("sa_rival"), { packageId: A("blitz") })).status).toBe(403);
      expect((await row(h.id)).state).toBe("DRAFT");
    });
  });
});
