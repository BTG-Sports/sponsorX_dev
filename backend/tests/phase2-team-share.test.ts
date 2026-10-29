import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   POL-BE-03 — a team's share goes up only with the athlete's yes, against the
   real API and database. Done when (polish.md item 3, with the programme
   owner's 2026-10-29 choice that the share typed at "Add athlete" needs a yes
   too):

     no share goes up without the athlete's or guardian's yes; tests cover
     directly added athletes, invited athletes and minors.

   Invited athletes are covered in phase2-team-invites.test.ts (a raise of
   Jordan's agreed share is a request he answers). Here:

   The cast: the Westfield Hawks TS add Riley Carter, an adult, at 30%, and
   Mia Lopez, 13, at 100%. Carmen Lopez is Mia's verified guardian. The
   Lakeside Lions TS are another team.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@ts-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("POL-BE-03 · a team's share goes up only with the athlete's yes", { timeout: 120_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { decideOnboarding } = await import("../src/domain/onboarding");

  const T = "ts_btg";
  const E = { hawksTenant: "", hawks: "", lions: "", riley: "", mia: "" };
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";

  const call = async (method: string, path: string, clerk?: string, body?: unknown, ward?: string) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method, headers: { "content-type": "application/json", ...(clerk ? { "x-test-clerk": clerk } : {}), ...(ward ? { "x-sponsorx-ward": ward } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };
  const emails = async (template: string) => (await prisma.outboxJob.findMany({ where: { name: "notify.email", tenantId: { in: await tenantsInPlay() } }, select: { payload: true }, orderBy: { createdAt: "asc" } }))
    .map((j) => j.payload as { template: string; to: string; data: Record<string, string> })
    .filter((e) => e.template === template);
  const share = async (id: string) => (await prisma.athlete.findUniqueOrThrow({ where: { id }, select: { teamShareBps: true } })).teamShareBps;
  const asked = async (clerk: string, ward?: string) => (await call("GET", "/me/team", clerk, undefined, ward)).json.membership.shareChange;
  const respond = (id: string, clerk: string, decision: "ACCEPT" | "DECLINE", ward?: string) =>
    call("POST", `/me/team/share-changes/${id}/respond`, clerk, { decision }, ward);
  const adminActor = { userId: "ts_admin", tenantId: T, roles: ["BTG_ADMIN" as const], sponsorId: null, athleteId: null, guardianId: null, propertyId: null };

  async function tenantsInPlay() {
    const outside = await prisma.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM "Tenant" WHERE "operatorTenantId" = $1`, T);
    return [T, ...outside.map((r) => r.id)];
  }
  async function clean() {
    const ids = await tenantsInPlay();
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
      contacts: [{ name: "Dana Brooks", email: `${manager}@ts-test.invalid`, phone: "301-555-0100", role: "General manager", primary: true }],
      details: { legalEntityName: `${name} LLC`, league: "MD Amateur", sport: "Basketball" },
      payoutAcknowledgedAt: new Date(), termsAcceptedAt: new Date(), submittedAt: new Date(),
    } });
    const approved = await decideOnboarding(adminActor, id, "APPROVE");
    return prisma.property.findUniqueOrThrow({ where: { id: approved.propertyId! }, select: { id: true, tenantId: true } });
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "Share BTG" } });
    await prisma.user.create({ data: { id: "ts_admin", tenantId: T, clerkId: "ts_admin", email: "ts_admin@ts-test.invalid", roles: ["BTG_ADMIN"] } });
    const hawks = await approveTeam("ts_onb_hawks", "Westfield Hawks TS", "ts_mgr");
    const lions = await approveTeam("ts_onb_lions", "Lakeside Lions TS", "ts_mgr2");
    Object.assign(E, { hawksTenant: hawks.tenantId, hawks: hawks.id, lions: lions.id });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await call("GET", "/me", "ts_mgr");
    await call("GET", "/me", "ts_mgr2");
  });

  afterAll(async () => {
    server?.close();
    await clean();
  });

  it("Riley, added at 30%: the share waits for her yes, and BTG's standard share applies meanwhile", async () => {
    const added = await call("POST", "/team/roster", "ts_mgr", { legalName: "Riley Carter", displayName: "RILEY.CARTER", email: "ts_riley@ts-test.invalid", sport: "Basketball", ageBand: "18_PLUS", teamShareBps: 3000 });
    expect(added.status, added.text).toBe(201);
    expect(added.json).toMatchObject({ teamShareBps: null, shareChange: { fromBps: null, toBps: 3000 } });
    E.riley = added.json.id;
    expect(await share(E.riley)).toBeNull();
    expect((await emails("team.shareChangeAsked")).find((e) => e.to === "ts_riley@ts-test.invalid")?.data)
      .toMatchObject({ teamName: "Westfield Hawks TS", from: "BTG's standard team share", to: "30%", answerer: "you accept" });
    /* The team's roster shows it waiting. */
    expect((await call("GET", "/team/athletes", "ts_mgr")).json.athletes).toEqual([expect.objectContaining({ id: E.riley, teamShareBps: null, shareChange: expect.objectContaining({ toBps: 3000 }) })]);
  });

  it("only Riley answers it: she accepts, the share applies, and the team is told", async () => {
    await call("GET", "/me", "ts_riley");
    const request = await asked("ts_riley");
    expect(request).toMatchObject({ fromBps: null, toBps: 3000 });
    expect((await respond(request.id, "ts_mgr", "ACCEPT")).status).toBe(403);
    expect((await respond(request.id, "ts_admin", "ACCEPT")).status).toBe(403);
    const ok = await respond(request.id, "ts_riley", "ACCEPT");
    expect(ok.status, ok.text).toBe(200);
    expect(ok.json.state).toBe("ACCEPTED");
    expect(await share(E.riley)).toBe(3000);
    expect((await respond(request.id, "ts_riley", "DECLINE")).status).toBe(409);
    expect((await emails("team.shareChangeAnswered")).map((e) => [e.to, e.data.answer, e.data.to])).toEqual([["ts_mgr@ts-test.invalid", "accepted", "30%"]]);
  });

  it("a raise is a request; a newer one replaces it; another team can't touch it; declining keeps the share", async () => {
    const raise = await call("PATCH", `/team/roster/${E.riley}`, "ts_mgr", { teamShareBps: 5000 });
    expect(raise.status, raise.text).toBe(200);
    expect(raise.json).toMatchObject({ teamShareBps: 3000, shareChange: { fromBps: 3000, toBps: 5000 } });
    const first = raise.json.shareChange.id;
    expect((await call("PATCH", `/team/roster/${E.riley}`, "ts_mgr", { teamShareBps: 6000 })).json.shareChange.toBps).toBe(6000);
    expect((await prisma.teamShareChange.findUniqueOrThrow({ where: { id: first }, select: { state: true } })).state).toBe("WITHDRAWN");
    expect(await share(E.riley)).toBe(3000);
    expect((await call("PATCH", `/team/roster/${E.riley}`, "ts_mgr2", { teamShareBps: 9000 })).status).toBe(403);
    expect((await call("POST", `/team/roster/${E.riley}/share-change/withdraw`, "ts_mgr2")).status).toBe(403);
    const latest = await asked("ts_riley");
    expect(latest.toBps).toBe(6000);
    expect((await respond(first, "ts_riley", "ACCEPT")).status).toBe(409);
    expect((await respond(latest.id, "ts_riley", "DECLINE")).json.state).toBe("DECLINED");
    expect(await share(E.riley)).toBe(3000);
    expect((await emails("team.shareChangeAnswered")).at(-1)?.data).toMatchObject({ answer: "declined", from: "30%", to: "60%" });
  });

  it("clearing the share back to BTG's standard is a request too", async () => {
    const cleared = await call("PATCH", `/team/roster/${E.riley}`, "ts_mgr", { teamShareBps: null });
    expect(cleared.json).toMatchObject({ teamShareBps: 3000, shareChange: { fromBps: 3000, toBps: null } });
    expect(await share(E.riley)).toBe(3000);
  });

  it("lowering applies at once, ends the open request, and Riley is told", async () => {
    const open = (await asked("ts_riley")).id;
    const lower = await call("PATCH", `/team/roster/${E.riley}`, "ts_mgr", { teamShareBps: 2000 });
    expect(lower.status, lower.text).toBe(200);
    expect(lower.json).toMatchObject({ teamShareBps: 2000, shareChange: null });
    expect(await share(E.riley)).toBe(2000);
    expect((await prisma.teamShareChange.findUniqueOrThrow({ where: { id: open }, select: { state: true } })).state).toBe("WITHDRAWN");
    expect(await asked("ts_riley")).toBeNull();
    expect((await emails("team.shareLowered")).map((e) => [e.to, e.data.from, e.data.to])).toEqual([["ts_riley@ts-test.invalid", "30%", "20%"]]);
  });

  it("the team withdraws a request; one made stale underneath it can't apply", async () => {
    const id = (await call("PATCH", `/team/roster/${E.riley}`, "ts_mgr", { teamShareBps: 4000 })).json.shareChange.id;
    expect((await call("POST", `/team/roster/${E.riley}/share-change/withdraw`, "ts_mgr")).json).toMatchObject({ teamShareBps: 2000, shareChange: null });
    expect((await call("POST", `/team/roster/${E.riley}/share-change/withdraw`, "ts_mgr")).status).toBe(409);
    expect((await respond(id, "ts_riley", "ACCEPT")).json.error.message).toMatch(/already withdrawn/);

    const stale = (await call("PATCH", `/team/roster/${E.riley}`, "ts_mgr", { teamShareBps: 4000 })).json.shareChange.id;
    await prisma.athlete.update({ where: { id: E.riley }, data: { teamShareBps: 2500 } });
    const refused = await respond(stale, "ts_riley", "ACCEPT");
    expect(refused.status).toBe(409);
    expect(refused.json.error.message).toMatch(/out of date/);
    expect(await share(E.riley)).toBe(2500);
    await prisma.athlete.update({ where: { id: E.riley }, data: { teamShareBps: 2000 } });
  });

  it("Mia, 13, added at 100%: the team's cut stays at BTG's standard share, her own yes is refused, and only her guardian's counts", async () => {
    const added = await call("POST", "/team/roster", "ts_mgr", { legalName: "Mia Lopez", displayName: "MIA.LOPEZ", email: "ts_mia@ts-test.invalid", sport: "Basketball", ageBand: "UNDER_16", birthDate: "2013-03-01", teamShareBps: 10_000 });
    expect(added.status, added.text).toBe(201);
    E.mia = added.json.id;
    expect(added.json).toMatchObject({ teamShareBps: null, shareChange: { toBps: 10_000 } });
    await prisma.guardian.create({ data: { id: "ts_g", tenantId: E.hawksTenant, legalName: "Carmen Lopez", email: "ts_guardian@ts-test.invalid", relationship: "PARENT", verifiedAt: new Date(), emailConfirmedAt: new Date() } });
    await prisma.athlete.update({ where: { id: E.mia }, data: { guardianId: "ts_g" } });
    await prisma.user.create({ data: { id: "ts_guardian", tenantId: E.hawksTenant, clerkId: "ts_guardian", email: "ts_guardian@ts-test.invalid", roles: ["GUARDIAN"], guardianId: "ts_g" } });

    await call("GET", "/me", "ts_mia");
    const request = await asked("ts_mia");
    const own = await respond(request.id, "ts_mia", "ACCEPT");
    expect(own.status).toBe(403);
    expect(own.text).toMatch(/guardian_must_act/);
    expect(await share(E.mia)).toBeNull();

    expect((await asked("ts_guardian", E.mia)).id).toBe(request.id);
    const yes = await respond(request.id, "ts_guardian", "ACCEPT", E.mia);
    expect(yes.status, yes.text).toBe(200);
    expect(await share(E.mia)).toBe(10_000);
  });

  it("for a minor, the guardian hears of every change: a lower share, and a raise to answer for them", async () => {
    expect((await call("PATCH", `/team/roster/${E.mia}`, "ts_mgr", { teamShareBps: 5000 })).json.teamShareBps).toBe(5000);
    expect((await emails("team.shareLowered")).filter((e) => e.data.to === "50%").map((e) => [e.to, e.data.who]).sort())
      .toEqual([["ts_guardian@ts-test.invalid", "Mia's"], ["ts_mia@ts-test.invalid", "your"]]);
    const raise = (await call("PATCH", `/team/roster/${E.mia}`, "ts_mgr", { teamShareBps: 6000 })).json.shareChange;
    expect((await emails("team.shareChangeAsked")).find((e) => e.to === "ts_guardian@ts-test.invalid" && e.data.to === "60%")?.data)
      .toMatchObject({ who: "Mia's", answerer: "you accept for them" });
    expect((await respond(raise.id, "ts_mia", "ACCEPT")).status).toBe(403);
    expect((await respond(raise.id, "ts_guardian", "DECLINE", E.mia)).json.state).toBe("DECLINED");
    expect(await share(E.mia)).toBe(5000);
  });

  it("leaving the team lapses a request still waiting", async () => {
    const id = (await call("PATCH", `/team/roster/${E.riley}`, "ts_mgr", { teamShareBps: 4500 })).json.shareChange.id;
    expect((await call("POST", "/me/team/leave", "ts_riley")).status).toBe(200);
    expect((await prisma.teamShareChange.findUniqueOrThrow({ where: { id }, select: { state: true } })).state).toBe("LAPSED");
    expect((await respond(id, "ts_riley", "ACCEPT")).status).toBe(409);
    expect(await share(E.riley)).toBeNull();
  });
});
