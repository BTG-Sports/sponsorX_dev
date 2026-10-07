import { AnalyticsStory } from "@/components/analytics-story";
import { EmptyState, SkeletonPage } from "@/components/states";
import { demoState } from "@/lib/demo";
import type { RangeKey } from "@/lib/fixtures";
import { toLiveStory, type ApiAnalytics, type LiveStory } from "@/lib/analytics-live";
import { apiFetch, fetchActor } from "@/server/api";

/* --------------------------------------------------------------------------
   Analytics — the guided story (spec 2026-09-17). Unifies the mockup's
   screen 11 (fan/reward analytics) and §9's screen 11 (athlete performance)
   into five chapters; the old warning stub is chapter 5 now. The server
   page keeps only the demo-state switch and seeds the range from the URL —
   everything else lives in the analytics-story island.

   LIVE vs DEMO (P6-FE-03 / P7-FE-04). A signed-in BTG desk reads the story
   from Postgres: GET /operations/analytics for 7, 30 and 90 days — the
   four-event funnel, daily claims and redemptions, scan locations, offers
   by redemption, and per-athlete performance (reach by provenance, clicks,
   on-time delivery, revision rate, §14 score). Fetched up front so the
   range pills stay instant. Anyone else, or any ?demo= state, keeps the
   fixture story.
   -------------------------------------------------------------------------- */

const DESK_ROLES = ["SUPER_ADMIN", "BTG_ADMIN", "CAMPAIGN_MGR", "NETWORK_MGR", "FINANCE", "SALES"];

/** The API refused this role (403) — not an outage (F-02, QA pass 5). */
const DENIED = "denied" as const;

async function liveStory(): Promise<Record<RangeKey, LiveStory> | typeof DENIED | null> {
  /* No catch — an outage is an error page, never fixtures dressed as real
     analytics (QA pass 4 rule). A 403 is the one non-OK answer that is not
     an outage: FINANCE and SALES sit on this sidebar but the tenant-wide
     story is outside their role, so they get the out-of-scope message. */
  const who = await fetchActor();
  if (who.status !== "linked") return null;
  if (!who.actor.roles.some((r) => DESK_ROLES.includes(r))) return null;
  const ranges: [RangeKey, number][] = [["7d", 7], ["30d", 30], ["90d", 90]];
  const out = await Promise.all(
    ranges.map(async ([k, days]) => {
      const res = await apiFetch(`/operations/analytics?days=${days}`);
      if (res.status === 403) return null;
      if (!res.ok) throw new Error(`Analytics unavailable (${res.status}).`);
      return [k, toLiveStory((await res.json()) as ApiAnalytics)] as const;
    }),
  );
  if (out.some((e) => e === null)) return DENIED;
  return Object.fromEntries(out as [RangeKey, LiveStory][]) as Record<RangeKey, LiveStory>;
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const demo = await demoState(Promise.resolve(sp));
  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") throw new Error("Demo error state");

  const rawRange = Array.isArray(sp.range) ? sp.range[0] : sp.range;
  const range: RangeKey =
    rawRange === "7d" || rawRange === "90d" ? rawRange : "30d";

  const heading = (
    <div>
      <h1 className="sx-page-title">Analytics</h1>
      <p className="mt-1 text-xs text-muted">
        The story of your rewards and the athletes behind them — five
        chapters, read top to bottom.
      </p>
    </div>
  );

  const live = demo === null ? await liveStory() : null;

  if (demo === "empty") {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState
          mark="chart"
          title="No reward events yet"
          hint="Scans, claims and redemptions appear once QR rewards go live (B6)."
        />
      </div>
    );
  }

  if (live === DENIED) {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState
          mark="chart"
          title="Analytics are BTG's"
          hint="These are tenant-wide reward and athlete figures; your role reads its own slice elsewhere (§15)."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {heading}
      <AnalyticsStory initialRange={range} live={live ?? undefined} />
    </div>
  );
}
