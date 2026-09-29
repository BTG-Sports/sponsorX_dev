import Link from "next/link";
import { CampaignLauncher } from "@/components/campaign-launcher";
import { Badge, Meter } from "@/components/ui";
import { EmptyState } from "@/components/states";
import { compact } from "@/components/charts";
import { Monogram, initials } from "@/components/hero";
import {
  builderDraft,
  builderSteps,
  campaignDetailX,
  eligibleAthletes,
  mediaInv,
  money,
  rewardDraft,
} from "@/lib/fixtures";
import { JOBS, MATCH_BRIEF } from "@/lib/matching";
import { ADMIN_CAMPAIGN_SORTS, groupCounts, groupParam } from "@/lib/admin-campaign-groups";
import { textParam, type SearchParams } from "@/lib/list-query";
import { apiFetch, fetchActor } from "@/server/api";
import { fetchCampaignSummary, type CampaignSummary } from "@/server/campaigns";
import { fetchAdminCampaignPage, type AdminCampaignPage } from "@/server/admin-campaigns";
import { CampaignsBoard } from "./campaigns-board";

/* --------------------------------------------------------------------------
   Campaigns list — the admin "Campaigns" workspace (2026-09-15).

   The nav's Campaigns item now lands here, on the roster of campaigns, rather
   than jumping straight into one. Each card opens its operations dashboard at
   /admin/campaigns/[id]. Creating a campaign is a popup launched from this
   page's header (CampaignLauncher) — the old /admin/campaigns/new route and
   its nav item are gone.
   -------------------------------------------------------------------------- */

/* LIVE vs DEMO (P5-FE-05). A signed-in BTG desk sees the tenant's REAL
   campaigns — GET /campaigns for state, package, athletes and delivery,
   each row carrying delivery health's under-delivery flags (the same rule
   the ops board uses). Staffing campaigns open their brief's Matching
   Studio; delivering ones their operations board. Nobody else sees
   anything but the fixture list.

   SERVER-PAGED (2026-09-29). The old grouped list (Needs attention /
   Delivering / Staffing / Closed) fetched every campaign and every health
   row to group them in the browser. The groups are now tabs (?group), and
   the page asks the API for ONE page of the tab (?q ?sort ?page ?size);
   tab counts come from GET /campaigns/summary's byState and the flagged
   count GET /campaigns answers with. */

const DESK_ROLES = ["SUPER_ADMIN", "BTG_ADMIN", "CAMPAIGN_MGR", "NETWORK_MGR", "SALES", "FINANCE"];

/* A 403 is the API's answer for a role, not an outage (F-02, QA pass 5):
   FINANCE and SALES read campaigns but not delivery health. The page then
   renders without that part and says so; a 403 on the list itself is the
   whole page out of scope. Anything else non-OK still throws to the error
   page — an outage is never fixtures dressed as real data. */
type Waiting = { toMatch: number; qualified: number; approved: number; drafts: number } | null;

type LiveResult =
  | { kind: "ok"; list: AdminCampaignPage; summary: CampaignSummary; waiting: Waiting }
  | { kind: "denied" };

/* P4-FE-07 (rcfworks) — the "briefs waiting on BTG" banner, merged onto the
   server-paged board: the three counts are `page.total` of a one-row page of
   GET /briefs per state (never the brief list itself). A role that doesn't
   read briefs (403) simply gets no banner. */
async function briefsWaiting(): Promise<Waiting> {
  const total = async (state: string) => {
    const res = await apiFetch(`/briefs?page=1&size=1&state=${state}`);
    if (res.status === 403) return null;
    if (!res.ok) throw new Error(`Briefs unavailable (${res.status}).`);
    return ((await res.json()) as { page: { total: number } }).page.total;
  };
  const [qualified, approved, drafts] = await Promise.all([total("QUALIFIED"), total("APPROVED"), total("DRAFT")]);
  if (qualified === null || approved === null || drafts === null) return null;
  if (qualified + approved + drafts === 0) return null;
  return { toMatch: qualified + approved, qualified, approved, drafts };
}

