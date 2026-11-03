import Link from "next/link";

import { BackLink } from "@/components/back-link";
import { EmptyState } from "@/components/states";
import {
  StadiumChip,
  StadiumDate,
  StadiumGhost,
  StadiumHead,
  StadiumPanel,
  StadiumSection,
  StadiumSteps,
  StadiumTile,
  StadiumTiles,
  StadiumUpdated,
  at,
} from "@/components/stadium-stage";
import { askedLines, athleteCountWord, type ApiSponsorRequestDetail } from "@/lib/brief-actions";
import { REQUEST_STEPS, requestStatus, requestStepNow, requestStepsClosedWord } from "@/lib/brief-status";
import { demoState } from "@/lib/demo";
import { demoRequestPage } from "@/lib/fixtures/sponsor-overview";
import { formatCount } from "@/lib/format-count";
import type { SearchParams } from "@/lib/list-query";
import { briefWord, campaignWord } from "@/lib/sponsor-words";
import { liveSponsorRequest } from "@/server/sponsor";

import { editRequestAction, withdrawRequestAction } from "./actions";
import { RequestControls } from "./request-controls";

/* --------------------------------------------------------------------------
   One request — POL-FE-17 (polish.md §17), on the Stadium Board.

   A sponsor can open what they sent, see where it stands, change it while
   it is still a draft, withdraw it before it becomes a campaign, and jump
   to the campaign once it is one. Everything is GET /briefs/:id's: the
   status line, the `youCan` flags (a read-only sponsor gets none and sees
   no buttons), the campaign link. BTG's hold and close reasons are never
   on this page — a sponsor reads a closed request through `status` alone.

   LIVE vs DEMO. A signed-in sponsor reads their own request; a 403 is
   "not found" (the API gives no existence oracle). Anyone else gets the
   sample request with that id from the Requests page's deck — the list's
   own fields only, no invented targeting — or a plain "sign in" panel.
   -------------------------------------------------------------------------- */

const BACK = { href: "/sponsor/requests", label: "Back to Requests" };

export default async function SponsorRequestDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <StadiumGhost label="Loading your request" tiles={3} />;
  if (demo === "error") throw new Error("Demo error state");

  const { id } = await params;
  const live = demo === null ? await liveSponsorRequest(id) : null;
  if (live) {
    if (live.status === "missing") {
      return (
        <div className="space-y-5">
          <BackLink target={BACK} />
          <EmptyState mark="inbox" title="Request not found" hint="This isn't one of your requests, or it no longer exists." action={{ label: "Back to requests", href: BACK.href }} />
        </div>
      );
    }
    return <Detail request={live.request} updatedAt={live.readAt} sample={false} />;
  }

  /* Demo: the sample row with this id, shown with what the list knows. */
  const sample = demo === "empty" ? undefined : demoRequestPage({ size: "60" }, { q: "", state: "" }).requests.find((r) => r.id === id);
  if (!sample) {
    return (
      <div className="space-y-5">
        <BackLink target={BACK} />
        <EmptyState
          mark="inbox"
          title="Sign in to see your request"
          hint="This page shows sample requests only until you sign in as a sponsor — your own requests, with their status and the campaigns they became, are a sign-in away."
          action={{ label: "Back to requests", href: BACK.href }}
        />
      </div>
    );
  }
  return <SampleDetail request={sample} />;
}

/* ------------------------------------------------------------- the page */

