import { RewardsDesk } from "@/components/rewards-desk";
import { LiveRewardsDesk } from "@/components/live-rewards-desk";
import { ServerList } from "@/components/server-pager";
import {
  campaignPickerPath,
  pickerOptions,
  rewardDeskFilters,
  type ApiReward,
  type RewardSummary,
} from "@/lib/rewards-live";
import { apiListQuery, type PageInfo, type SearchParams } from "@/lib/list-query";
import { apiFetch, fetchActor } from "@/server/api";
import {
  campaignAthletesAction,
  createRewardAction,
  moveRewardAction,
  qrLinkAction,
  rewardDetailAction,
  searchCampaignsAction,
} from "./actions";
import { SkeletonPage } from "@/components/states";
import { BlockedNotice } from "@/components/ui";
import { demoState } from "@/lib/demo";
import {
  REWARD_COPY,
  REWARD_TYPES,
  eligibleAthletes,
  rewardDraft,
  rewardSteps,
  rewards,
} from "@/lib/fixtures";
import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";

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

/* SERVER-PAGED (2026-09-29). The desk reads ONE page of rewards for the
   URL's ?page ?size ?q ?tab ?campaignId, plus GET /rewards/summary for the
   tab counts and the strip — counted in the database over every reward, not
   over the page. The creator's campaign picker starts from the first page of
   rewardable campaigns by name and searches the API as you type
   (searchCampaignsAction); nothing loads every campaign any more. */
async function liveDesk(sp: SearchParams) {
  /* No catch — an outage is an error page, never fixtures dressed as the
     real rewards (QA pass 4 rule). */
  const who = await fetchActor();
  if (who.status !== "linked") return null;
  if (!who.actor.roles.some((r) => DESK_ROLES.includes(r))) return null;
  const filters = rewardDeskFilters(sp);
  const scope = filters.campaignId ? `?${new URLSearchParams({ campaignId: filters.campaignId })}` : "";
  const [rRes, sRes, cRes] = await Promise.all([
    apiFetch(`/rewards${apiListQuery(sp, { q: filters.q, tab: filters.tab === "all" ? "" : filters.tab, campaignId: filters.campaignId })}`),
    apiFetch(`/rewards/summary${scope}`),
    apiFetch(campaignPickerPath("")),
  ]);
  if (!rRes.ok) throw new Error(`Rewards unavailable (${rRes.status}).`);
  if (!sRes.ok) throw new Error(`Reward summary unavailable (${sRes.status}).`);
  if (!cRes.ok) throw new Error(`Campaigns unavailable (${cRes.status}).`);
  const r = (await rRes.json()) as { rewards: ApiReward[]; page: PageInfo; consent: { version: string; text: string } };
  const summary = (await sRes.json()) as RewardSummary;
  const c = (await cRes.json()) as {
    campaigns: { id: string; name: string; sponsorName: string; endDate: string; state: string }[];
    page?: { total?: number };
  };
  const campaigns = pickerOptions(c.campaigns);
  return {
    rewards: r.rewards,
    page: r.page,
    consent: r.consent,
    summary,
    filters,
    campaigns: { campaigns, total: c.page?.total ?? campaigns.length },
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
  /* C-1: a staff role this desk isn't for gets "not in your role", not the
     sample desk. The demo stays for ?demo= and signed-out visitors. */
  if (demo === null) {
    const lacking = await staffWithoutAccess("/admin/rewards");
    if (lacking) return <NotInRole path="/admin/rewards" title="Rewards" roles={lacking} />;
  }

  const sp = await searchParams;
  const pick = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const live = demo === null ? await liveDesk(sp) : null;
  if (live) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="sx-page-title">Fan Rewards</h1>
          <p className="mt-1 text-xs text-muted">
            QR rewards fans scan at events — reward → per-athlete tokens → scan →
            claim → redeem (§16).
          </p>
        </div>
        <ServerList>
          <LiveRewardsDesk
            rewards={live.rewards}
            page={live.page}
            summary={live.summary}
            filters={live.filters}
            campaigns={live.campaigns}
            consent={live.consent}
            openNew={pick("new") === "1"}
            actions={{
              create: createRewardAction,
              move: moveRewardAction,
              detail: rewardDetailAction,
              qrLink: qrLinkAction,
              athletes: campaignAthletesAction,
              campaigns: searchCampaignsAction,
            }}
          />
        </ServerList>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="sx-page-title">Fan Rewards</h1>
        <p className="mt-1 text-xs text-muted">
          QR rewards fans scan at events — reward → per-athlete tokens → scan →
          claim → redeem (§16).
        </p>
      </div>

      {/* P7-QA-02: this fixture branch also reaches signed-in staff outside
          the desk's roles (NETWORK_MGR, SALES, FINANCE). */}
      {demo === null && (
        <BlockedNotice>
          Demo data — the live rewards desk is read by BTG admin and the
          Campaign Manager, so every reward and count below is sample data.
        </BlockedNotice>
      )}

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
