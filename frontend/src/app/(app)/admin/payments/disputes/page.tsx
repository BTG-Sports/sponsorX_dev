import Link from "next/link";

import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { PagedTable, Primary, TabLink, TabStrip, Td, Tr, type Column } from "@/components/stage-table";
import { EmptyState } from "@/components/states";
import { StadiumHint } from "@/components/stadium-hint";
import { VaultChip, VaultGhost, VaultHead, VaultTile, VaultTiles, VaultUpdated, type VaultTone } from "@/components/vault-stage";
import { demoState } from "@/lib/demo";
import {
  DISPUTE_TABS, EMPTY_DISPUTE_LIST, amountWords, disputeTab, providerWords, reasonWords, stateLabel, stateTone, type ApiDisputeList,
} from "@/lib/disputes-live";
import { apiListQuery } from "@/lib/list-query";
import { agoLabel } from "@/lib/marketplace-ops-live";
import { apiFetch } from "@/server/api";

/** stateTone's order-automation Tone, read as a VaultTone: open (warn) is
 *  waiting on BTG; won (accent) and lost (danger) read good / late; under
 *  review (primary) is a quiet info word. ("neutral" is unused by
 *  stateTone, kept only so the Record is total.) */
const DISPUTE_CHIP: Record<ReturnType<typeof stateTone>, VaultTone> = { warn: "you", accent: "good", danger: "late", primary: "info", neutral: "info" };

/* --------------------------------------------------------------------------
   Disputes — 2S5-FE-08. A sponsor disputed a card payment with the provider
   (2S5-BE-03): its order's money is frozen until a BTG admin resolves it to
   the outcome the provider reports. A dashboard on the Vault (P1-ART-25):
   small title, four tiles from the API's counts, then the work.

   Reads  GET /disputes?state&page&size   { counts, disputes, page? }
   BTG admin and Finance (paymentDispute read). The actions live on the
   dispute's own page (./[id]). ?demo=loading|empty|error renders the
   branded states. The page tolerates an API without `page`.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/payments/disputes";
const TITLE = "Disputes";

export default async function DisputesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <VaultGhost label="Loading disputes" tiles={4} cols={4} rows={1} />;
  if (demo === "error") throw new Error("Demo error state");

  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title={TITLE} roles={lacking} />;
  const sp = await searchParams;
  const tab = disputeTab(sp.tab);
  const empty = demo === "empty";
  const res = empty ? null : await apiFetch(`/disputes${apiListQuery(sp, { state: tab.state })}`);
  if (res?.status === 403) return <NotInRole path={PATH} title={TITLE} roles={["BTG_ADMIN", "FINANCE"]} />;
  if (res && !res.ok) throw new Error(`Disputes unavailable (${res.status}).`);
  const list: ApiDisputeList = res ? ((await res.json()) as ApiDisputeList) : EMPTY_DISPUTE_LIST;
  const rows = list.disputes;
  const page = list.page ?? { page: 1, size: rows.length || 12, total: rows.length, pages: 1 };
  const now = new Date().getTime();
  const waiting = list.counts.OPEN + list.counts.UNDER_REVIEW;

  const columns: Column[] = [
    { key: "order", label: "Order" },
    { key: "amount", label: "Amount", num: true },
    { key: "reason", label: "Reason" },
    { key: "opened", label: "Opened" },
    { key: "state", label: "State" },
    { key: "provider", label: "Provider" },
    { key: "action", label: "Action", srOnly: true },
  ];

  const readAt = new Date().toISOString();

  return (
    <div className="space-y-5">
      <VaultHead title={TITLE} pill={<>Live · <VaultUpdated iso={readAt} /></>} actions={<StadiumHint skin="vault" label="About this desk" text="Card payments sponsors disputed with the provider. A dispute freezes its order’s money — no payout or refund moves — until a BTG admin resolves it to the provider’s outcome." />}>
        <VaultTiles cols={4}>
          <VaultTile label="Open" value={list.counts.OPEN} format="int" tone={list.counts.OPEN ? "you" : undefined} badge={list.counts.OPEN > 0 ? list.counts.OPEN : undefined} caption={list.counts.OPEN ? "waiting to be taken for review" : "nothing waiting"} delay={0.08} />
          <VaultTile label="Under review" value={list.counts.UNDER_REVIEW} format="int" caption={waiting ? `${waiting} order${waiting === 1 ? "" : "s"} frozen` : "no money frozen"} delay={0.12} />
          <VaultTile label="Won" value={list.counts.WON} format="int" caption="money unfrozen" delay={0.16} />
          <VaultTile label="Lost" value={list.counts.LOST} format="int" caption="books reversed" delay={0.2} />
        </VaultTiles>
      </VaultHead>

      <TabStrip label="Disputes">
        {DISPUTE_TABS.map((t) => (
          <TabLink key={t.key} href={`${PATH}?tab=${t.key}`} on={t.key === tab.key} count={list.counts[t.state]} hot={t.key === "open"}>
            {t.label}
          </TabLink>
        ))}
      </TabStrip>

      {rows.length === 0 ? (
        <EmptyState mark="inbox" title={`No ${tab.label.toLowerCase()} disputes`}
          hint={tab.key === "open" ? "Nothing waiting — every dispute has been taken for review or resolved." : tab.key === "review" ? "Disputes BTG has taken for review appear here until a BTG admin resolves them." : `Disputes resolved as ${tab.label.toLowerCase()} appear here.`} />
      ) : (
        <PagedTable page={page} noun="Disputes" tone="vault" label={`Disputes · ${tab.label}`} columns={columns}>
          {rows.map((d, i) => (
            <Tr key={d.id} i={i} tone={d.state === "OPEN" ? "warn" : undefined}>
              <Td><Primary sub={d.sponsorName}>{d.orderRef}</Primary></Td>
              <Td label="Amount" num className="font-semibold">{amountWords(d)}</Td>
              <Td label="Reason" muted>{reasonWords(d)}</Td>
              <Td label="Opened" muted><span title={d.openedAt}>{agoLabel(d.openedAt, now)}</span></Td>
              <Td label="State"><VaultChip tone={DISPUTE_CHIP[stateTone(d.state)]}>{stateLabel(d.state)}</VaultChip></Td>
              <Td label="Provider" muted>{providerWords(d)}</Td>
              <Td act>
                <Link href={`${PATH}/${encodeURIComponent(d.id)}`} aria-label={`Open the ${d.orderRef} dispute`}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-line px-3.5 text-sm font-medium text-text hover:bg-surface-2 md:min-h-9 md:w-auto md:text-xs">
                  Open →
                </Link>
              </Td>
            </Tr>
          ))}
        </PagedTable>
      )}
    </div>
  );
}
