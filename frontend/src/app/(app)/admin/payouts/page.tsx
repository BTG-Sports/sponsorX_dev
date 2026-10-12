import Link from "next/link";

import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { PagedTable, Primary, TabLink, TabStrip, Td, Tr, type Column } from "@/components/stage-table";
import { EmptyState } from "@/components/states";
import { PayoutRetry } from "@/components/payout-decision";
import { StadiumHint } from "@/components/stadium-hint";
import { VaultChip, VaultHead, VaultTile, VaultTiles, VaultUpdated, type VaultTone } from "@/components/vault-stage";
import { apiListQuery } from "@/lib/list-query";
import {
  APPROVAL_TABS, approvalBadge, approvalTab, checkSummary, failedFilter, listQuery, payeeKind, payoutStatus, retryStatus, stamp, tabCount, usd,
  waitedFor, waitingReasons, type ApiPayoutDetail, type ApiPayoutList,
} from "@/lib/payouts-live";
import { apiFetch } from "@/server/api";
import { retryPayoutAction } from "./actions";

/* --------------------------------------------------------------------------
   Payout approvals — 2S5-FE-04 (Claude Design Approvals.dc.html). BTG admin
   and Finance: money only moves after someone at BTG approves it.

   P1-FE-31 (2026-10-07): one SERVER-PAGED table per tab (the house pager);
   the waiting tab's per-row checks are read for the page only.

   P1-ART-25 (2026-10-12) — the Vault: the tile row is the list read's own
   per-state counts (`list.counts`), nothing new is read. Every status word
   still comes from payouts-live.ts; only the chip's colour is mapped here.
   Review (2026-10-12): four tiles, one per tab and each the tab's own count
   (tabCount) — Approved and Sending fold into one Sending tile, as they do
   in the tab; Failed follows the tab's "needs BTG" default. The desk's
   explanation is a "?" by the title, not a paragraph under it (spec §3).

   Reads  GET /payouts?state=…&page&size   the tab's page and every state's count
                                           (Failed tab: &waitingOn=BTG unless ?show=all)
          GET /payouts/:id                 (waiting tab) each request's rule checks
   Writes POST /payouts/:id/retry          (Failed tab) back to the provider
   Approve / Send back happen on the payout's own page (./[id]).

   2S5-FE-06 — payouts the rule approved carry "Approved automatically"; a
   waiting request shows why it waits; the Failed tab shows what needs BTG
   by default, with each payout's retry status, and Retry on every row.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/payouts";
const TITLE = "Payout approvals";

/** payouts-live.ts's plain tones, mapped to the Vault's five chip colours
 *  (memory portal-stage-identities: never the cyan/warn pair here). */
function chipTone(tone: "neutral" | "primary" | "accent" | "danger" | "warn"): VaultTone {
  if (tone === "accent") return "good";
  if (tone === "primary") return "info";
  if (tone === "warn" || tone === "danger") return "late";
  return "done";
}

/** A row still waiting on BTG's decision reads as "you" (gold), whatever
 *  payoutStatus's plain tone would otherwise be. */
const rowTone = (state: string, tone: "neutral" | "primary" | "accent" | "danger" | "warn"): VaultTone =>
  state === "REQUESTED" ? "you" : chipTone(tone);

