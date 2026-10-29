import Link from "next/link";
import type { ReactNode } from "react";

import { PendingList, ServerList } from "@/components/server-pager";
import { EmptyState } from "@/components/states";
import { StadiumChip, StadiumDate, StadiumHead, StadiumPanel, StadiumTile, StadiumTiles, StadiumUpdated } from "@/components/stadium-stage";
import { PagedTable, Primary, Td, Tr, type Column } from "@/components/stage-table";
import type { SearchParams } from "@/lib/list-query";
import { usd } from "@/lib/shop-live";
import {
  HOW_TO_PAY,
  daysOverdue,
  invoiceLabel,
  invoiceRows,
  invoiceStanding,
  invoiceTotals,
  invoiceWord,
  payHref,
  toPay,
} from "@/lib/sponsor-invoices-live";
import { requirePortalAccess } from "@/server/portal";
import { liveSponsorInvoicePage } from "@/server/sponsor-invoices";
import { supportContact } from "@/server/support";

/* --------------------------------------------------------------------------
   Sponsor Invoices — POL-FE-13, on the Stadium Board. "Invoices to pay" on
   the dashboard and "Billing" in the menu land here: every invoice BTG has
   sent this sponsor, its status, when it was issued and is due, and how to
   pay it.

   Reads  GET /campaigns?page&size             one server page of the
                                               sponsor's campaigns (newest)
          GET /campaigns/:id/invoices          each one's invoices — the Zoho
                                               Books mirror, read-only
          GET /public/support                  the address "Pay" writes to
   The list is paged BY CAMPAIGN (there is no sponsor-callable invoice
   list; see server/sponsor-invoices.ts), and the pager says "Campaigns".
   The tiles sum the invoices on this page and say so.

   Honest gap: the mirror carries no pay URL (Zoho's secure link is in the
   invoice email), so "Pay" opens a note to BTG's support address naming
   the invoice — it never invents a payment page. Roles: SPONSOR_ADMIN and
   SPONSOR_ANALYST both read invoices (matrix `invoice`, own).
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export default async function SponsorInvoicesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePortalAccess("sponsor");
  const sp = await searchParams;
  const [live, support] = await Promise.all([liveSponsorInvoicePage(sp), supportContact()]);
  const now = new Date();
  const head = <StadiumHead title="Your invoices" pill={<StadiumUpdated iso={now.toISOString()} />} />;

  if (!live) {
    return (
      <div className="space-y-6">
        {head}
        <EmptyState mark="users" title="Invoices aren't open to this account" hint="Invoices belong to a sponsor organisation. Ask BTG to link your account." />
      </div>
    );
  }
  if (live.status === "forbidden") {
    return (
      <div className="space-y-6">
        {head}
        <EmptyState mark="users" title="Your login can't see invoices" hint="Ask the person who runs your account to give you access to billing." />
      </div>
    );
  }

  const rows = invoiceRows(live.campaigns);
  const totals = invoiceTotals(rows, now);
  const unavailable = live.campaigns.filter((c) => c.unavailable).map((c) => c.name);
  const { page } = live;
  const outOfRange = page.page > page.pages;
  const empty: ReactNode = outOfRange ? (
    "No campaigns on this page. Go back to the first page to see them."
  ) : page.total === 0 ? (
    <>
      No campaigns yet, so no invoices.{" "}
      <Link href="/sponsor/marketplace" className="font-medium text-sponsor hover:underline">
        Browse packages to start one →
      </Link>
    </>
  ) : (
    "No invoices on these campaigns yet. BTG sends an invoice once a campaign is agreed; it shows here as soon as it's issued."
  );

  const columns: Column[] = [
    { key: "invoice", label: "Invoice" },
    { key: "status", label: "Status" },
    { key: "issued", label: "Issued" },
    { key: "due", label: "Due" },
    { key: "amount", label: "Amount", num: true },
    { key: "act", label: "Pay", srOnly: true },
  ];

  return (
    <div className="space-y-6">
      <StadiumHead title="Your invoices" pill={<StadiumUpdated iso={now.toISOString()} />}>
        <StadiumTiles cols={3}>
          <StadiumTile
            label="To pay"
            value={totals.owedCents}
            format="usd"
            caption={`${totals.owedCount} ${totals.owedCount === 1 ? "invoice" : "invoices"} · on this page`}
            tone={totals.owedCount > 0 ? "you" : undefined}
            hint="Invoices BTG has sent you that aren't paid yet, summed over the campaigns on this page."
            delay={0.1}
          />
          <StadiumTile
            label="Overdue"
            value={totals.overdueCount}
            caption="on this page"
            tone={totals.overdueCount > 0 ? "late" : undefined}
            hint="Unpaid invoices past their due date."
            delay={0.16}
          />
          <StadiumTile
            label="Paid"
            value={totals.paidCents}
            format="usd"
            caption="on this page"
            hint="What you've paid on these campaigns, as Zoho Books last reported it."
            delay={0.22}
          />
        </StadiumTiles>
      </StadiumHead>
      {unavailable.length > 0 && (
        <p role="status" className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-xs text-text">
          The invoices for {unavailable.length === 1 ? unavailable[0] : `${unavailable.length} campaigns (${unavailable.join(", ")})`} couldn&rsquo;t be read just now. The rest are listed; refresh in a minute for the others.
        </p>
      )}

      <section className="min-w-0" aria-labelledby="sx-your-invoices">
        <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id="sx-your-invoices" className="sx-section-title">Every invoice</h2>
          <span className="text-xs text-muted">{page.total.toLocaleString("en-US")} {page.total === 1 ? "campaign" : "campaigns"} in all · newest campaigns first</span>
        </div>
        <ServerList>
          {rows.length === 0 ? (
            <PendingList>
              <StadiumPanel>
                <p className="text-sm text-muted">{empty}</p>
              </StadiumPanel>
            </PendingList>
          ) : (
            <PagedTable bare tone="sponsor" page={page} noun="Campaigns" label="Your invoices" columns={columns}>
              {rows.map((r, i) => {
                const standing = invoiceStanding(r, now);
                const word = invoiceWord(standing);
                const late = daysOverdue(r, now);
                const href = payHref(r, standing, support.email);
                return (
                  <Tr key={r.id} i={i}>
                    <Td>
                      <Primary sub={r.campaign}>{invoiceLabel(r)}</Primary>
                    </Td>
                    <Td label="Status">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <StadiumChip tone={word.tone}>{word.text}</StadiumChip>
                        {standing === "overdue" && late > 0 && <span className="text-[11px] text-danger">{late} {late === 1 ? "day" : "days"} late</span>}
                        {standing === "paid" && r.paidAt && (
                          <span className="text-[11px] text-muted">
                            <StadiumDate iso={r.paidAt} format="date" />
                          </span>
                        )}
                      </span>
                    </Td>
                    <Td label="Issued" muted>{r.issuedAt ? <StadiumDate iso={r.issuedAt} format="date" /> : "—"}</Td>
                    <Td label="Due" muted>{r.dueAt ? <StadiumDate iso={r.dueAt} format="date" /> : "—"}</Td>
                    <Td label="Amount" num>{usd(r.amount)}</Td>
                    <Td act>
                      {href ? (
                        <a href={href} aria-label={`Pay ${invoiceLabel(r)}`} className="inline-flex min-h-9 items-center rounded-lg bg-primary px-3 text-xs font-semibold text-cta-ink hover:bg-primary-soft">
                          Pay →
                        </a>
                      ) : toPay(standing) ? null : (
                        <span className="text-[11px] text-faint">{standing === "paid" ? "Settled" : "Nothing to pay yet"}</span>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </PagedTable>
          )}
        </ServerList>
        <p className="mt-3 text-[11px] text-muted">
          {HOW_TO_PAY} Questions about an invoice: <span className="select-all text-text">{support.email}</span>.
        </p>
      </section>
    </div>
  );
}
