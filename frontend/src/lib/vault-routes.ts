/* The Vault (P1-ART-25): the money desks, where the admin shell switches to
   Finance's look. A whole screen switches, never part of one (spec §2).

   Follow-up (2026-10-12; owner: Finance should "feel like its own portal"):
   a Finance-only viewer gets the Vault on EVERY admin page they can open —
   mode "all" — so Campaigns or Splits never drop them back into Mission
   Control. BTG admins and the other staff roles keep mode "money": the Vault
   on these routes only. */
export const VAULT_PREFIXES = ["/admin/finance", "/admin/payouts", "/admin/refunds", "/admin/payments", "/admin/commission"] as const;

/** What the portal is called while the Vault is on (sidebar, watermark, menu). */
export const VAULT_LABEL = "Finance Portal";

/** "off": never (every other portal); "money": the money desks only (BTG
 *  admins, other staff); "all": every page (a Finance-only viewer). */
export type VaultMode = "off" | "money" | "all";

export function isVaultPath(path: string): boolean {
  return VAULT_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

/** Is the Vault on for this path under this mode? */
export function vaultOn(path: string, mode: VaultMode): boolean {
  if (mode === "all") return true;
  return mode === "money" && isVaultPath(path);
}
