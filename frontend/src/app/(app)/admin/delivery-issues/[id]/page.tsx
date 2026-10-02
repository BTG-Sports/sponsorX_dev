import Link from "next/link";

import { DeliveryIssueDecision, DeliveryProofButton } from "@/components/delivery-issue-decision";
import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { StatePill } from "@/components/order-bits";
import { lineSummary, momentOf, type ApiDeliveryIssue } from "@/lib/delivery-issues-live";
import { deskReason, timelineEvents, type Pill, type Tone } from "@/lib/order-automation-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   One delivery issue — 2S4-FE-04 / 2S4-FE-05, BTG half (Claude Design
   OrderExceptions.dc.html, views timeline · decideConfirm · decideRefund):
   the line, the whole exchange between the seller and the sponsor ("What
   happened" — each answer, photo and deadline), the money on hold, and
   BTG's decision when the two sides couldn't settle it.

   Reads  GET  /delivery-issues/:lineId             (issue, escalation, canDecide, timeline — 2S4-BE-11)
          GET  /deliveries/:lineId/proof            5-minute audited link (DeliveryProofButton)
   Writes POST /delivery-issues/:lineId/resolve     (DeliveryIssueDecision → ../actions.ts)
   2S4-FE-06 (CX-9 / CX-9b) — a request to cancel shows its exchange here
   (asked · said no · sent to BTG) and is decided Cancel and refund, or Keep.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/delivery-issues";
const TITLE = "Delivery issues";

const DOT: Record<Tone, string> = {
  neutral: "bg-faint", primary: "bg-primary", accent: "bg-accent", warn: "bg-warn", danger: "bg-danger",
};

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
        <Link href={PATH} className="text-xs text-muted hover:text-text">← Delivery issues</Link>
        <p className="text-sm">No delivery issue matches this link.</p>
      </div>
    );
  }
  const section = "rounded-xl border border-line bg-surface p-4 sm:px-5";
  const canDecide = p.canDecide ?? p.state === "PROBLEM";
  const pill: Pill = canDecide
    ? { ...deskReason(p), label: `Needs BTG · ${deskReason(p).label.charAt(0).toLowerCase()}${deskReason(p).label.slice(1)}` }
    : p.issue?.stage === "SETTLED"
    ? { label: "Settled between them", tone: "accent", mark: "✓" }
    : p.issue?.outcome?.outcome === "KEPT" && p.state === "IN_DELIVERY" ? { label: "Kept by BTG · goes ahead as booked", tone: "accent", mark: "✓" }
    : p.state === "CONFIRMED" ? { label: "Confirmed", tone: "accent", mark: "✓" }
    : p.state === "REFUNDED" ? { label: "Refunded", tone: "neutral", mark: "↺" }
    : p.state === "PROBLEM" ? { label: "Between the seller and the sponsor", tone: "primary", mark: "●" }
    : { label: p.state.toLowerCase().replace("_", " "), tone: "neutral", mark: "○" };
  const events = p.timeline ? timelineEvents(p.timeline, { seller: p.seller.name, sponsor: p.sponsor.name }) : null;

  return (
    <div className="space-y-5">
      <Link href={PATH} className="text-xs text-muted hover:text-text">← Delivery issues</Link>
      <div className="flex flex-wrap items-center gap-2.5">
        <h1 className="text-xl font-semibold tracking-tight">{p.orderRef} · {p.line}</h1>
        <StatePill p={pill} />
      </div>
      <p className="-mt-2 text-xs leading-relaxed text-muted">{lineSummary(p)}</p>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-label="What happened" className={`${section} min-w-0`}>
          <h2 className="text-sm font-semibold">What happened</h2>
          {events ? (
            <ol className="mt-2.5">
              {events.map((e, i) => (
                <li key={i} className="flex gap-3 border-t border-line-soft py-3">
                  <span aria-hidden="true" className={`mt-1.5 size-2.5 shrink-0 rounded-full ${DOT[e.tone]}`} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <p className="text-xs text-muted">
                      {e.when} · <strong className="font-semibold text-text">{e.who}</strong> · {e.what}
                    </p>
                    {e.quote && <p className="rounded-lg border border-line bg-bg px-3.5 py-3 text-[13px] leading-relaxed">{e.quote}</p>}
                    {e.proof?.link && (
                      <a href={e.proof.link} target="_blank" rel="noopener noreferrer" className="break-all text-[11px] text-primary-soft hover:underline">{e.proof.link}</a>
                    )}
                    {e.proof?.photo && (
                      <DeliveryProofButton lineId={p.id} count={1} issue={e.proof.issueId} photo={e.proof.photoOf} label="View photo" />
                    )}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <ol className="mt-2 text-xs">
              {p.history.map((h, i) => (
                <li key={i} className="flex flex-col gap-0.5 border-t border-line-soft py-2 sm:flex-row sm:gap-3">
                  <span className="shrink-0 text-muted sm:w-32">{momentOf(h.at)}</span>
                  <span className="min-w-0">{h.text}</span>
                </li>
              ))}
            </ol>
          )}
          {p.escalation && <p className="mt-2 text-[11px] text-faint">Sent to BTG {momentOf(p.escalation.at)} · {p.escalation.text}</p>}
        </section>

        <DeliveryIssueDecision problem={p} />
      </div>
    </div>
  );
}
