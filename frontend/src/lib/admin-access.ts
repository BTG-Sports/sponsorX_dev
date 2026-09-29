/* --------------------------------------------------------------------------
   Which staff roles each admin desk is for (check pass C-1, 2026-09-29).

   One map, used twice: the desk pages (a signed-in staff role that isn't
   listed gets "not in your role" — never the sample desk), and the admin nav
   (the link is hidden from roles it isn't for). The lists mirror what each
   desk's live read already required; the API still enforces the matrix
   itself — this only decides what the portal SHOWS.

   A route missing from the map is open to every admin-portal role.
   -------------------------------------------------------------------------- */

export const ADMIN_PORTAL_ROLES = ["SUPER_ADMIN", "BTG_ADMIN", "SALES", "CAMPAIGN_MGR", "NETWORK_MGR", "FINANCE"];

export const ADMIN_ACCESS: Record<string, { roles: string[]; who: string }> = {
  "/admin/applications": { roles: ["SUPER_ADMIN", "BTG_ADMIN", "NETWORK_MGR"], who: "BTG admins and athlete network managers" },
  /* P3-BE-16: the same reviewers as applications. */
  "/admin/profile-changes": { roles: ["SUPER_ADMIN", "BTG_ADMIN", "NETWORK_MGR"], who: "BTG admins and athlete network managers" },
  "/admin/approvals": { roles: ["SUPER_ADMIN", "BTG_ADMIN", "CAMPAIGN_MGR"], who: "BTG admins and campaign managers" },
  "/admin/campaigns/match": { roles: ["SUPER_ADMIN", "BTG_ADMIN", "NETWORK_MGR", "CAMPAIGN_MGR"], who: "BTG admins, network managers and campaign managers" },
  "/admin/rewards": { roles: ["SUPER_ADMIN", "BTG_ADMIN", "CAMPAIGN_MGR"], who: "BTG admins and campaign managers" },
  "/admin/finance": { roles: ["SUPER_ADMIN", "BTG_ADMIN", "FINANCE"], who: "BTG admins and Finance" },
  "/admin/commission": { roles: ["SUPER_ADMIN", "BTG_ADMIN"], who: "BTG admins" },
  "/admin/next": { roles: ["SUPER_ADMIN", "BTG_ADMIN", "SALES", "FINANCE"], who: "BTG admins, Sales and Finance" },
};

/** The access entry that governs a path (longest matching prefix). */
export function accessFor(path: string): { roles: string[]; who: string } | null {
  const key = Object.keys(ADMIN_ACCESS)
    .filter((k) => path === k || path.startsWith(`${k}/`))
    .sort((a, b) => b.length - a.length)[0];
  return key ? ADMIN_ACCESS[key] : null;
}

/** May an actor with these roles use this admin path? */
export function mayUse(path: string, roles: readonly string[]): boolean {
  const a = accessFor(path);
  return !a || roles.some((r) => a.roles.includes(r));
}
