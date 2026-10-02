import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   2S3-BE-06 — listings publish automatically; BTG handles the exceptions,
   against the real API and database (programme owner, 2026-10-02):

     On submit every check BTG's approval runs is run; a failure refuses the
     submit (422 with the problems). Passing, the listing goes straight to
     PUBLISHED (from its publish date) unless it is flagged — restricted
     words, or the seller's standing — when it waits in PENDING_APPROVAL with
     its reasons. The seller is told either way; BTG's admins are emailed per
     held listing, and once a day get one summary of what went live on its
     own. BTG approves / sends back / rejects held listings and can pause or
     end any live one with a reason the seller is emailed; a BTG pause is
     BTG's to lift.

   The cast: the Lakeside Larks (a team BTG approved) and their manager;
   Morgan, on the Larks' roster; Quinn Avery, an athlete with no team.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@lap-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("2S3-BE-06 · listings publish automatically; BTG handles the exceptions", { timeout: 90_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { decideOnboarding } = await import("../src/domain/onboarding");
  const { sendListingDigests, transitionListing } = await import("../src/domain/listing");
  const { sellerHold, standingReasons } = await import("../src/domain/listing-rules");

  const T = "lap_btg";
  const X = "lap_other";
  const E = { tenant: "", property: "", morgan: "", morganItem: "" };
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
  const at = (days: number) => new Date(Date.now() + days * 864e5);
  type Mail = { template: string; to: string; data: Record<string, string>; idempotencyKey: string };
  /** The emails queued about one listing (by its link or title), in order. */
  const mails = async (match: (m: Mail) => boolean) =>
    (await prisma.outboxJob.findMany({ where: { name: "notify.email", tenantId: { in: await tenantsInPlay() } }, select: { payload: true }, orderBy: { createdAt: "asc" } }))
      .map((r) => r.payload as unknown as Mail).filter(match);
  const about = (id: string, title: string) => (m: Mail) => JSON.stringify(m.data).includes(id) || m.data.title === title;

  async function tenantsInPlay() {
    const outside = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM "Tenant" WHERE "operatorTenantId" = $1
       UNION SELECT "tenantId" FROM "User" WHERE email LIKE 'lap\\_%@lap-test.invalid' AND "tenantId" NOT IN ($1, $2)`, T, X,
    );
    return [T, X, ...outside.map((r) => r.id)];
  }
  async function clean() {
    const ids = await tenantsInPlay();
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 7; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = ANY($1::text[])`, ids).catch(() => {});
      }
    }
    await prisma.tenant.updateMany({ where: { id: { in: ids } }, data: { operatorTenantId: null } });
    await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
  }

  /** The manager lists a new team item; returns the listing id. */
  async function teamListing(title: string, description = "A courtside banner for every home game this season.", extra: Record<string, unknown> = {}) {
    const item = await call("POST", "/inventory", "lap_mgr", { title, kind: "SIGNAGE", priceCents: 25_000, quantity: 5 });
    expect(item.status, item.text).toBe(201);
    const made = await call("POST", "/listings", "lap_mgr", { inventoryItemId: item.json.id, title, description, ...extra });
    expect(made.status, made.text).toBe(201);
    return made.json.id as string;
  }
  async function quinnListing(title: string, description = "A 60-minute skills clinic at your venue, up to 12 kids.") {
    const item = await call("POST", "/inventory", "lap_quinn", { title, kind: "CAMP", priceCents: 30_000, quantity: 3 });
    expect(item.status, item.text).toBe(201);
    const made = await call("POST", "/listings", "lap_quinn", { inventoryItemId: item.json.id, title, description });
    expect(made.status, made.text).toBe(201);
    return made.json.id as string;
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.createMany({ data: [{ id: T, name: "Auto-publish BTG" }, { id: X, name: "Auto-publish elsewhere" }] });
    await prisma.guardian.create({ data: { id: "lap_guardian", tenantId: T, legalName: "Robin Avery", email: "lap_guardian@lap-test.invalid", relationship: "PARENT", verifiedAt: new Date() } });
    await prisma.athlete.create({ data: {
      id: "lap_ath_quinn", tenantId: T, slug: "lap-ath-quinn", legalName: "Quinn Avery", displayName: "QUINN.AVERY", email: "lap_quinn@lap-test.invalid",
      sport: "Soccer", stateCode: "VA", ageBand: "18_PLUS", state: "APPROVED",
    } });
    await prisma.user.createMany({ data: [
      { id: "lap_admin", tenantId: T, clerkId: "lap_admin", email: "lap_admin@lap-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "lap_x_admin", tenantId: X, clerkId: "lap_x_admin", email: "lap_x_admin@lap-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "lap_quinn", tenantId: T, clerkId: "lap_quinn", email: "lap_quinn@lap-test.invalid", roles: ["ATHLETE"], athleteId: "lap_ath_quinn" },
      { id: "lap_guardian_login", tenantId: T, clerkId: "lap_guardian_login", email: "lap_guardian@lap-test.invalid", roles: ["GUARDIAN"], guardianId: "lap_guardian" },
    ] });
    await prisma.propertyOnboarding.create({ data: {
      id: "lap_onb", tenantId: T, orgType: "TEAM", orgName: "Lakeside Larks LAP", stateCode: "MD", state: "PENDING_REVIEW",
      contacts: [{ name: "Casey Moore", email: "lap_mgr@lap-test.invalid", phone: "301-555-0101", role: "General manager", primary: true }],
      details: { legalEntityName: "Lakeside Larks LAP LLC", league: "MD Amateur", sport: "Soccer" },
      payoutAcknowledgedAt: new Date(), termsAcceptedAt: new Date(), submittedAt: new Date(),
    } });
    const approved = await decideOnboarding({ userId: "lap_admin", tenantId: T, roles: ["BTG_ADMIN"], sponsorId: null, athleteId: null, guardianId: null, propertyId: null }, "lap_onb", "APPROVE");
    const p = await prisma.property.findUniqueOrThrow({ where: { id: approved.propertyId! }, select: { id: true, tenantId: true } });
    Object.assign(E, { tenant: p.tenantId, property: p.id });

    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await call("GET", "/me", "lap_mgr");
    const morgan = await call("POST", "/team/roster", "lap_mgr", { legalName: "Morgan Diaz", displayName: "MORGAN.DIAZ", email: "lap_morgan@lap-test.invalid", sport: "Soccer", ageBand: "18_PLUS", teamShareBps: 2000 });
    expect(morgan.status, morgan.text).toBe(201);
    E.morgan = morgan.json.id;
    const item = await call("POST", "/inventory", "lap_morgan", { title: "Morgan's camp", kind: "CAMP", priceCents: 40_000, quantity: 3 });
    expect(item.status, item.text).toBe(201);
    E.morganItem = item.json.id;
  });

  afterAll(async () => {
    server?.close();
    await clean();
  });

  describe("the rules (pure)", () => {
    it("standing: an organisation flagged, payouts held, the coming-of-age pause, a minor without a verified guardian", () => {
      expect(standingReasons({ property: { payoutsHeldAt: null, onboarding: { flags: [], flaggedAt: null } } })).toEqual([]);
      expect(standingReasons({ property: { onboarding: { flags: ["Document missing after an update: Business registration"], flaggedAt: new Date() } } }))
        .toEqual(["Organisation flagged: Document missing after an update: Business registration"]);
      expect(standingReasons({ property: { payoutsHeldAt: new Date() } })).toEqual(["Organisation: payouts are on hold"]);
      expect(standingReasons({ sellerAthlete: { comingOfAgeStartedAt: new Date() } })).toEqual([expect.stringMatching(/coming-of-age pause/)]);
      expect(standingReasons({ itemAthlete: { displayName: "KIT", ageBand: "16_17", guardian: { verifiedAt: null } } })).toEqual(["Item's athlete (KIT): a minor whose guardian isn't verified yet"]);
      expect(standingReasons({ itemAthlete: { ageBand: "16_17", guardian: { verifiedAt: new Date() } } })).toEqual([]);
    });

    it("the seller is told the restricted words in full, and anything else only as an account check", () => {
      const held = { state: "PENDING_APPROVAL", heldWords: ["poker"], reviewReasons: ['Restricted words: "poker"', "Organisation flagged: x"] };
      expect(sellerHold(held)).toMatchObject({ restrictedWords: ["poker"], accountCheck: true, pausedByBtg: false });
      expect(sellerHold(held)!.message).toMatch(/BTG is taking a look — we'll email you\. Restricted words: "poker"\..*BTG is checking your account\./);
      expect(sellerHold(held)!.message).not.toMatch(/Organisation flagged/);
      expect(sellerHold({ ...held, state: "PUBLISHED" })).toBeNull();
    });
  });

  describe("a clean submit goes live on its own", () => {
    let id = "";
    it("PUBLISHED at once, audited with the checks, the seller emailed, BTG not", async () => {
      id = await teamListing("Larks courtside banner");
      const sub = await call("POST", `/listings/${id}/submit`, "lap_mgr");
      expect(sub.status, sub.text).toBe(200);
      expect(sub.json).toMatchObject({ state: "PUBLISHED", publishedAutomatically: true, publishedBy: "AUTOMATIC", hold: null });
      expect(sub.json).not.toHaveProperty("reviewReasons");
      const trail = await prisma.auditLog.findFirstOrThrow({ where: { action: "listing.autoPublish", entityId: id }, select: { before: true, after: true } });
      expect(trail.before).toEqual({ state: "DRAFT" });
      expect(trail.after).toMatchObject({ state: "PUBLISHED", checks: { governance: "passed", restrictedWords: "none", sellerStanding: "good", pausedByBtg: "no" } });
      const told = await mails(about(id, "Larks courtside banner"));
      expect(told.map((m) => [m.template, m.to])).toEqual([["listing.live", "lap_mgr@lap-test.invalid"]]);
      expect(told[0]!.data.when).toBe("is live");
      /* BTG sees how it went live; the sponsor's marketplace too. */
      expect((await call("GET", `/listings/${id}`, "lap_admin")).json).toMatchObject({ publishedBy: "AUTOMATIC", reviewReasons: [] });
      const auto = (await call("GET", "/listings/auto-published", "lap_admin")).json.listings as { id: string }[];
      expect(auto.map((l) => l.id)).toContain(id);
      expect((await call("GET", "/listings/auto-published", "lap_x_admin")).json.listings.map((l: { id: string }) => l.id)).not.toContain(id);
      expect((await call("GET", "/listings/auto-published", "lap_mgr")).status).toBe(403);
    });

    it("a future publish day is respected: PUBLISHED, live from that day", async () => {
      const day = at(10);
      const later = await teamListing("Larks season banner", "A courtside banner for every home game next season.", { publishAt: day.toISOString() });
      const sub = await call("POST", `/listings/${later}/submit`, "lap_mgr");
      expect(sub.json).toMatchObject({ state: "PUBLISHED", publishedBy: "AUTOMATIC" });
      expect(new Date(sub.json.publishedAt).getTime()).toBe(day.getTime());
      const told = await mails(about(later, "Larks season banner"));
      expect(told[0]).toMatchObject({ template: "listing.live", data: { when: `goes live on ${day.toISOString().slice(0, 10)}` } });
    });

    it("governance still refuses the submit outright, with the list", async () => {
      const short = await teamListing("Larks short banner", "Too short.");
      const sub = await call("POST", `/listings/${short}/submit`, "lap_mgr");
      expect(sub.status).toBe(422);
      expect(sub.text).toMatch(/description of at least 20 characters/);
      expect((await prisma.listing.findUniqueOrThrow({ where: { id: short }, select: { state: true } })).state).toBe("DRAFT");
    });

    it("edited while live: pause first, and resuming runs the same automatic path", async () => {
      expect((await call("PATCH", `/listings/${id}`, "lap_mgr", { title: "Changed live" })).status).toBe(409);
      await call("POST", `/listings/${id}/transition`, "lap_mgr", { to: "PAUSED" });
      expect((await call("PATCH", `/listings/${id}`, "lap_mgr", { description: "Courtside banners for every home game. Poker night sponsor wanted." })).status).toBe(200);
      const resumed = await call("POST", `/listings/${id}/transition`, "lap_mgr", { to: "PUBLISHED" });
      expect(resumed.json).toMatchObject({ state: "PENDING_APPROVAL", hold: { restrictedWords: ["poker"] } });
      /* Taking the word out takes it back to DRAFT, out of BTG's queue; submitted again, it goes live. */
      const fixed = await call("PATCH", `/listings/${id}`, "lap_mgr", { description: "Courtside banners for every home game this season." });
      expect(fixed.json.state).toBe("DRAFT");
      expect(await prisma.auditLog.count({ where: { action: "listing.withdraw", entityId: id } })).toBe(1);
      expect((await call("POST", `/listings/${id}/submit`, "lap_mgr")).json.state).toBe("PUBLISHED");
    });
  });

  describe("flagged: restricted words", () => {
    let id = "";
    it("held with the words named; BTG is emailed a link; the seller is told the words so they can edit", async () => {
      id = await quinnListing("Poker night skills clinic");
      const sub = await call("POST", `/listings/${id}/submit`, "lap_quinn");
      expect(sub.status, sub.text).toBe(200);
      expect(sub.json).toMatchObject({ state: "PENDING_APPROVAL", publishedBy: null, hold: { restrictedWords: ["poker"], accountCheck: false } });
      expect(sub.json.hold.message).toMatch(/BTG is taking a look — we'll email you\. Restricted words: "poker"/);
      expect(sub.json).not.toHaveProperty("reviewReasons");
      const staff = (await call("GET", `/listings/${id}`, "lap_admin")).json;
      expect(staff.reviewReasons).toEqual(['Restricted words: "poker"']);
      expect((await call("GET", "/listings?state=PENDING_APPROVAL", "lap_admin")).json.listings.map((l: { id: string }) => l.id)).toContain(id);
      const trail = await prisma.auditLog.findFirstOrThrow({ where: { action: "listing.hold", entityId: id }, select: { after: true } });
      expect(trail.after).toMatchObject({ state: "PENDING_APPROVAL", reasons: ['Restricted words: "poker"'], checks: { restrictedWords: ["poker"] } });
      const told = await mails(about(id, "Poker night skills clinic"));
      expect(told.map((m) => [m.template, m.to])).toEqual([
        ["listing.held", "lap_quinn@lap-test.invalid"],
        ["listing.heldForBtg", "lap_admin@lap-test.invalid"],
      ]);
      expect(told[0]!.data).toMatchObject({ words: 'Restricted words: "poker"', accountCheck: "" });
      expect(told[1]!.data.reasons).toBe('• Restricted words: "poker"');
      expect(told[1]!.data.reviewUrl).toMatch(new RegExp(`/admin/marketplace\\?listings=held#listing-${id}$`));
    });

    it("BTG approves a held listing: PUBLISHED, approved by BTG, the seller told it is live", async () => {
      expect((await call("POST", `/listings/${id}/decision`, "lap_quinn", { decision: "APPROVE" })).status).toBe(403);
      expect((await call("POST", `/listings/${id}/decision`, "lap_x_admin", { decision: "APPROVE" })).status).toBe(403);
      const ok = await call("POST", `/listings/${id}/decision`, "lap_admin", { decision: "APPROVE" });
      expect(ok.status, ok.text).toBe(200);
      expect(ok.json).toMatchObject({ state: "PUBLISHED", publishedAutomatically: false, publishedBy: "BTG", decidedBy: "lap_admin", reviewReasons: ['Restricted words: "poker"'] });
      expect((await mails(about(id, "Poker night skills clinic"))).at(-1)).toMatchObject({ template: "listing.live", to: "lap_quinn@lap-test.invalid" });
      /* Not among the listings published automatically. */
      expect((await call("GET", "/listings/auto-published", "lap_admin")).json.listings.map((l: { id: string }) => l.id)).not.toContain(id);
    });

    it("BTG can reject a held listing, with a note the seller is emailed", async () => {
      const other = await quinnListing("Casino clinic for teams");
      expect((await call("POST", `/listings/${other}/submit`, "lap_quinn")).json.state).toBe("PENDING_APPROVAL");
      expect((await call("POST", `/listings/${other}/decision`, "lap_admin", { decision: "REJECT" })).status).toBe(422);
      const no = await call("POST", `/listings/${other}/decision`, "lap_admin", { decision: "REJECT", notes: "Gambling isn't allowed on the marketplace." });
      expect(no.json).toMatchObject({ state: "ARCHIVED", btgAction: "ENDED", btgReason: "Gambling isn't allowed on the marketplace." });
      expect((await mails(about(other, "Casino clinic for teams"))).at(-1)).toMatchObject({ template: "listing.endedByBtg", data: { reason: "Gambling isn't allowed on the marketplace." } });
    });
  });

  describe("flagged: the seller's standing", () => {
    it("an organisation flagged for a missing document: held, the seller told only that BTG is checking the account", async () => {
      await prisma.propertyOnboarding.update({ where: { id: "lap_onb" }, data: { flags: ["Document missing after an update: Business registration"], flaggedAt: new Date() } });
      try {
        const id = await teamListing("Larks scarf giveaway", "A branded scarf giveaway at the gate for every fan.");
        const sub = await call("POST", `/listings/${id}/submit`, "lap_mgr");
        expect(sub.json).toMatchObject({ state: "PENDING_APPROVAL", hold: { restrictedWords: [], accountCheck: true } });
        expect(sub.text).not.toMatch(/Business registration|Organisation flagged/);
        expect((await call("GET", `/listings/${id}`, "lap_admin")).json.reviewReasons).toEqual(["Organisation flagged: Document missing after an update: Business registration"]);
        /* Both emails are written in one transaction with the same createdAt — find each by template, never by position. */
        const told = await mails(about(id, "Larks scarf giveaway"));
        const toSeller = told.find((m) => m.template === "listing.held");
        expect(toSeller).toMatchObject({ data: { words: "", accountCheck: "yes" } });
        expect(JSON.stringify(toSeller)).not.toMatch(/Business registration/);
        expect(told.find((m) => m.template === "listing.heldForBtg")).toMatchObject({ data: { reasons: "• Organisation flagged: Document missing after an update: Business registration" } });
      } finally {
        await prisma.propertyOnboarding.update({ where: { id: "lap_onb" }, data: { flags: [], flaggedAt: null } });
      }
    });

    it("payouts held while listing access is on: held", async () => {
      await prisma.property.update({ where: { id: E.property }, data: { payoutsHeldAt: new Date() } });
      try {
        const id = await teamListing("Larks halftime shout-out");
        expect((await call("POST", `/listings/${id}/submit`, "lap_mgr")).json.state).toBe("PENDING_APPROVAL");
        expect((await call("GET", `/listings/${id}`, "lap_admin")).json.reviewReasons).toEqual(["Organisation: payouts are on hold"]);
      } finally {
        await prisma.property.update({ where: { id: E.property }, data: { payoutsHeldAt: null } });
      }
    });

    it("a team's listing of an athlete in the coming-of-age pause, or of a minor whose guardian isn't verified: held", async () => {
      const made = await call("POST", "/listings", "lap_mgr", { inventoryItemId: E.morganItem, title: "Camp with Morgan", description: "Morgan runs a two-hour camp at your venue." });
      expect(made.status, made.text).toBe(201);
      const id = made.json.id as string;
      await prisma.athlete.update({ where: { id: E.morgan }, data: { comingOfAgeStartedAt: new Date(), comingOfAgeDueAt: at(90) } });
      try {
        expect((await call("POST", `/listings/${id}/submit`, "lap_mgr")).json.state).toBe("PENDING_APPROVAL");
        expect((await call("GET", `/listings/${id}`, "lap_admin")).json.reviewReasons).toEqual([expect.stringMatching(/^Item's athlete \(MORGAN\.DIAZ\): in the coming-of-age pause/)]);
      } finally {
        await prisma.athlete.update({ where: { id: E.morgan }, data: { comingOfAgeStartedAt: null, comingOfAgeDueAt: null } });
      }
      expect((await call("PATCH", `/listings/${id}`, "lap_mgr", { title: "Camp with Morgan D." })).json.state).toBe("DRAFT");
      await prisma.athlete.update({ where: { id: E.morgan }, data: { ageBand: "16_17" } });
      try {
        expect((await call("POST", `/listings/${id}/submit`, "lap_mgr")).json.state).toBe("PENDING_APPROVAL");
        expect((await call("GET", `/listings/${id}`, "lap_admin")).json.reviewReasons).toEqual(["Item's athlete (MORGAN.DIAZ): a minor whose guardian isn't verified yet"]);
      } finally {
        await prisma.athlete.update({ where: { id: E.morgan }, data: { ageBand: "18_PLUS" } });
      }
    });

    it("an independent athlete in the coming-of-age pause: a new submit is refused outright (kept); the guardian's resume is held for BTG", async () => {
      const id = await quinnListing("Quinn's footwork session");
      expect((await call("POST", `/listings/${id}/submit`, "lap_quinn")).json.state).toBe("PUBLISHED");
      await call("POST", `/listings/${id}/transition`, "lap_quinn", { to: "PAUSED" });
      const draft = await quinnListing("Quinn's shooting session");
      await prisma.athlete.update({ where: { id: "lap_ath_quinn" }, data: { guardianId: "lap_guardian", comingOfAgeStartedAt: new Date(), comingOfAgeDueAt: at(90) } });
      try {
        /* The guardian answers for Quinn during the allowance; nothing new is started. */
        expect((await call("POST", `/listings/${draft}/submit`, "lap_quinn")).status).toBe(403);
        const guardian = { userId: "lap_guardian_login", tenantId: T, roles: ["GUARDIAN" as const, "ATHLETE" as const], sponsorId: null, athleteId: "lap_ath_quinn", guardianId: "lap_guardian", propertyId: null, actingFor: { athleteId: "lap_ath_quinn", guardianId: "lap_guardian" } };
        const resumed = await transitionListing(guardian, id, "PUBLISHED");
        expect(resumed).toMatchObject({ state: "PENDING_APPROVAL", hold: { accountCheck: true } });
        const row = await prisma.listing.findUniqueOrThrow({ where: { id }, select: { reviewReasons: true } });
        expect(row.reviewReasons).toEqual([expect.stringMatching(/^Athlete: in the coming-of-age pause/)]);
        /* Quinn and the guardian are both told. */
        expect((await mails(about(id, "Quinn's footwork session"))).filter((m) => m.template === "listing.held").map((m) => m.to).sort())
          .toEqual(["lap_guardian@lap-test.invalid", "lap_quinn@lap-test.invalid"]);
      } finally {
        await prisma.athlete.update({ where: { id: "lap_ath_quinn" }, data: { guardianId: null, comingOfAgeStartedAt: null, comingOfAgeDueAt: null } });
      }
    });
  });

  describe("BTG pauses or ends a live listing, with a reason", () => {
    it("pause: the seller is emailed the reason, and can't put it back live — their resume goes to BTG", async () => {
      const id = await teamListing("Larks jersey patch");
      expect((await call("POST", `/listings/${id}/submit`, "lap_mgr")).json.state).toBe("PUBLISHED");
      expect((await call("POST", `/listings/${id}/btg-action`, "lap_admin", { action: "PAUSE" })).status).toBe(422);
      const paused = await call("POST", `/listings/${id}/btg-action`, "lap_admin", { action: "PAUSE", reason: "The photo shows another team's logo." });
      expect(paused.json).toMatchObject({ state: "PAUSED", btgAction: "PAUSED", btgReason: "The photo shows another team's logo." });
      expect((await mails(about(id, "Larks jersey patch"))).at(-1)).toMatchObject({
        template: "listing.pausedByBtg", to: "lap_mgr@lap-test.invalid", data: { reason: "The photo shows another team's logo." },
      });
      expect(await prisma.auditLog.count({ where: { action: "listing.btgPause", entityId: id } })).toBe(1);

      const back = await call("POST", `/listings/${id}/transition`, "lap_mgr", { to: "PUBLISHED" });
      expect(back.json).toMatchObject({ state: "PENDING_APPROVAL", hold: { pausedByBtg: true } });
      expect((await call("GET", `/listings/${id}`, "lap_admin")).json.reviewReasons).toEqual(["Paused by BTG: The photo shows another team's logo."]);
      /* Editing and submitting again still lands with BTG — the pause stays BTG's to lift. */
      expect((await call("PATCH", `/listings/${id}`, "lap_mgr", { description: "Our own jersey patch, our own logo, every home game." })).json.state).toBe("DRAFT");
      expect((await call("POST", `/listings/${id}/submit`, "lap_mgr")).json.state).toBe("PENDING_APPROVAL");
      const ok = await call("POST", `/listings/${id}/decision`, "lap_admin", { decision: "APPROVE" });
      expect(ok.json).toMatchObject({ state: "PUBLISHED", btgAction: null, publishedBy: "BTG" });
    });

    it("BTG resumes its own pause; the seller's own pause is theirs", async () => {
      const id = await teamListing("Larks ribbon board");
      await call("POST", `/listings/${id}/submit`, "lap_mgr");
      await call("POST", `/listings/${id}/btg-action`, "lap_admin", { action: "PAUSE", reason: "Checking the ribbon board times." });
      const resumed = await call("POST", `/listings/${id}/btg-action`, "lap_admin", { action: "RESUME" });
      expect(resumed.json).toMatchObject({ state: "PUBLISHED", btgAction: null, publishedBy: "BTG" });
      await call("POST", `/listings/${id}/transition`, "lap_mgr", { to: "PAUSED" });
      expect((await call("POST", `/listings/${id}/btg-action`, "lap_admin", { action: "RESUME" })).status).toBe(409);
      expect((await call("POST", `/listings/${id}/transition`, "lap_mgr", { to: "PUBLISHED" })).json.state).toBe("PUBLISHED");
    });

    it("end: archived, with the reason emailed; the seller cannot act as BTG", async () => {
      const id = await teamListing("Larks tunnel walk");
      await call("POST", `/listings/${id}/submit`, "lap_mgr");
      expect((await call("POST", `/listings/${id}/btg-action`, "lap_mgr", { action: "END", reason: "x" })).status).toBe(403);
      expect((await call("POST", `/listings/${id}/btg-action`, "lap_x_admin", { action: "END", reason: "x" })).status).toBe(403);
      const ended = await call("POST", `/listings/${id}/btg-action`, "lap_admin", { action: "END", reason: "Tunnel walks with minors need a guardian present." });
      expect(ended.json).toMatchObject({ state: "ARCHIVED", btgAction: "ENDED" });
      expect((await mails(about(id, "Larks tunnel walk"))).at(-1)).toMatchObject({ template: "listing.endedByBtg", data: { reason: "Tunnel walks with minors need a guardian present." } });
      expect((await call("POST", `/listings/${id}/transition`, "lap_mgr", { to: "PUBLISHED" })).status).toBe(409);
    });
  });

  describe("BTG's daily summary", () => {
    it("one email per BTG tenant per day, of the listings published automatically only — and a second pass sends nothing", async () => {
      const now = new Date();
      const digests = async () => prisma.listingDigest.findMany({ where: { tenantId: T }, select: { day: true, listings: true } });
      const summaries = async () => mails((m) => m.template === "listing.autoPublishedDigest" && m.to === "lap_admin@lap-test.invalid");
      expect(await digests()).toEqual([]);
      /* Only this file's marketplace: the sweep is platform-wide, and other files' tenants are theirs. */
      await sendListingDigests(now, [T]);
      const auto = await prisma.listing.findMany({
        where: { tenantId: { in: await tenantsInPlay() }, publishedAutomatically: true, publishedAt: { lte: now } }, select: { id: true, title: true },
      });
      expect(auto.length).toBeGreaterThan(0);
      expect(await digests()).toEqual([{ day: now.toISOString().slice(0, 10), listings: auto.length }]);
      const sent = await summaries();
      expect(sent).toHaveLength(1);
      expect(sent[0]!.idempotencyKey).toBe(`listing.autoPublishedDigest:${T}:${now.toISOString().slice(0, 10)}:lap_admin`);
      expect(sent[0]!.data.count).toBe(String(auto.length));
      for (const l of auto) expect(sent[0]!.data.listings).toContain(`#listing-${l.id}`);
      /* BTG-approved and held ones are not in it; nor is a listing whose publish day is still to come. */
      expect(sent[0]!.data.listings).not.toMatch(/Poker night|Larks scarf|Larks season banner/);
      /* Another marketplace's admin hears nothing of these. */
      expect(await mails((m) => m.template === "listing.autoPublishedDigest" && m.to === "lap_x_admin@lap-test.invalid")).toEqual([]);

      await sendListingDigests(new Date(now.getTime() + 60_000), [T]);
      expect(await digests()).toHaveLength(1);
      expect(await summaries()).toHaveLength(1);
    });
  });
});
