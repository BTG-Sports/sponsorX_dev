import Link from "next/link";
import type { ReactNode } from "react";

import { ListFilter, ListSearch, ServerList } from "@/components/server-pager";
import { SponsorCampaignTable } from "@/components/sponsor-campaign-table";
import { ColumnBars, DashCard, DashIcon, KpiCard, LedRing, LegendRow, SplitDonut, type DashIconName } from "@/components/stadium-dash";
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
  StadiumUpdated,
  at,
} from "@/components/stadium-stage";
import { StadiumTrend } from "@/components/stadium-trend";
import { demoState } from "@/lib/demo";
import { formatCount } from "@/lib/format-count";
import { DEMO_NOW, demoCampaignPage, demoOverview } from "@/lib/fixtures/sponsor-overview";
import { textParam, type PageInfo, type SearchParams } from "@/lib/list-query";
import { monogramOf, type ApiCampaign } from "@/lib/sponsor-live";
import { campaignMoney, emptyDashboardRows, needsYouItems, rangeParam, tickerFacts, type NeedsYouItem, type RangeKey, type SponsorOverview } from "@/lib/sponsor-overview-live";
import { FUNNEL_WORDS, campaignWord, compactNumber, delta } from "@/lib/sponsor-words";
import { CAMPAIGN_SORTS, CAMPAIGN_STATES } from "@/server/campaigns";
import { liveSponsorDashboard } from "@/server/sponsor";

/* --------------------------------------------------------------------------
   Sponsor Dashboard — §9 screen 3, on the Stadium Board (P1-ART-23).

   POL-FE-90 (2026-11-16) redraws it as a real dashboard grid, because the
   owner found the stacked panels hard to read. Every card now has an icon,
   a title and a one-line subtitle that says what it shows; the LED board
   look (stadium.css) is unchanged. Top to bottom:
     ticker → "Dashboard", Updated pill, period switch, the period in words
     → four number cards (reach, reactions, clicks, fans who redeemed)
     → the performance chart + "Your to-do"
     → posts delivered (LED ring) · money (donut) · fan journey (bars)
     → top athletes · top cities → the paged campaign list.

   Every number is the API's (memory: stats-must-be-retrievable):
     GET /sponsor/overview?range=   every card, the chart, the to-do list
     GET /campaigns?page&size&q&state&sort   the table (one server page)
   Nothing is summed from the rows on screen. Money is in cents, and a
   figure the role can't read is absent, never shown as zero.

   LIVE vs DEMO. A signed-in sponsor sees their own figures. Anyone else,
   and ?demo=empty|loading|error, gets the fixture deck under a "Sample
   data" pill — the same components, the same layout.
   -------------------------------------------------------------------------- */

const PATH = "/sponsor";
const PERIOD: Record<RangeKey, string> = { "7d": "vs the 7 days before", "30d": "vs the 30 days before", "90d": "vs the 90 days before", all: "" };
const PERIOD_WORDS: Record<RangeKey, ReactNode> = {
  "7d": <>Showing the <b>last 7 days</b>, compared with the 7 days before.</>,
  "30d": <>Showing the <b>last 30 days</b>, compared with the 30 days before.</>,
  "90d": <>Showing the <b>last 90 days</b>, compared with the 90 days before.</>,
  all: <>Showing <b>everything since your first campaign</b>.</>,
};
const SORT_WORDS: Record<(typeof CAMPAIGN_SORTS)[number], string> = { name: "Name A–Z", ending: "Ending soonest" };
const GREEN = "#3ddc97";
const ORANGE = "#f97a1f";
const RED = "#ff5a5f";
const DIM = "#4a3626";

