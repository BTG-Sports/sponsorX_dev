import { RewardsDesk } from "@/components/rewards-desk";
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
   -------------------------------------------------------------------------- */

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
