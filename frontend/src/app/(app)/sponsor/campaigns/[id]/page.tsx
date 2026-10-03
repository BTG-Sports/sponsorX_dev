import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { Badge, BlockedNotice, Card, Meter, SectionHeading } from "@/components/ui";
import { AreaChart, HBarList, RadialGauge, compact } from "@/components/charts";
import { HeroBand, MiniChip, Monogram, initials } from "@/components/hero";
import { EmptyState, SkeletonPage } from "@/components/states";
import { resolveBack } from "@/lib/back";
import {
  FLAG_HINTS,
  ORDER_COPY,
  ORDER_TONE,
  PACE_COPY,
  fmtRate,
  paceFor,
  paceProjection,
} from "@/lib/campaign-ui";
import { demoState } from "@/lib/demo";
import {
  campaignDetailX,
  money,
  sponsor,
  sponsorCampaigns,
  sponsorCampaignsX,
} from "@/lib/fixtures";
import { daysRemaining, reachPct, verifiedPct } from "@/lib/ops-live";
import { isBehind, monogramOf, windowLabel } from "@/lib/sponsor-live";
import { sponsorNextStep } from "@/lib/campaign-stage";
import { campaignApprovalLine } from "@/lib/brief-status";
import { liveSponsorCampaign, type LiveCampaignDetail } from "@/server/sponsor";
import { SponsorArtwork } from "@/components/edition-artwork";
import { SponsorContentReview } from "@/components/sponsor-content-review";
import {
  presignArtwork,
  registerArtwork,
  sponsorArtworkAction,
  sponsorArtworkLink,
  sponsorContentAction,
  sponsorContentLink,
} from "./actions";

/* --------------------------------------------------------------------------
   Sponsor Campaign detail — §9, sponsor portal (2026-09-15). The screen that
   sits between the campaigns list and the ROI report.

   Owner-framed: the sponsor sees the state of their own campaign — pacing,
   delivery, roster, top content — and a link into the ROI report. It is NOT
   the /admin operations workspace: no order-action drawer, no "re-match the
   slot" verbs. Issues are shown as status with the reassurance that the BTG
   campaign manager owns the fix (§9.9).

   Data is tiered. c1/c3 carry rich fixtures (campaignDetailX: series, roster,
   top content, notice) and render the full dashboard. c2/c4/c5 only have
   portfolio-summary fixtures (sponsorCampaigns/X), so they render an honest
   lighter detail — different campaign states legitimately carry different
   depth. No campaign is faked with data it doesn't have.

   LIVE (P2-FE-01). A signed-in sponsor gets their own campaign: the portfolio
   row from GET /campaigns (package, window, contracted spend — column-gated)
   and the delivery board from GET /campaigns/:id/ops (orders scoped by
   whereFor; a sponsor gets no invitations and no athlete pay). The views
   series, engagement and top content are the ROI report's (P7-FE-03), so the
   live page links there instead of drawing them. Someone else's campaign id
   is "not found", never a sample.
   -------------------------------------------------------------------------- */

const STATE_TONE = {
  ACTIVE: "accent",
  REPORTING: "primary",
  STAFFING: "warn",
  COMPLETED: "neutral",
} as const;

