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
  /* 2S4-FE-06 — refunds to send by hand: the API's refundDue is BTG admin and Finance (own tenant) and SUPER_ADMIN. */
  "/admin/refunds": { roles: ["SUPER_ADMIN", "BTG_ADMIN", "FINANCE"], who: "BTG admins and Finance" },
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
  /* 2S5-FE-07 / 2S5-FE-08 — the provider's events and sponsors' disputes: paymentEvent and paymentDispute read are BTG admin and Finance (own tenant) and SUPER_ADMIN; only BTG admin resolves. */
  "/admin/payments/events": { roles: ["SUPER_ADMIN", "BTG_ADMIN", "FINANCE"], who: "BTG admins and Finance" },
  "/admin/payments/disputes": { roles: ["SUPER_ADMIN", "BTG_ADMIN", "FINANCE"], who: "BTG admins and Finance" },
  /* 2S1-FE-14 — a support message and its attachments: supportMessage read is BTG admin (own tenant) and SUPER_ADMIN. */
  "/admin/support": { roles: ["SUPER_ADMIN", "BTG_ADMIN"], who: "BTG admins" },
  /* Governs no page itself — every /admin/next/* desk below has its own,
     narrower entry (editions, inventory, prospects, rights, splits). This is
     only the fallback for a future /admin/next/* desk with no entry of its
     own yet, so it stays BTG-admin only rather than open to Sales or Finance
     by default. */
  "/admin/next": { roles: ["SUPER_ADMIN", "BTG_ADMIN"], who: "BTG admins" },
  /* P9-FE-11 — the API's studentProspect.approve is BTG admin and Sales (own tenant) and SUPER_ADMIN. */
  "/admin/next/prospects": { roles: ["SUPER_ADMIN", "BTG_ADMIN", "SALES"], who: "BTG admins and Sales" },

  /* P1-ART-25 follow-up (2026-10-12) — desks that were open to every staff
     role here but that the API refuses for some: the nav listed them and the
     page then said "outside your role". Each list is what the API already
     enforces (backend/src/auth/policy.ts); no role loses a desk it could use.
     NEXT editions, inventory and rights: GET /editions/:id, /:id/ledger
     (edition read) and /:id/rights-ledger (editionAsset read) are BTG admin
     and SUPER_ADMIN only among staff — Finance lists editions through its
     split read but can open none of them; Sales holds no edition read. */
  "/admin/next/editions": { roles: ["SUPER_ADMIN", "BTG_ADMIN"], who: "BTG admins" },
  "/admin/next/inventory": { roles: ["SUPER_ADMIN", "BTG_ADMIN"], who: "BTG admins" },
  "/admin/next/rights": { roles: ["SUPER_ADMIN", "BTG_ADMIN"], who: "BTG admins" },
  /* GET /editions/:id/splits: revenueSplit read is BTG admin, Finance and SUPER_ADMIN; Finance locks the split. */
  "/admin/next/splits": { roles: ["SUPER_ADMIN", "BTG_ADMIN", "FINANCE"], who: "BTG admins and Finance" },
  /* GET /briefs: campaignBrief read is BTG admin, campaign managers and Sales (own tenant) and SUPER_ADMIN. */
  "/admin/briefs": { roles: ["SUPER_ADMIN", "BTG_ADMIN", "CAMPAIGN_MGR", "SALES"], who: "BTG admins, campaign managers and Sales" },
  /* GET /operations/network-metrics and /analytics: tenant-wide metricAggregate
     read — BTG admin, campaign and network managers, SUPER_ADMIN. GET
     /operations/job-economics needs a second, optional read on top of that —
     campaignOrder — which a network manager lacks; network/page.tsx treats a
     403 there as "no economics table", not "not in your role". */
  "/admin/network": { roles: ["SUPER_ADMIN", "BTG_ADMIN", "CAMPAIGN_MGR", "NETWORK_MGR"], who: "BTG admins, campaign managers and network managers" },
  "/admin/analytics": { roles: ["SUPER_ADMIN", "BTG_ADMIN", "CAMPAIGN_MGR", "NETWORK_MGR"], who: "BTG admins, campaign managers and network managers" },
  /* Phase 3 · Intelligence — proposed with the engines' contracts
     (documentation/SponsorX-Phase3-Screen-Contracts.md); the API's policy
     rows land with each engine and stay the enforcement. Pricing, matching,
     forecasts, attribution and scenarios are sales tools; make-goods change
     what a sponsor was sold and anomalies change what a sponsor sees, so
     those two stay with BTG admins and campaign managers; the model
     registry is BTG-admin only (3S0-PMO-02). */
  "/admin/intelligence/anomalies": { roles: ["SUPER_ADMIN", "BTG_ADMIN", "CAMPAIGN_MGR"], who: "BTG admins and campaign managers" },
  "/admin/intelligence/attribution": { roles: ["SUPER_ADMIN", "BTG_ADMIN", "CAMPAIGN_MGR", "SALES"], who: "BTG admins, campaign managers and Sales" },
  "/admin/intelligence/forecasts": { roles: ["SUPER_ADMIN", "BTG_ADMIN", "CAMPAIGN_MGR", "SALES"], who: "BTG admins, campaign managers and Sales" },
  "/admin/intelligence/make-goods": { roles: ["SUPER_ADMIN", "BTG_ADMIN", "CAMPAIGN_MGR"], who: "BTG admins and campaign managers" },
  "/admin/intelligence/matching": { roles: ["SUPER_ADMIN", "BTG_ADMIN", "CAMPAIGN_MGR", "NETWORK_MGR", "SALES"], who: "BTG admins, campaign managers, network managers and Sales" },
  "/admin/intelligence/models": { roles: ["SUPER_ADMIN", "BTG_ADMIN"], who: "BTG admins" },
  "/admin/intelligence/pricing": { roles: ["SUPER_ADMIN", "BTG_ADMIN", "CAMPAIGN_MGR", "SALES"], who: "BTG admins, campaign managers and Sales" },
  "/admin/intelligence/scenarios": { roles: ["SUPER_ADMIN", "BTG_ADMIN", "CAMPAIGN_MGR", "SALES"], who: "BTG admins, campaign managers and Sales" },
  /* GET /audit-log: auditLog read is BTG admin (own tenant) and SUPER_ADMIN. */
  "/admin/audit": { roles: ["SUPER_ADMIN", "BTG_ADMIN"], who: "BTG admins" },
  /* GET /operations/integration-health: tenant-wide webhookDelivery read is BTG admin and SUPER_ADMIN. */
  "/admin/integrations": { roles: ["SUPER_ADMIN", "BTG_ADMIN"], who: "BTG admins" },
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
