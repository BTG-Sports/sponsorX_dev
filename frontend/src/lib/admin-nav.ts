import type { NavItem } from "@/components/portal-shell";
import { isFinanceOnly, mayUse } from "@/lib/admin-access";
import { isCommissionAdmin } from "@/lib/commission-live";
import { stampGroupIcons } from "@/lib/nav-groups";
import { isVaultPath } from "@/lib/vault-routes";

/* BTG admin surface — §10's four workspaces plus the command center (§23).

   P1-ART-21 (2026-10-07; owner: "too many … collapsable … sort them
   orderly"): the desks fold into collapsible groups in the sidebar
   (lib/nav-groups.ts), Dashboard on top, each group's desks in
   alphabetical order. The group holding the open page is open on arrival.
   A desk's own notes stay with it.

   P1-ART-25 — moved here from the admin layout so the layout, the tests and
   `navFor` share one array (like lib/sponsor-nav.ts). Finance's home is
   relabelled Treasury, which sorts it to the foot of Money. */
export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: "grid" },

  /* People and organisations coming in. */
  { href: "/admin/applications", label: "Applications", icon: "users", group: "Intake", groupIcon: "inbox" },
  /* 2S1-FE-07 — everything SponsorX approved by itself; BTG steps in only on a problem. */
  { href: "/admin/new-signups", label: "New sign-ups", icon: "user", group: "Intake" },
  { href: "/admin/onboarding", label: "Onboarding", icon: "users", group: "Intake" },
  /* 2S1-FE-03 — businesses asking to sponsor; approving opens the account. */
  { href: "/admin/sponsor-requests", label: "Sponsor requests", icon: "inbox", group: "Intake" },

  /* From a brief to a running campaign. */
  { href: "/admin/approvals", label: "Approvals", icon: "inbox", group: "Campaigns", groupIcon: "megaphone" },
  /* P4-FE-07 — sponsor briefs, qualified here before the Matching Studio. */
  { href: "/admin/briefs", label: "Briefs", icon: "mail", group: "Campaigns" },
  { href: "/admin/campaigns", label: "Campaigns", icon: "megaphone", group: "Campaigns" },
  /* 2S2-FE-03 — BTG's formal offers: drafts, sending, answering change requests. */
  { href: "/admin/offers", label: "Offers", icon: "megaphone", group: "Campaigns" },
  { href: "/admin/rewards", label: "Rewards", icon: "gift", group: "Campaigns" },

  /* Listings, orders and what goes wrong with them. */
  /* 2S4-FE-04 — lines a sponsor reported, or a seller is late marking delivered. */
  { href: "/admin/delivery-issues", label: "Delivery issues", icon: "flag", group: "Marketplace", groupIcon: "store" },
  { href: "/admin/marketplace", label: "Marketplace", icon: "store", group: "Marketplace" },
  /* 2S1-FE-11 — the restricted-words list. */
  { href: "/admin/restricted-words", label: "Restricted words", icon: "ban", group: "Marketplace" },

  /* Money in and out. */
  /* 2S5-FE-01 — BTG admin only; hidden from the other staff roles below. */
  { href: "/admin/commission", label: "Commission", icon: "card", group: "Money", groupIcon: "wallet" },
  /* 2S5-FE-08 — sponsors' card disputes: frozen money until a BTG admin resolves them (BTG admin and Finance). */
  { href: "/admin/payments/disputes", label: "Disputes", icon: "flag", group: "Money" },
  /* 2S5-FE-07 — the payment provider's events SponsorX could not apply (BTG admin and Finance). */
  { href: "/admin/payments/events", label: "Payment events", icon: "card", group: "Money" },
  { href: "/admin/payouts", label: "Payouts", icon: "wallet", group: "Money" },
  /* 2S4-FE-06 — money owed back to sponsors, sent by hand until a payment provider is connected (BTG admin and Finance). */
  { href: "/admin/refunds", label: "Refunds to send", icon: "wallet", group: "Money" },
  /* P1-ART-25 — Finance's home (was "Finance"). */
  { href: "/admin/finance", label: "Treasury", icon: "wallet", group: "Money" },

  /* The people on the platform. */
  /* Accounts BTG closed that ask to come back (2S1-BE-13). */
  { href: "/admin/closed-accounts", label: "Closed accounts", icon: "user", group: "Accounts", groupIcon: "users" },
  /* 2S1-BE-15 — handed-off guardian requests BTG confirms when staff confirm minors. */
  { href: "/admin/guardian-handoffs", label: "Guardian handoffs", icon: "shield", group: "Accounts" },
  { href: "/admin/network", label: "Network", icon: "users", group: "Accounts" },

  /* SponsorX NEXT workspaces (spec §8) — editions first (P1-FE-21); the
     inventory ledger, rights queue and splits screens join as they're built. */
  { href: "/admin/next/editions", label: "Editions", icon: "book", group: "NEXT", groupIcon: "book" },
  { href: "/admin/next/inventory", label: "Inventory", icon: "card", group: "NEXT" },
  /* P9-FE-11 — businesses students bring in; the system decides most, the rest wait here. */
  { href: "/admin/next/prospects", label: "Prospects", icon: "inbox", group: "NEXT" },
  { href: "/admin/next/rights", label: "Rights", icon: "camera", group: "NEXT" },
  { href: "/admin/next/splits", label: "Splits", icon: "file", group: "NEXT" },

  /* The platform itself. */
  { href: "/admin/analytics", label: "Analytics", icon: "chart", group: "System", groupIcon: "gear" },
  { href: "/admin/audit", label: "Audit log", icon: "file", group: "System" },
  { href: "/admin/integrations", label: "Integrations", icon: "gear", group: "System" },
];

