import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";
import { PortalShell, type NavItem } from "@/components/portal-shell";
import { roleLabel, viewerName } from "@/server/viewer";

/* Property surface — §8 PROPERTY_MGR. A property manager sees only their own
   property's athletes, inventory and campaigns (scoped in guide §09). The
   Phase 2 screens (2S2-FE-04, 2S2-FE-02, 2S3-FE-01, 2S5-FE-02, 2S7-FE-01,
   2S7-FE-03) are live; Campaigns stays inert — no API lists a property's
   campaigns yet. */
const NAV: NavItem[] = [
  { href: "/property", label: "Dashboard", icon: "grid" },
  { href: "/property/roster", label: "Roster", icon: "users" },
  { href: "/property/inventory", label: "Inventory", icon: "store" },
  { href: "/property/listings", label: "Listings", icon: "megaphone" },
  /* 2S4-FE-03 — the team's sold lines, its own share only. */
  { href: "/property/sales", label: "Orders", icon: "box" },
  { href: "/property/earnings", label: "Earnings", icon: "wallet" },
  { href: "/property/analytics", label: "Analytics", icon: "chart" },
  { href: "/property/branding", label: "Branding", icon: "pen" },
  /* 2S1-FE-04 / 2S1-FE-08 — documents on file, and the account itself. */
  { href: "/property/documents", label: "Documents", icon: "file" },
  { href: "/property/settings", label: "Settings", icon: "gear" },
  { href: "/property/campaigns", label: "Campaigns", icon: "calendar", pending: true },
];

type Branding = { displayName: string | null; logoUrl: string | null; primaryColor: string | null };

/** The tenant's own branding for the frame (2S7-FE-03). Cosmetic: an API
 *  blip must not take the whole portal down, so a failed read is no brand. */
async function branding(): Promise<Branding | null> {
  try {
    const res = await apiFetch("/branding");
    return res.ok ? ((await res.json()) as Branding) : null;
  } catch {
    return null;
  }
}

/* Authorisation, not merely authentication (P2-BE-04). requirePortalAccess()
   resolves the Clerk identity to its Postgres tenant and roles and admits only
   the roles this portal is for — P2-INT-01 checked that you were signed in as
   *somebody*, which let any signed-in identity open any workspace.

   Which rows this portal may then read is scope.ts, applied per query. */
export default async function PropertyLayout({ children }: LayoutProps<"/property">) {
  const actor = await requirePortalAccess("property");
  const brand = await branding();

  return (
    <PortalShell
      portal="property"
      nav={NAV}
      rootHref="/property"
      orgName={brand?.displayName ?? undefined}
      orgBrand={brand ? { logoUrl: brand.logoUrl, primaryColor: brand.primaryColor } : undefined}
      /* F-06 (QA pass 5): the signed-in person and their real roles, not
         the fixture property's name over every manager's header. */
      userName={await viewerName("Property manager")}
      userRole={roleLabel(actor.roles)}
    >
      {children}
    </PortalShell>
  );
}
