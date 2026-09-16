import { EmptyState, SkeletonPage } from "@/components/states";
import {
  SponsorCampaignsList,
  type CampaignRow,
} from "@/components/sponsor-campaigns-list";
import { demoState } from "@/lib/demo";
import { sponsor, sponsorCampaigns, sponsorCampaignsX } from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Sponsor Campaigns list — §9, sponsor portal (2026-09-15).

   The nav's "Campaigns" item lands here, on the sponsor's own portfolio,
   rather than jumping straight into one campaign's ROI report. Each card opens
   that campaign's dashboard at /sponsor/campaigns/[id], which links on to the
   ROI report. Owner-framed: this is the sponsor's roster of campaigns, not an
   operator's workspace — no "New campaign" launcher (Phase 1 is managed; BTG
   staff create campaigns from submitted briefs).

   The server page shapes the rows (source of truth sponsorCampaigns c1–c5, so
   the list agrees with the dashboard's "N campaigns") and hands them to the
   SponsorCampaignsList client island, which owns instant search / status /
   pacing filters / sort, seeded from and synced to the URL.
   -------------------------------------------------------------------------- */

export default async function SponsorCampaignsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") throw new Error("Demo error state");

  const heading = (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Campaigns</h1>
      {demo === "empty" ? (
        <p className="mt-1 text-xs text-muted">{sponsor.name}</p>
      ) : (
        <p className="mt-1 text-xs text-muted">
          {sponsor.name} · {sponsorCampaigns.length} campaigns · pick one for
          delivery, roster and its ROI report
        </p>
      )}
    </div>
  );

  /* Brand-new sponsor tenant: no brief matched yet — no portfolio to list. */
  if (demo === "empty") {
    return (
      <div className="space-y-5">
        {heading}
        <EmptyState
          mark="chart"
          title="No campaigns yet"
          hint="Your campaigns appear here once BTG matches your first brief."
          action={{ label: "Browse the marketplace", href: "/sponsor/marketplace" }}
        />
      </div>
    );
  }

  const rows: CampaignRow[] = sponsorCampaigns.map((c) => {
    const x = sponsorCampaignsX[c.id];
    const [done, total] = c.deliverables;
    return {
      id: c.id,
      name: c.name,
      pkg: c.pkg,
      athletes: c.athletes,
      done,
      total,
      pct: total ? Math.round((done / total) * 100) : 0,
      spend: c.spend,
      views: x.views,
      monogram: x.monogram,
      endsIn: x.endsIn,
      state: c.state,
      behind: x.pacing === "BEHIND",
    };
  });

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) =>
    typeof v === "string" ? v : "";

  return (
    <div className="space-y-6">
      {heading}

      <SponsorCampaignsList
        rows={rows}
        demoParam={one(sp.demo) || undefined}
        initial={{
          q: one(sp.q),
          status: one(sp.status),
          pace: one(sp.pace),
          sort: one(sp.sort),
          page: one(sp.page),
          size: one(sp.size),
        }}
      />

      <p className="text-[10px] text-faint">
        Fixture data. Pacing compares delivery progress against elapsed campaign
        time — flagging under-delivery is your BTG campaign manager&rsquo;s job
        (§9.9), surfaced here so you never have to discover it.
      </p>
    </div>
  );
}
