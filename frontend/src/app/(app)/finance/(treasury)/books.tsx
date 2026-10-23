import { PausedLink } from "@/components/deal-dispute-desk";
import { ListFilter, ListSearch } from "@/components/server-pager";
import { PagedTable, Primary, Td, Tr, type Column } from "@/components/stage-table";
import { VaultChip, type VaultTone } from "@/components/vault-stage";
import { openDisputeFor, pausedNote, type ApiDealDispute } from "@/lib/deal-disputes-live";
import { EARNING_COPY, type EarningState } from "@/lib/fixtures";
import {
  earningApprovalNote,
  STATES,
  type ApiEarning,
  type ApiInvoiceRow,
  type ApiPage,
  type ApiReconciliationPage,
} from "@/lib/earnings-live";
import type { RangeKey } from "@/lib/finance-overview-live";
import { formatCount } from "@/lib/format-count";
import { textParam, type ListKeys, type SearchParams } from "@/lib/list-query";

/* --------------------------------------------------------------------------
   The Treasury's books (P1-ART-25 split, 2026-10-12) — the three tabbed,
   server-paged tables page.tsx's "the books" panel draws (⑥): athlete
   earnings, by campaign, sponsor invoices; their columns, tones and the
   earnings tab's rule-footnote; and `tabHref`, the tab strip's own link
   builder. Carved out of page.tsx (P1-ART-25 review, 745 lines) so the page
   keeps only the reads, the access check and the routing.
   -------------------------------------------------------------------------- */

export const PATH = "/finance";

export const RECON_KEYS: ListKeys = { page: "rpage", size: "rsize" };
export const INVOICE_KEYS: ListKeys = { page: "ipage", size: "isize" };

export type Tab = "earnings" | "campaigns" | "invoices";
export type EarningsPage = { earnings: ApiEarning[]; page: ApiPage };
export type InvoicesPage = { invoices: ApiInvoiceRow[]; page: ApiPage };
export type Books =
  | { tab: "earnings"; earnings: EarningsPage }
  | { tab: "campaigns"; recon: ApiReconciliationPage }
  | { tab: "invoices"; invoices: InvoicesPage };

/** The campaign and invoice tabs exist only when the overview carries invoices. */
export const tabOf = (sp: SearchParams, canInvoices: boolean): Tab => {
  const t = textParam(sp, "tab");
  return t === "campaigns" || t === "invoices" ? (canInvoices ? t : "earnings") : "earnings";
};

/** The tab link: keeps the window and ?demo=, drops every page key and the
 *  earnings filters — ?demo= the same way VaultRange's own href keeps it. */
export function tabHref(tab: Tab, range: RangeKey, sp: SearchParams) {
  const u = new URLSearchParams();
  if (range !== "30d") u.set("range", range);
  if (tab !== "earnings") u.set("tab", tab);
  const demo = textParam(sp, "demo");
  if (demo) u.set("demo", demo);
  const s = u.toString();
  return s ? `${PATH}?${s}` : PATH;
}

/* words and tones ----------------------------------------------------------------- */

const usd = (cents: number) => formatCount(cents, "usd");

const EARNING_TONE: Record<EarningState, VaultTone> = {
  PENDING: "done",
  ELIGIBLE: "info",
  APPROVED_FOR_PAYOUT: "you",
  PAID: "good",
  HELD: "late",
  DISPUTED: "late",
};

const INVOICE_TONE: Record<string, VaultTone> = {
  draft: "done",
  sent: "info",
  paid: "good",
  overdue: "late",
  void: "done",
};

const muted = "text-[11px] text-[color:var(--vault-faint)]";

const EARNING_COLUMNS: readonly Column[] = [
  { key: "athlete", label: "Athlete" },
  { key: "campaign", label: "Campaign" },
  { key: "ref", label: "Reference" },
  { key: "status", label: "Status" },
  { key: "net", label: "Athlete", num: true },
  { key: "sell", label: "Sponsor price", num: true },
  { key: "commission", label: "Commission", num: true },
];

