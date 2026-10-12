import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { ListFilter, ListSearch, ServerList } from "@/components/server-pager";
import { PagedTable, Primary, TabLink, TabStrip, Td, Tr, type Column } from "@/components/stage-table";
import { EmptyState } from "@/components/states";
import {
  VaultBox,
  VaultChip,
  VaultDial,
  VaultFlow,
  VaultGhost,
  VaultHead,
  VaultPanel,
  VaultRange,
  VaultSection,
  VaultSplit,
  VaultSteps,
  VaultTile,
  VaultUpdated,
  at,
  type VaultTone,
} from "@/components/vault-stage";
import { demoState } from "@/lib/demo";
import {
  EARNING_COPY,
  INVOICE_COPY,
  adminFinanceX,
  adminOps,
  earningItems,
  sponsorInvoices,
  type EarningState,
  type InvoiceStatus,
} from "@/lib/fixtures";
import {
  agingRows,
  earningApprovalNote,
  pagedQuery,
  STATES,
  type ApiEarning,
  type ApiInvoiceRow,
  type ApiPage,
  type ApiReconciliationPage,
} from "@/lib/earnings-live";
import {
  PAY_STEPS,
  delta,
  needsYouTotal,
  rangeParam,
  splitRows,
  waitedFor,
  type ApiFinanceOverview,
  type RangeKey,
} from "@/lib/finance-overview-live";
import { formatCount } from "@/lib/format-count";
import { pageParams, pageParamsFor, textParam, type ListKeys, type SearchParams } from "@/lib/list-query";
import { apiFetch, fetchActor } from "@/server/api";

/* --------------------------------------------------------------------------
   The Treasury — Finance's home (P1-ART-25, 2026-10-12; was the Finance
   Workspace, §10).

   Stats first, on the Vault (vault-stage.tsx, memory admin-desks-are-
   dashboards): a small title with the live pill and the 7 / 30 / 90 days /
   All time switch, five money tiles, then the work — what waits on BTG at
   each money desk, money in vs money out beside how much is settled, where
   the marketplace money went beside athlete pay by step, and the books.
   Every figure is GET /finance/overview's (one read, scoped per role on the
   server); the books are one tabbed, server-paged table.

   SponsorX only ever observes two sides of the books:
   - sponsor invoices live in Zoho Books — SponsorX holds the reference and
     the status Zoho reports, inbound only, and never writes an invoice;
   - athlete earnings move through their steps, status only: no tax ID, no
     bank details (Addendum A6). Earning.reference is a Zoho / payment
     reference, never a credential.

   INVOICES ARE BTG ADMIN ONLY — the 2026-09-24 RBAC matrix decision
   (`invoice`): Finance reads earnings, not what the sponsor was billed. The
   overview leaves `invoices` out for that role, so the Collected dial, the
   unpaid-invoice ageing and the By campaign / Sponsor invoices tabs are
   simply ABSENT for Finance — never drawn as 0.

   LIVE vs DEMO (P7-FE-02). A signed-in Finance / BTG desk reads the real
   books; an outage is the error page, never fixtures dressed as the real
   books (QA pass 4 rule). Fixtures render only for ?demo= and signed-out
   visitors, laid out the same way and marked "Sample".

   SERVER-PAGED. Only the active tab's list is fetched, each with its own URL
   keys: athlete earnings ?page ?size (plus ?q ?state), by campaign ?rpage
   ?rsize, sponsor invoices ?ipage ?isize. ?tab= picks the tab; a tab link
   drops every page key.
   -------------------------------------------------------------------------- */

const FINANCE_ROLES = ["SUPER_ADMIN", "BTG_ADMIN", "FINANCE"];
const PATH = "/admin/finance";

const RECON_KEYS: ListKeys = { page: "rpage", size: "rsize" };
const INVOICE_KEYS: ListKeys = { page: "ipage", size: "isize" };

type Tab = "earnings" | "campaigns" | "invoices";
type EarningsPage = { earnings: ApiEarning[]; page: ApiPage };
type InvoicesPage = { invoices: ApiInvoiceRow[]; page: ApiPage };
type Books =
  | { tab: "earnings"; earnings: EarningsPage }
  | { tab: "campaigns"; recon: ApiReconciliationPage }
  | { tab: "invoices"; invoices: InvoicesPage };

