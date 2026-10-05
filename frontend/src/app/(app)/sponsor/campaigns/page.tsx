import { Badge, BlockedNotice, SectionHeading } from "@/components/ui";
import { toRequestRow } from "@/lib/brief-status";
import { EmptyState, SkeletonPage } from "@/components/states";
import {
  SponsorCampaignsList,
  type CampaignRow,
} from "@/components/sponsor-campaigns-list";
import { demoState } from "@/lib/demo";
import { sponsor, sponsorCampaigns, sponsorCampaignsX } from "@/lib/fixtures";
import { toCampaignRow } from "@/lib/sponsor-live";
import { textParam } from "@/lib/list-query";
import { SponsorCampaignsServer } from "@/components/sponsor-campaigns-server";
import { CAMPAIGN_SORTS, CAMPAIGN_STATES } from "@/server/campaigns";
import { liveSponsorCampaignPage, liveSponsorRequests } from "@/server/sponsor";

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

   LIVE (P2-FE-01). A signed-in sponsor gets their own campaigns from
   GET /campaigns — the same read, scope and money gating as the dashboard —
   as the same island. Views stay the ROI report's, so a live card shows "—"
   rather than a number nobody measured. Anyone else, or any ?demo= state,
   keeps the fixture portfolio.

   SERVER-PAGED (2026-09-29). The live list is one page from GET /campaigns
   (?page ?size ?q ?state ?sort, done in the database) plus the summary's
   unfiltered total for the header — the browser never holds the portfolio.
   -------------------------------------------------------------------------- */

export default async function SponsorCampaignsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") throw new Error("Demo error state");

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) =>
    typeof v === "string" ? v : "";
  const initial = {
    q: one(sp.q),
    status: one(sp.status),
    pace: one(sp.pace),
    sort: one(sp.sort),
    page: one(sp.page),
    size: one(sp.size),
  };

  const live = demo === null ? await liveSponsorCampaignPage(sp) : null;
  if (live) {
    const now = new Date();
    const liveRows = live.rows.map((c) => toCampaignRow(c, now));
    const total = live.summary.total;
    /* P4-FE-09 — requests not yet a campaign, each with its plain status. */
    const requests = (await liveSponsorRequests()).map(toRequestRow);
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Campaigns</h1>
          <p className="mt-1 text-xs text-muted">
            {live.rows[0]?.sponsorName ? `${live.rows[0].sponsorName} · ` : ""}
            {total} {total === 1 ? "campaign" : "campaigns"} · pick
            one for delivery, roster and its ROI report
          </p>
        </div>
        {requests.length > 0 && (
          <section aria-label="Your requests">
            <SectionHeading title="Your requests" hint="Requests that aren't a campaign yet." />
            <ul className="space-y-2">
              {requests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line bg-surface px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{r.title}</span>
                    <span className="block text-[11px] text-muted">
                      {r.budget} · sent {r.submitted}
                    </span>
                  </span>
                  <span className="flex min-w-0 basis-full items-center gap-2 sm:basis-auto">
                    <Badge tone={r.tone}>{r.status.key === "APPROVED" ? "Approved" : "In review"}</Badge>
                    <span className="min-w-0 text-xs text-text [overflow-wrap:anywhere]">{r.status.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {total === 0 ? (
          <EmptyState
            mark="chart"
            title="No campaigns yet"
            hint="Your campaigns appear here as soon as your first request is approved."
            action={{ label: "Browse the marketplace", href: "/sponsor/marketplace" }}
          />
        ) : (
          <SponsorCampaignsServer
            rows={liveRows}
            page={live.page}
            q={textParam(sp, "q")}
            state={textParam(sp, "state", CAMPAIGN_STATES)}
            sort={textParam(sp, "sort", CAMPAIGN_SORTS)}
          />
        )}
        <p className="text-[10px] text-faint">
          Campaign state, package, athletes and delivery are from Postgres;
          spend is your contracted Campaign Orders. Views and engagement are in
          each campaign&rsquo;s ROI report. Pacing compares delivery progress
          against elapsed campaign time — flagging under-delivery is your BTG
          campaign manager&rsquo;s job (§9.9).
        </p>
      </div>
    );
  }

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

  return (
    <div className="space-y-6">
      {heading}

      {/* P7-QA-02: no live read here yet (P2-FE-01) — a signed-in sponsor
          would otherwise take this sample portfolio for their own. */}
      {!demo && (
        <BlockedNotice>
          Demo data — this list is a sample portfolio, not your campaigns. Your
          real campaigns, spend and invoices are on the{" "}
          <a href="/sponsor" className="underline">Dashboard</a>.
        </BlockedNotice>
      )}

      <SponsorCampaignsList
        rows={rows}
        demoParam={one(sp.demo) || undefined}
        initial={initial}
      />

      <p className="text-[10px] text-faint">
        Fixture data. Pacing compares delivery progress against elapsed campaign
        time — flagging under-delivery is your BTG campaign manager&rsquo;s job
        (§9.9), surfaced here so you never have to discover it.
      </p>
    </div>
  );
}
