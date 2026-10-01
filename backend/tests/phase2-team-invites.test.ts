import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   2S2-BE-05 — a team invites an athlete already on SponsorX, against the
   real API and database. Done when (with the programme owner's 2026-10-01
   rules in place of "ends their own listings"):

     A team can invite an existing approved athlete with a proposed share;
     the athlete can accept or decline; accepting links them at that share;
     either side can end the link without changing past orders; nobody is
     linked without accepting; tenant and role tests cover it.

   And the agreed rule instead of ending listings: a roster athlete's items
   are listed by the team — the athlete's own listing stops selling while
   they are on it (it is not ended) and sells again when they leave.

   The cast: Jordan Reed, an approved athlete with no team in BTG's own
   tenant, with a published listing of his own. The Westfield Hawks TV and the
   Lakeside Lions TV are teams in their own tenants. Pat isn't approved; Lee is
   in another marketplace.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@tv-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const { issueOrderTerms, placeOrderBody } = await import("./support/order-terms");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("2S2-BE-05 · a team invites an athlete already on SponsorX", { timeout: 120_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { decideOnboarding } = await import("../src/domain/onboarding");

  const T = "tv_btg";
  const X = "tv_other";
  const E = { hawksTenant: "", hawks: "", lionsTenant: "", lions: "", ownListing: "", ownItem: "", spareItem: "", teamListing: "", hawksInvite: "", lionsInvite: "", order: "", line: "" };
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
  const at = (days: number) => new Date(Date.now() + days * 864e5).toISOString();
  const emails = async () => (await prisma.outboxJob.findMany({ where: { name: "notify.email", tenantId: { in: await tenantsInPlay() } }, select: { payload: true } }))
    .map((j) => j.payload as { template: string; to: string; data: Record<string, string> });
  const jordan = () => prisma.athlete.findUniqueOrThrow({ where: { id: "tv_ath_jordan" }, select: { propertyId: true, teamShareBps: true } });
  const search = async (q: string) => ((await call("GET", `/marketplace/search?q=${q}`, "tv_buyer")).json.results as { id: string }[]).map((r) => r.id);
  const adminActor = { userId: "tv_admin", tenantId: T, roles: ["BTG_ADMIN" as const], sponsorId: null, athleteId: null, guardianId: null, propertyId: null };

  async function tenantsInPlay() {
    const outside = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM "Tenant" WHERE "operatorTenantId" = $1
       UNION SELECT "tenantId" FROM "User" WHERE email LIKE 'tv\\_%@tv-test.invalid' AND "tenantId" NOT IN ($1, $2)`, T, X,
    );
    return [T, X, ...outside.map((r) => r.id)];
  }
  async function clean() {
    const ids = await tenantsInPlay();
    await prisma.$executeRawUnsafe(`DELETE FROM "PayoutLine" WHERE "payoutId" IN (SELECT id FROM "Payout" WHERE "tenantId" = ANY($1::text[]))`, ids);
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 8; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = ANY($1::text[])`, ids).catch(() => {});
      }
    }
    await prisma.tenant.updateMany({ where: { id: { in: ids } }, data: { operatorTenantId: null } });
    await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
  }
  async function approveTeam(id: string, name: string, manager: string) {
    await prisma.propertyOnboarding.create({ data: {
      id, tenantId: T, orgType: "TEAM", orgName: name, stateCode: "MD", state: "PENDING_REVIEW",
      contacts: [{ name: "Dana Brooks", email: `${manager}@tv-test.invalid`, phone: "301-555-0100", role: "General manager", primary: true }],
      details: { legalEntityName: `${name} LLC`, league: "MD Amateur", sport: "Basketball" },
      payoutAcknowledgedAt: new Date(), termsAcceptedAt: new Date(), submittedAt: new Date(),
    } });
    const approved = await decideOnboarding(adminActor, id, "APPROVE");
    return prisma.property.findUniqueOrThrow({ where: { id: approved.propertyId! }, select: { id: true, tenantId: true } });
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.createMany({ data: [{ id: T, name: "Invites BTG" }, { id: X, name: "Another marketplace" }] });
    await issueOrderTerms(prisma, T);
    await prisma.sponsor.create({ data: { id: "tv_harbor", tenantId: T, name: "Harbor Coffee", categories: ["RESTAURANT"] } });
    const athlete = (id: string, tenantId: string, legalName: string, displayName: string, state: "APPROVED" | "DRAFT") =>
      ({ id, tenantId, slug: id.replace(/_/g, "-"), legalName, displayName, email: `${id}@tv-test.invalid`, sport: "Basketball", stateCode: "MD", ageBand: "18_PLUS", state, birthDate: new Date("2004-05-01") });
    await prisma.athlete.createMany({ data: [
      athlete("tv_ath_jordan", T, "Jordan Reed", "JORDAN.REED", "APPROVED"),
      athlete("tv_ath_sam", T, "Sam Jordanson", "SAM.J", "APPROVED"),
      athlete("tv_ath_pat", T, "Pat Jordan", "PAT.JORDAN", "DRAFT"),
      athlete("tv_ath_lee", X, "Lee Jordan", "LEE.JORDAN", "APPROVED"),
    ] });
    await prisma.user.createMany({ data: [
      { id: "tv_admin", tenantId: T, clerkId: "tv_admin", email: "tv_admin@tv-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "tv_buyer", tenantId: T, clerkId: "tv_buyer", email: "tv_buyer@tv-test.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "tv_harbor" },
      { id: "tv_jordan", tenantId: T, clerkId: "tv_jordan", email: "tv_jordan@tv-test.invalid", roles: ["ATHLETE"], athleteId: "tv_ath_jordan" },
      { id: "tv_sam", tenantId: T, clerkId: "tv_sam", email: "tv_sam@tv-test.invalid", roles: ["ATHLETE"], athleteId: "tv_ath_sam" },
      { id: "tv_lee", tenantId: X, clerkId: "tv_lee", email: "tv_lee@tv-test.invalid", roles: ["ATHLETE"], athleteId: "tv_ath_lee" },
    ] });
    const rule = (kind: string, bps: number, fixedCents = 0) => ({ id: `tv_${kind}`, tenantId: T, ruleKey: `tv_${kind}`, version: 1, kind, scope: "GLOBAL", bps, fixedCents, priority: 0, effectiveFrom: new Date("2026-01-01") });
    await prisma.commissionRule.createMany({ data: [rule("PLATFORM_FEE", 1500), rule("MANAGEMENT_FEE", 500), rule("PROCESSING", 290, 30), rule("REFERRAL", 200), rule("RESERVE", 1000)] });
    const hawks = await approveTeam("tv_onb_hawks", "Westfield Hawks TV", "tv_mgr");
    const lions = await approveTeam("tv_onb_lions", "Lakeside Lions TV", "tv_mgr2");
    Object.assign(E, { hawksTenant: hawks.tenantId, hawks: hawks.id, lionsTenant: lions.tenantId, lions: lions.id });
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await call("GET", "/me", "tv_mgr");
    await call("GET", "/me", "tv_mgr2");

    /* Jordan sells on his own: one item listed and published, one spare. */
    const item = await call("POST", "/inventory", "tv_jordan", { title: "Shooting session", kind: "CAMP", priceCents: 40_000, quantity: 10 });
    expect(item.status, item.text).toBe(201);
    E.ownItem = item.json.id;
    const listing = await call("POST", "/listings", "tv_jordan", { inventoryItemId: E.ownItem, title: "Shooting session with Jordan Reed", description: "A 90-minute shooting session at your venue." });
    E.ownListing = listing.json.id;
    await call("POST", `/listings/${E.ownListing}/submit`, "tv_jordan");
    expect((await call("POST", `/listings/${E.ownListing}/decision`, "tv_admin", { decision: "APPROVE" })).json.state).toBe("PUBLISHED");
    E.spareItem = (await call("POST", "/inventory", "tv_jordan", { title: "Free-throw clinic", kind: "CAMP", priceCents: 50_000, quantity: 10 })).json.id;
  });

  afterAll(async () => {
    server?.close();
    await clean();
  });

  it("the team finds approved athletes with no team in its own marketplace — public fields only", async () => {
    expect((await call("GET", "/team/invitations/candidates?q=j", "tv_mgr")).json.athletes).toEqual([]);
    const found = await call("GET", "/team/invitations/candidates?q=jordan", "tv_mgr");
    expect(found.status, found.text).toBe(200);
    const names = found.json.athletes.map((a: { displayName: string }) => a.displayName).sort();
    /* Not Pat (not approved), not Lee (another marketplace). */
    expect(names).toEqual(["JORDAN.REED", "SAM.J"]);
    expect(found.text).not.toMatch(/tv-test\.invalid|birthDate|2004-05-01|legalName/);
    for (const who of ["tv_jordan", "tv_buyer", "tv_admin"]) expect((await call("GET", "/team/invitations/candidates?q=jordan", who)).status, who).toBe(403);
  });

  it("only a team (or an agency) invites — a school keeps Add athlete for its own people", async () => {
    await prisma.propertyOnboarding.create({ data: {
      id: "tv_onb_school", tenantId: T, orgType: "SCHOOL", orgName: "Westfield High TV", stateCode: "MD", state: "PENDING_REVIEW",
      contacts: [{ name: "Erin Vale", email: "tv_school@tv-test.invalid", role: "Athletic director", primary: true }],
      details: { district: "Westfield District", athleticDirector: "Erin Vale", sports: ["Basketball"] },
      payoutAcknowledgedAt: new Date(), termsAcceptedAt: new Date(), submittedAt: new Date(),
    } });
    await decideOnboarding(adminActor, "tv_onb_school", "APPROVE");
    await call("GET", "/me", "tv_school");
    const refused = await call("POST", "/team/invitations", "tv_school", { athleteId: "tv_ath_jordan", teamShareBps: 2000 });
    expect(refused.status, refused.text).toBe(409);
    expect(refused.json.error.message).toMatch(/Only a team or an agency/);
    expect((await call("GET", "/team/invitations/candidates?q=jordan", "tv_school")).status).toBe(409);
  });

  it("invites Jordan at a 20% share — refused for an unapproved athlete, another marketplace's, a bad share or a second open invite", async () => {
    expect((await call("POST", "/team/invitations", "tv_mgr", { athleteId: "tv_ath_pat", teamShareBps: 2000 })).status).toBe(409);
    expect((await call("POST", "/team/invitations", "tv_mgr", { athleteId: "tv_ath_lee", teamShareBps: 2000 })).status).toBe(403);
    expect((await call("POST", "/team/invitations", "tv_mgr", { athleteId: "tv_ath_jordan", teamShareBps: 12_000 })).status).toBe(400);
    expect((await call("POST", "/team/invitations", "tv_jordan", { athleteId: "tv_ath_jordan", teamShareBps: 2000 })).status).toBe(403);
    const sent = await call("POST", "/team/invitations", "tv_mgr", { athleteId: "tv_ath_jordan", teamShareBps: 2000 });
    expect(sent.status, sent.text).toBe(201);
    E.hawksInvite = sent.json.id;
    expect((await call("POST", "/team/invitations", "tv_mgr", { athleteId: "tv_ath_jordan", teamShareBps: 2500 })).status).toBe(409);
    expect((await emails()).find((e) => e.template === "team.invited" && e.to === "tv_jordan@tv-test.invalid")?.data).toMatchObject({ teamName: "Westfield Hawks TV", share: "20%" });
    E.lionsInvite = (await call("POST", "/team/invitations", "tv_mgr2", { athleteId: "tv_ath_jordan", teamShareBps: 1500 })).json.id;
  });

  it("nobody is linked without accepting: Jordan isn't on the roster, and sees both invitations", async () => {
    expect(await jordan()).toEqual({ propertyId: null, teamShareBps: null });
    expect((await call("GET", "/team/athletes", "tv_mgr")).json.athletes).toEqual([]);
    const mine = (await call("GET", "/me/team", "tv_jordan")).json;
    expect(mine.membership).toBeNull();
    expect(mine.invitations.map((i: { team: { name: string }; teamShareBps: number }) => [i.team.name, i.teamShareBps]).sort()).toEqual([["Lakeside Lions TV", 1500], ["Westfield Hawks TV", 2000]]);
    expect((await call("GET", "/team/invitations", "tv_mgr")).json.invitations).toEqual([expect.objectContaining({ id: E.hawksInvite, state: "PENDING", athlete: expect.objectContaining({ displayName: "JORDAN.REED" }) })]);
    /* Each side sees only its own. */
    expect((await call("GET", "/team/invitations", "tv_mgr2")).json.invitations.map((i: { id: string }) => i.id)).toEqual([E.lionsInvite]);
    expect((await call("GET", "/me/team", "tv_sam")).json.invitations).toEqual([]);
  });

  it("only Jordan answers his invitations; only the inviting team withdraws", async () => {
    expect((await call("POST", `/team-invitations/${E.hawksInvite}/respond`, "tv_sam", { decision: "ACCEPT" })).status).toBe(403);
    expect((await call("POST", `/team-invitations/${E.hawksInvite}/respond`, "tv_mgr", { decision: "ACCEPT" })).status).toBe(403);
    expect((await call("POST", `/team-invitations/${E.hawksInvite}/respond`, "tv_lee", { decision: "ACCEPT" })).status).toBe(403);
    expect((await call("POST", `/team-invitations/${E.hawksInvite}/withdraw`, "tv_mgr2")).status).toBe(403);
    expect((await call("POST", `/team-invitations/${E.hawksInvite}/withdraw`, "tv_jordan")).status).toBe(403);
    expect(await jordan()).toEqual({ propertyId: null, teamShareBps: null });
  });

  it("Jordan declines the Lions and accepts the Hawks: linked at exactly the share he was shown", async () => {
    expect((await call("POST", `/team-invitations/${E.lionsInvite}/respond`, "tv_jordan", { decision: "DECLINE" })).json.state).toBe("DECLINED");
    expect(await jordan()).toEqual({ propertyId: null, teamShareBps: null });
    const ok = await call("POST", `/team-invitations/${E.hawksInvite}/respond`, "tv_jordan", { decision: "ACCEPT" });
    expect(ok.status, ok.text).toBe(200);
    expect(ok.json.state).toBe("ACCEPTED");
    expect(await jordan()).toEqual({ propertyId: E.hawks, teamShareBps: 2000 });
    expect((await call("POST", `/team-invitations/${E.hawksInvite}/respond`, "tv_jordan", { decision: "DECLINE" })).status).toBe(409);
    const answered = (await emails()).filter((e) => e.template === "team.invitationAnswered").map((e) => [e.to, e.data.answer]);
    expect(answered).toEqual(expect.arrayContaining([["tv_mgr@tv-test.invalid", "accepted"], ["tv_mgr2@tv-test.invalid", "declined"]]));
    /* On the roster, across tenants: the team sees him and his items. */
    expect((await call("GET", "/team/athletes", "tv_mgr")).json.athletes).toEqual([expect.objectContaining({ id: "tv_ath_jordan", teamShareBps: 2000 })]);
    expect((await call("GET", "/team/inventory", "tv_mgr")).json.inventory.map((i: { id: string }) => i.id).sort()).toEqual([E.ownItem, E.spareItem].sort());
    expect((await call("GET", "/me/team", "tv_jordan")).json.membership).toMatchObject({ teamId: E.hawks, team: { name: "Westfield Hawks TV" }, teamShareBps: 2000 });
    /* The other team still can't reach him. */
    expect((await call("GET", "/team/athletes", "tv_mgr2")).json.athletes).toEqual([]);
    expect((await call("PATCH", "/team/roster/tv_ath_jordan", "tv_mgr2", { teamShareBps: 1 })).status).toBe(403);
  });

  it("his own listing is not ended — it stops selling while he is on the team; the team lists his items", async () => {
    expect((await call("GET", `/listings/${E.ownListing}`, "tv_jordan")).json.state).toBe("PUBLISHED");
    expect(await search("shooting")).not.toContain(E.ownListing);
    /* His own listing still holds the item it lists; the team lists the other. */
    const blocked = await call("POST", "/listings", "tv_mgr", { inventoryItemId: E.ownItem, title: "Shooting session (Hawks)", description: "A 90-minute shooting session at your venue." });
    expect(blocked.status).toBe(409);
    expect(blocked.json.error.message).toMatch(/still has their own listing/);
    const team = await call("POST", "/listings", "tv_mgr", { inventoryItemId: E.spareItem, title: "Free-throw clinic with Jordan Reed", description: "A free-throw clinic at your venue, for up to 20 kids." });
    expect(team.status, team.text).toBe(201);
    E.teamListing = team.json.id;
    await call("POST", `/listings/${E.teamListing}/submit`, "tv_mgr");
    expect((await call("POST", `/listings/${E.teamListing}/decision`, "tv_admin", { decision: "APPROVE" })).json.state).toBe("PUBLISHED");
    expect(await search("free-throw")).toContain(E.teamListing);
    /* And Jordan can't list around his team. */
    expect((await call("POST", "/listings", "tv_jordan", { inventoryItemId: E.spareItem, title: "Mine", description: "A free-throw clinic, sold by me directly." })).status).toBe(409);
  });

  it("a sale through the team splits at the accepted share, each party in its own books", async () => {
    await call("POST", "/cart", "tv_buyer");
    expect((await call("POST", "/cart/lines", "tv_buyer", { listingId: E.teamListing, quantity: 1, startsOn: at(10), endsOn: at(11) })).status).toBe(201);
    const hold = (await call("POST", "/cart/reserve", "tv_buyer")).json;
    const placed = await call("POST", "/marketplace-orders", "tv_buyer", placeOrderBody(hold.id, `${T}_order_terms`));
    expect(placed.status, placed.text).toBe(201);
    E.order = placed.json.id;
    E.line = placed.json.lines[0].id;
    await call("POST", `/marketplace-orders/${E.order}/decision`, "tv_admin", { decision: "APPROVE" });
    const fin = (await call("GET", `/marketplace-orders/${E.order}/financials`, "tv_admin")).json.lines[0];
    expect(fin).toMatchObject({ athleteId: "tv_ath_jordan", teamShareBps: 2000 });
    const parties = await prisma.ledgerEntry.findMany({ where: { orderId: E.order, partyType: { in: ["ATHLETE", "PROPERTY"] } }, select: { partyType: true, partyTenantId: true } });
    expect(new Set(parties.map((p) => `${p.partyType}:${p.partyTenantId}`))).toEqual(new Set([`ATHLETE:${T}`, `PROPERTY:${E.hawksTenant}`]));
    expect((await call("GET", "/team/ledger", "tv_mgr")).json.bookedRevenueCents).toBe(fin.teamAvailableCents + fin.teamReserveCents);
    expect((await call("GET", "/sales", "tv_mgr")).json.sales.map((s: { id: string }) => s.id)).toEqual([E.line]);
    expect((await call("GET", "/sales", "tv_jordan")).json.sales.map((s: { id: string }) => s.id)).toEqual([E.line]);
  });

  it("Jordan leaves: the team's live listing of his item pauses; his own sells again; the placed order carries on at its split", async () => {
    const before = await prisma.ledgerEntry.findMany({ where: { orderId: E.order }, select: { id: true, status: true }, orderBy: { id: "asc" } });
    expect((await call("POST", "/me/team/leave", "tv_mgr")).status).toBe(403);
    const left = await call("POST", "/me/team/leave", "tv_jordan");
    expect(left.status, left.text).toBe(200);
    expect(left.json.listingsPaused).toBe(1);
    expect(await jordan()).toEqual({ propertyId: null, teamShareBps: null });
    expect((await call("GET", `/listings/${E.teamListing}`, "tv_mgr")).json.state).toBe("PAUSED");
    const resume = await call("POST", `/listings/${E.teamListing}/transition`, "tv_mgr", { to: "PUBLISHED" });
    expect(resume.status).toBe(422);
    expect(resume.json.error.message).toMatch(/no longer on this team/);
    expect(await search("shooting")).toContain(E.ownListing);
    /* Past orders: untouched, and both sides still see the line they sold. */
    expect(await prisma.ledgerEntry.findMany({ where: { orderId: E.order }, select: { id: true, status: true }, orderBy: { id: "asc" } })).toEqual(before);
    expect((await call("GET", "/sales", "tv_mgr")).json.sales.map((s: { id: string }) => s.id)).toEqual([E.line]);
    expect((await call("GET", "/sales", "tv_jordan")).json.sales.map((s: { id: string }) => s.id)).toEqual([E.line]);
    expect((await call("GET", "/team/athletes", "tv_mgr")).json.athletes).toEqual([]);
    expect((await emails()).some((e) => e.template === "team.linkEnded" && e.to === "tv_mgr@tv-test.invalid")).toBe(true);
    expect((await call("POST", "/me/team/leave", "tv_jordan")).status).toBe(409);
    /* He lists the spare item himself: the team's stale listing of it is archived. */
    const mine = await call("POST", "/listings", "tv_jordan", { inventoryItemId: E.spareItem, title: "Free-throw clinic", description: "A free-throw clinic at your venue, sold by me." });
    expect(mine.status, mine.text).toBe(201);
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: E.teamListing }, select: { state: true } })).state).toBe("ARCHIVED");
  });

  it("the team can remove an athlete, and take back an unanswered invitation", async () => {
    const again = (await call("POST", "/team/invitations", "tv_mgr", { athleteId: "tv_ath_jordan", teamShareBps: 1000 })).json.id;
    await call("POST", `/team-invitations/${again}/respond`, "tv_jordan", { decision: "ACCEPT" });
    expect(await jordan()).toEqual({ propertyId: E.hawks, teamShareBps: 1000 });
    expect((await call("POST", "/team/roster/tv_ath_jordan/remove", "tv_mgr2")).status).toBe(403);
    const removed = await call("POST", "/team/roster/tv_ath_jordan/remove", "tv_mgr");
    expect(removed.status, removed.text).toBe(200);
    expect(await jordan()).toEqual({ propertyId: null, teamShareBps: null });
    expect((await call("POST", "/team/roster/tv_ath_jordan/remove", "tv_mgr")).status).toBe(403);
    expect((await emails()).some((e) => e.template === "team.linkEnded" && e.to === "tv_jordan@tv-test.invalid")).toBe(true);

    const toSam = (await call("POST", "/team/invitations", "tv_mgr", { athleteId: "tv_ath_sam", teamShareBps: 1000 })).json.id;
    expect((await call("POST", `/team-invitations/${toSam}/withdraw`, "tv_mgr")).json.state).toBe("WITHDRAWN");
    expect((await call("POST", `/team-invitations/${toSam}/respond`, "tv_sam", { decision: "ACCEPT" })).status).toBe(409);
    expect((await prisma.athlete.findUniqueOrThrow({ where: { id: "tv_ath_sam" }, select: { propertyId: true } })).propertyId).toBeNull();
  });
});
