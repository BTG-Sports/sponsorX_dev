import { describe, expect, it } from "vitest";

import { isVaultPath, VAULT_PREFIXES } from "@/lib/vault-routes";

/* P1-ART-25 — the Vault look applies to a whole screen, never part of one
   (spec §2): these are the money desks and everything below them. */

describe("isVaultPath", () => {
  it("is true on every money desk and below it", () => {
    for (const p of ["/admin/finance", "/admin/payouts", "/admin/payouts/po_1", "/admin/refunds", "/admin/payments/events", "/admin/payments/disputes", "/admin/payments/disputes/d_1", "/admin/commission"]) {
      expect(isVaultPath(p)).toBe(true);
    }
  });
  it("is false elsewhere, including look-alike prefixes", () => {
    for (const p of ["/admin", "/admin/campaigns", "/admin/financex", "/admin/payoutsx", "/sponsor/payouts", "/athlete/earnings"]) {
      expect(isVaultPath(p)).toBe(false);
    }
  });
  it("lists the five prefixes", () => expect(VAULT_PREFIXES).toHaveLength(5));
});
