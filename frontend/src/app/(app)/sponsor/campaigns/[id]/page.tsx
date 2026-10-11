import Link from "next/link";
import type { ReactNode } from "react";

import { BackLink } from "@/components/back-link";
import { EmptyState } from "@/components/states";
import { SponsorArtwork } from "@/components/edition-artwork";
import { PendingList, ServerList } from "@/components/server-pager";
import {
  StadiumBar,
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
import { PagedTable, Primary, StageTable, Td, Tr, type Column } from "@/components/stage-table";
import { SponsorContentReview } from "@/components/sponsor-content-review";
import { campaignApprovalLine } from "@/lib/brief-status";
import { launchLine, sponsorNextStep, sponsorStaffing } from "@/lib/campaign-stage";
import { FLAG_HINTS, ORDER_COPY } from "@/lib/campaign-ui";
import { demoState } from "@/lib/demo";
import type { ApiDeliverable } from "@/lib/deliverables-live";
import { campaignDetailX, sponsor, sponsorCampaigns, sponsorCampaignsX } from "@/lib/fixtures";
import type { PageInfo, SearchParams } from "@/lib/list-query";
import { daysRemaining } from "@/lib/ops-live";
import { resolveBack } from "@/lib/back";
import { isBehind, windowLabel } from "@/lib/sponsor-live";
import { campaignWord, compactNumber, deliverableWord, type Word, type WordTone } from "@/lib/sponsor-words";
import { CAMPAIGN_POST_KEYS, liveSponsorCampaign, type LiveCampaignDetail } from "@/server/sponsor";
import {
  presignArtwork,
  registerArtwork,
  sponsorArtworkAction,
  sponsorArtworkLink,
  sponsorContentAction,
  sponsorContentLink,
} from "./actions";

/* --------------------------------------------------------------------------
   Sponsor Campaign detail — on the Stadium Board (P1-ART-23 Task 10, spec
   2026-10-11 §7.4). The screen that sits between the campaigns list and the
   ROI report: name, status, where it stands in plain steps, four headline
   tiles, what's waiting for the sponsor's OK first, then artwork, the
   athlete roster and every post, oldest due first.

   Every figure is a read (memory: stats-must-be-retrievable):
     GET /campaigns/:id              name, state, package, window, money
     GET /campaigns/:id/ops          delivery health + the roster
     GET /campaigns/:id/artwork      SponsorX NEXT ad slots (P9-BE-16)
     GET /deliverables?campaignId=   content waiting for sign-off (unpaged,
       state=SPONSOR_REVIEW          this campaign's own queue), and —
     GET /deliverables?campaignId=   server-paged — every post the campaign
       &page&size                    includes, oldest due first.
   Nothing is summed from rows on screen. Money is in cents, and a figure
   the role can't read is absent, never shown as zero.

   Owner-framed: read-only, no order-action drawer, no "re-match the slot"
   verbs — issues are shown as status with the reassurance that the BTG
   campaign manager owns the fix. The content-review and artwork islands
   keep their existing approve / ask-for-changes behaviour unchanged.

   LIVE vs DEMO. A signed-in sponsor gets their own campaign. Anyone else,
   and ?demo=empty|loading|error, gets the fixture deck under a "Sample
   data" pill — the same anatomy, minus the content a fixture can't honestly
   carry (there is no sample review queue, artwork or per-post list).
   -------------------------------------------------------------------------- */

const CAMPAIGN_STEPS = ["Planned", "Athletes signed", "Posting", "Finished"];

/** Where a campaign stands on the Stadium Board's mini steps. CANCELLED
 *  reads as finished (nothing left to track) rather than guess a step. */
function campaignStepNow(state: string): number {
  switch (state) {
    case "DRAFT":
      return 0;
    case "STAFFING":
    case "APPROVAL":
      return 1;
    case "ACTIVE":
      return 2;
    case "REPORTING":
      return 3;
    case "COMPLETED":
    case "CANCELLED":
      return 4;
    default:
      return 0;
  }
}

const usd = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;

/** No delivery has started before these — the report has nothing to show. */
const PRE_DELIVERY = new Set(["DRAFT", "STAFFING", "APPROVAL"]);

export default async function SponsorCampaignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <StadiumGhost label="Loading your campaign" tiles={4} />;
  if (demo === "error") throw new Error("Demo error state");

  const { id } = await params;
  const sp = await searchParams;
  const fromParam = Array.isArray(sp.from) ? sp.from[0] : sp.from;
  const back = resolveBack(fromParam, "sponsor-campaigns");

  const live = demo === null ? await liveSponsorCampaign(id, sp) : null;
  if (live) {
    if (live.status === "missing") {
      return (
        <div className="space-y-5">
          <BackLink target={back} />
          <EmptyState
            mark="chart"
            title="Campaign not found"
            hint="This isn't one of your campaigns, or it no longer exists."
            action={{ label: "Back to campaigns", href: "/sponsor/campaigns" }}
          />
        </div>
      );
    }
    return <LiveDetail detail={live} back={back} />;
  }

  const base = sponsorCampaigns.find((c) => c.id === id);
  const x = sponsorCampaignsX[id];

  if (!base || !x || demo === "empty") {
    return (
      <div className="space-y-5">
        <BackLink target={back} />
        <EmptyState
          mark="chart"
          title={base ? "No campaign data yet" : "Not a sample campaign"}
          hint={
            base
              ? "This campaign's dashboard fills in as deliverables publish and metrics roll up."
              : /* P7-QA-02: a real campaign id lands here (this page is
                   fixture-only), so point at the live ROI report rather than
                   telling a sponsor their own campaign isn't theirs. */
                "This page only has sample campaigns so far — your campaign's live figures are in its ROI report."
          }
          action={
            base
              ? { label: "Back to campaigns", href: "/sponsor/campaigns" }
              : { label: "Open the ROI report", href: `/sponsor/campaigns/${encodeURIComponent(id)}/report` }
          }
        />
      </div>
    );
  }

  const rich = campaignDetailX[id as keyof typeof campaignDetailX];
  const [done, total] = base.deliverables;
  const behind = x.pacing === "BEHIND";
  const hasReport = base.state !== "STAFFING";

  return (
    <div className="space-y-6">
      <BackLink target={back} />
      <Head
        name={base.name}
        sub={`Presented by ${sponsor.name} · ${base.pkg} · ${x.endsIn}`}
        word={campaignWord(base.state)}
        behind={behind}
        hasReport={hasReport}
        reportHref={`/sponsor/campaigns/${id}/report?from=sponsor-campaign`}
        pill="Sample data"
      />
      <StadiumSteps steps={CAMPAIGN_STEPS} now={campaignStepNow(base.state)} label="Where this campaign stands" />
      <Tiles done={done} total={total} athletes={base.athletes} money={{ amountCents: base.spend, captioned: "Agreed" }} nextDue={undefined} />

      {!rich ? (
        <>
          <StadiumPanel delay={0.3}>
            <p className="text-sm leading-relaxed text-muted">
              {base.state === "COMPLETED"
                ? "This campaign has wrapped. The ROI report is your full read on what it returned."
                : base.state === "REPORTING"
                  ? "Delivery is done and the numbers are being finalised — the ROI report has the details."
                  : "This campaign is still being staffed. Delivery metrics and the ROI report open up once athletes accept their Campaign Orders."}
            </p>
          </StadiumPanel>
          <p className="text-[10px] text-faint">
            Campaign <code className="font-mono">{id}</code> · fixture data.
          </p>
        </>
      ) : (
        <DemoRich rich={rich} id={id} />
      )}
    </div>
  );
}

