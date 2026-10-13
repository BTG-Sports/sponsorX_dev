import Link from "next/link";
import type { ReactNode } from "react";

import { EnginePending, SampleBanner } from "@/components/engine-pending";
import { StadiumHint } from "@/components/stadium-hint";
import {
  StadiumBar,
  StadiumChip,
  StadiumDate,
  StadiumGhost,
  StadiumHead,
  StadiumPanel,
  StadiumRange,
  StadiumRow,
  StadiumTile,
  StadiumTiles,
  StadiumUpdated,
  at,
} from "@/components/stadium-stage";
import { demoState } from "@/lib/demo";
import { confidenceLabel, cpm, pct } from "@/lib/intelligence";
import type { SearchParams } from "@/lib/list-query";
import { monogramOf } from "@/lib/sponsor-live";
import {
  SAMPLE_SPONSOR_INTEL,
  classTiles,
  formatWord,
  partnerKindWord,
  rankFormats,
  rankPartners,
  renewalWord,
  renewalsDue,
  sourcedSegments,
  sponsorIntelPath,
  type SponsorIntel,
} from "@/lib/sponsor-intelligence-live";
import { rangeParam, type RangeKey } from "@/lib/sponsor-overview-live";
import { compactNumber, sourceWord } from "@/lib/sponsor-words";
import { readEngine, wantsSample } from "@/server/engine";

/* --------------------------------------------------------------------------
   Sponsor intelligence hub — 3S7-FE-01, on the Stadium Board. What worked
   across every one of the sponsor's campaigns: the four kinds of result kept
   apart, the best formats and partners, the audience (only where a source is
   named) and which campaigns are worth renewing.

   Reads GET /intelligence/sponsor?range=   (proposed — the engine isn't
         mounted yet; lib/sponsor-intelligence-live.ts has the contract)
   Scoped by the API to the signed-in sponsor's own org.

   Decided 2026-10-13, "FE only, honest empty states": until the engine
   answers, the page is its title and <EnginePending> — no figure at all.
   A real API failure throws to the error boundary. ?demo=sample (dev only)
   previews the live layout from SAMPLE_SPONSOR_INTEL under a banner;
   ?demo=loading|empty|error render the branded states.
   -------------------------------------------------------------------------- */

const PATH = "/sponsor/intelligence";
const TITLE = "Campaign insights";

export default async function SponsorIntelligencePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <StadiumGhost label="Loading your campaign insights" tiles={5} />;
  if (demo === "error") throw new Error("Demo error state");

  const sp = await searchParams;
  const range = rangeParam(sp);

  if (demo === "empty") return <NoCampaigns pill="Sample data" />;

  if (await wantsSample(searchParams)) {
    return (
      <div className="space-y-6">
        <SampleBanner />
        <Hub sp={sp} range={range} data={{ ...SAMPLE_SPONSOR_INTEL, range }} pill="Sample data" />
      </div>
    );
  }

  const read = await readEngine<SponsorIntel>("sponsorHub", sponsorIntelPath(range));
  if (read.state === "pending") {
    return (
      <div className="space-y-6">
        <StadiumHead title={TITLE} />
        <div className="sx-stadium-in" style={at(0.1)}>
          <EnginePending engine={read.engine} audience="sponsor" />
        </div>
      </div>
    );
  }
  return <Hub sp={sp} range={range} data={read.data} pill={<StadiumUpdated iso={read.data.asOf} />} />;
}

/* ------------------------------------------------------------- the page */

function NoCampaigns({ pill }: { pill?: ReactNode }) {
  return (
    <div className="space-y-6">
      <StadiumHead title={TITLE} pill={pill} />
      <StadiumPanel delay={0.1} className="text-center">
        <p className="text-base font-semibold text-text">No campaigns to learn from yet</p>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">
          Insights show up here once your first campaigns have run: what worked, which athletes did best, and what&rsquo;s worth renewing.
        </p>
        <Link href="/sponsor/marketplace" className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-xs font-semibold">
          Browse packages to start one →
        </Link>
      </StadiumPanel>
    </div>
  );
}