export default async function PayoutApprovalsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title={TITLE} roles={lacking} />;
  const sp = await searchParams;
  const tab = approvalTab(sp.tab);
  const filter = failedFilter(sp.show);
  const res = await apiFetch(`/payouts${apiListQuery(sp, Object.fromEntries(new URLSearchParams(listQuery(tab, filter))))}`);
  if (res.status === 403) return <NotInRole path={PATH} title={TITLE} roles={["BTG_ADMIN", "FINANCE"]} />;
  if (!res.ok) throw new Error(`Payouts unavailable (${res.status}).`);
  const list = (await res.json()) as ApiPayoutList;
  const page = list.page ?? { page: 1, size: list.payouts.length || 12, total: list.payouts.length, pages: 1 };
  /* The waiting tab shows each request's checks — one read per row, on one page. */
  const details = tab === "waiting"
    ? await Promise.all(list.payouts.map(async (p) => {
        const r = await apiFetch(`/payouts/${encodeURIComponent(p.id)}`);
        return r.ok ? ((await r.json()) as ApiPayoutDetail) : null;
      }))
    : [];
  const now = new Date();
  const problems = tab === "problems";

  /* The tile row: each tile is its tab's own number (tabCount), so a tile
     and the tab it opens never disagree. Failed counts what needs BTG by
     default — the Failed tab's default — and every failed payout with
     ?show=all; "needs BTG" is said only when that split was actually read. */
  const showAll = filter === "all";
  const waiting = tabCount("waiting", list.counts, list.waiting, showAll);
  const approved = list.counts.APPROVED ?? 0;
  const withProvider = list.counts.SENDING ?? 0;
  const sending = tabCount("sending", list.counts, list.waiting, showAll);
  const paidCount = tabCount("paid", list.counts, list.waiting, showAll);
  const failed = tabCount("problems", list.counts, list.waiting, showAll);
  const failedBtgOnly = !showAll && Boolean(list.waiting);

  const columns: Column[] = [
    { key: "payee", label: "Payee" },
    { key: "amount", label: "Amount", num: true },
    { key: "orders", label: "Orders" },
    { key: "when", label: tab === "waiting" ? "Waiting" : tab === "paid" ? "Paid" : "Updated" },
    { key: "status", label: tab === "waiting" ? "Checks" : "Status" },
    { key: "action", label: "Action", srOnly: true },
  ];

  return (
    <div className="space-y-6">
      <VaultHead
        title={TITLE}
        pill={<>Live · <VaultUpdated iso={now.toISOString()} /></>}
        actions={
          <StadiumHint
            skin="vault"
            label="About this desk"
            text="Payouts that pass every check are approved automatically; only the rest wait here for you. Every decision is recorded, automatic or yours."
          />
        }
      >
        <VaultTiles cols={4}>
          <VaultTile label="Waiting on BTG" value={waiting} format="int" tone={waiting > 0 ? "you" : undefined} badge={waiting > 0 ? waiting : undefined} href={`${PATH}?tab=waiting`} delay={0.08} />
          <VaultTile
            label="Sending"
            value={sending}
            format="int"
            caption={`${approved.toLocaleString("en-US")} approved · ${withProvider.toLocaleString("en-US")} with the provider`}
            href={`${PATH}?tab=sending`}
            delay={0.12}
          />
          <VaultTile label="Paid" value={paidCount} format="int" href={`${PATH}?tab=paid`} delay={0.16} />
          <VaultTile
            label={failedBtgOnly ? "Failed · needs BTG" : "Failed"}
            value={failed}
            format="int"
            tone={failed > 0 ? "late" : undefined}
            href={`${PATH}?tab=problems${showAll ? "&show=all" : ""}`}
            delay={0.2}
          />
        </VaultTiles>
      </VaultHead>

      <TabStrip label="Payout states">
        {APPROVAL_TABS.map((t) => (
          <TabLink
            key={t.key}
            href={`${PATH}?tab=${t.key}${t.key === "problems" && showAll ? "&show=all" : ""}`}
            on={t.key === tab}
            count={tabCount(t.key, list.counts, list.waiting, showAll)}
            hot={t.key === "problems" || t.key === "waiting"}
          >
            {t.label}
          </TabLink>
        ))}
      </TabStrip>

      {problems && (
        <nav aria-label="Failed payouts shown" className="flex flex-wrap items-center gap-2 text-xs">
          {([
            ["btg", "Needs BTG", list.waiting?.failed.BTG],
            ["all", "All failed", list.counts.FAILED ?? 0],
          ] as const).map(([key, label, n]) => (
            <Link key={key} href={`${PATH}?tab=problems${key === "all" ? "&show=all" : ""}`} aria-current={filter === key ? "page" : undefined}
              className={`rounded-full border px-2.5 py-1 ${filter === key ? "border-primary/60 text-primary" : "border-line text-muted hover:text-text"}`}>
              {label}{typeof n === "number" ? ` · ${n}` : ""}
            </Link>
          ))}
          {filter === "btg" && list.waiting && list.waiting.failed.SYSTEM_RETRY + list.waiting.failed.PAYEE_ACCOUNT > 0 && (
            <span className="text-[11px] text-muted">
              {list.waiting.failed.SYSTEM_RETRY + list.waiting.failed.PAYEE_ACCOUNT} more retrying on their own or waiting for the payee — not shown.
            </span>
          )}
        </nav>
      )}

      {list.payouts.length === 0 ? (
        <EmptyState mark="inbox" title={tab === "waiting" ? "Nothing waiting for approval" : problems ? (filter === "btg" ? "Nothing failed needs BTG" : "No failed payouts") : "Nothing here"} hint={tab === "waiting" ? "Payout requests from athletes and teams arrive here. Most are approved automatically; the ones here need a person." : ""} />
      ) : (
        <PagedTable
          tone="vault"
          page={page}
          noun="Payouts"
          label={`${APPROVAL_TABS.find((t) => t.key === tab)!.label} payouts`}
          columns={columns}
          foot={problems ? (
            <p className="text-[11px] text-muted">
              Retry hands the payout to the payment provider again, now, and resets the automatic retries. A temporary failure is retried on its own up to 3 times;
              one waiting for the payee goes again as soon as they fix their payout account on Stripe.
            </p>
          ) : undefined}
        >
          {list.payouts.map((p, i) => {
            const d = details[i];
            const check = d ? checkSummary(d.checks) : null;
            const status = payoutStatus(p);
            const auto = approvalBadge(p);
            const why = waitingReasons(p);
            const retry = retryStatus(p);
            return (
              <Tr key={p.id} i={i} tone={p.state === "FAILED" ? "danger" : p.state === "REQUESTED" ? "warn" : undefined}>
                <Td><Primary sub={payeeKind(p.payeeType)}>{p.payeeName}</Primary></Td>
                <Td label="Amount" num className="font-semibold">{usd(p.amountCents)}</Td>
                <Td label="Orders" muted className="tabular-nums">{p.lines.map((l) => l.orderRef).join(", ")}</Td>
                <Td label={tab === "waiting" ? "Waiting" : tab === "paid" ? "Paid" : "Updated"} muted>
                  {tab === "waiting" ? waitedFor(p.requestedAt, now) : tab === "paid" ? stamp(p.paidAt) : stamp(p.sentAt ?? p.decidedAt ?? p.requestedAt)}
                </Td>
                <Td label={tab === "waiting" ? "Checks" : "Status"}>
                  {tab === "waiting" && check ? (
                    <span className="block">
                      <VaultChip tone={check.ok ? "good" : "late"}>{check.ok ? "✓ " : "● "}{check.label}</VaultChip>
                      {why && <span className="mt-1 block text-[11px] text-warn">{why}</span>}
                    </span>
                  ) : retry ? (
                    <span className="block">
                      <VaultChip tone={retry.needsBtg ? "you" : chipTone(retry.tone)}>{retry.label}</VaultChip>
                      {p.failureReason && <span className="mt-1 block text-[11px] text-muted">Provider said: {p.failureReason}</span>}
                    </span>
                  ) : (
                    <span className="flex flex-wrap gap-1">
                      <VaultChip tone={rowTone(p.state, status.tone)}>{p.state === "APPROVED" ? "Approved — sending soon" : status.label}</VaultChip>
                      {auto && <VaultChip tone="good">✓ {auto}</VaultChip>}
                    </span>
                  )}
                </Td>
                <Td act>
                  {p.state === "FAILED" ? (
                    <PayoutRetry retry={retryPayoutAction.bind(null, p.id)} />
                  ) : (
                    <Link href={`${PATH}/${p.id}`} className="font-medium text-primary hover:underline">{p.state === "REQUESTED" ? "Review →" : "Open →"}</Link>
                  )}
                </Td>
              </Tr>
            );
          })}
        </PagedTable>
      )}
    </div>
  );
}
