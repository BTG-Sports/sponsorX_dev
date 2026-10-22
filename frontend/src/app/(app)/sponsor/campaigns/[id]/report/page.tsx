import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { BackLink } from "@/components/back-link";
import { EmptyState } from "@/components/states";
import { ExportReport } from "@/components/export-report";
import { FunnelSteps } from "@/components/charts";
import { StadiumHint } from "@/components/stadium-hint";
import {
  StadiumChip,
  StadiumDate,
  StadiumGhost,
  StadiumHead,
  StadiumPanel,
  StadiumRange,
  StadiumRow,
  StadiumSection,
  StadiumTile,
  StadiumTiles,
  StadiumUpdated,
  at,
} from "@/components/stadium-stage";
import { StadiumTrend } from "@/components/stadium-trend";
import { resolveBack } from "@/lib/back";
import { buildCampaignRoiReport } from "@/lib/campaign-report-data";
import { demoState } from "@/lib/demo";
import { formatCount } from "@/lib/format-count";
import { campaignDetailX, sponsorCampaigns } from "@/lib/fixtures";
import type { SearchParams } from "@/lib/list-query";
import type { ApiSponsorReport, Sourced } from "@/lib/report-live";
import { monogramOf } from "@/lib/sponsor-live";
import { rangeParam, type DailyPoint, type RangeKey, type SponsorOverview } from "@/lib/sponsor-overview-live";
import { RESULTS_NOTE } from "@/lib/sponsor-intelligence-live";
import { FUNNEL_WORDS, campaignWord, compactNumber, deliverableWord, orderWord, sourceWord } from "@/lib/sponsor-words";
import { apiFetch, fetchActor } from "@/server/api";
import { fetchSponsorOverview } from "@/server/sponsor-overview";

/* --------------------------------------------------------------------------
   Sponsor Campaign Results — on the Stadium Board (P1-ART-23 Task 11, spec
   2026-10-11 §7.5). This is the screen the renewal conversation happens
   over, for a sponsor who isn't technical: statistics first, plain words,
   honest about where every number comes from.

   Every figure is a read (memory: stats-must-be-retrievable):
     GET /campaigns/:id/report      every tile (all time), the fan journey,
                                     "how sure are we", clicks by post, posts,
                                     observations, edition placements
     GET /sponsor/overview?campaignId=   the trend chart and best athletes
                                     for the chosen window
   Nothing is summed from rows on screen. §22's layers are never blended —
   the "How sure are we?" panel shows each source's own share, never a total.

   LIVE vs DEMO. A signed-in sponsor (or BTG) sees the real report. Anyone
   else, and ?demo=empty|loading|error, gets a sample built from the same two
   fixture campaigns (c1, c3) the campaign detail page uses, under a "Sample
   data" pill — same components, same layout, same honesty about what's a
   read and what isn't.
   -------------------------------------------------------------------------- */

const REPORT_ROLES = ["SUPER_ADMIN", "BTG_ADMIN", "CAMPAIGN_MGR", "SALES", "SPONSOR_ADMIN", "SPONSOR_ANALYST"];

type ReportOverview = { daily: DailyPoint[]; bucket: "day" | "week"; topAthletes: SponsorOverview["topAthletes"]; readAt?: string };

/** The overview is secondary to the report (the trend chart and best
 *  athletes, not the headline numbers) — a 5xx here degrades to the trend
 *  panel's own "couldn't load" text, never the whole report page. */
async function safeOverview(range: RangeKey, id: string): Promise<SponsorOverview | null | "error"> {
  try {
    return await fetchSponsorOverview(range, id);
  } catch {
    return "error";
  }
}