export default async function SponsorDashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <StadiumGhost label="Loading your sponsorships" tiles={4} />;
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
    const waiting = emptyDashboardRows(o.needsYou, o.paymentsOpen);
    return (
      <div className="space-y-5">
        <StadiumHead title="Dashboard" pill={pill} actions={newRequest} />
        <div className="grid gap-4 lg:grid-cols-12">
          <DashCard icon="send" title="Start your first campaign" sub="Your numbers show up here as soon as one starts." className="lg:col-span-7" delay={0.08}>
            <ol className="space-y-3">
              {[
                ["Pick a package", "Browse what athletes offer and choose what fits."],
                ["Tell us what you're after", "Your goals, budget and timing — in your own words."],
                ["BTG matches you with athletes", "We check the fit and send you a proposal."],
              ].map(([t, s], i) => (
                <li key={t} className="flex gap-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full border border-sponsor/50 bg-sponsor/15 text-[12px] font-bold text-[color:var(--st-hot)]">{i + 1}</span>
                  <span>
                    <span className="block text-[13.5px] font-semibold text-text">{t}</span>
                    <span className="block text-[12px] text-muted">{s}</span>
                  </span>
                </li>
              ))}
            </ol>
            <Link href="/sponsor/marketplace" className="mt-5 inline-block rounded-md bg-primary px-4 py-2 text-xs font-semibold">
              Browse packages to start one →
            </Link>
          </DashCard>
          {/* POL-FE-71 — a Shop order to pay or a request with BTG, before any campaign exists. */}
          <ToDo items={waiting} className="lg:col-span-5" delay={0.14} emptyLine="Anything that needs your OK or a payment will show up here." />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {o && <StadiumTicker facts={tickerFacts(o)} />}

      <StadiumHead
        title="Dashboard"
        pill={pill}
        actions={
          <>
            <StadiumRange current={range} path={PATH} params={sp} />
            {newRequest}
          </>
        }
      />
      {o && (
        <p className="sx-dash-period sx-stadium-in -mt-2" style={at(0.06)}>
          {PERIOD_WORDS[range]}{" "}
          {o.campaigns.running > 0 && (
            <>
              You have <b>{o.campaigns.running.toLocaleString("en-US")} {o.campaigns.running === 1 ? "campaign" : "campaigns"} running</b> out of {o.campaigns.total.toLocaleString("en-US")}.
            </>
          )}
        </p>
      )}

      {o ? (
        <>
          <Kpis o={o} range={range} />

          <div className="grid gap-4 lg:grid-cols-12">
            <DashCard
              icon="chart"
              title="How your campaigns are doing"
              sub={`${o.range.bucket === "week" ? "Week by week" : "Day by day"} over this period. Pick a number to see it on the chart.`}
              className="lg:col-span-8"
              delay={0.3}
            >
              <StadiumTrend points={o.daily} bucket={o.range.bucket} dash />
            </DashCard>
            <ToDo items={toDoItems(o)} className="lg:col-span-4" delay={0.36} emptyLine="Anything that needs your OK or a payment will show up here." />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Delivered o={o} />
            <Money o={o} />
            <FanJourney o={o} />
          </div>

          <div className="grid gap-4 lg:grid-cols-12">
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

      <Campaigns rows={rows} page={page} filters={filters} now={now} total={o?.campaigns.total} running={o?.campaigns.running} />
    </div>
  );
}

/* ---------------------------------------------------------- number cards */

function Kpis({ o, range }: { o: SponsorOverview; range: RangeKey }) {
  const series = (k: "views" | "clicks" | "redeems") => o.daily.map((d) => d[k]);
  const views = o.reach.verifiedViews;
  const per = PERIOD[range];
  const rate = views > 0 ? o.reach.verifiedEngagements / views : 0;
  return (
    <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        icon="eye"
        label="People reached"
        sub="Saw your sponsored posts"
        value={views}
        delta={delta(views, o.reach.prev?.verifiedViews)}
        deltaLabel={per}
        spark={series("views")}
        foot={o.reach.otherViews > 0 ? `+${o.reach.otherViews.toLocaleString("en-US")} more reported by the athletes themselves` : undefined}
        hint="Counted by the platform or checked by BTG. Numbers the athletes reported themselves are shown separately."
        delay={0.1}
      />
      <KpiCard
        icon="heart"
        label="Likes, comments & shares"
        sub="How often people reacted"
        value={o.reach.verifiedEngagements}
        delta={delta(o.reach.verifiedEngagements, o.reach.prev?.verifiedEngagements)}
        deltaLabel={per}
        side={
          <LedRing value={rate} size={64} segments={20} label={`${(rate * 100).toFixed(1)}% of people reached reacted`}>
            <span className="block text-[12px] font-bold tabular-nums text-text">{views > 0 ? `${(rate * 100).toFixed(1)}%` : "—"}</span>
          </LedRing>
        }
        foot={views > 0 ? `${(rate * 100).toFixed(1)}% of the people reached reacted` : "Shows once your posts reach people"}
        delay={0.16}
      />
      <KpiCard
        icon="click"
        label="Link clicks"
        sub="Taps on your links in the posts"
        value={o.clicks.total}
        delta={delta(o.clicks.total, o.clicks.prev)}
        deltaLabel={per}
        spark={series("clicks")}
        delay={0.22}
      />
      <KpiCard
        icon="qr"
        label="Fans who redeemed"
        sub="Used your QR code offer"
        value={o.fans.redeem}
        delta={delta(o.fans.redeem, o.fans.prevRedeem)}
        deltaLabel={per}
        spark={series("redeems")}
        delay={0.28}
      />
    </dl>
  );
}

/* ----------------------------------------------------------------- to-do */

const TODO_ICON: Record<string, DashIconName> = { posts: "posts", orders: "card", invoices: "money", requests: "inbox" };

/** The to-do rows: what waits on the sponsor, plus requests with BTG as information. */
function toDoItems(o: SponsorOverview): NeedsYouItem[] {
  const items = needsYouItems(o.needsYou, o.paymentsOpen);
  if (o.needsYou.requestsInReview) {
    items.push({
      key: "requests",
      title: "Requests with BTG",
      sub: "BTG is reviewing them — nothing to do yet",
      count: o.needsYou.requestsInReview,
      href: "/sponsor/requests",
    });
  }
  return items;
}

function ToDo({ items, className = "", delay, emptyLine }: { items: NeedsYouItem[]; className?: string; delay: number; emptyLine: string }) {
  /* "orders" while payment is closed and "requests" are information, not the sponsor's move. */
  const yours = (it: NeedsYouItem) => it.count > 0 && it.key !== "requests" && !(it.key === "orders" && it.sub.startsWith("Card payment isn't open"));
  const open = items.filter(yours).reduce((n, it) => n + it.count, 0);
  const shown = items.filter((it) => it.count > 0);
  return (
    <DashCard
      icon="todo"
      title="Your to-do"
      sub={open > 0 ? `${open.toLocaleString("en-US")} ${open === 1 ? "thing is" : "things are"} waiting on you` : "Nothing is waiting on you"}
      tone={open > 0 ? "you" : undefined}
      className={className}
      delay={delay}
      flush
      action={open > 0 ? <StadiumBadge count={open} /> : undefined}
    >
      {shown.length > 0 ? (
        <div className="pb-1">
          {shown.map((it, i) => (
            <StadiumRow
              key={it.key}
              href={it.href}
              i={i}
              plainLead
              lead={<DashIcon name={TODO_ICON[it.key] ?? "flag"} size={34} tone={yours(it) ? "st" : "dim"} />}
              title={it.title}
              sub={it.sub}
              right={yours(it) ? <StadiumBadge count={it.count} /> : <span className="text-[12px] font-semibold tabular-nums text-muted">{it.count}</span>}
            />
          ))}
        </div>
      ) : null}
      {open === 0 && (
        <div className="flex items-center gap-3 px-5 pb-4 pt-1">
          <span className="sx-dash-done" aria-hidden="true">
            ✓
          </span>
          <span>
            <span className="block text-[13.5px] font-semibold text-success">You&rsquo;re all caught up</span>
            <span className="block text-[12px] text-muted">{emptyLine}</span>
          </span>
        </div>
      )}
      <nav aria-label="Shortcuts" className="mt-auto grid grid-cols-2 gap-2 border-t border-line-soft px-5 pb-5 pt-4">
        {SHORTCUTS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="flex items-center gap-2 rounded-md border border-[color:var(--st-line)] bg-[#120c07] px-2.5 py-2 text-[12px] text-muted transition-colors hover:border-sponsor/60 hover:text-text"
          >
            <DashIcon name={l.icon} size={24} tone="dim" />
            {l.label}
          </Link>
        ))}
      </nav>
    </DashCard>
  );
}

