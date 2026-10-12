/* The Vault (P1-ART-25): the money desks, where the admin shell switches to
   Finance's look. A whole screen switches, never part of one (spec §2). */
export const VAULT_PREFIXES = ["/admin/finance", "/admin/payouts", "/admin/refunds", "/admin/payments", "/admin/commission"] as const;

export function isVaultPath(path: string): boolean {
  return VAULT_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}
