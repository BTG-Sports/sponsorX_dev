import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  ARTWORK_MAX_BYTES,
  TRUSTED_ARTWORK_COUNT,
  artworkChecks,
  artworkSkipDecision,
  artworkVerdict,
  returnReasons,
  sponsorTrust,
} from "../src/domain/artwork-checks-rules";
import { CONSENT_KINDS, consentGrant } from "../src/domain/consent-rights-rules";

/* --------------------------------------------------------------------------
   P9-BE-22 — ad artwork checked automatically on upload; a sponsor with a
   clean record skips BTG's review; the sponsor's licence recorded on
   approval. P9-BE-23 — consent rights recorded automatically.

   The pure rules first, then over a real database: the domain functions the
   routes call (and the routes themselves where the wire matters), with only
   Clerk and the rate limiter stubbed.
   -------------------------------------------------------------------------- */

const PNG = { contentType: "image/png", bytes: 48_213 };

describe("P9-BE-22 · the artwork checks (pure)", () => {
  const ok = (over: Partial<Parameters<typeof artworkChecks>[0]> = {}) =>
    artworkChecks({ contentType: "image/png", bytes: 48_213, text: null, restricted: [], ...over });
  const by = (checks: ReturnType<typeof artworkChecks>, key: string) => checks.find((c) => c.key === key)!;

  it("file type: PDF, PNG and JPG pass; anything else, or no type at all, fails and says what to upload", () => {
    for (const t of ["application/pdf", "image/png", "image/jpeg", "IMAGE/PNG; charset=binary"]) expect(by(ok({ contentType: t }), "fileType").ok, t).toBe(true);
    expect(by(ok({ contentType: "image/gif" }), "fileType")).toEqual({ key: "fileType", ok: false, text: "The file type (image/gif) isn't accepted for ad artwork — upload a PDF, or a PNG or JPG image" });
    expect(by(ok({ contentType: null }), "fileType").ok).toBe(false);
  });

  it("file size: within 50 MB passes; over, empty or unknown fails", () => {
    expect(by(ok({ bytes: ARTWORK_MAX_BYTES }), "fileSize").ok).toBe(true);
    expect(by(ok({ bytes: ARTWORK_MAX_BYTES + 1 }), "fileSize")).toEqual({ key: "fileSize", ok: false, text: "The file is 50 MB — the limit is 50 MB" });
    expect(by(ok({ bytes: 0 }), "fileSize").text).toBe("The file is empty — upload it again");
    expect(by(ok({ bytes: null }), "fileSize").ok).toBe(false);
  });

  it("dimensions: skipped, and says so; restricted words: skipped without text, held for BTG on a match", () => {
    expect(by(ok(), "dimensions")).toMatchObject({ ok: true, text: expect.stringMatching(/not checked automatically/) });
    expect(by(ok(), "words")).toMatchObject({ ok: true, text: expect.stringMatching(/No text supplied/) });
    expect(by(ok({ text: "Fall menu" }), "words")).toEqual({ key: "words", ok: true, text: "No restricted words in the title" });
    expect(by(ok({ text: "Casino night", restricted: [{ word: "casino" }] }), "words")).toMatchObject({ ok: false, text: expect.stringMatching(/"casino"/) });
  });

  it("the verdict: a file problem RETURNs, restricted words HOLD for BTG, all clear PASSes", () => {
    expect(artworkVerdict(ok())).toBe("PASS");
    expect(artworkVerdict(ok({ text: "Casino night", restricted: [{ word: "casino" }] }))).toBe("HOLD");
    const bad = ok({ contentType: "image/gif", bytes: ARTWORK_MAX_BYTES * 2, text: "Casino", restricted: [{ word: "casino" }] });
    expect(artworkVerdict(bad)).toBe("RETURN");
    /* The supplier hears the file problems — the words are BTG's. */
    expect(returnReasons(bad)).toEqual([by(bad, "fileType").text, by(bad, "fileSize").text]);
  });
});

describe("P9-BE-22 · the trusted-sponsor skip (pure)", () => {
  const base = {
    clean: TRUSTED_ARTWORK_COUNT, sponsorCategories: [], briefCategories: [],
    notForStudents: new Set(["ALCOHOL", "CRYPTO"]), btgRevisedBefore: false, sponsorReviewer: true,
  };
  it("a clean record of 3 skips; fewer does not", () => {
    expect(artworkSkipDecision(base)).toEqual({ skip: true, reason: "Trusted: last 3 ads approved by BTG without changes" });
    expect(artworkSkipDecision({ ...base, clean: 2 })).toEqual({ skip: false, reason: "Not trusted yet: 2 of 3 clean ads — reviewed by BTG" });
    expect(sponsorTrust(7)).toEqual({ trusted: true, cleanStreak: 3, needed: 3 });
    expect(sponsorTrust(-1)).toEqual({ trusted: false, cleanStreak: 0, needed: 3 });
  });
  it("never for a sensitive or not-for-students category, on the sponsor or the campaign; never after a BTG revision; never with no reviewer", () => {
    expect(artworkSkipDecision({ ...base, sponsorCategories: ["alcohol"] }).reason).toBe("Sponsor is in a sensitive category (alcohol) — always reviewed by BTG");
    expect(artworkSkipDecision({ ...base, briefCategories: ["CRYPTO"] }).reason).toBe("Campaign is in a category student editions don't sell (crypto) — always reviewed by BTG");
    expect(artworkSkipDecision({ ...base, btgRevisedBefore: true }).skip).toBe(false);
    expect(artworkSkipDecision({ ...base, sponsorReviewer: false }).skip).toBe(false);
  });
});