type DemoRichData = NonNullable<(typeof campaignDetailX)[keyof typeof campaignDetailX]>;

function DemoRich({ rich, id }: { rich: DemoRichData; id: string }) {
  const issues = rich.roster.filter((r) => r.flag);
  const rows = rich.roster.map((r) => ({
    id: r.slug,
    name: r.name,
    chip: (
      <span className="flex flex-wrap gap-1.5">
        <StadiumChip tone={DEMO_ORDER_TONE[r.order] ?? "info"}>{ORDER_COPY[r.order] ?? r.order}</StadiumChip>
        {r.flag && <StadiumChip tone="late">{r.flag}</StadiumChip>}
      </span>
    ),
    sub: r.flag ? FLAG_HINTS[r.flag] : undefined,
    delivered: r.delivered,
    planned: r.planned,
    views: r.views,
  }));
  return (
    <>
      {rich.notice && issues.length > 0 && (
        <StadiumPanel tone="late" delay={0.3}>
          <p className="text-sm leading-relaxed text-muted">
            {issues.length} athlete{issues.length === 1 ? "" : "s"} on this campaign need
            {issues.length === 1 ? "s" : ""} attention — your BTG campaign manager is handling
            the re-match and follow-up. Nothing for you to action here.
          </p>
        </StadiumPanel>
      )}
      <RosterSection rows={rows} viewsLabel="Views" />
      <p className="text-[10px] leading-relaxed text-faint">
        Campaign <code className="font-mono">{id}</code> · fixture data. Every figure traces to
        MetricDaily, RewardEvent, Deliverable or Zoho Books (§22).
      </p>
    </>
  );
}

