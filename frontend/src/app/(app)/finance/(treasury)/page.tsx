import { ServerList } from "@/components/server-pager";
import { TabLink, TabStrip } from "@/components/stage-table";
import { EmptyState } from "@/components/states";
import {
  VaultBox,
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
  VaultTiles,
  VaultUpdated,
  at,
} from "@/components/vault-stage";
import { demoState } from "@/lib/demo";
import {
  pagedQuery,
  STATES,
  type ApiReconciliationPage,
} from "@/lib/earnings-live";
import type { ApiDealDispute, ApiDealDisputeList } from "@/lib/deal-disputes-live";
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
import { pageParams, pageParamsFor, textParam, type SearchParams } from "@/lib/list-query";
import { apiFetch, fetchActor } from "@/server/api";
import { CampaignsTab, EarningsTab, INVOICE_KEYS, InvoicesTab, PATH, RECON_KEYS, tabHref, tabOf, type Books, type EarningsPage, type InvoicesPage } from "./books";
import { demoBooks, demoOverview } from "./demo";
import { Aging, DialLedger } from "./pieces";

/* --------------------------------------------------------------------------
   The Treasury — the Finance portal's home, /finance (P1-ART-25,
   2026-10-12; the restructure moved it out of /admin, where BTG admins keep
   the Finance Workspace, §10, as it was).

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
   visitors, laid out the same way and marked "Sample" — a hollow gold ring
   on the pill, never the live dot, and no window switch: a sample has only
   the one (30-day) window.

   SERVER-PAGED. Only the active tab's list is fetched, each with its own URL
   keys: athlete earnings ?page ?size (plus ?q ?state), by campaign ?rpage
   ?rsize, sponsor invoices ?ipage ?isize. ?tab= picks the tab; a tab link
   keeps the window and ?demo=, and drops every page key.

   SPLIT (P1-ART-25 review, 745 lines): the books — their tabs, columns,
   tones, the earnings footnote and `tabHref` — live in `books.tsx`; the
   sample overview and books in `demo.ts`; the ageing list and a dial's
   ledger in `pieces.tsx`. This file keeps the reads and the routing — who
   may open it is the portal's call (server/portal.ts, FINANCE only), and
   what each read returns is the API's.
   -------------------------------------------------------------------------- */

const FINANCE_ROLES = ["SUPER_ADMIN", "BTG_ADMIN", "FINANCE"];

type Treasury = {
  ov: ApiFinanceOverview;
  range: RangeKey;
  books: Books;
  q: string;
  state: string;
  sp: SearchParams;
  /** Fixtures, not the real books: the "Sample" pill instead of the read time. */
  sample?: boolean;
  /** P8-FE-05 — the deal disputes pausing orders (earnings tab only): a HELD earning says why. */
  disputes?: ApiDealDispute[];
};

/** One API read; anything not-ok is an error (the error page). */
async function readJson<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (!res.ok) throw new Error(`The books are unavailable (${res.status}).`);
  return (await res.json()) as T;
}

/** P8-FE-05 — a soft read: the books never fail because the dispute list did. */
async function readDisputes(): Promise<ApiDealDispute[]> {
  try {
    const r = await apiFetch("/deal-disputes");
    return r.ok ? ((await r.json()) as ApiDealDisputeList).disputes : [];
  } catch {
    return [];
  }
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
  const onEarnings = !(asked === "campaigns" || asked === "invoices");
  const early = onEarnings ? readJson<EarningsPage>(earningsPath) : null;
  const [{ overview: ov }, earlyEarnings, earlyDisputes] = await Promise.all([
    readJson<{ overview: ApiFinanceOverview }>(`/finance/overview?range=${range}`),
    early,
    /* P8-FE-05 — the disputes ride beside the earnings read: a HELD earning says why. */
    onEarnings ? readDisputes() : null,
  ]);
  const tab = tabOf(sp, !!ov.invoices);
  const books: Books =
    tab === "campaigns"
      ? { tab, recon: await readJson<ApiReconciliationPage>(`/earnings/reconciliation${pagedQuery(pageParamsFor(sp, RECON_KEYS))}`) }
      : tab === "invoices"
        ? { tab, invoices: await readJson<InvoicesPage>(`/earnings/invoices${pagedQuery(pageParamsFor(sp, INVOICE_KEYS))}`) }
        : { tab, earnings: earlyEarnings ?? (await readJson<EarningsPage>(earningsPath)) };
  const disputes = books.tab === "earnings" ? (earlyDisputes ?? (await readDisputes())) : [];
  return { ov, range, books, q, state, sp, disputes };
}

/* words ----------------------------------------------------------------- */

const usd0 = (cents: number) => formatCount(cents, "usd0");

