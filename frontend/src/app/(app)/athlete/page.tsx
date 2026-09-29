import Link from "next/link";
import {
  Badge,
  BlockedNotice,
  Button,
  Card,
  Meter,
  SectionHeading,
} from "@/components/ui";
import {
  AttentionQueue,
  type QueueRow,
  type ReviewRow,
} from "@/components/attention-queue";
import { Sparkline, compact } from "@/components/charts";
import { HeroBand, MiniChip } from "@/components/hero";
import { JourneyStrip, type JourneyStep } from "@/components/journey-strip";
import { ProgressRing } from "@/components/progress-ring";
import { EmptyState, SkeletonPage } from "@/components/states";
import { demoState } from "@/lib/demo";
import { CHECKLIST_SECTION } from "@/lib/profile-sections";
import {
  DELIVERABLE_COPY,
  athlete,
  athleteMinor,
  athleteCareer,
  athleteEarningsTrend,
  deliverables,
  earnings,
  invitations,
  money,
  profileChecklist,
  socials,
  type DeliverableState,
} from "@/lib/fixtures";
import { athleteHome, type AthleteHomeInput } from "@/lib/athlete-home-live";
import { liveAthleteHome } from "@/server/athlete-home";

/* --------------------------------------------------------------------------
   Athlete Portal — §9 screen 6, requirements §24. Redesigned 2026-09-15
   (spec: docs/superpowers/specs/2026-09-15-athlete-dashboard-redesign-design.md).

   The A2 layout showed everything at equal weight — hero, four tiles, five
   sections, five rail cards — and first-time athletes faced a wall. This
   build stages the page around two focal points: a slim money strip (what is
   my career worth) and one actionable queue (what do I do now), with a
   dismissible journey strip teaching the invite → accept → deliver → get-paid
   loop between them. Everything demoted lives on subpages that already
   exist: per-state earnings on /athlete/earnings, rate card / agreements /
   socials in the profile editor's §11 sections.

   Still fixtures (src/lib/fixtures.ts), still provenance-tagged (§22) — one
   chip on the career figure, one on the audience card. Acceptance stays
   unwired (guide §08): the queue's invite action is "Review terms", a link,
   so nothing on this page is a dead button.

   LIVE (P2-FE-01). A signed-in athlete gets their own dashboard from their
   own reads (server/athlete-home.ts → lib/athlete-home-live.ts): the queue,
   journey counts, money strip, profile meter and socials all derive from
   Postgres. The §4 guardian gate comes from the API's readiness read, the
   same one acceptance asks. Any ?demo= state keeps the fixture deck.
   -------------------------------------------------------------------------- */

const DELIVERABLE_TONE: Record<
  DeliverableState,
  "neutral" | "primary" | "accent" | "warn"
> = {
  NOT_STARTED: "neutral",
  DRAFT_SUBMITTED: "primary",
  BTG_REVIEW: "warn",
  SPONSOR_REVIEW: "warn",
  APPROVED: "accent",
  PUBLISHED: "accent",
  VERIFIED: "accent",
};

/** Sort key for fixture due dates like "May 9" — month-name + day. */
const MONTHS: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};
const dueKey = (s: string) => {
  const [mon, day] = s.split(" ");
  const m = MONTHS[mon?.slice(0, 3)];
  return m ? m * 100 + Number(day ?? 0) : Number.MAX_SAFE_INTEGER;
};

/** Sort key for fixture expiry strings — "9 hours" < "2 days"; "—" and
 *  "expired …" sort last (those states never reach the open-invite queue). */
