import Link from "next/link";

import { ResolveDispute, TakeForReview } from "@/components/dispute-actions";
import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { StageTable, Td, Tr, type Column } from "@/components/stage-table";
import { EmptyState } from "@/components/states";
import { Badge, Card, SectionHeading } from "@/components/ui";
import { amountWords, disputeFacts, mayResolve, mayReview, stateLabel, stateTone, tabFor, type ApiDispute } from "@/lib/disputes-live";
import { money } from "@/lib/order-automation-live";
import { apiFetch, fetchActor } from "@/server/api";

/* --------------------------------------------------------------------------
   One dispute — 2S5-FE-08. The header (order, sponsor, amount, state, the
   provider's reference), the facts, the order's lines and the payouts it
   freezes, and the two actions as dialogs: Take for review (OPEN; BTG
   admin or Finance) and Resolve (UNDER_REVIEW once the provider has
   decided; BTG admin only — Finance reads one line instead).

   Reads  GET  /disputes/:id
   Writes POST /disputes/:id/review, /resolve   (dispute-actions.tsx → ../../actions.ts)
   The dispute emails link here. 404 from the API → an honest empty state.
   -------------------------------------------------------------------------- */

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
        <Link href={LIST} className="text-xs text-muted hover:text-text">← Disputes</Link>
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
      <Link href={back} className="text-xs text-muted hover:text-text">← Disputes</Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="sx-page-title">{d.orderRef} · {amountWords(d)}</h1>
          <p className="mt-1 text-xs text-muted">
            {d.sponsorName} · {d.provider} dispute <span className="font-mono">{d.providerDisputeRef}</span>
          </p>
          <p className="mt-2"><Badge tone={stateTone(d.state)}>{stateLabel(d.state)}</Badge>{d.frozen && <span className="ml-2 text-[11px] text-warn">Money frozen</span>}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {d.state === "OPEN" && reviewer && <TakeForReview dispute={d} />}
          {d.state === "UNDER_REVIEW" && resolver && <ResolveDispute dispute={d} />}
          {(d.state === "OPEN" || d.state === "UNDER_REVIEW") && !resolver && <p className="text-xs text-muted">BTG admin resolves these.</p>}
          {d.state === "UNDER_REVIEW" && resolver && !d.canResolve && <p className="text-xs text-muted">Waiting on the provider’s decision.</p>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <section>
            <SectionHeading title="The order’s lines" hint={d.lineIds.length ? "Marked: the lines the dispute was lost on." : undefined} />
            {d.lines.length === 0 ? (
              <Card><p className="text-xs text-muted">No lines on this order.</p></Card>
            ) : (
              <StageTable label="Order lines" columns={lineColumns}>
                {d.lines.map((l, i) => (
                  <Tr key={l.id} i={i} tone={d.lineIds.includes(l.id) ? "danger" : undefined}>
                    <Td>{l.title}{d.lineIds.includes(l.id) && <span className="ml-2 text-[11px] text-danger">lost</span>}</Td>
                    <Td label="Total" num className="tabular-nums">{money(l.lineTotalCents)}</Td>
                  </Tr>
                ))}
              </StageTable>
            )}
          </section>

          <section>
            <SectionHeading title="Payouts it freezes" hint="Payouts covering this order: held while the dispute is open, sent back if it is lost." />
            {d.payouts.length === 0 ? (
              <Card><p className="text-xs text-muted">No payout covers this order yet.</p></Card>
            ) : (
              <StageTable label="Payouts" columns={payoutColumns}>
                {d.payouts.map((p, i) => (
                  <Tr key={p.id} i={i}>
                    <Td><Link href={`/admin/payouts/${encodeURIComponent(p.id)}`} className="font-mono text-[12px] text-accent hover:text-accent-soft">{p.id}</Link></Td>
                    <Td label="State"><Badge tone={p.state === "PAID" ? "accent" : p.state === "FAILED" ? "danger" : "neutral"}>{p.state.replace(/_/g, " ").toLowerCase()}</Badge></Td>
                    <Td label="Payee" muted>{p.payeeType.toLowerCase()} · <span className="font-mono text-[11px]">{p.payeeId}</span></Td>
                    <Td label="Amount" num className="tabular-nums">{money(p.amountCents)}</Td>
                  </Tr>
                ))}
              </StageTable>
            )}
          </section>
        </div>

        <aside>
          <Card>
            <SectionHeading title="Facts" />
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs">
              {facts.map((f) => (
                <div key={f.label} className="contents">
                  <dt className="text-muted">{f.label}</dt>
                  <dd className="min-w-0 break-words">{f.value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </aside>
      </div>
    </div>
  );
}
