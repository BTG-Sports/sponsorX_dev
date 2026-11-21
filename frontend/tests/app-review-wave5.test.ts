import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { emptyDashboardRows, needsYouItems } from "@/lib/sponsor-overview-live";
import { VIEWER_REQUEST_NOTE } from "@/components/marketplace-catalog";
import { limitLine } from "@/lib/checkout-gate";
import { jobName, knownJobName } from "@/lib/job-names";
import { toPkg, type ApiPackage } from "@/lib/marketplace-live";
import { orderWord } from "@/lib/sponsor-words";

/* App review wave 5 — the sponsor portal (POL-FE-71, POL-FE-72). */
const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

describe("POL-FE-71 · sponsor dashboard, /brief, roles and teammates", () => {
  it("a sponsor with no campaign still sees a Shop order to pay and a request with BTG", () => {
    const rows = emptyDashboardRows({ postsToReview: 0, ordersToPay: 1, requestsInReview: 2 });
    expect(rows.map((r) => r.key)).toEqual(["orders", "requests"]);
    expect(rows[1]).toMatchObject({ title: "2 requests with BTG", href: "/sponsor/requests" });
    expect(emptyDashboardRows({ postsToReview: 0, ordersToPay: 0 })).toEqual([]);
    expect(emptyDashboardRows({ postsToReview: 0, ordersToPay: 0, requestsInReview: 1 })[0]!.title).toBe("1 request with BTG");
  });

  it("the empty dashboard renders those rows above No campaigns yet", () => {
    const page = src("app/(app)/sponsor/page.tsx");
    expect(page.indexOf("emptyDashboardRows(o.needsYou, o.paymentsOpen)")).toBeLessThan(page.indexOf("No campaigns yet"));
    expect(needsYouItems({ postsToReview: 1, ordersToPay: 0, invoicesUnpaid: 0 }).map((i) => i.key)).toEqual(["posts", "orders", "invoices"]);
  });

  it("/brief no longer promises a priced shortlist from the form", () => {
    const w = src("components/brief-wizard.tsx");
    expect(w).not.toMatch(/priced shortlist/);
    expect(w).toMatch(/Your first request/);
  });

  it("a Viewer reads the catalogue; Request this is for an Admin", () => {
    const page = src("app/(app)/sponsor/marketplace/page.tsx");
    expect(page).toMatch(/canRequest: who\.actor\.roles\.includes\("SPONSOR_ADMIN"\)/);
    expect(VIEWER_REQUEST_NOTE).toMatch(/Sponsor Admin sends requests/);
  });

  it("one role name: Sponsor Viewer, never Sponsor Analyst, on screen", () => {
    for (const f of ["app/(app)/sponsor/layout.tsx", "app/(app)/sponsor/cart/page.tsx", "app/(app)/sponsor/shop/page.tsx", "app/(app)/sponsor/team/page.tsx", "server/viewer.ts"]) {
      expect(src(f)).not.toMatch(/"Sponsor Analyst"|as a Sponsor Analyst|a Sponsor Analyst \(read only\)/);
    }
  });

  it("a removed teammate has Add back on their row", () => {
    expect(src("components/sponsor-team.tsx")).toMatch(/restoreTeammateAction\(m\.id\)/);
  });
});

describe("POL-FE-72 · sponsor portal loose ends", () => {
  it("while card payment is closed an approved order reads Approved, not Ready to pay", () => {
    expect(orderWord("APPROVED", false)).toEqual({ text: "Approved", tone: "info" });
    expect(orderWord("AWAITING_PAYMENT", false).text).toBe("Approved");
    expect(orderWord("APPROVED", true).text).toBe("Ready to pay");
    expect(orderWord("APPROVED").text).toBe("Ready to pay");
    expect(orderWord("PAID", false).text).toBe("In progress");
    const items = needsYouItems({ postsToReview: 0, ordersToPay: 2 }, false);
    expect(items.find((i) => i.key === "orders")!.title).toBe("Approved orders");
    /* POL-FE-98 — the Orders list's tabs are worded in lib/orders-board.ts now. */
    expect(src("lib/orders-board.ts")).toContain('paymentsOpen === false ? "Approved" : t.label');
  });

  it("the spending limit sits beside the total and says what it means for this order", () => {
    const usd = (c: number) => `$${(c / 100).toLocaleString("en-US")}`;
    expect(limitLine(50_000, 100_000, usd)?.text).toContain("$1,000 — this order is within it");
    expect(limitLine(50_000, 100_000, usd)?.over).toBe(false);
    expect(limitLine(150_000, 100_000, usd)?.over).toBe(true);
    expect(limitLine(150_000, undefined, usd)).toBeNull();
    expect(src("app/(app)/sponsor/checkout/page.tsx")).toContain("limitLine(quote.totalCents, hold.checkout?.spendingLimitCents");
  });

  it("a long Shop description is never cut off for good; Order again goes to the Shop", () => {
    /* POL-FE-91 — the card shows two lines and opens the item's own page, which shows all of it. */
    expect(src("components/sponsor-shop/shop-window.tsx")).toContain('<Link href={itemHref(item.id)} className="sx-sh-stretch">');
    expect(src("lib/shop-showcase.ts")).toContain("description: r.description?.trim() || null");
    /* POL-FE-94 — the order page's next-step card carries Order again now. */
    expect(src("components/sponsor-order/order-summary.tsx")).toContain('<Link href="/sponsor/shop" className="sx-od-go sx-od-go-link">');
  });

  it("package cards name jobs from GET /catalogue/jobs, and live names win over the built-in ones", () => {
    const pkg = { id: "p1", name: "Starter", priceLow: 500, priceHigh: 500, athleteCountMin: 1, athleteCountMax: 1, lineItems: [{ jobCode: "SX-99", quantityPerAthlete: 2 }], includes: [], exclusivity: false, durationWeeks: null } as unknown as ApiPackage;
    expect(toPkg(pkg, { "SX-99": "Locker Room Q&A" }).includes).toBe("Locker Room Q&A × 2 per athlete");
    expect(toPkg(pkg).includes).toBe("SX-99 × 2 per athlete");
    expect(jobName("SX-99", { "SX-99": "Live name" })).toBe("Live name");
    expect(knownJobName("nope", {})).toBeNull();
    expect(src("components/marketplace-catalog.tsx")).toContain("filters: items ? LIVE_PKG_FILTERS : PKG_FILTERS");
  });

  it("one name for Intelligence; Billing points a Shop-only sponsor to Orders", () => {
    expect(src("app/(app)/sponsor/intelligence/page.tsx")).toContain('const TITLE = "Intelligence"');
    expect(src("app/(app)/sponsor/invoices/page.tsx")).toContain('href="/sponsor/orders"');
  });

  it("signed-in staff on Packages are told it isn't their role, not shown sample packages", () => {
    const page = src("app/(app)/sponsor/marketplace/page.tsx");
    expect(page).toContain("return { notSponsor: true }");
    expect(page).toContain("Not in your role");
  });

  it("BTG can change a sponsor's business type on the account's page", () => {
    expect(src("components/sponsor-request-record.tsx")).toContain("<SponsorCategoriesEditor sponsorId={r.sponsorId}");
    expect(src("app/(app)/admin/sponsor-requests/actions.ts")).toContain("/categories`");
  });
});
