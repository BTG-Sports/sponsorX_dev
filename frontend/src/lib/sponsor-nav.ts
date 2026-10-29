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
     the rest are not wired yet — inert text, not dead links. */
  { href: "/sponsor/invoices", label: "Billing", icon: "card", group: "Account", groupIcon: "gear" },
  { href: "#", label: "Messages", icon: "mail", group: "Account", pending: true },
  { href: "#", label: "Settings", icon: "gear", group: "Account", pending: true },
];
