import type { NavItem } from "@/components/portal-shell";

/* The Finance portal's sidebar — P1-ART-25 restructure (2026-10-12; owner:
   the Vault inside /admin changed how BTG admins' money desks looked, so
   Finance gets its own portal, as athlete and sponsor have).

   The admin/athlete/sponsor structure (lib/nav-groups.ts): the Treasury
   alone on top, every other desk in a collapsible group, each group's desks
   A to Z, one glyph per group. Every desk here is one the FINANCE role's API
   reads serve (backend/src/auth/policy.ts) — Commission stays BTG-admin only,
   in admin; Campaigns is not in this portal for now.
   Exported so the finance layout and tests/finance-nav.test.ts share one
   array. */
export const FINANCE_NAV: NavItem[] = [
  { href: "/finance", label: "Treasury", icon: "wallet" },

  /* Money in and out. */
  /* 2S5-FE-08 — sponsors' card disputes: Finance takes them for review; a BTG admin resolves. */
  { href: "/finance/disputes", label: "Disputes", icon: "flag", group: "Money", groupIcon: "card" },
  /* 2S5-FE-07 — the payment provider's events SponsorX could not apply. */
  { href: "/finance/payment-events", label: "Payment events", icon: "card", group: "Money" },
  { href: "/finance/payouts", label: "Payouts", icon: "wallet", group: "Money" },
  /* 2S4-FE-06 — money owed back to sponsors, sent by hand until a payment provider is connected. */
  { href: "/finance/refunds", label: "Refunds to send", icon: "wallet", group: "Money" },

  /* SponsorX NEXT — revenue splits: Finance reads and locks them (P9-BE-19). */
  { href: "/finance/splits", label: "Splits", icon: "file", group: "NEXT", groupIcon: "book" },
];

/* P1-ART-24 — the phone dock's four destinations (the rest are behind its
   Menu): the Treasury and the three desks Finance works every day. */
export const FINANCE_DOCK = ["/finance", "/finance/payouts", "/finance/refunds", "/finance/disputes"];
