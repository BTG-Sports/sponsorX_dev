import Link from "next/link";
import type { ReactNode } from "react";

import { ListSearch, ListFilter, PendingList, ServerList } from "@/components/server-pager";
import {
  StadiumBar,
  StadiumChip,
  StadiumGhost,
  StadiumHead,
  StadiumPanel,
  StadiumTile,
  StadiumTiles,
  StadiumUpdated,
} from "@/components/stadium-stage";
import { PagedTable, Primary, TabLink, TabStrip, Td, Tr, type Column } from "@/components/stage-table";
import { demoState } from "@/lib/demo";
import { DEMO_NOW, demoCampaignPage, demoCampaignSummary, demoRequestPage } from "@/lib/fixtures/sponsor-overview";
import { textParam, type PageInfo, type SearchParams } from "@/lib/list-query";
import { isBehind, windowLabel, type ApiCampaign } from "@/lib/sponsor-live";
import { campaignWord } from "@/lib/sponsor-words";
import { CAMPAIGN_SORTS, CAMPAIGN_STATE_FILTERS, type CampaignSummary } from "@/server/campaigns";
import { liveSponsorCampaignPage } from "@/server/sponsor";

/* --------------------------------------------------------------------------
   Sponsor Campaigns — §9, on the Stadium Board (P1-ART-23 Task 9, spec
   2026-10-11 §7.2). The sponsor's whole portfolio: every campaign BTG has
   staffed from an approved request, searchable, filterable by tab and
   server-paged.

   Every tile and tab count is the API's (memory: stats-must-be-retrievable):
     GET /campaigns/summary                 Running, Needs your OK, Behind
                                             schedule, Total budget, the tab
                                             counts
     GET /briefs?page=1&size=1              the "Your requests" open count
     GET /campaigns?page&size&q&state&sort  the paged table (one page)
   Nothing is summed from the rows on screen. Money is in cents.

   The "Posts to review" 5th tab (extra to the spec, P1-ART-23 Task 9: the
   dashboard's "Posts waiting for your OK" link lands here) sets ?review=1,
   which fetchCampaignPage already forwards as the API's ?review=true. It
   carries no count — that would need its own /sponsor/overview read, which
   this page has no other reason to make.

   LIVE vs DEMO. A signed-in sponsor sees their own campaigns. Anyone else,
   and ?demo=empty|loading|error, gets the fixture deck under a "Sample
   data" pill — the same components, the same layout.
   -------------------------------------------------------------------------- */

const PATH = "/sponsor/campaigns";
const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const SORT_WORDS: Record<(typeof CAMPAIGN_SORTS)[number], string> = { name: "Name A–Z", ending: "Ending soonest" };
const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const STATE_TABS = [
  { key: "all", label: "All", state: "" },
  { key: "running", label: "Running", state: "ACTIVE" },
  { key: "approval", label: "Needs your OK", state: "APPROVAL" },
  { key: "finished", label: "Finished", state: "COMPLETED,CANCELLED" },
] as const;

export default async function SponsorCampaignsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <StadiumGhost label="Loading your campaigns" tiles={5} />;
  if (demo === "error") throw new Error("Demo error state");

  const sp = await searchParams;
  const filters = {
    q: textParam(sp, "q"),
    state: textParam(sp, "state", CAMPAIGN_STATE_FILTERS),
    sort: textParam(sp, "sort", CAMPAIGN_SORTS),
    review: textParam(sp, "review", ["1"]),
  };

  const live = demo === null ? await liveSponsorCampaignPage(sp) : null;
  if (live) {
    const now = new Date();
    return (
      <Campaigns
        sp={sp}
        filters={filters}
        summary={live.summary}
        requestsOpen={live.requestsOpen}
        rows={live.rows}
        page={live.page}
        now={now}
        updatedAt={now.toISOString()}
        sample={false}
      />
    );
  }

  const empty = demo === "empty";
  const list = empty ? { campaigns: [], page: { page: 1, size: 12, total: 0, pages: 1 } } : demoCampaignPage(sp, filters);
  const summary = demoCampaignSummary();
  /* The same open-request count the demo Requests page's own tiles show
     (DRAFT + QUALIFIED + APPROVED), not a number invented for this page. */
  const requestsOpen = empty ? 0 : (() => {
    const { counts } = demoRequestPage(sp, { q: "", state: "" });
    return (counts.DRAFT ?? 0) + (counts.QUALIFIED ?? 0) + (counts.APPROVED ?? 0);
  })();
  return (
    <Campaigns
      sp={sp}
      filters={filters}
      summary={empty ? { ...summary, total: 0, byState: {}, active: 0, behind: 0 } : summary}
      requestsOpen={requestsOpen}
      rows={list.campaigns}
      page={list.page}
      now={DEMO_NOW}
      updatedAt={DEMO_NOW.toISOString()}
      sample
    />
  );
}