describe("P9-BE-23 · what a consent records (pure)", () => {
  const adult = {
    agreementKind: "FEATURE", inForce: true, makerKind: "STUDENT" as const, ageKnown: true, minor: false,
    acceptanceGuardianId: null, makerGuardianId: null, guardianVerified: false,
  };
  it("FEATURE and RELEASE: digital and print; COMMERCIAL adds commercial reuse; PROFILE and the rest: nothing", () => {
    expect(CONSENT_KINDS.sort()).toEqual(["COMMERCIAL", "FEATURE", "RELEASE"]);
    expect(consentGrant(adult)).toEqual({ grant: true, grantorKind: "STUDENT", mayPublishDigital: true, mayPublishPrint: true, mayReuseCommercially: false });
    expect(consentGrant({ ...adult, agreementKind: "COMMERCIAL" })).toMatchObject({ grant: true, mayReuseCommercially: true });
    for (const k of ["PROFILE", "GUARDIAN", "CAMPAIGN_ORDER"]) expect(consentGrant({ ...adult, agreementKind: k }).grant, k).toBe(false);
  });
  it("a minor's needs their verified guardian on it; unknown age and a superseded version record nothing", () => {
    const minor = { ...adult, minor: true, makerGuardianId: "g1" };
    expect(consentGrant({ ...minor, acceptanceGuardianId: null, guardianVerified: true }).grant).toBe(false);
    expect(consentGrant({ ...minor, acceptanceGuardianId: "g1", guardianVerified: false }).grant).toBe(false);
    expect(consentGrant({ ...minor, acceptanceGuardianId: "g2", guardianVerified: true }).grant).toBe(false);
    expect(consentGrant({ ...minor, acceptanceGuardianId: "g1", guardianVerified: true })).toMatchObject({ grant: true, grantorKind: "GUARDIAN" });
    expect(consentGrant({ ...adult, ageKnown: false }).grant).toBe(false);
    expect(consentGrant({ ...adult, inForce: false }).grant).toBe(false);
  });
});

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@aar-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("P9-BE-22 / -23 · artwork checked, trusted sponsors, rights recorded automatically", async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const art = await import("../src/domain/edition-artwork");
  const trustDb = await import("../src/domain/artwork-trust");
  const rights = await import("../src/domain/content-rights");
  const ed = await import("../src/domain/edition");
  type Actor = import("../src/auth/actor").Actor;

  const T = "aar_tenant";
  const X = "aar_tenant_other";
  const DAY = 864e5;
  const HASH = "a".repeat(64);
  const actor = (userId: string, roles: string[], sponsorId: string | null = null, tenantId = T): Actor =>
    ({ userId, tenantId, roles, sponsorId, athleteId: null, guardianId: null, propertyId: null } as unknown as Actor);
  const staff = actor("aar_staff", ["BTG_ADMIN"]);
  const sp = (key: string) => actor(`aar_${key}`, ["SPONSOR_ADMIN"], `aar_${key}_sp`);
  const xStaff = actor("aar_x_staff", ["BTG_ADMIN"], null, X);
  const xSponsor = actor("aar_x_sponsor", ["SPONSOR_ADMIN"], "aar_x_sp", X);

  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  let editionId = "";
  let n = 0;

  const call = async (method: string, path: string, clerk: string, body?: unknown) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: { "x-test-clerk": clerk, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };

  async function clean() {
    for (const t of [
      "ContentRight", "EditionAsset", "AgreementAcceptance", "Agreement", "Student", "Athlete", "Guardian", "Property",
      "RestrictedWord", "AdSlot", "RevenueSplit", "EditionEvent", "Edition", "Publication", "Campaign", "Sponsor",
      "OutboxJob", "SyncTask", "AuditLog", "User",
    ]) {
      for (const tenant of [T, X]) await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, tenant);
    }
    await prisma.tenant.deleteMany({ where: { id: { in: [T, X] } } });
  }

  async function sellingEdition(label: string, printDate: Date | null = null): Promise<string> {
    const pub = await ed.createPublication(staff, { name: `AAR ${label} Gazette`, propertyId: null });
    const e = await ed.createEdition(staff, pub.id, {
      label: `AAR ${label}`, closeDate: new Date(Date.now() + 30 * DAY), publishTarget: new Date(Date.now() + 40 * DAY),
      printDate, thresholdCents: 0,
    });
    await ed.transitionEdition(staff, e.id, "SELLING");
    return e.id;
  }

  /** A slot in `edition`, sold to a fresh campaign of the sponsor. */
  async function soldSlot(sponsorKey: string, edition = editionId): Promise<string> {
    const c = await prisma.campaign.create({
      data: { tenantId: T, sponsorId: `aar_${sponsorKey}_sp`, name: `AAR campaign ${++n}`, budget: 100_000, startDate: new Date("2026-10-01"), endDate: new Date("2026-12-31") },
      select: { id: true },
    });
    const slot = await ed.addSlot(staff, edition, { slotCode: `AAR-${n}`, kind: "HALF", priceCents: 50_000 });
    await prisma.adSlot.update({ where: { id: slot.id }, data: { campaignId: c.id, soldCents: 50_000, soldAt: new Date() } });
    return slot.id;
  }

  async function upload(who: Actor, slotId: string, file: { contentType: string; bytes: number } = PNG, title?: string) {
    const { key } = await art.presignArtworkUpload(who, slotId, file.contentType, file.bytes);
    return art.registerArtwork(who, slotId, { r2Key: key, title });
  }

  /** Uploaded, picked up by the system, passed on by BTG — one clean BTG review. */
  async function passByBtg(who: Actor, slotId: string) {
    const r = await upload(who, slotId);
    expect(r.state).toBe("BTG_REVIEW");
    await art.sendArtworkToSponsor(staff, r.id);
    return r.id;
  }

  const row = (id: string) => prisma.editionAsset.findUniqueOrThrow({
    where: { id },
    select: { reviewState: true, artworkChecksPassed: true, btgReviewSkipped: true, skipReason: true, artworkVersion: true },
  });
  const auditOf = (id: string) => prisma.auditLog.findMany({
    where: { tenantId: T, entity: "EditionAsset", entityId: id }, select: { action: true, actorId: true, after: true }, orderBy: [{ at: "asc" }, { id: "asc" }],
  });
  /** The latest upload's audit payload (its checks and the skip decision). */
  const submitOf = async (id: string) =>
    (await auditOf(id)).filter((l) => l.action === "editionArtwork.submit").at(-1)!.after;
  const mail = async () => (await prisma.outboxJob.findMany({ where: { tenantId: T, name: "notify.email" }, select: { payload: true } }))
    .map((j) => j.payload as { template: string; to: string; data: Record<string, string> });
  const trustOf = (key: string) => trustDb.sponsorTrustOf(prisma, T, `aar_${key}_sp`);

  beforeAll(async () => {
    await clean();
    await prisma.tenant.createMany({ data: [{ id: T, name: "AAR artwork test tenant" }, { id: X, name: "AAR other tenant" }] });
    await prisma.sponsor.createMany({ data: [
      { id: "aar_rosa_sp", tenantId: T, name: "AAR Rosa's Bakery" },
      { id: "aar_tina_sp", tenantId: T, name: "AAR Tina's Tacos" },
      { id: "aar_sam_sp", tenantId: T, name: "AAR Sam's Brewhouse", categories: ["ALCOHOL"] },
      { id: "aar_coin_sp", tenantId: T, name: "AAR Coin Corner", categories: ["CRYPTO"] },
      { id: "aar_race_sp", tenantId: T, name: "AAR Racer Realty" },
      { id: "aar_x_sp", tenantId: X, name: "AAR Other-tenant Sponsor" },
    ] });
    await prisma.user.createMany({ data: [
      { id: "aar_staff", tenantId: T, clerkId: "aar_staff", email: "ops@aar.invalid", roles: ["BTG_ADMIN"] },
      { id: "aar_cm", tenantId: T, clerkId: "aar_cm", email: "cm@aar.invalid", roles: ["CAMPAIGN_MGR"] },
      ...["rosa", "tina", "sam", "coin", "race"].map((k) => ({
        id: `aar_${k}`, tenantId: T, clerkId: `aar_${k}`, email: `${k}@aar.invalid`, roles: ["SPONSOR_ADMIN" as const], sponsorId: `aar_${k}_sp`,
      })),
      { id: "aar_x_staff", tenantId: X, clerkId: "aar_x_staff", email: "ops@aar-x.invalid", roles: ["BTG_ADMIN"] },
      { id: "aar_x_sponsor", tenantId: X, clerkId: "aar_x_sponsor", email: "sp@aar-x.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "aar_x_sp" },
    ] });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    editionId = await sellingEdition("Fall");
  });

  afterAll(async () => {
    server?.close();
    await clean();
  });

  /* ── P9-BE-22 · the checks ─────────────────────────────────────────────── */

  it("a passing upload is picked up by the system; an untrusted sponsor's goes to BTG", async () => {
    const slot = await soldSlot("rosa");
    const r = await upload(sp("rosa"), slot);
    expect(r).toMatchObject({ state: "BTG_REVIEW", route: "BTG_REVIEW", version: 1, btgReviewSkipped: false });
    expect(r.checks.map((c) => [c.key, c.ok])).toEqual([["fileType", true], ["fileSize", true], ["dimensions", true], ["words", true]]);
    expect(await row(r.id)).toMatchObject({ reviewState: "BTG_REVIEW", artworkChecksPassed: true, btgReviewSkipped: false });
    const log = await auditOf(r.id);
    expect(log.map((l) => [l.action, l.actorId])).toEqual([["editionArtwork.submit", "aar_rosa"], ["editionArtwork.btgReview", null]]);
    expect(await submitOf(r.id)).toMatchObject({ checksPassed: true, btgReview: { skipped: false, reason: "Not trusted yet: 0 of 3 clean ads — reviewed by BTG" } });
    /* BTG's desk hears it is in. */
    expect((await mail()).filter((m) => m.template === "editionArtwork.submitted" && m.data.slotCode === `AAR-${n}`).map((m) => m.to).sort())
      .toEqual(["cm@aar.invalid", "ops@aar.invalid"]);
  });

  it("each failing check sends the upload back to the sponsor with the reasons emailed, and it never reaches BTG", async () => {
    /* The wrong type. */
    const slot = await soldSlot("rosa");
    const code = `AAR-${n}`;
    const bad = await upload(sp("rosa"), slot, { contentType: "image/gif", bytes: 48_213 });
    expect(bad).toMatchObject({ state: "DRAFT_SUBMITTED", route: "RETURNED", btgReviewSkipped: false });
    expect(await row(bad.id)).toMatchObject({ reviewState: "DRAFT_SUBMITTED", artworkChecksPassed: false });
    const sent = (await mail()).filter((m) => m.data.slotCode === code);
    expect(sent.map((m) => [m.template, m.to])).toEqual([["editionArtwork.checksFailed", "rosa@aar.invalid"]]);
    expect(sent[0]!.data.reasons).toMatch(/The file type \(image\/gif\) isn't accepted/);
    expect((await auditOf(bad.id)).map((l) => [l.action, l.actorId])).toEqual([["editionArtwork.submit", "aar_rosa"], ["editionArtwork.systemReturn", null]]);

    /* BTG's desk: not its move — it can't pick it up or send it on. */
    await expect(art.startArtworkReview(staff, bad.id)).rejects.toMatchObject({ status: 409, name: "ArtworkFailedChecksError" });
    await expect(art.sendArtworkToSponsor(staff, bad.id)).rejects.toMatchObject({ status: 409 });
    const listed = (await art.listArtwork(staff, {})).find((a) => a.id === bad.id)!;
    expect(listed.sentBack).toEqual({ by: "SYSTEM", at: expect.any(String), failed: [expect.stringMatching(/image\/gif/)] });
    /* The production gate reads it as sent back. */
    const gap = await prisma.$transaction((tx) => art.artworkGap(tx, T, editionId));
    expect(gap.find((g) => g.slotCode === code)).toEqual({ slotCode: code, state: "DRAFT_SUBMITTED", revisionOpen: true });

    /* A corrected file answers it, and is picked up. */
    expect(await upload(sp("rosa"), slot)).toMatchObject({ id: bad.id, state: "BTG_REVIEW", version: 2, route: "BTG_REVIEW" });

    /* Too big. */
    const big = await upload(sp("rosa"), await soldSlot("rosa"), { contentType: "application/pdf", bytes: ARTWORK_MAX_BYTES + 1 });
    expect(big).toMatchObject({ route: "RETURNED" });
    expect(big.checks.find((c) => c.key === "fileSize")).toMatchObject({ ok: false, text: expect.stringMatching(/the limit is 50 MB/) });
    expect(big.checks.find((c) => c.key === "fileType")).toMatchObject({ ok: true, text: "File type allowed (PDF)" });

    /* A key this slot was never granted: no type, no size. */
    const ungranted = await soldSlot("rosa");
    const r = await art.registerArtwork(sp("rosa"), ungranted, { r2Key: `t/${T}/ad-slot/${ungranted}/never-granted` });
    expect(r.route).toBe("RETURNED");
    expect(r.checks.filter((c) => !c.ok).map((c) => c.key)).toEqual(["fileType", "fileSize"]);

    /* Over the wire: the presign needs the size, and signs it. */
    const noSize = await call("POST", `/ad-slots/${ungranted}/artwork/uploads`, "aar_rosa", { contentType: "image/png" });
    expect(noSize.status).toBe(400);
    const signed = await call("POST", `/ad-slots/${ungranted}/artwork/uploads`, "aar_rosa", PNG);
    expect(signed.status, signed.text).toBe(201);
    expect(new URL(signed.json.url).searchParams.get("X-Amz-SignedHeaders")).toBe("content-length;content-type;host");
    const reg = await call("POST", `/ad-slots/${ungranted}/artwork`, "aar_rosa", { r2Key: signed.json.key });
    expect(reg.json).toMatchObject({ state: "BTG_REVIEW", route: "BTG_REVIEW", version: 2 });

    /* No failing upload ever reached BTG's desk. */
    for (const id of [bad.id, big.id]) {
      const actions = (await auditOf(id)).map((l) => l.action);
      expect(actions.indexOf("editionArtwork.btgReview")).toBe(id === bad.id ? 3 : -1); // bad: only after its corrected v2
    }
  });

  it("restricted words in the title hold the artwork for BTG — picked up, never skipped", async () => {
    /* A sponsor with a clean record, so the words are the only reason. */
    for (let i = 0; i < 3; i++) await passByBtg(sp("tina"), await soldSlot("tina"));
    expect(await trustOf("tina")).toEqual({ trusted: true, cleanStreak: 3, needed: 3 });
    const held = await upload(sp("tina"), await soldSlot("tina"), PNG, "Casino night special");
    expect(held).toMatchObject({ state: "BTG_REVIEW", route: "BTG_REVIEW", btgReviewSkipped: false });
    expect(held.checks.find((c) => c.key === "words")).toMatchObject({ ok: false, text: expect.stringMatching(/"casino"/) });
    expect((await submitOf(held.id))).toMatchObject({ btgReview: { skipped: false, reason: "Restricted words in the title — reviewed by BTG" } });
    /* BTG passes it: the record holds (it was clean). */
    await art.sendArtworkToSponsor(staff, held.id);
  });

  /* ── P9-BE-22 · the trusted skip ───────────────────────────────────────── */

  it("a trusted sponsor skips BTG; the sponsor's own revisions don't count; BTG can still revise, and that resets the record", async () => {
    expect(await trustOf("tina")).toMatchObject({ trusted: true });
    /* A sponsor revision on one of the passed ads: no effect on the record. */
    const passed = (await prisma.editionAsset.findFirstOrThrow({
      where: { tenantId: T, reviewState: "SPONSOR_REVIEW", adSlot: { is: { campaign: { is: { sponsorId: "aar_tina_sp" } } } } }, select: { id: true },
    })).id;
    await art.requestArtworkRevision(sp("tina"), passed, "Swap the photo");
    expect(await trustOf("tina")).toEqual({ trusted: true, cleanStreak: 3, needed: 3 });

    const slot = await soldSlot("tina");
    const s = await upload(sp("tina"), slot);
    expect(s).toMatchObject({ state: "SPONSOR_REVIEW", route: "SPONSOR_REVIEW", btgReviewSkipped: true });
    expect(await row(s.id)).toMatchObject({ reviewState: "SPONSOR_REVIEW", btgReviewSkipped: true, skipReason: "Trusted: last 3 ads approved by BTG without changes" });
    expect((await auditOf(s.id)).map((l) => [l.action, l.actorId])).toEqual([
      ["editionArtwork.submit", "aar_tina"], ["editionArtwork.btgReview", null], ["editionArtwork.btgReviewSkipped", null],
    ]);
    const told = (await mail()).filter((m) => m.data.slotCode === `AAR-${n}`);
    expect(told.map((m) => [m.template, m.to, m.data.skipped])).toEqual([["editionArtwork.readyForSignOff", "tina@aar.invalid", "yes"]]);

    /* BTG's "Skipped BTG review" tab, with the sponsor's standing. */
    const tab = await call("GET", "/edition-artwork?btgSkipped=only", "aar_cm");
    expect(tab.status, tab.text).toBe(200);
    expect(tab.json.artwork.map((a: { id: string }) => a.id)).toEqual([s.id]);
    expect(tab.json.artwork[0]).toMatchObject({
      btgReviewSkipped: true, skipReason: "Trusted: last 3 ads approved by BTG without changes",
      sponsorTrust: { trusted: true, cleanStreak: 3, needed: 3 }, checksPassed: true,
    });
    /* The sponsor sees where it went, not BTG's reasoning or the record. */
    const own = (await call("GET", "/edition-artwork", "aar_tina")).json.artwork.find((a: { id: string }) => a.id === s.id);
    expect(own).toMatchObject({ btgReviewSkipped: true });
    expect(own).not.toHaveProperty("skipReason");
    expect(own).not.toHaveProperty("sponsorTrust");

    /* BTG opens the skipped ad and asks for changes while Tina reviews it. */
    expect(await art.requestArtworkRevision(staff, s.id, "The phone number is wrong")).toEqual({ id: s.id, state: "DRAFT_SUBMITTED" });
    expect(await trustOf("tina")).toEqual({ trusted: false, cleanStreak: 0, needed: 3 });
    /* Its next version goes to BTG; so does her next ad. */
    expect(await upload(sp("tina"), slot)).toMatchObject({ state: "BTG_REVIEW", btgReviewSkipped: false });
    expect((await auditOf(s.id)).filter((l) => l.action === "editionArtwork.submit").at(-1)!.after)
      .toMatchObject({ btgReview: { skipped: false, reason: "BTG asked for changes on an earlier version — reviewed by BTG" } });
    const next = await upload(sp("tina"), await soldSlot("tina"));
    expect(next).toMatchObject({ state: "BTG_REVIEW", btgReviewSkipped: false });
    expect((await submitOf(next.id))).toMatchObject({ btgReview: { reason: "Not trusted yet: 0 of 3 clean ads — reviewed by BTG" } });
  });

  it("a sensitive or not-for-students category never skips, whatever the record", async () => {
    for (let i = 0; i < 3; i++) await passByBtg(sp("sam"), await soldSlot("sam"));
    expect(await trustOf("sam")).toMatchObject({ trusted: true });
    const beer = await upload(sp("sam"), await soldSlot("sam"));
    expect(beer).toMatchObject({ state: "BTG_REVIEW", btgReviewSkipped: false });
    expect((await submitOf(beer.id))).toMatchObject({ btgReview: { reason: "Sponsor is in a sensitive category (alcohol) — always reviewed by BTG" } });

    for (let i = 0; i < 3; i++) await passByBtg(sp("coin"), await soldSlot("coin"));
    const coin = await upload(sp("coin"), await soldSlot("coin"));
    expect(coin).toMatchObject({ state: "BTG_REVIEW", btgReviewSkipped: false });
    expect((await submitOf(coin.id))).toMatchObject({ btgReview: { reason: "Sponsor is in a category student editions don't sell (crypto) — always reviewed by BTG" } });
  });

  /** Wait until `k` sessions are queued on a sponsor's artwork lock. */
  async function lockWaiters(k: number) {
    for (let i = 0; i < 300; i++) {
      const [r] = await prisma.$queryRaw<Array<{ n: number }>>`
        SELECT count(*)::int AS n FROM pg_stat_activity
         WHERE datname = current_database() AND wait_event_type = 'Lock'
           AND query LIKE '%FROM "Sponsor"%FOR NO KEY UPDATE%'`;
      if ((r?.n ?? 0) >= k) return;
      await new Promise((res) => setTimeout(res, 10));
    }
    throw new Error(`fewer than ${k} sessions ever waited on the sponsor's lock`);
  }

  it("a BTG revision racing an upload: the upload never skips on the record the revision breaks", async () => {
    for (let i = 0; i < 3; i++) await passByBtg(sp("race"), await soldSlot("race"));
    const x = await upload(sp("race"), await soldSlot("race"));
    expect(x.btgReviewSkipped).toBe(true);
    const ySlot = await soldSlot("race");
    const { key } = await art.presignArtworkUpload(sp("race"), ySlot, "image/png", 48_213);

    /* Hold the sponsor's lock, queue the revision on it, then the upload. */
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let locked!: () => void;
    const isLocked = new Promise<void>((r) => (locked = r));
    const holder = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Sponsor" WHERE "id" = ${"aar_race_sp"} FOR NO KEY UPDATE`;
      locked();
      await held;
    }, { timeout: 30_000, maxWait: 10_000 });
    await isLocked;

    let revisionDone = false;
    const revision = art.requestArtworkRevision(staff, x.id, "Logo is cropped").then((r) => { revisionDone = true; return r; });
    await lockWaiters(1);
    expect(revisionDone).toBe(false);
    const y = art.registerArtwork(sp("race"), ySlot, { r2Key: key });
    await lockWaiters(2);

    release();
    await holder;
    const [r, u] = await Promise.all([revision, y]);
    expect(r.state).toBe("DRAFT_SUBMITTED");
    expect(u).toMatchObject({ state: "BTG_REVIEW", btgReviewSkipped: false });
    expect((await submitOf(u.id))).toMatchObject({ btgReview: { skipped: false, reason: "Not trusted yet: 0 of 3 clean ads — reviewed by BTG" } });
  });

  /* ── P9-BE-22 · the licence on approval ────────────────────────────────── */

  it("the sponsor's approval records the ad licence once, and the sold ad no longer stops production", async () => {
    const fall2 = await sellingEdition("Licence", new Date(Date.now() + 50 * DAY));
    const slot = await soldSlot("rosa", fall2);
    const a = await upload(sp("rosa"), slot);
    await art.sendArtworkToSponsor(staff, a.id);
    const edition = await prisma.edition.findUniqueOrThrow({ where: { id: fall2 }, select: { publishTarget: true, printDate: true } });
    const gaps = () => prisma.$transaction(async (tx) => [
      (await rights.rightsGap(tx, T, fall2, "DIGITAL", edition.publishTarget)).map((g) => g.id),
      (await rights.rightsGap(tx, T, fall2, "PRINT", edition.printDate!)).map((g) => g.id),
    ]);
    expect(await gaps()).toEqual([[a.id], [a.id]]);

    await art.approveArtwork(sp("rosa"), a.id);
    const granted = await prisma.contentRight.findMany({
      where: { tenantId: T, assetId: a.id },
      select: { grantorKind: true, grantorRef: true, autoBasis: true, mayPublishDigital: true, mayPublishPrint: true, mayPromote: true, mayReuseCommercially: true, acceptanceId: true, endsAt: true, licenseRef: true },
    });
    expect(granted).toEqual([expect.objectContaining({
      grantorKind: "THIRD_PARTY", grantorRef: "AAR Rosa's Bakery", autoBasis: "AD_APPROVAL",
      mayPublishDigital: true, mayPublishPrint: true, mayPromote: false, mayReuseCommercially: false,
      acceptanceId: null, endsAt: null,
      licenseRef: expect.stringMatching(new RegExp(`^ad-approval:campaign/.+/slot/${slot}/v1$`)),
    })]);
    expect(await gaps()).toEqual([[], []]);
    expect((await auditOf(a.id)).filter((l) => l.action === "contentRight.autoGrant").map((l) => l.actorId)).toEqual([null]);

    /* Once: a second recording is a no-op, and approving again is an illegal move. */
    const slotRow = await prisma.adSlot.findUniqueOrThrow({ where: { id: slot }, select: { campaignId: true } });
    expect(await prisma.$transaction((tx) => rights.recordAdLicenceIn(tx, T, {
      id: a.id, version: 1, slotId: slot, campaignId: slotRow.campaignId!, sponsorName: "AAR Rosa's Bakery", edition,
    }))).toBeNull();
    await expect(art.approveArtwork(sp("rosa"), a.id)).rejects.toMatchObject({ status: 409 });
    expect(await prisma.contentRight.count({ where: { tenantId: T, assetId: a.id } })).toBe(1);
    /* And Postgres refuses a second automatic licence outright. */
    await expect(prisma.contentRight.create({ data: { tenantId: T, assetId: a.id, grantorKind: "THIRD_PARTY", grantorRef: "x", startsAt: new Date(), licenseRef: "dup", autoBasis: "AD_APPROVAL" } })).rejects.toThrow();

    /* Nothing else is missing: production goes ahead. */
    await ed.transitionEdition(staff, fall2, "CLOSED");
    await ed.setEditionConditions(staff, fall2, { contentReady: true });
    expect((await ed.transitionEdition(staff, fall2, "IN_PRODUCTION")).state).toBe("IN_PRODUCTION");
  });

  /* ── P9-BE-23 · consent rights ─────────────────────────────────────────── */

  describe("P9-BE-23 · consent rights recorded automatically", () => {
    let consentEdition = "";
    const student = async (id: string, data: { ageBand?: string | null; guardianId?: string | null }) =>
      (await prisma.student.create({
        data: { id, tenantId: T, propertyId: "aar_school", legalName: id, displayName: `${id} (display)`, masthead: ["WRITER"], state: "ACTIVE", ageBand: data.ageBand ?? null, guardianId: data.guardianId ?? null },
        select: { id: true },
      })).id;
    const consent = (agreementId: string, subjectId: string, guardianId: string | null = null, subjectKind: "STUDENT" | "ATHLETE" = "STUDENT") =>
      rights.recordSubjectConsent(staff, { agreementId, subjectKind, subjectId, guardianId, bodyHashShown: HASH, ip: "t", userAgent: "t" });
    const article = (studentId: string | null, athleteId: string | null = null) =>
      rights.addEditionAsset(staff, consentEdition, {
        kind: "ARTICLE", title: `AAR piece ${++n}`, sourceKind: studentId ? "STUDENT" : "ATHLETE", studentId, athleteId,
      });
    const rightsOn = (assetId: string) => prisma.contentRight.findMany({
      where: { tenantId: T, assetId },
      select: { grantorKind: true, grantorRef: true, mayPublishDigital: true, mayPublishPrint: true, mayPromote: true, mayReuseCommercially: true, autoBasis: true, acceptanceId: true },
    });

    beforeAll(async () => {
      consentEdition = await sellingEdition("Consent");
      await prisma.property.create({ data: { id: "aar_school", tenantId: T, slug: "aar-northside", name: "AAR Northside High", kind: "SCHOOL" } });
      await prisma.guardian.createMany({ data: [
        { id: "aar_g_ok", tenantId: T, legalName: "Verified Parent", email: "gok@aar.invalid", relationship: "PARENT", verifiedAt: new Date() },
        { id: "aar_g_no", tenantId: T, legalName: "Unverified Parent", email: "gno@aar.invalid", relationship: "PARENT" },
      ] });
      await prisma.agreement.createMany({ data: [
        { id: "aar_ag_feature", tenantId: T, kind: "FEATURE", version: 1, bodyHash: HASH, effectiveAt: new Date("2026-01-01") },
        { id: "aar_ag_commercial", tenantId: T, kind: "COMMERCIAL", version: 1, bodyHash: HASH, effectiveAt: new Date("2026-01-01") },
        { id: "aar_ag_profile", tenantId: T, kind: "PROFILE", version: 1, bodyHash: HASH, effectiveAt: new Date("2026-01-01") },
        { id: "aar_ag_release1", tenantId: T, kind: "RELEASE", version: 1, bodyHash: HASH, effectiveAt: new Date("2026-01-01") },
        { id: "aar_ag_release2", tenantId: T, kind: "RELEASE", version: 2, bodyHash: HASH, effectiveAt: new Date("2026-02-01") },
      ] });
    });

    it("on asset add: an adult maker's FEATURE consent records digital and print — never commercial reuse", async () => {
      const s = await student("aar_adult", { ageBand: "18_PLUS" });
      const c = await consent("aar_ag_feature", s);
      const a = await article(s);
      expect(await rightsOn(a.id)).toEqual([{
        grantorKind: "STUDENT", grantorRef: "aar_adult (display)", mayPublishDigital: true, mayPublishPrint: true,
        mayPromote: false, mayReuseCommercially: false, autoBasis: "CONSENT", acceptanceId: c.id,
      }]);
      expect((await auditOf(a.id)).map((l) => [l.action, l.actorId])).toEqual([["editionAsset.create", "aar_staff"], ["contentRight.autoGrant", null]]);
      /* A PROFILE consent covers no edition content. */
      await consent("aar_ag_profile", s);
      expect(await rightsOn((await article(s)).id)).toHaveLength(1);
    });

    it("on consent recording: the maker's existing assets get it; COMMERCIAL is what grants commercial reuse", async () => {
      const s = await student("aar_adult2", { ageBand: "18_PLUS" });
      const [a1, a2] = [await article(s), await article(s)];
      expect(await rightsOn(a1.id)).toEqual([]);
      const c = await consent("aar_ag_commercial", s);
      for (const a of [a1, a2]) {
        expect(await rightsOn(a.id)).toEqual([expect.objectContaining({ grantorKind: "STUDENT", mayReuseCommercially: true, autoBasis: "CONSENT", acceptanceId: c.id })]);
      }
      /* …and the asset may now enter a campaign. */
      const campaign = await prisma.campaign.findFirstOrThrow({ where: { tenantId: T }, select: { id: true } });
      expect(await rights.useAssetInCampaign(staff, a1.id, campaign.id)).toEqual({ assetId: a1.id, campaignId: campaign.id });
    });

    it("a minor: nothing without their verified guardian on the consent; the guardian's own consent records it", async () => {
      /* Guardian linked but not verified — an acceptance on file (recorded
         before, say) does not become a right. */
      const m1 = await student("aar_minor_unverified", { ageBand: "UNDER_16", guardianId: "aar_g_no" });
      const acc = await prisma.agreementAcceptance.create({
        data: { tenantId: T, agreementId: "aar_ag_feature", studentId: m1, guardianId: "aar_g_no", bodyHash: HASH, ip: "t", userAgent: "t" }, select: { id: true },
      });
      const a1 = await article(m1);
      expect(await rightsOn(a1.id)).toEqual([]);
      /* BTG cannot grant it by hand either — the same validation. */
      await expect(rights.grantRight(staff, a1.id, { grantorKind: "GUARDIAN", grantorRef: "x", mayPublishDigital: true, startsAt: new Date(), acceptanceId: acc.id }))
        .rejects.toThrow(/verified guardian/);
      /* A minor's own acceptance, no guardian on it: nothing. */
      const m2 = await student("aar_minor_self", { ageBand: "16_17", guardianId: "aar_g_ok" });
      await prisma.agreementAcceptance.create({ data: { tenantId: T, agreementId: "aar_ag_feature", studentId: m2, bodyHash: HASH, ip: "t", userAgent: "t" } });
      expect(await rightsOn((await article(m2)).id)).toEqual([]);
      /* The verified guardian's consent: recorded, as GUARDIAN. */
      const m3 = await student("aar_minor_ok", { ageBand: "UNDER_16", guardianId: "aar_g_ok" });
      const a3 = await article(m3);
      const c3 = await consent("aar_ag_feature", m3, "aar_g_ok");
      expect(await rightsOn(a3.id)).toEqual([expect.objectContaining({ grantorKind: "GUARDIAN", mayPublishPrint: true, mayReuseCommercially: false, acceptanceId: c3.id })]);
      /* Unknown age: held for BTG. */
      const u = await student("aar_noage", {});
      await consent("aar_ag_feature", u);
      expect(await rightsOn((await article(u)).id)).toEqual([]);
    });

    it("an athlete maker too; a superseded version records nothing; it is idempotent", async () => {
      const ath = (await prisma.athlete.create({
        data: { tenantId: T, slug: "aar-athlete-adult", legalName: "AAR Adult Athlete", displayName: "AAR Athlete", sport: "Soccer", ageBand: "18_PLUS" }, select: { id: true },
      })).id;
      await consent("aar_ag_feature", ath, null, "ATHLETE");
      const a = await article(null, ath);
      expect(await rightsOn(a.id)).toEqual([expect.objectContaining({ grantorKind: "ATHLETE", autoBasis: "CONSENT" })]);

      /* RELEASE v1 is superseded by v2: an acceptance of v1 is not in force. */
      const s = await student("aar_old_release", { ageBand: "18_PLUS" });
      await prisma.agreementAcceptance.create({ data: { tenantId: T, agreementId: "aar_ag_release1", studentId: s, bodyHash: HASH, ip: "t", userAgent: "t" } });
      expect(await rightsOn((await article(s)).id)).toEqual([]);

      /* Running it again records nothing more. */
      const before = await prisma.contentRight.count({ where: { tenantId: T } });
      expect(await prisma.$transaction((tx) => rights.recordConsentRightsIn(tx, T, { athleteId: ath }))).toEqual([]);
      expect(await prisma.$transaction((tx) => rights.recordConsentRightsIn(tx, T, { studentId: "aar_adult2" }))).toEqual([]);
      expect(await prisma.contentRight.count({ where: { tenantId: T } })).toBe(before);
    });
  });

  /* ── cross-tenant ──────────────────────────────────────────────────────── */

  it("another tenant reaches none of it: artwork, decisions, the sponsor's record, consent rights", async () => {
    const slot = await soldSlot("rosa");
    const a = await upload(sp("rosa"), slot);
    await expect(art.presignArtworkUpload(xStaff, slot, "image/png", 48_213)).rejects.toMatchObject({ status: 403 });
    await expect(art.registerArtwork(xStaff, slot, { r2Key: `t/${T}/ad-slot/${slot}/x` })).rejects.toMatchObject({ status: 403 });
    await expect(art.sendArtworkToSponsor(xStaff, a.id)).rejects.toMatchObject({ status: 403 });
    await expect(art.requestArtworkRevision(xStaff, a.id, "No")).rejects.toMatchObject({ status: 403 });
    expect((await art.listArtwork(xStaff, {})).map((r) => r.id)).toEqual([]);
    expect((await art.listArtwork(xStaff, { btgSkipped: true })).map((r) => r.id)).toEqual([]);
    const http = await call("GET", "/edition-artwork?btgSkipped=only", "aar_x_staff");
    expect(http.status).toBe(200);
    expect(http.json.artwork).toEqual([]);
    await art.sendArtworkToSponsor(staff, a.id);
    await expect(art.approveArtwork(xSponsor, a.id)).rejects.toMatchObject({ status: 403 });
    expect(await prisma.contentRight.count({ where: { assetId: a.id } })).toBe(0);
    /* A sponsor's record is read in its own tenant only. */
    expect(await trustDb.sponsorTrustOf(prisma, X, "aar_tina_sp")).toEqual({ trusted: false, cleanStreak: 0, needed: 3 });
    /* Consent rights are recorded only inside the asset's own tenant. */
    expect(await prisma.$transaction((tx) => rights.recordConsentRightsIn(tx, X, { studentId: "aar_adult" }))).toEqual([]);
    expect(await prisma.contentRight.count({ where: { tenantId: X } })).toBe(0);
  });
});