type Treasury = {
  ov: ApiFinanceOverview;
  range: RangeKey;
  books: Books;
  q: string;
  state: string;
  sp: SearchParams;
  /** Fixtures, not the real books: the "Sample" pill instead of the read time. */
  sample?: boolean;
};

/** The campaign and invoice tabs exist only when the overview carries invoices. */
const tabOf = (sp: SearchParams, canInvoices: boolean): Tab => {
  const t = textParam(sp, "tab");
  return t === "campaigns" || t === "invoices" ? (canInvoices ? t : "earnings") : "earnings";
};

/** One API read; anything not-ok is an error (the error page). */
async function readJson<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (!res.ok) throw new Error(`The books are unavailable (${res.status}).`);
  return (await res.json()) as T;
}

async function liveTreasury(sp: SearchParams): Promise<Treasury | null> {
  /* No catch — an outage is an error page, never fixtures. */
  const who = await fetchActor();
  if (who.status !== "linked") return null;
  if (!who.actor.roles.some((r) => FINANCE_ROLES.includes(r))) return null;
  const range = rangeParam(sp);
  const q = textParam(sp, "q");
  const state = textParam(sp, "state", STATES);
  const earningsPath = `/earnings${pagedQuery(pageParams(sp), { q, state })}`;
  /* The earnings tab is every role's default, so its read starts beside the
     overview's; the other tabs wait to learn whether the role may see them. */
  const asked = textParam(sp, "tab");
  const early = asked === "campaigns" || asked === "invoices" ? null : readJson<EarningsPage>(earningsPath);
  const [{ overview: ov }, earlyEarnings] = await Promise.all([
    readJson<{ overview: ApiFinanceOverview }>(`/finance/overview?range=${range}`),
    early,
  ]);
  const tab = tabOf(sp, !!ov.invoices);
  const books: Books =
    tab === "campaigns"
      ? { tab, recon: await readJson<ApiReconciliationPage>(`/earnings/reconciliation${pagedQuery(pageParamsFor(sp, RECON_KEYS))}`) }
      : tab === "invoices"
        ? { tab, invoices: await readJson<InvoicesPage>(`/earnings/invoices${pagedQuery(pageParamsFor(sp, INVOICE_KEYS))}`) }
        : { tab, earnings: earlyEarnings ?? (await readJson<EarningsPage>(earningsPath)) };
  return { ov, range, books, q, state, sp };
}

/* the demo's overview ---------------------------------------------------------- */

const one = <T,>(n: T[]) => ({ page: 1, size: 12, total: n.length, pages: 1 });

/** A sample overview, every figure derived from the existing fixtures (no new
 *  literals): earnings by step from `earningItems`; money in one week per
 *  sample invoice (`sponsorInvoices`); money out the sample earnings dealt
 *  across those weeks; invoices from `adminOps` / `adminFinanceX`.
 *  Illustrative, and marked Sample. */
