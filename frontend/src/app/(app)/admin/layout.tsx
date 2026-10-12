import { requirePortalAccess } from "@/server/portal";
import { PortalShell } from "@/components/portal-shell";
import { roleLabel, viewerName } from "@/server/viewer";
import { dockFor, navFor, rootFor } from "@/lib/admin-nav";
import { isFinanceOnly } from "@/lib/admin-access";

import "../../mobile-nav.css";
/* P1-ART-25 — the Vault, Finance's look on the money desks (StageRoot
   switches it on by route) and on every page a Finance-only viewer opens. */
import "./vault.css";

/* BTG admin surface — §10's four workspaces plus the command center (§23).
   The nav, the dock and who sees which live in lib/admin-nav.ts. */

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
      /* C-1: each desk's link only for the roles it's for (lib/admin-access).
         P1-ART-25: a Finance-only viewer is rooted at the Treasury. */
      nav={navFor(actor.roles)}
      rootHref={rootFor(actor.roles)}
      dock={dockFor(actor.roles)}
      orgName="BTG Sports Group"
      userName={await viewerName("BTG staff")}
      userRole={roleLabel(actor.roles)}
      /* P1-ART-18 — the whole admin portal on the Mission Control stage;
         P1-ART-25 — the Vault on the money desks, and on every page for a
         Finance-only viewer: Finance is its own portal, as athlete and
         sponsor are, so no page of theirs drops back into Mission Control. */
      stage
      vault={isFinanceOnly(actor.roles) ? "all" : true}
    >
      {children}
    </PortalShell>
  );
}
