import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   POL-BE-15 — GET /operations/board counts every queue that waits on BTG.

   "Fix: one counts endpoint covering every queue that waits on BTG. The
   dashboard shows each count, linked to its queue, oldest first. Done when:
   every BTG queue has a count on the dashboard; tests."

   Each tenant gets `n` waiting items per queue (A two, B three) dated 3, 4,
   5 days ago, and one item per queue that is NOT waiting on BTG, dated 30
   days ago — so a count that took it, or an "oldest since" that reached it,
   fails. Each count must equal the list the card links to.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@be15-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

const NEW_QUEUES = [
  "signups", "organisations", "sponsorRequests", "guardianHandoffs", "heldListings", "heldOrders", "deliveryIssues",
  "offers", "dealDisputes", "refunds", "heldClosures", "reactivations", "paymentDisputes", "paymentEvents", "profileChanges",
] as const;

describe.skipIf(!hasDatabase)("POL-BE-15 · every queue that waits on BTG has a count", async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");

  const A = "be15_tenant_a";
  const B = "be15_tenant_b";
  const N = { [A]: 2, [B]: 3 } as Record<string, number>;
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
  const far = new Date(Date.now() + 3650 * 86_400_000);

  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  const call = (path: string, who: string) => fetch(`${base}/api/v1${path}`, { headers: { "x-test-clerk": who } });

  async function wipe() {
    const tables = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 8; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" IN ($1, $2)`, A, B).catch(() => {});
      }
    }
    await prisma.tenant.deleteMany({ where: { id: { in: [A, B] } } });
  }

  async function seed(T: string) {
    const n = N[T]!;
    const p = (s: string) => `${T}_${s}`;
    const items = Array.from({ length: n }, (_, i) => ({ i, at: daysAgo(3 + i) }));
    const old = daysAgo(30);

    await prisma.tenant.create({ data: { id: T, name: `BE15 ${T}` } });
    await prisma.sponsor.create({ data: { id: p("sponsor"), tenantId: T, name: "BE15 Sponsor" } });
    await prisma.property.create({ data: { id: p("prop"), tenantId: T, slug: p("prop").replaceAll("_", "-"), name: "BE15 School", kind: "SCHOOL" } });
    const athlete = (id: string, extra: Record<string, unknown> = {}) => prisma.athlete.create({ data: {
      id: p(id), tenantId: T, slug: p(id), legalName: id, displayName: id.toUpperCase(), email: `${p(id)}@x.invalid`,
      sport: "Soccer", ageBand: "18_PLUS", state: "ACTIVE", createdAt: old, ...extra,
    } });
    await athlete("live");

    /* Sign-ups held: an athlete, a sponsor and an organisation per item — each held for a person. */
    for (const { i, at } of items) {
      await athlete(`held${i}`, { state: "SUBMITTED", reviewReasons: ["Name doesn't match the ID"], createdAt: at });
      await prisma.inquiry.create({ data: { id: p(`inq${i}`), tenantId: T, lastName: "Held", email: `${p(`inq${i}`)}@x.invalid`, source: "join", state: "NEW", reviewReasons: ["Free email domain"], createdAt: at } });
      await prisma.propertyOnboarding.create({ data: { id: p(`org${i}`), tenantId: T, orgType: "SCHOOL", orgName: `Org ${i}`, state: "PENDING_REVIEW", submittedAt: at, createdAt: at } });
    }
    await prisma.inquiry.create({ data: { id: p("inq_done"), tenantId: T, lastName: "Done", email: `${p("inq_done")}@x.invalid`, source: "join", state: "APPROVED", createdAt: old } });
    await prisma.propertyOnboarding.create({ data: { id: p("org_done"), tenantId: T, orgType: "SCHOOL", orgName: "Org done", state: "APPROVED", submittedAt: old, createdAt: old } });

    /* Guardian handoffs: handed to BTG, and (the second) waiting but escalated after 7 days. */
    const handoff = (id: string, extra: Record<string, unknown>) => prisma.guardianHandoff.create({ data: {
      id: p(id), tenantId: T, athleteId: p("live"), fromGuardianId: p("guardian"), requesterName: "New Guardian",
      requesterEmail: `${p(id)}@x.invalid`, relationship: "PARENT", createdAt: old, ...extra,
    } });
    for (const { i, at } of items) {
      await handoff(`ho${i}`, i === 1 ? { state: "WAITING", escalatedAt: at } : { state: "HANDED_OFF", decidedAt: at });
    }
    await handoff("ho_wait", { state: "WAITING" });

    /* Listings: each waiting one on its own item; a published one is not waiting. */
    await prisma.inventoryItem.create({ data: { id: p("item_live"), tenantId: T, propertyId: p("prop"), title: "Banner", kind: "SIGNAGE", priceCents: 9000 } });
    await prisma.listing.create({ data: { id: p("listing_live"), tenantId: T, propertyId: p("prop"), inventoryItemId: p("item_live"), title: "Banner", state: "PUBLISHED", publishedAt: old, createdAt: old } });
    for (const { i, at } of items) {
      await prisma.inventoryItem.create({ data: { id: p(`item${i}`), tenantId: T, propertyId: p("prop"), title: `Item ${i}`, kind: "SIGNAGE", priceCents: 9000 } });
      await prisma.listing.create({ data: { id: p(`listing${i}`), tenantId: T, propertyId: p("prop"), inventoryItemId: p(`item${i}`), title: `Item ${i}`, state: "PENDING_APPROVAL", submittedAt: at, createdAt: at } });
    }

    /* Marketplace orders: waiting for BTG's approval; one waiting on its seller is not BTG's. */
    const order = async (id: string, state: string, createdAt: Date, withLine = false) => {
      await prisma.reservation.create({ data: { id: p(`res_${id}`), tenantId: T, sponsorId: p("sponsor"), cartId: p(`cart_${id}`), expiresAt: far } });
      await prisma.marketplaceOrder.create({ data: {
        id: p(id), tenantId: T, sponsorId: p("sponsor"), reservationId: p(`res_${id}`), state: state as never, createdAt,
        subtotalCents: 9000, feesCents: 0, totalCents: 9000, requiresApproval: state === "PENDING_APPROVAL", approvalReasons: [],
        ...(withLine ? { lines: { create: [{
          id: p(`line_${id}`), tenantId: T, listingId: p("listing_live"), inventoryItemId: p("item_live"), itemTenantId: T, propertyId: p("prop"), title: "Banner",
          quantity: 1, startsOn: daysAgo(20), endsOn: daysAgo(10), unitPriceCents: 9000, lineTotalCents: 9000,
        }] } } : {}),
      } });
    };
    for (const { i, at } of items) await order(`mo${i}`, "PENDING_APPROVAL", at);
    await order("mo_seller", "PENDING_SELLER", old);

    /* Delivery issues: escalated to BTG; one still the seller's to answer is not. */
    const issue = async (id: string, extra: Record<string, unknown>) => {
      await order(`dv_${id}`, "IN_DELIVERY", old, true);
      await prisma.orderLineDelivery.create({ data: {
        id: p(`delivery_${id}`), tenantId: T, orderId: p(`dv_${id}`), lineId: p(`line_dv_${id}`), sponsorId: p("sponsor"), propertyId: p("prop"), propertyTenantId: T, state: "IN_DELIVERY",
      } });
      await prisma.deliveryIssue.create({ data: {
        id: p(id), tenantId: T, orderId: p(`dv_${id}`), lineId: p(`line_dv_${id}`), deliveryId: p(`delivery_${id}`),
        problemNote: "The banner never went up", openedAt: old, createdAt: old, ...extra,
      } as never });
    };
    for (const { i, at } of items) {
      await issue(`issue${i}`, { kind: "OVERDUE", stage: "ESCALATED", escalatedAt: at, escalationReason: "NOT_DELIVERED", escalationNote: "Past its end date" });
    }
    await issue("issue_seller", { kind: "PROBLEM", stage: "SELLER_TO_ANSWER", sellerDueAt: far });

    /* Campaign side: a job and an order per dispute (one open dispute per order). */
    await prisma.campaign.create({ data: { id: p("campaign"), tenantId: T, sponsorId: p("sponsor"), name: "BE15 campaign", budget: 100000, startDate: daysAgo(40), endDate: far, state: "ACTIVE" } });
    const campaignOrder = async (id: string) => {
      await prisma.nilJob.create({ data: { id: p(`job_${id}`), tenantId: T, name: `Job ${id}`, baseLow: 100, baseHigh: 200, sellLow: 150, sellHigh: 300, sellFloorEmerging: 150, sellFloorCreator: 150, sellFloorPremium: 150 } });
      await prisma.campaignOrder.create({ data: {
        id: p(`co_${id}`), tenantId: T, campaignId: p("campaign"), athleteId: p("live"), jobId: p(`job_${id}`),
        compensation: 10000, sellPrice: 20000, usageRights: "90 days", dueDate: far, state: "ACTIVE",
      } });
    };

    /* Offers: drafts, and (the second) a sent offer with a change request nobody answered — it waits from the request. */
    const offer = async (id: string, state: string, createdAt: Date) => {
      await campaignOrder(`of_${id}`);
      await prisma.offer.create({ data: {
        id: p(id), tenantId: T, campaignId: p("campaign"), athleteId: p("live"), jobId: p(`job_of_${id}`), brief: "Post once",
        compensation: 10000, sellPrice: 20000, deliverables: [], usageRights: "90 days", expiresAt: far, state: state as never, createdAt,
      } });
    };
    for (const { i, at } of items) {
      if (i === 1) {
        await offer(`offer${i}`, "SENT", old);
        await prisma.offerChangeRequest.create({ data: { id: p(`ocr${i}`), tenantId: T, offerId: p(`offer${i}`), requestedBy: p("live"), note: "Can we move the date?", createdAt: at } });
      } else {
        await offer(`offer${i}`, "DRAFT", at);
      }
    }
    await offer("offer_sent", "SENT", old);

    /* Deal disputes: the documents are in, BTG to decide; one still waiting for the athlete's documents is not. */
    const dispute = async (id: string, state: string, documentsInAt: Date | null) => {
      await campaignOrder(`dd_${id}`);
      await prisma.dealDispute.create({ data: {
        id: p(id), tenantId: T, orderId: p(`co_dd_${id}`), athleteId: p("live"), source: "SCHOOL", reason: "School rule",
        documentsRequested: "The school's NIL policy", openedBy: p("admin"), state: state as never, openedAt: old, documentsInAt,
      } });
    };
    for (const { i, at } of items) await dispute(`dd${i}`, "DOCUMENTS_IN", at);
    await dispute("dd_open", "OPEN", null);

    /* Refunds to send; one sent. */
    for (const { i, at } of items) {
      await prisma.refundDue.create({ data: { id: p(`refund${i}`), tenantId: T, orderId: p(`mo${i}`), sponsorId: p("sponsor"), amountCents: 700, cause: "SPONSOR_CANCELLED", state: "OPEN", createdAt: at } });
    }
    await prisma.refundDue.create({ data: { id: p("refund_sent"), tenantId: T, orderId: p("mo_seller"), sponsorId: p("sponsor"), amountCents: 700, cause: "SPONSOR_CANCELLED", state: "SENT", sentAt: old, sentBy: p("finance"), method: "BANK_TRANSFER", sentOn: old, reference: "ACH-1", createdAt: old } as never });

    /* Closures held for a person; one withdrawn. Reactivations asked; a closure that never asked. */
    for (const { i, at } of items) {
      await prisma.closureRequest.create({ data: { id: p(`cr${i}`), tenantId: T, subjectKind: "ATHLETE", subjectId: p(`cr_subject${i}`), subjectTenantId: T, requestedBy: p("live"), state: "HELD", createdAt: at } });
      await prisma.accountClosure.create({ data: {
        id: p(`ac${i}`), tenantId: T, subjectKind: "ATHLETE", subjectId: p(`ac_subject${i}`), cause: "SELF", retainUntil: far,
        contactEmail: `${p(`ac${i}`)}@x.invalid`, displayName: `Closed ${i}`, reactivationRequestedAt: at,
      } });
    }
    await prisma.closureRequest.create({ data: { id: p("cr_gone"), tenantId: T, subjectKind: "ATHLETE", subjectId: p("cr_subject_gone"), subjectTenantId: T, requestedBy: p("live"), state: "WITHDRAWN", createdAt: old } });
    await prisma.accountClosure.create({ data: {
      id: p("ac_quiet"), tenantId: T, subjectKind: "ATHLETE", subjectId: p("ac_subject_quiet"), cause: "SELF", retainUntil: far,
      contactEmail: `${p("ac_quiet")}@x.invalid`, displayName: "Closed quietly",
    } });

    /* Payment disputes open; payment events held for BTG; one resolved. */
    for (const { i, at } of items) {
      await prisma.paymentDispute.create({ data: { id: p(`pd${i}`), tenantId: T, orderId: p("mo0"), sponsorId: p("sponsor"), provider: "standin", providerDisputeRef: p(`pd${i}`), amountCents: 900, state: "OPEN", openedAt: at } });
      await prisma.paymentEvent.create({ data: { id: p(`pe${i}`), tenantId: T, provider: "standin", providerEventId: p(`pe${i}`), type: "payment.failed", occurredAt: at, receivedAt: at, payload: {}, status: "HELD", outcome: "held for BTG", appliedAt: at } });
    }
    await prisma.paymentDispute.create({ data: { id: p("pd_won"), tenantId: T, orderId: p("mo0"), sponsorId: p("sponsor"), provider: "standin", providerDisputeRef: p("pd_won"), amountCents: 900, state: "WON", providerOutcome: "WON", providerClosedAt: old, reviewStartedAt: old, reviewedBy: p("finance"), resolvedAt: old, resolvedBy: p("finance"), openedAt: old } as never });
    await prisma.paymentEvent.create({ data: { id: p("pe_done"), tenantId: T, provider: "standin", providerEventId: p("pe_done"), type: "payment.failed", occurredAt: old, receivedAt: old, payload: {}, status: "HELD", outcome: "held for BTG", appliedAt: old, resolvedAt: old, resolvedBy: p("finance"), resolutionNote: "Retried by hand" } });

    /* Sensitive changes BTG must answer: an adulthood change held with no ID, and (the second) a legal name whose ID arrived.
       A legal name still missing its ID waits on the athlete. */
    for (const { i, at } of items) {
      await prisma.athleteProfileChange.create({ data: {
        id: p(`pc${i}`), tenantId: T, athleteId: p("live"), sensitive: true, state: "PENDING", createdAt: at,
        ...(i === 1 ? { fields: { legalName: "New Name" }, idDocumentUploadedAt: at } : { fields: { dateOfBirth: "2008-01-01" } }),
      } });
    }
    await prisma.athleteProfileChange.create({ data: { id: p("pc_noid"), tenantId: T, athleteId: p("live"), sensitive: true, state: "PENDING", fields: { legalName: "Other Name" }, createdAt: old } });

    const users: Array<[string, string]> = [
      ["admin", "BTG_ADMIN"], ["network", "NETWORK_MGR"], ["finance", "FINANCE"], ["campaigns", "CAMPAIGN_MGR"], ["sales", "SALES"],
    ];
    for (const [id, role] of users) {
      await prisma.user.create({ data: { id: p(id), tenantId: T, clerkId: p(id), email: `${p(id)}@x.invalid`, roles: [role as never] } });
    }
    await prisma.user.create({ data: { id: p("sponsor_user"), tenantId: T, clerkId: p("sponsor_user"), email: `${p("sponsor_user")}@x.invalid`, roles: ["SPONSOR_ADMIN"], sponsorId: p("sponsor") } });
  }

  beforeAll(async () => {
    await wipe();
    await seed(A);
    await seed(B);
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await wipe();
  });

  type Q = { waiting: number; oldestSince: string | null } | null;
  const board = async (who: string) => {
    const res = await call("/operations/board", who);
    return { status: res.status, queues: res.status === 200 ? ((await res.json()).queues as Record<string, Q>) : null };
  };
  const ageInDays = (iso: string | null) => (iso === null ? null : Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000));

  it.each([A, B])("BTG admin of %s gets every new queue, n waiting each, the oldest n+2 days ago", async (T) => {
    const { status, queues } = await board(`${T}_admin`);
    expect(status).toBe(200);
    const n = N[T]!;
    for (const key of NEW_QUEUES) {
      /* Sign-ups holds three kinds per item: an athlete, a sponsor and an organisation. */
      const want = key === "signups" ? 3 * n : n;
      expect(queues![key], key).toEqual({ waiting: want, oldestSince: expect.any(String) });
      expect(ageInDays(queues![key]!.oldestSince), key).toBe(n + 2);
    }
  });

  it("each role gets only the queues it reads tenant-wide", async () => {
    const present = (q: Record<string, Q>) => NEW_QUEUES.filter((k) => q[k] !== null).sort();
    expect(present((await board(`${A}_finance`)).queues!)).toEqual(["dealDisputes", "heldOrders", "paymentDisputes", "paymentEvents", "refunds"]);
    expect(present((await board(`${A}_network`)).queues!)).toEqual(["profileChanges", "signups"]);
    expect(present((await board(`${A}_sales`)).queues!)).toEqual(["offers", "sponsorRequests"]);
    expect(present((await board(`${A}_campaigns`)).queues!)).toEqual(["dealDisputes", "offers"]);
    /* The network manager's sign-ups are athletes only — it doesn't read sponsors or organisations. */
    expect((await board(`${A}_network`)).queues!.signups).toMatchObject({ waiting: N[A] });
  });

  it("a sponsor is refused the board outright", async () => {
    expect((await board(`${A}_sponsor_user`)).status).toBe(403);
  });

  /* Each card equals the list it links to, read the way the page reads it. */
  it("every count agrees with the list its card links to", async () => {
    const who = `${A}_admin`;
    const json = async (path: string) => {
      const res = await call(path, who);
      expect(res.status, path).toBe(200);
      return (await res.json()) as Record<string, unknown>;
    };
    const rows = async (path: string) => {
      const body = await json(path);
      const list = Object.values(body).find(Array.isArray);
      expect(list, `${path} returns a list`).toBeDefined();
      return (list as unknown[]).length;
    };
    const { queues } = await board(who);
    const summary = (await json("/signups/stream/summary")) as { all: { held: number } };
    expect(queues!.signups!.waiting).toBe(summary.all.held);
    expect(queues!.organisations!.waiting).toBe(await rows("/onboarding?state=PENDING_REVIEW"));
    expect(queues!.sponsorRequests!.waiting).toBe(await rows("/sponsor-requests?state=NEW"));
    expect(queues!.guardianHandoffs!.waiting).toBe(await rows("/guardian-handoffs?group=WAITING_FOR_BTG"));
    expect(queues!.heldListings!.waiting).toBe(await rows("/listings?state=PENDING_APPROVAL"));
    expect(queues!.heldOrders!.waiting).toBe(await rows("/marketplace-orders?state=PENDING_APPROVAL"));
    expect(queues!.deliveryIssues!.waiting).toBe(((await json("/delivery-issues?tab=problems&page=1")) as { counts: { problems: number } }).counts.problems);
    expect(queues!.offers!.waiting).toBe(((await json("/offers?tab=needs&page=1")) as { tabs: { needs: number } }).tabs.needs);
    expect(queues!.dealDisputes!.waiting).toBe(await rows("/deal-disputes?state=DOCUMENTS_IN"));
    expect(queues!.refunds!.waiting).toBe(await rows("/refunds?state=OPEN"));
    expect(queues!.heldClosures!.waiting).toBe(await rows("/account-closure-requests?state=HELD"));
    expect(queues!.reactivations!.waiting).toBe(await rows("/account-closures?tab=asking"));
    expect(queues!.paymentDisputes!.waiting).toBe(await rows("/disputes?state=OPEN"));
    expect(queues!.paymentEvents!.waiting).toBe(await rows("/payment-events?status=HELD,FAILED&resolved=false"));
    /* The sensitive-edits list, filtered by the frontend's own "Waiting for you" rule. */
    const { awaitingBtg } = await import("../../frontend/src/lib/profile-changes-live");
    const edits = ((await json("/profile-changes")) as { edits: Parameters<typeof awaitingBtg>[0][] }).edits;
    expect(queues!.profileChanges!.waiting).toBe(edits.filter(awaitingBtg).length);
  });
});

/* The backend's rule for "a sensitive change BTG must answer" is the frontend chip's, case by case. */
describe("POL-BE-15 · sensitive changes awaiting BTG — one rule, both sides", () => {
  it("agrees with the frontend's awaitingBtg for every shape of PENDING change", async () => {
    const { awaitingBtg: backend } = await import("../src/domain/athlete-profile-change");
    const { awaitingBtg: frontend } = await import("../../frontend/src/lib/profile-changes-live");
    const at = new Date("2026-10-28T12:00:00Z");
    const cases = [
      { fields: { dateOfBirth: "2008-01-01" }, idDocumentUploadedAt: null },
      { fields: { stateCode: "VA" }, idDocumentUploadedAt: null },
      { fields: { legalName: "New" }, idDocumentUploadedAt: null },
      { fields: { legalName: "New" }, idDocumentUploadedAt: at },
      { fields: { legalName: "New", dateOfBirth: "2008-01-01" }, idDocumentUploadedAt: null },
    ];
    for (const c of cases) {
      const fe = frontend({ state: "PENDING", fields: c.fields, idDocumentUploadedAt: c.idDocumentUploadedAt?.toISOString() ?? null } as never);
      expect(backend(c), JSON.stringify(c)).toBe(fe);
    }
  });
});