async function liveReport(
  id: string,
  range: RangeKey,
): Promise<{ report: ApiSponsorReport; overview: SponsorOverview | null; overviewUnavailable?: "error" } | "missing" | null> {
  /* No catch — an outage is an error page, never fixtures dressed as the
     sponsor's real results (QA pass 4 rule). */
  const who = await fetchActor();
  if (who.status !== "linked") return null;
  if (!who.actor.roles.some((r) => REPORT_ROLES.includes(r))) return null;
  /* The report and the overview are independent reads — one round trip, not two in series. */
  const [res, overviewResult] = await Promise.all([apiFetch(`/campaigns/${encodeURIComponent(id)}/report`), safeOverview(range, id)]);
  if (res.status === 403) return "missing";
  if (!res.ok) throw new Error(`Report unavailable (${res.status}).`);
  const report = (await res.json()) as ApiSponsorReport;
  const overview = overviewResult === "error" ? null : overviewResult;
  return { report, overview, overviewUnavailable: overviewResult === "error" ? "error" : undefined };
}

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/* ---------------------------------------------------------- the page shell */

export default async function CampaignResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <StadiumGhost label="Loading your campaign's results" tiles={4} />;
  if (demo === "error") throw new Error("Demo error state");

  const { id } = await params;
  const sp = await searchParams;
  const range = rangeParam(sp);
  const fromParam = Array.isArray(sp.from) ? sp.from[0] : sp.from;
  const back = fromParam === "sponsor-campaign" ? { href: `/sponsor/campaigns/${id}`, label: "Back to campaign" } : resolveBack(fromParam, "sponsor");

  const live = demo === null ? await liveReport(id, range) : null;
  if (live === "missing") notFound();
  if (live) {
    const overview: ReportOverview | null = live.overview
      ? { daily: live.overview.daily, bucket: live.overview.range.bucket, topAthletes: live.overview.topAthletes, readAt: live.overview.readAt }
      : null;
    return (
      <Report
        r={live.report}
        overview={overview}
        overviewUnavailable={live.overviewUnavailable}
        back={back}
        sample={false}
        range={range}
        sp={sp}
      />
    );
  }

  /* Results build from verified deliverables and rolled-up metrics —
     nothing to show until the first ones land. */
  if (demo === "empty") {
    return (
      <div className="space-y-5">
        <BackLink target={back} />
        <StadiumHead title="Results" pill="Sample data" />
        <StadiumPanel delay={0.1}>
          <p className="text-sm text-muted">No report data yet. The results build as deliverables verify and metrics roll up.</p>
        </StadiumPanel>
      </div>
    );
  }

  const built = demoReportFor(id);
  if (!built) {
    return (
      <div className="space-y-5">
        <BackLink target={back} />
        <EmptyState
          mark="chart"
          title="Not a sample campaign"
          hint="This page only has sample campaigns so far — a real campaign's results come from a real read, not a fixture."
          action={{ label: "Back to campaigns", href: "/sponsor/campaigns" }}
        />
      </div>
    );
  }
  return <Report r={built.report} overview={built.overview} back={back} sample range={range} sp={sp} />;
}

/* -------------------------------------------------------------- the report */

