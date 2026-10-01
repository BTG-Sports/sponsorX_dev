import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   2S2-FE-03 follow-up — BTG answers an athlete's change request, and edits
   drafts, against the real API and database.

   A SENT offer's terms are fixed, so BTG answers a change request once:
     POST /offers/:id/change-requests/:requestId/keep { note }
       — the offer stands; the request is marked KEPT with BTG's reply,
         audited, and the athlete (a minor's guardian too) is emailed. The
         offer stays SENT and can still be accepted.
     POST /offers/:id/revise
       — in one transaction: the offer is withdrawn, a DRAFT copies every
         term (fromOfferId), unanswered requests are marked REVISED with the
         draft's id, both moves are audited, the athlete is told.
     PATCH /offers/:id — a DRAFT only, asked every check drafting asks.
     POST /offers/:id/send — the terms asked again; the athlete is emailed.
   Only Clerk is stubbed.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@oan-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();
const { hashAgreementBody } = await import("../src/domain/agreement-hash");

describe.skipIf(!hasDatabase)("2S2-FE-03 · BTG answers a change request; drafts are edited and sent", { timeout: 60_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");

  const T = "oan_btg";   // BTG's tenant
  const X = "oan_other"; // another tenant
  const HASH = hashAgreementBody(readFileSync(new URL("../agreements/CAMPAIGN_ORDER.v1.txt", import.meta.url), "utf8"));
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
  const inDays = (n: number) => new Date(Date.now() + n * 864e5);

  async function clean() {
    const ids = [T, X];
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 6; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = ANY($1::text[])`, ids).catch(() => {});
      }
    }
    await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
  }

  type Mail = { template: string; to: string; data: Record<string, string> };
  const emails = async (template: string, offerId?: string) =>
    (await prisma.outboxJob.findMany({ where: { tenantId: { in: [T, X] }, name: "notify.email" }, select: { payload: true } }))
      .map((r) => r.payload as Mail)
      .filter((p) => p.template === template && (!offerId || p.data.offerUrl?.endsWith(`/athlete/offers/${offerId}`)));
  const audits = (entityId: string, action: string) =>
    prisma.auditLog.findMany({ where: { tenantId: T, entityId, action }, select: { actorId: true, before: true, after: true } });

  const terms = (athleteId: string, extra: Record<string, unknown> = {}) => ({
    campaignId: `${T}_campaign`, athleteId, jobId: `${T}_job`, brief: "Post twice on game day.",
    compensation: 20_000, sellPrice: 40_000,
    deliverables: [{ title: "Feed post", dueDate: inDays(14).toISOString() }, { title: "Story", dueDate: inDays(21).toISOString() }],
    usageRights: "Organic social, 90 days", disclosures: ["#ad", "Paid partnership"], expiresAt: inDays(7).toISOString(), ...extra,
  });
  /** Drafted and sent by the campaign manager, through the API. */
  async function sentOffer(athleteId: string, extra: Record<string, unknown> = {}) {
    const made = await call("POST", "/offers", "oan_cm", terms(athleteId, extra));
    expect(made.status, made.text).toBe(201);
    const sent = await call("POST", `/offers/${made.json.id}/send`, "oan_cm");
    expect(sent.status, sent.text).toBe(200);
    return sent.json as { id: string; termsHash: string };
  }
  const ask = async (offerId: string, clerk: string, note: string) => {
    const res = await call("POST", `/offers/${offerId}/respond`, clerk, { decision: "REQUEST_CHANGE", note });
    expect(res.status, res.text).toBe(200);
    return (res.json.changeRequests as Array<{ id: string; note: string }>).find((r) => r.note === note)!.id;
  };
  const keep = (offerId: string, requestId: string, clerk: string, body: unknown) =>
    call("POST", `/offers/${offerId}/change-requests/${requestId}/keep`, clerk, body);

  beforeAll(async () => {
    await clean();
    await prisma.tenant.createMany({ data: [{ id: T, name: "OAN BTG" }, { id: X, name: "OAN other" }] });
    for (const t of [T, X]) {
      await prisma.sponsor.create({ data: { id: `${t}_sponsor`, tenantId: t, name: "Rosa's Tacos", categories: ["FAST_FOOD"] } });
      await prisma.nilJob.create({ data: { id: `${t}_job`, tenantId: t, name: "Game-day post", baseLow: 10_000, baseHigh: 20_000, sellLow: 20_000, sellHigh: 40_000, sellFloorEmerging: 15_000, sellFloorCreator: 20_000, sellFloorPremium: 30_000 } });
      await prisma.campaign.create({ data: { id: `${t}_campaign`, tenantId: t, sponsorId: `${t}_sponsor`, name: "Fall tacos", budget: 500_000, startDate: new Date(), endDate: inDays(90), state: "STAFFING" } });
    }
    await prisma.agreement.create({ data: { id: "oan_terms", tenantId: T, kind: "CAMPAIGN_ORDER", version: 1, bodyHash: HASH, effectiveAt: new Date("2026-01-01") } });
    await prisma.guardian.create({ data: { id: "oan_guardian", tenantId: T, legalName: "Pat Rivera", email: "oan_guardian@oan-test.invalid", relationship: "PARENT", verifiedAt: new Date() } });
    await prisma.athlete.createMany({ data: [
      { id: "oan_ath", tenantId: T, slug: "oan-ath", legalName: "Jordan Reed", displayName: "JORDAN", email: "oan_record@oan-test.invalid", sport: "Basketball", stateCode: "MD", ageBand: "18_PLUS", state: "ACTIVE" },
      { id: "oan_minor", tenantId: T, slug: "oan-minor", legalName: "Alex Rivera", displayName: "ALEX", email: "oan_minor@oan-test.invalid", sport: "Soccer", stateCode: "MD", ageBand: "16_17", state: "ACTIVE", guardianId: "oan_guardian" },
    ] });
    await prisma.inventoryItem.create({ data: { id: "oan_item", tenantId: T, athleteId: "oan_ath", title: "Game-day post", kind: "SOCIAL_POST", priceCents: 15_000 } });
    await prisma.user.createMany({ data: [
      { id: "oan_cm", tenantId: T, clerkId: "oan_cm", email: "oan_cm@oan-test.invalid", roles: ["CAMPAIGN_MGR"] },
      { id: "oan_admin", tenantId: T, clerkId: "oan_admin", email: "oan_admin@oan-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "oan_sales", tenantId: T, clerkId: "oan_sales", email: "oan_sales@oan-test.invalid", roles: ["SALES"] },
      { id: "oan_sponsor", tenantId: T, clerkId: "oan_sponsor", email: "oan_sponsor@oan-test.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: `${T}_sponsor` },
      { id: "oan_athlete", tenantId: T, clerkId: "oan_athlete", email: "oan_athlete@oan-test.invalid", roles: ["ATHLETE"], athleteId: "oan_ath" },
      { id: "oan_minor_user", tenantId: T, clerkId: "oan_minor_user", email: "oan_minor@oan-test.invalid", roles: ["ATHLETE"], athleteId: "oan_minor" },
      { id: "oan_guardian_user", tenantId: T, clerkId: "oan_guardian_user", email: "oan_guardian@oan-test.invalid", roles: ["GUARDIAN"], guardianId: "oan_guardian" },
      { id: "oan_x_admin", tenantId: X, clerkId: "oan_x_admin", email: "oan_x_admin@oan-test.invalid", roles: ["BTG_ADMIN"] },
    ] });
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await clean();
  });

  describe("sending", () => {
    it("emails the athlete the offer — at their login, with the sponsor, pay, deliverables, expiry and the link", async () => {
      const offer = await sentOffer("oan_ath");
      const sent = await emails("offer.sent", offer.id);
      expect(sent.map((e) => e.to)).toEqual(["oan_athlete@oan-test.invalid"]);
      expect(sent[0]!.data).toMatchObject({
        sponsorName: "Rosa's Tacos", campaignName: "Fall tacos", pay: "$200.00", seat: "athlete",
        deliverables: expect.stringContaining("Feed post"), expiresOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        offerUrl: expect.stringMatching(new RegExp(`/athlete/offers/${offer.id}$`)),
      });
      expect(sent[0]!.data.deliverables).toContain("Story");
    });

    it("and for a minor, their guardian too — who answers for them", async () => {
      const offer = await sentOffer("oan_minor");
      const sent = await emails("offer.sent", offer.id);
      expect(sent.map((e) => [e.to, e.data.seat]).sort()).toEqual([
        ["oan_guardian@oan-test.invalid", "guardian"], ["oan_minor@oan-test.invalid", "athlete"],
      ]);
    });
  });

  describe("keeping the offer as it stands", () => {
    let offer: { id: string; termsHash: string };
    let requestId = "";
    beforeAll(async () => {
      offer = await sentOffer("oan_ath");
      requestId = await ask(offer.id, "oan_athlete", "Could the story move a week later?");
    });

    it("needs a reply of at most 2000 characters", async () => {
      expect((await keep(offer.id, requestId, "oan_cm", {})).status).toBe(400);
      expect((await keep(offer.id, requestId, "oan_cm", { note: "   " })).status).toBe(400);
      expect((await keep(offer.id, requestId, "oan_cm", { note: "x".repeat(2001) })).status).toBe(400);
      expect((await keep(offer.id, requestId, "oan_cm", { note: "ok", extra: 1 })).status).toBe(400);
      expect(await emails("offer.changeKept", offer.id)).toEqual([]);
    });

    it("is BTG staff's alone — not the athlete, not sales, not the sponsor, not another tenant", async () => {
      const body = { note: "It stands." };
      for (const who of ["oan_athlete", "oan_sales", "oan_sponsor", "oan_x_admin"]) {
        expect((await keep(offer.id, requestId, who, body)).status, who).toBe(403);
      }
      expect(await prisma.offerChangeRequest.findUniqueOrThrow({ where: { id: requestId }, select: { answeredAt: true } })).toEqual({ answeredAt: null });
    });

    it("marks the request KEPT with the reply, audits it and emails the athlete; the offer stays SENT and acceptable", async () => {
      const reply = "The sponsor's launch date is fixed, so the dates stand.";
      expect((await keep(offer.id, "oan_no_such_request", "oan_cm", { note: reply })).status).toBe(404);
      const res = await keep(offer.id, requestId, "oan_cm", { note: `  ${reply}  ` });
      expect(res.status, res.text).toBe(200);
      expect(res.json.state).toBe("SENT");
      expect(res.json.changeRequests).toEqual([expect.objectContaining({
        id: requestId, answer: "KEPT", answerNote: reply, answeredBy: "oan_cm", answeredAt: expect.any(String), revisedOfferId: null,
      })]);
      /* Once — a second answer is refused. */
      expect((await keep(offer.id, requestId, "oan_cm", { note: "Again" })).status).toBe(409);
      expect((await keep(offer.id, requestId, "oan_admin", { note: "Again" })).status).toBe(409);

      const [row, ...more] = await audits(offer.id, "offer.changeAnswered");
      expect(more).toEqual([]);
      expect(row).toMatchObject({ actorId: "oan_cm", after: expect.objectContaining({ changeRequestId: requestId, answer: "KEPT", note: reply }) });

      const sent = await emails("offer.changeKept", offer.id);
      expect(sent.map((e) => e.to)).toEqual(["oan_athlete@oan-test.invalid"]);
      expect(sent[0]!.data).toMatchObject({ reply, request: "Could the story move a week later?", sponsorName: "Rosa's Tacos" });

      /* The athlete sees how their request was answered… */
      const mine = await call("GET", `/offers/${offer.id}`, "oan_athlete");
      expect(mine.json.changeRequests[0]).toMatchObject({ answer: "KEPT", answerNote: reply });
      expect(mine.json).not.toHaveProperty("sellPrice");
      /* …and can still accept the offer as it stands. */
      const accepted = await call("POST", `/offers/${offer.id}/respond`, "oan_athlete", {
        decision: "ACCEPT", termsHashShown: offer.termsHash, agreementId: "oan_terms", bodyHashShown: HASH,
      });
      expect(accepted.status, accepted.text).toBe(200);
      expect(accepted.json.state).toBe("ACCEPTED");
      /* An answered offer has nothing left to keep. */
      expect((await keep(offer.id, requestId, "oan_cm", { note: "Late" })).status).toBe(409);
    });

    it("for a minor, the guardian who asked hears the answer, and the minor too", async () => {
      const minorOffer = await sentOffer("oan_minor");
      const id = await ask(minorOffer.id, "oan_guardian_user", "Can the shoot be on a weekend?");
      const res = await keep(minorOffer.id, id, "oan_cm", { note: "It is on a Saturday already." });
      expect(res.status, res.text).toBe(200);
      expect((await emails("offer.changeKept", minorOffer.id)).map((e) => e.to).sort())
        .toEqual(["oan_guardian@oan-test.invalid", "oan_minor@oan-test.invalid"]);
    });

    it("refuses an expired offer — it is no longer the athlete's to accept", async () => {
      /* Sent a week ago, with a week to answer — lapsed a minute ago. */
      const late = await prisma.offer.create({ data: {
        tenantId: T, campaignId: `${T}_campaign`, athleteId: "oan_ath", jobId: `${T}_job`, brief: "Late.", compensation: 20_000, sellPrice: 40_000,
        deliverables: [{ title: "Post", dueDate: inDays(14).toISOString() }], usageRights: "90 days", disclosures: [],
        expiresAt: new Date(Date.now() - 60_000), state: "SENT", sentAt: inDays(-7), termsHash: "e".repeat(64),
      }, select: { id: true } });
      await prisma.offerChangeRequest.create({ data: { id: "oan_late_request", tenantId: T, offerId: late.id, requestedBy: "oan_athlete", note: "Later dates?" } });
      expect((await keep(late.id, "oan_late_request", "oan_cm", { note: "It stands." })).status).toBe(409);
    });
  });

  describe("revising, editing and sending again", () => {
    let old: { id: string };
    let kept = "";
    let open = "";
    let draftId = "";
    beforeAll(async () => {
      old = await sentOffer("oan_ath", { inventoryItemId: "oan_item", exclusivityDays: 30, jobId: `${T}_job` });
      kept = await ask(old.id, "oan_athlete", "First: can the pay go up?");
      expect((await keep(old.id, kept, "oan_cm", { note: "Pay is the sponsor's maximum." })).status).toBe(200);
      open = await ask(old.id, "oan_athlete", "Second: can the story be dropped?");
    });

    it("is BTG staff's alone, and only for a SENT offer", async () => {
      for (const who of ["oan_athlete", "oan_sales", "oan_sponsor", "oan_x_admin"]) {
        expect((await call("POST", `/offers/${old.id}/revise`, who)).status, who).toBe(403);
      }
      const draft = await call("POST", "/offers", "oan_cm", terms("oan_ath"));
      expect((await call("POST", `/offers/${draft.json.id}/revise`, "oan_cm")).status).toBe(409);
    });

    it("withdraws the offer and copies every term into a new draft; the open request is marked REVISED with it", async () => {
      const before = (await call("GET", `/offers/${old.id}`, "oan_admin")).json;
      const res = await call("POST", `/offers/${old.id}/revise`, "oan_admin");
      expect(res.status, res.text).toBe(200);
      const { withdrawn, draft } = res.json;
      draftId = draft.id;
      expect(withdrawn).toMatchObject({ id: old.id, state: "WITHDRAWN", respondedAt: expect.any(String) });
      expect(draft).toMatchObject({ state: "DRAFT", fromOfferId: old.id, createdBy: "oan_admin", termsHash: null, sentAt: null });
      expect(draft.id).not.toBe(old.id);
      for (const k of ["campaignId", "athleteId", "jobId", "inventoryItemId", "brief", "compensation", "sellPrice", "deliverables",
        "usageRights", "exclusivityDays", "disclosures", "expiresAt"] as const) {
        expect(draft[k], k).toEqual(before[k]);
      }
      expect(draft.inventoryItemId).toBe("oan_item");
      expect(draft.exclusivityDays).toBe(30);

      /* The KEPT answer stands; only the unanswered request is REVISED. */
      const byId = Object.fromEntries((withdrawn.changeRequests as Array<{ id: string }>).map((r) => [r.id, r]));
      expect(byId[kept]).toMatchObject({ answer: "KEPT", revisedOfferId: null });
      expect(byId[open]).toMatchObject({ answer: "REVISED", revisedOfferId: draft.id, answeredBy: "oan_admin", answeredAt: expect.any(String), answerNote: null });

      /* Audited, both moves. */
      expect(await audits(old.id, "offer.withdraw")).toEqual([expect.objectContaining({ actorId: "oan_admin", after: { state: "WITHDRAWN" } })]);
      expect(await audits(draft.id, "offer.revise")).toEqual([expect.objectContaining({
        actorId: "oan_admin", after: expect.objectContaining({ fromOfferId: old.id, answeredChangeRequestIds: [open] }),
      })]);
      /* The athlete is told a revised offer is coming. */
      expect((await emails("offer.revising", old.id)).map((e) => e.to)).toEqual(["oan_athlete@oan-test.invalid"]);
      /* The athlete sees the withdrawn offer and how their request was answered — not the draft. */
      const mine = await call("GET", `/offers/${old.id}`, "oan_athlete");
      expect(mine.json.state).toBe("WITHDRAWN");
      expect(mine.json.changeRequests.find((r: { id: string }) => r.id === open)).toMatchObject({ answer: "REVISED", revisedOfferId: draft.id });
      expect((await call("GET", `/offers/${draft.id}`, "oan_athlete")).status).toBe(403);
      /* A withdrawn offer cannot be revised (or kept) again. */
      expect((await call("POST", `/offers/${old.id}/revise`, "oan_admin")).status).toBe(409);
      expect((await keep(old.id, open, "oan_cm", { note: "x" })).status).toBe(409);
    });

    it("the draft is edited — a DRAFT only, asked the floor and the budget again, audited", async () => {
      /* Only a draft. */
      expect((await call("PATCH", `/offers/${old.id}`, "oan_cm", { brief: "Changed" })).status).toBe(409);
      /* Not the athlete's or another tenant's to edit; whose offer it is never changes. */
      expect((await call("PATCH", `/offers/${draftId}`, "oan_athlete", { brief: "Mine" })).status).toBe(403);
      expect((await call("PATCH", `/offers/${draftId}`, "oan_x_admin", { brief: "Theirs" })).status).toBe(403);
      expect((await call("PATCH", `/offers/${draftId}`, "oan_cm", { athleteId: "oan_minor" })).status).toBe(400);
      /* The margin floor: pay of 30,000 needs a sell price of at least 42,000. */
      const belowFloor = await call("PATCH", `/offers/${draftId}`, "oan_cm", { compensation: 30_000 });
      expect(belowFloor.status, belowFloor.text).toBe(422);
      /* The budget: a 400,000 line needs 560,000 of a 500,000 budget. */
      expect((await call("PATCH", `/offers/${draftId}`, "oan_cm", { compensation: 400_000, sellPrice: 600_000 })).status).toBe(422);
      /* Below the inventory item's own price. */
      expect((await call("PATCH", `/offers/${draftId}`, "oan_cm", { compensation: 12_000, sellPrice: 40_000 })).status).toBe(409);
      /* The terms themselves. */
      expect((await call("PATCH", `/offers/${draftId}`, "oan_cm", { expiresAt: new Date(Date.now() - 864e5).toISOString() })).status).toBe(422);
      const unchanged = (await call("GET", `/offers/${draftId}`, "oan_cm")).json;
      expect(unchanged.compensation).toBe(20_000);

      const ok = await call("PATCH", `/offers/${draftId}`, "oan_cm", { compensation: 25_000, sellPrice: 40_000, deliverables: [{ title: "Feed post", dueDate: inDays(14).toISOString() }] });
      expect(ok.status, ok.text).toBe(200);
      expect(ok.json).toMatchObject({ state: "DRAFT", compensation: 25_000, sellPrice: 40_000, brief: unchanged.brief, fromOfferId: old.id });
      expect(ok.json.deliverables).toHaveLength(1);
      const [row] = await audits(draftId, "offer.update");
      expect(row).toMatchObject({ actorId: "oan_cm", before: expect.objectContaining({ compensation: 20_000 }), after: expect.objectContaining({ compensation: 25_000 }) });
      expect(row!.after).not.toHaveProperty("brief");
    });

    it("a past-due deliverable blocks the send; once fixed, it sends and the athlete is emailed", async () => {
      /* The draft sat until its first due date passed. */
      await prisma.offer.update({ where: { id: draftId }, data: { deliverables: [{ title: "Feed post", dueDate: new Date(Date.now() - 864e5).toISOString() }] } });
      const blocked = await call("POST", `/offers/${draftId}/send`, "oan_cm");
      expect(blocked.status).toBe(422);
      expect(blocked.text).toMatch(/due in the past/);
      expect(await emails("offer.sent", draftId)).toEqual([]);

      expect((await call("PATCH", `/offers/${draftId}`, "oan_cm", { deliverables: [{ title: "Feed post", dueDate: inDays(10).toISOString() }] })).status).toBe(200);
      const sent = await call("POST", `/offers/${draftId}/send`, "oan_cm");
      expect(sent.status, sent.text).toBe(200);
      expect(sent.json.state).toBe("SENT");
      expect((await emails("offer.sent", draftId)).map((e) => e.to)).toEqual(["oan_athlete@oan-test.invalid"]);
      expect((await emails("offer.sent", draftId))[0]!.data.pay).toBe("$250.00");
      /* The revised offer is the athlete's now. */
      expect((await call("GET", `/offers/${draftId}`, "oan_athlete")).json).toMatchObject({ state: "SENT", fromOfferId: old.id });
    });

    it("for a minor, the guardian is told a revision is coming too", async () => {
      const minorOffer = await sentOffer("oan_minor");
      expect((await call("POST", `/offers/${minorOffer.id}/revise`, "oan_cm")).status).toBe(200);
      expect((await emails("offer.revising", minorOffer.id)).map((e) => e.to).sort())
        .toEqual(["oan_guardian@oan-test.invalid", "oan_minor@oan-test.invalid"]);
    });
  });
});
