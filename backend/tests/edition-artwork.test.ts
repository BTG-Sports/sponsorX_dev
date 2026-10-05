import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
/* 2S8-SEC-03 — registering a creative or artwork upload HEADs the object.
   There is no bucket here, so the file stands in as arrived exactly as its
   grant pinned it; tests/private-upload-pins.test.ts checks the real thing. */
vi.mock("../src/lib/storage", async (original) => ({
  ...(await original<typeof import("../src/lib/storage")>()),
  checkPrivateUpload: async (_actor: unknown, _key: string, expected: { bytes?: number | null }) => ({ ok: true as const, bytes: expected.bytes ?? 1 }),
}));

import {
  ARTWORK_APPROVED_STATES,
  ARTWORK_STATES,
  artworkBlockers,
  artworkKeyPrefix,
  artworkTurn,
  canUploadArtwork,
  describeBlocker,
} from "../src/domain/edition-artwork-rules";
import { canTransitionDeliverable } from "../src/domain/deliverable-state";

/* --------------------------------------------------------------------------
   P9-BE-16 — edition ad artwork through the approval board.

   Done when: "Artwork for a sold slot reaches BTG review and the sponsor's
   sign-off on the existing approval board, with no new state machine; an
   edition cannot enter production while any sold slot's artwork is
   unapproved; the decisions are audited."

   Over HTTP through the production auth, scope, route and domain code (only
   Clerk and the rate limiter stubbed), over a real database:

   1. Sold slot → upload → BTG review → sponsor sign-off → APPROVED, on the
      board read (`subject: EDITION_ARTWORK`) and the sponsor's campaign read.
   2. The revision path, at each reviewer's own step, note required.
   3. Wrong sponsor: 403 at every step; BTG cannot sign off for a sponsor.
   4. The production gate: refused while any sold slot's artwork is missing
      or unapproved, allowed once both are approved; artwork locks after.
   5. Audit rows and the emails to the other party.
   (Tenant isolation for the new routes is in tests/tenant-isolation.test.ts.)
   -------------------------------------------------------------------------- */

