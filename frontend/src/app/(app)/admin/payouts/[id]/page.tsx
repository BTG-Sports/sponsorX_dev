import Link from "next/link";

import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { Badge, Card, SectionHeading } from "@/components/ui";
import { PayoutDecision, PayoutRetry } from "@/components/payout-decision";
import { PayoutTracker } from "@/components/payout-history";
import {
  approvalBadge, auditTrail, payeeKind, payeeShare, payoutStatus, payoutTracker, retryStatus, usd, type ApiPayoutDetail,
} from "@/lib/payouts-live";
import type { ApiLineFinancials } from "@/lib/marketplace-ops-live";
import { apiFetch } from "@/server/api";
import { decidePayoutAction, retryPayoutAction } from "../actions";

/* --------------------------------------------------------------------------
   One payout — 2S5-FE-04 (Claude Design Approvals.dc.html): the payee and
   their payout-account status, each order and the payee's part of its
   frozen split, the four payout rules checked now, the audit trail, and
   the decision.

   Reads  GET /payouts/:id                         payout, account, orders, checks
          GET /marketplace-orders/:id/financials   the split frozen at approval
   Writes POST /payouts/:id/decision  APPROVE (to the payment provider) or
                                      REJECT with the note the payee reads
          POST /payouts/:id/retry     a payout the provider couldn't send
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/payouts";

export default async function PayoutDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title="Payout approvals" roles={lacking} />;
  const { id } = await params;
  const res = await apiFetch(`/payouts/${encodeURIComponent(id)}`);
  if (res.status === 403) {
    return (
      <div className="space-y-4">
        <Link href={PATH} className="text-xs text-muted hover:text-text">← Payout approvals</Link>
        <p className="text-sm">No payout matches this link.</p>
      </div>
    );
  }
  if (!res.ok) throw new Error(`Payout unavailable (${res.status}).`);
  const p = (await res.json()) as ApiPayoutDetail;
  const splits = await Promise.all(p.orders.map(async (o) => {
    const r = await apiFetch(`/marketplace-orders/${encodeURIComponent(o.orderId)}/financials`);
    return r.ok ? (((await r.json()) as { lines: ApiLineFinancials[] }).lines) : [];
  }));
  const status = payoutStatus(p);
  const steps = payoutTracker(p);
  /* 2S5-FE-06 — the rule's approval, why a request waits, and a failed payout's retry status. */
  const auto = approvalBadge(p);
  const retry = retryStatus(p);
  const reasons = p.state === "REQUESTED" ? (p.reviewReasons ?? []) : [];
  /* An athlete by first name; a team or school by its whole name. */
  const first = p.payeeType === "ATHLETE" ? (p.payeeName.split(/\s+/)[0] ?? p.payeeName) : p.payeeName;
  const passed = p.checks.filter((c) => c.ok).length;

  return (
    <div className="space-y-6">
      <Link href={`${PATH}?tab=${p.state === "REQUESTED" ? "waiting" : p.state === "PAID" ? "paid" : p.state === "FAILED" ? `problems${p.waitingOn && p.waitingOn !== "BTG" ? "&show=all" : ""}` : "sending"}`} className="text-xs text-muted hover:text-text">
        ← Payout approvals
      </Link>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Card>
            <p className="text-sm font-semibold">{p.payeeName}</p>
            <p className="mt-0.5 text-xs text-muted">{payeeKind(p.payeeType)}</p>
            <p className="mt-3 text-xs">
              Payout account{" "}
              <Badge tone={p.account.status === "READY" ? "accent" : "warn"}>
                {p.account.status === "READY" ? "✓ Ready · managed by Stripe" : p.account.status === "NEEDS_INFO" ? "● Stripe needs more information" : "● Not set up"}
              </Badge>
            </p>
          </Card>

          <section>
            <SectionHeading title="Orders" hint="Each order's split, frozen when the sale was approved." />
            <div className="space-y-3">
              {p.orders.map((o, i) => {
                const line = p.lines.find((l) => l.orderId === o.orderId);
                return (
                  <Card key={o.orderId}>
                    <p className="text-xs font-medium tabular-nums">{o.orderRef}</p>
                    <p className="text-[11px] text-muted">{o.title}</p>
                    {splits[i]!.map((f) => {
                      const s = payeeShare(f, p.payeeType);
                      return (
                        <p key={f.lineId} className="mt-2 text-xs leading-relaxed">
                          Sale {usd(s.saleCents)} → {first} {usd(s.shareCents)} ={" "}
                          <span className="tabular-nums">{usd(s.availableCents)}</span> available
                          {s.reserveCents > 0 && <> + <span className="tabular-nums">{usd(s.reserveCents)}</span> reserve · released when the order closes</>}
                        </p>
                      );
                    })}
                    {line && <p className="mt-2 text-[11px] text-muted">This payout: <span className="font-medium text-text tabular-nums">{usd(line.amountCents)}</span></p>}
                  </Card>
                );
              })}
            </div>
          </section>

          <section>
            <SectionHeading title={`Checks · ${passed} of ${p.checks.length} passed`} />
            <Card className="p-0">
              <ul className="divide-y divide-line-soft">
                {p.checks.map((c) => (
                  <li key={c.key} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
                    <span>{c.label}</span>
                    <Badge tone={c.ok ? "accent" : "warn"}>{c.ok ? "✓ Passed" : "● Not met"}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          </section>

          <section>
            <SectionHeading title="Audit trail" />
            <Card className="p-0">
              <ul className="divide-y divide-line-soft">
                {auditTrail(p).map((a, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
                    <span>{a.what}</span>
                    <span className="text-muted tabular-nums">{a.when}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        </div>

        <aside>
          <Card>
            <p className="text-[11px] text-muted">Payout to {p.payeeName}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{usd(p.amountCents)}</p>
            <p className="mt-2 flex flex-wrap gap-1">
              {retry ? <Badge tone={retry.tone}>{retry.label}</Badge> : <Badge tone={status.tone}>{p.state === "REQUESTED" ? "Waiting for BTG's decision" : p.state === "APPROVED" ? "Approved — sending soon" : status.label}</Badge>}
              {auto && <Badge tone="accent">✓ {auto}</Badge>}
            </p>
            {reasons.length > 0 && (
              <div className="mt-3 rounded-lg border border-warn/40 bg-warn/5 px-3 py-2">
                <p className="text-[11px] font-medium text-warn">Not approved automatically because</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px]">
                  {reasons.map((r) => <li key={r}>{r}</li>)}
                </ul>
              </div>
            )}
            {steps && <PayoutTracker steps={steps} vertical />}
            <div className="mt-4 border-t border-line-soft pt-4">
              {p.state === "REQUESTED" && (
                <PayoutDecision payeeFirstName={first} amount={usd(p.amountCents)} decide={decidePayoutAction.bind(null, p.id)} />
              )}
              {(p.state === "APPROVED" || p.state === "SENDING") && (
                <p className="text-[11px] text-muted">
                  {p.provider === "none"
                    ? "Approved. It waits here until the payment provider is connected — nothing is sent before then."
                    : "The payment provider is sending it to the payee's payout account. Nothing more to do."}
                </p>
              )}
              {p.state === "PAID" && <p className="text-[11px] text-muted">{first} has been emailed.</p>}
              {p.state === "REJECTED" && <p className="text-[11px] text-muted">Sent back. The money is back in {first}&rsquo;s available balance.</p>}
              {p.state === "FAILED" && (
                <div className="space-y-2">
                  {p.failureReason && <p className="text-[11px] text-danger">Couldn&rsquo;t send: {p.failureReason}</p>}
                  <PayoutRetry retry={retryPayoutAction.bind(null, p.id)} />
                  <p className="text-[11px] text-muted">
                    Retry hands the payout to the payment provider again, now{retry && !retry.needsBtg ? " — you don't have to: it goes again on its own" : ""}. It resets the automatic retries.
                  </p>
                </div>
              )}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
