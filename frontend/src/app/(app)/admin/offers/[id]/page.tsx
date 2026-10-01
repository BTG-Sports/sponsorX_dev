import Link from "next/link";

import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { OfferDeskActions } from "@/components/offer-desk-actions";
import { Badge } from "@/components/ui";
import {
  deliverableLines, exclusivityWords, expiryHeader, fingerprint, firstName, guardianLine, mayWriteOffers, momentOf, money,
  offerTimeline, openRequests, requesterOf, statusBadge, dayOf, type ApiStaffOffer,
} from "@/lib/admin-offers-live";
import { apiFetch, fetchActor } from "@/server/api";

/* --------------------------------------------------------------------------
   One offer — 2S2-FE-03, BTG half (Claude Design Offers.dc.html, views
   offerReq, revise, keep, draft, send, accepted, minor and withdraw): what
   the athlete agrees to, what BTG sells it for (BTG only), the athlete's
   change requests and how each was answered, the offer's story, and the
   one thing its state calls for.

   Reads  GET  /offers/:id                                     (2S2-BE-03)
          GET  /inventory/:id                                  the item it buys, when it buys one
   Writes POST /offers/:id/send | /withdraw | /revise          (OfferDeskActions → ../actions.ts)
          POST /offers/:id/change-requests/:requestId/keep     { note }
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/offers";
const TITLE = "Offers";

export default async function OfferPage({ params }: { params: Promise<{ id: string }> }) {
  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title={TITLE} roles={lacking} />;
  const { id } = await params;
  const [res, who] = await Promise.all([apiFetch(`/offers/${encodeURIComponent(id)}`), fetchActor()]);
  if (!res.ok && res.status !== 403 && res.status !== 404) throw new Error(`Offer unavailable (${res.status}).`);
  const o = res.ok ? ((await res.json()) as ApiStaffOffer) : null;
  if (!o) {
    return (
      <div className="space-y-4">
        <Link href={PATH} className="text-xs text-muted hover:text-text">← Offers</Link>
        <p className="text-sm">No offer matches this link.</p>
      </div>
    );
  }
  let item: { title: string; priceCents: number } | null = null;
  if (o.inventoryItemId) {
    const r = await apiFetch(`/inventory/${encodeURIComponent(o.inventoryItemId)}`);
    item = r.ok ? ((await r.json()) as { title: string; priceCents: number }) : null;
  }
  const viewerId = who.status === "linked" ? who.actor.userId : null;
  const canWrite = who.status === "linked" && mayWriteOffers(who.actor.roles);
  const now = new Date();
  const b = statusBadge(o, now);
  const first = firstName(o.athlete.name);
  const minorLine = guardianLine(o.athlete);
  const open = openRequests(o);
  const timeline = offerTimeline(o, viewerId);
  const section = "rounded-xl border border-line bg-surface p-4 sm:px-5";
  const dt = "border-t border-line-soft pt-2.5 text-muted sm:py-2.5 sm:pr-3";
  const dd = "pb-2.5 sm:border-t sm:border-line-soft sm:py-2.5";

  return (
    <div className="space-y-5">
      <Link href={PATH} className="text-xs text-muted hover:text-text">← Offers</Link>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight">{o.athlete.name}</h1>
            <Badge tone={b.tone}><span aria-hidden="true" className="mr-1">{b.mark}</span>{b.label}</Badge>
          </div>
          <p className="mt-1 text-[13px] text-muted">{o.sponsorName} · {o.campaignName} · {o.jobName}</p>
          {minorLine && <p className="mt-1.5 text-xs font-semibold text-warn"><span aria-hidden="true">! </span>{minorLine}</p>}
        </div>
        <span className="text-right">
          <span className="block text-[11px] text-muted">Expires</span>
          <strong className="text-sm">{expiryHeader(o, now)}</strong>
        </span>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22.5rem]">
        <div className="min-w-0 space-y-4">
          {o.changeRequests.length > 0 && (
            <section aria-label="Change requests" className={`${section} ${open.length ? "border-warn/45" : ""}`}>
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="flex-1 text-sm font-semibold">Change requests</h2>
                {open.length ? (
                  <Badge tone="warn"><span aria-hidden="true" className="mr-1">!</span>Not answered yet</Badge>
                ) : (
                  <Badge tone="accent"><span aria-hidden="true" className="mr-1">✓</span>Answered</Badge>
                )}
              </div>
              <ol className="mt-1">
                {o.changeRequests.map((r) => (
                  <li key={r.id} className="mt-2.5">
                    <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      <span>{requesterOf(o.athlete)} · {momentOf(r.createdAt)}</span>
                      {r.answeredAt ? (
                        <Badge tone="accent"><span aria-hidden="true" className="mr-1">✓</span>{r.answer === "KEPT" ? "Answered — kept" : "Answered — revised"}</Badge>
                      ) : (
                        <Badge tone="warn"><span aria-hidden="true" className="mr-1">!</span>Not answered yet</Badge>
                      )}
                    </p>
                    <p className="mt-1.5 rounded-lg border border-line bg-bg px-3.5 py-3 text-sm leading-relaxed">&ldquo;{r.note}&rdquo;</p>
                    {r.answer === "KEPT" && r.answerNote && (
                      <p className="mt-1.5 text-xs leading-relaxed text-muted">BTG replied, {momentOf(r.answeredAt!)}: &ldquo;{r.answerNote}&rdquo;</p>
                    )}
                    {r.answer === "REVISED" && r.revisedOfferId && (
                      <p className="mt-1.5 text-xs text-muted">
                        Revised {momentOf(r.answeredAt!)} —{" "}
                        <Link href={`${PATH}/${r.revisedOfferId}`} className="font-semibold text-primary-soft hover:underline">open the revised offer →</Link>
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section aria-label="Terms" className={`${section} space-y-3`}>
            <h2 className="text-sm font-semibold">What {first} agrees to</h2>
            <dl className="grid text-[13px] sm:grid-cols-[9.5rem_1fr]">
              <dt className={dt}>Brief</dt><dd className={`${dd} whitespace-pre-line`}>{o.brief}</dd>
              <dt className={dt}>Athlete&rsquo;s pay</dt><dd className={`${dd} font-semibold tabular-nums`}>{money(o.compensation)}</dd>
              <dt className={dt}>Deliverables</dt>
              <dd className={dd}>{deliverableLines(o).map((l) => <span key={l} className="block">{l}</span>)}</dd>
              <dt className={dt}>Usage rights</dt><dd className={dd}>{o.usageRights}</dd>
              <dt className={dt}>Exclusivity</dt><dd className={dd}>{exclusivityWords(o.exclusivityDays, o.sponsorName)}</dd>
              <dt className={dt}>Disclosures</dt>
              <dd className={dd}>
                {o.disclosures.length ? (
                  <span className="flex flex-wrap gap-1.5">
                    {o.disclosures.map((d) => <span key={d} className="rounded-full border border-line px-2.5 py-0.5 text-[11px]">{d}</span>)}
                  </span>
                ) : "None"}
              </dd>
              {item && (<><dt className={dt}>From inventory</dt><dd className={dd}>{item.title} · {money(item.priceCents)}</dd></>)}
              <dt className={dt}>Expires</dt><dd className={dd}>{dayOf(o.expiresAt)}</dd>
            </dl>
            <div className="rounded-lg border border-dashed border-accent/50 bg-accent/5 px-3.5 py-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-accent">BTG only — the athlete never sees this</p>
              <dl className="mt-2 grid grid-cols-[1fr_auto] gap-1.5 text-[13px] tabular-nums">
                <dt className="text-muted">Sell price to {o.sponsorName}</dt><dd>{money(o.sellPrice)}</dd>
                <dt className="text-muted">BTG&rsquo;s margin</dt><dd>{money(o.sellPrice - o.compensation)}</dd>
              </dl>
            </div>
            {o.sentAt && o.termsHash && (
              <p className="text-[11px] text-faint">Terms fixed when sent, {momentOf(o.sentAt)} · fingerprint {fingerprint(o.termsHash)}</p>
            )}
          </section>

          <section aria-label="Timeline" className={section}>
            <h2 className="text-sm font-semibold">Timeline</h2>
            <ol className="mt-2 text-xs">
              {timeline.map((t, i) => (
                <li key={i} className="flex flex-col gap-0.5 border-t border-line-soft py-2 sm:flex-row sm:gap-3">
                  <span className="shrink-0 text-muted sm:w-32">{t.at ? momentOf(t.at) : "—"}</span>
                  <span className={`min-w-0 ${t.tone === "warn" ? "text-warn" : t.tone === "ok" ? "text-success" : t.tone === "faint" ? "text-faint" : ""}`}>{t.text}</span>
                </li>
              ))}
            </ol>
            {o.fromOfferId && (
              <p className="mt-1 text-[11px] text-faint">
                A revised copy of <Link href={`${PATH}/${o.fromOfferId}`} className="text-primary-soft hover:underline">an earlier offer</Link>.
              </p>
            )}
          </section>
        </div>

        <OfferDeskActions offer={o} canWrite={canWrite} />
      </div>
    </div>
  );
}
