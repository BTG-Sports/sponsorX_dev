import { beforeEach, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   2S2-FE-01 — the athlete portal home, Phase 2 view: upcoming campaigns,
   approval requests, overdue deliverables, earnings to date, payout status
   and inventory performance in one view, from the signed-in athlete's own
   reads. "Portal home renders live data for the signed-in athlete only."

   The helpers turn API figures into words and never count over a list; the
   page is rendered against a stubbed API, so every figure on it is traced
   to the read it came from — and a login that has none of the marketplace
   reads (403) gets the Phase 1 home, with no invented zeros.
   -------------------------------------------------------------------------- */

const vars = vi.hoisted(() => ({
  actor: null as unknown,
  calls: [] as string[],
  responses: {} as Record<string, { status: number; body: unknown }>,
}));
vi.mock("@/server/api", () => ({
  apiFetch: async (path: string) => {
    vars.calls.push(path);
    /* The overdue read (?to=) has its own answer. */
    const want = path.startsWith("/deliverables?") && path.includes("&to=") ? "/deliverables#overdue" : null;
    const key = want ?? Object.keys(vars.responses).find((k) => path === k || path.startsWith(`${k}?`));
    const r = key ? vars.responses[key]! : { status: 200, body: {} };
    return Response.json(r.body, { status: r.status });
  },
}));
vi.mock("@/server/portal", () => ({ requirePortalAccess: async () => vars.actor }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }), redirect: () => {} }));
vi.mock("@/app/(app)/athlete/payout-actions", () => ({ athletePayoutLinkAction: async () => ({ ok: true }) }));
vi.mock("@/app/(app)/athlete/ward-actions", () => ({ chooseWardAction: async () => ({ ok: true }) }));
vi.mock("@/app/(app)/athlete/settings/coming-of-age/actions", () => ({ sendComingOfAgeLinkAction: async () => ({ ok: true }) }));

import { openOffers, payoutStatusTiles, shopTiles, upcomingSales, type ApiSellerSummary } from "../src/lib/athlete-home-live";
import type { ApiMyPayouts } from "../src/lib/payouts-live";
import type { ApiOffer } from "../src/lib/offer-live";

const NOW = new Date("2026-10-02T12:00:00Z");

const summary = (over: Partial<ApiSellerSummary> = {}): ApiSellerSummary => ({
  items: { total: 5, active: 4 },
  listings: { live: 2, held: 1, draft: 1, paused: 0, ended: 0, total: 4 },
  sold: { lines: 3, units: 7 },
  awaitingPayment: { lines: 1, units: 2 },
  approvalsWaiting: 1,
  upcoming: {
    total: 4,
    lines: [
      { id: "ln_1", orderId: "ord_1", ref: "SX-ABCD1234", state: "IN_DELIVERY", sponsorName: "Harbor Coffee", title: "Shooting session", quantity: 2, startsOn: "2026-10-14", endsOn: "2026-10-15" },
      { id: "ln_2", orderId: "ord_2", ref: "SX-EFGH5678", state: "UNPAID", sponsorName: "Main Street Bakery", title: "Camp day", quantity: 1, startsOn: "2026-10-20", endsOn: "2026-10-20" },
    ],
  },
  ...over,
});

const zero = { count: 0, amountCents: 0 };
const payouts = (over: Partial<ApiMyPayouts> = {}): ApiMyPayouts => ({
  currency: "USD",
  payee: { payeeType: "ATHLETE", name: "Jordan Reed" },
  account: { status: "READY", provider: "stripe", canSetUp: true, testProvider: true, updatedAt: null },
  totals: { requestableCents: 41_250, heldCents: 5_000, awaitingPaymentCents: 0, notYetReleasableCents: 0, inFlightCents: 0, paidOutCents: 120_000 },
  byState: {
    REQUESTED: { count: 1, amountCents: 20_000 }, APPROVED: { count: 1, amountCents: 10_000 }, SENDING: { count: 1, amountCents: 5_000 },
    PAID: { count: 3, amountCents: 120_000 }, REJECTED: zero, FAILED: zero,
  },
  canRequest: true, checks: [], orders: [], payouts: [],
  ...over,
});

