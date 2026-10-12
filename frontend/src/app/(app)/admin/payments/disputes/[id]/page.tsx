import Link from "next/link";
import type { ReactNode } from "react";

import { ResolveDispute, TakeForReview } from "@/components/dispute-actions";
import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { StageTable, Td, Tr, type Column } from "@/components/stage-table";
import { EmptyState } from "@/components/states";
import {
  VaultChip, VaultDate, VaultHead, VaultPanel, VaultSection, VaultUpdated, at, type VaultTone,
} from "@/components/vault-stage";
import { amountWords, disputeFacts, mayResolve, mayReview, stateLabel, stateTone, tabFor, type ApiDispute } from "@/lib/disputes-live";
import { money } from "@/lib/order-automation-live";
import { apiFetch, fetchActor } from "@/server/api";

/** stateTone's order-automation Tone, read as a VaultTone — same mapping as
 *  the list page (./page.tsx), kept local: open (warn) is waiting on BTG,
 *  won (accent) and lost (danger) read good / late, under review (primary)
 *  is a quiet info word. ("neutral" is unused by stateTone, kept only so
 *  the Record is total.) */
const DISPUTE_CHIP: Record<ReturnType<typeof stateTone>, VaultTone> = { warn: "you", accent: "good", danger: "late", primary: "info", neutral: "info" };

/* --------------------------------------------------------------------------
   One dispute — 2S5-FE-08. The summary strip (order, sponsor, amount,
   state, the provider's reference), the facts, the order's lines and the
   payouts it freezes, and the two actions as dialogs: Take for review
   (OPEN; BTG admin or Finance) and Resolve (UNDER_REVIEW once the provider
   has decided; BTG admin only — Finance reads one line instead). On the
   Vault (P1-ART-25): a double-rule fact strip in place of the plain header.

   Reads  GET  /disputes/:id
   Writes POST /disputes/:id/review, /resolve   (dispute-actions.tsx → ../../actions.ts)
   The dispute emails link here. 404 from the API → an honest empty state.
   -------------------------------------------------------------------------- */

/** One fact in the summary strip: a double-rule frame with a label and a
 *  value — `big` gives the value the engraved serif (the amount only; the
 *  rest are plain words, a chip, or a date). */
function Fact({ label, value, big = false, delay = 0 }: { label: string; value: ReactNode; big?: boolean; delay?: number }) {
  return (
    <div className="sx-vault-frame sx-vault-in px-4 pb-3.5 pt-3.5" style={at(delay)}>
      <dt className="text-[10.5px] uppercase tracking-[0.16em] text-[color:var(--vault-muted)]">{label}</dt>
      <dd className={`mt-1.5 block leading-tight ${big ? "sx-vault-num text-[20px]" : "text-[15px] font-medium text-[color:var(--vault-ink)]"}`}>{value}</dd>
    </div>
  );
}

export const dynamic = "force-dynamic";
const LIST = "/admin/payments/disputes";
const TITLE = "Dispute";

