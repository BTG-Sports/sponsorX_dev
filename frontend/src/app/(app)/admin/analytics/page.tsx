import { AnalyticsStory } from "@/components/analytics-story";
import { EmptyState, SkeletonPage } from "@/components/states";
import { demoState } from "@/lib/demo";
import type { RangeKey } from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Analytics — the guided story (spec 2026-09-17). Unifies the mockup's
   screen 11 (fan/reward analytics) and §9's screen 11 (athlete performance)
   into five chapters; the old warning stub is chapter 5 now. The server
   page keeps only the demo-state switch and seeds the range from the URL —
   everything else lives in the analytics-story island.
   -------------------------------------------------------------------------- */

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
      <h1 className="text-xl font-semibold tracking-tight">Analytics</h1>
      <p className="mt-1 text-xs text-muted">
        The story of your rewards and the athletes behind them — five
        chapters, read top to bottom.
      </p>
    </div>
  );

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

  return (
    <div className="space-y-6">
      {heading}
      <AnalyticsStory initialRange={range} />
    </div>
  );
}
