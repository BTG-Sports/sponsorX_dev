import { Badge, Card, SectionHeading, StatTile } from "@/components/ui";
import { FunnelSteps, Sparkline } from "@/components/charts";
import { MiniChip } from "@/components/hero";
import { EmptyState, SkeletonPage } from "@/components/states";
import { demoState } from "@/lib/demo";
import {
  EARNING_COPY,
  athlete,
  athleteCareer,
  athleteEarningsTrend,
  earningItems,
  earnings,
  heldNote,
  money,
  type EarningState,
} from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Athlete Earnings — §24, §21. Athlete portal. Redesigned 2026-09-11 (A2).

   Status only. The Earning state machine (§21) is the whole feature here:
   PENDING → ELIGIBLE → APPROVED_FOR_PAYOUT → PAID, with HELD / DISPUTED as
   off-ramps. SponsorX stores no bank details and no tax ID (§26, Addendum A6),
   and no money moves through the system in Phase 1 — payout happens outside
   it. Earning.reference holds a Zoho/payment reference where one exists, never
   a credential.

   Canonical career totals come from `athleteCareer` (Postgres). The per-state
   `earnings` rows and the `earningItems` table are a smaller, in-cycle sample
   at a different scale — they are framed as "this cycle / recent items", never
   as the career total, so the two never contradict on screen.
   -------------------------------------------------------------------------- */

const EARNING_TONE: Record<EarningState, "neutral" | "primary" | "accent" | "danger"> = {
  PENDING: "neutral",
  ELIGIBLE: "primary",
  APPROVED_FOR_PAYOUT: "primary",
  PAID: "accent",
  HELD: "danger",
  DISPUTED: "danger",
};

export default async function AthleteEarningsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") throw new Error("Demo error state");

  const heading = (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Earnings</h1>
      <p className="mt-1 text-xs text-muted">
        Status of what you&rsquo;ve earned across campaigns. §21 state machine
        — status only, no payment details.
      </p>
    </div>
  );

  if (demo === "empty") {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState
          mark="clock"
          title="No earnings yet"
          hint="Earnings appear when a campaign order goes live."
        />
      </div>
    );
  }

  // This portal is scoped to the signed-in athlete; fixtures use one demo
  // athlete, so filter earning rows to them (the real query is tenant-scoped).
  const mine = earningItems.filter((e) => e.athlete === athlete.displayName);

  // Monthly earnings trend (Σ Earning by month — Postgres).
  const trendAvgCents = Math.round(
    athleteEarningsTrend.reduce((s, v) => s + v, 0) / athleteEarningsTrend.length,
  );

  return (
    <div className="space-y-6">
      {/* -------------------------------------------------------- headline */}
      {heading}

      {/* ------------------------------------------- canonical tiles + YTD */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Career earned"
          value={money(athleteCareer.careerEarningsCents)}
          sub="approved + paid, to date"
        />
        <StatTile
          label="Approved for payout"
          value={money(athleteCareer.approvedCents)}
          sub={`payout ${athleteCareer.nextPayout}`}
        />
        <StatTile
          label="On-time rate"
          value={`${athleteCareer.onTimeRatePct}%`}
          sub="deliverables on schedule"
        />
        <Card className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
            YTD momentum
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
      <p className="-mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] text-faint">
        Career, approved and on-time are Σ Earning / deliverable timestamps
        <MiniChip kind="ver">POSTGRES</MiniChip>
        · payout status only, no tax ID or bank details (§26)
      </p>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start">
        {/* ============================================== earning rows */}
        <section className="min-w-0">
          <SectionHeading
            title="Recent orders"
            hint="Recent items — a sample of the cycle, not the career total. Each Campaign Order earns once its deliverables are verified."
          />
          <Card className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left">
                <thead>
                  <tr className="border-b border-line text-[10px] uppercase tracking-wider text-faint">
                    <th className="px-4 py-2.5 font-medium">Campaign</th>
                    <th className="px-4 py-2.5 font-medium">Job</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {mine.map((e) => (
                    <tr key={e.id}>
                      <td className="px-4 py-3">
                        <p className="text-xs font-medium">{e.campaign}</p>
                        <p className="mt-0.5 text-[11px] text-faint">
                          updated {e.updatedAt}
                          {e.reference && (
                            <>
                              {" · ref "}
                              <code className="font-mono">{e.reference}</code>
                            </>
                          )}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone="neutral">{e.jobId}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={EARNING_TONE[e.state]}>
                          {EARNING_COPY[e.state]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-semibold tabular-nums">
                        {money(e.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </section>

        {/* ==================================================== side rail */}
        <div className="space-y-4">
          <Card>
            <SectionHeading
              title="This cycle by state"
              hint="§21 — sample, not the career total"
            />
            <FunnelSteps
              stages={earnings.map((e) => ({ label: e.label, value: e.amount }))}
              compact
            />
            <ul className="mt-3 space-y-1.5">
              {earnings.map((e) => (
                <li key={e.state} className="flex items-center gap-3">
                  <Badge tone={EARNING_TONE[e.state]}>{e.label}</Badge>
                  <span className="ml-auto text-xs font-semibold tabular-nums">
                    {money(e.amount)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 rounded-lg border border-danger/25 bg-danger/8 px-2.5 py-1.5 text-[11px] leading-relaxed text-muted">
              {heldNote}
            </p>
            <p className="mt-3 flex items-center gap-1.5 text-[10px] text-faint">
              Σ Earning by state, this cycle <MiniChip kind="ver">POSTGRES</MiniChip>
            </p>
          </Card>

          <Card>
            <SectionHeading title="The state machine" hint="§21" />
            <ol className="space-y-2 text-[11px]">
              {(
                [
                  "PENDING",
                  "ELIGIBLE",
                  "APPROVED_FOR_PAYOUT",
                  "PAID",
                ] as EarningState[]
              ).map((s, i) => (
                <li key={s} className="flex items-center gap-2.5">
                  <span className="text-faint tabular-nums">{i + 1}</span>
                  <Badge tone={EARNING_TONE[s]}>{EARNING_COPY[s]}</Badge>
                </li>
              ))}
            </ol>
            <p className="mt-3 border-t border-line-soft pt-3 text-[11px] leading-relaxed text-faint">
              <Badge tone="danger">Held</Badge> and{" "}
              <Badge tone="danger">Disputed</Badge> are off-ramps handled by
              BTG Finance.
            </p>
          </Card>

          <Card>
            <p className="text-[11px] font-medium text-muted">No account details</p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
              SponsorX never collects a bank account or tax ID (§26, Addendum
              A6). This screen shows the status of your earnings; the payout
              itself happens outside SponsorX in Phase 1.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
