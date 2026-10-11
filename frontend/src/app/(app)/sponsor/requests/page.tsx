import Link from "next/link";
import type { ReactNode } from "react";

import { ListSearch, PendingList, ServerList } from "@/components/server-pager";
import {
  StadiumChip,
  StadiumGhost,
  StadiumHead,
  StadiumPanel,
  StadiumSteps,
  StadiumTile,
  StadiumTiles,
  StadiumUpdated,
} from "@/components/stadium-stage";
import { PagedTable, Primary, TabLink, TabStrip, Td, Tr, type Column } from "@/components/stage-table";
import { demoState } from "@/lib/demo";
import { demoRequestPage } from "@/lib/fixtures/sponsor-overview";
import { textParam, type PageInfo, type SearchParams } from "@/lib/list-query";
import { REQUEST_STEPS, requestStepNow, type ApiSponsorRequest } from "@/lib/brief-status";
import { briefWord } from "@/lib/sponsor-words";
import { BRIEF_STATE_FILTERS, liveSponsorRequestPage, type BriefCounts } from "@/server/sponsor";

/* --------------------------------------------------------------------------
   Sponsor Requests — §9, on the Stadium Board (P1-ART-23 Task 9, spec
   2026-10-11 §7.3). The list of briefs that moved off the Campaigns page:
   what a sponsor has asked for that BTG hasn't turned into a campaign (or
   closed) yet, in plain words, newest first.

   Every number is the API's (memory: stats-must-be-retrievable):
     GET /briefs?page&size&q&state&sort=newest   the tiles, the tabs and the
                                                  paged rows (`counts` is
                                                  always the whole scope, not
                                                  the filtered page)
   Nothing is summed from the rows on screen.

   LIVE vs DEMO. A signed-in sponsor sees their own requests. Anyone else,
   and ?demo=empty|loading|error, gets the fixture deck under a "Sample
   data" pill — the same components, the same layout.
   -------------------------------------------------------------------------- */

const PATH = "/sponsor/requests";
const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

const TABS = [
  { key: "all", label: "All", state: "" },
  { key: "matching", label: "Being matched by BTG", state: "DRAFT,QUALIFIED" },
  { key: "ready", label: "Ready for you", state: "APPROVED" },
  { key: "became", label: "Became a campaign", state: "CAMPAIGN_CREATED" },
  { key: "closed", label: "Closed", state: "CLOSED" },
] as const;

export default async function SponsorRequestsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <StadiumGhost label="Loading your requests" tiles={3} />;
  if (demo === "error") throw new Error("Demo error state");

  const sp = await searchParams;
  const filters = {
    q: textParam(sp, "q"),
    state: textParam(sp, "state", BRIEF_STATE_FILTERS),
  };

  const now = new Date().toISOString();
  const live = demo === null ? await liveSponsorRequestPage(sp) : null;
  if (live) {
    return <Requests sp={sp} filters={filters} rows={live.rows} page={live.page} counts={live.counts} updatedAt={now} sample={false} />;
  }

  const empty = demo === "empty";
  const result = empty
    ? { requests: [], page: { page: 1, size: 12, total: 0, pages: 1 }, counts: { all: 0, held: 0 } as BriefCounts }
    : demoRequestPage(sp, filters);
  return <Requests sp={sp} filters={filters} rows={result.requests} page={result.page} counts={result.counts} updatedAt={now} sample />;
}

/* ------------------------------------------------------------- the page */