function demoOverview(): ApiFinanceOverview {
  const byState = Object.fromEntries(
    STATES.map((st) => {
      const rows = earningItems.filter((e) => e.state === st);
      return [st, { count: rows.length, amount: rows.reduce((n, e) => n + e.amount, 0) }];
    }),
  ) as ApiFinanceOverview["earningsByState"];
  const raised = STATES.reduce((n, st) => n + byState[st].amount, 0);
  const paid = byState.PAID.amount;
  const owed = byState.PENDING.amount + byState.ELIGIBLE.amount + byState.APPROVED_FOR_PAYOUT.amount;
  const moneyIn = sponsorInvoices.reduce((n, i) => n + i.amount, 0);
  const now = new Date();
  const day = (weeksAgo: number) => new Date(now.getTime() - weeksAgo * 7 * 86_400_000).toISOString().slice(0, 10);
  const weeks = sponsorInvoices.length;
  return {
    readAt: now.toISOString(),
    range: { key: "30d", from: day(weeks), to: day(0), days: 30, bucket: "week" },
    moneyIn: { cents: moneyIn, prev: null },
    paidOut: { cents: paid, prev: null },
    owed: { cents: owed },
    kept: { cents: Math.max(0, moneyIn - raised), prev: null },
    series: sponsorInvoices.map((inv, i) => ({
      day: day(weeks - 1 - i),
      inCents: inv.amount,
      outCents: earningItems.filter((_, k) => k % weeks === i).reduce((n, e) => n + e.amount, 0),
    })),
    split: { athletes: raised, properties: 0, platform: Math.max(0, moneyIn - raised), management: 0, processing: 0, referral: 0, reserve: 0 },
    settled: { paidCents: paid, owedCents: owed, rate: paid + owed > 0 ? paid / (paid + owed) : null },
    earningsByState: byState,
    needsYou: {
      payouts: { count: byState.APPROVED_FOR_PAYOUT.count, cents: byState.APPROVED_FOR_PAYOUT.amount, oldestAt: null },
      refunds: { count: 0, cents: 0, oldestAt: null },
      disputes: { count: byState.DISPUTED.count, cents: byState.DISPUTED.amount },
      events: { count: 0 },
    },
    invoices: {
      invoicedCents: adminOps.invoicedCents,
      collectedCents: adminOps.collectedCents,
      rate: adminFinanceX.collectionRatePct,
      aging: adminFinanceX.aging.map((a) => a.value),
    },
  };
}

/* words and tones ----------------------------------------------------------------- */

const usd0 = (cents: number) => formatCount(cents, "usd0");
const usd = (cents: number) => formatCount(cents, "usd");

const PREV: Record<RangeKey, string> = {
  "7d": "vs the 7 days before",
  "30d": "vs the 30 days before",
  "90d": "vs the 90 days before",
  all: "",
};

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

/* pieces ------------------------------------------------------------------------------- */

/** Two engraved figures under a dial — what its share is made of. */
function DialLedger({ rows }: { rows: { label: string; cents: number }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-px border-t border-[color:var(--vault-line-soft)] pt-3">
      {rows.map((r) => (
        <div key={r.label} className="min-w-0">
          <dt className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--vault-muted)]">{r.label}</dt>
          <dd className="sx-vault-num mt-0.5 truncate text-[17px] leading-tight">{usd0(r.cents)}</dd>
        </div>
      ))}
    </dl>
  );
}

const AGING_LABELS = ["Not yet due", "1–30 days late", "31–60 days late", "Over 60 days late"];

/** Unpaid sponsor invoices by days past due — /earnings/reconciliation's own
 *  cut. Amounts in the serif; over 60 days in red. */