/* ------------------------------------------------------------ live detail */

const LIVE_ORDER_COPY: Record<string, string> = {
  SENT: "Awaiting acceptance",
  ACCEPTED: "Accepted",
  ACTIVE: "Delivering",
  COMPLETED: "Completed",
  REJECTED: "Declined",
  CANCELLED: "Cancelled",
};
const LIVE_ORDER_TONE: Record<string, WordTone> = {
  SENT: "info",
  ACCEPTED: "live",
  ACTIVE: "live",
  COMPLETED: "done",
  REJECTED: "late",
  CANCELLED: "late",
};
const DEMO_ORDER_TONE: Record<string, WordTone> = { ACCEPTED: "live", SENT: "info", DECLINED: "late" };

function LiveDetail({
  detail,
  back,
}: {
  detail: Extract<LiveCampaignDetail, { status: "found" }>;
  back: ReturnType<typeof resolveBack>;
}) {
  const { campaign: c, ops } = detail;
  const now = new Date();
  const behind = isBehind(c, now);
  const hasReport = !PRE_DELIVERY.has(c.state);
  /* Only rows with an order: a sponsor sees who is delivering, not who BTG
     is still negotiating with (the API sends no invitations here anyway). */
  const roster = ops.roster.filter((r) => r.order);
  const attention = roster.filter((r) => r.overdue > 0 || r.order?.state === "SENT");
  /* P4-FE-08 — the plain next step the API gives a sponsor (P4-BE-09). */
  const next = sponsorNextStep(c.nextStep);
  /* P4-FE-09 — while it is being staffed, the request it came from is approved. */
  const approved = campaignApprovalLine(c.state);
  /* P4-FE-09 — while athletes are signing: how full the package is (P4-BE-12);
     once confirmed, the launch day (P4-BE-13) when the API sent no step. */
  const staffing = c.state === "STAFFING" ? sponsorStaffing(c.staffing) : null;
  const nextLine = next ?? staffing?.line ?? (c.state === "APPROVAL" ? launchLine(c.startDate, now) : null);

  /* Only when a spend figure is visible — a budget alone would read "$0 of
     $X", a zero the role simply can't see past. */
  const money =
    c.contracted !== undefined || c.invoiced !== undefined
      ? {
          amountCents: c.invoiced ?? c.contracted ?? 0,
          budgetCents: c.budget,
          captioned: c.budget === undefined && c.invoiced === undefined ? "Agreed, not yet invoiced" : undefined,
        }
      : null;
  const nextDue = roster.reduce<string | null>((min, r) => (r.nextDue && (!min || r.nextDue < min) ? r.nextDue : min), null);

  const rows = roster.map((r) => ({
    id: r.athleteId,
    name: r.name,
    chip: (
      <span className="flex flex-wrap gap-1.5">
        <StadiumChip tone={LIVE_ORDER_TONE[r.order!.state] ?? "info"}>{LIVE_ORDER_COPY[r.order!.state] ?? "In progress"}</StadiumChip>
        {r.overdue > 0 && <StadiumChip tone="late">{r.overdue} overdue</StadiumChip>}
        {r.inReview > 0 && <StadiumChip tone="info">{r.inReview} in review</StadiumChip>}
      </span>
    ),
    sub: r.nextDue ? `Next due ${new Date(r.nextDue).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}` : undefined,
    delivered: r.delivered,
    planned: r.planned,
    views: r.verifiedViews,
  }));

  return (
    <div className="space-y-6">
      <BackLink target={back} />

      <Head
        name={c.name}
        sub={`Presented by ${c.sponsorName} · ${c.package?.name ?? "Custom"} · ${windowLabel(c, now)}`}
        word={campaignWord(c.state)}
        behind={behind}
        hasReport={hasReport}
        reportHref={`/sponsor/campaigns/${encodeURIComponent(c.id)}/report?from=sponsor-campaign`}
        pill={<StadiumUpdated iso={detail.readAt} />}
      />

      <StadiumSteps steps={CAMPAIGN_STEPS} now={campaignStepNow(c.state)} label="Where this campaign stands" />

      <Tiles done={c.deliverables.done} total={c.deliverables.total} athletes={c.athletes} money={money} nextDue={nextDue} now={now} />

      {approved && (
        <StadiumPanel delay={0.3} className="sx-stadium-in">
          <div className="flex min-w-0 items-center gap-3">
            <StadiumChip tone="live">Approved</StadiumChip>
            <p className="min-w-0 text-xs font-medium text-text [overflow-wrap:anywhere]">{approved}</p>
          </div>
        </StadiumPanel>
      )}

      {nextLine && (
        <StadiumPanel delay={0.34}>
          <div className="flex min-w-0 items-center gap-3">
            <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.2em] text-muted">What&apos;s next</span>
            <p className="min-w-0 text-xs font-medium text-text [overflow-wrap:anywhere]">{nextLine}</p>
          </div>
          {staffing && (
            <div className="mt-2.5" aria-label={staffing.line}>
              <StadiumBar value={staffing.pct / 100} />
            </div>
          )}
        </StadiumPanel>
      )}

      {attention.length > 0 && (
        <StadiumPanel tone="late" delay={0.38}>
          <p className="text-sm leading-relaxed text-muted">
            {attention.length} athlete{attention.length === 1 ? "" : "s"} on this campaign need
            {attention.length === 1 ? "s" : ""} attention — your BTG campaign manager is handling
            the follow-up. Nothing for you to action here.
          </p>
        </StadiumPanel>
      )}

      {/* P4-FE-08 (P5-BE-09) — athlete content BTG sent for the sponsor's
          sign-off: the caption it will go out with and how long it has
          waited. First, because it is the one thing on this page that can
          wait on the sponsor. Hidden when nothing is waiting. */}
      {detail.review.length > 0 && (
        <StadiumPanel tone="you" delay={0.42}>
          <StadiumSection
            title="Waiting for your OK"
            hint={`${detail.review.length} waiting · BTG has reviewed ${detail.review.length === 1 ? "it" : "each one"}; the athlete posts once you approve.`}
          />
          <SponsorContentReview
            items={detail.review}
            now={now.getTime()}
            canDecide={detail.canDecideContent}
            act={sponsorContentAction}
            link={sponsorContentLink}
          />
        </StadiumPanel>
      )}

      {/* P9-BE-16 — the SponsorX NEXT ad slots this campaign bought: upload
          the artwork, then approve it (or ask for changes) once BTG has
          reviewed it. The edition can't go to print until it's approved. */}
      {detail.artwork.length > 0 && (
        <section className="sx-stadium-in" style={at(0.46)}>
          <StadiumSection
            title="Your ad artwork"
            hint="Each file is checked as soon as it lands, goes through BTG's review — or, once your recent ads were approved without changes, straight to you — and you approve it. The edition prints only once every ad is approved."
          />
          <SponsorArtwork
            slots={detail.artwork}
            now={now.getTime()}
            canDecide={detail.canDecideArtwork}
            act={sponsorArtworkAction}
            link={sponsorArtworkLink}
            presign={presignArtwork}
            register={registerArtwork}
          />
        </section>
      )}

      <RosterSection rows={rows} viewsLabel="Verified views" delay={0.5} />

      <PostsSection posts={detail.posts} page={detail.postsPage} unavailable={detail.postsUnavailable} />

      <p className="text-[10px] leading-relaxed text-faint">
        Delivery, roster and spend are from Postgres; verified views are
        staff-checked metrics on published deliverables. People reached,
        engagement, rewards and top content are in the ROI report.
      </p>
    </div>
  );
}

