import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { orderListQuery, orderListTab, orderSearchTerm, type ApiOrderList } from "@/lib/all-orders-live";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: () => {}, push: () => {} }), usePathname: () => "/admin/marketplace/orders", useSearchParams: () => new URLSearchParams() }));

/* POL-FE-54 (app review B3) — BTG and Finance couldn't find an ordinary
   marketplace order. Done when: BTG or Finance finds any order by state or
   reference and opens it; Finance records a bank transfer on it. */

const list: ApiOrderList = {
  orders: [{
    id: "cmorder00001a2b3c4d", sponsorId: "s1", sponsorName: "Rosa's Bakery", billingReference: "PO-7781", reservationId: null, state: "AWAITING_PAYMENT",
    currency: "USD", subtotalCents: 50_000, feesCents: 0, totalCents: 50_000, requiresApproval: false, approvalReasons: [], decidedAt: null, decidedBy: null,
    decisionNotes: null, contractedAt: null, createdAt: "2026-11-14T10:00:00.000Z", lines: [],
  }],
  page: { page: 1, size: 20, total: 1, pages: 1 },
  tabs: [{ key: "all", label: "All", count: 9 }, { key: "to_pay", label: "To pay", count: 1 }],
};

describe("the list's query", () => {
  it("tabs by state, anything else is All; the SX- reference people read searches the id", () => {
    expect(orderListTab("to_pay")).toBe("to_pay");
    expect(orderListTab("nope")).toBe("all");
    expect(orderSearchTerm("SX-1A2B3C4D")).toBe("1a2b3c4d");
    expect(orderSearchTerm("Rosa")).toBe("Rosa");
    expect(orderListQuery("to_pay", "SX-1A2B3C4D", 2)).toBe("/marketplace-orders?page=2&size=20&tab=to_pay&q=1a2b3c4d");
  });
});

describe("All orders", () => {
  it("each row names the sponsor and the reference and opens the order", async () => {
    const { AllOrders } = await import("@/components/all-orders");
    const html = renderToStaticMarkup(createElement(AllOrders, { data: list, tab: "all", q: "", base: "/finance/orders", orderHref: (id: string) => `/finance/orders/${id}`, tone: "vault" }));
    expect(html).toContain('href="/finance/orders/cmorder00001a2b3c4d"');
    expect(html).toContain("SX-1A2B3C4D");
    expect(html).toContain("Rosa&#x27;s Bakery");
    expect(html).toContain("ref PO-7781");
    expect(html).toMatch(/To pay <span[^>]*>1<\/span>/);
  });

  it("BTG and Finance both have it in their menu, and Finance opens the same order page", () => {
    expect(readFileSync(new URL("../src/lib/admin-nav.ts", import.meta.url), "utf8")).toContain('href: "/admin/marketplace/orders", label: "All orders"');
    expect(readFileSync(new URL("../src/lib/finance-nav.ts", import.meta.url), "utf8")).toContain('href: "/finance/orders", label: "All orders"');
    const fin = readFileSync(new URL("../src/app/(app)/finance/orders/[id]/page.tsx", import.meta.url), "utf8");
    expect(fin).toMatch(/<MarketplaceOrderDetail id=\{id\} back=\{\{ href: "\/finance\/orders", label: "All orders" \}\} \/>/);
  });

  it("refunds, payouts and delivery issues link to the order", () => {
    for (const f of ["admin/refunds/page.tsx", "finance/refunds/page.tsx", "admin/payouts/[id]/page.tsx", "finance/payouts/[id]/page.tsx", "admin/delivery-issues/[id]/page.tsx"]) {
      expect(readFileSync(new URL(`../src/app/(app)/${f}`, import.meta.url), "utf8"), f).toMatch(/\/(admin\/marketplace|finance)\/orders\/\$\{encodeURIComponent\(/);
    }
  });
});
