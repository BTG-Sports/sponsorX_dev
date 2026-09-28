import { Badge, BlockedNotice, Card, SectionHeading, StatTile } from "@/components/ui";
import { Donut, FunnelSteps, HBarList } from "@/components/charts";
import { MiniChip } from "@/components/hero";
import { EmptyState, SkeletonPage } from "@/components/states";
import { demoState } from "@/lib/demo";
import {
  EARNING_COPY,
  INVOICE_COPY,
  adminFinanceX,
  adminOps,
  earningItems,
  money,
  sponsorInvoices,
  type EarningState,
  type InvoiceStatus,
} from "@/lib/fixtures";
import {
  agingBuckets,
  buckets,
  STATES,
  type ApiEarning,
  type ApiReconciliation,
} from "@/lib/earnings-live";
import { apiFetch, fetchActor } from "@/server/api";

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

   LIVE vs DEMO (P7-FE-02). A signed-in Finance / BTG desk sees the REAL
   books: GET /earnings — every earning in its §21 state, the athlete's net
   amount, the sponsor price and BTG's commission — and, for BTG admin, the
   reconciliation against the Zoho Books invoice mirror (contracted vs
   invoiced vs collected, beside earnings raised and paid). Read-only on
   purpose: the payout actions stay blocked on the payment policy (§37 gate
   one), and are not coded around. FINANCE does not see invoices — the
   2026-09-24 matrix decision (RBAC Matrix, `invoice`) — so for that role
   the invoice panels say so instead of showing zeros.
   -------------------------------------------------------------------------- */

const FINANCE_ROLES = ["SUPER_ADMIN", "BTG_ADMIN", "FINANCE"];

async function liveBooks(): Promise<{ earnings: ApiEarning[]; campaigns?: ApiReconciliation[] } | null> {
  /* No catch — an outage is an error page, never fixtures dressed as the
     real books (QA pass 4 rule). */
  const who = await fetchActor();
  if (who.status !== "linked") return null;
  if (!who.actor.roles.some((r) => FINANCE_ROLES.includes(r))) return null;
  const res = await apiFetch("/earnings");
  if (!res.ok) throw new Error(`Earnings unavailable (${res.status}).`);
  return (await res.json()) as { earnings: ApiEarning[]; campaigns?: ApiReconciliation[] };
}

const LIVE_INVOICE_TONE: Record<string, "neutral" | "primary" | "accent" | "danger"> = {
  draft: "neutral",
  sent: "primary",
  paid: "accent",
  overdue: "danger",
  void: "neutral",
};