const RECON_COLUMNS: readonly Column[] = [
  { key: "campaign", label: "Campaign" },
  { key: "contracted", label: "Contracted", num: true },
  { key: "invoiced", label: "Invoiced", num: true },
  { key: "collected", label: "Collected", num: true },
  { key: "raised", label: "Athlete earnings", num: true },
  { key: "paid", label: "Paid out", num: true },
  { key: "check", label: "Check" },
];

const INVOICE_COLUMNS: readonly Column[] = [
  { key: "sponsor", label: "Sponsor" },
  { key: "campaign", label: "Campaign" },
  { key: "ref", label: "Reference" },
  { key: "status", label: "Status" },
  { key: "amount", label: "Amount", num: true },
];

/** The rule the earnings list follows — kept word for word from the Finance Workspace. */
function EarningsFoot() {
  return (
    <div className="space-y-1.5 text-[11.5px] leading-relaxed text-[color:var(--vault-muted)]">
      <p>
        Commission is BTG&rsquo;s cut: the sponsor price minus the athlete&rsquo;s net earning. The athlete never sees the
        sponsor price.
      </p>
      <p>
        Payout actions are blocked on the written Phase 1 payment policy. This screen shows real states; it does not
        approve, pay or collect payout details until the policy is written. Earnings under $2,000 move to &ldquo;approved
        for payout&rdquo; on their own as they become eligible; the ones left for Finance say why. Paid is still recorded
        by Finance.
      </p>
    </div>
  );
}

export function EarningsTab({ data, q, state, sample, disputes = [] }: {
  data: EarningsPage;
  q: string;
  state: string;
  sample?: boolean;
  /** P8-FE-05 — the deal disputes pausing orders: a HELD earning says why, with the way to its dispute (inside /finance). */
  disputes?: ApiDealDispute[];
}) {
  const filtered = Boolean(q || state);
  return (
    <div className="space-y-3">
      {!sample && (
        <div className="flex flex-wrap items-center gap-2">
          <ListSearch initial={q} label="Search earnings" placeholder="Athlete, campaign, sponsor, job or reference…" tone="vault" />
          <ListFilter
            param="state"
            value={state}
            label="Filter by status"
            allLabel="All statuses"
            options={STATES.map((st) => ({ value: st, label: EARNING_COPY[st] }))}
            tone="vault"
          />
        </div>
      )}
      <PagedTable bare page={data.page} noun="Earnings" tone="vault" filtered={filtered} label="Athlete earnings" columns={EARNING_COLUMNS} foot={<EarningsFoot />}>
        {data.earnings.length === 0 ? (
          <Tr>
            <Td colSpan={7} className="py-6 text-center text-xs text-[color:var(--vault-muted)]">
              {filtered ? "No earning matches this search or status." : "No earnings raised yet."}
            </Td>
          </Tr>
        ) : (
          data.earnings.map((e, i) => {
            const note = earningApprovalNote(e);
            const pause = e.state === "HELD" ? openDisputeFor(disputes, e.order.id) : null;
            return (
              <Tr key={e.id} i={i}>
                <Td>
                  <Primary>{e.athlete.displayName}</Primary>
                </Td>
                <Td label="Campaign" muted>
                  {e.order.campaignName}
                  <span className="text-[color:var(--vault-faint)]"> · {e.order.jobId}</span>
                </Td>
                <Td label="Reference">{e.reference ? <code className={`font-mono ${muted}`}>{e.reference}</code> : <span className={muted}>—</span>}</Td>
                <Td label="Status">
                  <span className="flex flex-col items-start gap-1">
                    <VaultChip tone={EARNING_TONE[e.state]}>{EARNING_COPY[e.state]}</VaultChip>
                    {note.badge && <VaultChip tone="good">✓ {note.badge}</VaultChip>}
                    {note.reasons.length > 0 && (
                      <span className="text-[11px] leading-snug text-[color:var(--vault-gold-hi)]">For Finance: {note.reasons.join(" · ")}</span>
                    )}
                    {pause && <PausedLink skin="vault" note={pausedNote(pause)} href={`/finance/deal-disputes/${encodeURIComponent(pause.id)}`} />}
                  </span>
                </Td>
                <Td label="Athlete" num>
                  {typeof e.amount === "number" ? usd(e.amount) : "—"}
                </Td>
                <Td label="Sponsor price" num>
                  {typeof e.sellPrice === "number" ? usd(e.sellPrice) : "—"}
                </Td>
                <Td label="Commission" num>
                  {typeof e.commission === "number" ? usd(e.commission) : "—"}
                </Td>
              </Tr>
            );
          })
        )}
      </PagedTable>
    </div>
  );
}

