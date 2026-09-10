import { Badge, BlockedNotice, Card, SectionHeading, StatTile } from "@/components/ui";
import { Donut, FunnelSteps, HBarList } from "@/components/charts";
import { MiniChip } from "@/components/hero";
import { EmptyState, SkeletonPage } from "@/components/states";
import { demoState } from "@/lib/demo";
import {
  EARNING_COPY,
  INVOICE_COPY,
  adminFinanceX,
  earningItems,
  money,
  sponsorInvoices,
  type EarningState,
  type InvoiceStatus,
} from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Finance Workspace — §10.

   Two sides that SponsorX only ever observes:

   - Sponsor invoices live in Zoho Books. SponsorX holds the reference and the
     status Zoho reports, inbound only — it never writes an invoice (§18).
   - Athlete earnings move through the §21 state machine. Status only: no tax
     ID, no bank details (§26, Addendum A6). Earning.reference is a Zoho /
     payment reference, never a credential.

   The whole "approve for payout" action is BLOCKED on the written Phase 1
   payment policy (§37 gate one) — the A-gate. This screen shows states; it
   does not move money or collect payout details, and won't until the policy
   is written down.
   -------------------------------------------------------------------------- */

const EARNING_TONE: Record<EarningState, "neutral" | "primary" | "accent" | "danger"> = {
  PENDING: "neutral",
  ELIGIBLE: "primary",
  APPROVED_FOR_PAYOUT: "primary",
  PAID: "accent",
  HELD: "danger",
  DISPUTED: "danger",
};

const INVOICE_TONE: Record<InvoiceStatus, "neutral" | "primary" | "accent" | "danger"> = {
  DRAFT: "neutral",
  SENT: "primary",
  PAID: "accent",
  OVERDUE: "danger",
};

