import { requirePortalAccess } from "@/server/portal";
import { PortalShell } from "@/components/portal-shell";
import { roleLabel, viewerName } from "@/server/viewer";
import { FINANCE_DOCK, FINANCE_NAV } from "@/lib/finance-nav";

import "./vault.css";
import "../../mobile-nav.css";

/* The Finance portal — P1-ART-25 restructure (2026-10-12, owner). Finance's
   own portal, as athlete and sponsor have theirs: the Treasury and the money
   desks, on the Vault (vault.css, imported here only). It used to be a look
   switched on inside /admin; BTG admins saw their money desks change, so the
   Vault moved out and admin went back to how it was.

   Authorisation, not merely authentication (P2-BE-04): requirePortalAccess()
   resolves the Clerk identity to its Postgres roles and admits FINANCE only
   (server/portal.ts) — anyone else is forwarded to their own portal. What a
   desk may then read or change is still the API's call, per request. */
export default async function FinanceLayout({ children }: LayoutProps<"/finance">) {
  const actor = await requirePortalAccess("finance");

  return (
    <PortalShell
      portal="finance"
      nav={FINANCE_NAV}
      rootHref="/finance"
      dock={FINANCE_DOCK}
      orgName="BTG Sports Group"
      userName={await viewerName("BTG staff")}
      userRole={roleLabel(actor.roles)}
      /* The whole portal on the Vault — fixed-dark, so no theme toggle. */
      stage="vault"
    >
      {children}
    </PortalShell>
  );
}