/* P1-ART-24 — the phone dock's four destinations (the rest are behind its
   Menu). A desk the viewer's role cannot use drops out of the dock too. */
export const ADMIN_DOCK = ["/admin", "/admin/approvals", "/admin/campaigns", "/admin/finance"];

/* P1-ART-25 — a Finance-only viewer's dock: the Treasury and the three
   desks they work every day. */
export const FINANCE_DOCK = ["/admin/finance", "/admin/payouts", "/admin/refunds", "/admin/payments/disputes"];

/** Where the viewer's nav is rooted: the Treasury for a Finance-only viewer
 *  (their logo goes straight home, no hop through /admin's redirect), the
 *  board for everyone else. Treasury has no pages below it, so matching it
 *  exactly as the root costs no active state. */
export function rootFor(roles: readonly string[]): string {
  return isFinanceOnly(roles) ? "/admin/finance" : "/admin";
}

/** The viewer's sidebar. C-1: each desk's link only for the roles it's for
 *  (lib/admin-access); commission stays BTG-admin only as before.
 *  P1-ART-25 — a Finance-only viewer's home is the Treasury: it leads the
 *  nav in Dashboard's place (and leaves the Money group, so it is not
 *  listed twice).
 *  Review follow-up — a role's filtered nav keeps every group's glyph even
 *  when the item that carries it is filtered out (stampGroupIcons, built
 *  from the full, unfiltered ADMIN_NAV). */
export function navFor(roles: readonly string[]): NavItem[] {
  const allowed = stampGroupIcons(
    ADMIN_NAV.filter((n) => mayUse(n.href, roles) && (n.href !== "/admin/commission" || isCommissionAdmin(roles))),
    ADMIN_NAV,
  );
  if (!isFinanceOnly(roles)) return allowed;
  return [
    { href: "/admin/finance", label: "Treasury", icon: "wallet" },
    ...allowed.filter((n) => n.href !== "/admin" && n.href !== "/admin/finance"),
  ];
}

/** The viewer's phone dock. */
export function dockFor(roles: readonly string[]): readonly string[] {
  return isFinanceOnly(roles) ? FINANCE_DOCK : ADMIN_DOCK;
}

/** Review follow-up — may this viewer reach ANY money desk at all? A role
 *  with no money desk (a campaign manager or Sales user deep-linking
 *  /admin/payouts) must not see the Vault switch on over a "not in your
 *  role" page: the admin layout only passes the money-routes Vault mode
 *  ("money") when this is true, "off" otherwise. Checked against the
 *  concrete desks in ADMIN_NAV, not the bare VAULT_PREFIXES themselves —
 *  "/admin/payments" alone names no desk, so `mayUse` would call it open to
 *  everyone. */
export function mayUseVault(roles: readonly string[]): boolean {
  return ADMIN_NAV.some(
    (n) => isVaultPath(n.href) && mayUse(n.href, roles) && (n.href !== "/admin/commission" || isCommissionAdmin(roles)),
  );
}
