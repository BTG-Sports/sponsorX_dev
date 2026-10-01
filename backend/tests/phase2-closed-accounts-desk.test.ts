import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   2S1-FE-08 (BTG's Closed accounts desk) — the reads behind it, against the
   real API and database:

     GET /account-closures?tab=asking|btg|owner|age|deleted   one tab, with every tab's count
     GET /account-closures/:id                                one closure, and where its Reinstate is

   BTG admins only, in their own tenant. The subject's own name (the closure
   keeps only a first-name greeting), and the link to the account's own page:
   a sponsor's request, an organisation's onboarding, an athlete's or a
   guardian's New sign-ups profile, an application's own page.

   An account ended at coming of age (TERMINATED) is read-only on the desk
   (found in review): no Decline, not in the asking tab even if it asked
   before that rule, and its public reactivation page says the way back is
   the athlete's government ID on the coming-of-age page — not asking BTG.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@cad-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("2S1-FE-08 · BTG's Closed accounts desk", { timeout: 90_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");

  const T = "cad_btg";
  const OTHER = "cad_other";
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

  async function clean() {
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 5; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = ANY($1)`, [T, OTHER]).catch(() => {});
      }
    }
    await prisma.tenant.deleteMany({ where: { id: { in: [T, OTHER] } } });
  }

  const day = 86_400_000;
  const at = (daysAgo: number) => new Date(Date.now() - daysAgo * day);
  const closure = (id: string, o: Record<string, unknown>) => ({
    id, tenantId: T, contactEmail: `${id}@cad-test.invalid`, retainUntil: new Date(Date.now() + 20 * day), ...o,
  }) as Parameters<typeof prisma.accountClosure.create>[0]["data"];

  beforeAll(async () => {
    await clean();
    await prisma.tenant.createMany({ data: [{ id: T, name: "Closed desk BTG" }, { id: OTHER, name: "Closed desk other" }] });
    await prisma.user.createMany({ data: [
      { id: "cad_admin", tenantId: T, clerkId: "cad_admin", email: "staff@cad-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "cad_sales", tenantId: T, clerkId: "cad_sales", email: "sales@cad-test.invalid", roles: ["SALES"] },
      { id: "cad_other_admin", tenantId: OTHER, clerkId: "cad_other_admin", email: "other@cad-test.invalid", roles: ["BTG_ADMIN"] },
    ] });
    await prisma.athlete.createMany({ data: [
      { id: "cad_riley", tenantId: T, slug: "cad-riley", legalName: "Riley Carter", displayName: "Riley", email: "riley@cad-test.invalid", sport: "Soccer", ageBand: "18_PLUS", state: "ACTIVE" },
      { id: "cad_jordan", tenantId: T, slug: "cad-jordan", legalName: "Jordan Reyes", displayName: "Jordan", email: "jordan@cad-test.invalid", sport: "Track", ageBand: "18_PLUS", state: "SUSPENDED", comingOfAgeTerminatedAt: at(18) },
    ] });
    await prisma.guardian.create({ data: { id: "cad_guard", tenantId: T, legalName: "Morgan Reyes", email: "morgan@cad-test.invalid", relationship: "PARENT" } });
    await prisma.sponsor.create({ data: { id: "cad_bay", tenantId: T, name: "Bay Brewing", categories: ["RESTAURANT"] } });
    await prisma.inquiry.createMany({ data: [
      { id: "cad_inq_bay", tenantId: T, companyName: "Bay Brewing", firstName: "Sam", lastName: "Bay", email: "sam@cad-test.invalid", source: "web-form", state: "REJECTED", sponsorId: "cad_bay" },
      { id: "cad_inq_app", tenantId: T, companyName: "Corner Deli", firstName: "Ana", lastName: "Ruiz", email: "ana@cad-test.invalid", source: "web-form", state: "DECLINED" },
    ] });
    await prisma.property.create({ data: { id: "cad_laurel", tenantId: T, slug: "cad-laurel", name: "Laurel Lions", kind: "TEAM" } });
    await prisma.propertyOnboarding.create({ data: { id: "cad_onb_laurel", tenantId: T, orgType: "TEAM", orgName: "Laurel Lions", state: "REJECTED", propertyId: "cad_laurel" } });

    await prisma.accountClosure.createMany({ data: [
      /* Rejected sponsor, asking to come back. */
      closure("cad_c_bay", {
        subjectKind: "SPONSOR", subjectId: "cad_bay", cause: "REJECTED", reason: "Restricted business type: alcohol.", closedAt: at(11), closedBy: "cad_admin",
        displayName: "Sam", reactivationRequestedAt: at(3), reactivationRequestNote: "We’re a café and bakery now.",
      }),
      /* Rejected organisation, asking. */
      closure("cad_c_laurel", {
        subjectKind: "PROPERTY", subjectId: "cad_laurel", cause: "REJECTED", reason: "Could not verify the club.", closedAt: at(7), closedBy: "cad_admin",
        displayName: "Laurel Lions", reactivationRequestedAt: at(1),
      }),
      /* A sponsor request declined before an account opened, asking. */
      closure("cad_c_app", {
        subjectKind: "INQUIRY", subjectId: "cad_inq_app", cause: "REJECTED", reason: "No proof of business.", closedAt: at(5), closedBy: "cad_admin",
        displayName: "Ana", reactivationRequestedAt: at(0),
      }),
      /* Closed by the owner. */
      closure("cad_c_riley", { subjectKind: "ATHLETE", subjectId: "cad_riley", cause: "SELF", closedAt: at(7), closedBy: "cad_u_riley_gone", displayName: "Riley" }),
      /* Ended at coming of age (the system closed it) — and it asked BTG
         before asking was refused for one: still not BTG's to answer. */
      closure("cad_c_jordan", {
        subjectKind: "ATHLETE", subjectId: "cad_jordan", cause: "TERMINATED", reason: "The 90-day coming-of-age allowance ended without a government ID.", closedAt: at(18),
        displayName: "Jordan", contactEmail: "jordan@cad-test.invalid", reactivationRequestedAt: at(2),
      }),
      /* Their guardian's account, ended with it. */
      closure("cad_c_guard_age", { subjectKind: "GUARDIAN", subjectId: "cad_guard_age", cause: "TERMINATED", reason: "Ended with Jordan's coming-of-age allowance.", closedAt: at(19), displayName: "Pat" }),
      /* A rejected guardian whose request was already declined. */
      closure("cad_c_guard", {
        subjectKind: "GUARDIAN", subjectId: "cad_guard", cause: "REJECTED", reason: "ID didn't match.", closedAt: at(4), closedBy: "cad_admin", displayName: "Morgan",
        reactivationRequestedAt: at(3), reactivationDecision: "DECLINED", reactivationDecidedAt: at(2), reactivationDecidedBy: "cad_admin", reactivationDecisionNote: "Still no match.",
      }),
      /* Files deleted. */
      closure("cad_c_gone", { subjectKind: "ATHLETE", subjectId: "cad_athlete_gone", cause: "SELF", state: "PURGED", closedAt: at(36), retainUntil: at(6), purgedAt: at(6), contactEmail: "", displayName: "Lee" }),
      /* Came back: in no tab. */
      closure("cad_c_back", { subjectKind: "ATHLETE", subjectId: "cad_riley", cause: "SELF", state: "REACTIVATED", closedAt: at(40), reactivatedAt: at(35), displayName: "Riley" }),
      /* Another tenant's. */
      { ...closure("cad_c_other", { subjectKind: "ATHLETE", subjectId: "cad_x", cause: "REJECTED", displayName: "Other" }), tenantId: OTHER },
    ] });
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server?.close();
    await clean();
  });

  it("lists one tab at a time, newest first, with every tab's count and each account's own name", async () => {
    const asking = await call("GET", "/account-closures?tab=asking", "cad_admin");
    expect(asking.status, asking.text).toBe(200);
    expect(asking.json.counts).toEqual({ asking: 3, btg: 4, owner: 1, age: 2, deleted: 1 });
    expect(asking.json.closures.map((c: { id: string }) => c.id)).toEqual(["cad_c_app", "cad_c_laurel", "cad_c_bay"]);
    const bay = asking.json.closures.find((c: { id: string }) => c.id === "cad_c_bay");
    expect(bay).toMatchObject({ name: "Bay Brewing", kind: "SPONSOR", cause: "REJECTED", state: "CLOSED", application: false, requestNote: "We’re a café and bakery now." });
    expect(asking.json.closures.find((c: { id: string }) => c.id === "cad_c_app")).toMatchObject({ name: "Corner Deli", application: true });
    expect(asking.json.closures.find((c: { id: string }) => c.id === "cad_c_laurel").name).toBe("Laurel Lions");

    const tab = async (t: string) => (await call("GET", `/account-closures?tab=${t}`, "cad_admin")).json.closures.map((c: { id: string }) => c.id);
    expect(await tab("btg")).toEqual(["cad_c_guard", "cad_c_app", "cad_c_laurel", "cad_c_bay"]);
    expect(await tab("owner")).toEqual(["cad_c_riley"]);
    expect(await tab("age")).toEqual(["cad_c_jordan", "cad_c_guard_age"]);
    expect(await tab("deleted")).toEqual(["cad_c_gone"]);
    /* The older filter still answers the same as tab=asking. */
    expect((await call("GET", "/account-closures?requested=true", "cad_admin")).json.closures).toHaveLength(3);
    expect((await call("GET", "/account-closures?tab=nope", "cad_admin")).status).toBe(400);
  });

  it("reads one closure with the link to the account's own page, where Reinstate is", async () => {
    const bay = await call("GET", "/account-closures/cad_c_bay", "cad_admin");
    expect(bay.status, bay.text).toBe(200);
    expect(bay.json).toMatchObject({
      name: "Bay Brewing", subjectHref: "/admin/sponsor-requests/cad_inq_bay", reinstatable: true, canDecline: true,
      closedByEmail: "staff@cad-test.invalid", contactEmail: "cad_c_bay@cad-test.invalid", decision: null,
    });
    expect((await call("GET", "/account-closures/cad_c_laurel", "cad_admin")).json).toMatchObject({ subjectHref: "/admin/onboarding/cad_onb_laurel", reinstatable: true });
    expect((await call("GET", "/account-closures/cad_c_app", "cad_admin")).json).toMatchObject({
      subjectHref: "/admin/sponsor-requests/cad_inq_app", application: true, reinstatable: false, canDecline: true,
    });
    expect((await call("GET", "/account-closures/cad_c_guard", "cad_admin")).json).toMatchObject({
      subjectHref: "/admin/new-signups/guardians/cad_guard", reinstatable: true, canDecline: false,
      decision: "DECLINED", decidedByEmail: "staff@cad-test.invalid", decisionNote: "Still no match.",
    });
    /* The owner's own closure: nothing for BTG to do, and the owner is not named as staff. */
    expect((await call("GET", "/account-closures/cad_c_riley", "cad_admin")).json).toMatchObject({
      name: "Riley Carter", subjectHref: "/admin/new-signups/athletes/cad_riley", reinstatable: false, canDecline: false, closedByEmail: null, standing: "CLOSED_SELF",
    });
    expect((await call("GET", "/account-closures/cad_c_jordan", "cad_admin")).json).toMatchObject({ cause: "TERMINATED", closedByEmail: null, reinstatable: false, canDecline: false, standing: "CLOSED_AT_AGE" });
    expect((await call("GET", "/account-closures/cad_c_gone", "cad_admin")).json).toMatchObject({ state: "PURGED", standing: "EXPIRED", reinstatable: false, name: "Lee" });
  });

  it("declining from the desk shows on the closure and leaves the asking tab", async () => {
    const d = await call("POST", "/account-closures/cad_c_laurel/reactivation-decision", "cad_admin", { decision: "DECLINE", note: "We still can't verify the club." });
    expect(d.status, d.text).toBe(200);
    const after = await call("GET", "/account-closures/cad_c_laurel", "cad_admin");
    expect(after.json).toMatchObject({ decision: "DECLINED", decisionNote: "We still can't verify the club.", canDecline: false, reinstatable: true });
    expect((await call("GET", "/account-closures?tab=asking", "cad_admin")).json.counts.asking).toBe(2);
  });

  it("is BTG admins' only, in their own tenant", async () => {
    expect((await call("GET", "/account-closures?tab=btg", "cad_sales")).status).toBe(403);
    expect((await call("GET", "/account-closures/cad_c_bay", "cad_sales")).status).toBe(403);
    expect((await call("GET", "/account-closures/cad_c_bay")).status).toBe(401);
    /* Another tenant's BTG admin sees none of these, and cannot read one. */
    const other = await call("GET", "/account-closures?tab=btg", "cad_other_admin");
    expect(other.json.closures.map((c: { id: string }) => c.id)).toEqual(["cad_c_other"]);
    expect((await call("GET", "/account-closures/cad_c_bay", "cad_other_admin")).status).toBe(403);
    expect((await call("GET", "/account-closures/cad_c_other", "cad_admin")).status).toBe(403);
  });

  it("an account ended at coming of age is read-only: no Decline, and its way back is the government ID, not BTG", async () => {
    const { reactivateUrl } = await import("../src/domain/account-closure");
    const { readComingOfAgeToken } = await import("../src/lib/signup-token");
    /* The desk cannot decline it, though it asked. */
    const d = await call("POST", "/account-closures/cad_c_jordan/reactivation-decision", "cad_admin", { decision: "DECLINE", note: "No." });
    expect(d.status).toBe(409);
    expect(d.text).toContain("government ID brings it back");
    expect((await prisma.accountClosure.findUniqueOrThrow({ where: { id: "cad_c_jordan" }, select: { reactivationDecision: true } })).reactivationDecision).toBeNull();

    /* The athlete's public page: ended at coming of age, with the coming-of-age page to upload on. */
    const t = (id: string) => encodeURIComponent(new URL(reactivateUrl(id, new Date(Date.now() + day))).searchParams.get("t")!);
    const status = await call("GET", `/public/account/reactivation/${t("cad_c_jordan")}`);
    expect(status.status, status.text).toBe(200);
    expect(status.json).toMatchObject({ standing: "CLOSED_AT_AGE", kind: "ATHLETE", greeting: "Jordan" });
    expect(status.json.comingOfAgePath).toMatch(/^\/coming-of-age\//);
    expect(readComingOfAgeToken(decodeURIComponent(status.json.comingOfAgePath.split("/coming-of-age/")[1]))).toBe("cad_jordan");
    /* That page takes the ID: the window is open for the 30 days after termination. */
    const page = await call("GET", `/public${status.json.comingOfAgePath}`);
    expect(page.json).toMatchObject({ window: "reactivate", idUploaded: false });

    /* Neither asking BTG nor reactivating is the way back. */
    const ask = await call("POST", `/public/account/reactivation/${t("cad_c_jordan")}`, undefined, { action: "REQUEST", note: "Please." });
    expect(ask.status).toBe(409);
    expect(ask.text).toContain("uploads their government ID");
    const self = await call("POST", `/public/account/reactivation/${t("cad_c_jordan")}`, undefined, { action: "REACTIVATE" });
    expect(self.status).toBe(403);

    /* The guardian's closure: the same standing, and no upload link — the ID is the athlete's to upload. */
    const g = await call("GET", `/public/account/reactivation/${t("cad_c_guard_age")}`);
    expect(g.json).toMatchObject({ standing: "CLOSED_AT_AGE", kind: "GUARDIAN", comingOfAgePath: null });
  });
});
