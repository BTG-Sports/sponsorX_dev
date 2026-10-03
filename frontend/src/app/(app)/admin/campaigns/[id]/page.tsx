import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { Badge, BlockedNotice, Card, Meter, SectionHeading } from "@/components/ui";
import {
  AreaChart,
  ChartLegend,
  HBarList,
  RadialGauge,
  Sparkline,
  compact,
} from "@/components/charts";
import { HeroBand, MiniChip, Monogram, initials } from "@/components/hero";
import { RosterOps } from "@/components/roster-ops";
import { EmptyState, SkeletonPage } from "@/components/states";
import { CampaignLauncher } from "@/components/campaign-launcher";
import { notFound } from "next/navigation";
import { resolveBack } from "@/lib/back";
import {
  daysRemaining,
  reachPct,
  toRosterRow,
  verifiedPct,
  type ApiOps,
} from "@/lib/ops-live";
import { apiFetch, fetchActor } from "@/server/api";
import { roleLabel } from "@/server/viewer";
import { draftAndSendOrder, setAutoStaffingAction } from "./actions";
import {
  launchLine,
  nextStepTone,
  nextStepWho,
  rangeWords,
  staffingStop,
  staffingTiles,
  stageChangeLine,
  type CampaignStaffing,
} from "@/lib/campaign-stage";
import { AutoStaffingToggle } from "@/components/auto-staffing-toggle";
import type { ApiCampaign } from "@/lib/sponsor-live";
import { PACE_COPY, fmtRate, paceFor, paceProjection } from "@/lib/campaign-ui";
import { demoState } from "@/lib/demo";
import {
  builderDraft,
  builderSteps,
  campaignDetailX,
  eligibleAthletes,
  mediaInv,
  rewardDraft,
} from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Campaign Operations Dashboard — §9 screen 9, mockup screen 9.
   Redesigned 2026-09-14 (UX feedback: the old page was stat cards over a
   static table, with a fake tab strip of "Not built yet" spans).

   The page now answers the operator's two questions in order. "Is this
   campaign healthy?" is the hero band — percent-to-target as a gauge, the
   recent daily rate vs the rate still needed, and where the campaign lands
   if the rate holds (also drawn as the chart's dashed projection tail).
   "Who needs my attention?" is the RosterOps client island — §9.9's
   per-athlete acceptance, Campaign Orders, delivery and issue flags as an
   interactive roster: filter pills, instant search, a delivery ring per row,
   and a slide-over drawer that spells out the order lifecycle and offers the
   one action each state calls for.

   LIVE vs DEMO (P5-FE-05, the P3-FE-02 precedent). For a signed-in BTG desk
   the id is a REAL campaign: GET /campaigns/{id}/ops answers the roster —
   per-athlete order or invitation state, delivered of planned, overdue by
   delivery-health's own rule, what's in review, VERIFIED views — and the
   campaign's health by `assessDelivery`. The hero shows those numbers, not
   the fixture views series (daily reach is the analytics task's, P7-FE-04);
   the roster's drawer drafts and sends the Campaign Order after an accepted
   invitation, the one step that had an endpoint and no screen. Anyone else,
   or any ?demo= state, keeps the fixture dashboard.
   -------------------------------------------------------------------------- */

const OPS_ROLES = ["SUPER_ADMIN", "BTG_ADMIN", "CAMPAIGN_MGR", "NETWORK_MGR", "SALES", "FINANCE"];

/* C-3 (check pass): the ops read answers 403 both for "no such campaign in
   your scope" and for "your role can't read its orders". Asking the campaign
   read tells them apart, so a SALES / NETWORK_MGR user who can see the list
   gets "not in your role" — not "this page doesn't exist". */
/* P4-FE-08 — the campaign read's stage fields (P4-BE-09): what happens next,
   and every stage change with whether the system made it. */
type LiveStage = Pick<ApiCampaign, "nextStep" | "stageChange" | "stageHistory" | "autoStaffing" | "staffing" | "state" | "startDate">;

async function liveOps(id: string): Promise<{ ops: ApiOps; stage: LiveStage | null } | "missing" | { lacking: string; roles: string[] } | null> {
  /* No catch — an outage is an error page, never fixtures dressed as a real
     campaign (QA pass 4 rule). */
  const who = await fetchActor();
  if (who.status !== "linked") return null;
  if (!who.actor.roles.some((r) => OPS_ROLES.includes(r))) return null;
  /* One round trip: the board, and the campaign read for its stage. */
  const [res, c] = await Promise.all([
    apiFetch(`/campaigns/${encodeURIComponent(id)}/ops`),
    apiFetch(`/campaigns/${encodeURIComponent(id)}`),
  ]);
  if (res.status === 403) {
    if (!c.ok) return "missing";
    const { campaign } = (await c.json()) as { campaign: { name: string } };
    return { lacking: campaign.name, roles: who.actor.roles };
  }
  if (!res.ok) throw new Error(`Campaign unavailable (${res.status}).`);
  const stage = c.ok ? ((await c.json()) as { campaign: LiveStage }).campaign : null;
  return { ops: (await res.json()) as ApiOps, stage };
}

/** P4-FE-08 — the next step and the stage history, "Moved automatically"
 *  where the system made the move. */
function StagePanel({ stage }: { stage: LiveStage }) {
  const history = stage.stageHistory ?? (stage.stageChange ? [stage.stageChange] : []);
  if (!stage.nextStep && history.length === 0) return null;
  return (
    <Card className="sx-animate sx-delay-1">
      {stage.nextStep && (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">Next step</span>
          <Badge tone={nextStepTone(stage.nextStep.who)}>{nextStepWho(stage.nextStep)}</Badge>
          <span className="min-w-0 text-sm font-medium [overflow-wrap:anywhere]">{stage.nextStep.text}</span>
        </div>
      )}
      {history.length > 0 && (
        <ol className={`${stage.nextStep ? "mt-4 border-t border-line-soft pt-4" : ""} space-y-2 text-xs text-muted`} aria-label="Stage history">
          {history.map((h) => (
            <li key={`${h.state}-${h.at}`} className="flex min-w-0 flex-wrap items-center gap-2">
              <Badge tone={STATE_TONE[h.state] ?? "neutral"}>{h.state.toLowerCase()}</Badge>
              <span>{stageChangeLine(h)}</span>
              {h.movedAutomatically && h.reason && <span className="text-faint [overflow-wrap:anywhere]">— {h.reason}</span>}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

/** P4-FE-09 — automatic staffing (P4-BE-12) and the launch day (P4-BE-13):
 *  the counts by athlete, why it stopped, who was skipped, the switch with
 *  its reason dialog, and "Launches on …" once the campaign is in APPROVAL. */
function StaffingPanel({ campaignId, stage, now }: { campaignId: string; stage: LiveStage; now: Date }) {
  const s = stage.staffing && "sent" in stage.staffing ? (stage.staffing as CampaignStaffing) : null;
  const launch = stage.state === "APPROVAL" && stage.startDate ? launchLine(stage.startDate, now) : null;
  if (!s && !launch) return null;
  const stop = staffingStop(s);
  const editable = s && (stage.state === "DRAFT" || stage.state === "STAFFING");
  return (
    <Card className="sx-animate sx-delay-1">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-tight">Staffing</h2>
        {s && <span className="text-xs text-muted">Package needs {rangeWords(s.needed)} athletes</span>}
      </div>
      {launch && (
        <p className="mt-3 flex min-w-0 flex-wrap items-center gap-2 text-sm">
          <Badge tone="accent">Automatic</Badge>
          <span className="font-medium">{launch}</span>
          <span className="text-xs text-muted">— BTG can still launch it sooner.</span>
        </p>
      )}
      {s && (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {staffingTiles(s).map((t) => (
              <div key={t.label} className="min-w-0 rounded-lg border border-line-soft px-3 py-2">
                <dt className="text-[10px] uppercase tracking-wide text-faint">{t.label}</dt>
                <dd className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight">{t.value}</dd>
              </div>
            ))}
          </dl>
          {stop && (
            <div role="status" className="mt-4 rounded-lg border border-warn/30 bg-warn/8 px-3 py-2.5 text-xs leading-relaxed">
              <p className="font-semibold text-warn">Automatic staffing stopped — over to BTG</p>
              <p className="mt-0.5 text-muted [overflow-wrap:anywhere]">{stop.reason}</p>
            </div>
          )}
          {s.skips && s.skips.length > 0 && (
            <ul className="mt-4 space-y-1.5 text-xs text-muted" aria-label="Skipped athletes">
              {s.skips.map((k) => (
                <li key={k.athleteId} className="min-w-0 [overflow-wrap:anywhere]">
                  <span className="font-medium text-text">{k.displayName ?? "An athlete"}</span> skipped — {k.reason}
                </li>
              ))}
            </ul>
          )}
          {editable && (
            <div className="mt-4 border-t border-line-soft pt-4">
              {/* Stopped reads as off: turning it on resumes it (the API clears the stop). */}
              <AutoStaffingToggle campaignId={campaignId} on={stage.autoStaffing === true && !stop} action={setAutoStaffingAction} />
            </div>
          )}
        </>
      )}
    </Card>
  );
}

const STATE_TONE: Record<string, "accent" | "warn" | "neutral" | "danger" | "primary"> = {
  ACTIVE: "accent",
  STAFFING: "warn",
  APPROVAL: "warn",
  REPORTING: "primary",
  DRAFT: "neutral",
  COMPLETED: "neutral",
  CANCELLED: "danger",
};

function LiveOpsView({
  ops,
  stage,
  back,
  initial,
}: {
  ops: ApiOps;
  stage: LiveStage | null;
  back: ReturnType<typeof resolveBack>;
  initial: { q: string; show: string };
}) {
  const now = new Date();
  const c = ops.campaign;
  const h = ops.health;
  const rows = ops.roster.map(toRosterRow);
  const pct = verifiedPct(h);
  const reach = reachPct(h);
  const flagged = rows.filter((r) => r.flag).length;
  const left = daysRemaining(c.endDate, now);

  return (
    <div className="space-y-6">
      <BackLink target={back} />

      <div className="sx-animate flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Monogram text={initials(c.sponsorName)} tone="primary" className="size-11 text-xs" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">{c.name}</h1>
              <Badge tone={STATE_TONE[c.state] ?? "neutral"}>{c.state.toLowerCase()}</Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted">
              Presented by {c.sponsorName} · {left > 0 ? `${left} days remaining` : "window closed"}
            </p>
          </div>
        </div>
        <Link
          href={`/sponsor/campaigns/${encodeURIComponent(c.id)}/report?from=campaign`}
          className="rounded-lg bg-primary px-3.5 py-2 text-[11px] font-medium text-cta-ink transition-colors hover:bg-primary-soft"
        >
          Sponsor report
        </Link>
      </div>

      <HeroBand border="border-admin/25" className="sx-animate sx-delay-1">
        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">Delivery</p>
        <p className="mt-1 flex flex-wrap items-baseline gap-2">
          <span className="bg-[linear-gradient(90deg,var(--sx-admin),var(--sx-primary))] bg-clip-text text-4xl font-bold tabular-nums tracking-tight text-transparent sm:text-5xl">
            {pct === null ? "—" : `${pct}%`}
          </span>
          <span className="text-sm text-muted">
            {h.deliverablesTotal
              ? `of ${h.deliverablesTotal} deliverables verified (${h.deliverablesVerified})`
              : "no deliverables yet — they're created when athletes sign their orders"}
          </span>
          <MiniChip kind="ver">POSTGRES</MiniChip>
        </p>
        <div className="mt-4 space-y-2.5 text-xs text-muted">
          <p className="flex items-start gap-2">
            <span className={`mt-1 inline-flex size-2 shrink-0 rounded-full ${h.underDeliveringWork ? "bg-danger" : "bg-success"}`} aria-hidden="true" />
            <span>
              {h.deliverablesOverdue > 0 ? (
                <>
                  <strong className="font-semibold text-text">{h.deliverablesOverdue} overdue</strong> — past their
                  due date and not verified.
                </>
              ) : (
                "Nothing overdue."
              )}
            </span>
          </p>
          <p className="flex items-start gap-2">
            <span className={`mt-1 inline-flex size-2 shrink-0 rounded-full ${h.underDeliveringReach ? "bg-warn" : "bg-success"}`} aria-hidden="true" />
            <span>
              {reach === null ? (
                "No reach projection on these orders, so there's no reach promise to fall short of."
              ) : (
                <>
                  Verified reach{" "}
                  <strong className="font-semibold text-text">{compact(h.verifiedImpressions)}</strong> of the{" "}
                  {compact(h.projectedImpressions ?? 0)} projected ({reach}%)
                  {h.underDeliveringReach ? " — below the 70% shortfall line." : "."}
                </>
              )}{" "}
              <MiniChip kind="ver">VERIFIED</MiniChip>
            </span>
          </p>
          <p className="flex items-start gap-2">
            <span className={`mt-1 inline-flex size-2 shrink-0 rounded-full ${flagged > 0 ? "bg-danger" : "bg-success"}`} aria-hidden="true" />
            <span>
              {flagged > 0 ? (
                <>
                  <strong className="font-semibold text-text">{flagged} of {rows.length}</strong> athletes need
                  attention — the roster below puts them first.
                </>
              ) : rows.length ? (
                "Every athlete on the roster is on track."
              ) : (
                "No athletes on this campaign yet."
              )}
            </span>
          </p>
        </div>
      </HeroBand>

      {stage && <StagePanel stage={stage} />}
      {stage && <StaffingPanel campaignId={c.id} stage={stage} now={now} />}

      <section className="sx-animate sx-delay-2">
        <SectionHeading
          title="Roster"
          hint="Who accepted, what's due, what's late — click an athlete for their order"
        />
        {rows.length ? (
          <RosterOps
            roster={rows}
            initial={initial}
            live={{ campaignId: c.id, draftOrder: draftAndSendOrder }}
          />
        ) : (
          <EmptyState
            mark="inbox"
            title="Nobody on the roster yet"
            hint="Athletes appear here once invitations go out from the Matching Studio."
            action={{ label: "Open the Matching Studio", href: "/admin/campaigns/match" }}
          />
        )}
      </section>
    </div>
  );
}

const PACE_DOT: Record<string, string> = {
  accent: "bg-success",
  warn: "bg-warn",
  danger: "bg-danger",
};

export default async function CampaignDashboardPage({
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
  const one = (v: string | string[] | undefined) =>
    typeof v === "string" ? v : "";
  const back = resolveBack(one(sp.from) || undefined, "admin");

  const live = demo === null ? await liveOps(id) : null;
  if (live === "missing") notFound();
  if (live && "lacking" in live) {
    return (
      <div className="space-y-5">
        <BackLink target={back} />
        <h1 className="text-xl font-semibold tracking-tight">{live.lacking}</h1>
        <EmptyState
          mark="users"
          title="Campaign operations aren't in your role"
          hint={`The delivery board — orders, deliverables and the roster — is for BTG admins, campaign managers and Finance. You're signed in as ${roleLabel(live.roles)}.`}
          action={{ label: "Back to campaigns", href: "/admin/campaigns" }}
        />
      </div>
    );
  }
  if (live) {
    return <LiveOpsView ops={live.ops} stage={live.stage} back={back} initial={{ q: one(sp.q), show: one(sp.show) }} />;
  }

  if (demo === "empty") {
    return (
      <div className="space-y-6">
        <BackLink target={back} />
        <EmptyState
          mark="chart"
          title="No tracking data yet"
          hint="Metrics fill in as deliverables publish."
        />
      </div>
    );
  }

  const d =
    campaignDetailX[id as keyof typeof campaignDetailX] ?? campaignDetailX.c1;
  const c = d.campaign;
  const pace = paceFor(c, d.series);
  const paceCopy = PACE_COPY[pace.band];
  const projection = paceProjection(c, pace.recentPerDay);
  const lands = pace.projectedTotal >= c.viewsTarget;
  const flagged = d.roster.filter((r) => r.flag).length;
  const engagementDelta = (() => {
    const last = d.series[d.series.length - 1]?.b ?? 0;
    const prev = d.series[d.series.length - 2]?.b ?? 0;
    return prev > 0 ? ((last - prev) / prev) * 100 : 0;
  })();

  return (
    <div className="space-y-6">
      <BackLink target={back} />

      {/* --------------------------------------------------------- header */}
      <div className="sx-animate flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Monogram
            text={initials(c.presentedBy)}
            tone="primary"
            className="size-11 text-xs"
          />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">{c.name}</h1>
              <Badge tone="accent">Active</Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted">
              Presented by {c.presentedBy} · {c.daysRemaining} days remaining
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CampaignLauncher
            label="Edit campaign"
            variant="secondary"
            inventory={mediaInv}
            athletes={eligibleAthletes}
            steps={builderSteps}
            draft={builderDraft}
            reward={rewardDraft}
          />
          <Link
            href={`/sponsor/campaigns/${id}/report?from=campaign`}
            className="rounded-lg bg-primary px-3.5 py-2 text-[11px] font-medium text-cta-ink transition-colors hover:bg-primary-soft"
          >
            Sponsor report
          </Link>
        </div>
      </div>

      {/* ------------------------------------------------------- hero band */}
      <HeroBand border="border-admin/25" className="sx-animate sx-delay-1">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_11rem] lg:items-center">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">
              Delivery pacing
            </p>
            <p className="mt-1 flex flex-wrap items-baseline gap-2">
              <span className="bg-[linear-gradient(90deg,var(--sx-admin),var(--sx-primary))] bg-clip-text text-4xl font-bold tabular-nums tracking-tight text-transparent sm:text-5xl">
                {pace.pct}%
              </span>
              <span className="text-sm text-muted">
                of the views target delivered
              </span>
              <MiniChip kind="manual">VERIFIED · MANUAL</MiniChip>
            </p>

            <div className="mt-4 space-y-2.5 text-xs text-muted">
              <p className="flex items-start gap-2">
                <span
                  className="relative mt-1 inline-flex size-2 shrink-0"
                  aria-hidden="true"
                >
                  {paceCopy.tone !== "accent" && (
                    <span
                      className={`sx-viz-pulse absolute inset-0 rounded-full ${PACE_DOT[paceCopy.tone]}`}
                    />
                  )}
                  <span
                    className={`relative inline-flex size-2 rounded-full ${PACE_DOT[paceCopy.tone]}`}
                  />
                </span>
                <span>
                  <strong className="font-semibold text-text">
                    {paceCopy.label}
                  </strong>{" "}
                  — publishing ~{fmtRate(pace.recentPerDay)} views a day over
                  the last two weeks; {fmtRate(pace.neededPerDay)} a day hits
                  the target with {c.daysRemaining} days left.
                </span>
              </p>
              <p className="flex items-start gap-2">
                <span
                  className={`mt-1 inline-flex size-2 shrink-0 rounded-full ${lands ? "bg-success" : "bg-warn"}`}
                  aria-hidden="true"
                />
                <span>
                  At this rate the campaign lands near{" "}
                  <strong className="font-semibold text-text">
                    {compact(pace.projectedTotal)} views
                  </strong>{" "}
                  — {lands ? "above" : "below"} the {compact(c.viewsTarget)}{" "}
                  target.
                </span>
              </p>
              <p className="flex items-start gap-2">
                <span
                  className={`mt-1 inline-flex size-2 shrink-0 rounded-full ${flagged > 0 ? "bg-danger" : "bg-success"}`}
                  aria-hidden="true"
                />
                <span>
                  {flagged > 0 ? (
                    <>
                      <strong className="font-semibold text-text">
                        {flagged} of {d.roster.length}
                      </strong>{" "}
                      athletes need attention — handled in the roster below
                    </>
                  ) : (
                    "Roster healthy — every order accepted and on schedule"
                  )}
                </span>
              </p>
            </div>
          </div>

          <div className="justify-self-center">
            <RadialGauge
              display={`${pace.pct}%`}
              sweep={pace.pct / 100}
              caption="views target"
              sub={`${compact(c.viewsDelivered)} of ${compact(c.viewsTarget)} views`}
            />
          </div>
        </div>
      </HeroBand>

      {d.notice && <BlockedNotice>{d.notice}</BlockedNotice>}

      {/* ----------------------------------------------------- stat tiles */}
      <div className="sx-animate sx-delay-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-[11px] font-medium text-muted">Views delivered</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
            {c.viewsDelivered.toLocaleString()}
          </p>
          <p className="mt-1 text-[10px] text-faint">
            of {c.viewsTarget.toLocaleString()} target ·{" "}
            {pace.remaining.toLocaleString()} to go
          </p>
          <div className="mt-2">
            <Meter value={pace.pct} tone={pace.pct >= 90 ? "accent" : "primary"} />
          </div>
          <div className="mt-2">
            <MiniChip kind="manual">VERIFIED · MANUAL</MiniChip>
          </div>
        </Card>

        <Card className="p-4">
          <p className="text-[11px] font-medium text-muted">Engagements</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums tracking-tight">
              {c.engagements.toLocaleString()}
            </span>
            <span
              className={`text-[11px] font-medium tabular-nums ${engagementDelta >= 0 ? "text-accent" : "text-danger"}`}
            >
              {engagementDelta >= 0 ? "+" : ""}
              {engagementDelta.toFixed(1)}%
            </span>
          </div>
          <div className="mt-2">
            <Sparkline points={d.series.map((p) => p.b ?? 0)} />
          </div>
          <div className="mt-2">
            <MiniChip kind="manual">VERIFIED · MANUAL</MiniChip>
          </div>
        </Card>

        <Card className="p-4">
          <p className="text-[11px] font-medium text-muted">Rewards redeemed</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
            {c.rewardsRedeemed.toLocaleString()}
          </p>
          <p className="mt-1 text-[10px] text-faint">fan QR redemptions</p>
          <div className="mt-2">
            <MiniChip kind="ver">POSTGRES</MiniChip>
          </div>
        </Card>

        <Card className="p-4">
          <p className="text-[11px] font-medium text-muted">Days remaining</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
            {c.daysRemaining}
          </p>
          <p className="mt-1 text-[10px] text-faint">
            needs {fmtRate(pace.neededPerDay)} views a day to hit target
          </p>
          <div className="mt-2">
            <MiniChip kind="est">COMPUTED</MiniChip>
          </div>
        </Card>
      </div>

      {/* ------------------------------------ performance + top content */}
      <div className="sx-animate sx-delay-3 grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="min-w-0">
          <SectionHeading
            title="Performance over time"
            hint="Solid lines are verified history; the dashed tail projects the last two weeks' rate forward."
            action={
              <div className="flex flex-wrap items-center gap-4">
                <ChartLegend aName="Views" bName="Engagements" />
                <span className="flex items-center gap-1.5 text-[11px] text-muted">
                  <span
                    className="w-3 border-t-2 border-dashed border-primary-soft"
                    aria-hidden="true"
                  />
                  Projected
                </span>
              </div>
            }
          />
          <Card>
            <AreaChart
              points={d.series}
              aName="Views"
              bName="Engagements"
              projection={projection}
            />
          </Card>
        </section>

        <section className="min-w-0">
          <SectionHeading title="Top content" hint="Ranked by verified views" />
          <Card>
            <HBarList
              rows={d.topContent.map((t) => ({
                label: t.title,
                sub: t.athlete,
                value: t.views,
                display: compact(t.views),
              }))}
            />
          </Card>
        </section>
      </div>

      {/* --------------------------------- per-athlete operations (§9.9) */}
      <section className="sx-animate sx-delay-4">
        <SectionHeading
          title="Athlete roster"
          hint="Every Campaign Order on this campaign — click a row for the order's story and the action it needs."
        />
        <RosterOps
          roster={d.roster}
          initial={{ q: one(sp.q), show: one(sp.show) }}
        />
      </section>

      {/* ------------------------------------------------------ trust note */}
      <p className="sx-animate sx-delay-4 text-[10px] leading-relaxed text-faint">
        Campaign <code className="font-mono">{id}</code> · fixture data.
        Under-delivery and awaiting-acceptance flags are raised automatically
        as deliverables track against the order schedule.
      </p>
    </div>
  );
}
