import Link from "next/link";

import { OfferRespond } from "@/components/offer-respond";
import { Badge, Card, SectionHeading } from "@/components/ui";
import {
  STATUS_COPY,
  acceptBlocker,
  deliverableRows,
  exclusivityLabel,
  expiryLabel,
  fmtDay,
  fmtWhen,
  latestChangeRequest,
  offerStatus,
  usd,
  type ApiOffer,
} from "@/lib/offer-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";
import { acceptOfferAction, declineOfferAction, requestOfferChangeAction } from "./actions";

/* --------------------------------------------------------------------------
   Campaign offer — 2S2-FE-03. Athlete portal.

   One formal offer, everything the athlete is agreeing to: the brief, the
   pay (compensation, the athlete's own figure), each deliverable and its
   due date, usage rights, the exclusivity period, the disclosures they must
   make and the expiry — then the Campaign Order agreement text the
   acceptance signs, verbatim in a scroll box.

   Reads GET /offers/:id (own scope; 403 = not theirs or no such offer).
   While SENT it carries `agreement` {id, version, bodyHash, body} — null
   when none is issued or its text can't be served, and then Accept is
   disabled with "The agreement text isn't available — contact BTG".
   Writes POST /offers/:id/respond through ./actions: ACCEPT with the terms
   hash shown, the agreement id and a fingerprint of the body rendered here
   (+ the signer's forwarded address and user-agent); DECLINE after a
   confirm; REQUEST_CHANGE with the athlete's note, from a small dialog.
   A change request leaves the offer SENT — Accept and Decline stay — and
   the API records who asked, the note and when (`changeRequests` on this
   read), audits it and emails the campaign manager(s); the screen then
   shows "Change requested — BTG will come back to you" with the note and
   time. The API also runs the guardian gate for a minor (on accept and on
   request-change), the brand restriction check and availability — their
   refusals are shown as the API words them. After acceptance the Campaign
   Order it created is at /athlete/orders/<orderId>.

   Honest gaps: the team's share of the pay isn't on the offer, so only the
   gross compensation is shown; the sponsor's categories an exclusivity
   covers aren't returned.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export default async function AthleteOfferPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePortalAccess("athlete");
  const { id } = await params;

  const back = (
    <Link href="/athlete/offers" className="text-xs text-muted hover:text-text">
      ← All offers
    </Link>
  );

  const res = await apiFetch(`/offers/${encodeURIComponent(id)}`);
  if (res.status === 403 || res.status === 404) {
    return (
      <div className="space-y-4">
        {back}
        <Card>
          <p className="text-sm font-medium">Offer not found</p>
          <p className="mt-1 text-xs text-muted">This offer doesn&rsquo;t exist or isn&rsquo;t yours to view.</p>
        </Card>
      </div>
    );
  }
  if (!res.ok) throw new Error(`Offer unavailable (${res.status}).`);
  const o = (await res.json()) as ApiOffer;

  const now = new Date();
  const status = offerStatus(o, now);
  const copy = STATUS_COPY[status];
  const blocker = acceptBlocker(o, now);
  const agreement = o.agreement ?? null;
  const change = latestChangeRequest(o);

  return (
    <div className="space-y-6">
      {back}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Campaign offer</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">
              {o.sponsorName} · {o.campaignName}
            </h1>
            <Badge tone={copy.tone}>{status === "open" ? `Open · ${expiryLabel(o.expiresAt, now).replace(/^E/, "e")}` : copy.label}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted">
            {o.sentAt ? `Sent by BTG ${fmtDay(o.sentAt)}` : "Not sent yet"}
            {o.respondedAt ? ` · ${copy.label.toLowerCase()} ${fmtDay(o.respondedAt)}` : ""}
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
        <div className="min-w-0 space-y-6">
          <section>
            <SectionHeading title="The brief" />
            <Card>
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted">{o.brief}</p>
            </Card>
          </section>

          <section>
            <SectionHeading title="Deliverables" hint="Scheduled on your Campaign Order when you accept" />
            <Card>
              <ol className="space-y-3">
                {deliverableRows(o).map((d) => (
                  <li key={d.n} className="flex items-start gap-3 text-xs">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full border border-athlete/30 bg-athlete/15 text-[11px] font-semibold text-athlete">
                      {d.n}
                    </span>
                    <span className="min-w-0 flex-1 pt-0.5 font-medium">{d.title}</span>
                    <span className="shrink-0 pt-0.5 text-[11px] text-muted">Due {d.due}</span>
                  </li>
                ))}
              </ol>
            </Card>
          </section>

          <section>
            <SectionHeading title="Terms" hint="Fixed when BTG sent the offer — they don't change" />
            <Card>
              <dl className="grid gap-x-6 gap-y-3 text-xs sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <dt className="text-[11px] text-faint">Usage rights</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap font-medium text-text">{o.usageRights}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-[11px] text-faint">Exclusivity</dt>
                  <dd className="mt-0.5 font-medium text-text">{exclusivityLabel(o.exclusivityDays, o.sponsorName)}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-[11px] text-faint">Disclosures you must make</dt>
                  <dd className="mt-1 flex flex-wrap gap-1.5">
                    {o.disclosures.length ? (
                      o.disclosures.map((d) => (
                        <Badge key={d} tone="neutral">
                          {d}
                        </Badge>
                      ))
                    ) : (
                      <span className="font-medium text-text">None listed</span>
                    )}
                  </dd>
                </div>
              </dl>
            </Card>
          </section>

          {status === "open" && (
            <section>
              <SectionHeading
                title="Campaign Order agreement"
                hint={agreement ? `Version ${agreement.version} — what accepting signs` : "not available"}
              />
              <Card>
                {agreement ? (
                  /* Rendered verbatim — the accept action hashes this exact
                     string, so nothing here may reflow or trim it. */
                  <pre
                    data-agreement-body
                    tabIndex={0}
                    aria-label="Campaign Order agreement text"
                    className="max-h-[28rem] overflow-y-auto whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-muted"
                  >
                    {agreement.body}
                  </pre>
                ) : (
                  <p className="text-xs text-muted">The agreement text isn&rsquo;t available — contact BTG.</p>
                )}
              </Card>
            </section>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <SectionHeading title="Pay" />
            <p className="text-2xl font-semibold tabular-nums leading-tight">{usd(o.compensation)}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              Your compensation for this offer. Accepting starts its earning at pending; SponsorX holds no bank details.
            </p>
            <p className="mt-3 border-t border-line-soft pt-3 text-[11px] text-muted">{expiryLabel(o.expiresAt, now)}</p>
          </Card>

          <Card>
            {status === "open" ? (
              <>
                <SectionHeading title="Your answer" />
                <OfferRespond
                  offerId={o.id}
                  termsHash={o.termsHash}
                  agreementId={agreement?.id ?? null}
                  body={agreement?.body ?? null}
                  version={agreement?.version ?? null}
                  blocker={blocker}
                  accept={acceptOfferAction}
                  decline={declineOfferAction}
                  requestChange={requestOfferChangeAction}
                  changeRequest={change}
                />
              </>
            ) : (
              <>
                <SectionHeading title="Status" />
                <Badge tone={copy.tone}>{copy.label}</Badge>
                <p className="mt-2 text-[11px] leading-relaxed text-muted">
                  {status === "accepted" && "You accepted these terms. They're frozen on your Campaign Order."}
                  {status === "declined" && "You declined this offer. No Campaign Order was created."}
                  {status === "withdrawn" && "BTG withdrew this offer before it was answered."}
                  {status === "expired" && (blocker ?? "This offer expired before it was answered.")}
                  {status === "draft" && "BTG is still drafting this offer — its terms can change until it's sent."}
                </p>
                {change && (
                  <p className="mt-2 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-faint">
                    You asked for a change {fmtWhen(change.createdAt)}: &ldquo;{change.note}&rdquo;
                  </p>
                )}
                {status === "accepted" && o.orderId && (
                  <Link
                    href={`/athlete/orders/${encodeURIComponent(o.orderId)}`}
                    className="mt-3 inline-block text-xs font-medium text-primary hover:underline"
                  >
                    Open the Campaign Order →
                  </Link>
                )}
                {status === "accepted" && o.termsHash && (
                  <p className="mt-3 truncate font-mono text-[10px] text-faint" title={o.termsHash}>
                    Terms fingerprint {o.termsHash.slice(0, 16)}…
                  </p>
                )}
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