/* ------------------------------------------------------------- the page */

function Campaigns({
  sp, filters, summary, requestsOpen, rows, page, now, updatedAt, sample,
}: {
  sp: SearchParams;
  filters: { q: string; state: string; sort: string; review: string };
  summary: CampaignSummary;
  requestsOpen?: number;
  rows: ApiCampaign[];
  page: PageInfo;
  now: Date;
  updatedAt: string;
  sample: boolean;
}) {
  const pill = sample ? "Sample data" : <StadiumUpdated iso={updatedAt} />;
  const newRequest = (
    <Link href="/sponsor/marketplace" className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold">
      + New request
    </Link>
  );

  /* A brand-new sponsor: no campaign yet — the next step, not a wall of zeros. */
  if (summary.total === 0) {
    return (
      <div className="space-y-6">
        <StadiumHead title="Your campaigns" pill={pill} actions={newRequest} />
        <StadiumPanel delay={0.1} className="text-center">
          <p className="text-base font-semibold text-text">No campaigns yet</p>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">
            Pick a package, tell us what you&rsquo;re after, and BTG will match you with athletes. Your campaigns show up here as soon as the first one is staffed.
          </p>
          {requestsOpen ? (
            <p className="mt-3 text-sm">
              <Link href="/sponsor/requests" className="font-medium text-sponsor hover:underline">
                You have {requestsOpen} {requestsOpen === 1 ? "request" : "requests"} being matched → See requests
              </Link>
            </p>
          ) : null}
          <Link href="/sponsor/marketplace" className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-xs font-semibold">
            Browse packages to start one →
          </Link>
        </StadiumPanel>
      </div>
    );
  }

  const approval = summary.byState.APPROVAL ?? 0;
  const finished = (summary.byState.COMPLETED ?? 0) + (summary.byState.CANCELLED ?? 0);
  const share = summary.budget && summary.contracted !== undefined && summary.budget > 0 ? summary.contracted / summary.budget : undefined;

  return (
    <div className="space-y-6">
      <StadiumHead title="Your campaigns" pill={pill} actions={newRequest}>
        <StadiumTiles cols={5}>
          <StadiumTile
            label="Running"
            value={summary.active}
            href={tabHref(sp, "ACTIVE")}
            hint="Campaigns currently live."
            delay={0.1}
          />
          <StadiumTile
            label="Needs your OK"
            value={approval}
            tone={approval > 0 ? "you" : undefined}
            href={tabHref(sp, "APPROVAL")}
            hint="Campaigns waiting for a decision from you."
            delay={0.16}
          />
          <StadiumTile
            label="Behind schedule"
            value={summary.behind}
            tone={summary.behind > 0 ? "late" : undefined}
            hint="Active campaigns whose posting has fallen behind their own calendar."
            delay={0.22}
          />
          {summary.budget !== undefined ? (
            <StadiumTile
              label="Total budget"
              value={summary.budget}
              format="usd0"
              share={share}
              caption={summary.contracted !== undefined ? `${usd(summary.contracted)} agreed` : undefined}
              hint="What your campaigns are budgeted for, and how much of it is contracted so far."
              delay={0.28}
            />
          ) : (
            <StadiumTile
              label="Athletes"
              value={summary.athletes}
              hint="Athletes on your campaigns."
              delay={0.28}
            />
          )}
          {requestsOpen !== undefined && (
            <StadiumTile
              label="Your requests"
              value={requestsOpen}
              caption="in progress"
              href="/sponsor/requests"
              hint="Requests BTG is still matching or pricing — not a campaign yet."
              delay={0.34}
            />
          )}
        </StadiumTiles>
      </StadiumHead>

      <CampaignList
        sp={sp}
        filters={filters}
        running={summary.active}
        approval={approval}
        finished={finished}
        rows={rows}
        page={page}
        now={now}
        total={summary.total}
      />
    </div>
  );
}

/* ------------------------------------------------------------ campaigns */

