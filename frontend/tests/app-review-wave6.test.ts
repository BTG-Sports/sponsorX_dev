import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

/* server/portal.ts reaches the API and next/navigation through requirePortalAccess. */
vi.mock("server-only", () => ({}));
vi.mock("@/server/api", () => ({ fetchActor: async () => ({ status: "anonymous" }) }));
vi.mock("next/navigation", () => ({ redirect: () => undefined }));

import { payoutHomeFor } from "@/server/payout-link";
import { payoutsTileHref } from "@/lib/finance-overview-live";
import { APPROVAL_TABS, listQuery } from "@/lib/payouts-live";
import { EARNING_COPY } from "@/lib/fixtures";
import { STATUS_DETAIL } from "@/lib/earnings-ui";
import { healthRows, type ApiIntegrationHealth } from "@/lib/ops-board-live";
import { FORECAST_EMPTY_HINT, NIGHTLY_RUN_LINE, PRICING_EMPTY_HINT } from "@/lib/nightly-run";
import { mayAddPartner, partnerLine, partnerProblem, type ApiPartner } from "@/lib/attribution-partners-live";

/* App review wave 6 — BTG admin, Finance and the property portal (POL-FE-73…75). */
const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

describe("POL-FE-73 · Finance and payouts tell the truth", () => {
  it("a payout email's link opens the payout in the reader's own workspace", () => {
    expect(payoutHomeFor(["FINANCE"], "po_1")).toBe("/finance/payouts/po_1");
    expect(payoutHomeFor(["BTG_ADMIN"], "po_1")).toBe("/admin/payouts/po_1");
    expect(payoutHomeFor(["FINANCE", "BTG_ADMIN"], "po_1")).toBe("/admin/payouts/po_1");
    expect(payoutHomeFor(["ATHLETE"], "po_1")).toBe("/portal");
    expect(src("app/(app)/payouts/[id]/page.tsx")).toContain("redirect(payoutHomeFor(who.actor.roles, id))");
  });

  it("an approved payout says why it waits, in the API's words", () => {
    for (const f of ["app/(app)/admin/payouts/[id]/page.tsx", "app/(app)/finance/payouts/[id]/page.tsx"]) {
      expect(src(f)).toContain("p.waiting ??");
    }
  });

  it("the Treasury tile opens the tab with something in it", () => {
    expect(payoutsTileHref({ count: 2, requested: 0 })).toBe("/finance/payouts?tab=problems");
    expect(payoutsTileHref({ count: 2, requested: 1 })).toBe("/finance/payouts");
    expect(payoutsTileHref({ count: 0, requested: 0 })).toBe("/finance/payouts");
    expect(payoutsTileHref({ count: 2 })).toBe("/finance/payouts");
  });

  it("a sent-back payout has its own tab", () => {
    expect(APPROVAL_TABS.find((t) => t.key === "sent-back")).toMatchObject({ label: "Sent back", states: ["REJECTED"] });
    expect(listQuery("sent-back")).toBe("state=REJECTED");
  });

  it("a voided earning reads nothing owed, not a blank chip", () => {
    expect(EARNING_COPY.VOIDED).toBe("Voided — nothing owed");
    expect(STATUS_DETAIL.VOIDED).toMatch(/nothing is owed/);
  });

  it("refunds say when a card refund is automatic and when Finance sends it", () => {
    for (const f of ["app/(app)/admin/refunds/page.tsx", "app/(app)/finance/refunds/page.tsx"]) {
      expect(src(f)).not.toContain("refunded automatically once payments open");
      expect(src(f)).toContain("refunded to the card automatically while payments are open");
    }
  });
});

describe("POL-FE-74 · system health, intelligence and staff accounts", () => {
  const base: ApiIntegrationHealth = {
    checkedAt: "2026-09-29T10:00:00Z",
    dependencies: { db: true, redis: true, storage: true },
    sync: [],
    webhooks: { bySource: [] },
    queue: { outboxPending: [{ name: "zoho.pushDeal", count: 3, oldest: "2026-09-20T09:00:00Z", parked: true }], jobs: [] },
    zoho: { connected: false },
  };

  it("parked Zoho syncs don't make the worker queue Degraded; the Zoho row says not connected", () => {
    const rows = healthRows(base);
    expect(rows.find((r) => r.name === "Worker queue")).toMatchObject({ status: "Operational", detail: "0 waiting · 0 failed this week" });
    expect(rows.find((r) => r.name === "Zoho CRM + Books")).toMatchObject({ status: "Not connected" });
    expect(rows.find((r) => r.name === "Zoho CRM + Books")!.detail).toMatch(/Zoho not connected.*3 syncs wait/);
  });

  it("a stuck job that isn't parked still turns the queue Degraded", () => {
    const stuck = healthRows({ ...base, queue: { ...base.queue, outboxPending: [{ name: "notify.email", count: 1, oldest: "2026-09-29T09:00:00Z", parked: false }] } });
    expect(stuck.find((r) => r.name === "Worker queue")?.status).toBe("Degraded");
  });

  it("Pricing and Forecasts say they update nightly from 19:00 UTC", () => {
    expect(NIGHTLY_RUN_LINE).toBe("Updated nightly, from 19:00 UTC.");
    expect(PRICING_EMPTY_HINT).toMatch(/19:00 UTC/);
    expect(FORECAST_EMPTY_HINT).toMatch(/19:00 UTC/);
    expect(src("app/(app)/admin/intelligence/pricing/page.tsx")).toContain("{NIGHTLY_RUN_LINE}");
    expect(src("app/(app)/admin/intelligence/forecasts/page.tsx")).toContain("{NIGHTLY_RUN_LINE}");
  });

  it("Attribution has a Partners panel; a BTG admin adds one", () => {
    expect(mayAddPartner(["BTG_ADMIN"])).toBe(true);
    expect(mayAddPartner(["SALES"])).toBe(false);
    const adapters = [{ key: "generic-webhook-v1" }];
    expect(partnerProblem("A", "generic-webhook-v1", adapters)).toMatch(/2 to 120/);
    expect(partnerProblem("Shopify store", "nope", adapters)).toMatch(/Pick how/);
    expect(partnerProblem("Shopify store", "generic-webhook-v1", adapters)).toBeNull();
    const p = { deliveries: 0, events: 0, rejected: 0 } as ApiPartner;
    expect(partnerLine(p)).toBe("Nothing received yet.");
    expect(partnerLine({ ...p, deliveries: 2, events: 5, rejected: 1 })).toBe("2 deliveries · 5 sales · 1 rejected");
    expect(src("app/(app)/admin/intelligence/attribution/page.tsx")).toContain("<AttributionPartners desk={partners}");
  });

  it("staff test accounts and the empty desks are written down for testers", () => {
    const doc = readFileSync(new URL("../../documentation/SponsorX-Testing-on-Staging.md", import.meta.url), "utf8");
    expect(doc).toMatch(/Tester Facility/);
    expect(doc).toMatch(/payment-events\/test-provider/);
  });
});