export function CampaignsTab({ data }: { data: ApiReconciliationPage }) {
  return (
    <PagedTable
      bare
      page={data.page}
      noun="Campaigns"
      tone="vault"
      keys={RECON_KEYS}
      label="By campaign"
      columns={RECON_COLUMNS}
      foot={<p className="text-[11.5px] text-[color:var(--vault-muted)]">Per campaign: what the orders sold, what Zoho invoiced and collected, and what athletes are owed and paid.</p>}
    >
      {data.campaigns.length === 0 ? (
        <Tr>
          <Td colSpan={7} className="py-6 text-center text-xs text-[color:var(--vault-muted)]">
            No campaign has an earning yet.
          </Td>
        </Tr>
      ) : (
        data.campaigns.map((c, i) => {
          const under = c.invoiced < c.contracted;
          const over = c.invoiced > c.contracted;
          return (
            <Tr key={c.campaignId} i={i}>
              <Td>
                <Primary sub={c.sponsorName}>{c.name}</Primary>
              </Td>
              <Td label="Contracted" num>{usd(c.contracted)}</Td>
              <Td label="Invoiced" num>{usd(c.invoiced)}</Td>
              <Td label="Collected" num>{usd(c.invoicePaid)}</Td>
              <Td label="Athlete earnings" num>{usd(c.earningsRaised)}</Td>
              <Td label="Paid out" num>{usd(c.earningsPaid)}</Td>
              <Td label="Check">
                {under ? (
                  <VaultChip tone="you">{usd(c.contracted - c.invoiced)} not invoiced</VaultChip>
                ) : over ? (
                  <VaultChip tone="late">invoiced over contract</VaultChip>
                ) : (
                  <VaultChip tone="good">matches</VaultChip>
                )}
              </Td>
            </Tr>
          );
        })
      )}
    </PagedTable>
  );
}

type InvoiceView = { id: string; sponsor: string; campaign: string; ref: string; status: string; amount: number };

export function InvoicesTab({ rows, page }: { rows: InvoiceView[]; page: ApiPage }) {
  return (
    <PagedTable
      bare
      page={page}
      noun="Invoices"
      tone="vault"
      keys={INVOICE_KEYS}
      label="Sponsor invoices"
      columns={INVOICE_COLUMNS}
      foot={<p className="text-[11.5px] text-[color:var(--vault-muted)]">From Zoho Books, inbound only; SponsorX never writes an invoice.</p>}
    >
      {rows.length === 0 ? (
        <Tr>
          <Td colSpan={5} className="py-6 text-center text-xs text-[color:var(--vault-muted)]">
            No invoices synced from Zoho yet.
          </Td>
        </Tr>
      ) : (
        rows.map((r, i) => (
          <Tr key={r.id} i={i}>
            <Td>
              <Primary>{r.sponsor}</Primary>
            </Td>
            <Td label="Campaign" muted>{r.campaign}</Td>
            <Td label="Reference">
              <code className={`font-mono ${muted}`}>{r.ref}</code>
            </Td>
            <Td label="Status">
              <VaultChip tone={INVOICE_TONE[r.status.toLowerCase()] ?? "done"}>{r.status.toLowerCase()}</VaultChip>
            </Td>
            <Td label="Amount" num>{usd(r.amount)}</Td>
          </Tr>
        ))
      )}
    </PagedTable>
  );
}