function CampaignList({
  sp, filters, running, approval, finished, rows, page, now, total,
}: {
  sp: SearchParams;
  filters: { q: string; state: string; sort: string; review: string };
  running: number;
  approval: number;
  finished: number;
  rows: ApiCampaign[];
  page: PageInfo;
  now: Date;
  total: number;
}) {
  const filtered = Boolean(filters.q || filters.state || filters.review);
  const outOfRange = page.page > page.pages;
  const empty: ReactNode = outOfRange ? (
    "No campaigns on this page. Go back to the first page to see them."
  ) : filtered ? (
    "No campaigns match. Clear the search or try another tab."
  ) : (
    <>
      No campaigns yet.{" "}
      <Link href="/sponsor/marketplace" className="font-medium text-sponsor hover:underline">
        Browse packages to start one →
      </Link>
    </>
  );
  const showMoney = rows.some((r) => r.contracted !== undefined);
  const columns: Column[] = [
    { key: "campaign", label: "Campaign" },
    { key: "status", label: "Status" },
    { key: "posts", label: "Posts delivered" },
    ...(showMoney ? [{ key: "spent", label: "Spent", num: true }] : []),
    { key: "ends", label: "Dates" },
    { key: "act", label: "Results", srOnly: true },
  ];

  const onReview = filters.review === "1";
  const onState = (s: string) => !onReview && filters.state === s;

  return (
    <section className="min-w-0" aria-labelledby="sx-your-campaigns">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="sx-your-campaigns" className="sx-section-title">Your campaigns</h2>
        <span className="text-xs text-muted">{total.toLocaleString("en-US")} in all</span>
      </div>
      <ServerList>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <TabStrip label="Campaign status">
            {STATE_TABS.map((t) => (
              <TabLink
                key={t.key}
                href={tabHref(sp, t.state)}
                on={onState(t.state)}
                count={t.key === "all" ? total : t.key === "running" ? running : t.key === "approval" ? approval : finished}
              >
                {t.label}
              </TabLink>
            ))}
            <TabLink href={tabHref(sp, "", "1")} on={onReview}>
              Posts to review
            </TabLink>
          </TabStrip>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="w-full sm:w-64">
            <ListSearch initial={filters.q} label="Search your campaigns" placeholder="Search by campaign name" tone="sponsor" />
          </div>
          <ListFilter
            param="sort"
            value={filters.sort}
            label="Order"
            allLabel="Newest first"
            options={CAMPAIGN_SORTS.map((s) => ({ value: s, label: SORT_WORDS[s] }))}
            tone="sponsor"
          />
        </div>
        {rows.length === 0 ? (
          <PendingList>
            <StadiumPanel>
              <p className="text-sm text-muted">{empty}</p>
            </StadiumPanel>
          </PendingList>
        ) : (
          <PagedTable bare tone="sponsor" page={page} noun="Campaigns" filtered={filtered} label="Your campaigns" columns={columns}>
            {rows.map((c, i) => {
              const word = campaignWord(c.state);
              const { done, total: due } = c.deliverables;
              const behind = isBehind(c, now);
              return (
                <Tr key={c.id} i={i}>
                  <Td>
                    <Link href={`/sponsor/campaigns/${encodeURIComponent(c.id)}`} className="block rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sponsor">
                      <Primary sub={`${c.athletes} ${c.athletes === 1 ? "athlete" : "athletes"} · ${c.package?.name ?? "Custom package"}`}>{c.name}</Primary>
                    </Link>
                  </Td>
                  <Td label="Status">
                    <span className="flex flex-wrap gap-1.5">
                      <StadiumChip tone={word.tone}>{word.text}</StadiumChip>
                      {behind && <StadiumChip tone="late">Behind</StadiumChip>}
                    </span>
                  </Td>
                  <Td label="Posts delivered">
                    {due ? (
                      <span className="flex items-center gap-2">
                        <span className="block w-20">
                          <StadiumBar value={done / due} tone={behind ? "late" : undefined} delay={0.1 + i * 0.03} />
                        </span>
                        <span className="text-xs tabular-nums text-muted">
                          {done}/{due}
                        </span>
                      </span>
                    ) : (
                      <span className="text-xs text-muted">None planned yet</span>
                    )}
                  </Td>
                  {showMoney && (
                    <Td label="Spent" num>
                      {c.invoiced !== undefined ? (
                        usd(c.invoiced)
                      ) : c.contracted !== undefined ? (
                        <>
                          {usd(c.contracted)} <span className="text-[10px] text-faint">Agreed</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </Td>
                  )}
                  <Td label="Dates" muted>
                    {upper(windowLabel(c, now))}
                  </Td>
                  <Td act>
                    <Link href={`/sponsor/campaigns/${encodeURIComponent(c.id)}/report`} aria-label={`See results for ${c.name}`} className="text-xs font-medium text-sponsor hover:underline">
                      See results →
                    </Link>
                  </Td>
                </Tr>
              );
            })}
          </PagedTable>
        )}
      </ServerList>
    </section>
  );
}

/** A tab's href: keep every other param, drop the page, set `state` / `review`. */
function tabHref(sp: SearchParams, state: string, review?: string): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === "page" || k === "state" || k === "review") continue;
    const val = Array.isArray(v) ? v[0] : v;
    if (typeof val === "string" && val) u.set(k, val);
  }
  if (state) u.set("state", state);
  if (review) u.set("review", review);
  const s = u.toString();
  return s ? `${PATH}?${s}` : PATH;
}
