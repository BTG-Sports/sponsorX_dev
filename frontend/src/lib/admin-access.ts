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
  /* P3-BE-16 / 2S1-BE-14: the old Profile changes desk now redirects to New sign-ups' sensitive edits. */
  "/admin/profile-changes": { roles: ["SUPER_ADMIN", "BTG_ADMIN"], who: "BTG admins" },
  "/admin/approvals": { roles: ["SUPER_ADMIN", "BTG_ADMIN", "CAMPAIGN_MGR"], who: "BTG admins and campaign managers" },
  "/admin/campaigns/match": { roles: ["SUPER_ADMIN", "BTG_ADMIN", "NETWORK_MGR", "CAMPAIGN_MGR"], who: "BTG admins, network managers and campaign managers" },
  "/admin/rewards": { roles: ["SUPER_ADMIN", "BTG_ADMIN", "CAMPAIGN_MGR"], who: "BTG admins and campaign managers" },
  "/admin/finance": { roles: ["SUPER_ADMIN", "BTG_ADMIN", "FINANCE"], who: "BTG admins and Finance" },
  "/admin/commission": { roles: ["SUPER_ADMIN", "BTG_ADMIN"], who: "BTG admins" },
  /* Phase 2 — property verification (2S1-FE-02) and the marketplace console
     (2S7-FE-02): the API's propertyOnboarding and listing-approve are BTG_ADMIN
     own-tenant and SUPER_ADMIN only. */
  "/admin/onboarding": { roles: ["SUPER_ADMIN", "BTG_ADMIN"], who: "BTG admins" },
  "/admin/marketplace": { roles: ["SUPER_ADMIN", "BTG_ADMIN"], who: "BTG admins" },
  /* 2S5-FE-04 — payout approvals: the API's payout.approve is BTG admin and Finance. */
  "/admin/payouts": { roles: ["SUPER_ADMIN", "BTG_ADMIN", "FINANCE"], who: "BTG admins and Finance" },
  /* 2S1-FE-03 — sponsor requests: the API's inquiry.approve is BTG admin and Sales. */
  "/admin/sponsor-requests": { roles: ["SUPER_ADMIN", "BTG_ADMIN", "SALES"], who: "BTG admins and Sales" },
  /* 2S1-FE-11 — the API's restrictedWord policy is BTG_ADMIN own-tenant and SUPER_ADMIN only. */
  "/admin/restricted-words": { roles: ["SUPER_ADMIN", "BTG_ADMIN"], who: "BTG admins" },
  /* 2S1-FE-07 — new sign-ups hold athletes', minors' and guardians' IDs; sponsors reach Sales through Sponsor requests. */
  "/admin/new-signups": { roles: ["SUPER_ADMIN", "BTG_ADMIN"], who: "BTG admins" },
  /* 2S4-FE-04 — delivery problems and refunds. */
  "/admin/delivery-issues": { roles: ["SUPER_ADMIN", "BTG_ADMIN"], who: "BTG admins" },
  /* Closed accounts, Guardian handoffs, Offers (2026-10-01): accountClosure and
     guardianHandoff approve are BTG_ADMIN own-tenant and SUPER_ADMIN only. */
  /* 2S2-FE-03 — offer write is BTG admin and campaign managers; Sales reads. */
  "/admin/offers": { roles: ["SUPER_ADMIN", "BTG_ADMIN", "CAMPAIGN_MGR", "SALES"], who: "BTG admins, campaign managers and Sales" },
  "/admin/closed-accounts": { roles: ["SUPER_ADMIN", "BTG_ADMIN"], who: "BTG admins" },
  "/admin/guardian-handoffs": { roles: ["SUPER_ADMIN", "BTG_ADMIN"], who: "BTG admins" },
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