function Aging({ aging }: { aging: number[] }) {
  if (!aging.some((n) => n > 0)) return <p className="text-xs text-[color:var(--vault-muted)]">Nothing outstanding.</p>;
  const shares = agingRows(aging);
  return (
    <ul aria-label="Unpaid invoices by days past due" className="space-y-2.5">
      {AGING_LABELS.map((label, k) => {
        const late = k === AGING_LABELS.length - 1;
        return (
          <li key={label} className="text-[12px]">
            <span className="flex items-baseline justify-between gap-3">
              <span className={late ? "text-[color:var(--vault-late)]" : "text-[color:var(--vault-ink)]"}>{label}</span>
              <span className={`shrink-0 font-[family-name:var(--font-source-serif)] font-semibold tabular-nums ${late ? "text-[color:var(--vault-late)]" : "text-[color:var(--vault-gold-hi)]"}`}>
                {usd0(aging[k] ?? 0)}
              </span>
            </span>
            <span aria-hidden="true" className={`sx-vault-bar mt-1 !h-[5px] ${late ? "[&>span]:!bg-[color:var(--vault-late)]" : ""}`}>
              <span style={at(0.5 + k * 0.07, { width: `${shares[k]?.value ?? 0}%` })} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

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

const muted = "text-[11px] text-[color:var(--vault-faint)]";

/** The rule the earnings list follows — kept word for word from the Finance Workspace. */
function EarningsFoot() {
  return (
    <div className="space-y-1.5 text-[10.5px] leading-relaxed text-[color:var(--vault-faint)]">
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

function EarningsTab({ data, q, state, sample }: { data: EarningsPage; q: string; state: string; sample?: boolean }) {
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

function CampaignsTab({ data }: { data: ApiReconciliationPage }) {
  return (
    <PagedTable
      bare
      page={data.page}
      noun="Campaigns"
      tone="vault"
      keys={RECON_KEYS}
      label="By campaign"
      columns={RECON_COLUMNS}
      foot={<p className="text-[10.5px] text-[color:var(--vault-faint)]">Per campaign: what the orders sold, what Zoho invoiced and collected, and what athletes are owed and paid.</p>}
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

function InvoicesTab({ rows, page }: { rows: InvoiceView[]; page: ApiPage }) {
  return (
    <PagedTable
      bare
      page={page}
      noun="Invoices"
      tone="vault"
      keys={INVOICE_KEYS}
      label="Sponsor invoices"
      columns={INVOICE_COLUMNS}
      foot={<p className="text-[10.5px] text-[color:var(--vault-faint)]">From Zoho Books, inbound only; SponsorX never writes an invoice.</p>}
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

/** The tab link: keeps the window, drops every page key and the earnings filters. */
function tabHref(tab: Tab, range: RangeKey) {
  const u = new URLSearchParams();
  if (range !== "30d") u.set("range", range);
  if (tab !== "earnings") u.set("tab", tab);
  const s = u.toString();
  return s ? `${PATH}?${s}` : PATH;
}

/* the page ------------------------------------------------------------------------------ */

function TreasuryView({ t }: { t: Treasury }) {
  const { ov, range, books } = t;
  const prev = PREV[range];
  const d = (now: number, before: number | null) => (range === "all" ? undefined : delta(now, before));
  const waiting = needsYouTotal(ov.needsYou);
  const rows = splitRows(ov.split);
  const inv = ov.invoices;
  const earningsTotal = STATES.reduce((n, st) => n + ov.earningsByState[st].count, 0);
  const oldest = (iso: string | null) => {
    const w = waitedFor(iso);
    return w ? `oldest ${w}` : undefined;
  };

  return (
    <ServerList>
      <VaultHead
        title="Treasury"
        pill={t.sample ? "Sample" : <>Live · <VaultUpdated iso={ov.readAt} /></>}
        actions={<VaultRange current={range} path={PATH} params={t.sp} />}
      >
        {t.sample && (
          <p className="sx-vault-in mt-2 text-[11.5px] text-[color:var(--vault-muted)]" style={at(0.06)}>
            Demo data — the real books are read by BTG admin and Finance only, so every figure below is sample data.
          </p>
        )}
        {/* ② the five money numbers. VaultTiles' grid goes one column below
            420px; on a phone the Treasury keeps two (the fifth, Needs you,
            across both), so the numbers still read as one block. gap-4: the
            frame's outer rule sits 4px outside each tile. */}
        <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5 max-sm:[&>*:last-child]:col-span-2">
          <VaultTile
            label="Money in"
            value={ov.moneyIn.cents}
            delta={d(ov.moneyIn.cents, ov.moneyIn.prev)}
            deltaLabel={prev}
            hint="Card payments taken for marketplace orders in this period, less card refunds."
            delay={0.08}
          />
          <VaultTile
            label="Paid out"
            value={ov.paidOut.cents}
            delta={d(ov.paidOut.cents, ov.paidOut.prev)}
            deltaLabel={prev}
            caption="to athletes and properties"
            delay={0.12}
          />
          <VaultTile
            label="Owed to payees"
            value={ov.owed.cents}
            caption="earned, not paid yet"
            hint="Athlete earnings not yet paid, plus what the marketplace owes athletes and properties."
            delay={0.16}
          />
          <VaultTile
            label="BTG kept"
            value={ov.kept.cents + (ov.kept.campaignCommission ?? 0)}
            delta={d(ov.kept.cents, ov.kept.prev)}
            deltaLabel={prev}
            caption={ov.kept.campaignCommission === undefined ? "marketplace fees only" : "fees and campaign commission"}
            delay={0.2}
          />
          <VaultTile
            label="Needs you"
            value={waiting}
            format="int"
            tone={waiting ? "you" : undefined}
            badge={waiting}
            caption="items waiting on BTG"
            delay={0.24}
          />
        </dl>
      </VaultHead>

      {/* ③ what waits on BTG, one deposit box per desk */}
      <section aria-label="Needs you" className="mt-4 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <VaultBox label="Payouts to approve" count={ov.needsYou.payouts.count} cents={ov.needsYou.payouts.cents} sub={oldest(ov.needsYou.payouts.oldestAt)} href="/admin/payouts" open="Open Payouts" delay={0.28} />
        <VaultBox label="Refunds to send" count={ov.needsYou.refunds.count} cents={ov.needsYou.refunds.cents} sub={oldest(ov.needsYou.refunds.oldestAt)} href="/admin/refunds" open="Open Refunds" delay={0.32} />
        <VaultBox label="Disputes open" count={ov.needsYou.disputes.count} cents={ov.needsYou.disputes.cents} sub="money frozen" href="/admin/payments/disputes" open="Open Disputes" delay={0.36} />
        <VaultBox label="Payment events held" count={ov.needsYou.events.count} sub="the payment provider sent something we couldn't apply" href="/admin/payments/events" open="Open Payment events" delay={0.4} />
      </section>

      {/* ④ money in vs money out, beside how much of what was earned is paid.
          The chart's height is fixed, so the dial panel is built to about
          the same height: the dial, then the two figures its share is made
          of. */}
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <VaultPanel delay={0.44} className="min-w-0">
          <VaultSection title="Money in vs. money out" hint={range === "all" ? "All time" : `Last ${ov.range.days} days`} />
          <VaultFlow series={ov.series} bucket={ov.range.bucket} />
        </VaultPanel>
        <VaultPanel delay={0.48} className="flex min-w-0 flex-col gap-4">
          <VaultSection title="Settled" hint="earned in this period, and paid" />
          <div className="flex flex-1 items-center">
            <VaultDial value={ov.settled.rate} label="Settled" size={156} caption="Of what athletes and properties earned, how much has been paid." />
          </div>
          <DialLedger
            rows={[
              { label: "Paid", cents: ov.settled.paidCents },
              { label: "Still owed", cents: ov.settled.owedCents },
            ]}
          />
        </VaultPanel>
      </div>

      {/* ④b BTG admin only: the sponsor invoices (Zoho) — collected, and
          unpaid by days past due. A band of its own rather than a second
          dial squeezed beside the chart: the chart's height is fixed, and a
          column of two dials and the ageing ran far past it. Finance never
          sees invoices (2026-09-24); the band is absent, never zeros. */}
      {inv && (
        <VaultPanel delay={0.5} className="@container mt-4 min-w-0">
          <VaultSection title="Sponsor invoices" hint="from Zoho Books" />
          <div className="grid gap-x-10 gap-y-6 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] @3xl:items-center">
            <div className="space-y-4">
              <VaultDial value={inv.rate === null ? null : inv.rate / 100} label="Collected" size={128} caption="Sponsor invoices paid, from Zoho Books." />
              <DialLedger
                rows={[
                  { label: "Collected", cents: inv.collectedCents },
                  { label: "Invoiced", cents: inv.invoicedCents },
                ]}
              />
            </div>
            <div>
              <p className="mb-2.5 text-[10px] uppercase tracking-[0.16em] text-[color:var(--vault-muted)]">Unpaid, by days past due</p>
              <Aging aging={inv.aging} />
            </div>
          </div>
        </VaultPanel>
      )}

      {/* ⑤ where the money went, beside athlete pay by step */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <VaultPanel delay={0.52} className="min-w-0">
          <VaultSection title="Where the money went" hint="Marketplace sales" />
          {rows.length ? <VaultSplit rows={rows} /> : <p className="py-6 text-center text-xs text-[color:var(--vault-muted)]">No marketplace sales in this period.</p>}
        </VaultPanel>
        <VaultPanel delay={0.56} className="min-w-0">
          <VaultSection title="Athlete pay, step by step" hint="all time" />
          <VaultSteps
            steps={PAY_STEPS.map((s) => ({
              label: s.label,
              off: s.off,
              count: ov.earningsByState[s.state].count,
              cents: ov.earningsByState[s.state].amount,
            }))}
          />
        </VaultPanel>
      </div>

      {/* ⑥ the books — one tabbed, server-paged table */}
      <VaultPanel delay={0.6} className="mt-4 min-w-0">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <TabStrip label="The books">
            <TabLink href={tabHref("earnings", range)} on={books.tab === "earnings"} count={earningsTotal}>
              Athlete earnings
            </TabLink>
            {inv && !t.sample && (
              <TabLink href={tabHref("campaigns", range)} on={books.tab === "campaigns"} count={books.tab === "campaigns" ? books.recon.page.total : undefined}>
                By campaign
              </TabLink>
            )}
            {inv && (
              <TabLink href={tabHref("invoices", range)} on={books.tab === "invoices"} count={books.tab === "invoices" ? books.invoices.page.total : undefined}>
                Sponsor invoices
              </TabLink>
            )}
          </TabStrip>
          <p className="text-[11px] text-[color:var(--vault-faint)]">Status only — no tax ID or bank details.</p>
        </div>
        {books.tab === "earnings" && <EarningsTab data={books.earnings} q={t.q} state={t.state} sample={t.sample} />}
        {books.tab === "campaigns" && <CampaignsTab data={books.recon} />}
        {books.tab === "invoices" && (
          <InvoicesTab
            page={books.invoices.page}
            rows={books.invoices.invoices.map((i) => ({
              id: i.zohoInvoiceId,
              sponsor: i.sponsor,
              campaign: i.campaign,
              ref: i.number ?? i.zohoInvoiceId,
              status: i.status,
              amount: i.amount,
            }))}
          />
        )}
      </VaultPanel>
    </ServerList>
  );
}

/** The sample books: the earnings and invoice fixtures in the live shapes. The
 *  sample data has no per-campaign reconciliation, so the sample has no By
 *  campaign tab and ?tab=campaigns reads as the earnings one. */
function demoBooks(sp: SearchParams): Books {
  const tab = textParam(sp, "tab") === "invoices" ? "invoices" : "earnings";
  if (tab === "invoices") {
    const invoices = sponsorInvoices.map((i) => ({
      zohoInvoiceId: i.id,
      number: i.ref,
      status: INVOICE_COPY[i.status as InvoiceStatus],
      amount: i.amount,
      sponsor: i.sponsor,
      campaign: i.campaign,
    })) as unknown as ApiInvoiceRow[];
    return { tab, invoices: { invoices, page: one(invoices) } };
  }
  const earnings = earningItems.map((e) => ({
    id: e.id,
    state: e.state,
    amount: e.amount,
    reference: e.reference,
    athlete: { displayName: e.athlete },
    order: { campaignName: e.campaign, jobId: e.jobId },
  })) as unknown as ApiEarning[];
  return { tab, earnings: { earnings, page: one(earnings) } };
}

export default async function AdminFinancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <VaultGhost label="Loading the Treasury" tiles={5} rows={3} />;
  if (demo === "error") throw new Error("Demo error state");
  /* C-1: a staff role this desk isn't for gets "not in your role", not the
     sample desk. The demo stays for ?demo= and signed-out visitors. */
  if (demo === null) {
    const lacking = await staffWithoutAccess(PATH);
    if (lacking) return <NotInRole path={PATH} title="Treasury" roles={lacking} />;
  }

  const sp = await searchParams;
  const live = demo === null ? await liveTreasury(sp) : null;
  if (live) return <TreasuryView t={live} />;

  if (demo === "empty") {
    return (
      <div>
        <VaultHead title="Treasury" pill="Sample" />
        <div className="mt-5">
          <EmptyState mark="chart" title="No money has moved yet" hint="Payments, payouts and invoices appear here once campaigns launch." />
        </div>
      </div>
    );
  }

  return <TreasuryView t={{ ov: demoOverview(), range: "30d", books: demoBooks(sp), q: "", state: "", sp, sample: true }} />;
}
