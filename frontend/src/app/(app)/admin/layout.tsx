import { requirePortalAccess } from "@/server/portal";
import { PortalShell } from "@/components/portal-shell";
import { roleLabel, viewerName } from "@/server/viewer";
import { ADMIN_DOCK, navFor } from "@/lib/admin-nav";

import "../../mobile-nav.css";

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
      /* C-1: each desk's link only for the roles it's for (lib/admin-access);
         commission stays BTG-admin only as before. */
      nav={navFor(actor.roles)}
      rootHref="/admin"
      dock={ADMIN_DOCK}
      orgName="BTG Sports Group"
      userName={await viewerName("BTG staff")}
      userRole={roleLabel(actor.roles)}
      /* P1-ART-18 — the whole admin portal on the Mission Control stage. */
      stage
    >
      {children}
    </PortalShell>
  );
}