/* --------------------------------------------------------------- the head */

function Head({
  name,
  sub,
  word,
  behind,
  hasReport,
  reportHref,
  pill,
}: {
  name: string;
  sub: string;
  word: Word;
  behind: boolean;
  hasReport: boolean;
  reportHref: string;
  pill?: ReactNode;
}) {
  const action = hasReport ? (
    <Link
      href={reportHref}
      className="flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-[11px] font-medium text-cta-ink transition-colors hover:bg-primary-soft"
    >
      See results
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-3.5"
        aria-hidden="true"
      >
        <path d="m9 5 7 7-7 7" />
      </svg>
    </Link>
  ) : (
    <span className="rounded-lg border border-line bg-surface px-3.5 py-2 text-[11px] font-medium text-faint">
      Results available once delivery begins
    </span>
  );
  return (
    <StadiumHead title={name} pill={pill} actions={action}>
      <p className="mt-1 min-w-0 text-xs text-muted [overflow-wrap:anywhere]">{sub}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <StadiumChip tone={word.tone}>{word.text}</StadiumChip>
        {behind && <StadiumChip tone="late">Behind</StadiumChip>}
      </div>
    </StadiumHead>
  );
}

/* -------------------------------------------------------------- the tiles */

function Tiles({
  done,
  total,
  athletes,
  money,
  nextDue,
  now,
}: {
  done: number;
  total: number;
  athletes: number;
  money: { amountCents: number; budgetCents?: number; captioned?: string } | null;
  /** undefined — the data this tile needs isn't available (demo fixtures
   *  carry no due dates), so the tile is left out rather than guessed. */
  nextDue: string | null | undefined;
  now?: Date;
}) {
  const tiles: ReactNode[] = [
    <StadiumTile
      key="posts"
      label="Posts delivered"
      value={done}
      share={total ? done / total : undefined}
      caption={total ? `of ${total.toLocaleString("en-US")} planned` : "None planned yet"}
      hint="Posts the athletes have put up, out of every post this campaign includes."
      delay={0.1}
    />,
    <StadiumTile key="athletes" label="Athletes" value={athletes} hint="Athletes delivering on this campaign." delay={0.16} />,
  ];
  if (money) {
    const label = money.budgetCents !== undefined ? "Spent of budget" : "Spent";
    const caption = money.budgetCents !== undefined ? `of ${usd(money.budgetCents)} budget` : money.captioned;
    tiles.push(
      <StadiumTile
        key="money"
        label={label}
        value={money.amountCents}
        format="usd0"
        share={money.budgetCents ? money.amountCents / money.budgetCents : undefined}
        caption={caption}
        hint="What this campaign has been invoiced (or agreed), and how much of its budget that is."
        delay={0.22}
      />,
    );
  }
  if (nextDue !== undefined) {
    const days = nextDue && now ? daysRemaining(nextDue, now) : 0;
    tiles.push(
      <StadiumTile
        key="next"
        label="Next post due"
        value={days}
        caption={nextDue ? <>on <StadiumDate iso={nextDue} format="weekday" utc /></> : "Nothing scheduled right now"}
        hint="Days until the next post this campaign owes is due."
        delay={0.28}
      />,
    );
  }
  return <StadiumTiles cols={tiles.length >= 4 ? 4 : 3}>{tiles}</StadiumTiles>;
}