/** P4-FE-07 — the link to briefs waiting on BTG. Hidden when nothing waits. */
function BriefsWaiting({ waiting }: { waiting: NonNullable<Waiting> }) {
  const parts = [
    waiting.qualified ? `${waiting.qualified} qualified` : null,
    waiting.approved ? `${waiting.approved} approved` : null,
  ].filter(Boolean);
  return (
    <Link
      href={waiting.toMatch ? "/admin/briefs?tab=QUALIFIED" : "/admin/briefs?tab=DRAFT"}
      className="flex items-center gap-4 rounded-xl border border-primary/35 bg-gradient-to-r from-primary/15 via-surface to-surface px-4 py-3.5 transition-colors hover:border-primary/60"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/15 text-base font-semibold tabular-nums text-primary">
        {waiting.toMatch || waiting.drafts}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold">
          {waiting.toMatch
            ? `${waiting.toMatch} ${waiting.toMatch === 1 ? "brief" : "briefs"} waiting for matching →`
            : `${waiting.drafts} ${waiting.drafts === 1 ? "brief" : "briefs"} waiting to qualify →`}
        </span>
        <span className="mt-0.5 block text-[11px] text-muted">
          {waiting.toMatch
            ? `${parts.join(", ")}.${waiting.drafts ? ` Another ${waiting.drafts} ${waiting.drafts === 1 ? "is" : "are"} still in Draft, waiting to qualify.` : ""}`
            : "Qualify a brief to send it to the Matching Studio."}
        </span>
      </span>
      {waiting.drafts > 0 && <Badge tone="warn">{waiting.drafts} in Draft</Badge>}
    </Link>
  );
}

async function liveCampaigns(sp: SearchParams): Promise<LiveResult | null> {
  const who = await fetchActor();
  if (who.status !== "linked") return null;
  if (!who.actor.roles.some((r) => DESK_ROLES.includes(r))) return null;
  const [list, summary, waiting] = await Promise.all([fetchAdminCampaignPage(sp), fetchCampaignSummary(), briefsWaiting()]);
  if (list === null || summary === null) return { kind: "denied" };
  return { kind: "ok", list, summary, waiting };
}

function LiveCampaignsList({ list, summary, waiting, sp }: { list: AdminCampaignPage; summary: CampaignSummary; waiting: Waiting; sp: SearchParams }) {
  const counts = groupCounts(summary.byState, summary.total, list.healthVisible ? list.attention : null);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Campaigns</h1>
        <p className="mt-1 text-xs text-muted">
          {summary.total} {summary.total === 1 ? "campaign" : "campaigns"} — staffing ones open their
          Matching Studio, delivering ones their operations board.
        </p>
        {!list.healthVisible && (
          <p className="mt-2 text-[11px] text-faint">
            Delivery health (overdue work, reach shortfalls) is outside your
            role, so no campaign is flagged here.
          </p>
        )}
      </div>
      {waiting && <BriefsWaiting waiting={waiting} />}
      {summary.total === 0 ? (
        <p className="rounded-xl border border-line bg-surface px-5 py-10 text-center text-xs text-muted">
          No campaigns yet — an approved brief becomes one when its first invitations go out.
        </p>
      ) : (
        <CampaignsBoard
          rows={list.campaigns}
          page={list.page}
          group={groupParam(sp, list.healthVisible)}
          counts={counts}
          q={textParam(sp, "q")}
          sort={textParam(sp, "sort", ADMIN_CAMPAIGN_SORTS)}
        />
      )}
    </div>
  );
}

