import { describe, expect, it } from "vitest";

import { mayUse } from "../src/lib/admin-access";
import {
  boardHeadline,
  deskPath,
  QUEUE_TONE,
  queueCards,
  queuesWaiting,
  ringSegments,
  type ApiQueues,
  type ApiWaitingQueue,
  type QueueKey,
  type WaitingQueueKey,
} from "../src/lib/ops-board-live";

/* --------------------------------------------------------------------------
   POL-FE-15 — the Operations Board draws one card per queue that waits on
   BTG (GET /operations/board `queues`, POL-BE-15), oldest wait first, each
   opening the desk and tab where the wait is cleared. The cards are never
   added into one total: an item can sit on two desks.
   -------------------------------------------------------------------------- */

/** Every POL-BE-15 queue, with the desk (and tab) its card opens. */
const WAITING: Record<WaitingQueueKey, { label: string; href: string }> = {
  payouts: { label: "Payouts to review", href: "/admin/payouts" },
  makeGoods: { label: "Make-goods to decide", href: "/admin/intelligence/make-goods" },
  signups: { label: "New sign-ups to review", href: "/admin/new-signups?review=1" },
  organisations: { label: "Organisations to review", href: "/admin/onboarding" },
  sponsorRequests: { label: "Sponsor requests", href: "/admin/sponsor-requests" },
  guardianHandoffs: { label: "Guardian handoffs", href: "/admin/guardian-handoffs?tab=waiting" },
  heldListings: { label: "Listings to approve", href: "/admin/marketplace?queue=listings" },
  heldOrders: { label: "Orders to approve", href: "/admin/marketplace?queue=orders" },
  deliveryIssues: { label: "Delivery issues", href: "/admin/delivery-issues" },
  offers: { label: "Offers needing BTG", href: "/admin/offers" },
  dealDisputes: { label: "Deal disputes to decide", href: "/admin/deal-disputes?tab=documents" },
  refunds: { label: "Refunds to send", href: "/admin/refunds" },
  heldClosures: { label: "Account closures held", href: "/admin/closed-accounts?tab=closing" },
  reactivations: { label: "Reactivation requests", href: "/admin/closed-accounts" },
  paymentDisputes: { label: "Payment disputes", href: "/admin/payments/disputes" },
  paymentEvents: { label: "Payment events for BTG", href: "/admin/payments/events" },
  profileChanges: { label: "ID and name changes", href: "/admin/new-signups#sensitive-edits" },
  campaignRequests: { label: "Campaign requests", href: "/admin/campaign-requests" },
};
const WAITING_KEYS = Object.keys(WAITING) as WaitingQueueKey[];

const LOOP: Record<"applications" | "approvals" | "briefs" | "finance", string> = {
  applications: "/admin/applications",
  approvals: "/admin/approvals",
  briefs: "/admin/briefs",
  finance: "/admin/finance",
};

const NONE: ApiQueues = { applications: null, approvals: null, briefs: null, finance: null };

/** The whole board, every queue read, `waiting` in each and no time to sort by. */
function all(waiting = 1): ApiQueues {
  const q: ApiQueues = {
    applications: { waiting, over48h: 0, oldestSince: null },
    approvals: { waiting },
    briefs: { toQualify: waiting, toMatch: 0, oldestSince: null },
    finance: { held: waiting, disputed: 0 },
  };
  for (const key of WAITING_KEYS) q[key] = { waiting, oldestSince: null };
  return q;
}

const at = (waiting: number, oldestSince: string | null): ApiWaitingQueue => ({ waiting, oldestSince });

