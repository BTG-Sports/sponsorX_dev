import Link from "next/link";

import { ArenaChip, ArenaHead, ArenaLink, ArenaPanel, ArenaSection, ArenaTile, ArenaTiles, type ArenaTone } from "@/components/arena-stage";
import { OfferRespond } from "@/components/offer-respond";
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

   P1-ART-22 (2026-10-11) — visual only, on the Arena: ArenaHead (sponsor ·
   campaign, the status chip and the sent line as the lede, the back link
   as a pill), a KPI row from this same read (the pay in cents as dollars,
   the deliverables count, the exclusivity days, and while open the days
   left to answer), the brief, deliverables, terms and agreement as plates
   and the answer rail as a plate lit under the pointer. The OfferRespond
   island, the verbatim <pre data-agreement-body> and every action are as
   they were.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

const TONE: Record<string, ArenaTone> = { primary: "blue", warn: "warn", accent: "win", neutral: "ink", danger: "danger" };
const DAY = 86_400_000;

function BackPill() {
  return (
    <Link
      href="/athlete/offers"
      className="sx-btn-secondary inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-2 text-xs font-medium text-text outline-none focus-visible:ring-2 focus-visible:ring-athlete focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
    >
      <span aria-hidden="true">←</span>
      All offers
    </Link>
  );
}