function Report({
  r, overview, overviewUnavailable, back, sample, range, sp,
}: {
  r: ApiSponsorReport;
  overview: ReportOverview | null;
  overviewUnavailable?: "error";
  back: { href: string; label: string };
  sample: boolean;
  range: RangeKey;
  sp: SearchParams;
}) {
  const path = `/sponsor/campaigns/${encodeURIComponent(r.campaign.id)}/report`;
  const pill = sample ? "Sample data" : <StadiumUpdated iso={overview?.readAt ?? new Date().toISOString()} />;
  const word = campaignWord(r.campaign.state);

  return (
    <div className="space-y-6">
      <BackLink target={back} />

      <StadiumHead
        title={`Results · ${r.campaign.name}`}
        pill={pill}
        actions={
          <>
            <StadiumRange current={range} path={path} params={sp} />
            {sample && <ExportReport payload={{ kind: "campaign-roi", report: buildCampaignRoiReport(r.campaign.id) }} />}
          </>
        }
      >
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StadiumChip tone={word.tone}>{word.text}</StadiumChip>
          <span className="text-xs text-muted">
            {fmtDay(r.campaign.startDate)} – {fmtDay(r.campaign.endDate)}
          </span>
        </div>
        {r.objective && <p className="mt-1.5 max-w-2xl text-xs text-muted [overflow-wrap:anywhere]">{r.objective}</p>}
      </StadiumHead>

      <Tiles r={r} />

      <div className="grid gap-4 lg:grid-cols-3">
        <StadiumPanel delay={0.4} className="min-w-0 lg:col-span-2">
          {overview && overview.daily.length > 0 ? (
            <StadiumTrend points={overview.daily} bucket={overview.bucket} />
          ) : (
            <Quiet>
              {overviewUnavailable === "error"
                ? "This window's trend couldn't load — refresh to try again."
                : overview
                ? "Nothing recorded in this window yet."
                : "Your login can see this campaign's headline numbers but not the day-by-day trend. Ask the person who runs your account for access."}
            </Quiet>
          )}
        </StadiumPanel>
        <HowSureAreWe r={r} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <FunnelPanel r={r} />
        <BestAthletes overview={overview} />
      </div>

      <Athletes roster={r.roster} />

      <ClicksByPost assets={r.deliveredAssets} />

      {r.observations.length > 0 && (
        <section className="sx-stadium-in min-w-0" style={at(0.74)}>
          <StadiumSection title="What stands out" hint="Worked out from the figures above." />
          <StadiumPanel>
            <ul className="space-y-1.5 text-[12.5px] leading-relaxed text-muted">
              {r.observations.map((o) => (
                <li key={o}>• {o}</li>
              ))}
            </ul>
          </StadiumPanel>
        </section>
      )}

      <PostsGallery assets={r.deliveredAssets} />

      {r.adPlacements.length > 0 && r.editionEngagement && (
        <section className="sx-stadium-in min-w-0" style={at(0.9)}>
          <StadiumSection title="Edition placements" hint="Print and digital kept apart — pooling them would say something untrue." />
          <StadiumPanel>
            <p className="text-[12.5px] text-muted">
              {r.adPlacements.length} position{r.adPlacements.length === 1 ? "" : "s"} · {r.editionEngagement.print.QR_SCAN.toLocaleString("en-US")} print QR
              scans · {r.editionEngagement.digital.LINK_CLICK.toLocaleString("en-US")} digital link clicks
            </p>
          </StadiumPanel>
        </section>
      )}
      <p className="max-w-3xl text-xs leading-relaxed text-faint" data-note="results">{RESULTS_NOTE}</p>
    </div>
  );
}

/* --------------------------------------------------------------- the tiles */

function Title({ children, hint }: { children: string; hint?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
      <h2 className="sx-section-title">{children}</h2>
      {hint && <StadiumHint label={children} text={hint} />}
    </div>
  );
}

function Quiet({ children }: { children: ReactNode }) {
  return <p className="py-4 text-sm leading-relaxed text-muted">{children}</p>;
}

function QuietTile({ label, hint, text, delay = 0.1 }: { label: string; hint?: string; text: string; delay?: number }) {
  return (
    <div className="sx-stadium-panel sx-stadium-in px-4 pb-3.5 pt-3.5" style={at(delay)}>
      <dt className="flex items-center gap-1.5 text-[12px] text-muted">
        {label}
        {hint && <StadiumHint label={label} text={hint} />}
      </dt>
      <dd className="mt-1">
        <p className="text-[12.5px] leading-relaxed text-muted">{text}</p>
      </dd>
    </div>
  );
}

/** What was computed from the report's own numbers, not the backend's
 *  jargon-laden basis sentence (that one stays as-is for the PDF render) —
 *  a sponsor reads "what you've spent ÷ people reached, × 1,000", not
 *  "VERIFIED impressions … platform APIs". */
function mediaValueHint(r: ApiSponsorReport): string {
  const views = r.performance.verifiedViews;
  if (views <= 0) {
    return "What you've spent divided by the people your posts reached that we could check, times 1,000. Numbers athletes reported themselves aren't counted.";
  }
  const spendCents = Math.round((r.mediaValue.amount * views) / 1000);
  return `What you've spent (${formatCount(spendCents, "usd0")}) divided by the people your posts reached that we could check (${views.toLocaleString("en-US")}), times 1,000. Numbers athletes reported themselves aren't counted.`;
}