const SHORTCUTS: { href: string; label: string; icon: DashIconName }[] = [
  { href: "/sponsor/marketplace", label: "Packages", icon: "star" },
  { href: "/sponsor/requests", label: "Requests", icon: "inbox" },
  { href: "/sponsor/orders", label: "Orders", icon: "card" },
  { href: "/sponsor/invoices", label: "Billing", icon: "money" },
];

/* --------------------------------------------- delivered · money · fans */

function Quiet({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm leading-relaxed text-muted">{children}</p>;
}

function Delivered({ o }: { o: SponsorOverview }) {
  const d = o.delivery;
  const upcoming = Math.max(0, d.due - d.delivered - d.late);
  const share = d.due ? d.delivered / d.due : 0;
  return (
    <DashCard
      icon="posts"
      title="Posts delivered"
      sub="Posts the athletes have put up, out of all your campaigns include · all time"
      tone={d.late ? "late" : undefined}
      delay={0.44}
    >
      {d.due === 0 ? (
        <Quiet>No posts planned yet. They show here once athletes join your campaigns.</Quiet>
      ) : (
        <div className="flex flex-wrap items-center gap-5">
          <LedRing value={share} size={136} label={`${d.delivered} of ${d.due} posts delivered`}>
            <span className="sx-stadium-num block text-[30px] leading-none">{Math.round(share * 100)}%</span>
            <span className="mt-1 block text-[11px] text-muted">
              {d.delivered.toLocaleString("en-US")} of {d.due.toLocaleString("en-US")}
            </span>
          </LedRing>
          <div className="min-w-[9rem] flex-1">
            <LegendRow color={ORANGE} name="Delivered" value={d.delivered.toLocaleString("en-US")} />
            <LegendRow color={d.late ? RED : DIM} name="Late" value={d.late.toLocaleString("en-US")} />
            <LegendRow color={DIM} name="Still to come" value={upcoming.toLocaleString("en-US")} />
            <p className="mt-2 border-t border-line-soft pt-2 text-[11.5px] text-faint">
              {d.nextDueAt ? (
                <>
                  Next one due <StadiumDate iso={d.nextDueAt} format="weekday" utc />
                </>
              ) : (
                "Nothing else due"
              )}
            </p>
          </div>
        </div>
      )}
    </DashCard>
  );
}

function Money({ o }: { o: SponsorOverview }) {
  const money = campaignMoney(o.money);
  const cpm =
    o.costPer1000Cents !== null ? (
      <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-[color:var(--st-line)] bg-[#120c07] px-3 py-2.5">
        <span className="min-w-0">
          <span className="block text-[12px] font-semibold text-text">Cost per 1,000 people reached</span>
          <span className="block text-[11px] text-faint">What you agreed to spend ÷ people reached · lower is better</span>
        </span>
        <span className="sx-stadium-num shrink-0 text-[18px]">{formatCount(o.costPer1000Cents, "usd")}</span>
      </div>
    ) : null;
  return (
    <DashCard icon="money" title="Money" sub="What BTG has billed you, and how much is paid · all time" delay={0.5}>
      {!o.money ? (
        <Quiet>Your login doesn&rsquo;t include spending. Ask the person who runs your account for access.</Quiet>
      ) : money ? (
        <>
          <div className="flex flex-wrap items-center gap-5">
            <SplitDonut
              label={`${formatCount(money.paidCents, "usd0")} paid and ${formatCount(money.owedCents, "usd0")} still to pay, of ${formatCount(money.invoicedCents, "usd0")} billed`}
              parts={[
                { label: "Paid", value: money.paidCents, color: GREEN },
                { label: "Still to pay", value: money.owedCents, color: ORANGE },
              ]}
            >
              <span className="sx-stadium-num block text-[20px] leading-none">{formatCount(money.invoicedCents, "usd0")}</span>
              <span className="mt-1 block text-[11px] text-muted">billed</span>
            </SplitDonut>
            <div className="min-w-[9rem] flex-1">
              <LegendRow color={GREEN} name="Paid" value={formatCount(money.paidCents, "usd0")} />
              <LegendRow color={ORANGE} name="Still to pay" value={formatCount(money.owedCents, "usd0")} href={money.owedCents > 0 ? "/sponsor/invoices" : undefined} />
              <LegendRow color={DIM} name="Agreed in total" value={formatCount(o.money.contractedCents, "usd0")} />
            </div>
          </div>
          {cpm}
        </>
      ) : (
        <>
          <p className="text-[12px] text-muted">Agreed in total</p>
          <p className="sx-stadium-num text-[30px] leading-tight">{formatCount(o.money.contractedCents, "usd0")}</p>
          {cpm ?? <p className="mt-3 text-[12px] text-faint">Cost per 1,000 people reached shows once checked reach is in.</p>}
        </>
      )}
    </DashCard>
  );
}

function FanJourney({ o }: { o: SponsorOverview }) {
  const f = o.fans;
  const none = f.scan + f.landing + f.claim + f.redeem === 0;
  return (
    <DashCard
      icon="funnel"
      title="Fan journey"
      sub="What fans did with your QR offer, step by step"
      hint="Scanned: fans who scanned your QR code. Opened: opened the offer. Claimed: saved it. Redeemed: used it."
      delay={0.56}
      className="md:col-span-2 xl:col-span-1"
    >
      {none ? (
        <Quiet>No QR scans in this period yet. They show here once fans scan your code at an event.</Quiet>
      ) : (
        <>
          <ColumnBars
            label="Fan journey"
            bars={[
              { label: FUNNEL_WORDS.scan, value: f.scan },
              { label: FUNNEL_WORDS.landing, value: f.landing },
              { label: FUNNEL_WORDS.claim, value: f.claim },
              { label: FUNNEL_WORDS.redeem, value: f.redeem, lit: true },
            ]}
          />
          <p className="mt-3 text-[11.5px] text-faint">
            {f.scan > 0 && f.redeem <= f.scan
              ? `${Math.round((f.redeem / f.scan) * 100)}% of fans who scanned went on to redeem.`
              : "Some fans redeemed at the booth without scanning first."}
          </p>
        </>
      )}
    </DashCard>
  );
}

/* ---------------------------------------------------- athletes · cities */

function TopAthletes({ o }: { o: SponsorOverview }) {
  const max = Math.max(1, ...o.topAthletes.map((a) => a.views));
  return (
    <DashCard icon="star" title="Your top athletes" sub="Whose posts for you reached the most people in this period" className="lg:col-span-7" delay={0.62} flush>
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
              sub={
                <span className="flex items-center gap-2">
                  <span className="shrink-0">{[`No. ${i + 1}`, a.sport].filter(Boolean).join(" · ")}</span>
                  <span className="hidden max-w-[10rem] flex-1 sm:block">
                    <StadiumBar value={a.views / max} delay={0.7 + i * 0.05} />
                  </span>
                </span>
              }
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
    </DashCard>
  );
}

function Cities({ o }: { o: SponsorOverview }) {
  const max = Math.max(1, ...o.topCities.map((c) => c.redeems));
  return (
    <DashCard icon="pin" title="Where fans redeemed" sub="Cities where the most fans used your offer in this period" className="lg:col-span-5" delay={0.68}>
      {o.topCities.length === 0 ? (
        <Quiet>No redemptions with a city yet. Cities show here once fans use your offer at events.</Quiet>
      ) : (
        <ol className="space-y-3">
          {o.topCities.map((c, i) => (
            <li key={`${c.city}|${c.region ?? ""}`}>
              <span className="flex items-baseline justify-between gap-3 text-[12.5px]">
                <span className="truncate text-text">
                  <span className="mr-2 text-faint">{i + 1}</span>
                  {c.region ? `${c.city}, ${c.region}` : c.city}
                </span>
                <span className="shrink-0 font-bold tabular-nums text-text">{c.redeems.toLocaleString("en-US")}</span>
              </span>
              <span className="mt-1.5 block">
                <StadiumBar value={c.redeems / max} delay={0.75 + i * 0.05} />
              </span>
            </li>
          ))}
        </ol>
      )}
    </DashCard>
  );
}

/* ------------------------------------------------------------ campaigns */

function Campaigns({
  rows, page, filters, now, total, running,
}: {
  rows: ApiCampaign[];
  page: PageInfo;
  filters: { q: string; state: string; sort: string };
  now: Date;
  total?: number;
  running?: number;
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
    <DashCard
      id="sx-your-campaigns"
      icon="list"
      title="Your campaigns"
      sub={
        total !== undefined
          ? `${total.toLocaleString("en-US")} in all${running ? ` · ${running.toLocaleString("en-US")} running` : ""} · open one to see its results`
          : "Open one to see its results"
      }
      delay={0.74}
    >
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
    </DashCard>
  );
}