function Hub({ sp, range, data: d, pill }: { sp: SearchParams; range: RangeKey; data: SponsorIntel; pill: ReactNode }) {
  if (d.campaigns.count === 0) return <NoCampaigns pill={pill} />;
  return (
    <div className="space-y-6">
      <StadiumHead title={TITLE} pill={pill} actions={<StadiumRange current={range} path={PATH} params={sp} />}>
        <StadiumTiles cols={5}>
          <StadiumTile
            label="Campaigns counted"
            value={d.campaigns.count}
            caption={`${d.campaigns.active.toLocaleString("en-US")} running now`}
            hint="Every campaign of yours with results in this period. The insights below are worked out across all of them."
            href="/sponsor/campaigns"
            delay={0.1}
          />
          {classTiles(d.totals).map((t, i) => (
            <StadiumTile key={t.cls} label={t.label} value={t.value} format={t.format} caption={t.caption} hint={t.hint} delay={0.16 + i * 0.06} />
          ))}
        </StadiumTiles>
      </StadiumHead>

      <div className="grid gap-4 lg:grid-cols-3">
        <Formats d={d} />
        <Renewals d={d} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Partners d={d} />
        <Audience d={d} />
      </div>
    </div>
  );
}

/* --------------------------------------------------------- panel helpers */

function Title({ children, hint, note }: { children: string; hint?: string; note?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
      <h2 className="sx-section-title">{children}</h2>
      {hint && <StadiumHint label={children} text={hint} />}
      {note && <span className="ml-auto text-[11px] text-faint">{note}</span>}
    </div>
  );
}

function Quiet({ children }: { children: ReactNode }) {
  return <p className="py-4 text-sm leading-relaxed text-muted">{children}</p>;
}

/* --------------------------------------------------------------- formats */

