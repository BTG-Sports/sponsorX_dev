import Link from "next/link";
import { Badge, BlockedNotice, Card, SectionHeading } from "@/components/ui";
import { HBarList, Sparkline } from "@/components/charts";
import { HeroBand, MiniChip } from "@/components/hero";
import { QueueTicker } from "@/components/queue-ticker";
import { EmptyState, SkeletonPage } from "@/components/states";
import { demoState } from "@/lib/demo";
import {
  HEALTH_COPY,
  adminActivity,
  adminOps,
  applications,
  contentReviewQueue,
  earningItems,
  integrationHealth,
  invitations,
  money,
  sponsorCampaigns,
  sponsorInvoices,
  type HealthStatus,
} from "@/lib/fixtures";
import { liveBoard, type Count, type LiveBoard } from "@/server/admin-board";
import { mayUse } from "@/lib/admin-access";

/* --------------------------------------------------------------------------
   BTG Admin Operations Board — §23, surface §10. Redesigned 2026-09-11 (A2).

   One band answers "is the marketplace healthy right now?": network GMV and
   pace (money), the live work queues with aging (throughput), and network
   growth. Beneath it, a money-flow → pacing → integration bento, then the
   full work-queue detail and activity feed.

   Provenance is on every number (§22, CLAUDE.md): GMV, queues, median match
   and network size are Postgres; invoiced/collected are Zoho Books. Zoho never
   sits on a request path — a queued sync is healthy, not an outage.

   LIVE (P2-FE-01). Signed-in BTG staff get the board from the reads each
   desk already makes (server/admin-board.ts): booked / invoiced / collected
   and pacing over GET /campaigns, the four work queues from the desks' own
   lists, integration health, and the audit log's latest entries. Figures
   with no source yet — quarter-on-quarter GMV, median brief → match time,
   the network growth line — are not drawn. Any ?demo= state keeps the deck.
   -------------------------------------------------------------------------- */

const HEALTH_CHIP: Record<HealthStatus, "ver" | "neutral" | "warn"> = {
  OK: "ver",
  SYNCING: "neutral",
  DEGRADED: "warn",
  DOWN: "warn",
};

function Queue({
  href,
  label,
  count,
  hint,
}: {
  href: string;
  label: string;
  count: number;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 rounded-xl border border-line bg-surface px-4 py-3 transition-colors hover:bg-surface-2"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-admin/15 text-base font-semibold tabular-nums text-admin">
        {count}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium">{label}</span>
        <span className="block text-[11px] text-faint">{hint}</span>
      </span>
      <span className="text-muted" aria-hidden="true">
        →
      </span>
    </Link>
  );
}

