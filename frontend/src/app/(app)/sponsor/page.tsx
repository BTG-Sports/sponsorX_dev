import Link from "next/link";
import type { ReactNode } from "react";

import { FunnelSteps, HBarList } from "@/components/charts";
import { ArenaCount } from "@/components/arena-fx";
import { ListFilter, ListSearch, ServerList } from "@/components/server-pager";
import { SponsorCampaignTable } from "@/components/sponsor-campaign-table";
import { StadiumHint } from "@/components/stadium-hint";
import {
  StadiumBadge,
  StadiumBar,
  StadiumDate,
  StadiumGhost,
  StadiumHead,
  StadiumPanel,
  StadiumRange,
  StadiumRow,
  StadiumTicker,
  StadiumTile,
  StadiumTiles,
  StadiumUpdated,
  at,
} from "@/components/stadium-stage";
import { StadiumTrend } from "@/components/stadium-trend";
import { demoState } from "@/lib/demo";
import { formatCount } from "@/lib/format-count";
import { DEMO_NOW, demoCampaignPage, demoOverview } from "@/lib/fixtures/sponsor-overview";
import { textParam, type PageInfo, type SearchParams } from "@/lib/list-query";
import { monogramOf, type ApiCampaign } from "@/lib/sponsor-live";
import { campaignMoney, rangeParam, tickerFacts, type RangeKey, type SponsorOverview } from "@/lib/sponsor-overview-live";
import { FUNNEL_WORDS, campaignWord, compactNumber, delta } from "@/lib/sponsor-words";
import { CAMPAIGN_SORTS, CAMPAIGN_STATES } from "@/server/campaigns";
import { liveSponsorDashboard } from "@/server/sponsor";

/* --------------------------------------------------------------------------
   Sponsor Dashboard — §9 screen 3, on the Stadium Board (P1-ART-23, spec
   2026-10-11 §7.1). Statistics first, in plain words, for a sponsor who is
   not technical: ticker → title, "Updated" pill, period switch → five
   tiles → trend + "Needs you" → fan journey, cost per 1,000, posts
   delivered → top athletes, cities → the paged campaign list.

   Every number is the API's (memory: stats-must-be-retrievable):
     GET /sponsor/overview?range=   every tile, the trend, needs-you, the
                                    funnel, delivery, athletes, cities
     GET /campaigns?page&size&q&state&sort   the table (one server page)
   Nothing is summed from the rows on screen. Money is in cents, and a
   figure the role can't read is absent, never shown as zero.

   LIVE vs DEMO. A signed-in sponsor sees their own figures. Anyone else,
   and ?demo=empty|loading|error, gets the fixture deck under a "Sample
   data" pill — the same components, the same layout.
   -------------------------------------------------------------------------- */

const PATH = "/sponsor";
const PERIOD: Record<RangeKey, string> = { "7d": "vs the 7 days before", "30d": "vs the 30 days before", "90d": "vs the 90 days before", all: "" };
const SORT_WORDS: Record<(typeof CAMPAIGN_SORTS)[number], string> = { name: "Name A–Z", ending: "Ending soonest" };

export default async function SponsorDashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <StadiumGhost label="Loading your sponsorships" tiles={5} />;
  if (demo === "error") throw new Error("Demo error state");

  const sp = await searchParams;
  const range = rangeParam(sp);
  const filters = {
    q: textParam(sp, "q"),
    state: textParam(sp, "state", CAMPAIGN_STATES),
    sort: textParam(sp, "sort", CAMPAIGN_SORTS),
  };

  const live = demo === null ? await liveSponsorDashboard(sp, range) : null;
  if (live) {
    return <Dashboard sp={sp} range={range} filters={filters} overview={live.overview} rows={live.rows} page={live.page} now={new Date()} sample={false} />;
  }

  const empty = demo === "empty";
  const list = empty ? { campaigns: [], page: { page: 1, size: 12, total: 0, pages: 1 } } : demoCampaignPage(sp, filters);
  const overview = demoOverview(range);
  return (
    <Dashboard
      sp={sp}
      range={range}
      filters={filters}
      overview={empty ? { ...overview, campaigns: { total: 0, running: 0 } } : overview}
      rows={list.campaigns}
      page={list.page}
      now={DEMO_NOW}
      sample
    />
  );
}

/* ------------------------------------------------------------- the page */

