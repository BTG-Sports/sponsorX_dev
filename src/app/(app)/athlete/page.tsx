import Link from "next/link";
import {
  Badge,
  BlockedNotice,
  Button,
  Card,
  Meter,
  SectionHeading,
  SourceLabel,
  StatTile,
} from "@/components/ui";
import { Sparkline, compact } from "@/components/charts";
import { HeroBand, MiniChip } from "@/components/hero";
import { ProgressRing } from "@/components/progress-ring";
import { EmptyState, SkeletonPage } from "@/components/states";
import { demoState } from "@/lib/demo";
import { CHECKLIST_SECTION } from "@/lib/profile-sections";
import {
  DELIVERABLE_COPY,
  agreements,
  athlete,
  athleteMinor,
  athleteCareer,
  athleteEarningsTrend,
  deliverables,
  earnings,
  invitations,
  money,
  profileChecklist,
  rates,
  socials,
  type DeliverableState,
  type EarningState,
} from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Athlete Portal — §9 screen 6, requirements in §24. Redesigned 2026-09-11 (A2).

   No mockup exists for this screen: the mockup sheet's "6. Athlete Profile"
   is the sponsor-facing profile (Follow, Request Partnership, sponsor prices),
   which is §9 screen 5. This is built in the mockup's visual language against
   §24's thirteen requirements.

   The milestone hero answers "what is my NIL career worth right now?": career
   earnings, progress to the next payout, on-time reliability and audience —
   every figure provenance-tagged (§22). Canonical totals come from
   `athleteCareer` (Postgres); the legacy per-state `earnings` rows are a
   smaller, in-cycle sample and are framed as such so they never read as the
   career total.

   Data is fixtures (src/lib/fixtures.ts) shaped to the Prisma models in guide
   V2 §03. Nothing here is wired to a database yet.
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

const EARNING_TONE: Record<EarningState, "neutral" | "primary" | "accent" | "danger"> = {
  PENDING: "neutral",
  ELIGIBLE: "primary",
  APPROVED_FOR_PAYOUT: "primary",
  PAID: "accent",
  HELD: "danger",
  DISPUTED: "danger",
};

/** Sort key for fixture due dates like "May 9" / "May 15" — month-name + day.
 *  Static month map, no deps; unparseable strings sort last. */
const MONTHS: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};
const dueKey = (s: string) => {
  const [mon, day] = s.split(" ");
  const m = MONTHS[mon?.slice(0, 3)];
  return m ? m * 100 + Number(day ?? 0) : Number.MAX_SAFE_INTEGER;
};

