import Link from "next/link";
import { Badge, Card, SectionHeading } from "@/components/ui";
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

/* --------------------------------------------------------------------------
   BTG Admin Operations Board — §23, surface §10. Redesigned 2026-09-11 (A2).

   One band answers "is the marketplace healthy right now?": network GMV and
   pace (money), the live work queues with aging (throughput), and network
   growth. Beneath it, a money-flow → pacing → integration bento, then the
   full work-queue detail and activity feed.

   Provenance is on every number (§22, CLAUDE.md): GMV, queues, median match
   and network size are Postgres; invoiced/collected are Zoho Books. Zoho never
   sits on a request path — a queued sync is healthy, not an outage.
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
                  href={`/admin/campaigns/${c.id}`}
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
              href="/admin/campaigns/new"
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
