import type { ReactNode } from "react";
import Link from "next/link";

import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { PayoutDecision, PayoutRetry } from "@/components/payout-decision";
import { PayoutTracker } from "@/components/payout-history";
import { Primary, StageTable, Td, Tr, type Column } from "@/components/stage-table";
import { VaultChip, VaultDate, VaultHead, VaultPanel, VaultSection, VaultTile, VaultTiles, VaultUpdated, at, type VaultTone } from "@/components/vault-stage";
import {
  approvalBadge, attemptsWords, auditTrail, payeeKind, payeeShare, payoutStatus, payoutTracker, retryStatus, returnedLine, usd, type ApiPayoutDetail,
} from "@/lib/payouts-live";
import type { ApiLineFinancials } from "@/lib/marketplace-ops-live";
import { apiFetch } from "@/server/api";
import { decidePayoutAction, retryPayoutAction } from "../actions";

/* --------------------------------------------------------------------------
   One payout — 2S5-FE-04 (Claude Design Approvals.dc.html): the payee and
   their payout-account status, each order and the payee's part of its
   frozen split, the five payout rules checked now (2S5-BE-04 adds "No
   dispute open on its orders"), the audit trail, and the decision.
   2S5-FE-10 — under the state, how many times it was handed to the
   provider; a payout the payee's bank returned says so, dated, and the
   return is in the trail.

   P1-ART-25 (2026-10-12) — the Vault: a tile strip (amount, payee, state,
   requested, decided) replaces the old summary card; the orders become one
   bounded StageTable instead of a card per order; the checklist and audit
   trail move into gold-framed panels. Every read, write and test hook is
   unchanged — the "Payout to …" line stays (e2e payee-money.spec.ts), as
   does the returned line's `text-danger` class.

   Reads  GET /payouts/:id                         payout, account, orders, checks
          GET /marketplace-orders/:id/financials   the split frozen at approval
   Writes POST /payouts/:id/decision  APPROVE (to the payment provider) or
                                      REJECT with the note the payee reads
          POST /payouts/:id/retry     a payout the provider couldn't send
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/payouts";

/** payouts-live.ts's plain tones, mapped to the Vault's five chip colours. */
function chipTone(tone: "neutral" | "primary" | "accent" | "danger" | "warn"): VaultTone {
  if (tone === "accent") return "good";
  if (tone === "primary") return "info";
  if (tone === "warn" || tone === "danger") return "late";
  return "done";
}
/** A payout still waiting on BTG's decision reads as "you" (gold). */
const rowTone = (state: string, tone: "neutral" | "primary" | "accent" | "danger" | "warn"): VaultTone =>
  state === "REQUESTED" ? "you" : chipTone(tone);

/** A short state word for the tile's chip — payoutStatus's own sentence
 *  ("Returned by your bank: fix your payout account") is the long form
 *  shown as plain, wrapping text underneath; VaultChip itself never wraps. */
const STATE_WORD: Record<string, string> = {
  REQUESTED: "Waiting on BTG",
  APPROVED: "Approved",
  SENDING: "Sending",
  PAID: "Paid",
  REJECTED: "Sent back",
  FAILED: "Failed",
};

/** A non-numeric tile — the same double-rule frame as VaultTile, for text
 *  (the payee's name, a chip, a date) rather than a counted figure. Kept
 *  local rather than added to the kit (vault-stage.tsx is not ours to edit). */
function InfoTile({ label, children, delay = 0.1 }: { label: string; children: ReactNode; delay?: number }) {
  return (
    <div data-spot="" className="sx-vault-frame sx-vault-in px-4 pb-3.5 pt-3.5" style={at(delay)}>
      <dt className="text-[10.5px] uppercase tracking-[0.16em] text-[color:var(--vault-muted)]">{label}</dt>
      <dd className="mt-1.5 text-[15px] leading-tight text-[color:var(--vault-ink)]">{children}</dd>
    </div>
  );
}