/* ------------------------------------------------------------- the roster */

type RosterRowView = { id: string; name: string; chip: ReactNode; sub?: string; delivered: number; planned: number; views: number };

function RosterSection({ rows, viewsLabel, delay = 0.3 }: { rows: RosterRowView[]; viewsLabel: string; delay?: number }) {
  return (
    <section className="sx-stadium-in" style={at(delay)}>
      <StadiumSection title="Athlete roster" hint="Who's delivering on your campaign. Read-only — your BTG manager runs the orders." />
      {rows.length === 0 ? (
        <StadiumPanel>
          <p className="text-sm text-muted">No Campaign Orders yet — BTG is still staffing this campaign. Athletes appear here once their orders go out.</p>
        </StadiumPanel>
      ) : (
        <StageTable
          label="Athlete roster"
          columns={[
            { key: "athlete", label: "Athlete" },
            { key: "status", label: "Status" },
            { key: "posts", label: "Posts delivered" },
            { key: "views", label: viewsLabel, num: true },
          ]}
        >
          {rows.map((r, i) => {
            const pct = r.planned ? r.delivered / r.planned : 0;
            return (
              <Tr key={r.id} i={i}>
                <Td>
                  <Primary sub={r.sub}>{r.name}</Primary>
                </Td>
                <Td label="Status">{r.chip}</Td>
                <Td label="Posts delivered">
                  {r.planned ? (
                    <span className="flex items-center gap-2">
                      <span className="block w-20">
                        <StadiumBar value={pct} />
                      </span>
                      <span className="text-xs tabular-nums text-muted">
                        {r.delivered}/{r.planned}
                      </span>
                    </span>
                  ) : (
                    <span className="text-xs text-muted">None planned yet</span>
                  )}
                </Td>
                <Td label={viewsLabel} num>
                  {compactNumber(r.views)}
                </Td>
              </Tr>
            );
          })}
        </StageTable>
      )}
    </section>
  );
}