const offer = (id: string, state: ApiOffer["state"], expiresAt: string, sponsorName = "Harbor Coffee"): ApiOffer => ({
  id, campaignId: "c1", athleteId: "a1", jobId: "SX-02", inventoryItemId: null, brief: "Post", compensation: 25_000,
  deliverables: [{ title: "Post", dueDate: "2026-10-20" }], usageRights: "Organic", exclusivityDays: null, disclosures: [],
  expiresAt, state, sentAt: "2026-10-01T00:00:00Z", respondedAt: null, termsHash: null, termsSnapshot: null, orderId: null,
  createdAt: "2026-10-01T00:00:00Z", campaignName: "Fall Test Drive", sponsorName,
});

describe("the helpers only put the API's figures into words", () => {
  it("the shop: items, live and held listings, units sold — each an API count", () => {
    const t = Object.fromEntries(shopTiles(summary()).map((x) => [x.key, x]));
    expect(t.items).toMatchObject({ value: "4", sub: "5 in all · 1 switched off", href: "/athlete/inventory" });
    expect(t.live).toMatchObject({ value: "2", sub: "1 draft · 0 paused" });
    expect(t.held).toMatchObject({ value: "1", tone: "warn", sub: "BTG is taking a look" });
    expect(t.sold).toMatchObject({ value: "7", sub: "3 order lines paid · 2 units awaiting payment", href: "/athlete/sales" });
    const empty = shopTiles(summary({ items: { total: 0, active: 0 }, listings: { live: 0, held: 0, draft: 0, paused: 0, ended: 0, total: 0 }, sold: { lines: 0, units: 0 }, awaitingPayment: { lines: 0, units: 0 } }));
    expect(empty.map((x) => x.sub)).toEqual(["No items yet", "No listings yet", "Nothing waiting on BTG", "0 order lines paid for"]);
  });

  it("upcoming sales: the API's lines, soonest first, with their dates", () => {
    expect(upcomingSales(summary())).toEqual([
      { id: "ln_1", title: "Shooting session", sponsor: "Harbor Coffee", mon: "OCT", day: "14", when: "Oct 14 – Oct 15", quantity: "× 2", badge: "To deliver" },
      { id: "ln_2", title: "Camp day", sponsor: "Main Street Bakery", mon: "OCT", day: "20", when: "Oct 20", quantity: "× 1", badge: "Awaiting payment" },
    ]);
  });

  it("offers waiting: only open ones count (not drafts, answered or lapsed), soonest expiry first", () => {
    const o = openOffers([
      offer("o_late", "SENT", "2026-10-30T00:00:00Z", "Late Co"),
      offer("o_soon", "SENT", "2026-10-05T00:00:00Z", "Soon Co"),
      offer("o_gone", "SENT", "2026-09-30T00:00:00Z"),
      offer("o_draft", "DRAFT", "2026-10-30T00:00:00Z"),
      offer("o_yes", "ACCEPTED", "2026-10-30T00:00:00Z"),
    ], NOW);
    expect(o.count).toBe(2);
    expect(o.rows.map((r) => r.id)).toEqual(["o_soon", "o_late"]);
    expect(o.rows[0]).toMatchObject({ sponsor: "Soon Co", mono: "SC", pay: "$250.00" });
  });

  it("payout status: available now, then requested / approved / paid from byState", () => {
    const t = Object.fromEntries(payoutStatusTiles(payouts()).map((x) => [x.key, x]));
    expect(t.available).toMatchObject({ value: "$412.50", sub: "Ready to request", tone: "accent" });
    expect(t.requested).toMatchObject({ value: "$200.00", sub: "1 payout waiting for BTG" });
    expect(t.approved).toMatchObject({ value: "$150.00", sub: "2 payouts on the way" });
    expect(t.paid).toMatchObject({ value: "$1,200.00", sub: "3 payouts · confirmed by the payment provider" });
    /* An API without byState: the available figure only — no counts guessed from the 50-row list. */
    expect(payoutStatusTiles(payouts({ byState: undefined })).map((x) => x.key)).toEqual(["available"]);
  });
});

