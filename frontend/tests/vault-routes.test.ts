import { describe, expect, it } from "vitest";

import { isVaultPath, VAULT_PREFIXES, vaultOn } from "@/lib/vault-routes";

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

/* Follow-up: a Finance-only viewer gets the Vault on every page ("all");
   everyone else on the money desks only ("money"); other portals never. */
describe("vaultOn", () => {
  it("money: the money desks only", () => {
    expect(vaultOn("/admin/payouts/po_1", "money")).toBe(true);
    for (const p of ["/admin", "/admin/campaigns", "/admin/next/splits", "/admin/audit"]) expect(vaultOn(p, "money"), p).toBe(false);
  });
  it("all: every page", () => {
    for (const p of ["/admin/finance", "/admin/campaigns", "/admin/campaigns/c_1", "/admin/next/splits", "/admin"]) expect(vaultOn(p, "all"), p).toBe(true);
  });
  it("off: never, not even on a money desk", () => {
    for (const p of ["/admin/finance", "/admin/payouts", "/admin/campaigns"]) expect(vaultOn(p, "off"), p).toBe(false);
  });
});
