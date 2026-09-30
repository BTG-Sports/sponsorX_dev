import Link from "next/link";

import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { Badge, Card } from "@/components/ui";
import { EmptyState } from "@/components/states";
import { PayoutRetry } from "@/components/payout-decision";
import {
  APPROVAL_TABS, approvalTab, checkSummary, payeeKind, payoutStatus, stamp, tabCount, usd, waitedFor,
  type ApiPayoutDetail, type ApiPayoutList,
} from "@/lib/payouts-live";
import { apiFetch } from "@/server/api";
import { retryPayoutAction } from "./actions";

/* --------------------------------------------------------------------------
   Payout approvals — 2S5-FE-04 (Claude Design Approvals.dc.html). BTG admin
   and Finance: money only moves after someone at BTG approves it.

   Reads  GET /payouts?state=…     the tab's payouts and every state's count
          GET /payouts/:id         (waiting tab) each request's rule checks
   Writes POST /payouts/:id/retry  (Problems tab) back to the provider
   Approve / Send back happen on the payout's own page (./[id]).
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/payouts";

export default async function PayoutApprovalsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title="Payout approvals" roles={lacking} />;
  const tab = approvalTab((await searchParams).tab);
  const spec = APPROVAL_TABS.find((t) => t.key === tab)!;
  const res = await apiFetch(`/payouts?state=${spec.states.join(",")}`);
  if (res.status === 403) return <NotInRole path={PATH} title="Payout approvals" roles={["BTG_ADMIN", "FINANCE"]} />;
  if (!res.ok) throw new Error(`Payouts unavailable (${res.status}).`);
  const list = (await res.json()) as ApiPayoutList;
  /* The waiting tab shows each request's checks — one read per row, on a short queue. */
  const details = tab === "waiting"
    ? await Promise.all(list.payouts.map(async (p) => {
        const r = await apiFetch(`/payouts/${encodeURIComponent(p.id)}`);
        return r.ok ? ((await r.json()) as ApiPayoutDetail) : null;
      }))
    : [];
  const now = new Date();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Payout approvals</h1>
        <p className="mt-1 text-xs text-muted">Money only moves after someone at BTG approves it. Every decision is recorded with its reviewer.</p>
      </div>

      <nav aria-label="Payout states" className="flex flex-wrap gap-2">
        {APPROVAL_TABS.map((t) => {
          const n = tabCount(t.key, list.counts);
          const on = t.key === tab;
          return (
            <Link key={t.key} href={`${PATH}?tab=${t.key}`} aria-current={on ? "page" : undefined}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${on ? "border-primary/60 text-primary" : "border-line text-muted hover:text-text"}`}>
              {t.label}
              <span className={`rounded-full px-1.5 text-[10px] tabular-nums ${t.key === "problems" && n ? "bg-danger/15 text-danger" : "bg-surface-2"}`}>{n}</span>
            </Link>
          );
        })}
      </nav>

      {list.payouts.length === 0 ? (
        <EmptyState mark="inbox" title={tab === "waiting" ? "Nothing waiting for approval" : tab === "problems" ? "No problems" : "Nothing here"} hint={tab === "waiting" ? "Payout requests from athletes and teams arrive here." : ""} />
      ) : (
        <Card className="p-0">
          <div className="hidden grid-cols-[1.4fr_7rem_1fr_8rem_1.4fr_7rem] gap-x-3 border-b border-line-soft px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-faint md:grid">
            <span>Payee</span>
            <span className="text-right">Amount</span>
            <span>Orders</span>
            <span>{tab === "waiting" ? "Waiting" : tab === "paid" ? "Paid" : "Updated"}</span>
            <span>{tab === "waiting" ? "Checks" : "Status"}</span>
            <span className="text-right">Action</span>
          </div>
          <ul className="divide-y divide-line-soft">
            {list.payouts.map((p, i) => {
              const d = details[i];
              const check = d ? checkSummary(d.checks) : null;
              const status = payoutStatus(p);
              return (
                <li key={p.id} className="grid gap-x-3 gap-y-1 px-4 py-3 text-xs md:grid-cols-[1.4fr_7rem_1fr_8rem_1.4fr_7rem] md:items-center">
                  <span className="min-w-0">
                    <span className="block font-medium">{p.payeeName}</span>
                    <span className="block text-[11px] text-muted">{payeeKind(p.payeeType)}</span>
                  </span>
                  <span className="font-semibold tabular-nums md:text-right">{usd(p.amountCents)}</span>
                  <span className="tabular-nums text-muted">{p.lines.map((l) => l.orderRef).join(", ")}</span>
                  <span className="text-muted">
                    {tab === "waiting" ? waitedFor(p.requestedAt, now) : tab === "paid" ? stamp(p.paidAt) : stamp(p.sentAt ?? p.decidedAt ?? p.requestedAt)}
                  </span>
                  <span>
                    {tab === "waiting" && check ? (
                      <Badge tone={check.ok ? "accent" : "warn"}>{check.ok ? "✓ " : "● "}{check.label}</Badge>
                    ) : (
                      <span className="block">
                        <Badge tone={status.tone}>{status.label}</Badge>
                        {p.state === "FAILED" && p.failureReason && <span className="mt-1 block text-[11px] text-danger">Couldn&rsquo;t send: {p.failureReason}</span>}
                      </span>
                    )}
                  </span>
                  <span className="md:text-right">
                    {p.state === "FAILED" ? (
                      <PayoutRetry retry={retryPayoutAction.bind(null, p.id)} />
                    ) : (
                      <Link href={`${PATH}/${p.id}`} className="font-medium text-primary hover:underline">{p.state === "REQUESTED" ? "Review →" : "Open →"}</Link>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {tab === "problems" && list.payouts.length > 0 && (
        <p className="text-[11px] text-muted">Retry hands the payout to the payment provider again. Ask the payee to update their payout account on Stripe first when that&rsquo;s the problem.</p>
      )}
    </div>
  );
}
