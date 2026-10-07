import Link from "next/link";

import { BriefsDesk } from "@/components/briefs-desk";
import { EmptyState } from "@/components/states";
import { TABS, mergeBriefs, toBriefRow, type ApiBrief, type TabKey } from "@/lib/briefs-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   Briefs — P4-FE-07. Sponsor requests as they arrive: qualify, approve, then
   send each one to the Matching Studio. P4-FE-09 (P4-BE-11): a sponsor's
   brief that passes every safety check is approved automatically, so the
   desk opens on "Held for BTG" — the exceptions, each with its reasons.

   Live only. GET /briefs is the tenant's briefs for BTG staff (own scope for
   a sponsor, who never reaches this workspace). A 403 is a role that doesn't
   read briefs (finance), shown as out of scope; any other failure is the
   error page, never fixtures dressed as a queue. Qualify and approve are
   campaignBrief.approve (BTG admin, campaign manager); closing is .write,
   which sales also holds — the buttons follow the same rule, and the API
   enforces it regardless.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

const APPROVERS = ["SUPER_ADMIN", "BTG_ADMIN", "CAMPAIGN_MGR"];
const CLOSERS = [...APPROVERS, "SALES"];

export default async function BriefsPage({ searchParams }: PageProps<"/admin/briefs">) {
  const actor = await requirePortalAccess("admin");
  const sp = await searchParams;
  /* P4-FE-09 — "Held for BTG" is the default: a brief whose every safety
     check passes is approved automatically (P4-BE-11), so what is left for
     BTG is the DRAFT briefs held for it, each with its reasons. */
  const tabParam = typeof sp.tab === "string" ? sp.tab : "held";
  const initialTab = (TABS.some((t) => t.key === tabParam) ? tabParam : "held") as TabKey;

  const heading = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="sx-page-title">Briefs</h1>
        <p className="mt-1 text-xs text-muted">
          Requests that pass every safety check are approved automatically. The ones held for you are listed first, each with why.
        </p>
      </div>
      <Link href="/admin/campaigns" className="text-xs text-primary hover:underline">
        Campaigns →
      </Link>
    </div>
  );

  /* The newest briefs, and — so none is cut off by that first page — every
     held one (P4-BE-11's ?held=true). */
  const [res, heldRes] = await Promise.all([apiFetch("/briefs"), apiFetch("/briefs?held=true")]);
  if (res.status === 403) {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState mark="inbox" title="Briefs are outside your role" hint="Briefs are read by BTG's campaign and sales desks." />
      </div>
    );
  }
  if (!res.ok) throw new Error(`Briefs unavailable (${res.status}).`);
  if (!heldRes.ok) throw new Error(`Briefs unavailable (${heldRes.status}).`);
  const briefs = mergeBriefs(
    ((await res.json()) as { briefs: ApiBrief[] }).briefs,
    ((await heldRes.json()) as { briefs: ApiBrief[] }).briefs,
  );

  if (briefs.length === 0) {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState
          mark="inbox"
          title="No briefs yet"
          hint="Briefs land here the moment a sponsor submits the brief form or requests a package. Ones that pass every safety check are approved automatically; the rest wait here for you."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {heading}
      <BriefsDesk
        rows={briefs.map(toBriefRow)}
        initialTab={initialTab}
        canApprove={actor.roles.some((r) => APPROVERS.includes(r))}
        canClose={actor.roles.some((r) => CLOSERS.includes(r))}
      />
    </div>
  );
}