function Tiles({ r }: { r: ApiSponsorReport }) {
  const views = r.performance.verifiedViews;
  const selfReported = r.performance.views.SELF_REPORTED;
  const estimated = r.performance.views.ESTIMATED;
  const otherViews = selfReported + estimated;
  /* "reported by athletes" only when that's really the whole of it — once a
     second non-checked source (ESTIMATED) is mixed in, naming just athletes
     would be wrong, so the caption goes generic instead of misattributing. */
  const otherCaption =
    otherViews === 0 ? "All time" : estimated > 0 ? `+${otherViews.toLocaleString("en-US")} more from other sources · All time` : `+${otherViews.toLocaleString("en-US")} more reported by athletes · All time`;
  const engagements = r.performance.verifiedEngagements;
  const redeemed = r.redemption.redeemed;
  const issued = r.redemption.issued;
  const hint = mediaValueHint(r);
  return (
    <StadiumTiles cols={4}>
      <StadiumTile
        label="People reached"
        value={views}
        caption={otherCaption}
        hint="People who saw your sponsored posts, checked by the platform or by BTG. Numbers the athletes reported themselves are shown apart, never added in."
        delay={0.1}
      />
      <StadiumTile
        label="Likes, comments & shares"
        value={engagements}
        caption={views > 0 ? `${((engagements / views) * 100).toFixed(1)}% of people reached · All time` : "All time"}
        hint="How many times people reacted to your checked posts."
        delay={0.16}
      />
      <StadiumTile
        label="Fans who redeemed"
        value={redeemed}
        caption={issued > 0 ? `of ${issued.toLocaleString("en-US")} issued · All time` : "All time"}
        hint="Fans who scanned your QR code and used your offer."
        delay={0.22}
      />
      {views > 0 ? (
        <StadiumTile
          label="What you pay per 1,000 people reached"
          value={r.mediaValue.amount}
          format="usd"
          caption="All time"
          hint={hint}
          delay={0.28}
        />
      ) : (
        <QuietTile
          label="What you pay per 1,000 people reached"
          hint={hint}
          text="No checked reach yet — figures appear once posts are live and checked."
          delay={0.28}
        />
      )}
    </StadiumTiles>
  );
}

/* ----------------------------------------------------- how sure are we? */

const SOURCE_ORDER: (keyof Sourced)[] = ["VERIFIED_API", "VERIFIED_MANUAL", "SELF_REPORTED", "ESTIMATED", "ATTRIBUTED"];
const IS_VERIFIED = new Set<keyof Sourced>(["VERIFIED_API", "VERIFIED_MANUAL"]);

