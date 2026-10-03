import { requirePortalAccess } from "@/server/portal";
import { PortalShell, type NavItem } from "@/components/portal-shell";
import { roleLabel, viewerName } from "@/server/viewer";
import { isCommissionAdmin } from "@/lib/commission-live";
import { mayUse } from "@/lib/admin-access";

/* BTG admin surface — §10's four workspaces plus the command center (§23). */
const NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: "grid" },
  /* 2S1-FE-07 — everything SponsorX approved by itself; BTG steps in only on a problem. */
  { href: "/admin/new-signups", label: "New sign-ups", icon: "user" },
  { href: "/admin/applications", label: "Applications", icon: "users" },
  /* P4-FE-07 — sponsor briefs, qualified here before the Matching Studio. */
  { href: "/admin/briefs", label: "Briefs", icon: "mail" },
  { href: "/admin/campaigns", label: "Campaigns", icon: "megaphone" },
  { href: "/admin/approvals", label: "Approvals", icon: "inbox" },
  { href: "/admin/rewards", label: "Rewards", icon: "gift" },
  { href: "/admin/analytics", label: "Analytics", icon: "chart" },
  { href: "/admin/finance", label: "Finance", icon: "wallet" },
  /* 2S4-FE-06 — money owed back to sponsors, sent by hand until a payment provider is connected (BTG admin and Finance). */
  { href: "/admin/refunds", label: "Refunds to send", icon: "wallet" },
  /* 2S5-FE-01 — BTG admin only; hidden from the other staff roles below. */
  { href: "/admin/commission", label: "Commission", icon: "card" },
  { href: "/admin/marketplace", label: "Marketplace", icon: "store" },
  /* 2S1-FE-03 — businesses asking to sponsor; approving opens the account. */
  { href: "/admin/sponsor-requests", label: "Sponsor requests", icon: "inbox" },
  /* 2S4-FE-04 — lines a sponsor reported, or a seller is late marking delivered. */
  { href: "/admin/delivery-issues", label: "Delivery issues", icon: "flag" },
  /* 2S1-FE-11 — the restricted-words list. */
  { href: "/admin/restricted-words", label: "Restricted words", icon: "ban" },
  /* 2S2-FE-03 — BTG's formal offers: drafts, sending, answering change requests. */
  { href: "/admin/offers", label: "Offers", icon: "megaphone" },
  /* Accounts BTG closed that ask to come back (2S1-BE-13). */
  { href: "/admin/closed-accounts", label: "Closed accounts", icon: "user" },
  /* 2S1-BE-15 — handed-off guardian requests BTG confirms when staff confirm minors. */
  { href: "/admin/guardian-handoffs", label: "Guardian handoffs", icon: "shield" },
  { href: "/admin/payouts", label: "Payouts", icon: "wallet" },
  { href: "/admin/onboarding", label: "Onboarding", icon: "users" },
  { href: "/admin/network", label: "Network", icon: "users" },
  { href: "/admin/integrations", label: "Integrations", icon: "gear" },
  { href: "/admin/audit", label: "Audit log", icon: "file" },
  /* SponsorX NEXT workspaces (spec §8) — editions first (P1-FE-21); the
     inventory ledger, rights queue and splits screens join as they're built. */
  { href: "/admin/next/editions", label: "NEXT editions", icon: "book" },
  { href: "/admin/next/inventory", label: "NEXT inventory", icon: "card" },
  { href: "/admin/next/splits", label: "NEXT splits", icon: "file" },
  { href: "/admin/next/rights", label: "NEXT rights", icon: "camera" },
  /* P9-FE-11 — businesses students bring in; the system decides most, the rest wait here. */
  { href: "/admin/next/prospects", label: "NEXT prospects", icon: "inbox" },
];

/* Authorisation, not merely authentication (P2-BE-04). requirePortalAccess()
   resolves the Clerk identity to its Postgres tenant and roles and admits only
   the roles this portal is for — P2-INT-01 checked that you were signed in as
   *somebody*, which let any signed-in identity open any workspace.

   Which rows this portal may then read is scope.ts, applied per query. */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const actor = await requirePortalAccess("admin");

  /* F-06 (QA pass 5): the header greets the person who signed in and names
     the roles they actually hold — it used to say "BTG Operations /
     BTG_ADMIN" to FINANCE and SALES too. */
  return (
    <PortalShell
      portal="admin"
      /* C-1: each desk's link only for the roles it's for (lib/admin-access);
         commission stays BTG-admin only as before. */
      nav={NAV.filter((n) => mayUse(n.href, actor.roles) && (n.href !== "/admin/commission" || isCommissionAdmin(actor.roles)))}
      rootHref="/admin"
      orgName="BTG Sports Group"
      userName={await viewerName("BTG staff")}
      userRole={roleLabel(actor.roles)}
    >
      {children}
    </PortalShell>
  );
}