export default async function AthletePortalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") throw new Error("Demo error state");

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
          {a.sport} · {a.position} · {a.region} ·{" "}
          {a.school}
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

  const openInvites = invitations.filter(
    (i) => i.state === "INVITED" || i.state === "VIEWED",
  );
  const upcoming = [...deliverables]
    .filter((d) => d.state !== "VERIFIED")
    .sort((a, b) => dueKey(a.dueDate) - dueKey(b.dueDate));
  const pending = earnings.find((e) => e.state === "PENDING")!;
  const outstanding = profileChecklist.filter((c) => !c.done);

  // Momentum: monthly earnings trend average (Σ Earning by month — Postgres).
  const trendAvgCents = Math.round(
    athleteEarningsTrend.reduce((s, v) => s + v, 0) / athleteEarningsTrend.length,
  );

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------- compliance strip */}
      {outstanding.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-warn/30 bg-warn/8 px-4 py-3">
          <span className="text-xs font-medium text-warn">
            {outstanding.length} onboarding {outstanding.length === 1 ? "item" : "items"} outstanding
          </span>
          <span className="text-xs text-muted">
            {outstanding.map((o) => o.label).join(" · ")}
          </span>
          <span className="ml-auto">
            <Button variant="secondary" href="/join">
              Finish profile
            </Button>
          </span>
        </div>
      )}

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

      {/* ----------------------------------------------------- milestone hero */}
      <HeroBand border="border-athlete/30" className="sx-animate">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
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
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              <span className="font-semibold text-text">
                {money(athleteCareer.approvedCents)}
              </span>
              approved → payout {athleteCareer.nextPayout}
              <MiniChip kind="ver">POSTGRES</MiniChip>
              · on-time {athleteCareer.onTimeRatePct}% · {openInvites.length}{" "}
              invites waiting
            </p>
            <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
              Audience
              <span className="font-semibold text-text">
                {compact(athleteCareer.followers)}
              </span>
              followers · {athleteCareer.engagementRatePct}% engagement
              <MiniChip kind="manual">VERIFIED · MANUAL</MiniChip>
            </p>
          </div>
        </div>
      </HeroBand>

      {/* ------------------------------------------------ slim stat + momentum */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Open invitations"
          value={String(openInvites.length)}
          sub="awaiting your response"
        />
        <StatTile
          label="Deliverables due"
          value={String(upcoming.length)}
          sub={`next: ${upcoming[0]?.dueDate ?? "—"}`}
        />
        <StatTile
          label="Pending earnings"
          value={money(pending.amount)}
          sub={`${pending.count} orders in cycle`}
        />
        <Card className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Momentum
          </p>
          <div className="mt-2.5">
            <Sparkline points={athleteEarningsTrend} stroke="var(--sx-athlete)" />
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-faint">
            <span className="font-semibold text-text">{money(trendAvgCents)}</span>
            / month avg
            <MiniChip kind="ver">POSTGRES</MiniChip>
          </p>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        {/* =============================================== main column */}
        <div className="min-w-0 space-y-6">
          {/* ------------------------------------------- invitation inbox */}
          <section className="sx-animate sx-delay-1">
            <SectionHeading
              title="Campaign invitations"
              hint="§21 — INVITED → VIEWED → ACCEPTED / DECLINED / EXPIRED"
              action={
                <Link
                  href="/athlete/invitations"
                  className="text-xs font-medium text-accent hover:underline"
                >
                  View all
                </Link>
              }
            />
            <div className="space-y-3">
              {openInvites.map((inv) => (
                <Card key={inv.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold tracking-tight">
                          {inv.campaign}
                        </span>
                        <Badge tone="neutral">{inv.jobId}</Badge>
                        {inv.state === "INVITED" && <Badge tone="primary">New</Badge>}
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        {inv.sponsor} · {inv.jobName} · {inv.deliverableCount}{" "}
                        {inv.deliverableCount === 1 ? "deliverable" : "deliverables"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold tabular-nums leading-none">
                        {money(inv.offered)}
                      </p>
                      <p className="mt-1 text-[11px] text-faint">
                        expires in {inv.expiresIn}
                      </p>
                    </div>
                  </div>

                  <dl className="mt-3 grid gap-x-6 gap-y-1.5 border-t border-line-soft pt-3 text-[11px] sm:grid-cols-2">
                    <div className="flex gap-2">
                      <dt className="text-faint">Usage rights</dt>
                      <dd className="text-muted">{inv.usageRights}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-faint">Exclusivity</dt>
                      <dd className="text-muted">{inv.exclusivity ?? "None"}</dd>
                    </div>
                  </dl>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      disabled
                      title="Blocked: the Campaign Order template needs counsel approval (guide §08)"
                    >
                      Review &amp; accept
                    </Button>
                    <Button
                      variant="secondary"
                      title="Records the decline — a wireable transition, not wired in the fixture build"
                    >
                      Decline
                    </Button>
                    <Link
                      href={`/athlete/orders/${inv.id}?from=athlete-portal`}
                      className="text-xs text-muted hover:text-text"
                    >
                      Full terms →
                    </Link>
                  </div>
                </Card>
              ))}
            </div>

            <div className="mt-3">
              <BlockedNotice>
                Acceptance is intentionally not wired up. Guide §08: this flow
                stores a hash of whatever agreement text it is shown, so
                accepting text counsel has not approved would produce an audit
                trail for an unenforceable agreement. UI first, wiring after the
                §37 pre-pilot gate.
              </BlockedNotice>
            </div>
          </section>

          {/* --------------------------------------- deliverable calendar */}
          <section className="sx-animate sx-delay-2">
            <SectionHeading
              title="Deliverables"
              hint="§21 — NOT_STARTED → DRAFT_SUBMITTED → BTG_REVIEW → SPONSOR_REVIEW → APPROVED → PUBLISHED → VERIFIED"
            />
            <Card className="p-0">
              <ul className="divide-y divide-line-soft">
                {deliverables.map((d) => (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
                  >
                    <div className="w-12 shrink-0">
                      <p className="text-[11px] font-medium text-muted">
                        {d.dueDate}
                      </p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{d.title}</p>
                      <p className="truncate text-[11px] text-faint">
                        {d.campaign} · {d.sponsor}
                      </p>
                    </div>
                    <Badge tone={DELIVERABLE_TONE[d.state]}>
                      {DELIVERABLE_COPY[d.state]}
                    </Badge>
                    <div className="shrink-0">
                      {d.state === "NOT_STARTED" ? (
                        <Button
                          variant="secondary"
                          disabled={guardianPending}
                          title={
                            guardianPending
                              ? "Blocked: a minor needs a verified guardian first (§4)"
                              : "Opens the direct-to-R2 presigned upload (guide §11) — not wired"
                          }
                        >
                          Upload proof
                        </Button>
                      ) : (
                        <Button variant="ghost">View</Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
            <p className="mt-2 text-[11px] text-faint">
              Uploads go direct to R2 via presigned URLs — never through the app
              server (guide §11).
            </p>
          </section>

          {/* ---------------------------------------------- rate card */}
          <section className="sx-animate sx-delay-3">
            <SectionHeading
              title="Your rate card"
              hint="§5 job catalogue at your confirmed rates. Sponsors never see these amounts."
            />
            <Card className="p-0">
              <ul className="divide-y divide-line-soft">
                {rates.map((r) => (
                  <li
                    key={r.jobId}
                    className="flex items-center gap-4 px-4 py-2.5"
                  >
                    <Badge tone="neutral">{r.jobId}</Badge>
                    <span className="min-w-0 flex-1 truncate text-xs">
                      {r.name}
                    </span>
                    <span className="text-xs font-semibold tabular-nums">
                      {money(r.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        </div>

        {/* ==================================================== side rail */}
        <div className="space-y-6">
          {/* ------------------------------------------------- earnings */}
          <section className="sx-animate sx-delay-2">
            <SectionHeading
              title="Earnings"
              hint="This cycle by state — status only, not the career total (§21)"
            />
            <Card>
              <ul className="space-y-2.5">
                {earnings.map((e) => (
                  <li key={e.state} className="flex items-center gap-3">
                    <Badge tone={EARNING_TONE[e.state]}>{e.label}</Badge>
                    <span className="ml-auto text-xs font-semibold tabular-nums">
                      {money(e.amount)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 border-t border-line-soft pt-3 text-[11px] leading-relaxed text-faint">
                SponsorX holds no bank details and no tax ID (§26, stack
                decision A6). Payment itself happens outside the system in
                Phase 1; this is the status of it.
              </p>
              <div className="mt-3">
                <Button variant="secondary" href="/athlete/earnings" full>
                  Earnings detail
                </Button>
              </div>
            </Card>
          </section>

          {/* --------------------------------------- profile completion */}
          <section className="sx-animate sx-delay-3">
            <SectionHeading title="Profile completion" />
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
              <ul className="mt-4 space-y-0.5">
                {profileChecklist.map((c) => (
                  <li key={c.label}>
                    <Link
                      href={`/athlete/profile/edit?section=${CHECKLIST_SECTION[c.label]}`}
                      className="group flex items-center gap-2 rounded-md px-1.5 py-1 text-[11px] transition-colors hover:bg-surface-2/70"
                    >
                      <span
                        className={c.done ? "text-accent" : "text-faint"}
                        aria-hidden="true"
                      >
                        {c.done ? "✓" : "▢"}
                      </span>
                      <span
                        className={[
                          "flex-1",
                          c.done ? "text-muted" : "text-text",
                        ].join(" ")}
                      >
                        {c.label}
                      </span>
                      <span
                        aria-hidden="true"
                        className="text-faint opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        {c.done ? "edit →" : "finish →"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </section>

          {/* -------------------------------------------------- audience */}
          <section className="sx-animate sx-delay-4">
            <SectionHeading
              title="Audience"
              hint="§22 — every figure carries its source"
            />
            <Card>
              <ul className="space-y-3">
                {socials.map((s) => (
                  <li key={s.platform}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-medium">{s.platform}</span>
                      <span className="text-xs tabular-nums text-muted">
                        {s.followers.toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-faint">{s.handle}</span>
                      <SourceLabel source={s.source} />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </section>

          {/* ------------------------------------------------ agreements */}
          <section className="sx-animate sx-delay-5">
            <SectionHeading
              title="Agreements"
              hint="§12 — metadata and signature references"
            />
            <Card>
              <ul className="space-y-3">
                {agreements.map((a) => (
                  <li key={a.kind}>
                    <p className="text-[11px] font-medium leading-snug">
                      {a.kind}
                    </p>
                    <p className="mt-0.5 text-[11px] text-faint">
                      v{a.version} · accepted {a.acceptedAt}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          </section>

          {/* -------------------------------------------------- guardian */}
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
