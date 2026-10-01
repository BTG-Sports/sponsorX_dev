import Link from "next/link";

import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { Badge, Card } from "@/components/ui";
import { EmptyState } from "@/components/states";
import {
  REQUEST_TABS, askedAgo, emptyTitle, requestTab, stampOf, stateBadge, zohoLabel, type ApiSponsorRequestList,
} from "@/lib/sponsor-requests-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   Sponsor requests — 2S1-FE-03 (Claude Design SponsorRequests.dc.html,
   SR-1). BTG admin and Sales: businesses asking to sponsor. Approving opens
   their account and emails them a sign-in link (on the request's own page).

   Reads  GET /sponsor-requests?state=NEW|APPROVED|DECLINED|REJECTED   the tab + every count
          (Rejected: approved accounts BTG rejected afterwards — Reinstate is on each one's page)
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/sponsor-requests";
const TITLE = "Sponsor requests";

export default async function SponsorRequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title={TITLE} roles={lacking} />;
  const tab = requestTab((await searchParams).tab);
  const res = await apiFetch(`/sponsor-requests?state=${tab.state}`);
  if (res.status === 403) return <NotInRole path={PATH} title={TITLE} roles={["BTG_ADMIN", "SALES"]} />;
  if (!res.ok) throw new Error(`Sponsor requests unavailable (${res.status}).`);
  const list = (await res.json()) as ApiSponsorRequestList;
  const now = new Date();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{TITLE}</h1>
        <p className="mt-1 text-xs text-muted">Businesses asking to sponsor on SponsorX. Approving opens their account and emails them a sign-in link.</p>
      </div>

      <nav aria-label="Request state" className="flex flex-wrap gap-2">
        {REQUEST_TABS.map((t) => {
          const on = t.key === tab.key;
          return (
            <Link key={t.key} href={`${PATH}?tab=${t.key}`} aria-current={on ? "page" : undefined}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${on ? "border-primary/60 text-primary" : "border-line text-muted hover:text-text"}`}>
              {t.label}
              <span className={`rounded-full px-1.5 text-[10px] tabular-nums ${t.state === "NEW" && list.counts.NEW ? "bg-warn/15 text-warn" : "bg-surface-2"}`}>{list.counts[t.state]}</span>
            </Link>
          );
        })}
      </nav>

      {list.requests.length === 0 ? (
        <EmptyState
          mark="inbox"
          title={emptyTitle(tab.state)}
          hint={tab.state === "NEW" ? "New ones appear here as businesses ask to sponsor." : ""}
        />
      ) : (
        <Card className="p-0">
          <div className="hidden grid-cols-[1.4fr_1.2fr_8rem_7rem_8rem_6rem] gap-x-3 border-b border-line-soft px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-faint md:grid">
            <span>Business</span>
            <span>Their category (their words)</span>
            <span>Budget</span>
            <span>{tab.state === "NEW" ? "Asked" : "Decided"}</span>
            <span>{tab.state === "NEW" ? "Zoho" : "Status"}</span>
            <span className="text-right">Action</span>
          </div>
          <ul className="divide-y divide-line-soft">
            {list.requests.map((r) => {
              const badge = stateBadge(r.state);
              return (
                <li key={r.id} className="grid gap-x-3 gap-y-1 px-4 py-3 text-xs md:grid-cols-[1.4fr_1.2fr_8rem_7rem_8rem_6rem] md:items-center">
                  <span className="min-w-0">
                    <span className="block font-medium">{r.businessName}</span>
                    <span className="block text-[11px] text-muted">{r.contactName}</span>
                  </span>
                  <span className="text-muted">{r.categoryText ?? "—"}</span>
                  <span className="tabular-nums text-muted">{r.budget ?? "—"}</span>
                  <span className="text-muted">{tab.state === "NEW" ? askedAgo(r.createdAt, now) : stampOf(r.decidedAt)}</span>
                  <span>
                    {tab.state === "NEW"
                      ? <Badge tone={r.zoho === "LEAD" ? "accent" : "neutral"}>{zohoLabel(r)}</Badge>
                      : <Badge tone={badge.tone}>{badge.label}</Badge>}
                  </span>
                  <span className="md:text-right">
                    <Link href={`${PATH}/${r.id}`} aria-label={`${tab.state === "NEW" ? "Review" : "Open"} ${r.businessName}`} className="font-medium text-primary hover:underline">
                      {tab.state === "NEW" ? "Review →" : "Open →"}
                    </Link>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