function HowSureAreWe({ r }: { r: ApiSponsorReport }) {
  const v = r.performance.views;
  const total = SOURCE_ORDER.reduce((n, s) => n + v[s], 0);
  const rows = SOURCE_ORDER.filter((s) => v[s] > 0);
  return (
    <StadiumPanel delay={0.46} className="min-w-0">
      <Title hint="Where your reach comes from. Checked sources — the platform's own count, or a BTG staff check — carry the most confidence; everything else is shown apart, never blended in.">
        How sure are we?
      </Title>
      {rows.length === 0 ? (
        <Quiet>No checked reach yet — figures appear once posts are live and checked.</Quiet>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((s) => {
            const share = total ? Math.round((v[s] / total) * 100) : 0;
            const verified = IS_VERIFIED.has(s);
            return (
              <li key={s} className="flex items-center justify-between gap-3 text-[12.5px]">
                <span className="flex min-w-0 items-center gap-2 text-text">
                  <span aria-hidden="true" className={verified ? "text-success" : "text-muted"}>
                    {verified ? "✓" : "○"}
                  </span>
                  <span className="truncate">{sourceWord(s)}</span>
                </span>
                <span className="shrink-0 tabular-nums text-muted">
                  {share}% · {compactNumber(v[s])}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </StadiumPanel>
  );
}

/* --------------------------------------------------- funnel · best athletes */

function FunnelPanel({ r }: { r: ApiSponsorReport }) {
  const f = r.funnel;
  const total = f.SCAN + f.LANDING + f.CLAIM + f.REDEEM;
  return (
    <StadiumPanel delay={0.52} className="min-w-0">
      <Title hint="Every step a fan takes with your offer: scanning your QR code, opening the offer, claiming it, then using it.">
        From scan to redeemed
      </Title>
      {total === 0 ? (
        <Quiet>No QR scans yet. They show here once fans scan your code at an event.</Quiet>
      ) : (
        <FunnelSteps
          stages={[
            { label: FUNNEL_WORDS.scan, value: f.SCAN },
            { label: FUNNEL_WORDS.landing, value: f.LANDING },
            { label: FUNNEL_WORDS.claim, value: f.CLAIM },
            { label: FUNNEL_WORDS.redeem, value: f.REDEEM },
          ]}
        />
      )}
    </StadiumPanel>
  );
}

function BestAthletes({ overview }: { overview: ReportOverview | null }) {
  return (
    <StadiumPanel flush delay={0.58} className="min-w-0">
      <div className="px-5 pt-5">
        <Title hint="The athletes whose posts for you reached the most people, counting checked figures only, over the period you've chosen above.">Best athletes</Title>
      </div>
      {!overview || overview.topAthletes.length === 0 ? (
        <div className="px-5 pb-3">
          <Quiet>
            {overview
              ? "No checked reach yet. Athletes show here once their posts for you are counted."
              : "Your login can see this campaign's headline numbers but not the athlete breakdown."}
          </Quiet>
        </div>
      ) : (
        <div className="pb-1">
          {overview.topAthletes.map((a, i) => (
            <StadiumRow
              key={a.athleteId}
              i={i}
              lead={monogramOf(a.name)}
              title={a.name}
              sub={[`No. ${i + 1}`, a.sport].filter(Boolean).join(" · ")}
              right={
                <span className="block">
                  <span className="block text-[13px] font-bold tabular-nums text-text">{compactNumber(a.views)}</span>
                  <span className="block text-[11px] text-muted">people reached</span>
                </span>
              }
            />
          ))}
        </div>
      )}
    </StadiumPanel>
  );
}

/** Every athlete on this campaign and their delivery, from the report's own
 *  roster — never dependent on the overview window, so this stays populated
 *  even when the overview read is degraded or the role can't see it. Bounded
 *  so one campaign's long roster can't run the panel off the page. */
const ATHLETES_SHOWN = 20;

function Athletes({ roster }: { roster: ApiSponsorReport["roster"] }) {
  const rows = roster.slice(0, ATHLETES_SHOWN);
  return (
    <StadiumPanel flush delay={0.6} className="min-w-0">
      <div className="px-5 pt-5">
        <Title hint="Every athlete staffed on this campaign and how many of their posts are checked and counted.">Athletes</Title>
      </div>
      {rows.length === 0 ? (
        <div className="px-5 pb-3">
          <Quiet>No athletes staffed yet.</Quiet>
        </div>
      ) : (
        <div className="pb-1">
          {rows.map((a, i) => (
            <StadiumRow
              key={a.athleteId}
              i={i}
              lead={monogramOf(a.athleteName)}
              title={a.athleteName}
              sub={orderWord(a.orderState).text}
              right={
                <span className="block">
                  <span className="block text-[13px] font-bold tabular-nums text-text">
                    {a.deliverablesVerified}/{a.deliverablesTotal}
                  </span>
                  <span className="block text-[11px] text-muted">posts checked</span>
                </span>
              }
            />
          ))}
          {roster.length > ATHLETES_SHOWN && (
            <p className="px-5 pb-3 pt-1 text-[11px] text-muted">+{roster.length - ATHLETES_SHOWN} more athletes not shown.</p>
          )}
        </div>
      )}
    </StadiumPanel>
  );
}

/* ------------------------------------------------- clicks by post · gallery */

function ClicksByPost({ assets }: { assets: ApiSponsorReport["deliveredAssets"] }) {
  return (
    <section className="sx-stadium-in min-w-0" style={at(0.64)}>
      <StadiumSection title="Link clicks by post" hint="Taps on your tracked link in each athlete's post." />
      {assets.length === 0 ? (
        <StadiumPanel>
          <Quiet>No posts published yet. Clicks show here once a post goes live.</Quiet>
        </StadiumPanel>
      ) : (
        <StadiumPanel flush>
          <ul className="divide-y divide-line-soft">
            {assets.map((a) => {
              const w = deliverableWord(a.state);
              return (
                <li key={a.deliverableId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-text">{a.title}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      <StadiumChip tone={w.tone}>{w.text}</StadiumChip>
                      {a.publishedUrl && (
                        <a
                          href={a.publishedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] font-medium text-sponsor hover:underline"
                        >
                          Open post ↗
                        </a>
                      )}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[13px] font-bold tabular-nums text-text">{a.trackedClicks.toLocaleString("en-US")}</span>
                    <span className="block text-[11px] text-muted">clicks</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </StadiumPanel>
      )}
    </section>
  );
}

function PostsGallery({ assets }: { assets: ApiSponsorReport["deliveredAssets"] }) {
  const published = assets.filter((a) => a.publishedUrl);
  return (
    <section className="sx-stadium-in min-w-0" style={at(0.8)}>
      <StadiumSection title="Published posts" hint="Every post that's gone live for this campaign." />
      {published.length === 0 ? (
        <StadiumPanel>
          <Quiet>Nothing published yet. Your athletes&rsquo; posts show up here once they go live.</Quiet>
        </StadiumPanel>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {published.map((a) => (
            <StadiumPanel key={a.deliverableId} className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-text">{a.title}</p>
              {a.publishedAt && <p className="mt-1 text-[11px] text-muted"><StadiumDate iso={a.publishedAt} format="date" /></p>}
              <a href={a.publishedUrl!} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-[11px] font-medium text-sponsor hover:underline">
                Open post ↗
              </a>
            </StadiumPanel>
          ))}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------- demo build */

const DEMO_WINDOWS: Record<string, [string, string]> = {
  c1: ["2026-09-01", "2026-10-23"],
  c3: ["2026-08-20", "2026-10-31"],
};

const SPORT_BY_SLUG: Record<string, string> = {
  "shammah-kwizera": "Basketball",
  "marcus-reed": "Basketball",
  "jalen-brooks": "Football",
  "amara-okafor": "Track & field",
  "leila-haddad": "Soccer",
};

/** A plausible, deterministic source split for a demo total — no
 *  Math.random, no `new Date()`, so every render agrees. */
function splitSourced(total: number, apiShare: number, manualShare: number): Sourced {
  const VERIFIED_API = Math.round(total * apiShare);
  const VERIFIED_MANUAL = Math.round(total * manualShare);
  const SELF_REPORTED = Math.max(0, total - VERIFIED_API - VERIFIED_MANUAL);
  return { VERIFIED_API, VERIFIED_MANUAL, SELF_REPORTED, ESTIMATED: 0, ATTRIBUTED: 0 };
}

/** A gentle upward daily curve over the campaign's window, summing to each
 *  total exactly — deterministic, for the demo trend chart. */
function demoDaily(totalViews: number, totalClicks: number, totalRedeems: number, start: string, end: string): DailyPoint[] {
  const DAY = 86_400_000;
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  const span = Math.max(1, Math.round((endMs - startMs) / DAY) + 1);
  const points = Math.min(span, 30);
  const step = Math.max(1, Math.floor(span / points));
  const firstMs = endMs - (points - 1) * step * DAY;
  const weights = Array.from({ length: points }, (_, i) => 0.6 + 0.8 * (points === 1 ? 1 : i / (points - 1)));
  const sum = weights.reduce((a, b) => a + b, 0);
  const spread = (total: number) => {
    const out = weights.map((w) => Math.round((w / sum) * total));
    out[out.length - 1] += total - out.reduce((a, b) => a + b, 0);
    return out;
  };
  const v = spread(totalViews);
  const c = spread(totalClicks);
  const red = spread(totalRedeems);
  return Array.from({ length: points }, (_, i) => ({
    day: new Date(firstMs + i * step * DAY).toISOString().slice(0, 10),
    views: v[i],
    clicks: c[i],
    redeems: red[i],
  }));
}

/** The sample report for the two fixture campaigns the campaign detail page
 *  also uses (c1, c3) — null for any other id, so a real campaign's id never
 *  silently renders a stranger's sample numbers. */
function demoReportFor(id: string): { report: ApiSponsorReport; overview: ReportOverview } | null {
  const base = sponsorCampaigns.find((c) => c.id === id);
  const rich = campaignDetailX[id as keyof typeof campaignDetailX];
  if (!base || !rich) return null;
  const window = DEMO_WINDOWS[id] ?? ["2026-08-01", "2026-10-31"];

  const views = splitSourced(rich.campaign.viewsDelivered, 0.68, 0.24);
  const verifiedViews = views.VERIFIED_API + views.VERIFIED_MANUAL;
  const engagements = splitSourced(rich.campaign.engagements, 0.74, 0.21);
  const verifiedEngagements = engagements.VERIFIED_API + engagements.VERIFIED_MANUAL;

  const ratio = rich.campaign.rewardsRedeemed / 1_870;
  const funnel = {
    SCAN: Math.round(8_200 * ratio),
    LANDING: Math.round(6_410 * ratio),
    CLAIM: Math.round(4_300 * ratio),
    REDEEM: rich.campaign.rewardsRedeemed,
  };

  const amount = verifiedViews > 0 ? Math.round((base.spend / verifiedViews) * 1000) : 0;
  const basis =
    verifiedViews > 0
      ? `${formatCount(base.spend, "usd0")} of spend against ${verifiedViews.toLocaleString("en-US")} people reached from checked sources only. Self-reported figures are excluded.`
      : "No checked reach was recorded, so this can't be worked out. Self-reported and estimated figures are shown separately above and are deliberately not used here.";

  const deliveredAssets = rich.topContent.map((c, i) => ({
    deliverableId: `${id}-asset-${i}`,
    title: c.title,
    state: "VERIFIED",
    publishedUrl: "https://www.instagram.com/p/demo-post/",
    publishedAt: `${window[0]}T00:00:00.000Z`,
    trackedClicks: Math.round(c.views * 0.015),
  }));

  const report: ApiSponsorReport = {
    campaign: { id, name: base.name, state: base.state, startDate: `${window[0]}T00:00:00.000Z`, endDate: `${window[1]}T00:00:00.000Z`, budget: base.spend },
    objective: null,
    roster: rich.roster.map((r) => ({
      athleteId: r.slug,
      athleteName: r.name,
      jobId: "demo",
      orderState: r.order,
      deliverablesTotal: r.planned,
      deliverablesVerified: r.delivered,
    })),
    deliveredAssets,
    performance: { views, engagements, verifiedViews, verifiedEngagements },
    funnel,
    adPlacements: [],
    editionEngagement: null,
    redemption: { issued: funnel.SCAN, redeemed: funnel.REDEEM, rate: funnel.SCAN ? funnel.REDEEM / funnel.SCAN : 0 },
    mediaValue: { amount, basis, source: "ESTIMATED" },
    observations: rich.notice ? [rich.notice] : [],
  };

  const topAthletes = [...rich.roster]
    .sort((a, b) => b.views - a.views)
    .slice(0, 5)
    .map((r) => ({ athleteId: r.slug, name: r.name, sport: SPORT_BY_SLUG[r.slug] ?? null, views: r.views }));

  const daily = demoDaily(verifiedViews, deliveredAssets.reduce((n, a) => n + a.trackedClicks, 0), funnel.REDEEM, window[0], window[1]);

  return { report, overview: { daily, bucket: "day", topAthletes } };
}