export default async function AdminHomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") throw new Error("Demo error state");

  const heading = (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Operations Board</h1>
      <p className="mt-1 text-xs text-muted">
        Everything across the SponsorX marketplace — §23. Managed operations:
        matching, approvals and invoicing are done by BTG staff in Phase 1.
      </p>
    </div>
  );

  const live = demo === null ? await liveBoard() : null;
  if (live) return <LiveBoardView board={live} heading={heading} />;

  /* Brand-new tenant: nothing booked, nothing queued — the board is only the
     next action, not zeros dressed up as insight. */
  if (demo === "empty") {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState
          mark="inbox"
          title="No campaigns yet"
          hint="The board fills as briefs are matched and orders launch."
          action={{ label: "Review applications", href: "/admin/applications" }}
        />
      </div>
    );
  }

  const pendingApplications = applications.filter(
    (a) => a.state === "SUBMITTED" || a.state === "UNDER_REVIEW",
  ).length;
  const awaitingContent = contentReviewQueue.length;
  const openInvites = invitations.filter(
    (i) => i.state === "INVITED" || i.state === "VIEWED",
  ).length;
  const heldOrDisputed = earningItems.filter(
    (e) => e.state === "HELD" || e.state === "DISPUTED",
  ).length;
  const overdueInvoices = sponsorInvoices.filter(
    (i) => i.status === "OVERDUE",
  ).length;

  const moneyFlow = [
    {
      label: "Booked",
      value: adminOps.bookedCents,
      display: money(adminOps.bookedCents),
      tone: "primary" as const,
    },
    {
      label: "Invoiced",
      value: adminOps.invoicedCents,
      display: money(adminOps.invoicedCents),
      tone: "soft" as const,
    },
    {
      label: "Collected",
      value: adminOps.collectedCents,
      display: money(adminOps.collectedCents),
      tone: "soft" as const,
    },
  ];

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------------------- headline */}
      {heading}

      {/* P7-QA-02: the board has no live read yet (P2-FE-01) — every figure
          below is fixtures.ts, and the chips name the path each WILL read.
          The campaign rows link to the live list, not fixture ids c1…c5. */}
      <BlockedNotice>
        Demo data — the Operations Board isn&rsquo;t wired to live reads yet, so
        every figure below is sample data. Live figures: Campaigns, Network,
        Finance, Analytics and Integrations.
      </BlockedNotice>

      {/* -------------------------------------------------------- hero band */}
      <HeroBand className="sx-animate" border="border-admin/25">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">
              Operations board · Network GMV this quarter
            </p>
            <p className="mt-1 bg-[linear-gradient(90deg,var(--sx-admin),var(--sx-primary))] bg-clip-text text-4xl font-bold tabular-nums tracking-tight text-transparent sm:text-5xl">
              {money(adminOps.gmvQuarterCents)}
            </p>
            <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
              <MiniChip kind="ver">▲ {adminOps.gmvDeltaPct}% QTR</MiniChip>
              vs last quarter · {adminOps.liveCampaigns} campaigns live
              <MiniChip kind="ver">POSTGRES</MiniChip>
            </p>
            <p className="mt-3 flex items-center gap-2 text-xs text-muted">
              Median brief → match
              <span className="font-semibold text-text">
                {adminOps.medianMatchHours}h
              </span>
              <MiniChip kind="neutral">timestamps</MiniChip>
            </p>
          </div>
          <div className="grid w-full max-w-sm gap-2">
            {adminOps.queues.map((q) => (
              <QueueTicker key={q.label} {...q} />
            ))}
            <div className="flex items-center justify-between rounded-lg border border-line/70 px-3 py-2 text-xs">
              <span className="text-muted">Network growth</span>
              <span className="flex items-center gap-2">
                <span className="w-20">
                  <Sparkline
                    points={adminOps.networkGrowth}
                    stroke="var(--sx-primary)"
                  />
                </span>
                <span className="font-semibold tabular-nums">
                  {adminOps.networkSize} athletes
                </span>
              </span>
            </div>
          </div>
        </div>
      </HeroBand>

      {/* ------------------------------------------------------------- bento */}
      <div className="grid grid-flow-col auto-cols-[85%] gap-4 overflow-x-auto sx-snap-x md:grid-flow-row md:auto-cols-auto md:grid-cols-3 md:overflow-visible">
        {/* -------------------------------------------------- money flow */}
        <Card className="sx-animate sx-delay-1 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Money flow · this quarter
          </p>
          <div className="mt-3">
            <HBarList rows={moneyFlow} />
          </div>
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-faint">
            booked <MiniChip kind="ver">POSTGRES</MiniChip>
            <span aria-hidden="true">·</span>
            invoiced / collected <MiniChip kind="ver">ZOHO BOOKS</MiniChip>
          </p>
        </Card>

        {/* --------------------------------------------- campaign pacing */}
        <Card className="sx-animate sx-delay-2 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Campaign pacing
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold tabular-nums text-success">
              {adminOps.campaignsOnTrack} on track
            </span>
            <Badge tone="warn">{adminOps.campaignsBehind} behind</Badge>
          </p>
          <ul className="mt-3 space-y-1.5">
            {sponsorCampaigns.map((c) => (
              <li key={c.id}>
                <Link
                  href="/admin/campaigns"
                  className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-[11px] transition-colors hover:bg-surface-2"
                >
                  <span className="min-w-0 truncate font-medium">{c.name}</span>
                  <span className="shrink-0 tabular-nums text-muted">
                    {money(c.spend)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-2 flex items-center gap-1.5 text-[10px] text-faint">
            deliverables vs elapsed time <MiniChip kind="ver">POSTGRES</MiniChip>
          </p>
        </Card>

        {/* ------------------------------------------ integration health */}
        <Card className="sx-animate sx-delay-3 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Integration health · §23
          </p>
          <ul className="mt-3 space-y-2.5">
            {integrationHealth.map((h) => (
              <li key={h.system} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium">{h.system}</p>
                  <p className="truncate text-[11px] text-faint">{h.detail}</p>
                </div>
                <MiniChip kind={HEALTH_CHIP[h.status]}>
                  {HEALTH_COPY[h.status]}
                </MiniChip>
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-line-soft pt-3 text-[10px] leading-relaxed text-faint">
            Zoho never sits on a request path — a queued sync is healthy, not an
            outage (§18).
          </p>
        </Card>
      </div>

      {/* ------------------------------------------------ below the fold */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
        <section className="sx-animate sx-delay-4 min-w-0">
          <SectionHeading
            title="Needs BTG action"
            hint="The managed-marketplace work — the §39 loop runs through these"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Queue
              href="/admin/applications"
              label="Athlete applications"
              count={pendingApplications}
              hint="review · score · approve"
            />
            <Queue
              href="/admin/approvals"
              label="Content approvals"
              count={awaitingContent}
              hint="BTG & sponsor review"
            />
            <Queue
              href="/admin/campaigns"
              label="Briefs to match"
              count={openInvites}
              hint="match athletes · invite"
            />
            <Queue
              href="/admin/finance"
              label="Finance attention"
              count={heldOrDisputed + overdueInvoices}
              hint={`${heldOrDisputed} held/disputed · ${overdueInvoices} overdue`}
            />
          </div>
        </section>

        <section className="sx-animate sx-delay-5">
          <SectionHeading title="Recent activity" />
          <Card>
            <ul className="space-y-3">
              {adminActivity.map((a, i) => (
                <li key={i} className="flex gap-3 text-[11px]">
                  <span className="w-6 shrink-0 text-faint tabular-nums">
                    {a.at}
                  </span>
                  <span className="text-muted">{a.text}</span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- live board */

const fmtCount = (c: Count | null) => (c === null ? "—" : `${c.n}${c.more ? "+" : ""}`);

function LiveQueue({
  href,
  label,
  count,
  hint,
  roles,
}: {
  href: string;
  label: string;
  count: Count | null;
  hint: string;
  roles: string[];
}) {
  /* C-1: a desk this role isn't for is shown, not linked — the count is
     still true, but the card mustn't lead to "not in your role". */
  const open = mayUse(href, roles);
  const body = (
    <>
      <span className="grid h-10 min-w-10 shrink-0 place-items-center rounded-lg bg-admin/15 px-1.5 text-base font-semibold tabular-nums text-admin">
        {fmtCount(count)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium">{label}</span>
        <span className="block text-[11px] text-faint">
          {count === null ? "not in your role's view" : open ? hint : `${hint} · handled by another role`}
        </span>
      </span>
      {open && (
        <span className="text-muted" aria-hidden="true">
          →
        </span>
      )}
    </>
  );
  if (!open) {
    return <div className="flex items-center gap-4 rounded-xl border border-line bg-surface px-4 py-3">{body}</div>;
  }
  return (
    <Link
      href={href}
      className="flex items-center gap-4 rounded-xl border border-line bg-surface px-4 py-3 transition-colors hover:bg-surface-2"
    >
      <span className="grid h-10 min-w-10 shrink-0 place-items-center rounded-lg bg-admin/15 px-1.5 text-base font-semibold tabular-nums text-admin">
        {fmtCount(count)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium">{label}</span>
        <span className="block text-[11px] text-faint">
          {count === null ? "not in your role's view" : hint}
        </span>
      </span>
      <span className="text-muted" aria-hidden="true">
        →
      </span>
    </Link>
  );
}

function LiveBoardView({ board, heading }: { board: LiveBoard; heading: React.ReactNode }) {
  const cs = board.summary;
  const totals = cs
    ? { contracted: cs.contracted ?? null, invoiced: cs.invoiced ?? null, paid: cs.paid ?? null }
    : null;
  const running = { length: cs?.active ?? 0 };
  const behind = { length: cs?.behind ?? 0 };
  const pacing = cs?.pacing ?? [];
  const h = board.health;
  const moneyFlow = totals
    ? [
        { label: "Booked", value: totals.contracted ?? 0, display: totals.contracted === null ? "—" : money(totals.contracted), tone: "primary" as const },
        { label: "Invoiced", value: totals.invoiced ?? 0, display: totals.invoiced === null ? "—" : money(totals.invoiced), tone: "soft" as const },
        { label: "Collected", value: totals.paid ?? 0, display: totals.paid === null ? "—" : money(totals.paid), tone: "soft" as const },
      ]
    : null;

  return (
    <div className="space-y-6">
      {heading}

      <HeroBand className="sx-animate" border="border-admin/25">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">
              Operations board · booked across campaigns
            </p>
            <p className="mt-1 bg-[linear-gradient(90deg,var(--sx-admin),var(--sx-primary))] bg-clip-text text-4xl font-bold tabular-nums tracking-tight text-transparent sm:text-5xl">
              {totals?.contracted != null ? money(totals.contracted) : "—"}
            </p>
            <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
              {cs ? `${running.length} campaign${running.length === 1 ? "" : "s"} live · ${cs.total} in total` : "Campaigns aren't in your role's view"}
              <MiniChip kind="ver">POSTGRES</MiniChip>
            </p>
          </div>
          <div className="grid w-full max-w-sm gap-2 text-xs">
            {[
              ["Applications to review", board.queues.applications],
              ["Content awaiting BTG", board.queues.content],
              ["Approved briefs to staff", board.queues.briefs],
            ].map(([label, c]) => (
              <div key={label as string} className="flex items-center justify-between rounded-lg border border-line/70 px-3 py-2">
                <span className="text-muted">{label as string}</span>
                <span className="font-semibold tabular-nums">{fmtCount(c as Count | null)}</span>
              </div>
            ))}
          </div>
        </div>
      </HeroBand>

      <div className="grid grid-flow-col auto-cols-[85%] gap-4 overflow-x-auto sx-snap-x md:grid-flow-row md:auto-cols-auto md:grid-cols-3 md:overflow-visible">
        <Card className="sx-animate sx-delay-1 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Money flow · all campaigns</p>
          {moneyFlow ? (
            <div className="mt-3">
              <HBarList rows={moneyFlow} />
            </div>
          ) : (
            <p className="mt-3 text-[11px] text-faint">Not in your role&rsquo;s view.</p>
          )}
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-faint">
            booked <MiniChip kind="ver">POSTGRES</MiniChip>
            <span aria-hidden="true">·</span>
            invoiced / collected <MiniChip kind="ver">ZOHO BOOKS</MiniChip>
          </p>
        </Card>

        <Card className="sx-animate sx-delay-2 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Campaign pacing</p>
          {cs ? (
            <>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold tabular-nums text-success">{running.length - behind.length} on track</span>
                <Badge tone={behind.length ? "warn" : "neutral"}>{behind.length} behind</Badge>
              </p>
              {pacing.length === 0 ? (
                <p className="mt-3 text-[11px] text-faint">No active campaigns.</p>
              ) : (
                <ul className="mt-3 space-y-1.5">
                  {pacing.map((c) => (
                    <li key={c.id}>
                      <Link
                        href={`/admin/campaigns/${encodeURIComponent(c.id)}`}
                        className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-[11px] transition-colors hover:bg-surface-2"
                      >
                        <span className="min-w-0 truncate font-medium">{c.name}</span>
                        <span className="shrink-0 tabular-nums text-muted">
                          {c.behind ? <Badge tone="warn">behind</Badge> : `${c.done}/${c.total}`}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="mt-3 text-[11px] text-faint">Not in your role&rsquo;s view.</p>
          )}
          <p className="mt-2 flex items-center gap-1.5 text-[10px] text-faint">
            deliverables vs elapsed time <MiniChip kind="ver">POSTGRES</MiniChip>
          </p>
        </Card>

        <Card className="sx-animate sx-delay-3 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Integration health · §23</p>
          {h ? (
            <ul className="mt-3 space-y-2.5 text-xs">
              <li className="flex items-center justify-between gap-3">
                <span>Database, cache, storage</span>
                <MiniChip kind={h.dependenciesDown.length ? "warn" : "ver"}>
                  {h.dependenciesDown.length ? `${h.dependenciesDown.join(", ")} down` : "OK"}
                </MiniChip>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span>Zoho outbox</span>
                <MiniChip kind="neutral">{h.outboxPending ? `${h.outboxPending} queued` : "drained"}</MiniChip>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span>Webhooks rejected</span>
                <MiniChip kind={h.webhooksRejected ? "warn" : "ver"}>{h.webhooksRejected}</MiniChip>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span>Recent failed jobs</span>
                <MiniChip kind={h.jobsFailed ? "warn" : "ver"}>{h.jobsFailed}</MiniChip>
              </li>
            </ul>
          ) : (
            <p className="mt-3 text-[11px] text-faint">Integration health is BTG admin&rsquo;s.</p>
          )}
          <p className="mt-3 border-t border-line-soft pt-3 text-[10px] leading-relaxed text-faint">
            Zoho never sits on a request path — a queued sync is healthy, not an outage (§18).{" "}
            <Link href="/admin/integrations" className="underline">Details</Link>
          </p>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
        <section className="sx-animate sx-delay-4 min-w-0">
          <SectionHeading title="Needs BTG action" hint="The managed-marketplace work — the §39 loop runs through these" />
          <div className="grid gap-3 sm:grid-cols-2">
            <LiveQueue href="/admin/applications" label="Athlete applications" count={board.queues.applications} hint="submitted or in review" roles={board.roles} />
            <LiveQueue href="/admin/approvals" label="Content approvals" count={board.queues.content} hint="submitted or in BTG review" roles={board.roles} />
            <LiveQueue href="/admin/campaigns/match" label="Briefs to match" count={board.queues.briefs} hint="approved · match athletes · invite" roles={board.roles} />
            <LiveQueue href="/admin/finance" label="Finance attention" count={board.queues.finance} hint="earnings held or disputed" roles={board.roles} />
          </div>
        </section>

        <section className="sx-animate sx-delay-5">
          <SectionHeading title="Recent activity" hint="from the audit log" />
          <Card>
            {board.activity === null ? (
              <p className="text-[11px] text-faint">The audit log is BTG admin&rsquo;s.</p>
            ) : board.activity.length === 0 ? (
              <p className="text-[11px] text-faint">Nothing recorded yet.</p>
            ) : (
              <ul className="space-y-3">
                {board.activity.map((a) => (
                  <li key={a.id} className="flex gap-3 text-[11px]">
                    <span className="w-14 shrink-0 text-faint tabular-nums">
                      {new Date(a.at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
                    </span>
                    <span className="min-w-0 text-muted">
                      <span className="font-medium text-text">{a.action.toLowerCase().replace(/[._]/g, " ")}</span>{" "}
                      · {a.entity}
                      {a.actor ? <span className="block truncate text-faint">{a.actor}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 border-t border-line-soft pt-3 text-[10px] text-faint">
              <Link href="/admin/audit" className="underline">Full audit log</Link>
            </p>
          </Card>
        </section>
      </div>
    </div>
  );
}
