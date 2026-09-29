import { BrandingReadOnly, PropertyBrandingForm } from "@/components/property-branding-form";
import type { ApiBranding } from "@/lib/property-p2-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   Branding — 2S7-FE-03 (design Branding.dc.html). The organisation's own
   name, logo, colours and report footer in its portal.

   Reads  GET  /branding          (every value may be null — nothing set)
   Writes PUT  /branding          displayName, #RRGGBB colours, reportFooter,
                                  customDomain, logoKey
          POST /branding/logo     upload grant → the browser PUTs the file to
                                  uploadUrl → PUT /branding { logoKey }

   A PROPERTY_MGR may write only when its tenant is an operated one; GET
   /branding says so (canEdit), and anyone else gets the read-only view ("BTG
   manages branding for your organisation") — a 403 on a write still turns
   the form read-only. customDomain is stored only — no routing yet — and the
   form says so. The design's shortcut buttons are left out.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export default async function PropertyBrandingPage() {
  await requirePortalAccess("property");
  const res = await apiFetch("/branding");
  if (!res.ok) throw new Error(`Branding unavailable (${res.status}).`);
  const branding = (await res.json()) as ApiBranding;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Branding</h1>
        <p className="mt-1 text-xs text-muted">Your organisation&rsquo;s name, logo and colours in your portal, and the footer on your branded reports.</p>
      </div>
      {branding.canEdit ? <PropertyBrandingForm branding={branding} /> : <BrandingReadOnly branding={branding} />}
    </div>
  );
}