export default async function CampaignsListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const live = await liveCampaigns(sp);
  if (live?.kind === "denied") {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold tracking-tight">Campaigns</h1>
        <EmptyState
          mark="inbox"
          title="Campaigns are outside your role"
          hint="The campaign roster is read by BTG's campaign and network desks; your role reads its own slice elsewhere (§15)."
        />
      </div>
    );
  }
  if (live) return <LiveCampaignsList list={live.list} summary={live.summary} waiting={live.waiting} sp={sp} />;

  const campaigns = Object.entries(campaignDetailX).map(([id, d]) => ({
    id,
    c: d.campaign,
    needsAttention: Boolean(d.notice),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Campaigns</h1>
          <p className="mt-1 text-xs text-muted">
            {campaigns.length + 1} campaigns · one staffing, {campaigns.length}{" "}
            delivering — pick one to manage matching, delivery, roster and
            rewards.
          </p>
        </div>
        <CampaignLauncher
          label="New campaign"
          inventory={mediaInv}
          athletes={eligibleAthletes}
          steps={builderSteps}
          draft={builderDraft}
          reward={rewardDraft}
        />
      </div>

      <ul className="grid gap-4 lg:grid-cols-2">
        {/* The campaign currently in STAFFING — its card opens the Matching
            Studio (P4-ART-01), not the delivery dashboard: there is nothing
            to deliver until the roster is staffed and invitations go out. */}
        <li>
          <Link
            href="/admin/campaigns/match"
            className="group block rounded-xl border border-line bg-surface p-5 transition-all hover:border-admin/30 hover:bg-surface-2/40"
          >
            <div className="flex items-start gap-3">
              <Monogram
                text={initials(MATCH_BRIEF.sponsor)}
                tone="accent"
                className="size-10 text-[11px]"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-sm font-semibold tracking-tight">
                    {MATCH_BRIEF.campaign}
                  </h2>
                  <Badge tone="warn">STAFFING</Badge>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-muted">
                  Presented by {MATCH_BRIEF.sponsor} · step 3 of 12 — matching
                  &amp; roster review
                </p>
              </div>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              >
                <path d="m9 5 7 7-7 7" />
              </svg>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              {JOBS.map((j) => (
                <span
                  key={j.id}
                  className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2/60 px-2 py-0.5 text-[10px] font-medium text-muted"
                >
                  <span className="tabular-nums text-text">{j.id}</span>
                  {j.label}
                  <span className="tabular-nums text-faint">×{j.slots}</span>
                </span>
              ))}
            </div>

            <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line-soft pt-4">
              <Stat label="Budget" value={money(MATCH_BRIEF.budget)} />
              <Stat label="Needed" value={`${MATCH_BRIEF.needed} athletes`} />
              <Stat label="Market" value={MATCH_BRIEF.market} />
            </dl>
          </Link>
        </li>

        {campaigns.map(({ id, c, needsAttention }) => {
          const pct = c.viewsTarget
            ? Math.min(100, Math.round((c.viewsDelivered / c.viewsTarget) * 100))
            : 0;
          return (
            <li key={id}>
              <Link
                href={`/admin/campaigns/${id}`}
                className="group block rounded-xl border border-line bg-surface p-5 transition-all hover:border-admin/30 hover:bg-surface-2/40"
              >
                <div className="flex items-start gap-3">
                  <Monogram
                    text={initials(c.presentedBy)}
                    tone="primary"
                    className="size-10 text-[11px]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-sm font-semibold tracking-tight">
                        {c.name}
                      </h2>
                      <Badge tone={c.state === "ACTIVE" ? "accent" : "neutral"}>
                        {c.state}
                      </Badge>
                      {needsAttention && <Badge tone="warn">Needs attention</Badge>}
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-muted">
                      Presented by {c.presentedBy} · {c.daysRemaining} days
                      remaining
                    </p>
                  </div>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  >
                    <path d="m9 5 7 7-7 7" />
                  </svg>
                </div>

                <div className="mt-4">
                  <div className="mb-1.5 flex items-baseline justify-between text-[11px]">
                    <span className="text-muted">Views delivered</span>
                    <span className="font-medium tabular-nums text-text">
                      {compact(c.viewsDelivered)}{" "}
                      <span className="text-faint">/ {compact(c.viewsTarget)}</span>
                    </span>
                  </div>
                  <Meter value={pct} tone={pct >= 60 ? "accent" : "primary"} />
                </div>

                <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line-soft pt-4">
                  <Stat label="Pacing" value={`${pct}%`} />
                  <Stat label="Engagements" value={compact(c.engagements)} />
                  <Stat label="Rewards" value={compact(c.rewardsRedeemed)} />
                </dl>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-faint">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums tracking-tight">
        {value}
      </dd>
    </div>
  );
}