function LiveFinance({ earnings, campaigns }: { earnings: ApiEarning[]; campaigns?: ApiReconciliation[] }) {
  const now = new Date();
  const b = buckets(earnings);
  const owed = STATES.filter((st) => st !== "PAID" && st !== "DISPUTED").reduce((n, st) => n + b[st].amount, 0);
  const attention = b.HELD.count + b.DISPUTED.count;
  const invoiced = campaigns?.reduce((n, c) => n + c.invoiced, 0) ?? null;
  const collected = campaigns?.reduce((n, c) => n + c.invoicePaid, 0) ?? null;
  const rate = invoiced ? Math.round((100 * (collected ?? 0)) / invoiced) : null;
  const invoices = (campaigns ?? []).flatMap((c) => c.invoices.map((i) => ({ ...i, campaign: c.name, sponsor: c.sponsorName })));
  const noInvoices = (
    <p className="text-[11px] leading-relaxed text-muted">
      Invoices are visible to BTG admin only — the 2026-09-24 decision in the RBAC matrix
      (`invoice`): Finance reads earnings, not what the sponsor was billed.
    </p>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Finance</h1>
        <p className="mt-1 text-xs text-muted">
          Invoice status from Zoho Books and athlete earnings status — §10. SponsorX observes; it does not invoice or pay.
        </p>
      </div>

      <BlockedNotice>
        Payout actions are blocked on the written Phase 1 payment policy (§37 gate one, an open A-gate). This screen
        shows real states; it does not approve, pay or collect payout details until the policy is written.
      </BlockedNotice>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Invoiced" value={invoiced === null ? "—" : money(invoiced)} sub={invoiced === null ? "BTG admin only" : "all campaigns · Zoho Books"} />
        <StatTile label="Collected" value={collected === null ? "—" : money(collected)} sub={rate === null ? "BTG admin only" : `${rate}% of invoiced · Zoho Books`} />
        <StatTile label="Owed to athletes" value={money(owed)} sub="raised, not yet paid" />
        <StatTile label="Needs attention" value={String(attention)} sub="held / disputed" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Invoice aging</p>
          <div className="mt-3">
            {campaigns ? (
              invoices.some((i) => !["paid", "void"].includes(i.status.toLowerCase())) ? (
                <HBarList rows={agingBuckets(campaigns, now).map((r, k) => ({ ...r, tone: k >= 2 ? "warn" : "primary" }))} />
              ) : (
                <p className="text-xs text-muted">Nothing outstanding.</p>
              )
            ) : (
              noInvoices
            )}
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[10px] text-faint">
            outstanding by days past due <MiniChip kind="ver">ZOHO BOOKS</MiniChip>
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Earnings flow</p>
          <div className="mt-2">
            <FunnelSteps
              stages={["PENDING", "ELIGIBLE", "APPROVED_FOR_PAYOUT", "PAID"].map((st) => ({
                label: EARNING_COPY[st as EarningState],
                value: b[st as EarningState].amount,
              }))}
              compact
            />
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[10px] text-faint">
            Σ Earning by state — balance in each, not a conversion <MiniChip kind="ver">POSTGRES</MiniChip>
          </p>
        </Card>
      </div>

      {campaigns && (
        <section>
          <SectionHeading
            title="Reconciliation"
            hint="Per campaign: what the orders sold, what Zoho invoiced and collected, and what athletes are owed and paid."
          />
          <Card className="p-0">
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Finance — scrollable table">
              <table className="w-full min-w-[48rem] text-left">
                <thead>
                  <tr className="border-b border-line text-[10px] uppercase tracking-wider text-faint">
                    <th className="px-4 py-2.5 font-medium">Campaign</th>
                    <th className="px-4 py-2.5 text-right font-medium">Contracted</th>
                    <th className="px-4 py-2.5 text-right font-medium">Invoiced</th>
                    <th className="px-4 py-2.5 text-right font-medium">Collected</th>
                    <th className="px-4 py-2.5 text-right font-medium">Athlete earnings</th>
                    <th className="px-4 py-2.5 text-right font-medium">Paid out</th>
                    <th className="px-4 py-2.5 font-medium">Check</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {campaigns.map((c) => {
                    const under = c.invoiced < c.contracted;
                    const over = c.invoiced > c.contracted;
                    return (
                      <tr key={c.campaignId}>
                        <td className="px-4 py-3 text-xs">
                          <span className="font-medium">{c.name}</span>
                          <span className="block text-[11px] text-faint">{c.sponsorName}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-xs tabular-nums">{money(c.contracted)}</td>
                        <td className="px-4 py-3 text-right text-xs tabular-nums">{money(c.invoiced)}</td>
                        <td className="px-4 py-3 text-right text-xs tabular-nums">{money(c.invoicePaid)}</td>
                        <td className="px-4 py-3 text-right text-xs tabular-nums">{money(c.earningsRaised)}</td>
                        <td className="px-4 py-3 text-right text-xs tabular-nums">{money(c.earningsPaid)}</td>
                        <td className="px-4 py-3">
                          {under ? (
                            <Badge tone="warn">{money(c.contracted - c.invoiced)} not invoiced</Badge>
                          ) : over ? (
                            <Badge tone="danger">invoiced over contract</Badge>
                          ) : (
                            <Badge tone="accent">matches</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </section>
      )}

      <section>
        <SectionHeading title="Sponsor invoices" hint="§18 — from Zoho Books, inbound only; SponsorX never writes an invoice." />
        <Card className={campaigns ? "p-0" : "p-4"}>
          {!campaigns ? (
            noInvoices
          ) : invoices.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted">No invoices synced from Zoho yet.</p>
          ) : (
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Finance — scrollable table">
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
                  {invoices.map((i) => (
                    <tr key={i.zohoInvoiceId}>
                      <td className="px-4 py-3 text-xs font-medium">{i.sponsor}</td>
                      <td className="px-4 py-3 text-xs text-muted">{i.campaign}</td>
                      <td className="px-4 py-3">
                        <code className="font-mono text-[11px] text-faint">{i.number ?? i.zohoInvoiceId}</code>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={LIVE_INVOICE_TONE[i.status.toLowerCase()] ?? "neutral"}>{i.status.toLowerCase()}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-semibold tabular-nums">{money(i.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>

      <section>
        <SectionHeading title="Athlete earnings" hint="§21 — status only, no tax ID or bank details (§26)" />
        <Card className="p-0">
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Finance — scrollable table">
            <table className="w-full min-w-[44rem] text-left">
              <thead>
                <tr className="border-b border-line text-[10px] uppercase tracking-wider text-faint">
                  <th className="px-4 py-2.5 font-medium">Athlete</th>
                  <th className="px-4 py-2.5 font-medium">Campaign</th>
                  <th className="px-4 py-2.5 font-medium">Reference</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">Athlete</th>
                  <th className="px-4 py-2.5 text-right font-medium">Sponsor price</th>
                  <th className="px-4 py-2.5 text-right font-medium">Commission</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {earnings.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-3 text-xs font-medium">{e.athlete.displayName}</td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {e.order.campaignName}
                      <span className="text-faint"> · {e.order.jobId}</span>
                    </td>
                    <td className="px-4 py-3">
                      {e.reference ? <code className="font-mono text-[11px] text-faint">{e.reference}</code> : <span className="text-[11px] text-faint">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={EARNING_TONE[e.state]}>{EARNING_COPY[e.state]}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-semibold tabular-nums">{typeof e.amount === "number" ? money(e.amount) : "—"}</td>
                    <td className="px-4 py-3 text-right text-xs tabular-nums text-muted">{typeof e.sellPrice === "number" ? money(e.sellPrice) : "—"}</td>
                    <td className="px-4 py-3 text-right text-xs tabular-nums text-muted">{typeof e.commission === "number" ? money(e.commission) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <p className="mt-2 text-[10px] leading-relaxed text-faint">
          Commission is BTG&rsquo;s cut: the sponsor price minus the athlete&rsquo;s net earning. The athlete never sees
          the sponsor price (§7.1).
        </p>
      </section>
    </div>
  );
}

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

  const live = demo === null ? await liveBooks() : null;
  if (live) return <LiveFinance earnings={live.earnings} campaigns={live.campaigns} />;

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

      {/* P7-QA-02: this fixture branch also reaches signed-in staff outside
          FINANCE_ROLES (SALES, CAMPAIGN_MGR, NETWORK_MGR) — its ZOHO BOOKS /
          verified chips must not read as the real books. */}
      {demo === null && (
        <BlockedNotice>
          Demo data — the real books are read by BTG admin and Finance only, so
          every figure below is sample data.
        </BlockedNotice>
      )}

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
            collected / invoiced · quarter to date{" "}
            <MiniChip kind="ver">ZOHO BOOKS</MiniChip>
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
                tone:
                  row.label === "31–60 days" || row.label === "> 60 days"
                    ? "warn"
                    : "primary",
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
        <StatTile label="Invoiced" value={money(adminOps.invoicedCents)} sub="quarter to date · Zoho Books" source="VERIFIED_MANUAL" />
        <StatTile label="Collected" value={money(adminOps.collectedCents)} sub="quarter to date · Zoho Books" source="VERIFIED_MANUAL" />
        <StatTile label="Owed to athletes" value={money(owedToAthletes)} sub="not yet paid" />
        <StatTile label="Needs attention" value={String(attention)} sub="held / disputed" />
      </div>

      {/* ------------------------------------------------ sponsor invoices */}
      <section>
        <SectionHeading
          title="Sponsor invoices"
          hint={`Latest invoices — most recent ${sponsorInvoices.length} shown, not the quarter total. §18 — from Zoho Books, inbound only; SponsorX never writes an invoice.`}
        />
        <Card className="p-0">
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Finance — scrollable table">
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
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Finance — scrollable table">
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
            Balance sitting in each state — not a conversion funnel.
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