const ORDER_COLUMNS: readonly Column[] = [
  { key: "order", label: "Order" },
  { key: "split", label: "Split" },
  { key: "payout", label: "This payout", num: true },
];

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
  /* 2S5-FE-10 — hand-overs to the provider, and a return by the payee's bank. */
  const attempts = attemptsWords(p);
  const returned = returnedLine(p);
  /* An athlete by first name; a team or school by its whole name. */
  const first = p.payeeType === "ATHLETE" ? (p.payeeName.split(/\s+/)[0] ?? p.payeeName) : p.payeeName;
  const passed = p.checks.filter((c) => c.ok).length;
  const hasMeta = Boolean(attempts || returned || reasons.length > 0 || steps);

  return (
    <div className="space-y-6">
      <Link href={`${PATH}?tab=${p.state === "REQUESTED" ? "waiting" : p.state === "PAID" ? "paid" : p.state === "FAILED" ? `problems${p.waitingOn && p.waitingOn !== "BTG" ? "&show=all" : ""}` : "sending"}`} className="text-xs text-muted hover:text-text">
        ← Payout approvals
      </Link>

      <VaultHead title="Payout review" pill={<VaultUpdated iso={new Date().toISOString()} />}>
        <VaultTiles cols={5}>
          <VaultTile label="Amount" value={p.amountCents} format="usd0" caption={`Payout to ${p.payeeName}`} delay={0.08} />
          <InfoTile label="Payee" delay={0.12}>
            {p.payeeName}
            <span className="mt-0.5 block text-[11px] text-[color:var(--vault-muted)]">{payeeKind(p.payeeType)}</span>
          </InfoTile>
          <InfoTile label="State" delay={0.16}>
            <span className="flex flex-wrap gap-1">
              <VaultChip tone={rowTone(p.state, status.tone)}>{STATE_WORD[p.state] ?? p.state}</VaultChip>
              {auto && <VaultChip tone="good">✓ {auto}</VaultChip>}
            </span>
            <span className="mt-1.5 block text-[11px] font-normal normal-case leading-snug tracking-normal text-[color:var(--vault-muted)]">
              {p.state === "REQUESTED" ? "Waiting for BTG's decision" : p.state === "APPROVED" ? "Approved — sending soon" : status.label}
            </span>
          </InfoTile>
          <InfoTile label="Requested" delay={0.2}>
            <VaultDate iso={p.requestedAt} format="date" />
          </InfoTile>
          <InfoTile label="Decided" delay={0.24}>
            {p.decidedAt ? <VaultDate iso={p.decidedAt} format="date" /> : <span className="text-[color:var(--vault-faint)]">Not yet</span>}
          </InfoTile>
        </VaultTiles>
      </VaultHead>

      <VaultPanel delay={0.28}>
        <p className="text-[11px] text-[color:var(--vault-muted)]">
          Payout account{" "}
          <VaultChip tone={p.account.status === "READY" ? "good" : "late"}>
            {p.account.status === "READY" ? "✓ Ready · managed by Stripe" : p.account.status === "NEEDS_INFO" ? "● Stripe needs more information" : "● Not set up"}
          </VaultChip>
        </p>
      </VaultPanel>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <section>
            <VaultSection title="Orders" hint="Each order's split, frozen when the sale was approved." />
            <StageTable label={`Orders in this payout, ${p.payeeName}`} columns={ORDER_COLUMNS}>
              {p.orders.map((o, i) => {
                const line = p.lines.find((l) => l.orderId === o.orderId);
                return (
                  <Tr key={o.orderId} i={i}>
                    <Td><Primary sub={o.title}>{o.orderRef}</Primary></Td>
                    <Td label="Split">
                      <span className="block space-y-1.5">
                        {splits[i]!.map((f) => {
                          const s = payeeShare(f, p.payeeType);
                          return (
                            <span key={f.lineId} className="block text-[11.5px] leading-relaxed text-[color:var(--vault-muted)]">
                              Sale {usd(s.saleCents)} → {first} {usd(s.shareCents)} ={" "}
                              <span className="tabular-nums text-[color:var(--vault-ink)]">{usd(s.availableCents)}</span> available
                              {s.reserveCents > 0 && <> + <span className="tabular-nums text-[color:var(--vault-ink)]">{usd(s.reserveCents)}</span> reserve · released when the order closes</>}
                            </span>
                          );
                        })}
                      </span>
                    </Td>
                    <Td label="This payout" num className="font-semibold">{line ? usd(line.amountCents) : "—"}</Td>
                  </Tr>
                );
              })}
            </StageTable>
          </section>

          <section>
            <VaultSection title={`Checks · ${passed} of ${p.checks.length} passed`} />
            <VaultPanel flush delay={0.32}>
              <ul className="divide-y divide-[color:var(--vault-line-soft)]">
                {p.checks.map((c) => (
                  <li key={c.key} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
                    <span>{c.label}</span>
                    <VaultChip tone={c.ok ? "good" : "late"}>{c.ok ? "✓ Passed" : "✕ Not met"}</VaultChip>
                  </li>
                ))}
              </ul>
            </VaultPanel>
          </section>

          <section>
            <VaultSection title="Audit trail" />
            <VaultPanel flush delay={0.36}>
              <ul className="divide-y divide-[color:var(--vault-line-soft)]">
                {auditTrail(p).map((a, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
                    <span>{a.what}</span>
                    <span className="text-[color:var(--vault-muted)] tabular-nums">{a.when}</span>
                  </li>
                ))}
              </ul>
            </VaultPanel>
          </section>
        </div>

        <aside className="space-y-4">
          {hasMeta && (
            <VaultPanel delay={0.3}>
              {attempts && <p className="text-[11px] text-muted">{attempts}</p>}
              {returned && <p className="mt-2 text-[11px] font-medium text-danger">{returned}</p>}
              {reasons.length > 0 && (
                <div className="mt-3 rounded-lg border border-warn/40 bg-warn/5 px-3 py-2">
                  <p className="text-[11px] font-medium text-warn">Not approved automatically because</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px]">
                    {reasons.map((r) => <li key={r}>{r}</li>)}
                  </ul>
                </div>
              )}
              {steps && <PayoutTracker steps={steps} vertical />}
            </VaultPanel>
          )}

          <VaultPanel tone={p.state === "REQUESTED" ? "you" : undefined} delay={0.36}>
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
          </VaultPanel>
        </aside>
      </div>
    </div>
  );
}