describe("P9-BE-16 · artwork rules (pure)", () => {
  it("reuses the deliverable states: every artwork state is a deliverable state, APPROVED is the only approved one", () => {
    expect(ARTWORK_STATES).toEqual(["DRAFT_SUBMITTED", "BTG_REVIEW", "SPONSOR_REVIEW", "APPROVED"]);
    expect(ARTWORK_APPROVED_STATES).toEqual(["APPROVED"]);
    /* The chain artwork walks is legal in the deliverable table, move for move. */
    for (const [from, to] of [
      ["NOT_STARTED", "DRAFT_SUBMITTED"], ["DRAFT_SUBMITTED", "BTG_REVIEW"], ["BTG_REVIEW", "SPONSOR_REVIEW"],
      ["SPONSOR_REVIEW", "APPROVED"], ["BTG_REVIEW", "DRAFT_SUBMITTED"], ["SPONSOR_REVIEW", "DRAFT_SUBMITTED"],
    ] as const) expect(canTransitionDeliverable(from, to), `${from} → ${to}`).toBe(true);
  });

  it("blocks production on every sold slot without approved artwork, and never on an unsold one", () => {
    expect(artworkBlockers([
      { slotCode: "BACK", campaignId: "c1", artwork: null },
      { slotCode: "P02-HALF", campaignId: "c2", artwork: { reviewState: "SPONSOR_REVIEW" } },
      { slotCode: "P03-HALF", campaignId: "c3", artwork: { reviewState: "APPROVED" } },
      { slotCode: "P04-QTR", campaignId: null, artwork: null },
    ])).toEqual([{ slotCode: "BACK", state: "NOT_STARTED" }, { slotCode: "P02-HALF", state: "SPONSOR_REVIEW" }]);
    expect(describeBlocker({ slotCode: "BACK", state: "NOT_STARTED" })).toBe("BACK (no artwork yet)");
    expect(describeBlocker({ slotCode: "BACK", state: "DRAFT_SUBMITTED" }, true)).toBe("BACK (sent back for changes)");
  });

  it("says whose move it is, and allows a new file only while it is with its supplier", () => {
    expect(artworkTurn("NOT_STARTED", false)).toBe("SUPPLIER");
    expect(artworkTurn("DRAFT_SUBMITTED", true)).toBe("SUPPLIER");
    expect(artworkTurn("DRAFT_SUBMITTED", false)).toBe("BTG");
    expect(artworkTurn("BTG_REVIEW", false)).toBe("BTG");
    expect(artworkTurn("SPONSOR_REVIEW", false)).toBe("SPONSOR");
    expect(artworkTurn("APPROVED", false)).toBe("DONE");
    expect(["NOT_STARTED", "DRAFT_SUBMITTED", "BTG_REVIEW", "SPONSOR_REVIEW", "APPROVED"].filter((s) => canUploadArtwork(s as never)))
      .toEqual(["NOT_STARTED", "DRAFT_SUBMITTED"]);
    expect(artworkKeyPrefix("t1", "slot1")).toBe("t/t1/ad-slot/slot1/");
  });
});

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@eart-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("P9-BE-16 · edition ad artwork through the approval board", async () => {
  const pg = (await import("pg")).default;
  const { prisma } = await import("../src/db/client");
  const { seedPackages } = await import("../worker/jobs/seed-catalogue.mts");
  const { createBrief, transitionBrief } = await import("../src/domain/brief");
  const { createCampaignFromBrief } = await import("../src/domain/campaign");
  const { createApp } = await import("../src/app");

  const T = "eart_tenant";
  const STAFF = "eart_staff";
  const CM = "eart_cm";
  const ROSA = "eart_rosa";
  const ROSA_ANALYST = "eart_rosa_analyst";
  const KIM = "eart_kim";
  const DAY = 864e5;
  const staffActor = {
    userId: STAFF, tenantId: T, roles: ["BTG_ADMIN" as const],
    sponsorId: null, athleteId: null, guardianId: null, propertyId: null,
  };
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";

  let editionId = "";
  let backSlot = "";
  let halfSlot = "";
  let openSlot = "";
  let rosaCampaign = "";
  let kimCampaign = "";
  let backArt = "";
  let halfArt = "";

  const call = async (method: string, path: string, clerk: string | null, body?: unknown) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: { ...(clerk ? { "x-test-clerk": clerk } : {}), "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };

  async function clean() {
    for (const t of ["ContentRight", "EditionAsset", "EditionEvent", "RevenueSplit", "AdSlot", "OutboxJob", "SyncTask",
      "AuditLog", "Campaign", "CampaignBrief", "Edition", "Publication", "SponsorPackage", "SponsorContact", "Sponsor", "User"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T);
    }
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  async function campaignFor(sponsorId: string, packageCode: string, name: string) {
    const pkg = await prisma.sponsorPackage.findFirstOrThrow({ where: { tenantId: T, code: packageCode }, select: { id: true, priceLow: true } });
    const brief = await createBrief(staffActor, {
      sponsorId, objective: `EArt ${name}`, budget: pkg.priceLow * 100, packageId: pkg.id,
      startDate: new Date("2026-10-01"), endDate: new Date("2026-11-30"), sports: [], stateCodes: ["MD"], categories: [],
    });
    await transitionBrief(staffActor, brief.id, "QUALIFIED");
    await transitionBrief(staffActor, brief.id, "APPROVED");
    return (await createCampaignFromBrief(staffActor, brief.id, name)).id;
  }

  /** Presign as `who`, then register the key — the two upload calls. */
  async function upload(who: string, slotId: string) {
    const signed = await call("POST", `/ad-slots/${slotId}/artwork/uploads`, who, { contentType: "image/png", bytes: 48_213 });
    expect(signed.status, signed.text).toBe(201);
    expect(signed.json.key.startsWith(`t/${T}/ad-slot/${slotId}/`)).toBe(true);
    return call("POST", `/ad-slots/${slotId}/artwork`, who, { r2Key: signed.json.key });
  }

  const step = (who: string, id: string, verb: string, body?: unknown) => call("POST", `/edition-artwork/${id}/${verb}`, who, body ?? {});
  const stateOf = async (id: string) => (await prisma.editionAsset.findUniqueOrThrow({ where: { id }, select: { reviewState: true } })).reviewState;

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "Edition artwork test tenant" } });
    await prisma.sponsor.createMany({ data: [
      { id: "eart_rosa_sp", tenantId: T, name: "EArt Rosa's Bakery" },
      { id: "eart_kim_sp", tenantId: T, name: "EArt Kim's Auto" },
    ] });
    await prisma.user.createMany({ data: [
      { id: STAFF, tenantId: T, clerkId: STAFF, email: "ops@eart.invalid", roles: ["BTG_ADMIN"] },
      { id: CM, tenantId: T, clerkId: CM, email: "cm@eart.invalid", roles: ["CAMPAIGN_MGR"] },
      { id: ROSA, tenantId: T, clerkId: ROSA, email: "rosa@eart.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "eart_rosa_sp" },
      { id: ROSA_ANALYST, tenantId: T, clerkId: ROSA_ANALYST, email: "rosa.analyst@eart.invalid", roles: ["SPONSOR_ANALYST"], sponsorId: "eart_rosa_sp" },
      { id: KIM, tenantId: T, clerkId: KIM, email: "kim@eart.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "eart_kim_sp" },
    ] });
    const pool = new pg.Pool({ connectionString: seededDb.TEST_DATABASE_URL });
    const client = await pool.connect();
    try { await seedPackages(client, T); } finally { client.release(); await pool.end(); }
    rosaCampaign = await campaignFor("eart_rosa_sp", "NEXT-AD-BACK-COVER", "EArt Rosa back cover");
    kimCampaign = await campaignFor("eart_kim_sp", "NEXT-AD-HALF", "EArt Kim half page");
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    /* An edition with a back cover sold to Rosa, a half page sold to Kim and one quarter left open. */
    const pub = await call("POST", "/publications", STAFF, { name: "EArt Regional Record", propertyId: null });
    expect(pub.status, pub.text).toBe(201);
    const e = await call("POST", `/publications/${pub.json.id}/editions`, STAFF, {
      label: "EArt Fall", closeDate: new Date(Date.now() + 30 * DAY).toISOString(),
      publishTarget: new Date(Date.now() + 40 * DAY).toISOString(), thresholdCents: 100_000,
    });
    editionId = e.json.id;
    expect((await call("POST", `/editions/${editionId}/transition`, STAFF, { to: "SELLING" })).status).toBe(200);
    backSlot = (await call("POST", `/editions/${editionId}/slots`, STAFF, { slotCode: "BACK", kind: "BACK_COVER", priceCents: 100_000 })).json.id;
    halfSlot = (await call("POST", `/editions/${editionId}/slots`, STAFF, { slotCode: "P02-HALF", kind: "HALF", priceCents: 50_000 })).json.id;
    openSlot = (await call("POST", `/editions/${editionId}/slots`, STAFF, { slotCode: "P03-QTR", kind: "QUARTER", priceCents: 25_000 })).json.id;
    expect((await call("POST", `/editions/${editionId}/sales`, STAFF, { campaignId: rosaCampaign })).status).toBe(201);
    expect((await call("POST", `/editions/${editionId}/sales`, STAFF, { campaignId: kimCampaign })).status).toBe(201);
  });

  afterAll(async () => {
    server?.close();
    await clean();
  });

  it("1 · a sold slot's artwork reaches BTG review and the buying sponsor's sign-off, on the board and on the sponsor's page", async () => {
    /* Before any file: the sponsor's page lists the slot with nothing on it. */
    const before = await call("GET", `/campaigns/${rosaCampaign}/artwork`, ROSA);
    expect(before.status, before.text).toBe(200);
    expect(before.json.slots).toEqual([expect.objectContaining({ slotId: backSlot, slotCode: "BACK", open: true, artwork: null, edition: expect.objectContaining({ id: editionId, label: "EArt Fall" }) })]);

    /* An unsold slot takes no artwork. */
    expect((await call("POST", `/ad-slots/${openSlot}/artwork/uploads`, STAFF, { contentType: "image/png", bytes: 48_213 })).status).toBe(403);

    /* Rosa uploads her own back cover. It passes the automatic checks, and
       the system puts it on BTG's desk (P9-BE-22): no record yet, no skip. */
    const first = await upload(ROSA, backSlot);
    expect(first.status, first.text).toBe(201);
    expect(first.json).toEqual(expect.objectContaining({ id: expect.any(String), state: "BTG_REVIEW", version: 1, route: "BTG_REVIEW", btgReviewSkipped: false }));
    backArt = first.json.id;
    expect(await prisma.editionAsset.findUniqueOrThrow({ where: { id: backArt }, select: { kind: true, adSlotId: true, editionId: true, sourceKind: true } }))
      .toEqual({ kind: "AD_CREATIVE", adSlotId: backSlot, editionId, sourceKind: "THIRD_PARTY" });

    /* The board lists it beside deliverables, as its own kind of subject. */
    const board = await call("GET", "/edition-artwork?state=DRAFT_SUBMITTED,BTG_REVIEW,SPONSOR_REVIEW", CM);
    expect(board.status, board.text).toBe(200);
    expect(board.json.artwork).toEqual([expect.objectContaining({
      subject: "EDITION_ARTWORK", id: backArt, state: "BTG_REVIEW", version: 1, revision: null,
      edition: expect.objectContaining({ id: editionId, label: "EArt Fall", publication: "EArt Regional Record" }),
      slot: { id: backSlot, slotCode: "BACK", kind: "BACK_COVER" },
      campaign: { id: rosaCampaign, name: "EArt Rosa back cover", sponsorName: "EArt Rosa's Bakery" },
    })]);

    /* BTG's steps (a CAMPAIGN_MGR, the deliverable desk's role). It is
       already on the desk, so picking it up by hand is an illegal move. */
    expect((await step(CM, backArt, "btg-review")).status).toBe(409);
    /* An ad does not skip its sponsor: approving from BTG_REVIEW is refused. */
    const early = await step(ROSA, backArt, "approve");
    expect(early.status).toBe(409);
    expect(early.text).toMatch(/BTG reviews the artwork/);
    expect((await step(CM, backArt, "sponsor-review")).json).toEqual({ id: backArt, state: "SPONSOR_REVIEW" });

    /* The signed preview, for the sponsor and the desk. */
    expect((await call("GET", `/edition-artwork/${backArt}/url`, ROSA)).json.url).toMatch(/^http/);

    /* Only the buying sponsor signs off. */
    expect((await step(ROSA, backArt, "approve")).json).toEqual({ id: backArt, state: "APPROVED" });
    const after = await call("GET", `/campaigns/${rosaCampaign}/artwork`, ROSA);
    expect(after.json.slots[0].artwork).toEqual(expect.objectContaining({ id: backArt, state: "APPROVED", subject: "EDITION_ARTWORK" }));

    /* Approved artwork cannot be replaced. */
    const signed = await call("POST", `/ad-slots/${backSlot}/artwork/uploads`, ROSA, { contentType: "image/png", bytes: 48_213 });
    expect((await call("POST", `/ad-slots/${backSlot}/artwork`, ROSA, { r2Key: signed.json.key })).status).toBe(409);
  });

  it("2 · changes are asked for at each reviewer's own step, with a required note; the next upload answers them", async () => {
    /* BTG uploads Kim's half page on Kim's behalf. */
    const first = await upload(STAFF, halfSlot);
    expect(first.status, first.text).toBe(201);
    halfArt = first.json.id;
    expect(first.json.state).toBe("BTG_REVIEW");

    /* No note, no revision. */
    expect((await step(STAFF, halfArt, "revision", { reason: "" })).status).toBe(400);
    /* The sponsor cannot ask while BTG still has it. */
    const kimEarly = await step(KIM, halfArt, "revision", { reason: "Darker logo" });
    expect(kimEarly.status).toBe(409);
    expect(kimEarly.text).toMatch(/BTG is still reviewing/);

    /* BTG asks for changes: back to DRAFT_SUBMITTED, the note on the row. */
    const bounced = await step(STAFF, halfArt, "revision", { reason: "Logo is cut off at the trim line" });
    expect(bounced.json).toEqual({ id: halfArt, state: "DRAFT_SUBMITTED" });
    expect(await prisma.editionAsset.findUniqueOrThrow({ where: { id: halfArt }, select: { revisionNote: true } }))
      .toEqual({ revisionNote: "Logo is cut off at the trim line" });
    /* Nothing new to review until a new file lands. */
    expect((await step(STAFF, halfArt, "btg-review")).status).toBe(409);
    const kimView = (await call("GET", `/campaigns/${kimCampaign}/artwork`, KIM)).json.slots[0].artwork;
    expect(kimView.revision).toEqual({ reason: "Logo is cut off at the trim line" });

    /* Kim uploads version 2: the note is answered. */
    const second = await upload(KIM, halfSlot);
    expect(second.json).toEqual(expect.objectContaining({ id: halfArt, state: "BTG_REVIEW", version: 2 }));
    expect((await prisma.editionAsset.findUniqueOrThrow({ where: { id: halfArt }, select: { revisionNote: true } })).revisionNote).toBeNull();

    /* Mid-review the file cannot change. */
    const signed = await call("POST", `/ad-slots/${halfSlot}/artwork/uploads`, KIM, { contentType: "image/png", bytes: 48_213 });
    expect((await call("POST", `/ad-slots/${halfSlot}/artwork`, KIM, { r2Key: signed.json.key })).status).toBe(409);
    expect((await step(STAFF, halfArt, "sponsor-review")).status).toBe(200);
    /* With the sponsor, BTG cannot ask for changes — it is the sponsor's step. */
    const btgLate = await step(STAFF, halfArt, "revision", { reason: "Late thought" });
    expect(btgLate.status).toBe(409);
    expect(btgLate.text).toMatch(/with the sponsor/);

    /* The sponsor asks for changes at their step. */
    expect((await step(KIM, halfArt, "revision", { reason: "Use the fall phone number" })).json).toEqual({ id: halfArt, state: "DRAFT_SUBMITTED" });
    expect(await stateOf(halfArt)).toBe("DRAFT_SUBMITTED");
  });

  it("3 · a different sponsor is refused at every step, BTG cannot sign off for a sponsor, an analyst only reads", async () => {
    /* Back to SPONSOR_REVIEW for Kim's half page, with a version 3. */
    expect((await upload(KIM, halfSlot)).json.version).toBe(3);
    expect((await step(CM, halfArt, "sponsor-review")).status).toBe(200);

    /* Rosa is not the buyer of the half page. */
    expect((await step(ROSA, halfArt, "approve")).status).toBe(403);
    expect((await step(ROSA, halfArt, "revision", { reason: "Not mine" })).status).toBe(403);
    expect((await call("GET", `/edition-artwork/${halfArt}/url`, ROSA)).status).toBe(403);
    expect((await call("POST", `/ad-slots/${halfSlot}/artwork/uploads`, ROSA, { contentType: "image/png", bytes: 48_213 })).status).toBe(403);
    expect((await call("GET", `/campaigns/${kimCampaign}/artwork`, ROSA)).status).toBe(403);
    /* Her board read holds her own artwork only. */
    expect(((await call("GET", "/edition-artwork", ROSA)).json.artwork as Array<{ id: string }>).map((a) => a.id)).toEqual([backArt]);

    /* BTG does not hold the sponsor's sign-off. */
    expect((await step(STAFF, halfArt, "approve")).status).toBe(403);
    expect((await step(CM, halfArt, "approve")).status).toBe(403);
    /* A sponsor cannot run BTG's steps. */
    expect((await step(KIM, halfArt, "sponsor-review")).status).toBe(403);
    expect((await step(KIM, halfArt, "btg-review")).status).toBe(403);
    /* The sponsor's analyst reads, and decides nothing. */
    expect((await call("GET", `/campaigns/${rosaCampaign}/artwork`, ROSA_ANALYST)).status).toBe(200);
    expect((await call("POST", `/ad-slots/${backSlot}/artwork/uploads`, ROSA_ANALYST, { contentType: "image/png", bytes: 48_213 })).status).toBe(403);
    expect(await stateOf(halfArt)).toBe("SPONSOR_REVIEW");

    /* A key that was not issued for this slot is not attached to it. */
    expect((await call("POST", `/ad-slots/${halfSlot}/artwork`, STAFF, { r2Key: `t/${T}/ad-slot/${backSlot}/x` })).status).toBe(422);
  });

  it("4 · the edition cannot enter production while any sold slot's artwork is unapproved, and can once all are", async () => {
    expect((await call("POST", `/editions/${editionId}/transition`, STAFF, { to: "CLOSED" })).json.state).toBe("CLOSED");
    expect((await call("POST", `/editions/${editionId}/conditions`, STAFF, { contentReady: true })).status).toBe(200);
    /* Licences for both, by hand — the rights gate is not what is tested
       here (Rosa's approval already recorded hers, P9-BE-22; a second does no harm). */
    for (const [id, ref] of [[backArt, "EArt-IO-1"], [halfArt, "EArt-IO-2"]] as const) {
      expect((await call("POST", `/edition-assets/${id}/rights`, STAFF, {
        grantorKind: "THIRD_PARTY", grantorRef: "sponsor", mayPublishDigital: true, startsAt: new Date().toISOString(), licenseRef: ref,
      })).status).toBe(201);
    }

    /* Kim's half page waits for Kim: production is refused, and says why. */
    const refused = await call("POST", `/editions/${editionId}/transition`, STAFF, { to: "IN_PRODUCTION" });
    expect(refused.status).toBe(409);
    expect(refused.json.error.missing).toEqual(["artworkApproved"]);
    expect(refused.json.error.problems).toEqual(["Ad artwork not approved: P02-HALF (waiting for the sponsor's sign-off)."]);
    expect((await call("GET", `/editions/${editionId}`, STAFF)).json.state).toBe("CLOSED");

    /* The edition page carries the same answer before anyone clicks. */
    const listed = ((await call("GET", "/editions", STAFF)).json.editions as Array<{ id: string; artworkPending: number }>).find((e) => e.id === editionId);
    expect(listed?.artworkPending).toBe(1);
    const ledger = (await call("GET", `/editions/${editionId}/ledger`, STAFF)).json.slots as Array<{ slotCode: string; artwork?: { state: string } | null }>;
    expect(ledger.map((s) => [s.slotCode, s.artwork === undefined ? "—" : s.artwork?.state ?? null])).toEqual([
      ["BACK", "APPROVED"], ["P02-HALF", "SPONSOR_REVIEW"], ["P03-QTR", "—"],
    ]);

    /* Kim signs off: nothing stands in the way. */
    expect((await step(KIM, halfArt, "approve")).json.state).toBe("APPROVED");
    expect((await call("POST", `/editions/${editionId}/transition`, STAFF, { to: "IN_PRODUCTION" })).json.state).toBe("IN_PRODUCTION");

    /* In production the artwork is final. */
    const signed = await call("POST", `/ad-slots/${halfSlot}/artwork/uploads`, KIM, { contentType: "image/png", bytes: 48_213 });
    const locked = await call("POST", `/ad-slots/${halfSlot}/artwork`, KIM, { r2Key: signed.json.key });
    expect(locked.status).toBe(409);
    expect(locked.text).toMatch(/IN_PRODUCTION/);
  });

  it("4b · a sold slot with no artwork at all also refuses production", async () => {
    const e = await call("POST", `/publications/${(await prisma.publication.findFirstOrThrow({ where: { tenantId: T }, select: { id: true } })).id}/editions`, STAFF, {
      label: "EArt Winter", closeDate: new Date(Date.now() + 30 * DAY).toISOString(),
      publishTarget: new Date(Date.now() + 40 * DAY).toISOString(), thresholdCents: 0,
    });
    const id = e.json.id as string;
    await call("POST", `/editions/${id}/transition`, STAFF, { to: "SELLING" });
    await call("POST", `/editions/${id}/slots`, STAFF, { slotCode: "BACK", kind: "BACK_COVER", priceCents: 100_000 });
    const winter = await campaignFor("eart_rosa_sp", "NEXT-AD-BACK-COVER", "EArt Rosa winter");
    expect((await call("POST", `/editions/${id}/sales`, STAFF, { campaignId: winter })).status).toBe(201);
    await call("POST", `/editions/${id}/transition`, STAFF, { to: "CLOSED" });
    await call("POST", `/editions/${id}/conditions`, STAFF, { contentReady: true });
    const refused = await call("POST", `/editions/${id}/transition`, STAFF, { to: "IN_PRODUCTION" });
    expect(refused.status).toBe(409);
    expect(refused.json.error.missing).toEqual(["artworkApproved"]);
    expect(refused.json.error.problems).toEqual(["Ad artwork not approved: BACK (no artwork yet)."]);

    /* A SUPER_ADMIN's scope crosses tenants: the gate asks about the edition's
       tenant, not theirs, so they are refused just the same (review fix). */
    const XT = "eart_tenant_super";
    await prisma.tenant.upsert({ where: { id: XT }, create: { id: XT, name: "EArt other tenant" }, update: {} });
    await prisma.user.upsert({
      where: { id: "eart_super" }, update: {},
      create: { id: "eart_super", tenantId: XT, clerkId: "eart_super", email: "super@eart.invalid", roles: ["SUPER_ADMIN"] },
    });
    try {
      const asSuper = await call("POST", `/editions/${id}/transition`, "eart_super", { to: "IN_PRODUCTION" });
      expect(asSuper.status, asSuper.text).toBe(409);
      expect(asSuper.json.error.missing).toEqual(["artworkApproved"]);
    } finally {
      await prisma.auditLog.deleteMany({ where: { tenantId: XT } });
      await prisma.user.deleteMany({ where: { id: "eart_super" } });
      await prisma.tenant.deleteMany({ where: { id: XT } });
    }
  });

  it("5 · every decision is audited, and the other party is emailed", async () => {
    const rows = await prisma.auditLog.findMany({
      where: { tenantId: T, entity: "EditionAsset", action: { startsWith: "editionArtwork." } },
      select: { action: true, actorId: true, entityId: true, before: true, after: true },
      orderBy: [{ at: "asc" }, { id: "asc" }],
    });
    const of = (id: string) => rows.filter((r) => r.entityId === id).map((r) => [r.action, r.actorId]);
    expect(of(backArt)).toEqual([
      /* P9-BE-22 — the pick-up is the system's (actor null), on upload. */
      ["editionArtwork.submit", ROSA], ["editionArtwork.btgReview", null], ["editionArtwork.sponsorReview", CM], ["editionArtwork.approve", ROSA],
    ]);
    expect(of(halfArt)).toEqual([
      ["editionArtwork.submit", STAFF], ["editionArtwork.btgReview", null], ["editionArtwork.requestRevision", STAFF],
      ["editionArtwork.submit", KIM], ["editionArtwork.btgReview", null], ["editionArtwork.sponsorReview", STAFF],
      ["editionArtwork.requestRevision", KIM], ["editionArtwork.submit", KIM], ["editionArtwork.btgReview", null],
      ["editionArtwork.sponsorReview", CM], ["editionArtwork.approve", KIM],
    ]);
    /* The reason is on the audit row, with who asked. */
    const revisions = rows.filter((r) => r.action === "editionArtwork.requestRevision").map((r) => r.after);
    expect(revisions).toEqual([
      expect.objectContaining({ state: "DRAFT_SUBMITTED", reason: "Logo is cut off at the trim line", by: "BTG" }),
      expect.objectContaining({ state: "DRAFT_SUBMITTED", reason: "Use the fall phone number", by: "SPONSOR" }),
    ]);

    const mail = (await prisma.outboxJob.findMany({ where: { tenantId: T, name: "notify.email" }, select: { payload: true } }))
      .map((j) => j.payload as { template: string; to: string })
      .filter((p) => p.template.startsWith("editionArtwork."));
    const sent = (template: string) => mail.filter((m) => m.template === template).map((m) => m.to).sort();
    /* Rosa's upload went to BTG's desk; BTG's upload for Kim went to Kim; Kim's own uploads to BTG. */
    expect(sent("editionArtwork.submitted")).toEqual([
      "cm@eart.invalid", "cm@eart.invalid", "cm@eart.invalid", "kim@eart.invalid", "ops@eart.invalid", "ops@eart.invalid", "ops@eart.invalid",
    ]);
    /* Ready for sign-off: only the buying sponsor's admins. */
    expect(sent("editionArtwork.readyForSignOff")).toEqual(["kim@eart.invalid", "kim@eart.invalid", "rosa@eart.invalid"]);
    /* BTG's change request to Kim; Kim's to BTG's desk. */
    expect(sent("editionArtwork.revisionRequested")).toEqual(["cm@eart.invalid", "kim@eart.invalid", "ops@eart.invalid"]);
    /* Approvals go to BTG's desk. */
    expect(sent("editionArtwork.approved")).toEqual(["cm@eart.invalid", "cm@eart.invalid", "ops@eart.invalid", "ops@eart.invalid"]);
  });
});
