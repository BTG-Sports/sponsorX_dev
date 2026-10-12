import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { ResolveEvent } from "@/components/payment-events-desk";
import { PagedTable, Primary, TabLink, TabStrip, Td, Tr, type Column } from "@/components/stage-table";
import { EmptyState } from "@/components/states";
import { StadiumHint } from "@/components/stadium-hint";
import { VaultChip, VaultGhost, VaultHead, VaultTile, VaultTiles, VaultUpdated, type VaultTone } from "@/components/vault-stage";
import { demoState } from "@/lib/demo";
import { apiListQuery } from "@/lib/list-query";
import { agoLabel } from "@/lib/marketplace-ops-live";
import { dayOf } from "@/lib/order-automation-live";
import {
  EMPTY_EVENT_LIST, EVENT_TABS, canResolve, eventTab, mayResolveEvents, statusLabel, statusTone, tabCounts, typeLabel, type ApiPaymentEventList,
} from "@/lib/payment-events-live";
import { apiFetch, fetchActor } from "@/server/api";

/** statusTone's order-automation Tone, read as a VaultTone: held (warn) is
 *  waiting on BTG; failed (danger) and applied (accent) read late / good;
 *  everything else (received, ignored, deferred) is a quiet info word.
 *  ("primary" is unused by statusTone, kept only so the Record is total.) */
const EVENT_CHIP: Record<ReturnType<typeof statusTone>, VaultTone> = { warn: "you", danger: "late", accent: "good", neutral: "info", primary: "info" };

