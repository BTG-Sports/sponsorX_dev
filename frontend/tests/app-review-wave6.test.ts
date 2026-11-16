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