export default async function SponsorCampaignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") throw new Error("Demo error state");

  const { id } = await params;
  const sp = await searchParams;
  const fromParam = Array.isArray(sp.from) ? sp.from[0] : sp.from;
  const back = resolveBack(fromParam, "sponsor-campaigns");

  const live = demo === null ? await liveSponsorCampaign(id) : null;
  if (live) {
    if (live.status === "missing") {
      return (
        <div className="space-y-5">
          <BackLink target={back} />
          <EmptyState
            mark="chart"
            title="Campaign not found"
            hint="This isn't one of your campaigns, or it no longer exists."
            action={{ label: "Back to campaigns", href: "/sponsor/campaigns" }}
          />
        </div>
      );
    }
    return <LiveDetail detail={live} back={back} />;
  }

  const base = sponsorCampaigns.find((c) => c.id === id);
  const x = sponsorCampaignsX[id];

  if (!base || !x || demo === "empty") {
    return (
      <div className="space-y-5">
        <BackLink target={back} />
        <EmptyState
          mark="chart"
          title={base ? "No campaign data yet" : "Not a sample campaign"}
          hint={
            base
              ? "This campaign's dashboard fills in as deliverables publish and metrics roll up."
              : /* P7-QA-02: a real campaign id lands here (this page is
                   fixture-only), so point at the live ROI report rather than
                   telling a sponsor their own campaign isn't theirs. */
                "This page only has sample campaigns so far — your campaign's live figures are in its ROI report."
          }
          action={
            base
              ? { label: "Back to campaigns", href: "/sponsor/campaigns" }
              : { label: "Open the ROI report", href: `/sponsor/campaigns/${encodeURIComponent(id)}/report` }
          }
        />
      </div>
    );
  }

  const rich = campaignDetailX[id as keyof typeof campaignDetailX];
  const [done, total] = base.deliverables;
  const behind = x.pacing === "BEHIND";
  const hasReport = base.state !== "STAFFING";

  const reportCta = hasReport ? (
    <Link
      href={`/sponsor/campaigns/${id}/report?from=sponsor-campaign`}
      className="flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-[11px] font-medium text-cta-ink transition-colors hover:bg-primary-soft"
    >
      View ROI report
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-3.5"
        aria-hidden="true"
      >
        <path d="m9 5 7 7-7 7" />
      </svg>
    </Link>
  ) : (
    <span className="rounded-lg border border-line bg-surface px-3.5 py-2 text-[11px] font-medium text-faint">
      ROI report available once delivery begins
    </span>
  );

  const header = (
    <div className="sx-animate flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <Monogram text={x.monogram} tone={behind ? "accent" : "primary"} className="size-11 text-xs" />
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{base.name}</h1>
            {behind ? (
              <Badge tone="warn">Pacing behind</Badge>
            ) : (
              <Badge tone={STATE_TONE[base.state]}>{base.state.toLowerCase()}</Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted">
            Presented by {sponsor.name} · {base.pkg} · {x.endsIn}
          </p>
        </div>
      </div>
      {reportCta}
      {/* P7-QA-02: fixture-only page (live read is P2-FE-01) — say so to a
          signed-in sponsor before any chip below reads as their own data. */}
      {!demo && (
        <div className="w-full">
          <BlockedNotice>
            Demo data — this is a sample campaign, not yours. Your own
            campaigns&rsquo; figures are on the Dashboard and in each ROI report.
          </BlockedNotice>
        </div>
      )}
    </div>
  );

  /* ---------------------------------------------------- lean tier (c2/c4/c5) */
  if (!rich) {
    const pct = total ? Math.round((done / total) * 100) : 0;
    return (
      <div className="space-y-6">
        <BackLink target={back} />
        {header}

        <div className="sx-animate sx-delay-1 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Views delivered" value={x.views.toLocaleString()} chip={<MiniChip kind="ver">METRICDAILY</MiniChip>} />
          <StatTile
            label="Deliverables"
            value={`${done}/${total}`}
            hint={`${pct}% complete`}
            chip={<MiniChip kind="est">COMPUTED</MiniChip>}
            meter={pct}
          />
          <StatTile label="Spend" value={money(base.spend)} chip={<MiniChip kind="manual">ZOHO BOOKS</MiniChip>} />
          <StatTile label="Athletes" value={String(base.athletes)} hint="on this campaign" />
        </div>

        <Card className="sx-animate sx-delay-2">
          <p className="text-xs leading-relaxed text-muted">
            {base.state === "COMPLETED"
              ? "This campaign has wrapped. The ROI report is your full read on what it returned."
              : base.state === "REPORTING"
                ? "Delivery is done and the numbers are being finalised — the ROI report has the details."
                : "This campaign is still being staffed. Delivery metrics and the ROI report open up once athletes accept their Campaign Orders."}
          </p>
        </Card>

        <p className="sx-animate sx-delay-2 text-[10px] text-faint">
          Campaign <code className="font-mono">{id}</code> · fixture data.
        </p>
      </div>
    );
  }

  /* ---------------------------------------------------- rich tier (c1/c3) */
  const c = rich.campaign;
  const pace = paceFor(c, rich.series);
  const paceCopy = PACE_COPY[pace.band];
  const projection = paceProjection(c, pace.recentPerDay);
  const issues = rich.roster.filter((r) => r.flag);

  return (
    <div className="space-y-6">
      <BackLink target={back} />
      {header}

      {/* ------------------------------------------------------- pacing hero */}
      <HeroBand className="sx-animate sx-delay-1">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_11rem] lg:items-center">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">
              Delivery pacing
            </p>
            <p className="mt-1 flex flex-wrap items-baseline gap-2">
              <span className="sx-gradient-text text-4xl font-bold tabular-nums tracking-tight sm:text-5xl">
                {pace.pct}%
              </span>
              <span className="text-sm text-muted">of the views target delivered</span>
              <MiniChip kind="manual">VERIFIED · MANUAL</MiniChip>
            </p>
            <p className="mt-4 text-xs leading-relaxed text-muted">
              <strong className="font-semibold text-text">{paceCopy.label}</strong> —
              publishing ~{fmtRate(pace.recentPerDay)} views a day; the campaign is
              on track for about {compact(pace.projectedTotal)} of the{" "}
              {compact(c.viewsTarget)} target with {c.daysRemaining} days left.
            </p>
          </div>
          <div className="justify-self-center">
            <RadialGauge
              display={`${pace.pct}%`}
              sweep={pace.pct / 100}
              caption="views target"
              sub={`${compact(c.viewsDelivered)} of ${compact(c.viewsTarget)}`}
            />
          </div>
        </div>
      </HeroBand>

      {/* --------------------------------------------- attention notice */}
      {rich.notice && issues.length > 0 && (
        <div className="sx-animate flex items-start gap-3 rounded-xl border border-warn/30 bg-warn/8 px-4 py-3">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--sx-warn)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          >
            <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          </svg>
          <p className="text-xs leading-relaxed text-muted">
            {issues.length} athlete{issues.length === 1 ? "" : "s"} on this campaign
            need{issues.length === 1 ? "s" : ""} attention — your BTG campaign
            manager is handling the re-match and follow-up (§9.9). Nothing for you
            to action here.
          </p>
        </div>
      )}

      {/* ----------------------------------------------------- stat tiles */}
      <div className="sx-animate sx-delay-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Views delivered"
          value={c.viewsDelivered.toLocaleString()}
          hint={`of ${compact(c.viewsTarget)} target`}
          chip={<MiniChip kind="manual">VERIFIED · MANUAL</MiniChip>}
          meter={pace.pct}
        />
        <StatTile
          label="Engagements"
          value={c.engagements.toLocaleString()}
          hint="likes, comments, shares"
          chip={<MiniChip kind="manual">METRICDAILY</MiniChip>}
        />
        <StatTile
          label="Rewards redeemed"
          value={c.rewardsRedeemed.toLocaleString()}
          hint="fan QR redemptions"
          chip={<MiniChip kind="ver">POSTGRES</MiniChip>}
        />
        <StatTile
          label="Days remaining"
          value={String(c.daysRemaining)}
          hint={`~${fmtRate(pace.neededPerDay)} views/day to target`}
          chip={<MiniChip kind="est">COMPUTED</MiniChip>}
        />
      </div>

      {/* ------------------------------------ performance + top content */}
      <div className="sx-animate sx-delay-3 grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="min-w-0">
          <SectionHeading
            title="Performance over time"
            hint="Solid lines are verified history; the dashed tail projects the recent rate forward."
          />
          <Card>
            <AreaChart points={rich.series} aName="Views" bName="Engagements" projection={projection} />
          </Card>
        </section>
        <section className="min-w-0">
          <SectionHeading title="Top content" hint="Ranked by verified views" />
          <Card>
            <HBarList
              rows={rich.topContent.map((t) => ({
                label: t.title,
                sub: t.athlete,
                value: t.views,
                display: compact(t.views),
              }))}
            />
          </Card>
        </section>
      </div>

      {/* --------------------------------------------- athlete roster */}
      <section className="sx-animate sx-delay-4">
        <SectionHeading
          title="Athlete roster"
          hint="Who's delivering on your campaign. Read-only — your BTG manager runs the orders."
        />
        <Card className="p-0">
          <ul className="divide-y divide-line-soft">
            {rich.roster.map((r) => {
              const rpct = r.planned ? Math.round((r.delivered / r.planned) * 100) : 0;
              return (
                <li key={r.slug} className="px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <Monogram text={initials(r.name)} shape="circle" tone="neutral" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-xs font-semibold tracking-tight">
                          {r.name}
                        </span>
                        <Badge tone={ORDER_TONE[r.order] ?? "neutral"}>
                          {ORDER_COPY[r.order] ?? r.order}
                        </Badge>
                        {r.flag && <Badge tone="warn">{r.flag}</Badge>}
                      </div>
                      {r.flag && (
                        <p className="mt-0.5 text-[10px] text-faint">
                          {FLAG_HINTS[r.flag] ?? ""}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-semibold tabular-nums">
                        {compact(r.views)}{" "}
                        <span className="font-normal text-faint">views</span>
                      </p>
                      <p className="mt-0.5 text-[11px] tabular-nums text-muted">
                        {r.delivered}/{r.planned} delivered
                      </p>
                    </div>
                  </div>
                  <div className="mt-2.5 pl-11">
                    <Meter value={rpct} tone={r.flag ? "primary" : "accent"} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </section>

      <p className="sx-animate sx-delay-4 text-[10px] leading-relaxed text-faint">
        Campaign <code className="font-mono">{id}</code> · fixture data. Every
        figure traces to MetricDaily, RewardEvent, Deliverable or Zoho Books (§22).
      </p>
    </div>
  );
}

/* ------------------------------------------------------------ live detail */

const LIVE_ORDER_COPY: Record<string, string> = {
  SENT: "Awaiting acceptance",
  ACCEPTED: "Accepted",
  ACTIVE: "Delivering",
  COMPLETED: "Completed",
  REJECTED: "Declined",
  CANCELLED: "Cancelled",
};
const LIVE_ORDER_TONE: Record<string, "accent" | "primary" | "warn" | "neutral" | "danger"> = {
  SENT: "warn",
  ACCEPTED: "primary",
  ACTIVE: "accent",
  COMPLETED: "neutral",
  REJECTED: "danger",
  CANCELLED: "danger",
};
const LIVE_STATE_TONE: Record<string, "accent" | "primary" | "warn" | "neutral" | "danger"> = {
  ACTIVE: "accent",
  REPORTING: "primary",
  STAFFING: "warn",
  APPROVAL: "warn",
  DRAFT: "neutral",
  COMPLETED: "neutral",
  CANCELLED: "danger",
};
/** No delivery has started before these — the report has nothing to show. */
const PRE_DELIVERY = new Set(["DRAFT", "STAFFING", "APPROVAL"]);

function LiveDetail({
  detail,
  back,
}: {
  detail: Extract<LiveCampaignDetail, { status: "found" }>;
  back: ReturnType<typeof resolveBack>;
}) {
  const { campaign: c, ops } = detail;
  const now = new Date();
  const h = ops.health;
  const behind = isBehind(c, now);
  const vPct = verifiedPct(h);
  const rPct = reachPct(h);
  const days = daysRemaining(c.endDate, now);
  const hasReport = !PRE_DELIVERY.has(c.state);
  /* Only rows with an order: a sponsor sees who is delivering, not who BTG
     is still negotiating with (the API sends no invitations here anyway). */
  const roster = ops.roster.filter((r) => r.order);
  const attention = roster.filter((r) => r.overdue > 0 || r.order?.state === "SENT");
  /* P4-FE-08 — the plain next step the API gives a sponsor (P4-BE-09). */
  const next = sponsorNextStep(c.nextStep);
  /* P4-FE-09 — while it is being staffed, the request it came from is approved. */
  const approved = campaignApprovalLine(c.state);

  return (
    <div className="space-y-6">
      <BackLink target={back} />

      <div className="sx-animate flex flex-wrap items-start justify-between gap-3">
        {/* min-w-0 + break-words: one long unbroken word in a campaign name
            ran 23px past a 390px phone (QA pass 8, F-11). */}
        <div className="flex min-w-0 items-start gap-3">
          <Monogram text={monogramOf(c.name)} tone={behind ? "accent" : "primary"} className="size-11 shrink-0 text-xs" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 break-words text-xl font-semibold tracking-tight [overflow-wrap:anywhere]">{c.name}</h1>
              {behind ? (
                <Badge tone="warn">Pacing behind</Badge>
              ) : (
                <Badge tone={LIVE_STATE_TONE[c.state] ?? "neutral"}>{c.state.toLowerCase()}</Badge>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted">
              Presented by {c.sponsorName} · {c.package?.name ?? "Custom"} · {windowLabel(c, now)}
            </p>
          </div>
        </div>
        {hasReport ? (
          <Link
            href={`/sponsor/campaigns/${encodeURIComponent(c.id)}/report?from=sponsor-campaign`}
            className="flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-[11px] font-medium text-cta-ink transition-colors hover:bg-primary-soft"
          >
            View ROI report
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden="true">
              <path d="m9 5 7 7-7 7" />
            </svg>
          </Link>
        ) : (
          <span className="rounded-lg border border-line bg-surface px-3.5 py-2 text-[11px] font-medium text-faint">
            ROI report available once delivery begins
          </span>
        )}
      </div>

      {approved && (
        <div className="sx-animate flex min-w-0 items-center gap-3 rounded-xl border border-accent/30 bg-accent/8 px-4 py-3">
          <Badge tone="accent">Approved</Badge>
          <p className="min-w-0 text-xs font-medium text-text [overflow-wrap:anywhere]">{approved}</p>
        </div>
      )}

      {next && (
        <div className="sx-animate flex min-w-0 items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
          <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.2em] text-muted">What&apos;s next</span>
          <p className="min-w-0 text-xs font-medium text-text [overflow-wrap:anywhere]">{next}</p>
        </div>
      )}

      {attention.length > 0 && (
        <div className="sx-animate flex items-start gap-3 rounded-xl border border-warn/30 bg-warn/8 px-4 py-3">
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--sx-warn)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 size-4 shrink-0" aria-hidden="true">
            <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          </svg>
          <p className="text-xs leading-relaxed text-muted">
            {attention.length} athlete{attention.length === 1 ? "" : "s"} on this campaign
            need{attention.length === 1 ? "s" : ""} attention — your BTG campaign
            manager is handling the follow-up (§9.9). Nothing for you to action here.
          </p>
        </div>
      )}

      <div className="sx-animate sx-delay-1 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Deliverables verified"
          value={`${h.deliverablesVerified}/${h.deliverablesTotal}`}
          hint={vPct === null ? "nothing scheduled yet" : `${vPct}% verified`}
          chip={<MiniChip kind="ver">POSTGRES</MiniChip>}
          meter={vPct ?? undefined}
        />
        <StatTile
          label="Verified impressions"
          value={h.verifiedImpressions.toLocaleString()}
          hint={
            rPct === null
              ? "no projection on the Campaign Orders"
              : `${rPct}% of ${compact(h.projectedImpressions ?? 0)} projected`
          }
          chip={<MiniChip kind="manual">VERIFIED · MANUAL</MiniChip>}
          meter={rPct ?? undefined}
        />
        <StatTile
          label="Spend"
          value={typeof c.contracted === "number" ? money(c.contracted) : "—"}
          hint="contracted across Campaign Orders"
          chip={<MiniChip kind="ver">POSTGRES</MiniChip>}
        />
        <StatTile
          label={c.state === "ACTIVE" ? "Days remaining" : "Overdue"}
          value={c.state === "ACTIVE" ? String(days) : String(h.deliverablesOverdue)}
          hint={
            c.state === "ACTIVE"
              ? `${h.deliverablesOverdue} deliverable${h.deliverablesOverdue === 1 ? "" : "s"} overdue`
              : "deliverables past due"
          }
          chip={<MiniChip kind="est">COMPUTED</MiniChip>}
        />
      </div>

      {/* P9-BE-16 — the SponsorX NEXT ad slots this campaign bought: upload
          the artwork, then approve it (or ask for changes) once BTG has
          reviewed it. The edition can't go to print until it's approved. */}
      {detail.artwork.length > 0 && (
        <section className="sx-animate sx-delay-2">
          <SectionHeading
            title="Your ad artwork"
            hint="Each ad goes through BTG's review, then comes back to you to approve. The edition prints only once every ad is approved."
          />
          <SponsorArtwork
            slots={detail.artwork}
            now={now.getTime()}
            canDecide={detail.canDecideArtwork}
            act={sponsorArtworkAction}
            link={sponsorArtworkLink}
            presign={presignArtwork}
            register={registerArtwork}
          />
        </section>
      )}

      {/* P4-FE-08 (P5-BE-09) — athlete content BTG sent for the sponsor's
          sign-off: the caption it will go out with and how long it has
          waited. Hidden when nothing is waiting. */}
      {detail.review.length > 0 && (
        <section className="sx-animate sx-delay-2">
          <SectionHeading
            title="Content for your approval"
            hint={`${detail.review.length} waiting · BTG has reviewed ${detail.review.length === 1 ? "it" : "each one"}; the athlete posts once you approve.`}
          />
          <SponsorContentReview
            items={detail.review}
            now={now.getTime()}
            canDecide={detail.canDecideContent}
            act={sponsorContentAction}
            link={sponsorContentLink}
          />
        </section>
      )}

      <section className="sx-animate sx-delay-2">
        <SectionHeading
          title="Athlete roster"
          hint="Who's delivering on your campaign. Read-only — your BTG manager runs the orders."
        />
        {roster.length === 0 ? (
          <Card>
            <p className="text-xs leading-relaxed text-muted">
              No Campaign Orders yet — BTG is still staffing this campaign.
              Athletes appear here once their orders go out.
            </p>
          </Card>
        ) : (
          <Card className="p-0">
            <ul className="divide-y divide-line-soft">
              {roster.map((r) => {
                const rpct = r.planned ? Math.round((r.delivered / r.planned) * 100) : 0;
                const state = r.order!.state;
                return (
                  <li key={r.athleteId} className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <Monogram text={initials(r.name)} shape="circle" tone="neutral" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-xs font-semibold tracking-tight">{r.name}</span>
                          <Badge tone={LIVE_ORDER_TONE[state] ?? "neutral"}>{LIVE_ORDER_COPY[state] ?? state}</Badge>
                          {r.overdue > 0 && <Badge tone="warn">{r.overdue} overdue</Badge>}
                          {r.inReview > 0 && <Badge tone="primary">{r.inReview} in review</Badge>}
                        </div>
                        {r.nextDue && (
                          <p className="mt-0.5 text-[10px] text-faint">
                            Next due{" "}
                            {new Date(r.nextDue).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs font-semibold tabular-nums">
                          {compact(r.verifiedViews)} <span className="font-normal text-faint">verified views</span>
                        </p>
                        <p className="mt-0.5 text-[11px] tabular-nums text-muted">
                          {r.delivered}/{r.planned} delivered
                        </p>
                      </div>
                    </div>
                    <div className="mt-2.5 pl-11">
                      <Meter value={rpct} tone={r.overdue > 0 ? "primary" : "accent"} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </section>

      <p className="sx-animate sx-delay-3 text-[10px] leading-relaxed text-faint">
        Delivery, roster and spend are from Postgres; verified impressions are
        staff-checked metrics on published deliverables. The views series,
        engagement, rewards and top content are in the ROI report.
      </p>
    </div>
  );
}

function StatTile({
  label,
  value,
  hint,
  chip,
  meter,
}: {
  label: string;
  value: string;
  hint?: string;
  chip?: React.ReactNode;
  meter?: number;
}) {
  return (
    <Card className="p-4">
      <p className="text-[11px] font-medium text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-[10px] text-faint">{hint}</p>}
      {typeof meter === "number" && (
        <div className="mt-2">
          <Meter value={meter} tone={meter >= 90 ? "accent" : "primary"} />
        </div>
      )}
      {chip && <div className="mt-2">{chip}</div>}
    </Card>
  );
}
