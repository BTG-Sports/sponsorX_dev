import Link from "next/link";
import type { CSSProperties } from "react";

import { ActionRing } from "@/components/ops-stage";
import { OpsActivityChart } from "@/components/ops-activity-chart";
import { OpsFanSlot, OpsPendingScope, OpsPeriodSwitch } from "@/components/ops-pending";
import { SkBars, SkChart, SkKpi, SkPeriodLine } from "@/components/ops-skeleton";
import {
  OpsCard,
  OpsColumns,
  OpsDonut,
  OpsGauge,
  OpsKpi,
  OpsLegend,
  OpsLink,
  OpsStat,
  SERIES,
} from "@/components/ops-dash";
import {
  BOARD_REVIEWS,
  QUEUE_TONE,
  campaignLines,
  deskPath,
  healthRows,
  queueCards,
  queuesWaiting,
  reviewLines,
  type ApiDeliveryHealth,
  type ApiIntegrationHealth,
  type ApiQueues,
  type ApiReviewRow,
  type HealthRow,
} from "@/lib/ops-board-live";
import {
  DEFAULT_PERIOD,
  PERIODS,
  activityPoints,
  athleteSplit,
  change,
  deliverySummary,
  dollars,
  parsePeriod,
  pct,
  periodWords,
  todoRows,
  type NetworkRead,
} from "@/lib/ops-dash";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";
import { mayUse } from "@/lib/admin-access";

import "./dash.css";

/* --------------------------------------------------------------------------
   The admin dashboard — P7-FE-06 (§23), redrawn as a card grid for
   POL-FE-105 (2026-11-17). The owner found the old board (a hero ring,
   then up to 22 equal queue cards, then three lists) "so confusing for a
   human" and asked for a dashboard like their reference screenshots: KPI
   cards across the top, one big chart beside a to-do list, then gauge,
   bar and donut cards, then tables. The Mission Control stage stays.

   Every card has an icon, a title and one plain line saying what it shows
   and for when. Every figure is a live read; a card whose read the role
   can't make (403) is left out and named in one quiet line at the foot.
   Anything else non-OK throws to the error page — an outage never shows
   as stale or sample figures.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

async function read<T>(path: string): Promise<T | null> {
  const res = await apiFetch(path);
  if (res.status === 403) return null;
  if (!res.ok) throw new Error(`${path} unavailable (${res.status}).`);
  return (await res.json()) as T;
}

type Analytics = {
  days: number;
  from: string;
  to: string;
  funnel: { SCAN: number; LANDING: number; CLAIM: number; REDEEM: number };
  previous: { SCAN: number; LANDING: number; CLAIM: number; REDEEM: number };
  series: { day: string; CLAIM: number; REDEEM: number }[];
};

/** Delivery is summed over this many live campaigns (the API's largest page). */
const DELIVERY_READ = 100;
/** Rows in the Live campaigns table; the rest are on the Campaigns desk. */
const TABLE_ROWS = 6;

/* POL-FE-23 — BTG's own review queue (the desk's "review" tab, minus the
   sponsor's turn), longest wait first. */
const REVIEW_QUERY = "/deliverables?state=DRAFT_SUBMITTED,BTG_REVIEW&systemReturned=exclude&sort=waiting&page=1&size=12";

const at = (s: number) => ({ "--sx-reveal-delay": `${s}s` }) as CSSProperties;