export default async function AthleteOfferPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePortalAccess("athlete");
  const { id } = await params;

  const res = await apiFetch(`/offers/${encodeURIComponent(id)}`);
  if (res.status === 403 || res.status === 404) {
    return (
      <div className="space-y-6">
        <ArenaHead title="Campaign offer" actions={<BackPill />} />
        <ArenaPanel delay={0.1}>
          <p className="text-sm font-medium">Offer not found</p>
          <p className="mt-1 text-xs text-muted">This offer doesn&rsquo;t exist or isn&rsquo;t yours to view.</p>
        </ArenaPanel>
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
  const rows = deliverableRows(o);
  const daysToAnswer = Math.max(0, Math.ceil((new Date(o.expiresAt).getTime() - now.getTime()) / DAY));
  const readAt = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  return (
    <div className="space-y-6">
      <ArenaHead
        title={`${o.sponsorName} · ${o.campaignName}`}
        pill={`Postgres · read ${readAt}`}
        lede={
          <span className="flex flex-wrap items-center gap-2">
            <ArenaChip tone={TONE[copy.tone] ?? "ink"}>{status === "open" ? `Open · ${expiryLabel(o.expiresAt, now).replace(/^E/, "e")}` : copy.label}</ArenaChip>
            <span>
              Campaign offer · {o.sentAt ? `sent by BTG ${fmtDay(o.sentAt)}` : "not sent yet"}
              {o.respondedAt ? ` · ${copy.label.toLowerCase()} ${fmtDay(o.respondedAt)}` : ""}
            </span>
          </span>
        }
        actions={<BackPill />}
      >
        {/* The figures, all from GET /offers/:id — the pay is cents. */}
        <ArenaTiles cols={status === "open" ? 4 : 3}>
          <ArenaTile
            label="Your pay"
            value={o.compensation}
            format="usd"
            caption="gross compensation · earning starts at pending on accept"
            tone="win"
            delay={0.1}
          />
          <ArenaTile
            label="Deliverables"
            value={rows.length}
            caption={rows.length ? `first due ${rows[0].due}` : "none listed"}
            tone={rows.length ? "blue" : "ink"}
            delay={0.16}
          />
          <ArenaTile
            label="Exclusivity"
            value={o.exclusivityDays ?? 0}
            caption={o.exclusivityDays ? `days · ${exclusivityLabel(o.exclusivityDays, o.sponsorName)}` : "no exclusivity period"}
            tone={o.exclusivityDays ? "blue" : "ink"}
            delay={0.22}
          />
          {status === "open" && (
            <ArenaTile
              label="Days to answer"
              value={daysToAnswer}
              caption={expiryLabel(o.expiresAt, now)}
              tone={daysToAnswer <= 2 ? "warn" : "flare"}
              delay={0.28}
            />
          )}
        </ArenaTiles>
      </ArenaHead>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
        <div className="min-w-0 space-y-6">
          <section>
            <ArenaSection title="The brief" delay={0.3} />
            <ArenaPanel delay={0.34}>
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted">{o.brief}</p>
            </ArenaPanel>
          </section>

          <section>
            <ArenaSection title="Deliverables" hint="Scheduled on your Campaign Order when you accept" delay={0.36} />
            <ArenaPanel delay={0.4}>
              <ol className="space-y-3">
                {rows.map((d) => (
                  <li key={d.n} className="flex items-start gap-3 text-xs">
                    <span className="grid size-7 shrink-0 place-items-center rounded-xl border border-athlete/30 bg-athlete/12">
                      <span className="sx-arena-num text-[13px] text-athlete">{d.n}</span>
                    </span>
                    <span className="min-w-0 flex-1 pt-1 font-medium">{d.title}</span>
                    <span className="shrink-0 pt-1 text-[11px] text-muted">Due {d.due}</span>
                  </li>
                ))}
              </ol>
            </ArenaPanel>
          </section>

          <section>
            <ArenaSection title="Terms" hint="Fixed when BTG sent the offer — they don't change" delay={0.42} />
            <ArenaPanel delay={0.46}>
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
                        <ArenaChip key={d} tone="ink">
                          {d}
                        </ArenaChip>
                      ))
                    ) : (
                      <span className="font-medium text-text">None listed</span>
                    )}
                  </dd>
                </div>
              </dl>
            </ArenaPanel>
          </section>

          {status === "open" && (
            <section>
              <ArenaSection
                title="Campaign Order agreement"
                hint={agreement ? `Version ${agreement.version} — what accepting signs` : "not available"}
                delay={0.48}
              />
              <ArenaPanel delay={0.52}>
                {agreement ? (
                  /* Rendered verbatim — the accept action hashes this exact
                     string, so nothing here may reflow or trim it. */
                  <pre
                    data-agreement-body
                    tabIndex={0}
                    aria-label="Campaign Order agreement text"
                    className="max-h-[28rem] overflow-y-auto whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-muted outline-none focus-visible:ring-2 focus-visible:ring-athlete/40"
                  >
                    {agreement.body}
                  </pre>
                ) : (
                  <p className="text-xs text-muted">The agreement text isn&rsquo;t available — contact BTG.</p>
                )}
              </ArenaPanel>
            </section>
          )}
        </div>

        <div className="space-y-4">
          <ArenaPanel tone={status === "open" ? "flare" : "blue"} delay={0.36} spot>
            {status === "open" ? (
              <>
                <ArenaSection title="Your answer" />
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
                <ArenaSection title="Status" />
                <ArenaChip tone={TONE[copy.tone] ?? "ink"}>{copy.label}</ArenaChip>
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
                  <ArenaLink href={`/athlete/orders/${encodeURIComponent(o.orderId)}`} className="mt-3">
                    Open the Campaign Order
                  </ArenaLink>
                )}
                {status === "accepted" && o.termsHash && (
                  <p className="mt-3 truncate font-mono text-[10px] text-faint" title={o.termsHash}>
                    Terms fingerprint {o.termsHash.slice(0, 16)}…
                  </p>
                )}
              </>
            )}
          </ArenaPanel>

          <ArenaPanel tone="win" delay={0.42}>
            <ArenaSection title="Pay" />
            <p className="sx-arena-num text-2xl leading-tight text-success">{usd(o.compensation)}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              Your compensation for this offer. Accepting starts its earning at pending; SponsorX holds no bank details.
            </p>
            <p className="mt-3 border-t border-line-soft pt-3 text-[11px] text-muted">{expiryLabel(o.expiresAt, now)}</p>
          </ArenaPanel>
        </div>
      </div>
    </div>
  );
}