function Dashboard({
  sp, range, filters, overview: o, rows, page, now, sample,
}: {
  sp: SearchParams;
  range: RangeKey;
  filters: { q: string; state: string; sort: string };
  overview: SponsorOverview | null;
  rows: ApiCampaign[];
  page: PageInfo;
  now: Date;
  sample: boolean;
}) {
  const pill = sample ? "Sample data" : o ? <StadiumUpdated iso={o.readAt} /> : undefined;
  const newRequest = (
    <Link href="/sponsor/marketplace" className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold">
      + New request
    </Link>
  );

  /* A brand-new sponsor: no campaign yet — the next step, not a wall of zeros. */
  if (o && o.campaigns.total === 0) {
    return (
      <div className="space-y-6">
        <StadiumHead title="Your sponsorships" pill={pill} actions={newRequest} />
        <StadiumPanel delay={0.1} className="text-center">
          <p className="text-base font-semibold text-text">No campaigns yet</p>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">
            Pick a package, tell us what you&rsquo;re after, and BTG will match you with athletes. Your numbers show up here as soon as your first campaign starts.
          </p>
          <Link href="/sponsor/marketplace" className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-xs font-semibold">
            Browse packages to start one →
          </Link>
        </StadiumPanel>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {o && <StadiumTicker facts={tickerFacts(o)} />}

      <StadiumHead
        title="Your sponsorships"
        pill={pill}
        actions={
          <>
            <StadiumRange current={range} path={PATH} params={sp} />
            {newRequest}
          </>
        }
      >
        {o && <Tiles o={o} range={range} />}
      </StadiumHead>

      {o ? (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <StadiumPanel delay={0.4} className="min-w-0 lg:col-span-2">
              <StadiumTrend points={o.daily} bucket={o.range.bucket} />
            </StadiumPanel>
            <NeedsYou o={o} />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Funnel o={o} />
            <CostPer1000 o={o} />
            <Delivered o={o} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <TopAthletes o={o} />
            <Cities o={o} />
          </div>
        </>
      ) : (
        <StadiumPanel delay={0.1}>
          <p className="text-sm text-muted">
            Your login can see your campaigns but not their results. Ask the person who runs your account to give you access to the numbers.
          </p>
        </StadiumPanel>
      )}

      <Campaigns rows={rows} page={page} filters={filters} now={now} total={o?.campaigns.total} />
    </div>
  );
}

/* ---------------------------------------------------------------- tiles */

function Tiles({ o, range }: { o: SponsorOverview; range: RangeKey }) {
  const last14 = (k: "views" | "clicks" | "redeems") => o.daily.slice(-14).map((d) => d[k]);
  const views = o.reach.verifiedViews;
  const money = campaignMoney(o.money);
  const per = PERIOD[range];
  return (
    <StadiumTiles cols={5}>
      <StadiumTile
        label="People reached"
        value={views}
        delta={delta(views, o.reach.prev?.verifiedViews)}
        deltaLabel={per}
        spark={last14("views")}
        caption={o.reach.otherViews > 0 ? `+${o.reach.otherViews.toLocaleString("en-US")} more reported by athletes` : undefined}
        hint="People who saw your sponsored posts, counted by the platform or checked by BTG. Numbers the athletes reported themselves are shown separately."
        delay={0.1}
      />
      <StadiumTile
        label="Likes, comments & shares"
        value={o.reach.verifiedEngagements}
        delta={delta(o.reach.verifiedEngagements, o.reach.prev?.verifiedEngagements)}
        deltaLabel={per}
        caption={views > 0 ? `${((o.reach.verifiedEngagements / views) * 100).toFixed(1)}% of people reached` : undefined}
        hint="How many times people reacted to your posts."
        delay={0.16}
      />
      <StadiumTile
        label="Link clicks"
        value={o.clicks.total}
        delta={delta(o.clicks.total, o.clicks.prev)}
        deltaLabel={per}
        spark={last14("clicks")}
        hint="Taps on your tracked links in the athletes' posts."
        delay={0.22}
      />
      <StadiumTile
        label="Fans who redeemed"
        value={o.fans.redeem}
        delta={delta(o.fans.redeem, o.fans.prevRedeem)}
        deltaLabel={per}
        spark={last14("redeems")}
        hint="Fans who scanned your QR code and used your offer."
        delay={0.28}
      />
      {money ? (
        <StadiumTile
          label="Money spent"
          value={money.invoicedCents}
          format="usd0"
          share={money.share}
          caption={money.invoicedCents ? `All time · ${formatCount(money.paidCents, "usd0")} paid · ${formatCount(money.owedCents, "usd0")} still to pay` : "No invoices yet · all time"}
          hint="What you've been invoiced so far (all time, not just this period), and how much of it is paid."
          delay={0.34}
        />
      ) : (
        <StadiumTile
          label="Posts delivered"
          value={o.delivery.delivered}
          share={o.delivery.due ? o.delivery.delivered / o.delivery.due : 0}
          caption={o.delivery.due ? `of ${o.delivery.due.toLocaleString("en-US")} planned` : "None planned yet"}
          hint="Posts the athletes have put up, out of every post your campaigns include (all time)."
          tone={o.delivery.late ? "late" : undefined}
          delay={0.34}
        />
      )}
    </StadiumTiles>
  );
}

/* --------------------------------------------------------- panel helpers */

function Title({ children, hint, note }: { children: string; hint?: string; note?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
      <h2 className="sx-section-title">{children}</h2>
      {hint && <StadiumHint label={children} text={hint} />}
      {note && <span className="ml-auto text-[11px] text-faint">{note}</span>}
    </div>
  );
}

function Quiet({ children }: { children: ReactNode }) {
  return <p className="py-4 text-sm leading-relaxed text-muted">{children}</p>;
}

/* ------------------------------------------------------------- needs you */

function NeedsYou({ o }: { o: SponsorOverview }) {
  const n = o.needsYou;
  const items = [
    { key: "posts", title: "Posts waiting for your OK", sub: "Open a running campaign to look at them", count: n.postsToReview, href: "/sponsor/campaigns?review=1" },
    { key: "orders", title: "Orders to pay", sub: "Approved and ready for payment", count: n.ordersToPay, href: "/sponsor/orders?tab=to_pay" },
    ...(n.invoicesUnpaid !== undefined ? [{ key: "invoices", title: "Invoices to pay", sub: "Sent to you by BTG", count: n.invoicesUnpaid, href: undefined }] : []),
  ];
  const waiting = items.some((i) => i.count > 0);
  return (
    <StadiumPanel flush delay={0.46} tone={waiting ? "you" : undefined} className="min-w-0">
      <div className="px-5 pt-5">
        <Title hint="Things that can't move until you do something.">Needs you</Title>
      </div>
      {waiting ? (
        <div className="pb-1">
          {items.map((it, i) => (
            <StadiumRow key={it.key} href={it.href} title={it.title} sub={it.sub} right={<StadiumBadge count={it.count} />} i={i} />
          ))}
        </div>
      ) : (
        <div className="px-5 pb-5">
          <p className="text-base font-semibold text-success">You&rsquo;re all caught up ✓</p>
          <p className="mt-1 text-xs text-muted">Anything that needs your OK or a payment will show up here.</p>
        </div>
      )}
    </StadiumPanel>
  );
}

/* ------------------------------------------------- funnel · cost · posts */

function Funnel({ o }: { o: SponsorOverview }) {
  const f = o.fans;
  return (
    <StadiumPanel delay={0.52} className="min-w-0">
      <Title hint="Every step a fan takes with your offer: scanning your QR code, opening the offer, claiming it, then using it.">From scan to redeemed</Title>
      {f.scan + f.landing + f.claim + f.redeem === 0 ? (
        <Quiet>No QR scans in this period yet. They show here once fans scan your code at an event.</Quiet>
      ) : (
        <FunnelSteps
          stages={[
            { label: FUNNEL_WORDS.scan, value: f.scan },
            { label: FUNNEL_WORDS.landing, value: f.landing },
            { label: FUNNEL_WORDS.claim, value: f.claim },
            { label: FUNNEL_WORDS.redeem, value: f.redeem },
          ]}
        />
      )}
    </StadiumPanel>
  );
}

function CostPer1000({ o }: { o: SponsorOverview }) {
  return (
    <StadiumPanel delay={0.58} className="min-w-0">
      <Title
        hint="What you've agreed to spend, divided by the people your posts have reached, times 1,000. Lower is better value. Counted over all time, not just this period."
        note="All time"
      >
        What you pay per 1,000 people reached
      </Title>
      {o.costPer1000Cents !== null ? (
        <>
          <ArenaCount value={o.costPer1000Cents} format="usd" delay={0.58} className="sx-stadium-num block text-[34px] leading-tight" />
          <p className="mt-1.5 text-[11.5px] text-faint">Based on your agreed spend and the people reached so far</p>
        </>
      ) : (
        <Quiet>{o.money ? "Shows once checked reach is in." : "Your login doesn't include spending, so this can't be worked out here."}</Quiet>
      )}
    </StadiumPanel>
  );
}

function Delivered({ o }: { o: SponsorOverview }) {
  const d = o.delivery;
  const next = d.nextDueAt ? (
    <>
      next one due <StadiumDate iso={d.nextDueAt} format="weekday" utc />
    </>
  ) : (
    "nothing else due"
  );
  return (
    <StadiumPanel delay={0.64} tone={d.late ? "late" : undefined} className="min-w-0">
      <Title hint="Posts the athletes have put up, out of every post your campaigns include. Late means its due date has passed." note="All time">
        Posts delivered
      </Title>
      {d.due === 0 ? (
        <Quiet>No posts planned yet. They show here once athletes join your campaigns.</Quiet>
      ) : (
        <>
          <p className="sx-stadium-num text-[34px] leading-tight">
            {d.delivered.toLocaleString("en-US")} <span className="text-base font-medium text-muted">of {d.due.toLocaleString("en-US")}</span>
          </p>
          <span className="mt-3 block">
            <StadiumBar value={d.delivered / d.due} delay={0.8} />
          </span>
          <p className="mt-2 text-[11.5px] text-faint">
            {d.late ? <span className="text-danger">{d.late} late</span> : "None late"} · {next}
          </p>
        </>
      )}
    </StadiumPanel>
  );
}

/* ---------------------------------------------------- athletes · cities */

function TopAthletes({ o }: { o: SponsorOverview }) {
  return (
    <StadiumPanel flush delay={0.7} className="min-w-0">
      <div className="px-5 pt-5">
        <Title hint="The athletes whose posts for you reached the most people in this period, counting checked figures only.">Your top athletes</Title>
      </div>
      {o.topAthletes.length === 0 ? (
        <div className="px-5 pb-3">
          <Quiet>No checked reach in this period yet. Athletes show here once their posts for you are counted.</Quiet>
        </div>
      ) : (
        <div className="pb-1">
          {o.topAthletes.map((a, i) => (
            <StadiumRow
              key={a.athleteId}
              i={i}
              lead={monogramOf(a.name)}
              title={a.name}
              sub={[`No. ${i + 1}`, a.sport].filter(Boolean).join(" · ")}
              right={
                <span className="block">
                  <span className="block text-[13px] font-bold tabular-nums text-text">{compactNumber(a.views)}</span>
                  <span className="block text-[11px] text-muted">people reached</span>
                </span>
              }
            />
          ))}
        </div>
      )}
    </StadiumPanel>
  );
}

function Cities({ o }: { o: SponsorOverview }) {
  return (
    <StadiumPanel delay={0.76} className="min-w-0">
      <Title hint="The cities where the most fans used your offer in this period.">Where fans redeemed</Title>
      {o.topCities.length === 0 ? (
        <Quiet>No redemptions with a city yet. Cities show here once fans use your offer at events.</Quiet>
      ) : (
        <HBarList
          rows={o.topCities.map((c) => ({
            id: `${c.city}|${c.region ?? ""}`,
            label: c.region ? `${c.city}, ${c.region}` : c.city,
            value: c.redeems,
            display: `${c.redeems.toLocaleString("en-US")} redeemed`,
          }))}
        />
      )}
    </StadiumPanel>
  );
}

/* ------------------------------------------------------------ campaigns */

function Campaigns({
  rows, page, filters, now, total,
}: {
  rows: ApiCampaign[];
  page: PageInfo;
  filters: { q: string; state: string; sort: string };
  now: Date;
  total?: number;
}) {
  const filtered = Boolean(filters.q || filters.state);
  const outOfRange = page.page > page.pages;
  const empty: ReactNode = outOfRange ? (
    "No campaigns on this page. Go back to the first page to see them."
  ) : filtered ? (
    "No campaigns match. Clear the search or filter."
  ) : total === 0 ? (
    <>
      No campaigns yet.{" "}
      <Link href="/sponsor/marketplace" className="font-medium text-sponsor hover:underline">
        Browse packages to start one →
      </Link>
    </>
  ) : (
    "No campaigns match. Clear the search or filter."
  );
  return (
    <section className="sx-stadium-in min-w-0" style={at(0.82)} aria-labelledby="sx-your-campaigns">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="sx-your-campaigns" className="sx-section-title">Your campaigns</h2>
        {total !== undefined && <span className="text-xs text-muted">{total.toLocaleString("en-US")} in all</span>}
      </div>
      <ServerList>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="w-full sm:w-64">
            <ListSearch initial={filters.q} label="Search your campaigns" placeholder="Search by campaign name" tone="sponsor" />
          </div>
          <ListFilter
            param="state"
            value={filters.state}
            label="Status"
            allLabel="Any status"
            options={CAMPAIGN_STATES.map((s) => ({ value: s, label: campaignWord(s).text }))}
            tone="sponsor"
          />
          <ListFilter
            param="sort"
            value={filters.sort}
            label="Order"
            allLabel="Newest first"
            options={CAMPAIGN_SORTS.map((s) => ({ value: s, label: SORT_WORDS[s] }))}
            tone="sponsor"
          />
        </div>
        <SponsorCampaignTable rows={rows} page={page} now={now} filtered={filtered} empty={empty} />
      </ServerList>
    </section>
  );
}
