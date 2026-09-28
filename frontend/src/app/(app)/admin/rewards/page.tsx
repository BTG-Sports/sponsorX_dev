import { RewardsDesk } from "@/components/rewards-desk";
import { LiveRewardsDesk } from "@/components/live-rewards-desk";
import type { ApiReward } from "@/lib/rewards-live";
import type { ApiCampaign } from "@/lib/sponsor-live";
import { apiFetch, fetchActor } from "@/server/api";
import {
  campaignAthletesAction,
  createRewardAction,
  moveRewardAction,
  qrLinkAction,
  rewardDetailAction,
} from "./actions";
import { SkeletonPage } from "@/components/states";
import { demoState } from "@/lib/demo";
import {
  REWARD_COPY,
  REWARD_TYPES,
  eligibleAthletes,
  rewardDraft,
  rewardSteps,
  rewards,
} from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Fan Rewards — /admin/rewards (2026-09-16). The list now leads: every §16
   reward with search, status/type filters, sort and the shared pager, and
   "Create reward" opens the wizard in a modal instead of navigating away.
   The old /admin/rewards/new URL redirects here with ?new=1, which opens the
   modal on load.

   The server page's job is small: seed the desk from the URL and hand it the
   fixtures the creator needs (steps, draft, redemption types, athletes for
   per-athlete tokens). The desk owns everything interactive.

   LIVE vs DEMO (P6-FE-01). A signed-in BTG rewards desk gets the
   LiveRewardsDesk on real rewards — GET /rewards (four-event funnels, the
   consent line) and GET /campaigns for what a new reward can attach to —
   with lifecycle moves, per-athlete QR tokens (PNG via audited signed URL)
   and a creator that persists what the Reward model holds. Anyone else, or
   any ?demo= state, keeps the fixture desk and wizard.
   -------------------------------------------------------------------------- */

const DESK_ROLES = ["SUPER_ADMIN", "BTG_ADMIN", "CAMPAIGN_MGR"];
/** A reward needs athletes signed onto the campaign to carry its tokens. */
const REWARDABLE = new Set(["STAFFING", "APPROVAL", "ACTIVE", "REPORTING"]);

async function liveDesk() {
  /* No catch — an outage is an error page, never fixtures dressed as the
     real rewards (QA pass 4 rule). */
  const who = await fetchActor();
  if (who.status !== "linked") return null;
  if (!who.actor.roles.some((r) => DESK_ROLES.includes(r))) return null;
  const [rRes, cRes] = await Promise.all([apiFetch("/rewards"), apiFetch("/campaigns")]);
  if (!rRes.ok) throw new Error(`Rewards unavailable (${rRes.status}).`);
  if (!cRes.ok) throw new Error(`Campaigns unavailable (${cRes.status}).`);
  const r = (await rRes.json()) as { rewards: ApiReward[]; consent: { version: string; text: string } };
  const { campaigns } = (await cRes.json()) as { campaigns: ApiCampaign[] };
  return {
    rewards: r.rewards,
    consent: r.consent,
    campaigns: campaigns
      .filter((c) => REWARDABLE.has(c.state))
      .map((c) => ({ id: c.id, name: c.name, sponsorName: c.sponsorName, endDate: c.endDate })),
  };
}

export default async function AdminRewardsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") throw new Error("Demo error state");

  const sp = await searchParams;
  const pick = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const live = demo === null ? await liveDesk() : null;
  if (live) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Fan Rewards</h1>
          <p className="mt-1 text-xs text-muted">
            QR rewards fans scan at events — reward → per-athlete tokens → scan →
            claim → redeem (§16).
          </p>
        </div>
        <LiveRewardsDesk
          rewards={live.rewards}
          campaigns={live.campaigns}
          consent={live.consent}
          openNew={pick("new") === "1"}
          actions={{
            create: createRewardAction,
            move: moveRewardAction,
            detail: rewardDetailAction,
            qrLink: qrLinkAction,
            athletes: campaignAthletesAction,
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Fan Rewards</h1>
        <p className="mt-1 text-xs text-muted">
          QR rewards fans scan at events — reward → per-athlete tokens → scan →
          claim → redeem (§16).
        </p>
      </div>

      <RewardsDesk
        rows={demo === "empty" ? [] : rewards}
        copy={REWARD_COPY}
        demoParam={demo ?? undefined}
        initial={{
          q: pick("q"),
          status: pick("status"),
          type: pick("type"),
          sort: pick("sort"),
          page: pick("page"),
          size: pick("size"),
          new: pick("new"),
        }}
        creator={{
          steps: rewardSteps,
          draft: rewardDraft,
          types: REWARD_TYPES,
          athletes: eligibleAthletes,
        }}
      />
    </div>
  );
}