describe("the page renders the signed-in athlete's own figures", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { default: AthleteHomePage } = await import("../src/app/(app)/athlete/page");

  const athlete = { userId: "u_jordan", tenantId: "t1", roles: ["ATHLETE"], wards: [], actingFor: null, guardianControl: null };
  const profile = {
    id: "a1", slug: "jordan-reed", displayName: "JORDAN.REED", legalName: "Jordan Reed", city: "Laurel", stateCode: "MD", sport: "Basketball",
    position: "Guard", school: null, level: null, gradYear: null, achievements: null, state: "ACTIVE", tier: null, contentCapabilities: [],
    brandInterests: [], restrictedCategories: [], restrictionNotes: null, socials: [], ratesConfirmed: 0, agreementsSigned: 0,
  };
  const deliverable = (id: string, dueDate: string) => ({ id, title: `Post ${id}`, state: "NOT_STARTED", dueDate, campaign: { id: "c1", name: "Fall Test Drive" } });

  beforeEach(() => {
    vars.actor = athlete;
    vars.calls = [];
    vars.responses = {
      "/athletes/me": { status: 200, body: profile },
      "/invitations": { status: 200, body: { invitations: [] } },
      "/invitations/summary": { status: 200, body: { summary: { open: 0 } } },
      "/deliverables": { status: 200, body: { deliverables: [deliverable("d1", "2026-09-28T00:00:00Z")], page: { total: 6 } } },
      "/deliverables#overdue": { status: 200, body: { deliverables: [deliverable("d1", "2026-09-28T00:00:00Z")], page: { total: 2 } } },
      "/earnings/summary": { status: 200, body: { count: 0, byState: {}, deliverables: { verified: 0, total: 0 }, jobNames: [] } },
      "/payouts/account": { status: 200, body: { status: "READY", provider: "stripe", canSetUp: true, testProvider: false, updatedAt: null } },
      "/coming-of-age/mine": { status: 200, body: { comingOfAge: null } },
      "/offers": { status: 200, body: { offers: [offer("o_soon", "SENT", "2099-10-05T00:00:00Z", "Soon Co")] } },
      "/sales/summary": { status: 200, body: summary() },
      "/payouts/me": { status: 200, body: payouts() },
    };
  });

  const render = async () => renderToStaticMarkup(createElement("div", null, await AthleteHomePage()));

  it("reads only the athlete's own routes, and shows each block's figures", async () => {
    const html = await render();
    expect(vars.calls).toEqual(expect.arrayContaining([
      "/offers", "/sales/summary", "/payouts/me", "/payouts/account", "/coming-of-age/mine",
      expect.stringMatching(/^\/deliverables\?page=1&size=1&state=[A-Z_,]+&to=\d{4}-\d{2}-\d{2}$/),
    ]));
    /* Approval requests */
    expect(html).toContain("1 order is waiting for your answer");
    /* Upcoming campaigns */
    expect(html).toContain("Offers waiting for your answer · 1");
    expect(html).toContain("Soon Co");
    expect(html).toContain("Deliverables due · 6 · 2 overdue");
    expect(html).toContain("Marketplace sales coming up · 4");
    expect(html).toContain("Shooting session");
    /* Inventory performance */
    expect(html).toContain("Your shop");
    expect(html).toContain("Held for BTG");
    expect(html).toContain("3 order lines paid · 2 units awaiting payment");
    /* Payout status */
    expect(html).toContain("Available to pay out");
    expect(html).toContain("$412.50");
    expect(html).toContain("1 payout waiting for BTG");
    /* Earnings to date — the Phase 1 block stays. */
    expect(html).toContain("Earnings");
  });

  it("a login with none of the marketplace reads (403) gets no shop, payout or offer blocks — and no invented zeros", async () => {
    for (const k of ["/offers", "/sales/summary", "/payouts/me"]) vars.responses[k] = { status: 403, body: { error: "forbidden" } };
    vars.responses["/deliverables"] = { status: 200, body: { deliverables: [], page: { total: 0 } } };
    vars.responses["/deliverables#overdue"] = { status: 200, body: { deliverables: [], page: { total: 0 } } };
    const html = await render();
    expect(html).not.toContain("Your shop");
    expect(html).not.toContain("Available to pay out");
    expect(html).not.toContain("Offers waiting");
    expect(html).not.toContain("Marketplace sales");
    expect(html).not.toContain("waiting for your answer");
    expect(html).toContain("Deliverables due · 0");
    expect(html).not.toContain("overdue");
  });

  it("an outage on a marketplace read is an error, not a quiet empty block", async () => {
    vars.responses["/sales/summary"] = { status: 500, body: {} };
    await expect(AthleteHomePage()).rejects.toThrow("/sales/summary unavailable (500).");
  });
});