const expiryKey = (s: string) => {
  const m = s.match(/^(\d+)\s+(hour|day)/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  const n = Number(m[1]);
  return m[2] === "hour" ? n : n * 24;
};
/** Urgent = expiring within 3 days; drives the warn pill. */
const expiresSoon = (s: string) => expiryKey(s) <= 72;

/* ------------------------------------------- slim clickable stat tile */
function SlimTile({
  label,
  value,
  sub,
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  href: string;
}) {
  return (
    <Link href={href} className="group block">
      <Card className="p-3.5 transition-colors group-hover:bg-surface-2/70">
        <p className="flex items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-wide text-muted">
          <span className="truncate">{label}</span>
          <span
            aria-hidden="true"
            className="shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100"
          >
            →
          </span>
        </p>
        <p className="mt-1 flex items-baseline gap-1.5">
          <span className="text-lg font-semibold tabular-nums tracking-tight">
            {value}
          </span>
          {sub && (
            <span className="truncate text-[11px] text-faint">{sub}</span>
          )}
        </p>
      </Card>
    </Link>
  );
}

export default async function AthletePortalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") throw new Error("Demo error state");

  /* Queue pages — seeded into the AttentionQueue island so ?attn= (actionable
     rows) and ?rev= (in-review list) links land on the right pages. */
  const sp = await searchParams;
  const attn = typeof sp.attn === "string" ? sp.attn : undefined;
  const rev = typeof sp.rev === "string" ? sp.rev : undefined;

  const live = demo === null ? await liveAthleteHome() : null;
  if (live === "unlinked") return <UnlinkedAthlete />;
  if (live) return <LiveHome input={live} attn={attn} rev={rev} />;

  /* §4 — ?demo=minor renders the same athlete as a minor whose guardian is
     still unverified; every action that creates an obligation gates on it. */
  const a = demo === "minor" ? athleteMinor : athlete;
  const guardianPending = a.isMinor && !a.guardian?.verifiedAt;

  const heading = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          {a.firstName}&rsquo;s dashboard
        </h1>
        <p className="mt-1 text-xs text-muted">
          {a.sport} · {a.position} · {a.region} · {a.school}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Badge tone="accent">{a.tier} tier</Badge>
        <Badge tone="neutral">{a.tierMultiplier} multiplier</Badge>
      </div>
    </div>
  );

  /* Brand-new athlete: no invites, no earnings — the screen is the next step,
     not a wall of zeros dressed up as progress. */
  if (demo === "empty") {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState
          mark="chart"
          title="Your story starts here"
          hint="Stats fill in as you accept invitations and deliver."
          action={{ label: "See invitations", href: "/athlete/invitations" }}
        />
      </div>
    );
  }

  const openInvites = [...invitations]
    .filter((i) => i.state === "INVITED" || i.state === "VIEWED")
    .sort((x, y) => expiryKey(x.expiresIn) - expiryKey(y.expiresIn));
  const due = [...deliverables]
    .filter((d) => d.state === "NOT_STARTED")
    .sort((x, y) => dueKey(x.dueDate) - dueKey(y.dueDate));
  const inReview = deliverables.filter(
    (d) => d.state !== "NOT_STARTED" && d.state !== "VERIFIED",
  );
  const activeCampaigns = new Set(
    deliverables.filter((d) => d.state !== "VERIFIED").map((d) => d.campaign),
  ).size;
  const pending = earnings.find((e) => e.state === "PENDING")!;
  const outstanding = profileChecklist.filter((c) => !c.done);

  /* The queue's rows, flattened in priority order — expiring invites, then
     due deliverables, then one collapsed profile row — as serializable data
     for the AttentionQueue island (it pages at five rows). */
  const queueRows: QueueRow[] = [
    ...openInvites.map(
      (inv): QueueRow => ({
        id: inv.id,
        kind: "invite",
        title: `${inv.sponsor} — ${inv.campaign}`,
        money: money(inv.offered),
        sub: `${inv.deliverableCount} ${
          inv.deliverableCount === 1 ? "deliverable" : "deliverables"
        } · usage ${inv.usageRights} · ${inv.exclusivity ?? "no exclusivity"}`,
        badges: [
          ...(inv.state === "INVITED"
            ? [{ label: "New", tone: "primary" as const }]
            : []),
          {
            label: `expires in ${inv.expiresIn}`,
            tone: expiresSoon(inv.expiresIn) ? "warn" : "neutral",
          },
        ],
        action: {
          label: "Review terms",
          href: `/athlete/orders/${inv.id}?from=athlete-portal`,
        },
      }),
    ),
    ...due.map(
      (d, i): QueueRow => ({
        id: d.id,
        kind: "deliverable",
        title: d.title,
        sub: `${d.campaign} · ${d.sponsor}`,
        badges: [
          { label: `due ${d.dueDate}`, tone: i === 0 ? "warn" : "neutral" },
        ],
        action: {
          label: "Upload proof",
          disabled: guardianPending,
          title: guardianPending
            ? "Blocked: a minor needs a verified guardian first (§4)"
            : "Opens the direct-to-R2 presigned upload (guide §11) — not wired",
        },
      }),
    ),
    ...(outstanding.length > 0
      ? [
          {
            id: "profile-gaps",
            kind: "profile",
            title: `Finish your profile — ${outstanding.length} ${
              outstanding.length === 1 ? "item" : "items"
            } left`,
            sub: outstanding.map((o) => o.label).join(" · "),
            badges: [],
            action: {
              label: "Finish →",
              variant: "ghost",
              href: `/athlete/profile/edit?section=${
                CHECKLIST_SECTION[outstanding[0].label] ?? "identity"
              }`,
            },
          } satisfies QueueRow,
        ]
      : []),
  ];
  const attentionCount = queueRows.length;

  /* Waiting-on-others rows for the queue's quiet second section — same
     serializable shape, paged independently in the island. */
  const reviewRows: ReviewRow[] = inReview.map((d) => ({
    id: d.id,
    due: d.dueDate,
    title: d.title,
    sub: `${d.campaign} · ${d.sponsor}`,
    badge: { label: DELIVERABLE_COPY[d.state], tone: DELIVERABLE_TONE[d.state] },
  }));

  // Momentum: monthly earnings trend average (Σ Earning by month — Postgres).
  const trendAvgCents = Math.round(
    athleteEarningsTrend.reduce((s, v) => s + v, 0) /
      athleteEarningsTrend.length,
  );

  /* The journey strip's counts come from the same derivations as the queue,
     so the teaching element never disagrees with the work list. */
  const journeySteps: JourneyStep[] = [
    {
      label: "Get invited",
      sub: `${openInvites.length} waiting`,
      href: "/athlete/invitations",
    },
    { label: "Accept the deal", sub: `${activeCampaigns} active` },
    { label: "Deliver & verify", sub: `${due.length} due`, href: "#queue" },
    {
      label: "Get paid",
      sub: `${money(pending.amount)} pending`,
      href: "/athlete/earnings",
    },
  ];
  const journeyCurrent = due.length > 0 ? 2 : openInvites.length > 0 ? 0 : 3;

  return (
    <div className="space-y-6">
      {guardianPending && (
        <BlockedNotice>
          Guardian authorization pending — {a.guardian?.legalName} must be
          verified before {a.firstName} can accept an invitation or submit a
          deliverable (§4). Invitations stay open; nothing is lost while
          verification completes.
        </BlockedNotice>
      )}

      {/* -------------------------------------------------------- headline */}
      {heading}

      {/* P7-QA-02: the dashboard has no live read yet (P2-FE-01) — every
          figure is fixtures.ts, so a signed-in athlete must not take the
          sample money, audience or queue for their own. */}
      {!demo && (
        <BlockedNotice>
          Demo data — your dashboard isn&rsquo;t wired to live reads yet, so the
          figures below are a sample athlete&rsquo;s. Your real invitations,
          deliverables, earnings and profile are on their own pages.
        </BlockedNotice>
      )}

      {/* ----------------------------------------------------- money strip */}
      <HeroBand border="border-athlete/30" className="sx-animate">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <ProgressRing pct={athleteCareer.payoutRingPct}>
            <div>
              <p className="text-lg font-bold tabular-nums leading-none">
                {athleteCareer.payoutRingPct}%
              </p>
              <p className="mt-0.5 text-[9px] uppercase tracking-wide text-muted">
                to payout
              </p>
            </div>
          </ProgressRing>
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">
              {a.firstName} — your NIL career
            </p>
            <p className="mt-1 flex flex-wrap items-baseline gap-2">
              <span className="bg-[linear-gradient(90deg,var(--sx-primary),var(--sx-accent))] bg-clip-text text-4xl font-bold tabular-nums tracking-tight text-transparent sm:text-5xl">
                {money(athleteCareer.careerEarningsCents)} earned
              </span>
              <MiniChip kind="ver">POSTGRES</MiniChip>
            </p>
            <p className="mt-1.5 text-xs text-muted">
              <span className="font-semibold text-text">
                {money(athleteCareer.approvedCents)}
              </span>{" "}
              approved → payout {athleteCareer.nextPayout} · on-time{" "}
              {athleteCareer.onTimeRatePct}%
            </p>
          </div>
        </div>
      </HeroBand>

      {/* -------------------------------- journey strip (teaching element) */}
      <JourneyStrip steps={journeySteps} current={journeyCurrent} />

      {/* --------------------------------------------- slim stat tile row */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SlimTile
          label="Open invitations"
          value={String(openInvites.length)}
          sub="awaiting your response"
          href="/athlete/invitations"
        />
        <SlimTile
          label="Deliverables due"
          value={String(due.length)}
          sub={`next: ${due[0]?.dueDate ?? "—"}`}
          href="#queue"
        />
        <SlimTile
          label="Pending earnings"
          value={money(pending.amount)}
          sub={`${pending.count} orders in cycle`}
          href="/athlete/earnings"
        />
        <Link href="/athlete/earnings" className="group block">
          <Card className="p-3.5 transition-colors group-hover:bg-surface-2/70">
            <p className="flex items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-wide text-muted">
              Momentum
              <span
                aria-hidden="true"
                className="shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100"
              >
                →
              </span>
            </p>
            <div className="mt-1.5 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <Sparkline
                  points={athleteEarningsTrend}
                  stroke="var(--sx-athlete)"
                />
              </div>
              <span className="shrink-0 text-[11px] text-faint">
                <span className="font-semibold text-text">
                  {money(trendAvgCents)}
                </span>
                /mo avg
              </span>
            </div>
          </Card>
        </Link>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        {/* ============================================== action queue */}
        <section id="queue" className="sx-animate sx-delay-1 min-w-0">
          <SectionHeading
            title={`Needs your attention · ${attentionCount}`}
            hint="Everything waiting on you, most urgent first"
          />
          <AttentionQueue
            rows={queueRows}
            reviewRows={reviewRows}
            initialPage={attn}
            initialReviewPage={rev}
          />
        </section>

        {/* ==================================================== rail */}
        {/* min-w-0: below xl the grid track is implicit `auto` — without it
           any nowrap content in the rail widens the page (P1-FE-19 found
           this on the student portal's twin of this layout). */}
        <div className="min-w-0 space-y-6">
          <section className="sx-animate sx-delay-2">
            <SectionHeading title="Earnings" />
            <Card>
              <p className="flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold tabular-nums tracking-tight">
                  {money(pending.amount)}
                </span>
                <span className="text-[11px] text-faint">
                  pending this cycle
                </span>
              </p>
              <p className="mt-1.5 text-[11px] text-muted">
                {money(athleteCareer.approvedCents)} approved → payout{" "}
                {athleteCareer.nextPayout}
              </p>
              <div className="mt-3">
                <Button variant="secondary" href="/athlete/earnings" full>
                  Earnings detail
                </Button>
              </div>
            </Card>
          </section>

          <section className="sx-animate sx-delay-3">
            <SectionHeading title="Profile" />
            <Card>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-semibold tabular-nums">
                  {a.profileCompletion}%
                </span>
                <span className="text-[11px] text-muted">
                  {profileChecklist.filter((c) => c.done).length}/
                  {profileChecklist.length} sections
                </span>
              </div>
              <div className="mt-2">
                <Meter value={a.profileCompletion} tone="accent" />
              </div>
              <div className="mt-3">
                <Button variant="secondary" href="/athlete/profile/edit" full>
                  {outstanding.length > 0 ? "Finish profile" : "Edit profile"}
                </Button>
              </div>
            </Card>
          </section>

          <section className="sx-animate sx-delay-4">
            <SectionHeading title="Audience" />
            <Card>
              <p className="flex flex-wrap items-baseline gap-1.5">
                <span className="text-2xl font-semibold tabular-nums tracking-tight">
                  {compact(athleteCareer.followers)}
                </span>
                <span className="text-[11px] text-faint">
                  followers · {athleteCareer.engagementRatePct}% engagement
                </span>
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[11px] text-muted">
                  {socials
                    .map((s) => `${s.platform} ${compact(s.followers)}`)
                    .join(" · ")}
                </span>
                <MiniChip kind="warn">SELF-REPORTED</MiniChip>
              </p>
              <div className="mt-3">
                <Button
                  variant="secondary"
                  href="/athlete/profile/edit?section=socials"
                  full
                >
                  Manage socials
                </Button>
              </div>
            </Card>
          </section>

          {a.isMinor && (
            <section className="sx-animate sx-delay-5">
              <SectionHeading title="Guardian" hint="§4 · §11" />
              <Card>
                <p className="text-xs">{a.guardian?.legalName}</p>
                <div className="mt-2">
                  {a.guardian?.verifiedAt ? (
                    <Badge tone="accent">Verified</Badge>
                  ) : (
                    <Badge tone="warn">Verification pending</Badge>
                  )}
                </div>
              </Card>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- live home */

function UnlinkedAthlete() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Your dashboard</h1>
      <EmptyState
        mark="users"
        title="Your account isn't linked to an athlete profile yet"
        hint="You're signed in, but BTG hasn't connected this login to your athlete record. Ask your BTG contact to link it — nothing is lost in the meantime."
        action={{ label: "How athletes join", href: "/join" }}
      />
    </div>
  );
}

function LiveHome({
  input,
  attn,
  rev,
}: {
  input: AthleteHomeInput;
  attn?: string;
  rev?: string;
}) {
  const p = input.profile;
  const h = athleteHome(input, new Date());
  const firstName = p.displayName.split(" ")[0] || p.displayName;
  const place = [p.city, p.stateCode].filter(Boolean).join(", ");

  const journeySteps: JourneyStep[] = [
    { label: "Get invited", sub: `${h.openInvites} waiting`, href: "/athlete/invitations" },
    { label: "Accept the deal", sub: `${h.activeCampaigns} active` },
    { label: "Deliver & verify", sub: `${h.due} to do`, href: "#queue" },
    { label: "Get paid", sub: `${money(h.pending.amount)} pending`, href: "/athlete/earnings" },
  ];
  const journeyCurrent = h.due > 0 ? 2 : h.openInvites > 0 ? 0 : 3;

  return (
    <div className="space-y-6">
      {h.guardianPending && (
        <BlockedNotice>
          Guardian authorization pending — your guardian must be verified
          before you can accept an invitation or submit a deliverable (§4).
          Invitations stay open; nothing is lost while verification completes.
        </BlockedNotice>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{firstName}&rsquo;s dashboard</h1>
          <p className="mt-1 text-xs text-muted">
            {[p.sport, p.position, place, p.school].filter(Boolean).join(" · ")}
          </p>
        </div>
        {p.tier && (
          <div className="flex items-center gap-2">
            <Badge tone="accent">{p.tier.toLowerCase()} tier</Badge>
          </div>
        )}
      </div>

      <HeroBand border="border-athlete/30" className="sx-animate">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <ProgressRing pct={h.paidPct ?? 0}>
            <div>
              <p className="text-lg font-bold tabular-nums leading-none">
                {h.paidPct === null ? "—" : `${h.paidPct}%`}
              </p>
              <p className="mt-0.5 text-[9px] uppercase tracking-wide text-muted">paid out</p>
            </div>
          </ProgressRing>
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">
              {firstName} — your NIL career
            </p>
            <p className="mt-1 flex flex-wrap items-baseline gap-2">
              <span className="bg-[linear-gradient(90deg,var(--sx-primary),var(--sx-accent))] bg-clip-text text-4xl font-bold tabular-nums tracking-tight text-transparent sm:text-5xl">
                {money(h.earned)} earned
              </span>
              <MiniChip kind="ver">POSTGRES</MiniChip>
            </p>
            <p className="mt-1.5 text-xs text-muted">
              <span className="font-semibold text-text">{money(h.paid)}</span> paid ·{" "}
              {money(h.approved.amount)} approved for payout
            </p>
          </div>
        </div>
      </HeroBand>

      <JourneyStrip steps={journeySteps} current={journeyCurrent} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SlimTile label="Open invitations" value={String(h.openInvites)} sub="awaiting your response" href="/athlete/invitations" />
        <SlimTile label="Deliverables to do" value={String(h.due)} sub={h.nextDue ? `next: ${h.nextDue}` : "nothing due"} href="#queue" />
        <SlimTile
          label="Pending earnings"
          value={money(h.pending.amount)}
          sub={`${h.pending.count} ${h.pending.count === 1 ? "order" : "orders"} in cycle`}
          href="/athlete/earnings"
        />
        <Link href="/athlete/earnings" className="group block">
          <Card className="p-3.5 transition-colors group-hover:bg-surface-2/70">
            <p className="flex items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-wide text-muted">
              Paid this year
              <span aria-hidden="true" className="shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100">
                →
              </span>
            </p>
            <div className="mt-1.5 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <Sparkline points={h.paidThisYear} stroke="var(--sx-athlete)" />
              </div>
              <span className="shrink-0 text-[11px] font-semibold text-text">{money(h.paidThisYearTotal)}</span>
            </div>
          </Card>
        </Link>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section id="queue" className="sx-animate sx-delay-1 min-w-0">
          <SectionHeading
            title={`Needs your attention · ${h.attentionTotal}`}
            hint="Everything waiting on you, most urgent first"
          />
          {(h.moreInvites || h.moreDue) && (
            <p className="-mt-1 mb-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
              Showing the most urgent.
              {h.moreInvites && (
                <Link href="/athlete/invitations?state=open" className="font-medium text-athlete hover:underline">
                  All {h.openInvites} open invitations →
                </Link>
              )}
              {h.moreDue && (
                <Link href="/athlete/deliverables?tab=todo" className="font-medium text-athlete hover:underline">
                  All {h.due} deliverables to do →
                </Link>
              )}
            </p>
          )}
          {h.queueRows.length === 0 && h.reviewRows.length === 0 ? (
            <EmptyState
              mark="chart"
              title="You're all caught up"
              hint="New invitations and deliverables land here."
              action={{ label: "See invitations", href: "/athlete/invitations" }}
            />
          ) : (
            <AttentionQueue rows={h.queueRows} reviewRows={h.reviewRows} initialPage={attn} initialReviewPage={rev} />
          )}
        </section>

        <div className="min-w-0 space-y-6">
          <section className="sx-animate sx-delay-2">
            <SectionHeading title="Earnings" />
            <Card>
              <p className="flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold tabular-nums tracking-tight">{money(h.pending.amount)}</span>
                <span className="text-[11px] text-faint">pending this cycle</span>
              </p>
              <p className="mt-1.5 text-[11px] text-muted">
                {money(h.approved.amount)} approved for payout · payouts are
                handled by BTG Finance
              </p>
              <div className="mt-3">
                <Button variant="secondary" href="/athlete/earnings" full>
                  Earnings detail
                </Button>
              </div>
            </Card>
          </section>

          <section className="sx-animate sx-delay-3">
            <SectionHeading title="Profile" />
            <Card>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-semibold tabular-nums">{h.profilePct}%</span>
                <span className="text-[11px] text-muted">
                  {h.profileMissing === 0 ? "complete" : `${h.profileMissing} to finish`}
                </span>
              </div>
              <div className="mt-2">
                <Meter value={h.profilePct} tone="accent" />
              </div>
              <div className="mt-3">
                <Button variant="secondary" href="/athlete/profile/edit" full>
                  {h.profileMissing > 0 ? "Finish profile" : "Edit profile"}
                </Button>
              </div>
            </Card>
          </section>

          <section className="sx-animate sx-delay-4">
            <SectionHeading title="Audience" />
            <Card>
              {p.socials.length === 0 ? (
                <p className="text-[11px] text-muted">No social accounts added yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {p.socials.map((s) => (
                    <li key={`${s.platform}:${s.handle}`} className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <span className="text-muted">
                        {s.platform.toLowerCase()} · @{s.handle}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="font-semibold tabular-nums">
                          {s.followers === null ? "—" : compact(s.followers)}
                        </span>
                        <MiniChip kind={s.source === "SELF_REPORTED" ? "warn" : "ver"}>
                          {s.source.replace(/_/g, " ")}
                        </MiniChip>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3">
                <Button variant="secondary" href="/athlete/profile/edit?section=socials" full>
                  Manage socials
                </Button>
              </div>
            </Card>
          </section>

          {input.guardian !== "not-required" && (
            <section className="sx-animate sx-delay-5">
              <SectionHeading title="Guardian" hint="§4 · §11" />
              <Card>
                {input.guardian === "ready" ? (
                  <Badge tone="accent">Verified</Badge>
                ) : input.guardian === "unverified" ? (
                  <Badge tone="warn">Verification pending</Badge>
                ) : (
                  <Badge tone="warn">No guardian linked yet</Badge>
                )}
              </Card>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