function Requests({
  sp, filters, rows, page, counts, updatedAt, sample,
}: {
  sp: SearchParams;
  filters: { q: string; state: string };
  rows: ApiSponsorRequest[];
  page: PageInfo;
  counts: BriefCounts;
  updatedAt: string;
  sample: boolean;
}) {
  const pill = sample ? "Sample data" : <StadiumUpdated iso={updatedAt} />;
  const matching = (counts.DRAFT ?? 0) + (counts.QUALIFIED ?? 0);

  /* A brand-new sponsor: nothing asked for yet — the next step, not a wall of zeros. */
  if (counts.all === 0) {
    return (
      <div className="space-y-6">
        <StadiumHead title="Your requests" pill={pill} />
        <StadiumPanel delay={0.1} className="text-center">
          <p className="text-base font-semibold text-text">No requests yet</p>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">
            Pick a package and tell us what you&rsquo;re after. Every request you send shows up here while BTG matches, prices and turns it into a campaign.
          </p>
          <Link href="/sponsor/marketplace" className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-xs font-semibold">
            Browse packages to start one →
          </Link>
        </StadiumPanel>
      </div>
    );
  }

  const filtered = Boolean(filters.q || filters.state);
  const outOfRange = page.page > page.pages;
  const empty: ReactNode = outOfRange ? (
    "No requests on this page. Go back to the first page to see them."
  ) : (
    "No requests match. Clear the search or try another tab."
  );

  const columns: Column[] = [
    { key: "request", label: "Request" },
    { key: "status", label: "Status" },
    { key: "sent", label: "Sent" },
    { key: "budget", label: "Budget", num: true },
    { key: "steps", label: "Progress" },
    { key: "act", label: "Campaign", srOnly: true },
  ];

  return (
    <div className="space-y-6">
      <StadiumHead title="Your requests" pill={pill} actions={
        <Link href="/sponsor/marketplace" className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold">
          + New request
        </Link>
      }>
        <StadiumTiles cols={3}>
          <StadiumTile
            label="Being matched by BTG"
            value={matching}
            hint="BTG is finding athletes or pricing your request. Usually within a working day."
            delay={0.1}
          />
          <StadiumTile
            label="Ready for you"
            value={counts.APPROVED ?? 0}
            tone={(counts.APPROVED ?? 0) > 0 ? "you" : undefined}
            hint="Approved and about to be staffed into a campaign."
            delay={0.16}
          />
          <StadiumTile
            label="Became campaigns"
            value={counts.CAMPAIGN_CREATED ?? 0}
            href="/sponsor/campaigns"
            hint="Requests that are now running campaigns — open the Campaigns page for their numbers."
            delay={0.22}
          />
        </StadiumTiles>
      </StadiumHead>

      <ServerList>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <TabStrip label="Request status">
            {TABS.map((t) => (
              <TabLink key={t.key} href={tabHref(sp, t.state)} on={filters.state === t.state} count={t.key === "all" ? counts.all : t.key === "matching" ? matching : t.key === "ready" ? counts.APPROVED : t.key === "became" ? counts.CAMPAIGN_CREATED : counts.CLOSED}>
                {t.label}
              </TabLink>
            ))}
          </TabStrip>
          <div className="w-full sm:w-64">
            <ListSearch initial={filters.q} label="Search your requests" placeholder="Search by what you asked for" tone="sponsor" />
          </div>
        </div>

        {rows.length === 0 ? (
          <PendingList>
            <StadiumPanel>
              <p className="text-sm text-muted">{empty}</p>
            </StadiumPanel>
          </PendingList>
        ) : (
          <PagedTable bare tone="sponsor" page={page} noun="Requests" filtered={filtered} label="Your requests" columns={columns}>
            {rows.map((r, i) => {
              const word = briefWord(r.state);
              const now = requestStepNow(r.state);
              return (
                <Tr key={r.id} i={i}>
                  <Td>
                    <Primary sub={r.package?.name ?? "Custom request"}>{r.objective}</Primary>
                  </Td>
                  <Td label="Status">
                    <StadiumChip tone={word.tone}>{word.text}</StadiumChip>
                  </Td>
                  <Td label="Sent" muted>{shortDate(r.createdAt)}</Td>
                  <Td label="Budget" num>{usd(r.budget)}</Td>
                  <Td label="Progress">
                    {now >= 0 ? (
                      <StadiumSteps steps={REQUEST_STEPS} now={now} label={`Where ${r.objective} stands`} />
                    ) : (
                      <span className="text-xs text-muted">Closed</span>
                    )}
                  </Td>
                  <Td act>
                    {r.campaign ? (
                      <Link href={`/sponsor/campaigns/${encodeURIComponent(r.campaign.id)}`} aria-label={`Open ${r.campaign.name}`} className="text-xs font-medium text-sponsor hover:underline">
                        Open campaign →
                      </Link>
                    ) : null}
                  </Td>
                </Tr>
              );
            })}
          </PagedTable>
        )}
      </ServerList>
    </div>
  );
}

/** A tab's href: keep every other param, drop the page, set (or clear) `state`. */
function tabHref(sp: SearchParams, state: string): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === "page" || k === "state") continue;
    const val = Array.isArray(v) ? v[0] : v;
    if (typeof val === "string" && val) u.set(k, val);
  }
  if (state) u.set("state", state);
  const s = u.toString();
  return s ? `${PATH}?${s}` : PATH;
}
