import Link from "next/link";

import { BriefsDesk } from "@/components/briefs-desk";
import { EmptyState } from "@/components/states";
import { TABS, toBriefRow, type ApiBrief, type TabKey } from "@/lib/briefs-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   Briefs — P4-FE-07. Sponsor requests as they arrive: qualify, approve, then
   send each one to the Matching Studio.

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
  const tabParam = typeof sp.tab === "string" ? sp.tab : "all";
  const initialTab = (TABS.some((t) => t.key === tabParam) ? tabParam : "all") as TabKey;

  const heading = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Briefs</h1>
        <p className="mt-1 text-xs text-muted">
          Sponsor requests as they arrive. Qualify, approve, then send each one to the Matching Studio.
        </p>
      </div>
      <Link href="/admin/campaigns" className="text-xs text-primary hover:underline">
        Campaigns →
      </Link>
    </div>
  );

  const res = await apiFetch("/briefs");
  if (res.status === 403) {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState mark="inbox" title="Briefs are outside your role" hint="Briefs are read by BTG's campaign and sales desks." />
      </div>
    );
  }
  if (!res.ok) throw new Error(`Briefs unavailable (${res.status}).`);
  const { briefs } = (await res.json()) as { briefs: ApiBrief[] };

  if (briefs.length === 0) {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState
          mark="inbox"
          title="No briefs yet"
          hint="Briefs land here the moment a sponsor submits the brief form or requests a package. New ones arrive as Draft."
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
