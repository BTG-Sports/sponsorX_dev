import Link from "next/link";

import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { PagedTable, Primary, TabLink, TabStrip, Td, Tr, type Column } from "@/components/stage-table";
import { Badge } from "@/components/ui";
import { EmptyState } from "@/components/states";
import { apiListQuery } from "@/lib/list-query";
import {
  REQUEST_TABS, askedAgo, emptyTitle, requestTab, stampOf, stateBadge, zohoLabel, type ApiSponsorRequestList,
} from "@/lib/sponsor-requests-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   Sponsor requests — 2S1-FE-03 (Claude Design SponsorRequests.dc.html,
   SR-1). BTG admin and Sales: businesses asking to sponsor. Approving opens
   their account and emails them a sign-in link (on the request's own page).

   P1-FE-31 (2026-10-07): one SERVER-PAGED table per tab (the house pager,
   12 / 24 / 60 a page); the tab counts are the API's, never the rows in view.

   Reads  GET /sponsor-requests?state=NEW|APPROVED|DECLINED|REJECTED&page&size   the tab's page + every count
          (Rejected: approved accounts BTG rejected afterwards — Reinstate is on each one's page)
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/sponsor-requests";
const TITLE = "Sponsor requests";

export default async function SponsorRequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title={TITLE} roles={lacking} />;
  const sp = await searchParams;
  const tab = requestTab(sp.tab);
  const res = await apiFetch(`/sponsor-requests${apiListQuery(sp, { state: tab.state })}`);
  if (res.status === 403) return <NotInRole path={PATH} title={TITLE} roles={["BTG_ADMIN", "SALES"]} />;
  if (!res.ok) throw new Error(`Sponsor requests unavailable (${res.status}).`);
  const list = (await res.json()) as ApiSponsorRequestList;
  const page = list.page ?? { page: 1, size: list.requests.length || 12, total: list.requests.length, pages: 1 };
  const now = new Date();
  const fresh = tab.state === "NEW";

  const columns: Column[] = [
    { key: "business", label: "Business" },
    { key: "category", label: "Their category (their words)" },
    { key: "budget", label: "Budget" },
    { key: "when", label: fresh ? "Asked" : "Decided" },
    { key: "status", label: fresh ? "Zoho" : "Status" },
    { key: "action", label: "Action", srOnly: true },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="sx-page-title">{TITLE}</h1>
        <p className="mt-1 text-xs text-muted">Businesses asking to sponsor on SponsorX. Approving opens their account and emails them a sign-in link.</p>
      </div>

      <TabStrip label="Request state">
        {REQUEST_TABS.map((t) => (
          <TabLink key={t.key} href={`${PATH}?tab=${t.key}`} on={t.key === tab.key} count={list.counts[t.state]} hot={t.state === "NEW"}>
            {t.label}
          </TabLink>
        ))}
      </TabStrip>

      {list.requests.length === 0 ? (
        <EmptyState
          mark="inbox"
          title={emptyTitle(tab.state)}
          hint={fresh ? "New ones appear here as businesses ask to sponsor." : ""}
        />
      ) : (
        <PagedTable page={page} noun="Requests" label={`${tab.label} sponsor requests`} columns={columns}>
          {list.requests.map((r, i) => {
            const badge = stateBadge(r.state);
            return (
              <Tr key={r.id} i={i}>
                <Td><Primary sub={r.contactName}>{r.businessName}</Primary></Td>
                <Td label="Category" muted>{r.categoryText ?? "—"}</Td>
                <Td label="Budget" muted className="tabular-nums">{r.budget ?? "—"}</Td>
                <Td label={fresh ? "Asked" : "Decided"} muted>{fresh ? askedAgo(r.createdAt, now) : stampOf(r.decidedAt)}</Td>
                <Td label={fresh ? "Zoho" : "Status"}>
                  {fresh
                    ? <Badge tone={r.zoho === "LEAD" ? "accent" : "neutral"}>{zohoLabel(r)}</Badge>
                    : <Badge tone={badge.tone}>{badge.label}</Badge>}
                </Td>
                <Td act>
                  <Link href={`${PATH}/${r.id}`} aria-label={`${fresh ? "Review" : "Open"} ${r.businessName}`} className="font-medium text-primary hover:underline">
                    {fresh ? "Review →" : "Open →"}
                  </Link>
                </Td>
              </Tr>
            );
          })}
        </PagedTable>
      )}
    </div>
  );
}