const PREV: Record<RangeKey, string> = {
  "7d": "vs the 7 days before",
  "30d": "vs the 30 days before",
  "90d": "vs the 90 days before",
  all: "",
};

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
    return w ? `the oldest has ${w}` : undefined;
  };

  return (
    <ServerList>
      <VaultHead
        title="Treasury"
        pill={t.sample ? "Sample" : <>Live · <VaultUpdated iso={ov.readAt} /></>}
        sample={t.sample}
        actions={t.sample ? undefined : <VaultRange current={range} path={PATH} params={t.sp} />}
      >
        {t.sample && (
          <p className="sx-vault-in mt-2 text-[11.5px] text-[color:var(--vault-muted)]" style={at(0.06)}>
            Demo data — the real books are read by BTG admin and Finance only, so every figure below is sample data.
          </p>
        )}
        {/* ② the five money numbers: two across on a phone, the fifth
            (Needs you) across both — VaultTiles' own phone grid. */}
        <VaultTiles cols={5}>
          <VaultTile
            label="Money in"
            value={ov.moneyIn.cents}
            delta={d(ov.moneyIn.cents, ov.moneyIn.prev)}
            deltaLabel={prev}
            hint="Marketplace orders paid in this period (by card or invoice), less refunds the card provider made."
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
            caption={
              ov.owedBack && ov.owedBack.cents > 0 ? (
                <>earned, not paid yet · {usd0(ov.owedBack.cents)} owed back by payees</>
              ) : (
                "earned, not paid yet"
              )
            }
            hint="Athlete earnings not yet paid, plus what the marketplace owes athletes and properties."
            delay={0.16}
          />
          <VaultTile
            label="BTG kept"
            value={ov.kept.cents}
            delta={d(ov.kept.cents, ov.kept.prev)}
            deltaLabel={prev}
            caption={
              ov.kept.campaignCommission === undefined ? (
                "marketplace fees only"
              ) : (
                <>
                  marketplace fees · campaign commission {usd0(ov.kept.campaignCommission)} <span className="whitespace-nowrap">all time</span>
                </>
              )
            }
            delay={0.2}
          />
          <VaultTile
            label="Needs you"
            value={waiting}
            format="int"
            tone={waiting ? "you" : undefined}
            badge={waiting > 0 ? waiting : undefined}
            caption="items waiting on BTG"
            delay={0.24}
          />
        </VaultTiles>
      </VaultHead>

      {/* ③ what waits on BTG, one deposit box per desk */}
      <section aria-label="Needs you" className="mt-4 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <VaultBox label="Payouts waiting on BTG" count={ov.needsYou.payouts.count} cents={ov.needsYou.payouts.cents} sub={oldest(ov.needsYou.payouts.oldestAt)} href="/finance/payouts" open="Open Payouts" delay={0.28} />
        <VaultBox label="Refunds to send" count={ov.needsYou.refunds.count} cents={ov.needsYou.refunds.cents} sub={oldest(ov.needsYou.refunds.oldestAt)} href="/finance/refunds" open="Open Refunds" delay={0.32} />
        <VaultBox label="Disputes unresolved" count={ov.needsYou.disputes.count} cents={ov.needsYou.disputes.cents} sub="money frozen" href="/finance/disputes" open="Open Disputes" delay={0.36} />
        <VaultBox label="Payment events held" count={ov.needsYou.events.count} sub="the payment provider sent something we couldn't apply" href="/finance/payment-events" open="Open Payment events" delay={0.4} />
      </section>

      {/* ④ money in vs money out, beside how much of what was earned is paid.
          The chart's height is fixed, so the dial panel is built to about
          the same height: the dial, then the two figures its share is made
          of. "Settled" (the one word for the panel) stays on the dial only
          — the section title names what the two figures are, so it never
          repeats the dial's own label (P1-ART-25 review). */}
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <VaultPanel delay={0.44} className="min-w-0">
          <VaultSection title="Money in vs. money out" hint={range === "all" ? "All time" : `Last ${ov.range.days} days`} />
          <VaultFlow series={ov.series} bucket={ov.range.bucket} />
        </VaultPanel>
        <VaultPanel delay={0.48} className="flex min-w-0 flex-col gap-4">
          <VaultSection title="Paid vs. owed" hint="paid this period, against what is owed now" />
          <div className="flex flex-1 items-center">
            <VaultDial value={ov.settled.rate} label="Settled" size={156} caption="Of what athletes and properties earned, how much has been paid." />
          </div>
          <DialLedger
            rows={[
              { label: "Paid this period", cents: ov.settled.paidCents },
              { label: "Owed now", cents: ov.settled.owedCents },
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
            <TabLink href={tabHref("earnings", range, t.sp)} on={books.tab === "earnings"} count={earningsTotal}>
              Athlete earnings
            </TabLink>
            {inv && !t.sample && (
              <TabLink href={tabHref("campaigns", range, t.sp)} on={books.tab === "campaigns"} count={books.tab === "campaigns" ? books.recon.page.total : undefined}>
                By campaign
              </TabLink>
            )}
            {inv && (
              <TabLink href={tabHref("invoices", range, t.sp)} on={books.tab === "invoices"} count={books.tab === "invoices" ? books.invoices.page.total : undefined}>
                Sponsor invoices
              </TabLink>
            )}
          </TabStrip>
          <p className="text-[11.5px] text-[color:var(--vault-muted)]">Status only — no tax ID or bank details.</p>
        </div>
        {books.tab === "earnings" && <EarningsTab data={books.earnings} q={t.q} state={t.state} sample={t.sample} disputes={t.disputes} />}
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

export default async function TreasuryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <VaultGhost label="Loading the Treasury" tiles={5} cols={5} rows={3} />;
  if (demo === "error") throw new Error("Demo error state");
  const sp = await searchParams;
  const live = demo === null ? await liveTreasury(sp) : null;
  if (live) return <TreasuryView t={live} />;

  if (demo === "empty") {
    return (
      <div>
        <VaultHead title="Treasury" pill="Sample" sample />
        <div className="mt-5">
          <EmptyState mark="chart" title="No money has moved yet" hint="Payments, payouts and invoices appear here once campaigns launch." />
        </div>
      </div>
    );
  }

  return <TreasuryView t={{ ov: demoOverview(), range: "30d", books: demoBooks(sp), q: "", state: "", sp, sample: true }} />;
}