function Formats({ d }: { d: SponsorIntel }) {
  const rows = rankFormats(d.formats);
  const most = Math.max(1, ...rows.map((r) => r.redemptions));
  return (
    <StadiumPanel flush delay={0.4} className="min-w-0 lg:col-span-2">
      <div className="px-5 pt-5">
        <Title
          hint="Each kind of post or appearance, ranked by what one redemption cost you: what you agreed to spend on it, divided by the fans who redeemed. Lower is better value."
          note="Best value first"
        >
          What worked best
        </Title>
      </div>
      {rows.length === 0 ? (
        <div className="px-5 pb-3">
          <Quiet>No results in this period yet. Formats show here once your campaigns have posts and redemptions counted.</Quiet>
        </div>
      ) : (
        <ul className="pb-1">
          {rows.map((r, i) => (
            <li key={r.format} className="sx-stadium-row border-b border-line-soft px-5 py-3 last:border-0" style={at(0.45 + i * 0.04)}>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-[13px] font-semibold text-text">{formatWord(r.format)}</span>
                <span className="text-[11.5px] text-muted">
                  {r.campaigns.toLocaleString("en-US")} {r.campaigns === 1 ? "campaign" : "campaigns"}
                </span>
                <span className="ml-auto text-right">
                  <span className="block text-[13px] font-bold tabular-nums text-text">{r.costPerResultCents !== null ? cpm(r.costPerResultCents) : "—"}</span>
                  <span className="block text-[11px] text-muted">{r.costPerResultCents !== null ? "per fan who redeemed" : "no redemptions yet"}</span>
                </span>
              </div>
              <span className="mt-2 block">
                <StadiumBar value={r.redemptions / most} delay={0.6 + i * 0.05} />
              </span>
              <p className="mt-1.5 text-[11.5px] text-faint">
                {r.redemptions.toLocaleString("en-US")} redeemed
                {r.deliveredImpressions > 0 && (
                  <>
                    {" · "}
                    {compactNumber(r.deliveredImpressions)} people reached ({sourceWord(r.provenance).toLowerCase()})
                  </>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </StadiumPanel>
  );
}

/* -------------------------------------------------------------- renewals */

function Renewals({ d }: { d: SponsorIntel }) {
  const rows = renewalsDue(d.renewals);
  return (
    <StadiumPanel flush delay={0.46} tone={rows.length ? "you" : undefined} className="min-w-0">
      <div className="px-5 pt-5">
        <Title hint="Campaigns ending soon, and whether they look worth running again. Worked out from how each one did; the confidence says how sure we are.">
          Worth renewing?
        </Title>
      </div>
      {rows.length === 0 ? (
        <div className="px-5 pb-5">
          <Quiet>Nothing ending soon. Advice shows here as your campaigns near their end date.</Quiet>
        </div>
      ) : (
        <ul className="pb-1">
          {rows.map((r, i) => {
            const w = renewalWord(r.recommendation);
            return (
              <li key={r.campaignId} className="sx-stadium-row border-b border-line-soft px-5 py-3 last:border-0" style={at(0.5 + i * 0.04)}>
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/sponsor/campaigns/${encodeURIComponent(r.campaignId)}`} className="min-w-0 text-[13px] font-semibold text-text hover:text-sponsor hover:underline">
                    {r.campaignName}
                  </Link>
                  <StadiumChip tone={w.tone}>{w.text}</StadiumChip>
                </div>
                <p className="mt-0.5 text-[11.5px] text-muted">
                  Ends <StadiumDate iso={r.endsAt} format="weekday" utc /> · {confidenceLabel(r.stamp.confidence)}
                </p>
                {r.reasons.length > 0 && (
                  <ul className="mt-2 space-y-1 text-[11.5px] text-muted">
                    {r.reasons.map((why) => (
                      <li key={why} className="flex gap-2">
                        <span aria-hidden="true" className="mt-1.5 size-1 shrink-0 rounded-full bg-sponsor" />
                        {why}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </StadiumPanel>
  );
}

/* -------------------------------------------------------------- partners */

function Partners({ d }: { d: SponsorIntel }) {
  const rows = rankPartners(d.partners);
  return (
    <StadiumPanel flush delay={0.52} className="min-w-0">
      <div className="px-5 pt-5">
        <Title hint="The athletes and teams that did best for you across your campaigns. The score is worked out from their checked results; the confidence says how sure we are.">
          Your best partners
        </Title>
      </div>
      {rows.length === 0 ? (
        <div className="px-5 pb-3">
          <Quiet>No partners with counted results yet. They show here once their posts for you are checked.</Quiet>
        </div>
      ) : (
        <div className="pb-1">
          {rows.map((p, i) => (
            <StadiumRow
              key={`${p.kind}-${p.id}`}
              i={i}
              lead={monogramOf(p.name)}
              title={p.name}
              sub={`${partnerKindWord(p.kind)} · ${p.campaigns.toLocaleString("en-US")} ${p.campaigns === 1 ? "campaign" : "campaigns"} · ${confidenceLabel(p.stamp.confidence)}`}
              right={
                <span className="block">
                  <span className="block text-[13px] font-bold tabular-nums text-text">{pct(p.score)}</span>
                  <span className="block text-[11px] text-muted">score</span>
                </span>
              }
            />
          ))}
        </div>
      )}
    </StadiumPanel>
  );
}

/* -------------------------------------------------------------- audience */

function Audience({ d }: { d: SponsorIntel }) {
  const rows = sourcedSegments(d.segments);
  return (
    <StadiumPanel delay={0.58} className="min-w-0">
      <Title hint="Who your campaigns reached, only where the platform or BTG can say where the figure came from.">Who you reached</Title>
      {rows.length === 0 ? (
        <Quiet>No audience figures with a known source yet. They show here once a platform shares them for your campaigns.</Quiet>
      ) : (
        <ul className="space-y-3">
          {rows.map((s, i) => (
            <li key={s.label}>
              <div className="flex items-baseline justify-between gap-2 text-[12px]">
                <span className="min-w-0 truncate text-text">{s.label}</span>
                <span className="shrink-0 font-bold tabular-nums text-text">{pct(s.share)}</span>
              </div>
              <span className="mt-1 block">
                <StadiumBar value={s.share} delay={0.65 + i * 0.05} />
              </span>
              <p className="mt-1 text-[11px] text-faint">
                {s.source} · {sourceWord(s.provenance)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </StadiumPanel>
  );
}
