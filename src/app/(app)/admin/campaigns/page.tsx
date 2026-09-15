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
  rewardDraft,
} from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Campaigns list — the admin "Campaigns" workspace (2026-09-15).

   The nav's Campaigns item now lands here, on the roster of campaigns, rather
   than jumping straight into one. Each card opens its operations dashboard at
   /admin/campaigns/[id]. Creating a campaign is a popup launched from this
   page's header (CampaignLauncher) — the old /admin/campaigns/new route and
   its nav item are gone.
   -------------------------------------------------------------------------- */

export default function CampaignsListPage() {
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
            {campaigns.length} campaign{campaigns.length === 1 ? "" : "s"} · pick
            one to manage delivery, roster and rewards — §9.9.
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
