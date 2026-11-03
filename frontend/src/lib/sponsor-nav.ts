import type { NavItem } from "@/components/portal-shell";

/* The sponsor portal's sidebar — P1-ART-23 (2026-10-11): the admin/athlete
   sidebar's structure (P1-ART-21/22, lib/nav-groups.ts) — Dashboard alone on
   top, every other desk in a collapsible group, the groups in the order the
   work runs (Campaigns, Marketplace, Account), each group's desks A to Z,
   one glyph per group. Exported so the sponsor layout and
   tests/nav-groups.test.ts share one array. */
export const SPONSOR_NAV: NavItem[] = [
  { href: "/sponsor", label: "Dashboard", icon: "grid" },

  /* What the sponsor is running and asking for. */
  { href: "/sponsor/campaigns", label: "Campaigns", icon: "megaphone", group: "Campaigns", groupIcon: "megaphone" },
  /* 3S7-FE-01 — what worked across every campaign (Phase 3). */
  { href: "/sponsor/intelligence", label: "Intelligence", icon: "chart", group: "Campaigns" },
  { href: "/sponsor/requests", label: "Requests", icon: "inbox", group: "Campaigns" },

  /* Browsing, buying and what came of it. */
  { href: "/sponsor/cart", label: "Cart", icon: "card", group: "Marketplace", groupIcon: "store" },
  { href: "/sponsor/orders", label: "Orders", icon: "file", group: "Marketplace" },
  { href: "/sponsor/marketplace", label: "Packages", icon: "box", group: "Marketplace" },
  { href: "/sponsor/shop", label: "Shop", icon: "store", group: "Marketplace" },

  /* The sponsor's own account. Billing is the invoices screen (POL-FE-13);
     Team is the admin's people (POL-FE-19). The inert "Messages" and
     "Settings" entries went with POL-FE-19 — nothing is behind them, and
     polish.md §19 says hide what isn't built. */
  { href: "/sponsor/invoices", label: "Billing", icon: "card", group: "Account", groupIcon: "gear" },
  { href: "/sponsor/team", label: "Team", icon: "users", group: "Account" },
];

/**
 * POL-FE-19 — the sidebar for this sign-in: Team only for a SPONSOR_ADMIN.
 * An analyst (read only) or a BTG preview never sees the link; the page
 * itself refuses them too (the API's 403 → "not in your role"). The full
 * array stays exported for tests/nav-groups.test.ts.
 */
export function sponsorNavFor(roles: readonly string[]): NavItem[] {
  if (roles.includes("SPONSOR_ADMIN")) return SPONSOR_NAV;
  return SPONSOR_NAV.filter((i) => i.href !== "/sponsor/team");
}