function Detail({ request: r, updatedAt, sample }: { request: ApiSponsorRequestDetail; updatedAt: string; sample: boolean }) {
  const word = briefWord(r.state);
  const status = requestStatus(r);
  const now = requestStepNow(r.state, r.campaign?.state);
  const pill = sample ? "Sample data" : <StadiumUpdated iso={updatedAt} />;

  return (
    <div className="space-y-6">
      <BackLink target={BACK} />
      <StadiumHead
        title={r.objective.split("\n")[0]}
        pill={pill}
        actions={
          r.campaign ? (
            <Link href={`/sponsor/campaigns/${encodeURIComponent(r.campaign.id)}`} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold">
              Open campaign →
            </Link>
          ) : undefined
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <StadiumChip tone={word.tone}>{word.text}</StadiumChip>
          <span className="text-xs text-muted">
            Sent <StadiumDate iso={r.createdAt} format="date" />
            {r.package ? ` · ${r.package.name}` : " · Custom request"}
          </span>
        </div>
        <StadiumTiles cols={2}>
          <StadiumTile label="Budget" value={r.budget} format="usd0" hint="What you said you're prepared to start at — BTG prices it." delay={0.1} />
          <div className="sx-stadium-panel sx-stadium-in p-5" data-spot="" style={at(0.16)}>
            <p className="text-[11px] font-medium text-muted">Campaign window</p>
            <p className="mt-1 text-base font-semibold text-text">
              <StadiumDate iso={r.startDate} format="date" utc /> – <StadiumDate iso={r.endDate} format="date" utc />
            </p>
            <p className="mt-1 text-[11px] text-muted">The days you asked for. BTG confirms the dates with you.</p>
          </div>
        </StadiumTiles>
      </StadiumHead>

      <StadiumPanel delay={0.1}>
        <StadiumSection title="Where it stands" hint={status.text} />
        {now >= 0 ? (
          <StadiumSteps steps={REQUEST_STEPS} now={now} label={`Where ${r.objective} stands`} />
        ) : (
          <p className="text-sm text-muted">{requestStepsClosedWord(r.state, r.campaign?.state)}</p>
        )}
        {r.campaign && (
          <p className="mt-3 text-sm text-muted">
            This request became{" "}
            <Link href={`/sponsor/campaigns/${encodeURIComponent(r.campaign.id)}`} className="font-medium text-sponsor hover:underline">
              {r.campaign.name}
            </Link>{" "}
            — <StadiumChip tone={campaignWord(r.campaign.state).tone}>{campaignWord(r.campaign.state).text}</StadiumChip>
          </p>
        )}
        {!sample && (
          <div className="mt-4 border-t border-line-soft pt-4">
            {/* Server actions passed as-is: a wrapper made here would not be one, and would fail at the click. */}
            <RequestControls request={r} actions={{ edit: editRequestAction, withdraw: withdrawRequestAction }} />
          </div>
        )}
      </StadiumPanel>

      <StadiumPanel delay={0.16}>
        <StadiumSection title="What you asked for" />
        <p className="whitespace-pre-line text-sm leading-relaxed text-text">{r.objective}</p>
        <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {askedLines(r).map((l) => (
            <div key={l.label} className="min-w-0">
              <dt className="text-[11px] font-medium text-muted">{l.label}</dt>
              <dd className="text-sm text-text">{l.value}</dd>
            </div>
          ))}
        </dl>
      </StadiumPanel>

      {r.package && (
        <StadiumPanel delay={0.22}>
          <StadiumSection title="The package you picked" hint={r.package.code} />
          <p className="text-sm font-semibold text-text">{r.package.name}</p>
          <p className="mt-1 text-sm text-muted">
            {athleteCountWord(r.package)} · listed at {formatCount(r.package.priceLow * 100, "usd0")}–{formatCount(r.package.priceHigh * 100, "usd0")}. BTG confirms the final price with you before anything is charged.
          </p>
        </StadiumPanel>
      )}
    </div>
  );
}

/** The demo's sample request: the list's own fields, nothing invented. */
function SampleDetail({ request: r }: { request: { id: string; state: string; objective: string; budget: number; createdAt: string; package: { name: string } | null; campaign: { id: string; name: string; state: string } | null } }) {
  const word = briefWord(r.state);
  const status = requestStatus(r);
  const now = requestStepNow(r.state, r.campaign?.state);
  return (
    <div className="space-y-6">
      <BackLink target={BACK} />
      <StadiumHead
        title={r.objective}
        pill="Sample data"
        actions={
          r.campaign ? (
            <Link href={`/sponsor/campaigns/${encodeURIComponent(r.campaign.id)}`} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold">
              Open campaign →
            </Link>
          ) : undefined
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <StadiumChip tone={word.tone}>{word.text}</StadiumChip>
          <span className="text-xs text-muted">
            Sent <StadiumDate iso={r.createdAt} format="date" />
            {r.package ? ` · ${r.package.name}` : " · Custom request"}
          </span>
        </div>
        <StadiumTiles cols={2}>
          <StadiumTile label="Budget" value={r.budget} format="usd0" hint="What you said you're prepared to start at — BTG prices it." delay={0.1} />
        </StadiumTiles>
      </StadiumHead>
      <StadiumPanel delay={0.1}>
        <StadiumSection title="Where it stands" hint={status.text} />
        {now >= 0 ? (
          <StadiumSteps steps={REQUEST_STEPS} now={now} label={`Where ${r.objective} stands`} />
        ) : (
          <p className="text-sm text-muted">{requestStepsClosedWord(r.state, r.campaign?.state)}</p>
        )}
        <p className="mt-4 border-t border-line-soft pt-4 text-[11px] text-muted">Sample data — Edit and Withdraw work on a real request once you sign in as a sponsor.</p>
      </StadiumPanel>
    </div>
  );
}