describe("POL-FE-15 · one card per queue that waits on BTG", () => {
  it("every queue gets its card, with the right label and the desk it opens", () => {
    const cards = queueCards(all(2));
    expect(cards).toHaveLength(4 + WAITING_KEYS.length);
    for (const key of WAITING_KEYS) {
      const card = cards.find((c) => c.key === key);
      expect(card, key).toMatchObject({ label: WAITING[key].label, href: WAITING[key].href, count: 2 });
      expect(card?.hint, key).toBeTruthy();
    }
    for (const [key, href] of Object.entries(LOOP)) {
      expect(cards.find((c) => c.key === key)?.href, key).toBe(href);
    }
  });

  it("each card's count is that queue's own `waiting` — a card is never two queues added", () => {
    const cards = queueCards({ ...NONE, signups: at(3, null), sponsorRequests: at(1, null), organisations: at(2, null) });
    expect(Object.fromEntries(cards.map((c) => [c.key, c.count]))).toEqual({ signups: 3, sponsorRequests: 1, organisations: 2 });
  });

  it("a null queue (a role that doesn't read it) and an absent one (an older API) get no card", () => {
    expect(queueCards(NONE)).toEqual([]);
    const some = queueCards({ ...NONE, refunds: null, offers: at(0, null), payouts: at(4, null) });
    expect(some.map((c) => c.key)).toEqual(["payouts", "offers"]);
    const q = all(1);
    q.dealDisputes = null;
    delete q.campaignRequests;
    const keys = queueCards(q).map((c) => c.key);
    expect(keys).not.toContain("dealDisputes");
    expect(keys).not.toContain("campaignRequests");
    expect(keys).toHaveLength(4 + WAITING_KEYS.length - 2);
  });

  it("orders the cards oldest wait first, those with no time after, in a stable base order", () => {
    const cards = queueCards({
      applications: { waiting: 2, over48h: 0, oldestSince: "2026-10-27T12:00:00.000Z" },
      approvals: { waiting: 5 },
      briefs: { toQualify: 1, toMatch: 0, oldestSince: "2026-10-20T12:00:00.000Z" },
      finance: { held: 0, disputed: 0 },
      payouts: at(1, "2026-10-24T12:00:00.000Z"),
      refunds: at(2, "2026-10-18T09:00:00.000Z"),
      signups: at(3, null),
      /* a stale time on an empty queue is nothing waiting — it sorts with the no-time group */
      offers: at(0, "2026-10-01T00:00:00.000Z"),
      /* a time that can't be read sorts as no time */
      heldOrders: at(2, "not a time"),
    });
    expect(cards.map((c) => c.key)).toEqual([
      "refunds", "briefs", "payouts", "applications",
      "approvals", "finance", "signups", "heldOrders", "offers",
    ]);
  });

  it("an older API without `oldestSince` on applications and briefs still orders them in the base order", () => {
    const cards = queueCards({
      applications: { waiting: 2, over48h: 0 }, approvals: { waiting: 1 },
      briefs: { toQualify: 1, toMatch: 0 }, finance: { held: 1, disputed: 0 },
      payouts: at(1, "2026-10-24T12:00:00.000Z"),
    });
    expect(cards.map((c) => c.key)).toEqual(["payouts", "applications", "approvals", "briefs", "finance"]);
  });

  it("shows the oldest wait as the desk's (New York) day, only when something waits", () => {
    const [signups] = queueCards({ ...NONE, signups: at(2, "2026-10-24T15:10:00.000Z") });
    expect(signups?.chips).toEqual([{ text: "oldest waiting since Oct 24", tone: "warn" }]);
    /* 03:30Z on the 24th is still the 23rd in New York */
    expect(queueCards({ ...NONE, campaignRequests: at(1, "2026-10-24T03:30:00.000Z") })[0]?.chips[0]?.text).toBe("oldest waiting since Oct 23");
    expect(queueCards({ ...NONE, makeGoods: at(0, "2026-10-24T15:10:00.000Z") })[0]?.chips).toEqual([]);
    expect(queueCards({ ...NONE, makeGoods: at(3, null) })[0]?.chips).toEqual([]);
    expect(queueCards({ ...NONE, makeGoods: at(3, "soon") })[0]?.chips).toEqual([]);
  });

  it("applications and briefs carry their oldest chip after their own chips, now the API dates them", () => {
    const cards = queueCards({
      ...NONE,
      applications: { waiting: 4, over48h: 1, oldestSince: "2026-10-22T12:00:00.000Z" },
      briefs: { toQualify: 1, toMatch: 2, oldestSince: "2026-10-23T12:00:00.000Z" },
    });
    expect(cards[0]?.chips.map((c) => c.text)).toEqual(["1 over 48 hours", "oldest waiting since Oct 22"]);
    expect(cards[1]?.chips.map((c) => c.text)).toEqual(["1 to qualify", "2 to match", "oldest waiting since Oct 23"]);
    /* nothing to qualify or match: no stale "since" */
    expect(queueCards({ ...NONE, briefs: { toQualify: 0, toMatch: 0, oldestSince: "2026-10-23T12:00:00.000Z" } })[0]?.chips).toEqual([]);
  });

  it("the headline counts queues with work, never the items added up", () => {
    const cards = queueCards({ ...NONE, signups: at(40, null), sponsorRequests: at(40, null), organisations: at(0, null), payouts: at(1, null) });
    expect(queuesWaiting(cards)).toBe(3);
    expect(boardHeadline(queuesWaiting(cards))).toEqual({ lead: "3 queues need", hand: "BTG’s hand", tail: "today." });
    expect(queuesWaiting(queueCards(all(0)))).toBe(0);
    expect(boardHeadline(0)).toEqual({ lead: "Nothing needs", hand: "BTG’s hand", tail: "right now." });
    expect(boardHeadline(null)).toEqual({ lead: "Operations,", hand: "live", tail: "today." });
  });

  it("the access check reads the path of a card's href, not its tab", () => {
    expect(deskPath("/admin/new-signups?review=1")).toBe("/admin/new-signups");
    expect(deskPath("/admin/new-signups#sensitive-edits")).toBe("/admin/new-signups");
    expect(deskPath("/admin/guardian-handoffs?tab=waiting#x")).toBe("/admin/guardian-handoffs");
    expect(deskPath("/admin/offers")).toBe("/admin/offers");
    /* The map matches on the exact path or a "prefix/": the whole href would
       pass as an unmapped route and open a desk the role can't use. */
    expect(mayUse("/admin/new-signups?review=1", ["SALES"])).toBe(true);
    expect(mayUse(deskPath("/admin/new-signups?review=1"), ["SALES"])).toBe(false);
    expect(mayUse(deskPath("/admin/new-signups#sensitive-edits"), ["BTG_ADMIN"])).toBe(true);
    /* Every card's desk is in the access map, so no tab link slips through unmapped. */
    for (const c of queueCards(all(1))) {
      expect(mayUse(deskPath(c.href), ["NETWORK_MGR"]), c.key).toBe(c.key === "applications");
    }
  });

  it("every queue has a ring colour of its own", () => {
    const keys = queueCards(all(1)).map((c) => c.key);
    expect(keys).toHaveLength(22);
    expect(new Set(keys.map((k) => QUEUE_TONE[k])).size).toBe(keys.length);
    for (const k of Object.keys(QUEUE_TONE) as QueueKey[]) expect(QUEUE_TONE[k]).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("the ring draws one equal arc per queue with work, 22 included, and goes round exactly once", () => {
    const C = 2 * Math.PI * 96;
    const segs = ringSegments(queueCards(all(1)), C, 4);
    expect(segs).toHaveLength(22);
    expect(segs.every((s) => s.len > 0)).toBe(true);
    expect(segs.reduce((n, s) => n + s.len, 0) + 22 * 4).toBeCloseTo(C, 6);
    expect(segs.at(-1)!.offset + segs.at(-1)!.len + 4).toBeCloseTo(C, 6);
    /* an empty queue draws no arc; a lone queue closes the circle */
    expect(ringSegments(queueCards({ ...NONE, offers: at(0, null), refunds: at(2, null) }), C, 4)).toMatchObject([{ key: "refunds", len: C, offset: 0 }]);
  });
});
