import Link from "next/link";

import { DeliveryIssueDecision, DeliveryProofButton } from "@/components/delivery-issue-decision";
import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { Badge } from "@/components/ui";
import {
  CONFIRM_RULE, dayOf, lineSummary, momentOf, money, possessive, type ApiDeliveryIssue,
} from "@/lib/delivery-issues-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   One reported delivery problem — 2S4-FE-04, BTG half (Claude Design
   DeliveryIssues.dc.html, views detail, confirm and refund): the line, what
   the sponsor and the seller each said, the money on hold, its history, and
   BTG's decision — confirm delivered, or cancel and refund the line.

   Reads  GET  /delivery-issues/:lineId             (2S4-BE-07)
          GET  /deliveries/:lineId/proof            5-minute audited link (DeliveryProofButton)
   Writes POST /delivery-issues/:lineId/resolve     (DeliveryIssueDecision → ../actions.ts)
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/delivery-issues";
const TITLE = "Delivery issues";

export default async function DeliveryIssuePage({ params }: { params: Promise<{ id: string }> }) {
  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title={TITLE} roles={lacking} />;
  const { id } = await params;
  const res = await apiFetch(`/delivery-issues/${encodeURIComponent(id)}`);
  if (!res.ok && res.status !== 403 && res.status !== 404) throw new Error(`Delivery issue unavailable (${res.status}).`);
  const p = res.ok ? ((await res.json()) as ApiDeliveryIssue) : null;
  if (!p) {
    return (
      <div className="space-y-4">
        <Link href={PATH} className="text-xs text-muted hover:text-text">← Problems reported</Link>
        <p className="text-sm">No delivery issue matches this link.</p>
      </div>
    );
  }
  const section = "rounded-xl border border-line bg-surface p-4 sm:px-5";
  const said = "rounded-lg border border-line bg-bg px-3.5 py-3";
  const sellerFirst = p.seller.name.split(/\s+/)[0];

  return (
    <div className="space-y-5">
      <div>
        <Link href={PATH} className="text-xs text-muted hover:text-text">← Problems reported</Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">{TITLE}</h1>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          <section aria-label="Order line" className={section}>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-sm font-semibold">{p.orderRef} · {p.line}</h2>
              {p.state === "PROBLEM" ? (
                <Badge tone="danger"><span aria-hidden="true" className="mr-1">✕</span>Problem reported</Badge>
              ) : p.state === "CONFIRMED" ? (
                <Badge tone="accent"><span aria-hidden="true" className="mr-1">✓</span>Confirmed</Badge>
              ) : (
                <Badge><span aria-hidden="true" className="mr-1">↺</span>{p.state === "REFUNDED" ? "Refunded" : p.state.toLowerCase().replace("_", " ")}</Badge>
              )}
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">{lineSummary(p)}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {p.sponsorMessage && (
                <div className={said}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{p.sponsor.name} said · {dayOf(p.sponsorMessage.at)}</p>
                  <p className="mt-1.5 text-[13px] leading-relaxed">&ldquo;{p.sponsorMessage.text}&rdquo;</p>
                </div>
              )}
              {p.sellerNote && (
                <div className={said}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{sellerFirst} said · {dayOf(p.sellerNote.at)}</p>
                  <p className="mt-1.5 text-[13px] leading-relaxed">&ldquo;{p.sellerNote.text}&rdquo;</p>
                  {p.sellerNote.link && (
                    <a href={p.sellerNote.link} target="_blank" rel="noopener noreferrer" className="mt-1.5 block break-all text-[11px] text-primary-soft hover:underline">
                      {p.sellerNote.link}
                    </a>
                  )}
                  {p.sellerNote.proofCount > 0 && <DeliveryProofButton lineId={p.id} count={p.sellerNote.proofCount} />}
                </div>
              )}
            </div>
            <p className="mt-3 text-[11px] text-faint">{CONFIRM_RULE} {p.sponsor.name} reported this one inside the 24 hours, so it waits for you.</p>
          </section>

          <section aria-label="Money on hold" className={section}>
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 className="text-sm font-semibold">{p.state === "PROBLEM" ? "Money on hold for this line" : "Money for this line"}</h2>
            </div>
            <dl className="mt-2 grid grid-cols-[1fr_auto] gap-2 text-[13px] tabular-nums">
              <dt className="text-muted">{possessive(p.seller.name)} share</dt><dd>{money(p.hold.sellerShareCents)}</dd>
              {p.seller.sub && (<><dt className="text-muted">{possessive(p.seller.sub)} share</dt><dd>{money(p.hold.teamShareCents)}</dd></>)}
              <dt className="text-muted">{p.sponsor.name} paid for this line</dt><dd>{money(p.hold.sponsorPaidCents)}</dd>
            </dl>
          </section>

          <section aria-label="History" className={section}>
            <h2 className="text-sm font-semibold">History</h2>
            <ol className="mt-2 text-xs">
              {p.history.map((h, i) => (
                <li key={i} className="flex flex-col gap-0.5 border-t border-line-soft py-2 sm:flex-row sm:gap-3">
                  <span className="shrink-0 text-muted sm:w-32">{momentOf(h.at)}</span>
                  <span className="min-w-0">{h.text}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <DeliveryIssueDecision problem={p} />
      </div>
    </div>
  );
}