export default async function AdminFinancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") throw new Error("Demo error state");

  const heading = (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Finance</h1>
      <p className="mt-1 text-xs text-muted">
        Invoice status from Zoho Books and athlete earnings status — §10.
        SponsorX observes; it does not invoice or pay.
      </p>
    </div>
  );

  if (demo === "empty") {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState
          mark="chart"
          title="No invoices yet"
          hint="Invoices sync from Zoho Books once campaigns launch."
        />
      </div>
    );
  }

  const invoiced = sponsorInvoices.reduce((s, i) => s + i.amount, 0);
  const collected = sponsorInvoices
    .filter((i) => i.status === "PAID")
    .reduce((s, i) => s + i.amount, 0);
  const owedToAthletes = earningItems
    .filter((e) => e.state !== "PAID" && e.state !== "DISPUTED")
    .reduce((s, e) => s + e.amount, 0);
  const attention = earningItems.filter(
    (e) => e.state === "HELD" || e.state === "DISPUTED",
  ).length;

  return (
    <div className="space-y-6">
      {/* -------------------------------------------------------- headline */}
      {heading}

      {/* -------------------------------------------------------- gate ---- */}
      <BlockedNotice>
        Payout actions are blocked on the written Phase 1 payment policy (§37
        gate one, an open A-gate). Expected: earnings status only, no tax ID
        collected. Until it is written and linked from the stack decision,
        nothing here approves a payout.
      </BlockedNotice>

      {/* ------------------------------------------------ collection + aging */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="sx-animate sx-delay-1 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Collection rate
          </p>
          <div className="mt-3 flex items-center gap-4">
            <Donut
              segments={[
                {
                  label: "Collected",
                  value: adminFinanceX.collectionRatePct,
                  color: "var(--sx-primary)",
                },
                {
                  label: "Outstanding",
                  value: 100 - adminFinanceX.collectionRatePct,
                  color: "var(--sx-line-soft)",
                },
              ]}
              centerValue={`${adminFinanceX.collectionRatePct}%`}
              centerLabel="collected"
            />
            <div>
              <p className="text-2xl font-semibold tabular-nums">
                {adminFinanceX.collectionRatePct}%
              </p>
              <p className="text-xs text-muted">of invoiced revenue collected</p>
            </div>
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[10px] text-faint">
            collected / invoiced <MiniChip kind="ver">ZOHO BOOKS</MiniChip>
          </p>
        </Card>

        <Card className="sx-animate sx-delay-2 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
              Invoice aging
            </p>
            <Badge tone="danger">overdue</Badge>
          </div>
          <div className="mt-3">
            <HBarList
              rows={adminFinanceX.aging.map((row) => ({
                ...row,
                tone: row.label === "> 60 days" ? "warn" : "primary",
              }))}
            />
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[10px] text-faint">
            invoice age buckets <MiniChip kind="ver">ZOHO BOOKS</MiniChip>
          </p>
        </Card>
      </div>

      {/* ----------------------------------------------------- stat tiles */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Invoiced" value={money(invoiced)} sub="via Zoho Books" source="VERIFIED_MANUAL" />
        <StatTile label="Collected" value={money(collected)} sub="marked paid in Zoho" source="VERIFIED_MANUAL" />
        <StatTile label="Owed to athletes" value={money(owedToAthletes)} sub="not yet paid" />
        <StatTile label="Needs attention" value={String(attention)} sub="held / disputed" />
      </div>

      {/* ------------------------------------------------ sponsor invoices */}
      <section>
        <SectionHeading
          title="Sponsor invoices"
          hint="§18 — from Zoho Books, inbound only. SponsorX never writes an invoice."
        />
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left">
              <thead>
                <tr className="border-b border-line text-[10px] uppercase tracking-wider text-faint">
                  <th className="px-4 py-2.5 font-medium">Sponsor</th>
                  <th className="px-4 py-2.5 font-medium">Campaign</th>
                  <th className="px-4 py-2.5 font-medium">Reference</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {sponsorInvoices.map((i) => (
                  <tr key={i.id}>
                    <td className="px-4 py-3 text-xs font-medium">{i.sponsor}</td>
                    <td className="px-4 py-3 text-xs text-muted">{i.campaign}</td>
                    <td className="px-4 py-3">
                      <code className="font-mono text-[11px] text-faint">{i.ref}</code>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={INVOICE_TONE[i.status]}>
                        {INVOICE_COPY[i.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-semibold tabular-nums">
                      {money(i.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      {/* ------------------------------------------------ athlete earnings */}
      <section>
        <SectionHeading
          title="Athlete earnings"
          hint="§21 state machine — status only, no tax ID or bank details (§26)"
        />
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left">
              <thead>
                <tr className="border-b border-line text-[10px] uppercase tracking-wider text-faint">
                  <th className="px-4 py-2.5 font-medium">Athlete</th>
                  <th className="px-4 py-2.5 font-medium">Campaign</th>
                  <th className="px-4 py-2.5 font-medium">Reference</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {earningItems.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-3 text-xs font-medium">{e.athlete}</td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {e.campaign}
                      <span className="text-faint"> · {e.jobId}</span>
                    </td>
                    <td className="px-4 py-3">
                      {e.reference ? (
                        <code className="font-mono text-[11px] text-faint">{e.reference}</code>
                      ) : (
                        <span className="text-[11px] text-faint">—</span>
                      )}
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
        <p className="mt-2 text-[10px] leading-relaxed text-faint">
          Commission is BTG&rsquo;s cut of the sponsor price; the athlete&rsquo;s
          rate and the sponsor price are different numbers, and reconciliation
          against Zoho happens in the worker (§18), never on this screen.
        </p>
      </section>

      {/* --------------------------------------------------- earnings flow */}
      <section>
        <SectionHeading
          title="Earnings flow"
          hint="§21 — Σ Earning by state, cents"
        />
        <Card className="p-4">
          <FunnelSteps
            stages={adminFinanceX.earningsFlow.map((s) => ({
              label: s.label,
              value: s.value,
            }))}
            compact
          />
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
            {adminFinanceX.earningsFlow.map((s) => (
              <li key={s.label}>
                {s.label} <span className="font-semibold text-text">{money(s.value)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex items-center gap-1.5 text-[10px] text-faint">
            Σ Earning by state <MiniChip kind="ver">POSTGRES</MiniChip>
          </p>
          <p className="mt-2 text-[10px] leading-relaxed text-faint">
            Earnings are status-tracked only — no tax ID or bank details are
            collected in Phase 1 (§26, Addendum A6); payout policy is still an
            open gate (§37).
          </p>
        </Card>
      </section>
    </div>
  );
}
