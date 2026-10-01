import Link from "next/link";

import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { Badge, BlockedNotice, Card } from "@/components/ui";
import { EmptyState, SkeletonRows } from "@/components/states";
import { demoState } from "@/lib/demo";
import {
  CONFIRM_RULE, DELIVERY_BACKEND, DELIVERY_TABS, SAMPLE_OVERDUE, SAMPLE_PROBLEMS, dayOf, deliveryTab, overdueBadge, proofWords,
} from "@/lib/delivery-issues-live";

/* --------------------------------------------------------------------------
   Delivery issues — 2S4-FE-04, BTG half (Claude Design
   DeliveryIssues.dc.html, views problems and overdue). Deliveries confirm
   themselves: the sponsor has 24 hours to confirm or report a problem, and
   silence counts as confirmed. BTG sees only the exceptions.

   SCAFFOLD on sample data until 2S4-BE-07 (delivery confirmation) lands.

   Reads  (fixtures, lib/delivery-issues-live.ts)
   Writes none yet — "Remind seller" is off
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/delivery-issues";
const TITLE = "Delivery issues";
const OFF = `Goes live with ${DELIVERY_BACKEND} — this is sample data, nothing is sent.`;
const PROBLEM_COLS = "md:grid-cols-[1.4fr_8rem_8rem_1.2fr_1.2fr_6rem]";
const OVERDUE_COLS = "md:grid-cols-[1.4fr_8rem_8rem_8rem_10rem_8rem]";

export default async function DeliveryIssuesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const demo = await demoState(searchParams);
  if (demo === "loading") {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold tracking-tight">{TITLE}</h1>
        <SkeletonRows rows={3} />
      </div>
    );
  }
  if (demo === "error") throw new Error("Demo error state");

  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title={TITLE} roles={lacking} />;
  const tab = deliveryTab((await searchParams).tab);
  const empty = demo === "empty";
  const problems = empty ? [] : SAMPLE_PROBLEMS;
  const overdue = empty ? [] : SAMPLE_OVERDUE;
  const counts = { problems: problems.length, overdue: overdue.length };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{TITLE}</h1>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted">
          Deliveries confirm themselves. {CONFIRM_RULE} You only see lines where a sponsor reported a problem, or a seller is late marking delivery.
        </p>
      </div>

      <BlockedNotice>
        Sample data — this desk goes live with {DELIVERY_BACKEND}. Every order, name and amount below is a sample, and the buttons stay off until then.
      </BlockedNotice>

      <nav aria-label="Delivery issues" className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-line bg-surface p-1 sm:w-fit">
        {DELIVERY_TABS.map((t) => {
          const on = t.key === tab.key;
          const n = counts[t.key];
          const tone = t.key === "problems" ? "bg-danger/15 text-danger" : "bg-warn/15 text-warn";
          return (
            <Link key={t.key} href={`${PATH}?tab=${t.key}`} aria-current={on ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium ${on ? "bg-primary/15 text-text" : "text-muted hover:text-text"}`}>
              {t.label}
              <span className={`rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${n ? tone : "bg-surface-2"}`}>{n}</span>
            </Link>
          );
        })}
      </nav>

      {tab.key === "problems" ? (
        problems.length === 0 ? (
          <EmptyState mark="inbox" title="No problems reported" hint="A line lands here only when a sponsor reports a problem within 24 hours of it being marked delivered." />
        ) : (
          <Card className="overflow-hidden p-0">
            <div role="region" aria-label="Problems reported">
              <div className={`hidden gap-x-3 border-b border-line-soft px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-faint md:grid ${PROBLEM_COLS}`}>
                <span>Order</span><span>Seller</span><span>Sponsor</span><span>Sponsor&rsquo;s message</span><span>Seller&rsquo;s note and proof</span><span className="sr-only">Action</span>
              </div>
              <ul className="divide-y divide-line-soft">
                {problems.map((p) => (
                  <li key={p.id} className={`grid gap-x-3 gap-y-1.5 px-4 py-3.5 text-xs md:items-start ${PROBLEM_COLS}`}>
                    <span className="min-w-0">
                      <strong className="block text-[13px] font-semibold">{p.orderRef}</strong>
                      <span className="block text-[11px] text-muted">{p.line} · {p.quantity}</span>
                      <span className="mt-1.5 block"><Badge tone="danger"><span aria-hidden="true" className="mr-1">✕</span>Problem reported</Badge></span>
                    </span>
                    <span><span className="text-muted md:hidden">Seller: </span>{p.seller.name}{p.seller.sub && <span className="block text-[11px] text-muted">{p.seller.sub}</span>}</span>
                    <span><span className="text-muted md:hidden">Sponsor: </span>{p.sponsor.name}{p.sponsor.sub && <span className="block text-[11px] text-muted">{p.sponsor.sub}</span>}</span>
                    <span className="min-w-0 text-muted">&ldquo;{p.sponsorMessage.text}&rdquo;</span>
                    <span className="min-w-0 text-muted">
                      &ldquo;{p.sellerNote.text}&rdquo;
                      <span className="mt-1 block text-[11px] text-primary-soft">{proofWords(p.sellerNote.proofCount)}</span>
                    </span>
                    <span className="md:text-right">
                      <Link href={`${PATH}/${p.id}`} aria-label={`Review ${p.orderRef}`}
                        className="inline-flex min-h-9 items-center rounded-lg bg-primary px-3.5 text-xs font-semibold text-cta-ink hover:bg-primary-soft">
                        Review →
                      </Link>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        )
      ) : overdue.length === 0 ? (
        <EmptyState mark="clock" title="Nothing overdue" hint="A line lands here when its last date has passed and the seller hasn't marked it delivered." />
      ) : (
        <div className="space-y-2.5">
          <Card className="overflow-hidden p-0">
            <div role="region" aria-label="Overdue">
              <div className={`hidden gap-x-3 border-b border-line-soft px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-faint md:grid ${OVERDUE_COLS}`}>
                <span>Order</span><span>Seller</span><span>Sponsor</span><span>Last date</span><span>Status</span><span className="sr-only">Action</span>
              </div>
              <ul className="divide-y divide-line-soft">
                {overdue.map((o) => {
                  const b = overdueBadge(o);
                  return (
                    <li key={o.id} className={`grid gap-x-3 gap-y-1.5 px-4 py-3.5 text-xs md:items-center ${OVERDUE_COLS}`}>
                      <span className="min-w-0">
                        <strong className="block text-[13px] font-semibold">{o.orderRef}</strong>
                        <span className="block text-[11px] text-muted">{o.line}</span>
                      </span>
                      <span><span className="text-muted md:hidden">Seller: </span>{o.seller.name}{o.seller.sub && <span className="block text-[11px] text-muted">{o.seller.sub}</span>}</span>
                      <span><span className="text-muted md:hidden">Sponsor: </span>{o.sponsor.name}</span>
                      <span className="text-muted">{dayOf(o.lastDate)} has passed</span>
                      <span><Badge tone={b.tone}><span aria-hidden="true" className="mr-1">!</span>{b.label}</Badge></span>
                      <span className="md:text-right">
                        <button type="button" disabled title={OFF} aria-label={`Remind ${o.seller.name}`}
                          className="min-h-9 cursor-not-allowed rounded-lg bg-primary px-3.5 text-xs font-semibold text-cta-ink opacity-40">
                          Remind seller
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </Card>
          <p className="text-[11px] text-faint">
            Shown here: the same sample order as if Riley had not marked it delivered after the last session. When live, a reminder emails the seller and their team&rsquo;s manager.
          </p>
        </div>
      )}
    </div>
  );
}
