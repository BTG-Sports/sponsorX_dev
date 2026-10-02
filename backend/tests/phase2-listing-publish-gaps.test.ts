import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { EMAIL_TEMPLATES } from "../worker/jobs/send-email.mts";

/* --------------------------------------------------------------------------
   2S3-BE-06 / 2S3-FE-04 — the gaps a review found in automatic publishing,
   against the real API and database:

     (a) an account coming back no longer switches its paused listings
         straight back on: each is re-checked on the submit's own path —
         clean goes live as an automatic publish, flagged is held for BTG,
         failing governance stays paused with the seller told; a listing
         BTG paused is never touched;
     (b) BTG's "Put back live" runs the restricted-words and standing checks
         too: words the seller edited in while it was paused land it in the
         held queue, and BTG is told so;
     (c) the held email says why per reason, and a sponsor's read carries
         none of BTG's notes, pause reasons or the governance blockers;
     (d) BTG lists every live listing, a page at a time, to pause or end.

   The cast: the Ridgeline Rams (a team BTG approved, with its documents) and
   their manager; BTG's admin; a sponsor in the same marketplace.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@lpg-test.invalid` } : null;
  },
}));

describe("(c) the held email is worded per reason (pure)", () => {
  const held = EMAIL_TEMPLATES["listing.held"]!;
  it("restricted words: named, never 'passed its checks'", () => {
    const m = held({ firstName: "Casey", title: "Poker night banner", words: 'Restricted words: "poker"', accountCheck: "", pausedByBtg: "" });
    expect(m.text).not.toMatch(/passed its checks/);
    expect(m.text).toMatch(/Restricted words: "poker"\. Edit them out of the title or description/);
    expect(m.text).not.toMatch(/checking your account/);
  });
  it("standing: only that BTG is checking the account", () => {
    const m = held({ firstName: "Casey", title: "Scarf giveaway", words: "", accountCheck: "yes", pausedByBtg: "" });
    expect(m.text).not.toMatch(/passed its checks|Restricted words/);
    expect(m.text).toMatch(/BTG is checking your account\./);
  });
  it("a listing that stays paused names what to fix", () => {
    const m = EMAIL_TEMPLATES["listing.staysPaused"]!({ firstName: "Casey", title: "Rams banner", problems: "• listing: a description of at least 20 characters" });
    expect(m.subject).toMatch(/still paused/);
    expect(m.text).toMatch(/a description of at least 20 characters/);
  });
});

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("2S3-BE-06 · the review's gaps in automatic publishing", { timeout: 90_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");

  const T = "lpg_btg";
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
  type Mail = { template: string; to: string; data: Record<string, string> };
  const emails = async () => (await prisma.outboxJob.findMany({ where: { tenantId: T, name: "notify.email" }, select: { payload: true }, orderBy: { createdAt: "asc" } }))
    .map((j) => j.payload as unknown as Mail);
  const about = async (title: string) => (await emails()).filter((m) => m.data.title === title);
  const state = async (id: string) => prisma.listing.findUniqueOrThrow({
    where: { id }, select: { state: true, publishedAutomatically: true, publishedAt: true, reviewReasons: true, btgAction: true },
  });

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

  /** A Rams item and its listing, created live (as if submitted earlier); returns the listing id. */
  let n = 0;
  async function liveListing(title: string, description: string, extra: Record<string, unknown> = {}) {
    n++;
    const item = await prisma.inventoryItem.create({ data: { id: `lpg_item_${n}`, tenantId: T, propertyId: "lpg_rams", title, kind: "SIGNAGE", priceCents: 20_000, quantity: 4 } });
    const l = await prisma.listing.create({ data: {
      id: `lpg_list_${n}`, tenantId: T, propertyId: "lpg_rams", inventoryItemId: item.id, title, description,
      state: "PUBLISHED", publishedAt: new Date(Date.now() - n * 60_000), publishedAutomatically: true, ...extra,
    } });
    return l.id;
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "Publish-gaps BTG" } });
    await prisma.property.create({ data: { id: "lpg_rams", tenantId: T, slug: "lpg-rams", name: "Ridgeline Rams LPG", kind: "TEAM", listingAccessAt: new Date() } });
    await prisma.propertyOnboarding.create({ data: {
      id: "lpg_onb", tenantId: T, orgType: "TEAM", orgName: "Ridgeline Rams LPG", state: "APPROVED", propertyId: "lpg_rams",
      documents: { create: [{ tenantId: T, kind: "BUSINESS_REGISTRATION", filename: "reg.pdf", contentType: "application/pdf", bytes: 100, r2Key: "onboarding/lpg_onb/reg.pdf", uploadedAt: new Date() }] },
    } });
    await prisma.sponsor.create({ data: { id: "lpg_cafe", tenantId: T, name: "Ridgeline Cafe LPG", categories: ["RESTAURANT"] } });
    await prisma.user.createMany({ data: [
      { id: "lpg_admin", tenantId: T, clerkId: "lpg_admin", email: "lpg_admin@lpg-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "lpg_mgr", tenantId: T, clerkId: "lpg_mgr", email: "lpg_mgr@lpg-test.invalid", roles: ["PROPERTY_MGR"], propertyId: "lpg_rams" },
      { id: "lpg_dana", tenantId: T, clerkId: "lpg_dana", email: "lpg_dana@lpg-test.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "lpg_cafe" },
    ] });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server?.close();
    await clean();
  });

  describe("(a) an account coming back re-checks each listing its closure paused", () => {
    const ids = { clean: "", words: "", short: "", btg: "" };
    it("closing pauses them", async () => {
      ids.clean = await liveListing("Rams courtside banner", "A courtside banner at every Rams home game.");
      ids.words = await liveListing("Rams halftime contest", "A halftime contest at every Rams home game.");
      ids.short = await liveListing("Rams gate flyer", "A gate flyer for every Rams home game.");
      ids.btg = await liveListing("Rams jersey patch", "A jersey patch on the Rams home kit all season.");
      await call("POST", `/listings/${ids.btg}/btg-action`, "lpg_admin", { action: "PAUSE", reason: "The patch artwork needs a look." });
      const closed = await call("POST", "/me/close", "lpg_mgr", { confirm: true });
      expect(closed.status, closed.text).toBe(200);
      for (const id of [ids.clean, ids.words, ids.short]) expect((await state(id)).state).toBe("PAUSED");
      /* While it was closed: BTG's list now catches one, another no longer meets the rules. */
      await prisma.listing.update({ where: { id: ids.words }, data: { description: "A halftime poker contest at every Rams home game." } });
      await prisma.listing.update({ where: { id: ids.short }, data: { description: "Gate flyer." } });
    });

    it("reactivating: clean goes live automatically, words are held for BTG, governance failing stays paused, BTG's pause stays BTG's", async () => {
      const link = (await emails()).filter((m) => m.template === "account.closed" && m.to === "lpg_mgr@lpg-test.invalid").at(-1)!;
      const token = new URL(link.data.reactivateUrl!).searchParams.get("t")!;
      const started = new Date();
      const r = await call("POST", `/public/account/reactivation/${encodeURIComponent(token)}`, undefined, { action: "REACTIVATE" });
      expect(r.status, r.text).toBe(200);
      expect(r.json.standing).toBe("REACTIVATED");

      /* Clean: an automatic publish, audited with the checks, the seller told. */
      const clean = await state(ids.clean);
      expect(clean).toMatchObject({ state: "PUBLISHED", publishedAutomatically: true, reviewReasons: [] });
      expect(clean.publishedAt!.getTime()).toBeGreaterThanOrEqual(started.getTime() - 1000);
      const auto = await prisma.auditLog.findFirstOrThrow({ where: { action: "listing.autoPublish", entityId: ids.clean }, select: { actorId: true, before: true, after: true } });
      expect(auto).toMatchObject({ actorId: "lpg_mgr", before: { state: "PAUSED" }, after: { state: "PUBLISHED", checks: { governance: "passed", restrictedWords: "none" } } });
      expect((await about("Rams courtside banner")).map((m) => m.template)).toContain("listing.live");

      /* The restricted word: held for BTG with the reason; seller and BTG emailed. */
      const words = await state(ids.words);
      expect(words).toMatchObject({ state: "PENDING_APPROVAL", publishedAutomatically: false, reviewReasons: ['Restricted words: "poker"'] });
      const hold = await prisma.auditLog.findFirstOrThrow({ where: { action: "listing.hold", entityId: ids.words }, select: { after: true } });
      expect(hold.after).toMatchObject({ via: "account.reactivate", reasons: ['Restricted words: "poker"'] });
      expect((await about("Rams halftime contest")).map((m) => [m.template, m.to])).toEqual(expect.arrayContaining([
        ["listing.held", "lpg_mgr@lpg-test.invalid"], ["listing.heldForBtg", "lpg_admin@lpg-test.invalid"],
      ]));
      expect((await call("GET", "/listings?state=PENDING_APPROVAL", "lpg_admin")).json.listings.map((l: { id: string }) => l.id)).toContain(ids.words);

      /* Governance failing: still paused, the seller told what to fix. */
      expect((await state(ids.short)).state).toBe("PAUSED");
      expect((await about("Rams gate flyer")).filter((m) => m.template === "listing.staysPaused")).toEqual([
        expect.objectContaining({ to: "lpg_mgr@lpg-test.invalid", data: expect.objectContaining({ problems: "• listing: a description of at least 20 characters" }) }),
      ]);

      /* BTG's own pause: untouched. */
      expect(await state(ids.btg)).toMatchObject({ state: "PAUSED", btgAction: "PAUSED" });

      /* The reactivation email says what happened to each, without the reasons BTG keeps. */
      const notes = (await prisma.accountClosure.findFirstOrThrow({ where: { tenantId: T, subjectId: "lpg_rams" }, select: { recheckNotes: true } })).recheckNotes;
      expect(notes).toEqual([
        'Your listing "Rams halftime contest" is waiting for BTG before it goes live again — we\'ve emailed you why.',
        'Your listing "Rams gate flyer" stays paused until you fix it: listing: a description of at least 20 characters.',
      ]);
      const audit = await prisma.auditLog.findFirstOrThrow({ where: { tenantId: T, action: "account.reactivate" }, select: { after: true } });
      expect(audit.after).toMatchObject({ listingsRestored: 1 });
    });
  });

  describe("(b) BTG's Put back live runs every check", () => {
    it("words the seller edited in while BTG had it paused: held for BTG with the words, BTG told in the response", async () => {
      const id = await liveListing("Rams tunnel banner", "A tunnel banner at every Rams home game this season.");
      expect((await call("POST", `/listings/${id}/btg-action`, "lpg_admin", { action: "PAUSE", reason: "Checking the banner size." })).json.state).toBe("PAUSED");
      expect((await call("PATCH", `/listings/${id}`, "lpg_mgr", { description: "A tunnel banner at every Rams home game. Poker night sponsor wanted." })).status).toBe(200);

      const r = await call("POST", `/listings/${id}/btg-action`, "lpg_admin", { action: "RESUME" });
      expect(r.status, r.text).toBe(200);
      expect(r.json).toMatchObject({ state: "PENDING_APPROVAL", btgAction: null, reviewReasons: ['Restricted words: "poker"'] });
      expect(r.json.notice).toMatch(/^Not put back live — .*Restricted words: "poker"/);
      /* BTG's own pause is lifted, so it is not among the reasons. */
      expect((await state(id)).reviewReasons).toEqual(['Restricted words: "poker"']);
      expect((await call("GET", "/listings?state=PENDING_APPROVAL", "lpg_admin")).json.listings.map((l: { id: string }) => l.id)).toContain(id);
      const trail = await prisma.auditLog.findFirstOrThrow({ where: { action: "listing.hold", entityId: id }, select: { actorId: true, after: true } });
      expect(trail).toMatchObject({ actorId: "lpg_admin", after: { state: "PENDING_APPROVAL", via: "listing.btgResume" } });
      expect(await prisma.auditLog.count({ where: { action: "listing.btgResume", entityId: id } })).toBe(0);
      const told = await about("Rams tunnel banner");
      expect(told.filter((m) => m.template === "listing.held")).toEqual([
        expect.objectContaining({ to: "lpg_mgr@lpg-test.invalid", data: expect.objectContaining({ words: 'Restricted words: "poker"', pausedByBtg: "" }) }),
      ]);
      expect(told.some((m) => m.template === "listing.live")).toBe(false);
      /* Approving it from the held queue is how it goes live now. */
      expect((await call("POST", `/listings/${id}/decision`, "lpg_admin", { decision: "APPROVE" })).json).toMatchObject({ state: "PUBLISHED", publishedBy: "BTG" });
    });

    it("a clean resume still puts it back live; governance failing refuses it", async () => {
      const id = await liveListing("Rams ribbon board", "A ribbon board message at every Rams home game.");
      await call("POST", `/listings/${id}/btg-action`, "lpg_admin", { action: "PAUSE", reason: "Checking the times." });
      await call("PATCH", `/listings/${id}`, "lpg_mgr", { description: "Too short." });
      const refused = await call("POST", `/listings/${id}/btg-action`, "lpg_admin", { action: "RESUME" });
      expect(refused.status).toBe(422);
      expect(refused.text).toMatch(/description of at least 20 characters/);
      expect((await state(id)).state).toBe("PAUSED");
      await call("PATCH", `/listings/${id}`, "lpg_mgr", { description: "A ribbon board message at every Rams home game." });
      const ok = await call("POST", `/listings/${id}/btg-action`, "lpg_admin", { action: "RESUME" });
      expect(ok.json).toMatchObject({ state: "PUBLISHED", btgAction: null, publishedBy: "BTG" });
      expect(ok.json).not.toHaveProperty("notice");
    });
  });

  describe("(c) what a sponsor's read leaves out", () => {
    it("no BTG notes, no pause or end reason, no blockers, no hold — the seller and BTG still see them", async () => {
      const id = await liveListing("Rams scoreboard shout-out", "A scoreboard shout-out at every Rams home game.", {
        reviewNotes: "Approved after checking the scoreboard schedule.", publishedAutomatically: false, decidedBy: "lpg_admin", decidedAt: new Date(),
      });
      const sponsor = await call("GET", `/listings/${id}`, "lpg_dana");
      expect(sponsor.status, sponsor.text).toBe(200);
      for (const k of ["reviewNotes", "btgAction", "btgReason", "btgActedAt", "blockers", "hold", "reviewReasons", "decidedBy", "heldWords"]) {
        expect(sponsor.json, k).not.toHaveProperty(k);
      }
      expect(sponsor.text).not.toMatch(/scoreboard schedule/);
      expect((await call("GET", "/listings", "lpg_dana")).json.listings.find((l: { id: string }) => l.id === id)).not.toHaveProperty("reviewNotes");
      expect((await call("GET", `/listings/${id}`, "lpg_mgr")).json).toMatchObject({ reviewNotes: "Approved after checking the scoreboard schedule.", blockers: [], btgAction: null, hold: null });
      expect((await call("GET", `/listings/${id}`, "lpg_admin")).json).toMatchObject({ reviewNotes: "Approved after checking the scoreboard schedule.", blockers: [], decidedBy: "lpg_admin" });
    });
  });

  describe("(d) BTG lists every live listing, a page at a time", () => {
    it("PUBLISHED only, however it went live, newest first, in BTG's tenants; BTG only", async () => {
      const old = await liveListing("Rams program ad", "A full-page ad in the Rams game-day program.", { publishedAt: new Date(Date.now() - 90 * 864e5), publishedAutomatically: false });
      const r = await call("GET", "/listings/live", "lpg_admin");
      expect(r.status, r.text).toBe(200);
      const mine = (r.json.listings as { id: string; state: string; tenantId: string; publishedAt: string }[]).filter((l) => l.tenantId === T);
      expect(mine.map((l) => l.state).every((s) => s === "PUBLISHED")).toBe(true);
      expect(mine.map((l) => l.id)).toContain(old);
      const times = mine.map((l) => Date.parse(l.publishedAt));
      expect([...times].sort((a, b) => b - a)).toEqual(times);
      expect(r.json.page).toMatchObject({ page: 1, size: 25 });
      expect(r.json.page.total).toBeGreaterThanOrEqual(mine.length);
      /* Not in the 30-day automatic tab, but BTG can still pause it. */
      expect((await call("GET", "/listings/auto-published", "lpg_admin")).json.listings.map((l: { id: string }) => l.id)).not.toContain(old);
      expect((await call("POST", `/listings/${old}/btg-action`, "lpg_admin", { action: "PAUSE", reason: "Program ads are on hold this month." })).json.state).toBe("PAUSED");
      expect((await call("GET", "/listings/live?page=0", "lpg_admin")).status).toBe(400);
      expect((await call("GET", "/listings/live", "lpg_mgr")).status).toBe(403);
      expect((await call("GET", "/listings/live", "lpg_dana")).status).toBe(403);
    });
  });
});