export default async function DisputePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lacking = await staffWithoutAccess(LIST);
  if (lacking) return <NotInRole path={LIST} title={TITLE} roles={lacking} />;
  const [res, who] = await Promise.all([apiFetch(`/disputes/${encodeURIComponent(id)}`), fetchActor()]);
  if (res.status === 403) return <NotInRole path={LIST} title={TITLE} roles={["BTG_ADMIN", "FINANCE"]} />;
  if (res.status === 404) {
    return (
      <div className="space-y-5">
        <Link href={LIST} className="text-xs text-[color:var(--vault-muted)] hover:text-[color:var(--vault-gold-hi)]">← Disputes</Link>
        <h1 className="sx-page-title">{TITLE}</h1>
        <EmptyState mark="inbox" title="No dispute matches this link" hint="It may be in another tenant’s books, or the link is old." action={{ label: "Back to Disputes", href: LIST }} />
      </div>
    );
  }
  if (!res.ok) throw new Error(`Dispute unavailable (${res.status}).`);
  const d = (await res.json()) as ApiDispute;
  const roles = who.status === "linked" ? who.actor.roles : [];
  const reviewer = mayReview(roles);
  const resolver = mayResolve(roles);
  const facts = disputeFacts(d);
  const back = `${LIST}?tab=${tabFor(d.state).key}`;
  const readAt = new Date().toISOString();
  const awaiting = d.state === "OPEN" || d.state === "UNDER_REVIEW";
  /* A payout's own state word (not disputes-live's stateTone) read as a VaultTone. */
  const payoutChip = (state: string): VaultTone => (state === "PAID" ? "good" : state === "FAILED" ? "late" : "info");

  const lineColumns: Column[] = [
    { key: "line", label: "Line" },
    { key: "total", label: "Total", num: true },
  ];
  const payoutColumns: Column[] = [
    { key: "payout", label: "Payout" },
    { key: "state", label: "State" },
    { key: "payee", label: "Payee" },
    { key: "amount", label: "Amount", num: true },
  ];

  return (
    <div className="space-y-6">
      <Link href={back} className="text-xs text-[color:var(--vault-muted)] hover:text-[color:var(--vault-gold-hi)]">← Disputes</Link>

      <VaultHead title={TITLE} pill={<>Live · <VaultUpdated iso={readAt} /></>}>
        <p className="sx-vault-in mt-2 text-xs text-[color:var(--vault-muted)]" style={at(0.04)}>
          {d.sponsorName} · {d.provider} dispute <span className="font-mono">{d.providerDisputeRef}</span>
          {d.frozen && <span className="ml-2 text-[color:var(--vault-late)]">Money frozen</span>}
        </p>
        <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Fact label="Amount" value={amountWords(d)} big delay={0.08} />
          <Fact label="Order" value={d.orderRef} delay={0.12} />
          <Fact label="Opened" value={<VaultDate iso={d.openedAt} format="date" />} delay={0.16} />
          <Fact label="State" value={<VaultChip tone={DISPUTE_CHIP[stateTone(d.state)]}>{stateLabel(d.state)}</VaultChip>} delay={0.2} />
        </dl>
      </VaultHead>

      {awaiting && (
        <VaultPanel tone={reviewer || resolver ? "you" : undefined} delay={0.24} className="flex flex-wrap items-center gap-2.5">
          {d.state === "OPEN" && reviewer && <TakeForReview dispute={d} />}
          {d.state === "UNDER_REVIEW" && resolver && <ResolveDispute dispute={d} />}
          {awaiting && !resolver && <p className="text-xs text-[color:var(--vault-muted)]">BTG admin resolves these.</p>}
          {d.state === "UNDER_REVIEW" && resolver && !d.canResolve && <p className="text-xs text-[color:var(--vault-muted)]">Waiting on the provider’s decision.</p>}
        </VaultPanel>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <VaultPanel delay={0.28}>
            <VaultSection title="The order’s lines" hint={d.lineIds.length ? "Marked: the lines the dispute was lost on." : undefined} />
            {d.lines.length === 0 ? (
              <p className="text-xs text-[color:var(--vault-muted)]">No lines on this order.</p>
            ) : (
              <StageTable label="Order lines" columns={lineColumns}>
                {d.lines.map((l, i) => (
                  <Tr key={l.id} i={i} tone={d.lineIds.includes(l.id) ? "danger" : undefined}>
                    <Td>{l.title}{d.lineIds.includes(l.id) && <span className="ml-2 text-[11px] text-[color:var(--vault-late)]">lost</span>}</Td>
                    <Td label="Total" num className="tabular-nums">{money(l.lineTotalCents)}</Td>
                  </Tr>
                ))}
              </StageTable>
            )}
          </VaultPanel>

          <VaultPanel delay={0.32}>
            <VaultSection title="Payouts it freezes" hint="Payouts covering this order: held while the dispute is open, sent back if it is lost." />
            {d.payouts.length === 0 ? (
              <p className="text-xs text-[color:var(--vault-muted)]">No payout covers this order yet.</p>
            ) : (
              <StageTable label="Payouts" columns={payoutColumns}>
                {d.payouts.map((p, i) => (
                  <Tr key={p.id} i={i}>
                    <Td><Link href={`/admin/payouts/${encodeURIComponent(p.id)}`} className="font-mono text-[12px] text-[color:var(--vault-gold-hi)] hover:underline">{p.id}</Link></Td>
                    <Td label="State"><VaultChip tone={payoutChip(p.state)}>{p.state.replace(/_/g, " ").toLowerCase()}</VaultChip></Td>
                    <Td label="Payee" muted>{p.payeeType.toLowerCase()} · <span className="font-mono text-[11px]">{p.payeeId}</span></Td>
                    <Td label="Amount" num className="tabular-nums">{money(p.amountCents)}</Td>
                  </Tr>
                ))}
              </StageTable>
            )}
          </VaultPanel>
        </div>

        <aside>
          <VaultPanel delay={0.36}>
            <VaultSection title="Facts" />
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs">
              {facts.map((f) => (
                <div key={f.label} className="contents">
                  <dt className="text-[color:var(--vault-muted)]">{f.label}</dt>
                  <dd className="min-w-0 break-words text-[color:var(--vault-ink)]">{f.value}</dd>
                </div>
              ))}
            </dl>
          </VaultPanel>
        </aside>
      </div>
    </div>
  );
}