/* --------------------------------------------------------------------------
   Payment events — 2S5-FE-07. The provider's events as SponsorX applied
   them (2S5-INT-02): HELD and FAILED are for a person, DEFERRED waits for
   what it follows. A dashboard on the Vault (P1-ART-25): small title, five
   tiles from the API's counts, then the work.

   Reads  GET  /payment-events?status&resolved&page&size   { counts, waitingOnBtg, events, page? }
   Writes POST /payment-events/:id/resolve                 (ResolveEvent → ../actions.ts; BTG admin only)
   BTG admin and Finance (paymentEvent read); Finance sees the rows without
   the button. ?demo=loading|empty|error renders the branded states. The
   page tolerates an API without `page` (one page of what came back).
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/payments/events";
const TITLE = "Payment events";

export default async function PaymentEventsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <VaultGhost label="Loading payment events" tiles={5} cols={5} rows={1} />;
  if (demo === "error") throw new Error("Demo error state");

  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title={TITLE} roles={lacking} />;
  const sp = await searchParams;
  const tab = eventTab(sp.tab);
  const empty = demo === "empty";
  const [res, who] = await Promise.all([
    empty ? null : apiFetch(`/payment-events${apiListQuery(sp, tab.query)}`),
    fetchActor(),
  ]);
  if (res?.status === 403) return <NotInRole path={PATH} title={TITLE} roles={["BTG_ADMIN", "FINANCE"]} />;
  if (res && !res.ok) throw new Error(`Payment events unavailable (${res.status}).`);
  const list: ApiPaymentEventList = res ? ((await res.json()) as ApiPaymentEventList) : EMPTY_EVENT_LIST;
  const rows = list.events;
  const page = list.page ?? { page: 1, size: rows.length || 12, total: rows.length, pages: 1 };
  const counts = tabCounts(list);
  const resolver = who.status === "linked" && mayResolveEvents(who.actor.roles);
  const now = new Date().getTime();
  const resolvedTab = tab.key === "resolved";

  const columns: Column[] = [
    { key: "event", label: "Event" },
    { key: "order", label: "Order" },
    { key: "status", label: "Status" },
    { key: "why", label: "Why" },
    { key: "received", label: resolvedTab ? "Resolved" : "Received" },
    { key: "action", label: "Action", srOnly: true },
  ];

  const readAt = new Date().toISOString();
  const ignoredOrDeferred = (list.counts.IGNORED ?? 0) + (list.counts.DEFERRED ?? 0);

  return (
    <div className="space-y-5">
      <VaultHead title={TITLE} pill={<>Live · <VaultUpdated iso={readAt} /></>} actions={<StadiumHint skin="vault" label="About this desk" text="What the payment provider told SponsorX and what was done with it. Held and failed events wait for a BTG admin; deferred ones wait for the event they follow." />}>
        <VaultTiles cols={5}>
          <VaultTile label="Needs BTG" value={list.waitingOnBtg} format="int" tone={list.waitingOnBtg ? "you" : undefined} badge={list.waitingOnBtg} caption="held or failed, not yet dealt with" delay={0.08} />
          <VaultTile label="Applied" value={list.counts.APPLIED} format="int" caption="all time" delay={0.12} />
          <VaultTile label="Held" value={list.counts.HELD} format="int" caption="all time, incl. resolved" delay={0.16} />
          <VaultTile label="Failed" value={list.counts.FAILED} format="int" caption="all time, incl. resolved" delay={0.2} />
          <VaultTile label="Ignored or deferred" value={ignoredOrDeferred} format="int" caption="no action needed, or waiting its turn" delay={0.24} />
        </VaultTiles>
      </VaultHead>

      <TabStrip label="Payment events">
        {EVENT_TABS.map((t) => (
          <TabLink key={t.key} href={`${PATH}?tab=${t.key}`} on={t.key === tab.key} count={counts[t.key]} hot={t.key === "needs"}>
            {t.label}
          </TabLink>
        ))}
      </TabStrip>

      {!resolver && rows.length > 0 && <p className="text-xs text-[color:var(--vault-muted)]">BTG admin resolves these.</p>}

      {rows.length === 0 ? (
        <EmptyState mark="inbox" title={tab.key === "needs" ? "Nothing needs BTG" : tab.key === "deferred" ? "Nothing deferred" : tab.key === "resolved" ? "Nothing resolved yet" : "No events yet"}
          hint={tab.key === "needs" ? "Every provider event was applied, or has been dealt with." : tab.key === "deferred" ? "No event is waiting for one it follows." : tab.key === "resolved" ? "Events a BTG admin marks dealt with appear here." : "The provider has sent nothing to these books yet."} />
      ) : (
        <PagedTable page={page} noun="Events" tone="vault" label={`Payment events · ${tab.label}`} columns={columns}>
          {rows.map((e, i) => {
            const open = canResolve(e);
            return (
              <Tr key={e.id} i={i} tone={open ? (e.status === "FAILED" ? "danger" : "warn") : undefined}>
                <Td><Primary sub={`${e.provider} · ${e.providerEventId}`}>{typeLabel(e.type)}</Primary></Td>
                <Td label="Order">{e.subjectRef ?? <span className="text-[color:var(--vault-muted)]">—</span>}</Td>
                <Td label="Status">
                  <VaultChip tone={EVENT_CHIP[statusTone(e.status)]}>{statusLabel(e.status)}</VaultChip>
                  {e.status === "DEFERRED" && e.nextAttemptAt && <span className="mt-1 block text-[11px] text-[color:var(--vault-muted)]">next try {dayOf(e.nextAttemptAt)} · attempt {e.attempts}</span>}
                </Td>
                <Td label="Why" className="max-w-[28rem]">
                  <span className="block text-[12px] leading-relaxed">{e.outcome ?? <span className="text-[color:var(--vault-muted)]">—</span>}</span>
                  {e.resolvedAt && (
                    <span className="mt-1 block text-[11px] text-[color:var(--vault-gold-hi)]">
                      Dealt with {dayOf(e.resolvedAt)}{e.resolvedBy ? ` by ${e.resolvedBy}` : ""}{e.resolutionNote ? ` — ${e.resolutionNote}` : ""}
                    </span>
                  )}
                </Td>
                <Td label={resolvedTab ? "Resolved" : "Received"} muted>
                  <span title={resolvedTab && e.resolvedAt ? e.resolvedAt : e.receivedAt}>{agoLabel(resolvedTab && e.resolvedAt ? e.resolvedAt : e.receivedAt, now)}</span>
                </Td>
                <Td act>
                  {open && resolver ? <ResolveEvent event={e} /> : open ? <span className="text-[11px] text-[color:var(--vault-muted)]">BTG admin resolves</span> : null}
                </Td>
              </Tr>
            );
          })}
        </PagedTable>
      )}
    </div>
  );
}