/* -------------------------------------------------------------- the posts */

const POSTS_COLUMNS: Column[] = [
  { key: "post", label: "Post" },
  { key: "status", label: "Status" },
  { key: "due", label: "Due" },
];

function PostsSection({
  posts,
  page,
  unavailable,
}: {
  posts: ApiDeliverable[] | null;
  page: PageInfo;
  unavailable?: "error" | "forbidden";
}) {
  /* A role that can't read posts doesn't get the section at all. */
  if (unavailable === "forbidden") return null;
  return (
    <section className="min-w-0 sx-stadium-in" style={at(0.56)}>
      <StadiumSection title="Posts" hint="Every post this campaign includes, oldest due first." />
      {posts === null ? (
        /* The read failed — the rest of the page is still good. */
        <StadiumPanel tone="late">
          <p className="text-sm text-muted">Posts couldn&apos;t load — refresh to try again.</p>
        </StadiumPanel>
      ) : (
        <ServerList>
          {page.total === 0 ? (
            <PendingList>
              <StadiumPanel>
                <p className="text-sm text-muted">No posts scheduled yet. They show here once BTG staffs athletes onto this campaign.</p>
              </StadiumPanel>
            </PendingList>
          ) : (
            <PagedTable bare tone="sponsor" page={page} noun="Posts" label="Campaign posts" keys={CAMPAIGN_POST_KEYS} columns={POSTS_COLUMNS}>
              {posts.map((d, i) => {
                const w = deliverableWord(d.state);
                return (
                  <Tr key={d.id} i={i}>
                    <Td>
                      <Primary sub={d.athlete.displayName}>{d.title}</Primary>
                    </Td>
                    <Td label="Status">
                      <StadiumChip tone={w.tone}>{w.text}</StadiumChip>
                    </Td>
                    <Td label="Due" muted>
                      <StadiumDate iso={d.dueDate} format="date" utc />
                    </Td>
                  </Tr>
                );
              })}
            </PagedTable>
          )}
        </ServerList>
      )}
    </section>
  );
}