export default async function AdminDashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePortalAccess("admin");
  const days = parsePeriod((await searchParams).days);

  const [board, delivery, health, reviews, analytics, network] = await Promise.all([
    read<{ queues: ApiQueues }>("/operations/board"),
    read<{ campaigns: ApiDeliveryHealth[]; page: { total: number } }>(`/operations/delivery-health?page=1&size=${DELIVERY_READ}`),
    read<ApiIntegrationHealth>("/operations/integration-health"),
    /* Only a role whose desk it is — the link must land on a page that is theirs. */
    mayUse("/admin/approvals", actor.roles)
      ? read<{ deliverables: ApiReviewRow[]; page: { total: number } }>(REVIEW_QUERY)
      : Promise.resolve(null),
    read<Analytics>(`/operations/analytics?days=${days}`),
    read<NetworkRead>("/operations/network-metrics"),
  ]);

  /* A queue the role can READ but whose desk isn't theirs (C-1) isn't a
     row: each row opens the page it counts. */
  const cards = board ? queueCards(board.queues).filter((c) => mayUse(deskPath(c.href), actor.roles)) : [];
  const hasQueues = cards.length > 0;
  /* POL-FE-15 — queues with work, never a sum of items (an item can sit on two desks). */
  const waiting = queuesWaiting(cards);
  const todo = todoRows(cards);

  const sum = delivery ? deliverySummary(delivery.campaigns) : null;
  const campaignTotal = delivery?.page.total ?? 0;
  const lines = delivery ? campaignLines(delivery.campaigns).slice(0, TABLE_ROWS) : [];
  const rows = health ? healthRows(health) : null;
  const now = new Date();
  const toReview = reviews ? reviewLines(reviews.deliverables, now, BOARD_REVIEWS) : null;
  const activity = analytics ? activityPoints(analytics.series) : null;
  const split = network ? athleteSplit(network) : null;
  const readAt = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

  const missing = [
    !hasQueues && "your to-do list",
    !delivery && "campaign delivery",
    !analytics && "fan activity",
    !network && "the athlete network",
    !rows && "system health",
  ].filter(Boolean) as string[];

  return (
    /* A period change shows skeletons where the fan figures go (ops-pending.tsx). */
    <OpsPendingScope>
    <div className="space-y-5">
      {/* ---------------------------------------------------------- header */}
      <header className="sx-ops-in space-y-2" style={at(0.04)}>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="sx-page-title">Dashboard</h1>
          <span className="rounded-full border border-[#9be0ff]/30 bg-[#04080f]/40 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[#cfe9ff]">
            Live · updated {readAt}
          </span>
          {analytics && (
            <div className="sm:ml-auto">
              <OpsPeriodSwitch current={days} options={PERIODS} path="/admin" fallback={DEFAULT_PERIOD} />
            </div>
          )}
        </div>
        <OpsFanSlot skeleton={<SkPeriodLine />}>
          <p className="text-[13px] text-[#8a96a3]">
            {analytics ? (
              <>
                Fan numbers: <b className="font-semibold text-[#cfe9ff]">{periodWords(analytics.days, analytics.from, analytics.to)}</b>. Everything else is as of right now.
              </>
            ) : (
              "Every figure is as of right now."
            )}
          </p>
        </OpsFanSlot>
      </header>

      {/* ------------------------------------------------------------ KPIs */}
      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {hasQueues && (
          <OpsKpi
            icon="todo"
            label="Waiting on you"
            sub="Desks with work for BTG · now"
            value={waiting}
            edge={waiting ? "orange" : "green"}
            side={<ActionRing cards={cards} waiting={waiting} compact bare />}
            foot={waiting ? `of the ${cards.length} desks you look after` : "All clear: nothing is waiting"}
            delay={0.08}
          />
        )}
        {sum && (
          <OpsKpi
            icon="flag"
            label="Live campaigns"
            sub="Running right now"
            value={campaignTotal}
            edge="blue"
            side={
              sum.share !== null ? (
                <OpsGauge share={sum.share} size={74} segments={24} label={`${pct(sum.share)} of deliverables done`}>
                  <span className="block text-[13px] font-bold leading-none text-white">{pct(sum.share)}</span>
                  <span className="block text-[8.5px] uppercase tracking-[0.12em] text-[#8a96a3]">done</span>
                </OpsGauge>
              ) : undefined
            }
            foot={sum.behind ? <span className="text-[#fdba74]">{sum.behind} behind schedule</span> : campaignTotal ? "All on schedule" : "None running yet"}
            delay={0.12}
          />
        )}
        {split && network && (
          <OpsKpi
            icon="users"
            label="Active athletes"
            sub="Approved and ready to book · now"
            value={split.active}
            edge="cyan"
            side={
              <OpsGauge share={network.participationRate} size={74} segments={24} color={SERIES.a} label={`${pct(network.participationRate)} have been booked`}>
                <span className="block text-[13px] font-bold leading-none text-white">{pct(network.participationRate)}</span>
                <span className="block text-[8.5px] uppercase tracking-[0.12em] text-[#8a96a3]">booked</span>
              </OpsGauge>
            }
            foot={`${split.working.toLocaleString("en-US")} working on a campaign right now`}
            delay={0.16}
          />
        )}
        {analytics && activity && (
          <OpsFanSlot skeleton={<SkKpi />}>
          <OpsKpi
            icon="gift"
            label="Rewards used"
            sub={`Fans who used one · ${analytics.days} days`}
            value={analytics.funnel.REDEEM}
            edge="orange"
            delta={change(analytics.funnel.REDEEM, analytics.previous.REDEEM)}
            deltaWords={`vs the ${analytics.days} days before`}
            spark={activity.points.map((p) => p.redeems)}
            delay={0.2}
          />
          </OpsFanSlot>
        )}
      </dl>

      {/* ------------------------------------------- big chart + to-do list */}
      {(analytics || hasQueues) && (
        <div className="grid gap-4 lg:grid-cols-12">
          {analytics && activity && (
            <OpsCard
              id="dash-activity"
              icon="pulse"
              title="Fan activity"
              sub={`Fans who claimed a reward, and who used one · ${activity.bucket === "week" ? "week by week" : "day by day"}, last ${analytics.days} days`}
              action={mayUse("/admin/analytics", actor.roles) && <OpsLink href="/admin/analytics">Analytics →</OpsLink>}
              className={hasQueues ? "lg:col-span-8" : "lg:col-span-12"}
              delay={0.26}
            >
              <OpsFanSlot skeleton={<SkChart />}>
                <OpsActivityChart points={activity.points} bucket={activity.bucket} colorA={SERIES.a} colorB={SERIES.b} />
              </OpsFanSlot>
            </OpsCard>
          )}
          {hasQueues && (
            <OpsCard
              id="dash-todo"
              icon="inbox"
              tone={waiting ? "orange" : "green"}
              title="Your to-do list"
              sub={waiting ? `${waiting} ${waiting === 1 ? "desk has" : "desks have"} work waiting, oldest first. Click one to open it.` : "Nothing is waiting for BTG right now."}
              className={analytics ? "lg:col-span-4" : "lg:col-span-12"}
              delay={0.32}
              flush
            >
              {todo.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 px-5 pb-8 pt-4 text-center">
                  <span aria-hidden="true" className="grid size-12 place-items-center rounded-full bg-[#22c55e]/15 text-2xl text-[#86efac] shadow-[0_0_24px_-4px_#22c55e]">✓</span>
                  <p className="text-sm font-semibold text-white">All clear</p>
                  <p className="text-xs text-[#8a96a3]">New work shows up here the moment it arrives.</p>
                </div>
              ) : (
                /* The list scrolls inside the card: on a phone it stops at
                   about five rows; on wide screens it fills the card, level
                   with the chart, instead of stretching the row. */
                <div className="relative flex-1 lg:min-h-[16rem]">
                  <ul className="sx-opsd-scroll lg:absolute lg:inset-0 lg:overflow-y-auto" style={{ "--scroll-h": "19rem" } as CSSProperties}>
                    {todo.map((c) => {
                      const chip = c.chips[0];
                      return (
                        <li key={c.key} className="border-t border-white/[0.06]">
                          <Link
                            href={c.href}
                            className="group flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-[#2e9bf5]/[0.08] focus-visible:bg-[#2e9bf5]/[0.12] focus-visible:outline-none"
                          >
                            <span aria-hidden="true" className="h-8 w-1 shrink-0 rounded-full" style={{ background: QUEUE_TONE[c.key] }} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-semibold text-white">{c.label}</span>
                              <span className={`block truncate text-[11.5px] ${chip?.tone === "warn" || chip?.tone === "danger" ? "text-[#fdba74]" : "text-[#8a96a3]"}`}>
                                {chip ? chip.text : c.hint}
                              </span>
                            </span>
                            <span className="sx-opsd-count" style={{ "--tone": QUEUE_TONE[c.key] } as CSSProperties}>
                              {c.count.toLocaleString("en-US")}
                            </span>
                            <span aria-hidden="true" className="text-[#63b4f8] transition-transform group-hover:translate-x-0.5">→</span>
                          </Link>
                        </li>
                      );
                    })}
                    {/* says "there's more below" until the end is reached */}
                    {todo.length > 5 && <li aria-hidden="true" className="sx-opsd-fade" data-wide="" />}
                  </ul>
                </div>
              )}
            </OpsCard>
          )}
        </div>
      )}

      {/* ------------------------------------------ gauge · bars · donut */}
      {(sum || analytics || split) && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sum && (
            <OpsCard
              id="dash-delivery"
              icon="check"
              title="Delivery progress"
              sub={`Posts checked as done, across ${campaignTotal > sum.campaigns ? `the ${sum.campaigns} live campaigns ending soonest` : "all live campaigns"} · now`}
              delay={0.4}
            >
              {sum.due === 0 ? (
                <p className="text-sm text-[#8a96a3]">No posts are due on a live campaign yet. Progress shows once athletes have work to deliver.</p>
              ) : (
                <div className="flex flex-1 flex-wrap items-center gap-5">
                  <OpsGauge share={sum.share ?? 0} label={`${pct(sum.share ?? 0)} of due posts are done`}>
                    <span className="block text-[30px] font-bold leading-none text-white">{pct(sum.share ?? 0)}</span>
                    <span className="mt-1 block text-[10px] uppercase tracking-[0.18em] text-[#8a96a3]">done</span>
                  </OpsGauge>
                  <div className="min-w-[9rem] flex-1">
                    <OpsStat name="Posts done" value={`${sum.done.toLocaleString("en-US")} of ${sum.due.toLocaleString("en-US")}`} />
                    <OpsStat name="Overdue" value={sum.overdue.toLocaleString("en-US")} tone={sum.overdue ? "warn" : "good"} />
                    <OpsStat name="Campaigns behind" value={sum.behind.toLocaleString("en-US")} tone={sum.behind ? "warn" : "good"} />
                  </div>
                </div>
              )}
            </OpsCard>
          )}

          {analytics && (
            <OpsCard
              id="dash-funnel"
              icon="funnel"
              title="Fan journey"
              sub={`From scanning an athlete's QR code to using the reward · last ${analytics.days} days`}
              delay={0.46}
            >
              <OpsFanSlot skeleton={<SkBars />}>
              <OpsColumns
                label="Fans at each step"
                bars={[
                  { label: "Scanned", value: analytics.funnel.SCAN },
                  { label: "Opened page", value: analytics.funnel.LANDING },
                  { label: "Claimed", value: analytics.funnel.CLAIM },
                  { label: "Used", value: analytics.funnel.REDEEM, lit: true },
                ]}
              />
              <p className="mt-3 border-t border-white/[0.06] pt-2.5 text-[12px] text-[#8a96a3]">
                {analytics.funnel.SCAN ? (
                  <>
                    <b className="font-semibold text-white">{pct(analytics.funnel.REDEEM / analytics.funnel.SCAN)}</b> of scans ended with a reward used.
                  </>
                ) : (
                  "No QR scans in this period yet."
                )}
              </p>
              </OpsFanSlot>
            </OpsCard>
          )}

          {split && network && (
            <OpsCard
              id="dash-network"
              icon="users"
              title="Athlete network"
              sub="Active athletes by whether they have been booked · now"
              action={mayUse("/admin/network", actor.roles) && <OpsLink href="/admin/network">Network →</OpsLink>}
              delay={0.52}
            >
              <div className="flex flex-wrap items-center gap-5">
                <OpsDonut
                  label={`${split.active} active athletes: ${split.working} working now, ${split.bookedBefore} booked before, ${split.notBooked} not booked yet`}
                  parts={[
                    { label: "Working now", value: split.working, color: SERIES.a },
                    { label: "Booked before", value: split.bookedBefore, color: SERIES.b },
                    { label: "Not booked yet", value: split.notBooked, color: "#3a4a62" },
                  ]}
                >
                  <span className="block text-[26px] font-bold leading-none text-white">{split.active.toLocaleString("en-US")}</span>
                  <span className="mt-1 block text-[10px] uppercase tracking-[0.18em] text-[#8a96a3]">active</span>
                </OpsDonut>
                <div className="min-w-[9rem] flex-1">
                  <OpsLegend color={SERIES.a} name="Working now" value={split.working.toLocaleString("en-US")} />
                  <OpsLegend color={SERIES.b} name="Booked before" value={split.bookedBefore.toLocaleString("en-US")} />
                  <OpsLegend color="#3a4a62" name="Not booked yet" value={split.notBooked.toLocaleString("en-US")} />
                </div>
              </div>
              <div className="mt-auto pt-4">
                <div className="flex items-baseline justify-between text-[12px] text-[#8a96a3]">
                  <span>Athlete earnings paid · all time</span>
                  <span>
                    <b className="font-semibold text-white">{dollars(network.totalPaid)}</b> of {dollars(network.totalEarnings)}
                  </span>
                </div>
                <span aria-hidden="true" className="relative mt-1.5 block h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                  <span
                    className="sx-ops-bar absolute inset-y-0 left-0 block rounded-full bg-gradient-to-r from-[#2e9bf5] to-[#9be0ff]"
                    style={{ ...at(0.8), width: `${network.totalEarnings > 0 ? Math.min(100, (network.totalPaid / network.totalEarnings) * 100) : 0}%` }}
                  />
                </span>
              </div>
            </OpsCard>
          )}
        </div>
      )}

      {/* ---------------------------------------- content to review · systems */}
      {(toReview || rows) && (
        <div className="grid gap-4 lg:grid-cols-12">
          {toReview && reviews && (
            <OpsCard
              id="dash-review"
              icon="eye"
              title="Posts to review"
              sub={`Athlete posts waiting for BTG's OK, soonest deadline first · ${reviews.page.total.toLocaleString("en-US")} waiting now`}
              action={<OpsLink href="/admin/approvals">Approvals →</OpsLink>}
              className={rows ? "lg:col-span-7" : "lg:col-span-12"}
              delay={0.58}
              flush
            >
              {toReview.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-[#8a96a3]">Nothing to review. A post lands here when an athlete submits a draft and it passes the automatic checks.</p>
              ) : (
                <>
                <ul className="sx-opsd-scroll" style={{ "--scroll-h": "14.5rem" } as CSSProperties}>
                  {toReview.map((l) => (
                    <li key={l.id} className="border-t border-white/[0.06]">
                      <Link
                        href={l.href}
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-2.5 transition-colors hover:bg-[#2e9bf5]/[0.08] focus-visible:bg-[#2e9bf5]/[0.12] focus-visible:outline-none"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-semibold text-white">{l.title}</span>
                          <span className="block truncate text-[11.5px] text-[#8a96a3]">
                            {l.athlete} · {l.campaign}
                          </span>
                        </span>
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${l.late ? "border-[#f97a1f]/40 bg-[#f97a1f]/15 text-[#fdba74]" : "border-[#2e9bf5]/40 bg-[#2e9bf5]/15 text-[#93c5fd]"}`}
                        >
                          {l.late ? `${l.by} · late` : l.by}
                        </span>
                      </Link>
                    </li>
                  ))}
                  {toReview.length > 3 && <li aria-hidden="true" className="sx-opsd-fade" />}
                </ul>
                {reviews.page.total > toReview.length && (
                  <p className="border-t border-white/[0.06] px-5 py-3">
                    <OpsLink href="/admin/approvals">See all {reviews.page.total.toLocaleString("en-US")} waiting →</OpsLink>
                  </p>
                )}
                </>
              )}
            </OpsCard>
          )}
          {rows && <Systems rows={rows} wide={!toReview} delay={0.64} canOpen={mayUse("/admin/integrations", actor.roles)} />}
        </div>
      )}

      {/* ---------------------------------------------- live campaigns table */}
      {delivery && (
        <OpsCard
          id="dash-campaigns"
          icon="megaphone"
          title="Live campaigns"
          sub={`Running now, the ones behind schedule first · ${campaignTotal.toLocaleString("en-US")} in all`}
          action={mayUse("/admin/campaigns", actor.roles) && <OpsLink href="/admin/campaigns">All campaigns →</OpsLink>}
          delay={0.7}
          flush
        >
          {lines.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-[#8a96a3]">
              No live campaigns yet. A campaign goes live once a brief is matched and its athletes accept.{" "}
              {mayUse("/admin/briefs", actor.roles) && <OpsLink href="/admin/briefs">Open Briefs →</OpsLink>}
            </p>
          ) : (
            /* Phone: name with a status line under it, and the done count;
               the bar, Overdue and Ends columns join from sm up. Below lg the
               rows scroll inside the card. The column names are a plain row
               ABOVE the scroll box, not a sticky <thead> inside it: a sticky
               cell in a collapsed table mis-paints in some browsers, rows
               showing above it (owner's screenshot, 2026-11-17). The real
               <thead> stays for screen readers, zero-height, so the fixed
               layout still takes its column widths from it. */
            <>
            <div
              aria-hidden="true"
              className="sx-opsd-colhead grid grid-cols-[minmax(0,1fr)_6.5rem] border-y border-white/[0.06] bg-white/[0.02] text-[10.5px] font-medium uppercase tracking-[0.14em] text-[#7e88a0] sm:grid-cols-[minmax(0,1fr)_38%_6rem_6rem]"
            >
              <span className="px-5 py-2.5">Campaign</span>
              <span className="px-3 py-2.5 text-right sm:text-left">Posts done</span>
              <span className="hidden px-3 py-2.5 text-right sm:block">Overdue</span>
              <span className="hidden px-5 py-2.5 text-right sm:block">Ends</span>
            </div>
            <div className="sx-opsd-scroll" style={{ "--scroll-h": "13.5rem" } as CSSProperties}>
              <table className="w-full table-fixed text-left text-[13px]">
                <thead>
                  <tr className="[&>th]:h-0 [&>th]:overflow-hidden [&>th]:p-0">
                    <th scope="col"><span className="sr-only">Campaign</span></th>
                    <th scope="col" className="w-[6.5rem] sm:w-[38%]"><span className="sr-only">Posts done</span></th>
                    <th scope="col" className="hidden w-[6rem] sm:table-cell"><span className="sr-only">Overdue</span></th>
                    <th scope="col" className="hidden w-[6rem] sm:table-cell"><span className="sr-only">Ends</span></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((c, i) => (
                    <tr key={c.id} className="border-b border-white/[0.05] last:border-0 transition-colors hover:bg-[#2e9bf5]/[0.06]">
                      <td className="max-w-0 px-5 py-3">
                        <Link href={`/admin/campaigns/${encodeURIComponent(c.id)}`} className="flex items-center gap-3 font-semibold text-white hover:text-[#9be0ff]">
                          <span
                            aria-hidden="true"
                            className="grid size-8 shrink-0 place-items-center border border-[#f97a1f]/35 bg-[#f97a1f]/[0.12] text-[11px] font-bold text-[#ffd1a6] [clip-path:polygon(0_0,calc(100%-6px)_0,100%_6px,100%_100%,6px_100%,0_calc(100%-6px))]"
                          >
                            {c.mono}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate">{c.name}</span>
                            <span className={`block truncate text-[11.5px] font-normal sm:hidden ${c.overdue ? "text-[#fdba74]" : "text-[#8a96a3]"}`}>
                              {c.overdue ? `${c.overdue} overdue · ` : ""}
                              {c.ends}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-right sm:text-left">
                        <span className="flex items-center justify-end gap-2.5 sm:justify-start">
                          <span aria-hidden="true" className="relative hidden h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.07] sm:block">
                            <span
                              className="sx-ops-bar absolute inset-y-0 left-0 block rounded-full bg-gradient-to-r from-[#2e9bf5] to-[#9be0ff]"
                              style={{ ...at(0.85 + i * 0.06), width: `${c.pct}%` }}
                            />
                          </span>
                          <span className="w-[4.5rem] shrink-0 text-right tabular-nums text-[#cbd5e1]">
                            {c.done}/{c.due} <span className="text-[#7e88a0]">· {c.pct}%</span>
                          </span>
                        </span>
                      </td>
                      <td className={`hidden px-3 py-3 text-right tabular-nums sm:table-cell ${c.overdue ? "font-semibold text-[#fdba74]" : "text-[#7e88a0]"}`}>{c.overdue}</td>
                      <td className="hidden whitespace-nowrap px-5 py-3 text-right text-[#9aa4b2] sm:table-cell">{c.ends.replace(/^Ends /, "")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {lines.length > 3 && <span aria-hidden="true" className="sx-opsd-fade" />}
            </div>
            </>
          )}
          {campaignTotal > lines.length && mayUse("/admin/campaigns", actor.roles) && (
            <p className="border-t border-white/[0.06] px-5 py-3">
              <OpsLink href="/admin/campaigns">See all {campaignTotal.toLocaleString("en-US")} live campaigns →</OpsLink>
            </p>
          )}
        </OpsCard>
      )}

      {missing.length > 0 && (
        <p className="text-[11.5px] text-[#7e88a0]">Not shown for your role: {missing.join(", ")}.</p>
      )}
    </div>
    </OpsPendingScope>
  );
}

/* ------------------------------------------------------------------ systems */

const LED: Record<HealthRow["status"], { dot: string; text: string }> = {
  Operational: { dot: "bg-[#22c55e] shadow-[0_0_10px_#22c55e]", text: "text-[#86efac]" },
  Syncing: { dot: "bg-[#2e9bf5] shadow-[0_0_12px_#2e9bf5]", text: "text-[#93c5fd]" },
  Degraded: { dot: "bg-[#f59e0b] shadow-[0_0_12px_#f59e0b]", text: "text-[#fcd34d]" },
  Down: { dot: "bg-[#ef4444] shadow-[0_0_14px_#ef4444]", text: "text-[#fca5a5]" },
  /* POL-FE-74 — a vendor not set up yet: quiet, not an alarm. */
  "Not connected": { dot: "bg-[#94a3b8]", text: "text-[#cbd5e1]" },
};

function Systems({ rows, wide, delay, canOpen }: { rows: HealthRow[]; wide: boolean; delay: number; canOpen: boolean }) {
  const ok = rows.filter((r) => r.status === "Operational" || r.status === "Syncing" || r.status === "Not connected").length;
  const bad = rows.length - ok;
  return (
    <OpsCard
      id="dash-systems"
      icon="server"
      tone={bad ? "red" : "green"}
      title="System health"
      sub={bad ? `${bad} of ${rows.length} services need attention · now` : `All ${rows.length} services working · now`}
      action={canOpen && <OpsLink href="/admin/integrations">Integrations →</OpsLink>}
      className={wide ? "lg:col-span-12" : "lg:col-span-5"}
      delay={delay}
      flush
    >
      <ul>
        {rows.map((r) => (
          <li key={r.name} className="flex items-center gap-3 border-t border-white/[0.06] px-5 py-2.5">
            <i aria-hidden="true" data-status={r.status} className={`sx-ops-led size-[9px] shrink-0 rounded-full ${LED[r.status].dot}`} />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-white">{r.name}</span>
              <span className="block truncate text-[11.5px] text-[#8a96a3]">{r.detail}</span>
            </span>
            <span className={`text-[11px] font-semibold ${LED[r.status].text}`}>{r.status}</span>
          </li>
        ))}
      </ul>
      <p className="mt-auto border-t border-white/[0.06] px-5 py-3 text-[11px] text-[#7e88a0]">A Zoho sync that is queued is healthy, not an outage.</p>
    </OpsCard>
  );
}
