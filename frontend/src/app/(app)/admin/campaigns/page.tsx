import Link from "next/link";
import { CampaignLauncher } from "@/components/campaign-launcher";
import { Badge, Meter } from "@/components/ui";
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
import type { ApiCampaign } from "@/lib/sponsor-live";
import { apiFetch, fetchActor } from "@/server/api";

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
   joined with GET /operations/delivery-health for the under-delivery flags
   (the same rule the ops board uses). Staffing campaigns open their brief's
   Matching Studio; delivering ones their operations board. Nobody else sees
   anything but the fixture list. */

type Health = {
  campaignId: string;
  deliverablesOverdue: number;
  underDeliveringWork: boolean;
  underDeliveringReach: boolean;
};

const DESK_ROLES = ["SUPER_ADMIN", "BTG_ADMIN", "CAMPAIGN_MGR", "NETWORK_MGR", "SALES", "FINANCE"];

async function liveCampaigns(): Promise<{ campaigns: ApiCampaign[]; health: Health[] } | null> {
  const who = await fetchActor();
  if (who.status !== "linked") return null;
  if (!who.actor.roles.some((r) => DESK_ROLES.includes(r))) return null;
  const [cRes, hRes] = await Promise.all([apiFetch("/campaigns"), apiFetch("/operations/delivery-health")]);
  if (!cRes.ok) throw new Error(`Campaigns unavailable (${cRes.status}).`);
  if (!hRes.ok) throw new Error(`Delivery health unavailable (${hRes.status}).`);
  return {
    campaigns: ((await cRes.json()) as { campaigns: ApiCampaign[] }).campaigns,
    health: ((await hRes.json()) as { campaigns: Health[] }).campaigns,
  };
}

const STAFFING = new Set(["DRAFT", "STAFFING", "APPROVAL"]);
const DELIVERING = new Set(["ACTIVE", "REPORTING"]);

function LiveCampaignsList({ campaigns, health }: { campaigns: ApiCampaign[]; health: Health[] }) {
  const byId = new Map(health.map((h) => [h.campaignId, h]));
  const groups = [
    { key: "attention", title: "Needs attention", items: campaigns.filter((c) => { const h = byId.get(c.id); return h && (h.underDeliveringWork || h.underDeliveringReach); }) },
    { key: "delivering", title: "Delivering", items: campaigns.filter((c) => DELIVERING.has(c.state) && !(byId.get(c.id)?.underDeliveringWork || byId.get(c.id)?.underDeliveringReach)) },
    { key: "staffing", title: "Staffing", items: campaigns.filter((c) => STAFFING.has(c.state)) },
    { key: "closed", title: "Closed", items: campaigns.filter((c) => c.state === "COMPLETED" || c.state === "CANCELLED") },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Campaigns</h1>
        <p className="mt-1 text-xs text-muted">
          {campaigns.length} {campaigns.length === 1 ? "campaign" : "campaigns"} — staffing ones open their
          Matching Studio, delivering ones their operations board.
        </p>
      </div>
      {campaigns.length === 0 && (
        <p className="rounded-xl border border-line bg-surface px-5 py-10 text-center text-xs text-muted">
          No campaigns yet — an approved brief becomes one when its first invitations go out.
        </p>
      )}
      {groups.map((g) => (
        <section key={g.key} className="space-y-3">
          <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted">
            {g.title} <span className="text-faint">· {g.items.length}</span>
          </h2>
          <ul className="grid gap-4 lg:grid-cols-2">
            {g.items.map((c) => {
              const h = byId.get(c.id);
              const href = STAFFING.has(c.state)
                ? `/admin/campaigns/match${c.briefId ? `?brief=${encodeURIComponent(c.briefId)}` : ""}`
                : `/admin/campaigns/${encodeURIComponent(c.id)}`;
              const pct = c.deliverables.total ? Math.round((100 * c.deliverables.done) / c.deliverables.total) : 0;
              return (
                /* min-w-0: a long campaign name must truncate, not widen
                   the grid track past a phone's width. */
                <li key={c.id} className="min-w-0">
                  <Link
                    href={href}
                    className="group block rounded-xl border border-line bg-surface p-5 transition-all hover:border-admin/30 hover:bg-surface-2/40"
                  >
                    <div className="flex items-start gap-3">
                      <Monogram text={initials(c.sponsorName)} tone="primary" className="size-10 text-[11px]" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-sm font-semibold tracking-tight">{c.name}</h3>
                          <Badge tone={c.state === "ACTIVE" ? "accent" : STAFFING.has(c.state) ? "warn" : "neutral"}>
                            {c.state}
                          </Badge>
                          {h?.underDeliveringWork && <Badge tone="danger">{h.deliverablesOverdue} overdue</Badge>}
                          {h?.underDeliveringReach && <Badge tone="warn">Reach short</Badge>}
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-muted">
                          Presented by {c.sponsorName} · {c.package?.name ?? "custom"}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4">
                      <div className="mb-1.5 flex items-baseline justify-between text-[11px]">
                        <span className="text-muted">Deliverables published</span>
                        <span className="font-medium tabular-nums text-text">
                          {c.deliverables.done} <span className="text-faint">/ {c.deliverables.total}</span>
                        </span>
                      </div>
                      <Meter value={pct} tone={h?.underDeliveringWork ? "primary" : "accent"} />
                    </div>
                    <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line-soft pt-4">
                      <Stat label="Athletes" value={String(c.athletes)} />
                      <Stat label="Contracted" value={typeof c.contracted === "number" ? money(c.contracted) : "—"} />
                      <Stat
                        label="Ends"
                        value={new Date(c.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
                      />
                    </dl>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default async function CampaignsListPage() {
  const live = await liveCampaigns();
  if (live) return <LiveCampaignsList campaigns={live.campaigns} health={live.health} />;

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
