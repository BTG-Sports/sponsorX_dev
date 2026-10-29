import Link from "next/link";
import type { ReactNode } from "react";

import { ListSearch, ListFilter, ServerList } from "@/components/server-pager";
import { SponsorCampaignTable } from "@/components/sponsor-campaign-table";
import {
  StadiumGhost,
  StadiumHead,
  StadiumPanel,
  StadiumTile,
  StadiumTiles,
  StadiumUpdated,
} from "@/components/stadium-stage";
import { TabLink, TabStrip } from "@/components/stage-table";
import { demoState } from "@/lib/demo";
import { formatCount } from "@/lib/format-count";
import { DEMO_NOW, demoCampaignPage, demoCampaignSummary, demoRequestPage } from "@/lib/fixtures/sponsor-overview";
import { textParam, type PageInfo, type SearchParams } from "@/lib/list-query";
import type { ApiCampaign } from "@/lib/sponsor-live";
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

   The "Needs your OK" 5th tab (P1-ART-23 Task 9: the dashboard's "Posts
   waiting for your OK" link lands here) sets ?review=1, which
   fetchCampaignPage forwards as the API's ?review=true. POL-FE-20: it is
   the ONLY thing here that waits on the sponsor — a post in SPONSOR_REVIEW.
   Its count is the API's ?review=true total (one minimal page read in
   liveSponsorCampaignPage); the tile "Needs your OK" shows only when that
   count is above zero and links straight to those campaigns, and on that
   tab each row says so and links to the campaign to approve the post.
   APPROVAL — fully staffed, launching by itself on its start date — reads
   "Ready to start", never "Needs your OK".

   LIVE vs DEMO. A signed-in sponsor sees their own campaigns. Anyone else,
   and ?demo=empty|loading|error, gets the fixture deck under a "Sample
   data" pill — the same components, the same layout.
   -------------------------------------------------------------------------- */

const PATH = "/sponsor/campaigns";
const SORT_WORDS: Record<(typeof CAMPAIGN_SORTS)[number], string> = { name: "Name A–Z", ending: "Ending soonest" };

const STATE_TABS = [
  { key: "all", label: "All", state: "" },
  { key: "running", label: "Running", state: "ACTIVE" },
  /* POL-FE-20 — APPROVAL waits for its start date, not for the sponsor. */
  { key: "approval", label: "Ready to start", state: "APPROVAL" },
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
        needsYou={live.needsYou}
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
  sp, filters, summary, requestsOpen, needsYou, rows, page, now, updatedAt, sample,
}: {
  sp: SearchParams;
  filters: { q: string; state: string; sort: string; review: string };
  summary: CampaignSummary;
  requestsOpen?: number;
  /** POL-FE-20 — campaigns with a post waiting for the sponsor's OK (the
   *  API's ?review=true total); undefined when that read wasn't made. */
  needsYou?: number;
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
          {/* POL-FE-20 — "Needs your OK" only when a post is waiting for the
              sponsor, and it links straight to those campaigns. Otherwise
              the tile is the honest one: fully staffed, starts by itself. */}
          {needsYou ? (
            <StadiumTile
              label="Needs your OK"
              value={needsYou}
              tone="you"
              href={tabHref(sp, "", "1")}
              caption={needsYou === 1 ? "campaign with a post to approve" : "campaigns with posts to approve"}
              hint="Campaigns where an athlete's post is waiting for your approval. Open one to approve it or ask for changes."
              delay={0.16}
            />
          ) : (
            <StadiumTile
              label="Ready to start"
              value={approval}
              href={tabHref(sp, "APPROVAL")}
              hint="Fully staffed campaigns. Each one starts by itself on its start date — nothing is waiting on you."
              delay={0.16}
            />
          )}
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
              caption={summary.contracted !== undefined ? `${formatCount(summary.contracted, "usd0")} agreed` : undefined}
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
        needsYou={needsYou}
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
  sp, filters, running, approval, needsYou, finished, rows, page, now, total,
}: {
  sp: SearchParams;
  filters: { q: string; state: string; sort: string; review: string };
  running: number;
  approval: number;
  needsYou?: number;
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
            <TabLink href={tabHref(sp, "", "1")} on={onReview} count={needsYou} hot>
              Needs your OK
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
        {/* On the "Needs your OK" tab every row has a post waiting, so each says so and links to it. */}
        <SponsorCampaignTable rows={rows} page={page} now={now} filtered={filtered} empty={empty} needsYou={onReview} />
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
